#!/usr/bin/env python3
"""Build the castlDDL site data from ccfddl.

Reads config.yml, extra.yml and manual.yml, downloads the ccfddl conference
files, and writes docs/data/deadlines.json plus one iCalendar feed per
direction under docs/ics/.

Usage:
    python scripts/build.py                 # download ccfddl from GitHub
    python scripts/build.py --ccfddl DIR    # use a local ccf-deadlines checkout
"""
import argparse
import datetime as dt
import io
import json
import re
import sys
import tarfile
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

ROOT = Path(__file__).resolve().parent.parent
CCF_REPO = "https://github.com/ccfddl/ccf-deadlines"
CCF_TARBALL = "https://codeload.github.com/ccfddl/ccf-deadlines/tar.gz/refs/heads/main"
CCF_COMMIT_API = "https://api.github.com/repos/ccfddl/ccf-deadlines/commits/main"

NAMED_ZONES = {
    "PT": "America/Los_Angeles", "PST": "America/Los_Angeles", "PDT": "America/Los_Angeles",
    "ET": "America/New_York", "EST": "America/New_York", "EDT": "America/New_York",
    "CET": "Europe/Paris", "CEST": "Europe/Paris",
}
MONTHS = ["january", "february", "march", "april", "may", "june", "july",
          "august", "september", "october", "november", "december"]
TIMELINE_KEYS = (("abstract_deadline", "abstract"), ("deadline", "paper"),
                 ("rebuttal_deadline", "rebuttal"), ("decision_deadline", "notify"))
ICS_KINDS = {"abstract": "abstract deadline", "paper": "paper deadline"}
ESTIMATE_WINDOW = 45  # days; rounds of quarterly venues (SIGMOD) are ~90 days apart
MANUAL_KINDS = ("abstract", "paper", "rebuttal", "notify")
TZ_UNSTATED = "unstated"  # the call gives dates without a time zone; tz_for() returns None


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "castlDDL-build"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load_ccfddl(local_dir=None):
    """Return {"DB/icde": entry} for every ccfddl conference file."""
    venues = {}

    def add(sub, name, text):
        entries = yaml.safe_load(text) or []
        if entries:
            venues[f"{sub}/{name}"] = entries[0]

    if local_dir:
        for p in sorted(Path(local_dir, "conference").glob("*/*.yml")):
            if p.name != "types.yml":
                add(p.parent.name, p.stem, p.read_text(encoding="utf-8"))
        return venues

    with tarfile.open(fileobj=io.BytesIO(fetch(CCF_TARBALL)), mode="r:gz") as tf:
        for m in tf.getmembers():
            parts = m.name.split("/")
            if (m.isfile() and len(parts) == 4 and parts[1] == "conference"
                    and parts[3].endswith(".yml") and parts[3] != "types.yml"):
                add(parts[2], parts[3][:-4], tf.extractfile(m).read().decode("utf-8"))
    return venues


def ccfddl_commit():
    try:
        info = json.loads(fetch(CCF_COMMIT_API, timeout=20))
        return {"sha": info["sha"][:7], "date": info["commit"]["committer"]["date"]}
    except Exception as e:  # the site still builds without commit info
        print(f"warning: could not read ccfddl commit: {e}", file=sys.stderr)
        return None


def tz_for(label):
    """Map a ccfddl time zone label to a tzinfo, or None if unknown."""
    s = str(label or "AoE").strip()
    if s.upper() in ("AOE", "UTC-12"):
        return dt.timezone(dt.timedelta(hours=-12))
    if s in ("UTC", "GMT"):
        return dt.timezone.utc
    if s in NAMED_ZONES:
        return ZoneInfo(NAMED_ZONES[s])
    m = re.fullmatch(r"(?:UTC|GMT)([+-])(\d{1,2})(?::?(\d{2}))?", s)
    if m:
        sign = 1 if m[1] == "+" else -1
        return dt.timezone(sign * dt.timedelta(hours=int(m[2]), minutes=int(m[3] or 0)))
    return None


def tz_label(label):
    s = str(label or "AoE").strip()
    return "AoE" if s.upper() in ("AOE", "UTC-12") else ("UTC" if s in ("UTC+0", "UTC-0", "GMT") else s)


