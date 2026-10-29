/* castlDDL front end. Reads data/deadlines.json (built by scripts/build.py) and renders
   a month calendar, a list, a countdown rail and calendar-feed links. No build step. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  /* ---------- text ---------- */
  const I18N = {
    zh: {
      htmlLang: "zh-CN", locale: "zh-CN", langBtn: "English",
      subtitle: "实验室会议截稿日历。数据来自 ccfddl 和组内录入，按组内的研究方向整理。截稿时间自动换算成你的本地时间。",
      directions: "研究方向", rank: "CCF 等级", coreRank: "CORE 等级", show: "显示", find: "查找",
      hits: "找到的会议", noHits: "网站上没有这个会议。可以点右上角“补充日期”把它加进来。",
      hiddenByFilter: "被上面的筛选条件隐藏了，日历里不显示", nextDate: (s) => `下一个截止 ${s}`, noNext: "暂无未来截止日期",
      starredOnly: "只看关注", search: "搜索会议，例如 SIGMOD", rankOther: "无等级",
      kDeadline: "摘要与论文截止", kRebuttal: "Rebuttal", kNotify: "录用通知", kConf: "会期", kEst: "预计日期",
      est: "预计", estNote: (y) => `按 ${y} 年的日期推算，官方还没公布`,
      estEdition: (y) => `官方还没公布这一届的日期。下面的日期是按 ${y} 年推算的，仅供参考。`,
      themeDark: "深色", themeLight: "浅色", themeTo: (m) => `切换到${m}模式`,
      paper: "论文截止", abstract: "摘要截止", rebuttal: "Rebuttal", notify: "录用通知", conf: "会期",
      paperS: "截稿", abstractS: "摘要", rebuttalS: "Rebuttal", notifyS: "通知", confS: "会期",
      month: "月历", list: "列表", thisMonth: "本月", prev: "上个月", next: "下个月",
      monthLabel: (y, m) => `${y} 年 ${m} 月`,
      weekdays: ["一", "二", "三", "四", "五", "六", "日"],
      upcoming: "即将截稿", noUpcoming: "没有符合筛选条件的截稿日期。",
      days: "天", hours: "小时", today: "今天截止", yourTime: "你的时间", noTime: "未注明时刻",
      more: (n) => `另有 ${n} 项`, nothingThisDay: "这一天没有日期。", noMatch: "没有符合筛选条件的日期。",
      subscribe: "订阅到日历",
      subscribeHint: "把地址加到 Google 日历（其他日历 → 通过网址添加）、Outlook 或 Apple 日历。日历 app 会自己定时更新。订阅只包含已公布的摘要和论文截止，不含预计日期。",
      allDirs: "全部方向", copy: "复制地址", copied: "已复制", open: "打开",
      website: "官网", place: "地点", dates: "会期", tz: "时区", dblp: "DBLP", tzUnstated: "官网未注明",
      type: "类型", published: "公布时间", countdown: "倒计时", passed: "已过", ended: "已结束",
      left: (d) => `还剩 ${d} 天`, leftH: (n) => `还剩 ${n} 小时`,
      star: "关注", starred: "已关注", close: "关闭",
      loading: "正在加载数据…", loadError: "数据加载失败。请刷新页面。",
      source: (sha) => `数据来自 ccfddl（MIT 许可）${sha ? `，提交 ${sha}` : ""}。`,
      updated: (s) => `最后更新：${s}。每月 1 日和 15 日自动更新。`,
      howToAdd: "看到 ccfddl 还没有的日期？点“补充日期”提交（要有 GitHub 账号）。组内成员提交后约 2 分钟自动更新。调整方向分类请改仓库里的 config.yml。",
      add: "补充日期", addTitle: "在 GitHub 上提交 ccfddl 还没有的日期", fixEdition: (n) => `补充或更正 ${n} 的日期`,
      lab: (u) => (u ? `组内录入（${u}）` : "组内录入"), labSource: "来源", alt: (d) => `ccfddl 写的是 ${d}`,
      repo: "GitHub 仓库", venues: (n) => `${n} 个会议`,
    },
    en: {
      htmlLang: "en", locale: "en-US", langBtn: "中文",
      subtitle: "Conference deadlines for the lab's research directions. Data from ccfddl and from lab members. Deadlines are shown in your local time.",
      directions: "Directions", rank: "CCF rank", coreRank: "CORE rank", show: "Show", find: "Find",
      hits: "Venues found", noHits: "This venue is not on the site. Use \"Add a date\" (top right) to add it.",
      hiddenByFilter: "Hidden by the filters above, so the calendar does not show it", nextDate: (s) => `next deadline ${s}`, noNext: "no future deadline yet",
      starredOnly: "Starred only", search: "Search, e.g. SIGMOD", rankOther: "Unranked",
      kDeadline: "Abstract & paper deadlines", kRebuttal: "Rebuttal", kNotify: "Notification", kConf: "Conference", kEst: "Estimated dates",
      est: "estimated", estNote: (y) => `Estimated from the ${y} date; not announced yet`,
      estEdition: (y) => `Dates not announced yet. The dates below are estimated from ${y}.`,
      themeDark: "Dark", themeLight: "Light", themeTo: (m) => `Switch to ${m.toLowerCase()} mode`,
      paper: "Paper deadline", abstract: "Abstract deadline", rebuttal: "Rebuttal", notify: "Notification", conf: "Conference",
      paperS: "paper", abstractS: "abstract", rebuttalS: "rebuttal", notifyS: "notif.", confS: "conf.",
      month: "Month", list: "List", thisMonth: "This month", prev: "Previous month", next: "Next month",
      monthLabel: (y, m) => new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      upcoming: "Upcoming deadlines", noUpcoming: "No upcoming deadlines match the filters.",
      days: "d", hours: "h", today: "due today", yourTime: "Your time", noTime: "no time given",
      more: (n) => `+${n} more`, nothingThisDay: "Nothing on this day.", noMatch: "No dates match the filters.",
      subscribe: "Subscribe in your calendar",
      subscribeHint: "Add a URL to Google Calendar (Other calendars → From URL), Outlook or Apple Calendar. The calendar app refreshes it on its own. Feeds contain announced abstract and paper deadlines only, no estimated dates.",
      allDirs: "All directions", copy: "Copy URL", copied: "Copied", open: "Open",
      website: "Website", place: "Place", dates: "Dates", tz: "Time zone", dblp: "DBLP", tzUnstated: "not stated",
      type: "Type", published: "Published", countdown: "Countdown", passed: "passed", ended: "ended",
      left: (d) => `${d} days left`, leftH: (n) => `${n} hours left`,
      star: "Star", starred: "Starred", close: "Close",
      loading: "Loading…", loadError: "Could not load the data. Refresh the page.",
      source: (sha) => `Data from ccfddl (MIT license)${sha ? `, commit ${sha}` : ""}.`,
      updated: (s) => `Last update: ${s}. Updates run on the 1st and 15th of each month.`,
      howToAdd: "Know a date that ccfddl does not have yet? Use \"Add a date\" (needs a GitHub account). Entries from lab members go live in about two minutes. To change the direction lists, edit config.yml in the repository.",
      add: "Add a date", addTitle: "Submit a date that ccfddl does not have yet, on GitHub", fixEdition: (n) => `Add or correct dates for ${n}`,
      lab: (u) => (u ? `entered by the lab (${u})` : "entered by the lab"), labSource: "source", alt: (d) => `ccfddl says ${d}`,
      repo: "GitHub repository", venues: (n) => `${n} venues`,
    },
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem("castlddl." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("castlddl." + k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  };
  let lang = store.get("lang", null) || ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en");
  const t = (k, ...a) => { const v = I18N[lang][k] ?? I18N.en[k] ?? k; return typeof v === "function" ? v(...a) : v; };

  /* ---------- dates ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  function parse(s) { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; }
  function addDays(s, n) {
    const { y, m, d } = parse(s);
    const x = new Date(Date.UTC(y, m - 1, d + n));
    return ymd(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
  }
  function todayStr() { const n = new Date(); return ymd(n.getFullYear(), n.getMonth() + 1, n.getDate()); }
  function fmtDay(s) {
    const { y, m, d } = parse(s);
    return new Intl.DateTimeFormat(t("locale"), { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" })
      .format(new Date(Date.UTC(y, m - 1, d)));
  }
  function fmtLocal(ms) {
    const opts = { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    try { return new Intl.DateTimeFormat(t("locale"), { ...opts, timeZoneName: "short" }).format(new Date(ms)); }
    catch { return new Intl.DateTimeFormat(t("locale"), opts).format(new Date(ms)); }
  }
  function timeLeft(ms) {
    const diff = ms - Date.now();
    if (diff < 0) return null;
    return { days: Math.floor(diff / 864e5), hours: Math.floor((diff % 864e5) / 36e5) };
  }
  function leftText(ms) {
    const l = timeLeft(ms);
    if (!l) return t("passed");
    return l.days ? t("left", l.days) : t("leftH", l.hours);
  }

  /* ---------- data ---------- */
  const DEADLINES = new Set(["abstract", "paper"]);
  const KIND_GROUP = { abstract: "deadline", paper: "deadline", rebuttal: "rebuttal", notify: "notify", conf: "conf" };
  const RANKS = ["A", "B", "C", "N"];
  const CORE_RANKS = ["A*", "A", "B", "C", "N"];
  let DATA = null, CONFS = [], ITEMS = [], DIRS = [], dirIdx = {};

  const now0 = new Date();
  const state = {
    dirs: null,
    ranks: new Set(store.get("ranks", RANKS)),
    coreRanks: new Set(store.get("coreRanks", CORE_RANKS)),
    kinds: new Set(store.get("kinds", ["deadline", "notify"])),
    showEst: store.get("showEst", true),
    starOnly: store.get("starOnly", false),
    stars: new Set(store.get("stars", [])),
    query: "",
    view: store.get("view", "month") === "list" ? "list" : "month",
    cursor: { y: now0.getFullYear(), m: now0.getMonth() },
    selectedDay: null,
    sheetConf: null,
    loadError: false,
  };

  const NCOLORS = 6; // --d0 .. --d5 in style.css
  const dirColor = (i) => `var(--d${i % NCOLORS})`;
  const colorOf = (c) => (c.color >= 0 ? dirColor(c.color) : "var(--dx)");
  const dirName = (d, short) => (lang === "zh" ? (short ? d.short_zh : d.name_zh) : (short ? d.short : d.name)) || d.name;

  function instantOf(ev, ed) {
    if (ev.utc) return { t: Date.parse(ev.utc), exact: !!ev.time, zoned: true };
    const { y, m, d } = parse(ev.date);
    return { t: new Date(y, m - 1, d, 23, 59).getTime(), exact: false, zoned: false, tz: ed.tz };
  }

  function prepare(json) {
    DATA = json;
    DIRS = json.directions || [];
    DIRS.forEach((d, i) => { dirIdx[d.id] = i; });
    const stored = store.get("dirs", null);
    const seen = new Set(store.get("dirsSeen", ["db", "cloud", "security", "storage", "hpc"]));
    state.dirs = new Set(Array.isArray(stored) ? stored.filter((id) => id in dirIdx) : DIRS.map((d) => d.id));
    DIRS.forEach((d) => { if (!seen.has(d.id)) state.dirs.add(d.id); });
    store.set("dirsSeen", DIRS.map((d) => d.id));
    CONFS = (json.confs || []).map((c) => ({
      ...c,
      dirs: c.dirs || [],
      rankCcf: RANKS.includes(c.rank && c.rank.ccf) ? c.rank.ccf : "N",
      rankCore: CORE_RANKS.includes(c.rank && c.rank.core) ? c.rank.core : "N",
      color: c.dirs && c.dirs.length && c.dirs[0] in dirIdx ? dirIdx[c.dirs[0]] : -1,
      editions: c.editions || [],
    }));
    ITEMS = [];
    for (const c of CONFS) {
      c.editions.forEach((ed) => {
        for (const ev of ed.events || []) {
          if (!KIND_GROUP[ev.kind] || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date || "")) continue;
          const end = ev.kind === "conf" && ev.end && ev.end >= ev.date ? ev.end : ev.date;
          ITEMS.push({ c, ed, ev, kind: ev.kind, date: ev.date, end, inst: instantOf(ev, ed) });
        }
      });
    }
    ITEMS.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.inst.t - b.inst.t));
  }

  const matchesQuery = (c, q) => !q || [c.title, c.description || "", c.id].some((s) => s.toLowerCase().includes(q.toLowerCase()));
  function passesFilters(c) {
    if (!c.dirs.some((d) => state.dirs.has(d))) return false;
    if (!state.ranks.has(c.rankCcf) || !state.coreRanks.has(c.rankCore)) return false;
    if (state.starOnly && !state.stars.has(c.id)) return false;
    return true;
  }
  const confVisible = (c) => passesFilters(c) && matchesQuery(c, state.query);
  const rankText = (c) => [c.rankCcf !== "N" ? `CCF-${c.rankCcf}` : "", c.rankCore !== "N" ? `CORE ${c.rankCore}` : ""].filter(Boolean).join(" · ");
  const visibleItems = () => ITEMS.filter((it) => state.kinds.has(KIND_GROUP[it.kind]) && (state.showEst || !it.ev.est) && confVisible(it.c));

  function whenText(it) {
    const ev = it.ev;
    let s = (ev.est ? "~" : "") + fmtDay(ev.date);
    if (it.kind === "conf" && it.end > ev.date) s += ` – ${fmtDay(it.end)}`;
    if (it.kind !== "conf") {
      if (ev.time) s += ` ${ev.time}`;
      if (ev.time && (ev.tz || it.ed.tz)) s += ` ${tzText(ev.tz || it.ed.tz)}`;
    }
    return s;
  }
  const noteText = (it) => [it.ev.est ? t("estNote", it.ev.est) : "", it.ev.src === "lab" ? t("lab", it.ev.by) : "",
    it.ev.alt ? t("alt", it.ev.alt) : "", it.ev.note || ""].filter(Boolean).join(" · ");
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);
  function formUrl(c, year) {
    if (!safeUrl(DATA && DATA.repo)) return null;
    const q = new URLSearchParams({ template: "deadline.yml" });
    if (c) { q.set("title", `[DDL] ${c.title} ${year || ""}`.trim()); q.set("venue", c.id); if (year) q.set("year", String(year)); }
    else q.set("title", "[DDL] ");
    return `${DATA.repo.replace(/\/$/, "")}/issues/new?${q}`;
  }
  const tzText = (z) => (z === "unstated" ? t("tzUnstated") : z);
  const label = (it, short) => `${it.c.title}${short ? "" : " " + (it.ed.year || "")} ${t(it.kind + (short ? "S" : ""))}`.replace(/\s+/g, " ").trim();

  /* ---------- theme ---------- */
  const sysDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const themeNow = () => document.documentElement.dataset.theme || (sysDark && sysDark.matches ? "dark" : "light");
  function applyTheme() {
    const to = themeNow() === "dark" ? t("themeLight") : t("themeDark");
    $("themeBtn").textContent = `${themeNow() === "dark" ? "☀" : "☾"} ${to}`;
    $("themeBtn").setAttribute("aria-label", t("themeTo", to));
  }

  /* ---------- render ---------- */
  function applyText() {
    document.documentElement.lang = t("htmlLang");
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $("langBtn").textContent = t("langBtn");
    applyTheme();
    const add = $("addBtn"), url = formUrl(null);
    add.hidden = !url;
    if (url) { add.href = url; add.textContent = `+ ${t("add")}`; add.title = t("addTitle"); }
    $("search").placeholder = t("search");
    $("search").setAttribute("aria-label", t("search"));
    $("prevBtn").setAttribute("aria-label", t("prev"));
    $("nextBtn").setAttribute("aria-label", t("next"));
    $("sheetClose").setAttribute("aria-label", t("close"));
    const leg = $("legend");
    leg.replaceChildren(
      h("span", null, h("i", { style: "background:var(--muted)" }), t("paper")),
      h("span", null, h("i", { style: "box-shadow:inset 0 0 0 1.5px var(--muted)" }), t("abstract")),
      h("span", null, h("i", { style: "outline:1.5px dotted var(--muted);outline-offset:-1.5px" }), t("rebuttal")),
      h("span", null, h("i", { style: "outline:1.5px dashed var(--muted);outline-offset:-1.5px" }), t("notify")),
      h("span", null, h("i", { style: "background:color-mix(in srgb,var(--muted) 30%,var(--surface))" }), t("conf")),
      h("span", null, h("i", { style: "background:repeating-linear-gradient(135deg,var(--muted) 0 6px,color-mix(in srgb,var(--muted) 45%,var(--surface)) 6px 9px)" }), t("kEst")));
  }

  function render() {
    applyText();
    if (!DATA) {
      $("cal").replaceChildren();
      $("upcoming").replaceChildren(h("li", { class: "empty" }, state.loadError ? t("loadError") : t("loading")));
      $("monthLabel").textContent = t("monthLabel", state.cursor.y, state.cursor.m + 1);
      return;
    }
    const all = visibleItems();
    renderFilters();
    $("monthLabel").textContent = t("monthLabel", state.cursor.y, state.cursor.m + 1);
    $("viewMonth").setAttribute("aria-pressed", String(state.view === "month"));
    $("viewList").setAttribute("aria-pressed", String(state.view === "list"));
    $("monthNav").style.visibility = state.view === "month" ? "visible" : "hidden";
    $("monthView").hidden = state.view !== "month";
    $("listView").hidden = state.view !== "list";
    if (state.view === "month") renderMonth(all); else renderList(all);
    renderUpcoming();
    renderFeeds();
    renderFooter();
    if (state.sheetConf && !$("sheet").hidden) openDetail(state.sheetConf, true);
  }

  function toggleChip(set, key, storeKey) {
    set.has(key) ? set.delete(key) : set.add(key);
    store.set(storeKey, [...set]);
    render();
  }

  function renderFilters() {
    const count = (pred) => CONFS.filter(pred).length;
    $("dirChips").replaceChildren(...DIRS.map((d, i) => h("button", {
      type: "button", class: "fchip", "aria-pressed": String(state.dirs.has(d.id)), title: dirName(d, false),
      style: `--c:${dirColor(i)}`, onclick: () => toggleChip(state.dirs, d.id, "dirs"),
    }, h("span", { class: "sw" }), dirName(d, true), h("span", { class: "n" }, count((c) => c.dirs.includes(d.id))))));
    $("rankChips").replaceChildren(...RANKS.map((r) => h("button", {
      type: "button", class: "fchip", "aria-pressed": String(state.ranks.has(r)), onclick: () => toggleChip(state.ranks, r, "ranks"),
    }, r === "N" ? t("rankOther") : r, h("span", { class: "n" }, count((c) => c.rankCcf === r)))));
    $("coreChips").replaceChildren(...CORE_RANKS.map((r) => h("button", {
      type: "button", class: "fchip", "aria-pressed": String(state.coreRanks.has(r)), onclick: () => toggleChip(state.coreRanks, r, "coreRanks"),
    }, r === "N" ? t("rankOther") : r, h("span", { class: "n" }, count((c) => c.rankCore === r)))));
    renderHits();
    const kinds = [["deadline", "kDeadline"], ["rebuttal", "kRebuttal"], ["notify", "kNotify"], ["conf", "kConf"]];
    $("kindChips").replaceChildren(...kinds.map(([k, key]) => h("button", {
      type: "button", class: "fchip", "aria-pressed": String(state.kinds.has(k)), onclick: () => toggleChip(state.kinds, k, "kinds"),
    }, t(key))), h("button", {
      type: "button", class: "fchip", "aria-pressed": String(state.showEst),
      onclick: () => { state.showEst = !state.showEst; store.set("showEst", state.showEst); render(); },
    }, t("kEst")));
    $("starOnly").setAttribute("aria-pressed", String(state.starOnly));
  }

  // Venues matching the search box, so a venue with no dates in view can still be opened.
  function renderHits() {
    const q = state.query;
    $("hitsRow").hidden = !q;
    if (!q) return;
    const nowMs = Date.now();
    const hits = CONFS.filter((c) => matchesQuery(c, q)).slice(0, 12);
    $("searchHits").replaceChildren(...(hits.length ? hits.map((c) => {
      const next = ITEMS.find((it) => it.c === c && DEADLINES.has(it.kind) && it.inst.t >= nowMs);
      const shown = passesFilters(c) && (!next || !next.ev.est || state.showEst);
      return h("button", {
        type: "button", class: `hit${passesFilters(c) ? "" : " hidden-by-filter"}`, style: `--c:${colorOf(c)}`,
        title: passesFilters(c) ? null : t("hiddenByFilter"), onclick: () => openDetail(c.id),
      }, c.title, h("small", null, [rankText(c), next ? t("nextDate", whenText(next)) : t("noNext")].filter(Boolean).join(" · ")),
        shown ? null : h("small", null, "⊘"));
    }) : [h("span", { class: "empty" }, t("noHits"))]));
  }

  function chipFor(it, ds, col) {
    const c = it.c;
    const title = [label(it), whenText(it), noteText(it)].filter(Boolean).join(" · ");
    const open = (e) => { e.stopPropagation(); openDetail(c.id); };
    if (it.kind === "conf") {
      const rs = ds === it.date, re = ds === it.end;
      return h("button", {
        type: "button", class: `chip k-conf${rs ? " rs" : ""}${re ? " re" : ""}${it.end < todayStr() ? " past" : ""}`,
        style: `--c:${colorOf(c)}`, title, onclick: open,
      }, rs || col === 0 ? label(it, true) : " ");
    }
    return h("button", {
      type: "button", class: `chip k-${it.kind}${it.ev.est ? " est" : ""}${it.inst.t < Date.now() ? " past" : ""}`, style: `--c:${colorOf(c)}`, title, onclick: open,
    }, (it.ev.est ? "~" : "") + label(it, true), it.ev.time ? h("span", { class: "t" }, `${it.ev.time} ${tzText(it.ev.tz || it.ed.tz || "")}`.trim()) : null);
  }

  const KIND_RANK = { abstract: 0, paper: 0, rebuttal: 1, notify: 1, conf: 2 };
  function cellOrder(a, b) {
    if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (a.kind === "conf") return a.date < b.date ? -1 : a.date > b.date ? 1 : a.c.id.localeCompare(b.c.id);
    return a.inst.t - b.inst.t;
  }

  function renderMonth(all) {
    const cal = $("cal");
    cal.replaceChildren(...t("weekdays").map((w, i) => h("div", { class: "wd" }, w)));
    const { y, m } = state.cursor;
    const lead = (new Date(y, m, 1).getDay() + 6) % 7;
    const rows = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7);
    const start = addDays(ymd(y, m + 1, 1), -lead);
    const end = addDays(start, rows * 7 - 1);
    const today = todayStr();
    const byDay = new Map();
    for (const it of all) {
      if (it.end < start || it.date > end) continue;
      let s = it.date < start ? start : it.date;
      const e = it.end > end ? end : it.end;
      while (s <= e) { if (!byDay.has(s)) byDay.set(s, []); byDay.get(s).push(it); s = addDays(s, 1); }
    }
    for (let i = 0; i < rows * 7; i++) {
      const ds = addDays(start, i);
      const { m: mm, d } = parse(ds);
      const list = (byDay.get(ds) || []).slice().sort(cellOrder);
      const col = i % 7;
      const cls = ["cell", col > 4 && "we", mm !== m + 1 && "out", ds === today && "today", ds === state.selectedDay && "sel"].filter(Boolean).join(" ");
      const cell = h("div", { class: cls, onclick: () => selectDay(ds) },
        h("button", { type: "button", class: "dnum", "aria-label": `${fmtDay(ds)}, ${list.length}`, onclick: (e) => { e.stopPropagation(); selectDay(ds); } }, String(d)));
      const MAX = 4;
      list.slice(0, MAX).forEach((it) => cell.append(chipFor(it, ds, col)));
      if (list.length > MAX) cell.append(h("button", { type: "button", class: "more", onclick: (e) => { e.stopPropagation(); selectDay(ds); } }, t("more", list.length - MAX)));
      if (list.length) cell.append(h("div", { class: "dots", "aria-hidden": "true" },
        list.slice(0, 8).map((it) => h("span", { class: `dot k-${it.kind}${it.ev.est ? " est" : ""}`, style: `--c:${colorOf(it.c)}` }))));
      cal.append(cell);
    }
    const p = $("dayPanel");
    p.replaceChildren();
    const sel = state.selectedDay;
    if (!sel || sel < start || sel > end) { p.hidden = true; return; }
    p.hidden = false;
    const list = all.filter((it) => it.date <= sel && sel <= it.end).sort(cellOrder);
    p.append(h("h3", null, fmtDay(sel)));
    if (!list.length) p.append(h("p", { class: "empty" }, t("nothingThisDay")));
    for (const it of list) {
      p.append(h("button", { type: "button", class: "drow", style: `--c:${colorOf(it.c)}`, onclick: () => openDetail(it.c.id) },
        h("span", { class: `bar k-${it.kind}${it.ev.est ? " est" : ""}` }),
        h("span", null, h("b", null, label(it)), h("small", null, [whenText(it), noteText(it)].filter(Boolean).join(" · ")))));
    }
  }

  function selectDay(ds) { state.selectedDay = state.selectedDay === ds ? null : ds; render(); }

  function renderUpcoming() {
    const ol = $("upcoming");
    ol.replaceChildren();
    const nowMs = Date.now();
    const up = ITEMS.filter((it) => DEADLINES.has(it.kind) && !it.ev.est && it.inst.t >= nowMs && confVisible(it.c))
      .sort((a, b) => a.inst.t - b.inst.t).slice(0, 10);
    if (!up.length) { ol.append(h("li", { class: "empty" }, t("noUpcoming"))); return; }
    up.forEach((it, idx) => {
      const l = timeLeft(it.inst.t);
      const local = it.inst.zoned ? `${t("yourTime")} ${fmtLocal(it.inst.t)}` : t("noTime");
      ol.append(h("li", null, h("button", {
        type: "button", class: `up${l.days < 7 ? " soon" : ""}${idx === 0 ? " first" : ""}`, style: `--c:${colorOf(it.c)}`,
        onclick: () => openDetail(it.c.id),
      },
        h("span", { class: `bar k-${it.kind}` }),
        h("span", { style: "min-width:0" },
          h("span", { class: "nm" }, `${it.c.title} ${it.ed.year || ""}`.trim()),
          h("span", { class: "rk" }, rankText(it.c)),
          h("span", { class: "kd" }, t(it.kind)),
          h("span", { class: "wh" }, whenText(it)),
          h("span", { class: "lc" }, local)),
        h("span", { class: "cd" },
          l.days > 0 ? h("b", null, String(l.days), h("span", null, t("days"))) : h("b", null, String(l.hours), h("span", null, t("hours"))),
          h("small", null, l.days > 0 ? `${l.hours} ${t("hours")}` : t("today"))))));
    });
  }

  function renderList(all) {
    const box = $("listView");
    box.replaceChildren();
    const today = todayStr();
    const from = addDays(today, -31);
    const list = all.filter((it) => it.end >= from);
    if (!list.length) { box.append(h("p", { class: "empty" }, t("noMatch"))); return; }
    let cur = "";
    for (const it of list) {
      const key = it.date.slice(0, 7);
      if (key !== cur) { cur = key; const { y, m } = parse(it.date); box.append(h("h3", { class: "lmonth" }, t("monthLabel", y, m))); }
      const isConf = it.kind === "conf";
      const past = isConf ? it.end < today : it.inst.t < Date.now();
      const l = isConf ? null : timeLeft(it.inst.t);
      box.append(h("button", { type: "button", class: `lrow${past ? " past" : ""}`, style: `--c:${colorOf(it.c)}`, onclick: () => openDetail(it.c.id) },
        h("span", { class: "dt" }, fmtDay(it.date)),
        h("span", { class: `bar k-${it.kind}${it.ev.est ? " est" : ""}` }),
        h("span", { class: "tx" },
          h("b", null, label(it)),
          h("small", null, [whenText(it), rankText(it.c), noteText(it)].filter(Boolean).join(" · "))),
        past ? h("span", { class: "pill" }, isConf ? t("ended") : t("passed"))
          : it.ev.est ? h("span", { class: "pill est" }, t("est"))
          : l ? h("span", { class: `pill${l.days < 7 ? " soon" : ""}` }, leftText(it.inst.t)) : h("span")));
    }
  }

  function renderFeeds() {
    const ul = $("feeds");
    ul.replaceChildren();
    for (const f of DATA.feeds || []) {
      const url = new URL(f.file, location.href).href;
      const d = DIRS.find((x) => x.id === f.id);
      const field = h("input", { class: "copyfield", value: url, readonly: true, hidden: true, "aria-label": url });
      const copy = h("button", { type: "button", class: "btn" }, t("copy"));
      copy.addEventListener("click", () => {
        const done = () => { copy.textContent = t("copied"); setTimeout(() => { copy.textContent = t("copy"); }, 1500); };
        const fallback = () => { field.hidden = false; field.focus(); field.select(); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback);
        else fallback();
      });
      ul.append(h("li", { class: "feed", style: d ? `--c:${dirColor(dirIdx[d.id])}` : null },
        h("span", { class: "sw", style: d ? null : "background:var(--ink)" }),
        h("span", { class: "nm", title: d ? dirName(d, false) : t("allDirs") }, d ? dirName(d, true) : t("allDirs")),
        h("a", { class: "btn", href: url.replace(/^https?:/, "webcal:") }, t("open")),
        copy, field));
    }
  }

  function renderFooter() {
    const f = $("footer");
    const src = DATA.source || {};
    const gen = DATA.generated ? fmtLocal(Date.parse(DATA.generated)) : "—";
    f.replaceChildren(
      h("p", null, t("venues", CONFS.length), " · ", t("source", src.commit && src.commit.sha), " ",
        h("a", { href: src.url || "https://github.com/ccfddl/ccf-deadlines", target: "_blank", rel: "noopener" }, "ccfddl")),
      h("p", null, t("updated", gen)),
      h("p", null, t("howToAdd"), " ", DATA.repo ? h("a", { href: DATA.repo, target: "_blank", rel: "noopener" }, t("repo")) : null));
  }

  /* ---------- detail sheet ---------- */
  let lastFocus = null;
  function openDetail(id, refresh) {
    const c = CONFS.find((x) => x.id === id);
    if (!c) return;
    state.sheetConf = id;
    $("sheetTitle").textContent = c.title;
    $("sheetSub").textContent = c.description || "";
    const body = $("sheetBody");
    body.replaceChildren();

    const starred = state.stars.has(c.id);
    const starBtn = h("button", { type: "button", class: "btn starbtn", "aria-pressed": String(starred) }, `★ ${starred ? t("starred") : t("star")}`);
    starBtn.addEventListener("click", () => {
      state.stars.has(c.id) ? state.stars.delete(c.id) : state.stars.add(c.id);
      store.set("stars", [...state.stars]);
      render();
    });
    const badges = h("div", { class: "badges" }, starBtn,
      c.rankCcf !== "N" ? h("span", { class: "badge" }, `CCF-${c.rankCcf}`) : null,
      c.rank && c.rank.core ? h("span", { class: "badge" }, `CORE ${c.rank.core}`) : null,
      c.dirs.map((d) => (d in dirIdx ? h("span", { class: "badge dir", style: `--c:${dirColor(dirIdx[d])}` }, dirName(DIRS[dirIdx[d]], true)) : null)),
      c.dblp ? h("a", { class: "badge", href: `https://dblp.org/db/conf/${encodeURIComponent(c.dblp)}/`, target: "_blank", rel: "noopener" }, t("dblp")) : null);
    body.append(badges);

    const nowMs = Date.now();
    const today = todayStr();
    for (const ed of c.editions) {
      const facts = h("dl", { class: "facts" });
      const fact = (k, v) => { if (v) facts.append(h("dt", null, k), h("dd", null, v)); };
      if (ed.link && /^https?:\/\//i.test(ed.link)) fact(t("website"), h("a", { href: ed.link, target: "_blank", rel: "noopener" }, ed.link));
      fact(t("place"), ed.place);
      fact(t("dates"), ed.date);
      fact(t("tz"), ed.tz && tzText(ed.tz));
      const rows = ITEMS.filter((it) => it.c === c && it.ed === ed && it.kind !== "conf" && (state.showEst || !it.ev.est)).map((it) => {
        const past = it.inst.t < nowMs;
        return h("tr", { class: past ? "past" : null },
          h("td", null, h("span", { class: `kindtag k-${it.kind}${it.ev.est ? " est" : ""}`, style: `--c:${colorOf(c)}` }), t(it.kind),
            noteText(it) ? h("span", { class: "note" }, noteText(it),
              safeUrl(it.ev.ref) ? [" · ", h("a", { href: it.ev.ref, target: "_blank", rel: "noopener" }, t("labSource"))] : null) : null),
          h("td", { class: "mono" }, whenText(it)),
          h("td", { class: "mono" }, it.inst.zoned ? fmtLocal(it.inst.t) : t("noTime")),
          h("td", null, it.ev.est ? `${t("est")} · ${leftText(it.inst.t)}` : leftText(it.inst.t)));
      });
      if (ed.est && !rows.length) continue;
      const sec = h("section", { class: "edition" }, h("h3", null, `${c.title} ${ed.year || ""}`.trim()),
        ed.est ? h("p", { class: "note" }, t("estEdition", ed.year - 1)) : null, facts);
      if (rows.length) {
        sec.append(h("div", { class: "evtable" }, h("table", null,
          h("thead", null, h("tr", null, h("th", null, t("type")), h("th", null, t("published")), h("th", null, t("yourTime")), h("th", null, t("countdown")))),
          h("tbody", null, rows))));
      }
      const confItem = ITEMS.find((it) => it.c === c && it.ed === ed && it.kind === "conf");
      if (confItem && confItem.end < today) sec.append(h("p", { class: "note" }, `${t("conf")}: ${t("ended")}`));
      const fix = formUrl(c, ed.year);
      if (fix && !(confItem && confItem.end < today)) {
        sec.append(h("p", { class: "fixlink" }, h("a", { href: fix, target: "_blank", rel: "noopener" }, `+ ${t("fixEdition", `${c.title} ${ed.year || ""}`.trim())}`)));
      }
      body.append(sec);
    }
    if (!refresh) {
      if ($("sheet").hidden) lastFocus = document.activeElement;
      $("sheet").hidden = false;
      try { starBtn.focus({ preventScroll: true }); } catch { /* old browsers */ }
    }
  }
  function closeSheet() {
    $("sheet").hidden = true;
    state.sheetConf = null;
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch { /* element gone */ }
  }

  /* ---------- controls ---------- */
  $("sheet").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("sheet").hidden) closeSheet(); });
  $("prevBtn").addEventListener("click", () => { state.cursor.m--; if (state.cursor.m < 0) { state.cursor.m = 11; state.cursor.y--; } state.selectedDay = null; render(); });
  $("nextBtn").addEventListener("click", () => { state.cursor.m++; if (state.cursor.m > 11) { state.cursor.m = 0; state.cursor.y++; } state.selectedDay = null; render(); });
  $("todayBtn").addEventListener("click", () => { const n = new Date(); state.cursor = { y: n.getFullYear(), m: n.getMonth() }; state.selectedDay = null; render(); });
  const setView = (v) => { state.view = v; store.set("view", v); render(); };
  $("viewMonth").addEventListener("click", () => setView("month"));
  $("viewList").addEventListener("click", () => setView("list"));
  $("starOnly").addEventListener("click", () => { state.starOnly = !state.starOnly; store.set("starOnly", state.starOnly); render(); });
  let searchTimer = null;
  $("search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = e.target.value.trim(); render(); }, 150);
  });
  $("langBtn").addEventListener("click", () => { lang = lang === "zh" ? "en" : "zh"; store.set("lang", lang); render(); });
  $("themeBtn").addEventListener("click", () => {
    const next = themeNow() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
    applyTheme();
  });
  if (sysDark && sysDark.addEventListener) sysDark.addEventListener("change", applyTheme);
  setInterval(() => { if ($("sheet").hidden) render(); }, 60000);

  render();
  fetch("data/deadlines.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((json) => { prepare(json); render(); })
    .catch(() => { state.loadError = true; render(); });
})();
