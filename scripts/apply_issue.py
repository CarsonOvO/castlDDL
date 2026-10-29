#!/usr/bin/env python3
"""Turn an "Add or correct a deadline" issue into an entry in manual.yml.

The workflow passes the issue in ISSUE_BODY, ISSUE_NUMBER and ISSUE_USER. The entry
replaces any earlier entry from the same issue, so editing the issue updates it.
Writes the reply for the issue to --reply. Exits 1 if the form has errors.

Usage:
    python scripts/apply_issue.py --reply reply.md [--ccfddl DIR]
"""
import argparse
import datetime as dt
import os
import re
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build  # noqa: E402

TEMPLATE = build.ROOT / ".github" / "ISSUE_TEMPLATE" / "deadline.yml"
MANUAL = build.ROOT / "manual.yml"
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}(?: \d{1,2}:\d{2}(?::\d{2})?)?")
FIELDS = ("abstract", "paper", "rebuttal", "notify")


def parse_body(body):
    """Issue form markdown ('### <label>' then the answer) -> {field id: text}."""
    form = yaml.safe_load(TEMPLATE.read_text(encoding="utf-8"))
    ids = {f["attributes"]["label"]: f["id"] for f in form["body"] if f.get("id")}
    out, cur, buf = {}, None, []
    for line in (body or "").replace("\r\n", "\n").split("\n"):
        if line.startswith("### "):
            if cur:
                out[cur] = "\n".join(buf).strip()
            cur, buf = ids.get(line[4:].strip()), []
        elif cur:
            buf.append(line)
    if cur:
        out[cur] = "\n".join(buf).strip()
    return {k: "" if v == "_No response_" else v for k, v in out.items()}


def labels(field_id):
    form = yaml.safe_load(TEMPLATE.read_text(encoding="utf-8"))
    return next(f["attributes"]["label"] for f in form["body"] if f.get("id") == field_id)


def check(fields, ccf, extra, manual, cfg):
    """Return (entry, errors, notes)."""
    errors, notes = [], []
    dir_ids = [d["id"] for d in cfg["directions"]]
    dirs = [m[1] for m in re.finditer(r"^- \[[xX]\] (\w+)", fields.get("dirs", ""), re.M) if m[1] in dir_ids]

    known = {vid: e.get("title") or vid for vid, e in ccf.items()}
    known.update({e["id"]: e.get("title") or e["id"] for e in extra if e.get("id")})
    known.update({m["venue"]: m.get("title") or m["venue"] for m in manual if str(m["venue"]).startswith("LAB/")})
    on_site = build.select_venues(cfg, ccf, extra, manual)

    name = fields.get("venue", "").strip()
    vid, cands = build.resolve_venue(name, known) if name else (None, [])
    entry = {}
    if not name:
        errors.append(f"**{labels('venue')}** 没有填。")
    elif vid is None and cands and not dirs:
        errors.append(f"**{labels('venue')}** `{name}` 对应多个会议，请改成其中一个 ID："
                      + "、".join(f"`{c}`（{known[c]}）" for c in cands[:8]))
    elif vid is None and not dirs:
        errors.append(f"网站上没有叫 `{name}` 的会议。如果是新会议，请在 **{labels('dirs')}** 里至少选一个方向。")
    elif vid is None:
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]
        if not slug:
            errors.append(f"**{labels('venue')}** 请用英文简称。")
        vid = f"LAB/{slug}"
        entry.update(title=name[:40], dirs=dirs)
        if fields.get("fullname"):
            entry["name"] = fields["fullname"][:160]
        notes.append(f"`{name}` 是新会议，ID 是 `{vid}`，方向：{', '.join(dirs)}。")
    elif vid not in on_site and not dirs:
        errors.append(f"`{vid}`（{known[vid]}）不在网站的方向列表里。请在 **{labels('dirs')}** 里选方向。")
    elif vid not in on_site:
        entry["dirs"] = dirs
    entry = {"venue": vid, **entry}

    year = fields.get("year", "").strip()
    if not re.fullmatch(r"20\d\d", year):
        errors.append(f"**{labels('year')}** 要写四位年份，例如 2027。")
    else:
        entry["year"] = int(year)
    if fields.get("round"):
        entry["round"] = fields["round"][:80]

    tz = (fields.get("timezone") or "AoE").split()[0]
    if tz == "未注明":
        tz = build.TZ_UNSTATED
    elif build.tz_for(tz) is None:
        errors.append(f"**{labels('timezone')}** `{tz}` 无法识别。")
    entry["timezone"] = tz

    for key in FIELDS:
        v = re.sub(r"\s+", " ", fields.get(key, "")).strip()
        if not v:
            continue
        if not DATE_RE.fullmatch(v) or build.parse_deadline(v, build.tz_for(tz)) is None:
            errors.append(f"**{labels(key)}** `{v}` 的格式不对。要写成 YYYY-MM-DD HH:MM 或 YYYY-MM-DD。")
        else:
            entry[key] = v
    if fields.get("dates"):
        if build.parse_conf_dates(fields["dates"]) is None:
            errors.append(f"**{labels('dates')}** `{fields['dates']}` 无法识别。请写成 August 1-5, 2027 这样。")
        else:
            entry["dates"] = fields["dates"].strip()
    if not any(k in entry for k in (*FIELDS, "dates")):
        errors.append("至少要填一个日期（摘要、论文、Rebuttal、通知或会期）。")
    if fields.get("place"):
        entry["place"] = fields["place"][:120]

    link = fields.get("link", "").strip()
    if not re.fullmatch(r"https?://\S+", link):
        errors.append(f"**{labels('link')}** 要写 http:// 或 https:// 开头的网址。")
    else:
        entry["link"] = link

    if "year" in entry and "paper" in entry:
        paper = dt.date.fromisoformat(entry["paper"][:10])
        if not entry["year"] - 2 <= paper.year <= entry["year"]:
            notes.append(f"注意：论文截止在 {paper.year} 年，会议是 {entry['year']} 年。请确认届数没有写错。")
    return entry, errors, notes