def parse_deadline(value, tz):
    """'2026-11-11 17:00:00' -> {date, time, utc}. Returns None for 'TBD' and the like."""
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?", str(value).strip())
    if not m:
        return None
    y, mo, d = int(m[1]), int(m[2]), int(m[3])
    has_time = m[4] is not None
    hh, mm, ss = (int(m[4]), int(m[5]), int(m[6] or 0)) if has_time else (23, 59, 59)
    try:
        local = dt.datetime(y, mo, d, hh, mm, ss)
    except ValueError:
        return None
    ev = {"date": f"{y:04d}-{mo:02d}-{d:02d}"}
    if has_time:
        ev["time"] = f"{hh:02d}:{mm:02d}"
    if tz is not None:
        ev["utc"] = local.replace(tzinfo=tz).astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return ev


def month_num(token):
    t = token.lower().rstrip(".")
    if len(t) < 3:
        return None
    for i, name in enumerate(MONTHS, 1):
        if name.startswith(t):
            return i
    return None


def parse_conf_dates(text):
    """'May 17-21, 2027' -> ('2027-05-17', '2027-05-21'). Returns None if the text has another shape."""
    s = re.sub(r"\s+", " ", str(text or "")).strip().replace("\u2013", "-").replace("\u2014", "-")
    shapes = [
        (r"([A-Za-z.]+) (\d{1,2}),? (\d{4}) ?- ?([A-Za-z.]+) (\d{1,2}),? (\d{4})",
         lambda g: ((g[3], g[1], g[2]), (g[6], g[4], g[5]))),
        (r"([A-Za-z.]+) (\d{1,2}) ?- ?([A-Za-z.]+) (\d{1,2}),? (\d{4})",
         lambda g: ((g[5], g[1], g[2]), (g[5], g[3], g[4]))),
        (r"([A-Za-z.]+) (\d{1,2}) ?- ?(\d{1,2}),? (\d{4})",
         lambda g: ((g[4], g[1], g[2]), (g[4], g[1], g[3]))),
        (r"([A-Za-z.]+) (\d{1,2}),? (\d{4})",
         lambda g: ((g[3], g[1], g[2]), (g[3], g[1], g[2]))),
    ]
    for pattern, pick in shapes:
        m = re.fullmatch(pattern, s)
        if not m:
            continue
        (y1, m1, d1), (y2, m2, d2) = pick(m)
        a, b = month_num(m1), month_num(m2)
        if not a or not b:
            return None
        try:
            start, end = dt.date(int(y1), a, int(d1)), dt.date(int(y2), b, int(d2))
        except ValueError:
            return None
        if end < start and y1 == y2:  # "December 30 - January 2, 2027"
            start = start.replace(year=start.year - 1)
        if end < start or (end - start).days > 31:
            return None
        return start.isoformat(), end.isoformat()
    return None


def build_edition(conf):
    tz = tz_for(conf.get("timezone"))
    events = []
    for rnd, item in enumerate(conf.get("timeline") or []):
        for key, kind in TIMELINE_KEYS:
            if key not in item:
                continue
            ev = parse_deadline(item[key], tz)
            if ev is None:
                continue
            ev.update(kind=kind, round=rnd)
            if item.get("comment"):
                ev["note"] = str(item["comment"])
            events.append(ev)
    span = parse_conf_dates(conf.get("date"))
    if span:
        events.append({"kind": "conf", "date": span[0], "end": span[1]})
    return {
        "year": conf.get("year"),
        "link": conf.get("link"),
        "place": conf.get("place"),
        "date": None if conf.get("date") in (None, "TBD") else str(conf.get("date")),
        "tz": tz_label(conf.get("timezone")),
        "events": events,
    }


def shift_year(date_str, years):
    y, m, d = map(int, date_str.split("-"))
    return f"{y + years:04d}-{m:02d}-{min(d, 28) if (m, d) == (2, 29) else d:02d}"


def add_estimates(editions, now):
    """Project each edition's abstract and paper deadlines one year ahead, for rounds the
    next call has not announced yet. ccfddl lists only announced dates, so the next round
    of most venues is missing for months (KDD 2027 lists its July round, not February).
    An estimate is kept only if it falls within the next 365 days and no announced abstract
    or paper deadline lies within ESTIMATE_WINDOW days of it. Estimates carry `est` = the base year."""
    announced = [(ev["kind"], dt.date.fromisoformat(ev["date"]))
                 for ed in editions for ev in ed["events"] if ev["kind"] in ICS_KINDS and not ev.get("est")]
    by_year = {ed["year"]: ed for ed in editions}
    for base in sorted(editions, key=lambda e: e["year"]):
        if base.get("est"):
            continue
        for ev in base["events"]:
            if ev["kind"] not in ICS_KINDS or ev.get("est"):
                continue
            tz = tz_for(ev.get("tz") or base["tz"])
            date = shift_year(ev["date"], 1)
            day = dt.date.fromisoformat(date)
            # either type counts: a venue that now lists only a paper deadline needs no abstract estimate
            if any(abs((day - a).days) <= ESTIMATE_WINDOW for _, a in announced):
                continue
            new = parse_deadline(f"{date} {ev['time']}" if ev.get("time") else date, tz)
            when = new.get("utc") or f"{date}T23:59:59Z"
            when = dt.datetime.strptime(when, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
            if not now <= when <= now + dt.timedelta(days=365):
                continue
            new.update(kind=ev["kind"], round=ev["round"], est=base["year"])
            if ev.get("tz"):
                new["tz"] = ev["tz"]
            if ev.get("note"):
                new["note"] = ev["note"]
            target = by_year.get(base["year"] + 1)
            if target is None:
                target = by_year[base["year"] + 1] = {"year": base["year"] + 1, "est": True, "tz": base["tz"], "events": []}
                editions.append(target)
            if not any(x.get("est") and x["kind"] == new["kind"] and x["date"] == new["date"] for x in target["events"]):
                target["events"].append(new)
    for ed in editions:
        ed["events"].sort(key=lambda x: (x["date"], x.get("time", "")))
    return editions


def apply_manual(editions, entries):
    """Merge the lab's manual.yml entries for one venue into its editions. A manual date
    replaces ccfddl's dates of the same type within ESTIMATE_WINDOW days in that edition;
    a replaced date that differs is kept in `alt` so the site can show the disagreement."""
    day = lambda e: dt.date.fromisoformat(e["date"])
    for i, m in enumerate(entries):
        year, label = int(m["year"]), tz_label(m.get("timezone"))
        ed = next((e for e in editions if e["year"] == year), None)
        if ed is None:
            ed = {"year": year, "link": None, "place": None, "date": None, "tz": label, "events": []}
            editions.append(ed)
        new = []
        for kind in MANUAL_KINDS:
            if not m.get(kind):
                continue
            ev = parse_deadline(m[kind], tz_for(m.get("timezone")))
            if ev is None:
                print(f"warning: manual.yml {m['venue']} {year} {kind}: bad date {m[kind]!r}", file=sys.stderr)
                continue
            ev.update(kind=kind, round=f"lab{m.get('issue', i)}", src="lab", tz=label)
            for key, field in (("round", "note"), ("link", "ref"), ("by", "by"), ("issue", "issue")):
                if m.get(key):
                    ev[field] = m[key]
            new.append(ev)
        kept = []
        for e in ed["events"]:
            hit = [n for n in new if n["kind"] == e["kind"] and abs((day(n) - day(e)).days) <= ESTIMATE_WINDOW]
            if not hit:
                kept.append(e)
            elif e.get("src") != "lab" and e["date"] != hit[0]["date"]:
                hit[0]["alt"] = e["date"]
        ed["events"] = kept + new
        span = parse_conf_dates(m.get("dates"))
        if span:
            ed["events"] = [e for e in ed["events"] if e["kind"] != "conf"] + [{"kind": "conf", "date": span[0], "end": span[1]}]
            ed["date"] = str(m["dates"])
        if m.get("place"):
            ed["place"] = str(m["place"])
        if m.get("link") and not ed.get("link"):
            ed["link"] = m["link"]
    return editions


def clean(obj):
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items() if v not in (None, "", [], {})}
    if isinstance(obj, list):
        return [clean(v) for v in obj]
    return obj


def resolve_venue(name, known):
    """Match a name ('SIGKDD', 'sigkdd') or ID ('DB/sigkdd') against known {id: title}.
    Returns (id, []) for one match, or (None, candidate ids) otherwise."""
    s = str(name or "").strip()
    if s in known:
        return s, []
    low = s.lower()
    hits = [i for i, title in known.items()
            if low in (i.lower(), str(title).lower(), i.split("/")[-1].lower())]
    if len(hits) == 1:
        return hits[0], []
    if not hits and len(low) >= 3:
        hits = [i for i, title in known.items() if low in str(title).lower() or low in i.lower()]
    return None, sorted(hits)