def write_manual(entries):
    """Rewrite manual.yml, keeping its comment header."""
    head = []
    for line in MANUAL.read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or not line.strip():
            head.append(line)
        else:
            break
    while head and not head[-1].strip():
        head.pop()
    body = yaml.safe_dump(entries, allow_unicode=True, sort_keys=False, width=120) if entries else "[]\n"
    MANUAL.write_text("\n".join(head) + "\n\n" + body, encoding="utf-8")


def summary(entry):
    rows = [f"| {k} | `{entry[k]}` |" for k in (*FIELDS, "dates", "place") if k in entry]
    return "\n".join([f"**{entry['venue']} {entry.get('year', '')}**"
                      + (f"（{entry['round']}）" if entry.get("round") else "")
                      + f"，时区 {entry['timezone']}：", "", "| | |", "|---|---|", *rows])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--reply", required=True, help="file for the issue reply (Markdown)")
    ap.add_argument("--ccfddl", help="local ccf-deadlines checkout instead of downloading")
    args = ap.parse_args()

    number = int(os.environ["ISSUE_NUMBER"])
    cfg = yaml.safe_load((build.ROOT / "config.yml").read_text(encoding="utf-8"))
    extra = yaml.safe_load((build.ROOT / "extra.yml").read_text(encoding="utf-8")) or []
    manual = [m for m in build.load_manual() if m.get("issue") != number]
    ccf = build.load_ccfddl(args.ccfddl)

    entry, errors, notes = check(parse_body(os.environ.get("ISSUE_BODY", "")), ccf, extra, manual, cfg)
    reply = Path(args.reply)
    if errors:
        reply.write_text("表单里有问题，网站没有更新。请编辑这个 issue 改正，保存后会自动重新检查。\n\n"
                         + "\n".join(f"- {e}" for e in errors) + "\n", encoding="utf-8")
        print("\n".join(errors), file=sys.stderr)
        return 1
    entry["by"] = os.environ.get("ISSUE_USER") or None
    entry["issue"] = number
    write_manual(manual + [{k: v for k, v in entry.items() if v is not None}])
    reply.write_text("已加到 `manual.yml`：\n\n" + summary(entry) + "\n"
                     + "".join(f"\n{n}\n" for n in notes), encoding="utf-8")
    print(f"manual.yml: {entry['venue']} {entry['year']} from issue #{number}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