def manual_venue(m):
    """A LAB/ venue (one that ccfddl does not list) as a ccfddl-style entry."""
    return {"title": m.get("title") or m["venue"].split("/", 1)[-1], "description": m.get("name"),
            "rank": {"ccf": "N"}, "confs": []}


def select_venues(cfg, ccf, extra, manual=()):
    """Return {venue_id: (entry, [direction ids])} in config order."""
    chosen = {}
    for d in cfg["directions"]:
        ids = [v for v in ccf if any(v.startswith(sub + "/") for sub in d.get("subs") or [])]
        ids += d.get("venues") or []
        for vid in ids:
            if vid not in ccf:
                print(f"warning: {vid} (direction {d['id']}) is not in ccfddl", file=sys.stderr)
                continue
            entry, dirs = chosen.setdefault(vid, (ccf[vid], []))
            if d["id"] not in dirs:
                dirs.append(d["id"])
    known = {d["id"] for d in cfg["directions"]}
    for e in extra:
        dirs = [x for x in e.get("dirs") or [] if x in known]
        if not e.get("id") or not dirs:
            print(f"warning: extra.yml entry {e.get('id') or e.get('title')} needs id and dirs", file=sys.stderr)
            continue
        chosen[e["id"]] = (e, dirs)
    for m in manual:  # a manual entry can add a venue that the direction lists do not cover
        vid, dirs = m.get("venue"), [x for x in m.get("dirs") or [] if x in known]
        if vid in chosen or not dirs:
            continue
        if vid in ccf:
            chosen[vid] = (ccf[vid], dirs)
        elif str(vid).startswith("LAB/"):
            chosen[vid] = (manual_venue(m), dirs)
    return chosen


def ics_escape(s):
    return str(s).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def ics_fold(line):
    data, parts = line.encode("utf-8"), []
    while len(data) > 75:
        cut = 75
        while (data[cut] & 0xC0) == 0x80:
            cut -= 1
        parts.append(data[:cut])
        data = b" " + data[cut:]
    parts.append(data)
    return "\r\n".join(p.decode("utf-8") for p in parts)


def write_ics(path, name, confs, now):
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    since = now - dt.timedelta(days=30)
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//castlDDL//deadlines//EN",
             "CALSCALE:GREGORIAN", "METHOD:PUBLISH", f"X-WR-CALNAME:{ics_escape(name)}",
             "X-PUBLISHED-TTL:PT12H", "REFRESH-INTERVAL;VALUE=DURATION:PT12H"]
    count, uids = 0, set()
    for c in confs:
        for ed in c["editions"]:
            for ev in ed["events"]:
                if ev["kind"] not in ICS_KINDS or ev.get("est"):
                    continue
                if "utc" in ev:
                    when = dt.datetime.strptime(ev["utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
                    span = [f"DTSTART:{when:%Y%m%dT%H%M%SZ}", f"DTEND:{when:%Y%m%dT%H%M%SZ}"]
                else:  # no time zone given: an all-day event on the published date
                    day = dt.date.fromisoformat(ev["date"])
                    when = dt.datetime.combine(day, dt.time(23, 59), dt.timezone.utc)
                    span = [f"DTSTART;VALUE=DATE:{day:%Y%m%d}", f"DTEND;VALUE=DATE:{day + dt.timedelta(days=1):%Y%m%d}"]
                if when < since:
                    continue
                title = f"{c['title']} {ed.get('year') or ''}".strip()
                summary = f"{title} {ICS_KINDS[ev['kind']]}" + (f" ({ev['note']})" if ev.get("note") else "")
                zone = ev.get("tz") or ed.get("tz", "")
                zone = "(time zone not stated)" if zone == TZ_UNSTATED else zone
                published = f"{ev['date']} {ev.get('time', '')} {zone}".replace("  ", " ").strip()
                desc = [c.get("description") or "", f"CCF {c.get('rank', {}).get('ccf', 'N')}",
                        f"Published deadline: {published}"]
                if ev.get("src") == "lab":
                    desc.append(f"Entered by the lab{' (' + ev['by'] + ')' if ev.get('by') else ''}: {ev.get('ref', '')}")
                if ed.get("link"):
                    desc.append(ed["link"])
                uid = f"{c['id'].replace('/', '-')}-{ed.get('year')}-{ev['kind']}-{ev.get('round', 0)}"
                while uid in uids:  # ccfddl lists the same round twice
                    uid += "-x"
                uids.add(uid)
                uid += "@castlddl"
                lines += ["BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{stamp}", *span,
                          f"SUMMARY:{ics_escape(summary)}", f"DESCRIPTION:{ics_escape(chr(10).join(desc))}"]
                if ed.get("link"):
                    lines.append(f"URL:{ed['link']}")
                lines.append("END:VEVENT")
                count += 1
    lines.append("END:VCALENDAR")
    path.write_text("\r\n".join(ics_fold(x) for x in lines) + "\r\n", encoding="utf-8", newline="")
    return count


def load_manual():
    entries = yaml.safe_load((ROOT / "manual.yml").read_text(encoding="utf-8")) or []
    ok = []
    for m in entries:
        if isinstance(m, dict) and m.get("venue") and str(m.get("year", "")).isdigit():
            ok.append(m)
        else:
            print(f"warning: manual.yml entry needs venue and year: {m}", file=sys.stderr)
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ccfddl", help="local ccf-deadlines checkout instead of downloading")
    args = ap.parse_args()

    cfg = yaml.safe_load((ROOT / "config.yml").read_text(encoding="utf-8"))
    extra = yaml.safe_load((ROOT / "extra.yml").read_text(encoding="utf-8")) or []
    manual = load_manual()
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    min_year = now.year - int(cfg.get("years_back", 1))

    ccf = load_ccfddl(args.ccfddl)
    if len(ccf) < 100:
        sys.exit(f"error: only {len(ccf)} venues read from ccfddl; refusing to publish a partial site")

    confs = []
    chosen = select_venues(cfg, ccf, extra, manual)
    for m in manual:
        if m.get("venue") not in chosen:
            print(f"warning: manual.yml venue {m.get('venue')} is not on the site; give it dirs", file=sys.stderr)
    for vid, (entry, dirs) in chosen.items():
        editions = [build_edition(c) for c in entry.get("confs") or []
                    if isinstance(c.get("year"), int) and c["year"] >= min_year]
        apply_manual(editions, [m for m in manual if m.get("venue") == vid and int(m["year"]) >= min_year])
        editions = [e for e in editions if e["events"] or e["date"]]
        if not editions:
            continue
        add_estimates(editions, now)
        editions.sort(key=lambda e: e["year"], reverse=True)
        rank = entry.get("rank") or {}
        confs.append({
            "id": vid,
            "title": str(entry.get("title") or vid.split("/")[-1].upper()),
            "description": entry.get("description"),
            "sub": vid.split("/")[0],
            "rank": {"ccf": str(rank.get("ccf") or "N"), "core": rank.get("core"), "thcpl": rank.get("thcpl")},
            "dblp": entry.get("dblp"),
            "dirs": dirs,
            "editions": editions,
        })
    confs.sort(key=lambda c: c["title"].lower())

    out_dir, ics_dir = ROOT / "docs" / "data", ROOT / "docs" / "ics"
    out_dir.mkdir(parents=True, exist_ok=True)
    ics_dir.mkdir(parents=True, exist_ok=True)

    feeds = [{"id": "all", "file": "ics/castlddl-all.ics"}]
    feeds += [{"id": d["id"], "file": f"ics/castlddl-{d['id']}.ics"} for d in cfg["directions"]]
    for f in feeds:
        subset = confs if f["id"] == "all" else [c for c in confs if f["id"] in c["dirs"]]
        name = "castlDDL" if f["id"] == "all" else f"castlDDL - {next(d['name'] for d in cfg['directions'] if d['id'] == f['id'])}"
        f["events"] = write_ics(ROOT / "docs" / f["file"], name, subset, now)

    data = {
        "generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "repo": cfg.get("repo"),
        "source": {"name": "ccfddl", "url": CCF_REPO, "commit": ccfddl_commit()},
        "directions": [{"id": d["id"], "name": d["name"], "name_zh": d.get("name_zh", d["name"]),
                        "short": d.get("short", d["name"]), "short_zh": d.get("short_zh", d.get("name_zh", d["name"]))}
                       for d in cfg["directions"]],
        "feeds": feeds,
        "confs": confs,
    }
    (out_dir / "deadlines.json").write_text(
        json.dumps(clean(data), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n_events = sum(len(e["events"]) for c in confs for e in c["editions"])
    n_est = sum(1 for c in confs for e in c["editions"] for ev in e["events"] if ev.get("est"))
    print(f"{len(confs)} venues, {n_events} dates ({n_est} estimated), feeds: "
          + ", ".join(f"{f['id']}={f['events']}" for f in feeds))


if __name__ == "__main__":
    main()
