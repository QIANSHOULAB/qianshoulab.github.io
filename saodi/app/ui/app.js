/* 戒尺僧（原扫地僧）界面。核心逻辑全在 Python（saodi/），这里只管长相和点哪里。
   字全在 strings.js（英文、中文两套）；语言照设置文件（hello().lang），左下角 EN / 中文 换，换了记住。 */
"use strict";

/* ---------------- 桥：桌面版走 pywebview，开发版走 HTTP ---------------- */
const api = new Proxy({}, {
  get: (_, name) => (...args) => {
    if (window.pywebview && window.pywebview.api && window.pywebview.api[name]) return window.pywebview.api[name](...args);
    return fetch("api/" + name, { method: "POST", body: JSON.stringify(args) })
      .then(r => r.json()).then(j => { if ("e" in j) throw new Error(j.e); return j.r; });
  },
});
const bridgeReady = new Promise(res => {
  if (window.SAODI_DEV) return res();  // 开发服务器才有 dev.js
  if (window.pywebview && window.pywebview.api && window.pywebview.api.hello) return res();
  window.addEventListener("pywebviewready", () => res(), { once: true });
});

/* ---------------- 小工具 ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtN = n => Number(n).toLocaleString(LANG === "zh" ? "zh-CN" : "en-US");
const base = p => (p || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;
const fmtSize = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : b >= 1024 ? Math.round(b / 1024) + " KB" : b + " B";
const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
const URL_RE = /https?:\/\/[^\s,，;；<>"'）)】]+/g;
const parseUrls = text => [...new Set((text.match(URL_RE) || []).map(u => u.replace(/[.。、]+$/, "")))];
const clone = o => JSON.parse(JSON.stringify(o));
const busyBtn = sel => { const b = $(sel); if (b) { b.disabled = true; b.innerHTML = '<span class="spin"></span>'; } };  // 只动按钮，不重画大表
const later = fn => requestAnimationFrame(() => setTimeout(fn, 0));  // 先让提示条画出来，再画大表
const sameDir = (a, b) => !!a && !!b && a.replace(/[\\/]+$/, "").toLowerCase() === b.replace(/[\\/]+$/, "").toLowerCase();

/* 线性图标：2px 笔画、圆头，跟 SF Symbols 一个路子 */
const sv = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  rename: sv('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  sort: sv('<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/><path d="M8 13h8M8 16h5"/>'),
  dl: sv('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>'),
  watch: sv('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  hist: sv('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>'),
  folder: sv('<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  x: sv('<path d="M6 6l12 12M18 6 6 18"/>'),
  eye: sv('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: sv('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.4-1.2"/>'),
  up: sv('<path d="m6 15 6-6 6 6"/>'),
  down: sv('<path d="m6 9 6 6 6-6"/>'),
  chev: sv('<path d="m9 6 6 6-6 6"/>', 'class="chev"'),
  check: sv('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="3"'),
  undo: sv('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  power: sv('<path d="M12 3v8"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/>'),
  bell: sv('<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4Z"/><path d="M10 21h4"/>'),
};

/* ---------------- 状态 ---------------- */
const RULE_DEFAULTS = {
  number: () => ({ type: "number", start: 1, step: 1, digits: 3, where: "start", sep: "-" }),
  replace: () => ({ type: "replace", find: "", to: "", regex: false, case: false }),
  date: () => ({ type: "date", source: "modified", fmt: "YYYY-MM-DD", where: "start", sep: " " }),
  taken: () => ({ type: "date", source: "taken", fmt: "YYYYMMDD_hhmmss", where: "name", sep: " ", fallback: false }),
  case: () => ({ type: "case", mode: "lower" }),
  trim: () => ({ type: "trim" }),
  insert: () => ({ type: "insert", text: "", where: "start" }),
  remove: () => ({ type: "remove", first: 1, last: 0 }),
  ext: () => ({ type: "ext", mode: "lower", to: "" }),
  music: () => ({ type: "tpl", tpl: t("tpl_music"), where: "name", sep: " " }),
  attr: () => ({ type: "tpl", tpl: t("tpl_attr"), where: "name", sep: " " }),
};
const S = {
  view: "rename", hello: null, cfg: {},
  folder: null, ferr: null,
  rules: [], ropts: { recursive: false, ext: "", kw: "", sort: "name" }, rfrom: null,
  preview: null, rdone: null, rloading: false,
  scheme: null, schemeKey: "p0", opreview: null, odone: null, open: {},
  watch: [], wAdding: false, seenLog: null,
  pile: null,
  dl: null, dlText: "", dlFolder: null, naming: { mode: "keep", text: "" },
  hist: [], update: null, busy: false,
};
const DOWNLOADS = () => (S.hello && S.hello.downloads) || "";
const dlWatch = () => S.watch.find(w => sameDir(w.folder, DOWNLOADS()));
const watchOf = f => S.watch.find(w => sameDir(w.folder, f));

/* ---------------- 控件 ---------------- */
let MENU = {}, menuSeq = 0;
const sw = (on, act, v = "", label = "") => `<button type="button" class="sw" role="switch" aria-checked="${!!on}" data-act="${act}" data-v="${esc(v)}" aria-label="${esc(label)}"></button>`;
function seg(key, cur, opts, i) {
  return `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-act="seg" data-key="${key}" ${i !== undefined ? `data-i="${i}"` : ""} data-v="${esc(v)}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join("")}</div>`;
}
/* 系统下拉不露脸：按钮 + 毛玻璃浮层菜单 */
function pick(opts, cur, set, cls = "") {
  const id = "m" + (++menuSeq);
  MENU[id] = { opts, cur, set };
  const lab = (opts.find(([v]) => String(v) === String(cur)) || opts[0] || ["", ""])[1];
  return `<button type="button" class="pick ${cls}" data-act="menu" data-v="${id}"><span>${esc(lab)}</span>${I.down}</button>`;
}
function openMenu(id, anchor) {
  closeMenu();
  const m = MENU[id];
  if (!m) return;
  const el = document.createElement("div");
  el.className = "menu";
  el.id = "menu";
  el.innerHTML = m.opts.map(([v, l]) => `<button type="button" data-mv="${esc(v)}"><i>${String(v) === String(m.cur) ? I.check.replace("<svg", '<svg width="14" height="14"') : ""}</i>${esc(l)}</button>`).join("");
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const h = el.offsetHeight, w = Math.max(el.offsetWidth, r.width);
  el.style.minWidth = r.width + "px";
  el.style.left = Math.min(r.left, innerWidth - w - 8) + "px";
  el.style.top = (r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4) + "px";
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-mv]");
    if (!b) return;
    e.stopPropagation();
    closeMenu();
    const opt = m.opts.find(([v]) => String(v) === b.dataset.mv);
    m.set(opt ? opt[0] : b.dataset.mv);
  });
  const first = el.querySelector("button");
  if (first) first.focus();
}
const closeMenu = () => { const m = $("#menu"); if (m) m.remove(); };

/* ---------------- 框架 ---------------- */
const NAV1 = [["rename", "nav_rename", I.rename], ["sort", "nav_sort", I.sort], ["dl", "nav_dl", I.dl]];
const NAV2 = [["watch", "nav_watch", I.watch], ["hist", "nav_hist", I.hist]];

function setLang(l) {
  LANG = STR[l] ? l : "en";
  document.documentElement.lang = t("html_lang");
  document.title = t("win_title");
  $("#dropT").textContent = t("drop_here");
}

function renderSide() {
  $("#appName").textContent = t("app");
  $("#tagline").textContent = t("tagline");
  const on = S.watch.filter(w => w.on);
  const today = on.reduce((a, w) => a + (w.today || 0), 0);
  const dling = S.dl ? S.dl.active : 0;
  const row = ([k, label, ico]) => {
    let end = "";
    if (k === "watch") end = `<span class="end">${today ? `<span class="tn">${t("side_today", { n: fmtN(today) })}</span>` : ""}<i class="dot ${on.length ? "on" : ""}"></i></span>`;
    if (k === "dl" && dling) end = `<span class="end"><span class="spin"></span><span class="tn">${dling}</span></span>`;
    return `<button type="button" data-act="nav" data-v="${k}" class="${S.view === k ? "on" : ""}">${ico}<span>${t(label)}</span>${end}</button>`;
  };
  $("#nav1").innerHTML = NAV1.map(row).join("");
  $("#nav2").innerHTML = NAV2.map(row).join("");
  const u = S.update;
  const note = u && u.notes ? (typeof u.notes === "string" ? u.notes : u.notes[LANG] || u.notes.en || "") : "";
  const upd = u && u.newer ? `<button type="button" class="upd" data-act="update" title="${esc(t("upd_go"))}"><b>${esc(t("upd_t", { v: u.version }))}</b>${note ? `<span>${esc(note)}</span>` : ""}</button>` : "";
  const lang = `<div class="lang" role="group" aria-label="${esc(t("lang_label"))}">${[["en", "EN", "en"], ["zh", "中文", "zh-CN"]].map(([v, l, hl]) =>
    `<button type="button" data-act="lang" data-v="${v}" lang="${hl}" aria-pressed="${LANG === v}">${l}</button>`).join("")}</div>`;
  $("#foot").innerHTML = `${upd}${lang}<div>${t("app")} ${S.hello ? S.hello.version : ""} · <a href="https://qianshoulab.github.io/" data-act="ext" data-v="https://qianshoulab.github.io/">${t("foot_home")}</a></div>
    <div>${t("foot_mail_pre")}<span class="sel">oilsongchengmin@gmail.com</span></div>`;
}

function render() {
  MENU = {};
  closeMenu();
  renderSide();
  const v = { rename: viewRename, sort: viewSort, watch: viewWatch, dl: viewDl, hist: viewHist }[S.view];
  $("#main").innerHTML = v();
  if (S.view === "rename" && S.folder) renderPreview();
  if (S.view === "sort" && S.folder) renderOPreview();
}

const fname = p => sameDir(p, DOWNLOADS()) ? t("downloads_name") : base(p);  // 「下载」在资源管理器里就叫「下载」
const LRM = "\u200e";  // 路径从左边省略（rtl 小技巧）时，别让开头的斜杠跑到末尾
const chip = p => `<div class="chip" title="${esc(p)}">${I.folder}<b>${esc(fname(p))}</b><span class="p">${LRM}${esc(p)}${LRM}</span></div>`;
function head(title, withFolder) {
  const fc = withFolder && S.folder ? `${chip(S.folder)}<button type="button" class="btn txt" data-act="pick">${t("change")}</button><button type="button" class="btn txt" data-act="openf">${t("open_folder")}</button>` : "";
  return `<div class="head"><h1>${title}</h1>${fc}<span class="sp"></span></div>${introBar()}`;
}

/* 第一次开头那一句：「下载」盯上了；一下能关；旧的一下能分（能整批撤销） */
function introBar() {
  const w = dlWatch();
  if (!S.cfg.intro || !w) return "";
  const n = S.pile ? S.pile.n : 0;
  return `<div class="intro" id="intro"><img src="icon.svg" alt=""><div class="grow"><b>${t("intro_t")}</b><span>${t("intro_s")}</span></div>
    ${n ? `<button type="button" class="btn" data-act="pilerun">${t("intro_pile", { n: fmtN(n) })}</button>` : ""}
    <span class="onoff">${t("intro_on")}${sw(w.on, "wset", w.folder, t("intro_on"))}</span>
    <button type="button" class="btn quiet" data-act="introok">${t("intro_ok")}</button></div>`;
}

function picker(kind) {
  const rec = (S.cfg.recent || []).slice(0, 4);
  return `<div class="empty"><div class="pick-in">
    <div class="ico">${I.folder}</div><h2>${t("pick_title")}</h2><p>${t(kind === "sort" ? "pick_sub_sort" : "pick_sub_rename")}</p>
    <div class="acts"><button type="button" class="btn pri lg" data-act="pick">${t("pick_btn")}</button>
    <button type="button" class="btn txt" data-act="demo">${t("demo")}</button></div>
    <input class="inp" id="pathIn" placeholder="${esc(t("pick_paste"))}" spellcheck="false" value="${esc(S.ferr || "")}">
    ${S.ferr ? `<div class="err-line">${t("nofolder")}<span>${t("nofolder_fix")}</span></div>` : ""}
    ${rec.length ? `<div class="group-h" style="margin-top:32px">${t("recent")}</div><div class="group" style="margin-top:0">${rec.map(p => `<button type="button" class="row" data-act="usefolder" data-v="${esc(p)}" style="--inset:56px"><span class="ic">${I.folder}</span><span class="grow"><span class="t" style="display:block">${esc(fname(p))}</span><span class="s" style="display:block;direction:rtl;text-align:left">${LRM}${esc(p)}${LRM}</span></span></button>`).join("")}</div>` : ""}
  </div></div>`;
}

/* ---------------- 改名 ---------------- */
const RULE_TITLE = { number: "rule_number", replace: "rule_replace", date: "rule_date", case: "rule_case", trim: "rule_trim", insert: "rule_insert", remove: "rule_remove", ext: "rule_ext", tpl: "rule_tpl" };
const QUICK = [["number", "q_number"], ["replace", "q_replace"], ["date", "q_date"], ["taken", "q_taken"], ["case", "q_case"], ["trim", "q_trim"], ["insert", "q_insert"], ["remove", "q_remove"], ["ext", "q_ext"], ["music", "q_music"], ["attr", "q_attr"]];
const recipeName = rules => rules.map(r => r.type === "date" && r.source === "taken" ? t("q_taken") : t(RULE_TITLE[r.type] || r.type) + (r.type === "replace" && r.find ? ` ${r.find}→${r.to || "∅"}` : r.type === "insert" && r.text ? ` ${r.text}` : "")).join(" + ");

function viewRename() {
  if (!S.folder) return head(t("r_title")) + picker("rename");
  const recent = (S.cfg.rename_recent || []).filter(e => JSON.stringify(e.rules) !== JSON.stringify(S.rules));
  return head(t("r_title"), true) + `<div class="body">
    <div class="pane-l"><div class="scroll">
      ${S.rfrom === "last" && S.rules.length ? `<div class="lbl">${t("r_last")}<span class="sp"></span><button type="button" class="btn txt" data-act="rclear">${t("r_clear")}</button></div>` : ""}
      <div id="rules">${rulesHtml()}</div>
      <div class="lbl" style="margin-top:${S.rules.length ? 12 : 0}px">${t("r_add")}</div>
      <div class="quick">${QUICK.map(([k, l]) => `<button type="button" data-act="addrule" data-v="${k}">${I.plus}${t(l)}</button>`).join("")}</div>
      <div class="lbl">${t("opt_title")}</div>
      <div class="group">
        <div class="row"><span class="grow">${t("opt_sub")}</span>${sw(S.ropts.recursive, "ropt", "recursive", t("opt_sub"))}</div>
        <div class="row"><span style="white-space:nowrap">${t("opt_ext")}</span><input class="inp" style="flex:1" data-opt="ext" value="${esc(S.ropts.ext)}" placeholder="${esc(t("opt_ext_ph"))}" spellcheck="false"></div>
        <div class="row"><span style="white-space:nowrap">${t("opt_kw")}</span><input class="inp" style="flex:1" data-opt="kw" value="${esc(S.ropts.kw)}" placeholder="${esc(t("opt_kw_ph"))}" spellcheck="false"></div>
        <div class="row"><span class="grow">${t("opt_sort")}</span>${seg("ropt-sort", S.ropts.sort, [["name", t("sort_name")], ["mtime", t("sort_mtime")], ["taken", t("sort_taken")]])}</div>
      </div>
      ${recent.length ? `<div class="lbl" style="margin-top:32px">${t("r_recent")}</div><div class="recipes">${recent.map(e => {
        const i = S.cfg.rename_recent.indexOf(e);
        return `<span class="rc"><button type="button" data-act="recipe" data-v="${i}" title="${esc(recipeName(e.rules))}">${esc(recipeName(e.rules))}</button><button type="button" class="x" data-act="recipedel" data-v="${i}" aria-label="${t("rule_del")}">${I.x.replace("<svg", '<svg width="12" height="12"')}</button></span>`;
      }).join("")}</div>` : ""}
    </div></div>
    <div class="pane-r" id="rpane"></div>
  </div>`;
}

const fin = (i, k, ph = "", cls = "grow") => `<input class="inp ${cls}" data-i="${i}" data-k="${k}" value="${esc(S.rules[i][k])}" placeholder="${esc(ph)}" spellcheck="false">`;
const fpick = (i, k, opts) => pick(opts, S.rules[i][k], v => { S.rules[i][k] = v; changedRules(); });
const fsw = (i, k, l) => `<div class="f sw-row"><span>${l}</span>${sw(S.rules[i][k], "rsw", `${i}:${k}`, l)}</div>`;
const WHERE = () => [["start", t("at_start")], ["end", t("at_end")]];

function rulesHtml() {
  if (!S.rules.length) return `<div class="hint" style="margin-bottom:24px">${t("rules_empty")}</div>`;
  return S.rules.map((r, i) => {
    let body = "";
    if (r.type === "replace") body = `<div class="f"><span class="k">${t("f_find")}</span>${fin(i, "find")}</div><div class="f"><span class="k">${t("f_to")}</span>${fin(i, "to")}</div>
      ${fsw(i, "regex", t("f_regex"))}${fsw(i, "case", t("f_matchcase"))}`;
    if (r.type === "number") body = `<div class="f"><span class="k">${t("f_start")}</span>${fin(i, "start", "", "num")}<span class="k">${t("f_step")}</span>${fin(i, "step", "", "num")}</div>
      <div class="f"><span class="k">${t("f_digits")}</span>${fin(i, "digits", "", "num")}${r.where !== "name" ? `<span class="k">${t("f_sep")}</span>${fin(i, "sep", "", "num")}` : ""}</div>
      <div class="f"><span class="k">${t("f_where")}</span>${seg("where", r.where, [...WHERE(), ["name", t("at_name")]], i)}</div>`;
    if (r.type === "date") body = `<div class="f"><span class="k">${t("f_source")}</span>${fpick(i, "source", [["modified", t("s_modified")], ["created", t("s_created")], ["taken", t("s_taken")], ["today", t("s_today")]])}</div>
      <div class="f"><span class="k">${t("f_fmt")}</span>${fpick(i, "fmt", (S.hello?.date_formats || ["YYYY-MM-DD"]).map(f => [f, f]))}</div>
      <div class="f"><span class="k">${t("f_where")}</span>${seg("where", r.where, [...WHERE(), ["name", t("at_name")]], i)}</div>
      ${r.source === "taken" ? fsw(i, "fallback", t("f_fallback")) : ""}`;
    if (r.type === "case") body = `<div class="f">${fpick(i, "mode", [["lower", t("c_lower")], ["upper", t("c_upper")], ["title", t("c_title")], ["sentence", t("c_sentence")]])}</div>`;
    if (r.type === "insert") body = `<div class="f"><span class="k">${t("f_text")}</span>${fin(i, "text")}</div><div class="f"><span class="k">${t("f_where")}</span>${seg("where", r.where, WHERE(), i)}</div>`;
    if (r.type === "remove") body = `<div class="f"><span class="k">${t("f_first")}</span>${fin(i, "first", "", "num")}<span class="k">${t("f_chars")}</span></div><div class="f"><span class="k">${t("f_last")}</span>${fin(i, "last", "", "num")}<span class="k">${t("f_chars")}</span></div>`;
    if (r.type === "tpl") body = `<div class="f">${fin(i, "tpl", t("tpl_music"))}</div>
      <div class="vars">${t("tpl_vars").split(",").map(v => `<button type="button" data-act="tplvar" data-i="${i}" data-v="${v}">${v}</button>`).join("")}</div>
      <div class="f"><span class="k">${t("f_where")}</span>${seg("where", r.where, [["name", t("at_name")], ...WHERE()], i)}</div>`;
    if (r.type === "ext") body = `<div class="f">${seg("mode", r.mode, [["lower", t("e_lower")], ["upper", t("e_upper")], ["set", t("e_set")]], i)}${r.mode === "set" ? fin(i, "to", ".jpg", "num") : ""}</div>`;
    return `<div class="rule ${r.off ? "off" : ""}"><div class="rule-h"><span class="n">${i + 1}</span><b>${r.type === "date" && r.source === "taken" ? t("q_taken") : t(RULE_TITLE[r.type])}</b><span class="sp"></span>
      <button type="button" class="ib" data-act="toggle" data-i="${i}" title="${r.off ? t("rule_off") : t("rule_on")}">${r.off ? I.eyeOff : I.eye}</button>
      ${i ? `<button type="button" class="ib" data-act="ruleup" data-i="${i}" title="${t("rule_up")}">${I.up}</button>` : ""}
      <button type="button" class="ib" data-act="delrule" data-i="${i}" title="${t("rule_del")}">${I.x}</button></div>${body}</div>`;
  }).join("");
}

let pvSeq = 0, slowH;
const refreshPreview = debounce(async () => {
  if (!S.folder) return;
  const seq = ++pvSeq;
  clearTimeout(slowH);
  slowH = setTimeout(() => { if (seq === pvSeq) { S.rloading = true; if (S.view === "rename") renderPreview(); } }, 400);
  try {
    const p = await api.rename_preview(S.folder, S.rules, S.ropts);
    if (seq !== pvSeq) return;
    S.preview = p;
  } catch (e) { if (seq === pvSeq) S.preview = null; }
  clearTimeout(slowH);
  S.rloading = false;
  if (S.view === "rename") renderPreview();
}, 120);
function changedRules() { S.rdone = null; render(); refreshPreview(); }

const NOTE_TAG = { nometa: ["doubt", "n_nometa"], fixed: ["doubt", "n_fixed"], notaken: ["doubt", "n_notaken"], notaken_skip: ["", "n_notaken_skip"], empty: ["bad", "n_empty"], badregex: ["bad", "n_badregex"] };
const LIM = 1500;

function failBox(failed, retryAct) {
  if (!failed || !failed.length) return "";
  const code = failed[0].err || "oserror";
  return `<div class="fail"><span class="ic">!</span><div class="grow"><b>${t("fail_head", { n: fmtN(failed.length) })}${t("err_" + code)}</b><span>${t("fix_" + code)}</span>
    <ul>${failed.slice(0, 4).map(f => `<li class="sel">${esc(f.name)}${f.err !== code ? " · " + t("err_" + f.err) : ""}</li>`).join("")}${failed.length > 4 ? `<li>… +${failed.length - 4}</li>` : ""}</ul></div>
    ${retryAct ? `<button type="button" class="btn pri" data-act="${retryAct}">${t("retry")}</button>` : ""}</div>`;
}

function renderPreview() {
  const pane = $("#rpane");
  if (!pane) return;
  if (S.rdone) {  // 改完：一个完成的勾 + 改了啥 + 撤销
    const r = S.rdone, ok = r.items.filter(x => x.ok);
    pane.innerHTML = `<div class="done-h">${r.done ? `<span class="ok">${I.check}</span>` : ""}<div class="grow"><b>${t("done_rename", { n: fmtN(r.done) })}</b><span>${esc(base(S.folder))}</span></div>
      ${r.done ? `<button type="button" class="btn" data-act="undoall" data-v="${esc(r.batch)}">${I.undo}${t("undo")}</button>` : ""}</div>
      ${failBox(r.failed, "retry")}
      <div class="tbl"><div class="tr th"><span>${t("col_old")}</span><span></span><span>${t("col_new")}</span></div>
      ${r.items.slice(0, LIM).map(it => `<div class="tr ${it.ok ? "" : "fail"}"><span class="o sel" title="${esc(it.old)}">${it.rel ? `<i>${esc(it.rel)}/</i>` : ""}${esc(it.old)}</span><span class="ar">→</span><span class="w"><span class="nm sel" title="${esc(it.new)}">${esc(it.new)}</span>${it.ok ? "" : `<span class="tag bad">${t("err_" + (it.err || "oserror"))}</span>`}</span></div>`).join("")}</div>`;
    return;
  }
  const p = S.preview;
  if (!p) {
    pane.innerHTML = `<div class="stat"></div><div class="loading"><span class="spin"></span>${t("loading0")}</div>`;
    return;
  }
  const stat = `${t("stat", { total: `<b class="tn">${fmtN(p.total)}</b>`, changed: `<b class="tn">${fmtN(p.changed)}</b>` })}${p.bumped ? `<span class="warn">${t("stat_bump", { n: fmtN(p.bumped) })}</span>` : ""}${p.errors ? `<span class="bad">${t("stat_err", { n: fmtN(p.errors) })}</span>` : ""}${p.notaken ? t("stat_notaken", { n: fmtN(p.notaken) }) : ""}`;
  const rows = p.items.slice(0, LIM).map(it => {
    const tags = [];
    if (it.status === "bumped") tags.push(`<span class="tag doubt" title="${t("n_bumped")}">${t("n_bumped")}</span>`);
    for (const n of it.notes || []) if (NOTE_TAG[n]) tags.push(`<span class="tag ${NOTE_TAG[n][0]}" title="${t(NOTE_TAG[n][1])}">${t(NOTE_TAG[n][1])}</span>`);
    const ch = it.status === "ok" || it.status === "bumped";
    return `<div class="tr ${ch ? "ch" : "same"}"><span class="o sel" title="${esc(it.old)}">${it.rel ? `<i>${esc(it.rel)}/</i>` : ""}${esc(it.old)}</span><span class="ar">→</span><span class="w"><span class="nm sel" title="${esc(it.new)}">${esc(it.new)}</span>${tags.join("")}</span></div>`;
  }).join("");
  const n = p.changed;
  pane.innerHTML = `<div class="stat">${S.rloading ? `<span class="spin"></span>` : ""}<span>${stat}</span></div>
    <div class="tbl" id="tbl"><div class="tr th"><span>${t("col_old")}</span><span></span><span>${t("col_new")}</span></div>${rows}${p.items.length > LIM ? `<div class="more">${t("more_rows", { n: fmtN(p.items.length - LIM) })}</div>` : ""}</div>
    <div class="bar"><button type="button" class="btn quiet" data-act="undo">${I.undo}${t("undo")}</button><span class="sp"></span>
      <button type="button" class="btn pri lg" id="runBtn" data-act="runrename" ${!n || S.busy ? "disabled" : ""}>${S.busy ? '<span class="spin"></span>' : n ? t("run_rename", { n: fmtN(n) }) : t("nothing")}</button></div>`;
}

/* ---------------- 分文件夹 ---------------- */
const PRESET_DESC = ["sd_type", "sd_month", "sd_taken"];
function schemeList() {
  const pre = (S.hello?.presets || []).map((p, i) => ["p" + i, p]);
  const saved = (S.cfg.schemes || []).map(s => ["s:" + s.name, s]);
  return [...pre, ...saved];
}
function schemeByKey(k) {
  if (k === "custom") return S.scheme && S.schemeKey === "custom" ? S.scheme : { name: "", rules: [{ by: "kw", kw: "", to: "" }], rest: "" };
  const f = schemeList().find(([kk]) => kk === k);
  return f ? clone(f[1]) : clone(S.hello.presets[0]);
}
function keyOfScheme(sc) {
  const j = JSON.stringify({ ...sc, action: undefined, unzip: undefined });
  const hit = schemeList().find(([, s]) => JSON.stringify({ ...s, action: undefined, unzip: undefined }) === j);
  return hit ? hit[0] : "custom";
}
const descOf = (k, s) => k.startsWith("p") ? t(PRESET_DESC[+k.slice(1)] || "sd_type") : (s.rules || []).map(r => r.by === "kw" || r.by === "content" ? `“${r.kw}”→${r.to || r.kw}` : r.by === "ext" ? `.${r.ext}→${r.to || r.ext}` : r.by === "date" ? r.fmt : r.by === "size" ? `>${r.mb}MB` : t("by_type")).join(t("sep_clause"));

function viewSort() {
  if (!S.folder) return head(t("s_title")) + picker("sort");
  if (!S.scheme) S.scheme = schemeByKey(S.schemeKey);
  const rows = schemeList().map(([k, s]) => `<button type="button" class="row" data-act="scheme" data-v="${esc(k)}"><span class="grow"><span class="t" style="display:block">${esc(s.name)}</span><span class="s" style="display:block">${esc(descOf(k, s))}</span></span><span class="chk">${S.schemeKey === k ? I.check.replace("<svg", '<svg width="18" height="18"') : ""}</span></button>`).join("")
    + `<button type="button" class="row" data-act="scheme" data-v="custom"><span class="grow"><span class="t" style="display:block">${t("scheme_custom")}</span><span class="s" style="display:block">${t("scheme_custom_d")}</span></span><span class="chk">${S.schemeKey === "custom" ? I.check.replace("<svg", '<svg width="18" height="18"') : ""}</span></button>`;
  const hasTaken = (S.scheme.rules || []).some(r => r.by === "date" && r.source === "taken");
  const w = watchOf(S.folder);
  return head(t("s_title"), true) + `<div class="body">
    <div class="pane-l"><div class="scroll">
      <div class="lbl">${t("s_scheme")}</div>
      <div class="group">${rows}</div>
      ${S.schemeKey === "custom" || S.schemeKey.startsWith("s:") ? `<div style="margin-top:12px">${schemeEditor()}</div>` : ""}
      <div class="lbl" style="margin-top:32px">${t("s_how")}</div>
      <div style="margin:0 0 12px">${seg("action", S.scheme.action === "copy" ? "copy" : "move", [["move", t("act_move")], ["copy", t("act_copy")]])}</div>
      <div class="group">
        <div class="row"><span class="grow">${t("act_unzip")}</span>${sw(S.scheme.unzip, "ssw", "unzip", t("act_unzip"))}</div>
        ${hasTaken ? `<div class="row"><span class="grow">${t("f_fallback")}</span>${sw((S.scheme.rules || []).some(r => r.by === "date" && r.source === "taken" && r.fallback), "ssw", "fallback", t("f_fallback"))}</div>` : ""}
        <div class="row"><span class="grow"><span class="t" style="display:block">${t("s_watch")}</span>${w && w.on ? `<span class="s" style="display:block">${t("s_watch_on")}</span>` : ""}</span>${sw(w && w.on, "swatch", S.folder, t("s_watch"))}</div>
      </div>
    </div></div>
    <div class="pane-r" id="opane"></div>
  </div>`;
}

function schemeEditor() {
  const s = S.scheme;
  const byOpts = [["kw", t("by_kw")], ["content", t("by_content")], ["ext", t("by_ext")], ["type", t("by_type")], ["date", t("by_date")], ["size", t("by_size")]];
  const rules = s.rules.map((r, i) => {
    const set = k => v => { r[k] = v; if (k === "by" && v === "date") { r.fmt = r.fmt || "YYYY/MM"; r.source = r.source || "modified"; } if (k === "by" && v === "size") r.mb = r.mb || 100; schemeChanged(); };
    const inp = (k, ph, wd) => `<input class="inp" style="${wd ? "width:" + wd : "flex:1"}" data-si="${i}" data-sk="${k}" value="${esc(r[k] ?? "")}" placeholder="${esc(ph)}" spellcheck="false">`;
    let mid = "";
    if (r.by === "kw") mid = inp("kw", t("ph_kw"));
    if (r.by === "content") mid = inp("kw", t("ph_content"));
    if (r.by === "ext") mid = inp("ext", t("ph_ext"));
    if (r.by === "size") mid = `${inp("mb", "100", "72px")}<span class="k">${t("mb")}</span>`;
    if (r.by === "date") mid = pick([["modified", t("s_modified")], ["taken", t("s_taken")]], r.source || "modified", set("source")) + pick((S.hello.dir_formats || []).map(f => [f, f]), r.fmt || "YYYY/MM", set("fmt"));
    const to = (r.by === "kw" || r.by === "content" || r.by === "ext" || r.by === "size") ? `<div class="f"><span class="k">${t("to_folder")}</span>${inp("to", r.by === "size" ? t("big") : t("ph_folder"))}</div>` : "";
    return `<div class="rule"><div class="f" style="margin-top:0">${pick(byOpts, r.by, set("by"))}${mid}<button type="button" class="ib" data-act="sdel" data-i="${i}" aria-label="${t("rule_del")}">${I.x}</button></div>${to}</div>`;
  }).join("");
  const restOn = !!s.rest;
  return `${rules}<button type="button" class="btn txt" data-act="sadd">${I.plus}${t("add_rule")}</button>
    <div class="f" style="margin-top:12px"><span class="k">${t("rest")}</span>${seg("rest", restOn ? "to" : "stay", [["stay", t("rest_stay")], ["to", t("rest_to")]])}
      ${restOn ? `<input class="inp" style="width:96px" data-sk="rest" value="${esc(s.rest)}">` : ""}</div>`;
}

let opSeq = 0;
const refreshOPreview = debounce(async () => {
  if (!S.folder || !S.scheme) return;
  const seq = ++opSeq;
  try { const p = await api.organize_preview(S.folder, S.scheme); if (seq === opSeq) S.opreview = p; } catch (e) { if (seq === opSeq) S.opreview = null; }
  if (S.view === "sort") renderOPreview();
}, 120);
function schemeChanged() {
  S.odone = null;
  const w = watchOf(S.folder);
  if (w && w.on) api.watch_scheme(S.folder, S.scheme).then(ws => { S.watch = ws; });
  render(); refreshOPreview();
}

const folderSvg = muted => `<svg class="fd" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${muted ? 'style="color:var(--fg-3)"' : ""}><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/></svg>`;
function groupsHtml(items, done) {
  const groups = {};
  for (const it of items) (groups[it.op === "extract" ? "\u0001" : it.status === "same" ? "\u0000" : it.to || "."] ||= []).push(it);
  const unz = groups["\u0001"] || []; delete groups["\u0001"];
  const stay = groups["\u0000"] || []; delete groups["\u0000"];
  const keys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  const grp = (k, list, muted) => {
    const name = muted ? t("stay_n", { n: fmtN(list.length) }) : k === "\u0001" ? t("unz_grp") : k === "." ? t("inplace") : k;
    return `<div class="grp ${S.open[k] ? "open" : ""}"><button type="button" class="grp-h" data-act="grp" data-v="${esc(k)}">${I.chev}${folderSvg(muted)}<b>${esc(name)}</b><span class="c tn">${fmtN(list.length)}</span></button>
      <div class="grp-b">${list.slice(0, 300).map(it => `<div class="${it.status === "bumped" ? "bump" : ""} ${done && !it.ok ? "bad" : ""} sel">${esc(it.old)}${it.new !== it.old ? " → " + esc(it.new) : ""}${done && !it.ok ? " · " + t("err_" + (it.err || "oserror")) : ""}</div>`).join("")}${list.length > 300 ? `<div>… +${fmtN(list.length - 300)}</div>` : ""}</div></div>`;
  };
  return { html: (unz.length ? grp("\u0001", unz) : "") + keys.map(k => grp(k, groups[k])).join("") + (stay.length ? grp("\u0000", stay, true) : ""), n: keys.length, unz: unz.length };
}

function renderOPreview() {
  const pane = $("#opane");
  if (!pane) return;
  if (S.odone) {
    const r = S.odone;
    const moved = r.items.filter(it => it.ok);  // 没动成的只在出错那块说，不算进各堆
    const g = groupsHtml(moved, true);
    const cnt = {};
    for (const it of moved) if (it.op !== "extract") cnt[it.to || "."] = (cnt[it.to || "."] || 0) + 1;
    const sum = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k === "." ? t("inplace") : k} ${fmtN(n)}`).join(" · ");
    const n = r.done - (r.extracted || 0);
    const head1 = r.copied ? t("done_copy", { n: fmtN(r.copied) }) : t("done_sort", { n: fmtN(n) });
    pane.innerHTML = `<div class="done-h">${r.done ? `<span class="ok">${I.check}</span>` : ""}<div class="grow"><b>${head1}${r.extracted ? " · " + t("done_unz", { n: r.extracted }) : ""}</b><span>${esc(sum)}</span></div>
      ${r.done ? `<button type="button" class="btn" data-act="undoall" data-v="${esc(r.batch)}">${I.undo}${t("undo")}</button>` : ""}</div>
      ${failBox(r.failed, "retry")}
      <div class="tbl">${g.html}</div>`;
    return;
  }
  const p = S.opreview;
  if (!p) { pane.innerHTML = `<div class="stat"></div><div class="loading"><span class="spin"></span>${t("loading0")}</div>`; return; }
  const g = groupsHtml(p.items, false);
  const n = p.changed + (p.extract || 0);
  pane.innerHTML = `<div class="stat"><span>${t(p.action === "copy" ? "stat_copy" : "stat_move", { total: `<b class="tn">${fmtN(p.total)}</b>`, changed: `<b class="tn">${fmtN(p.changed)}</b>` })}${t("sep_clause")}${t("groups", { n: g.n })}${g.unz ? t("sep_clause") + t("unz_n", { n: g.unz }) : ""}${p.bumped ? `<span class="warn">${t("stat_bump", { n: p.bumped })}</span>` : ""}</span></div>
    <div class="tbl" id="otbl">${g.html || `<div class="nil">${t("nothing")}</div>`}</div>
    <div class="bar"><button type="button" class="btn quiet" data-act="undo">${I.undo}${t("undo")}</button><span class="sp"></span>
      <button type="button" class="btn pri lg" id="orunBtn" data-act="runsort" ${!n || S.busy ? "disabled" : ""}>${S.busy ? '<span class="spin"></span>' : n ? t(p.action === "copy" ? "run_copy" : "run_sort", { n: fmtN(n) }) : t("nothing")}</button></div>`;
}

/* ---------------- 盯着 ---------------- */
function viewWatch() {
  const schemeOpts = schemeList().map(([k, s]) => [k, s.name]);
  const list = S.watch.map(w => {
    const k = keyOfScheme(w.scheme);
    const opts = k === "custom" ? [...schemeOpts, ["custom", w.scheme.name || t("scheme_custom")]] : schemeOpts;
    const sub = !w.exists ? t("w_gone") : w.on ? `${esc(w.scheme.name || t("scheme_custom"))} · ${w.today ? t("w_today", { n: fmtN(w.today) }) : t("w_today0")}` : t("w_off");
    return `<div class="row" style="--inset:56px"><span class="ic">${I.folder}</span><span class="grow"><span class="t sel" style="display:block" title="${esc(w.folder)}">${esc(fname(w.folder))}</span><span class="s" style="display:block">${sub}</span></span>
      ${pick(opts, k, v => { if (v !== "custom") api.watch_scheme(w.folder, schemeByKey(v)).then(ws => { S.watch = ws; render(); }); })}
      ${sw(w.on, "wset", w.folder, w.name)}
      ${sameDir(w.folder, DOWNLOADS()) ? "" : `<button type="button" class="ib" data-act="wremove" data-v="${esc(w.folder)}" title="${t("w_remove")}">${I.x}</button>`}</div>`;
  }).join("");
  const add = S.wAdding
    ? `<div class="row" style="--inset:56px"><span class="ic">${I.plus}</span><input class="inp" id="wPath" placeholder="${esc(t("w_add_ph"))}" spellcheck="false"></div>`
    : `<button type="button" class="row" data-act="wadd" style="--inset:56px"><span class="ic">${I.plus}</span><span class="grow" style="color:var(--link)">${t("w_add")}</span></button>`;
  const auto = S.hello?.autostart || {};
  const logs = [];
  for (const w of S.watch) for (const r of w.log || []) logs.push({ ...r, folder: w.folder });
  logs.sort((a, b) => (b.ts || b.time || "").localeCompare(a.ts || a.time || ""));
  const seenBatch = new Set(), perBatch = {};
  for (const r of logs) if (r.batch && r.ok) perBatch[r.batch] = (perBatch[r.batch] || 0) + 1;
  const logRows = logs.slice(0, 40).map(r => {
    const first = r.batch && !seenBatch.has(r.batch);
    if (r.batch) seenBatch.add(r.batch);
    const to = r.ok ? `${r.op === "extract" ? t("w_unz") : r.op === "copy" ? t("w_copy") : ""}→ ${esc(r.to || r.new)}` : t("w_busy");
    const end = !r.ok ? "" : r.undone ? `<span>${t("w_undone")}</span>` : first ? `<button type="button" class="btn txt" data-act="undoid" data-v="${esc(r.batch)}">${perBatch[r.batch] > 1 ? t("undo_n", { n: perBatch[r.batch] }) : t("undo")}</button>` : "";
    return `<div class="row"><span class="tn" style="color:var(--fg-3);font-size:13px;width:64px;flex:none">${esc(r.time || "")}</span><span class="grow"><span class="t sel" style="display:block;${r.undone ? "color:var(--fg-3)" : ""}">${esc(r.old || r.err || "")}</span><span class="s" style="display:block">${to}</span></span><span class="end">${end}</span></div>`;
  }).join("");
  return head(t("w_title")) + `<div class="page"><div class="page-in">
    <div class="group">${list}${add}</div>
    <div class="group gap">
      <div class="row" style="--inset:56px"><span class="ic">${I.power}</span><span class="grow"><span class="t" style="display:block">${t("w_auto")}</span><span class="s" style="display:block">${t("w_auto_s")}</span></span>${sw(auto.on, "autostart", "", t("w_auto"))}</div>
      <div class="row" style="--inset:56px"><span class="ic">${I.bell}</span><span class="grow"><span class="t" style="display:block">${t("w_notify")}</span><span class="s" style="display:block">${t("w_notify_s")}</span></span>${sw(S.cfg.notify !== false, "notify", "", t("w_notify"))}</div>
    </div>
    <div class="group-h" style="margin-top:32px">${t("w_log")}</div>
    <div class="group">${logRows || `<div class="nil">${t("w_log_empty")}</div>`}</div>
  </div></div>`;
}

/* ---------------- 下载 ---------------- */
function dlErr(e) {
  if (!e) return t("st_failed");
  if (/\b404\b/.test(e)) return t("st_failed") + " · 404";
  if (/\b403\b/.test(e)) return t("st_failed") + " · 403";
  return t("st_failed");
}
function viewDl() {
  const n = parseUrls(S.dlText).length;
  const folder = S.dlFolder || DOWNLOADS();
  const st = S.dl;
  const list = st && st.items.length ? `<div class="group-h" style="margin-top:32px;display:flex;align-items:center;gap:8px"><span class="tn">${t("d_stat", { done: st.done, total: st.items.length })}${st.failed ? t("d_failed_n", { n: st.failed }) : ""}</span><span style="flex:1"></span>
      ${st.failed && !st.active ? `<button type="button" class="btn txt" data-act="dretry">${t("d_retry")}</button>` : ""}
      ${st.active ? `<button type="button" class="btn txt" data-act="dcancel">${t("d_cancel")}</button>` : `<button type="button" class="btn txt" data-act="dclear">${t("d_clear")}</button>`}
      <button type="button" class="btn txt" data-act="openpath" data-v="${esc(st.folder)}">${t("open_folder")}</button></div>
    <div class="group">${st.items.map(it => {
      const pct = it.total ? Math.min(100, it.got / it.total * 100) : (it.state === "done" ? 100 : 0);
      const lab = it.state === "retry" ? t("st_retry", { n: it.tries }) : it.state === "failed" ? dlErr(it.err) : t("st_" + it.state);
      const size = it.total ? `${fmtSize(it.got)} / ${fmtSize(it.total)}` : it.got ? fmtSize(it.got) : "";
      return `<div class="row dl"><div class="nm sel">${esc(it.name || base(it.url.split("?")[0]) || it.url)}<small title="${esc(it.url)}">${esc(it.url)}</small></div>
        <div><div class="pb ${it.state}"><i style="width:${pct}%"></i></div><div class="size tn">${size}</div></div>
        <div class="st ${it.state}" title="${esc(it.err)}">${lab}</div></div>`;
    }).join("")}</div>
    ${st.failed && !st.active ? `<p class="found">${t("d_fix")}</p>` : ""}` : "";
  const top = st && st.items.length ? list.replace('style="margin-top:32px;', 'style="margin-top:0;') + '<div style="height:32px"></div>' : "";
  return head(t("d_title")) + `<div class="page"><div class="page-in">${top}
    <textarea class="urls ${top ? "small" : ""}" id="urls" placeholder="${esc(t("d_ph"))}" spellcheck="false">${esc(S.dlText)}</textarea>
    <div class="found" id="found">${n ? t("d_found", { n: `<b class="tn">${n}</b>` }) : t("d_found0")}</div>
    <div class="group" style="margin-top:24px">
      <div class="row"><span style="width:64px;flex:none">${t("d_folder")}</span><span class="grow" style="display:flex">${chip(folder)}</span><button type="button" class="btn txt" data-act="dpick">${t("change")}</button></div>
      <div class="row"><span style="width:64px;flex:none">${t("d_naming")}</span><span class="grow" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${seg("naming", S.naming.mode, [["keep", t("nm_keep")], ["number", t("nm_number")], ["custom", t("nm_custom")]])}
        ${S.naming.mode === "custom" ? `<input class="inp" style="width:120px" id="nmText" value="${esc(S.naming.text)}" placeholder="${t("nm_custom_ph")}"><span style="color:var(--fg-3);font-size:13px">-01, -02 …</span>` : ""}</span></div>
    </div>
    <div class="go-row"><button type="button" class="btn pri lg" id="dlGo" data-act="dgo" ${n ? "" : "disabled"}>${n ? t("d_go", { n }) : t("d_go0")}</button></div>
    </div></div>`;
}

/* ---------------- 记录 ---------------- */
function viewHist() {
  const rows = S.hist.map(h => `<div class="row"><span class="k-chip">${t("k_" + h.kind)}</span><span class="grow"><span class="t" style="display:block">${esc(h.label || base(h.folder) || "")}</span><span class="s tn" style="display:block">${esc(h.time.replace("T", " "))} · ${t("h_line", { n: fmtN(h.done) })}${h.failed.length ? " · " + t("done_failed", { n: h.failed.length }) : ""}</span></span>
    <span class="end">${h.undone ? `<span class="u">${t("h_undone")}</span>` : h.done ? `<button type="button" class="btn" data-act="undoid" data-v="${esc(h.batch)}">${I.undo}${t("undo")}</button>` : ""}</span></div>`).join("");
  return head(t("h_title")) + `<div class="page"><div class="page-in"><div class="group-h">${t("h_sub")}</div><div class="group">${rows || `<div class="nil">${t("h_empty")}</div>`}</div></div></div>`;
}

/* ---------------- 提示条 ---------------- */
let toastH;
function toast(msg, action) {
  const el = $("#toast");
  el.innerHTML = `<span class="m">${esc(msg)}</span>${action ? `<button type="button" id="toastAct">${esc(action.label)}</button>` : ""}`;
  el.classList.add("show");
  if (action) $("#toastAct").onclick = () => { el.classList.remove("show"); action.fn(); };
  clearTimeout(toastH);
  toastH = setTimeout(() => el.classList.remove("show"), action ? 8000 : 3500);
}

/* ---------------- 动作 ---------------- */
async function setFolder(path) {
  const r = await api.check_folder(path);
  if (!r.ok) { S.ferr = path || " "; S.folder = null; if (S.view !== "rename" && S.view !== "sort") S.view = "rename"; render(); const i = $("#pathIn"); if (i) i.focus(); return; }
  S.ferr = null;
  S.folder = r.path;
  S.cfg.recent = [r.path, ...(S.cfg.recent || []).filter(p => !sameDir(p, r.path))].slice(0, 8);
  S.preview = null; S.opreview = null; S.rdone = null; S.odone = null; S.open = {};
  if (S.view !== "rename" && S.view !== "sort") S.view = "rename";
  await loadSchemeFor(r.path);
  render();
  refreshPreview(); refreshOPreview();
}
async function loadSchemeFor(folder) {
  const w = watchOf(folder);
  let sc = w ? w.scheme : null;
  if (!sc) { try { sc = (await api.organize_default(folder)).scheme; } catch (e) { sc = null; } }
  if (sc) { S.schemeKey = keyOfScheme(sc); S.scheme = clone(sc); }
}
async function pickFolder(start) {
  const p = await api.pick_folder(start || "");
  if (p) return p;
  return null;
}
async function doUndo(id) {
  const r = await api.undo(id || null);
  if (!r.ok) { toast(t("err_" + r.err)); return; }
  toast(t("undone", { n: fmtN(r.restored) }) + (r.skipped.length ? t("undo_skip", { n: r.skipped.length }) : ""));
  if (S.rdone && S.rdone.batch === r.batch) S.rdone = null;
  if (S.odone && S.odone.batch === r.batch) S.odone = null;
  S.watch = await api.watch_status();
  afterChange();
}
function afterChange() {
  S.preview = null; S.opreview = null;
  if (S.view === "hist") loadHist(); else render();
  refreshPreview(); refreshOPreview();
  refreshPile();
}
async function refreshPile() { if (S.cfg.intro && dlWatch()) { S.pile = await api.pile(); const el = $("#intro"); if (el) render(); } }
async function loadHist() { S.hist = await api.history(); if (S.view === "hist") render(); }
function doneToast(r, key) {
  let msg = t(key, { n: fmtN(r.done - (r.extracted || 0)) });
  if (r.copied) msg = t("done_copy", { n: fmtN(r.copied) });
  if (r.extracted) msg += " · " + t("done_unz", { n: r.extracted });
  if (r.failed.length) msg += " · " + t("done_failed", { n: r.failed.length });
  toast(msg, r.done ? { label: t("undo"), fn: () => doUndo(r.batch) } : null);
}
function nav(v) {
  S.view = v;
  api.set_pref("view", v);
  if (v === "hist") loadHist();
  if (v === "sort" && S.folder && !S.scheme) loadSchemeFor(S.folder).then(render);
  render();
  if (v === "rename" && !S.rdone) refreshPreview();
  if (v === "sort" && !S.odone) refreshOPreview();
}

const ACT = {
  nav: v => nav(v),
  pick: async () => {
    const p = await pickFolder(S.folder);
    if (p) setFolder(p);
    else if (!window.pywebview) { S.folder = null; S.ferr = null; render(); const i = $("#pathIn"); if (i) i.focus(); }
  },
  demo: async () => {
    const r = await api.make_demo();
    if (!r || !r.ok) return;
    if (S.view === "rename" && !S.rules.length) { S.rules = [{ ...RULE_DEFAULTS.replace(), find: t("demo_find"), to: t("demo_to") }, RULE_DEFAULTS.trim()]; S.rfrom = null; }  // 一点就看得到新名字
    setFolder(r.path);
  },
  usefolder: v => setFolder(v),
  openf: () => api.open_path(S.folder),
  openpath: v => api.open_path(v),
  ext: v => api.open_path(v),
  update: () => api.open_path(S.update.url),
  lang: async v => {  // 左下角 EN / 中文：记进设置文件；现成分法、示例、托盘、窗口标题一起换
    if (v === LANG) return;
    setLang(v);
    const keep = S.scheme ? { action: S.scheme.action, unzip: S.scheme.unzip } : null;
    const h = await api.set_lang(v);
    S.hello = h; S.cfg = { ...S.cfg, ...h.cfg };
    if (S.scheme && S.schemeKey.startsWith("p")) { S.scheme = schemeByKey(S.schemeKey); if (keep.action) S.scheme.action = keep.action; if (keep.unzip) S.scheme.unzip = keep.unzip; }
    S.watch = await api.watch_status();
    if (S.view === "hist") loadHist();
    render();
    refreshPreview(); refreshOPreview();
  },
  menu: (v, el) => openMenu(v, el),
  introok: () => { S.cfg.intro = false; api.set_pref("intro", false); render(); },
  pilerun: async () => {
    const r = await api.pile_run(DOWNLOADS());
    S.cfg.intro = false;
    doneToast(r, "done_sort");
    S.watch = await api.watch_status();
    afterChange();
  },
  wset: async (v, el) => {
    const on = el.getAttribute("aria-checked") !== "true";
    el.setAttribute("aria-checked", String(on));
    S.watch = await api.watch_set(v, on);
    render();
  },
  swatch: async (v, el) => {
    const on = el.getAttribute("aria-checked") !== "true";
    el.setAttribute("aria-checked", String(on));
    const w = watchOf(v);
    S.watch = on ? (w ? await api.watch_set(v, true).then(() => api.watch_scheme(v, S.scheme)) : await api.watch_start(v, S.scheme, false)) : await api.watch_set(v, false);
    render();
  },
  wremove: async v => { S.watch = await api.watch_stop(v); render(); },
  wadd: async () => {
    const p = await pickFolder("");
    if (p) { const r = await api.check_folder(p); if (r.ok) { S.watch = await api.watch_start(r.path, schemeByKey("p0"), false); render(); } return; }
    if (!window.pywebview) { S.wAdding = true; render(); const i = $("#wPath"); if (i) i.focus(); }
  },
  autostart: async (_, el) => {
    const on = el.getAttribute("aria-checked") !== "true";
    el.setAttribute("aria-checked", String(on));
    S.hello.autostart = await api.autostart_set(on);
    render();
  },
  notify: (_, el) => {
    const on = el.getAttribute("aria-checked") !== "true";
    el.setAttribute("aria-checked", String(on));
    S.cfg.notify = on; api.set_pref("notify", on);
  },
  addrule: v => {
    S.rules.push(RULE_DEFAULTS[v]());
    S.rfrom = null;
    if (v === "taken") S.ropts.sort = "taken";
    changedRules();
    const inputs = document.querySelectorAll(`#rules .rule:last-child input.inp`);
    if (inputs.length && (v === "replace" || v === "insert")) inputs[0].focus();
  },
  delrule: (_, el) => { S.rules.splice(+el.dataset.i, 1); changedRules(); },
  toggle: (_, el) => { const r = S.rules[+el.dataset.i]; r.off = !r.off; changedRules(); },
  ruleup: (_, el) => { const i = +el.dataset.i; [S.rules[i - 1], S.rules[i]] = [S.rules[i], S.rules[i - 1]]; changedRules(); },
  rclear: () => { S.rules = []; S.rfrom = null; changedRules(); },
  recipe: v => { const e = (S.cfg.rename_recent || [])[+v]; if (e) { S.rules = clone(e.rules); S.ropts = { ...S.ropts, ...(e.opts || {}) }; S.rfrom = null; changedRules(); } },
  recipedel: async v => { const r = await api.forget_rename(+v); S.cfg.rename_recent = r.recent; render(); },
  rsw: (v, el) => { const [i, k] = v.split(":"); S.rules[+i][k] = el.getAttribute("aria-checked") !== "true"; changedRules(); },
  ropt: (v, el) => { S.ropts[v] = el.getAttribute("aria-checked") !== "true"; changedRules(); },
  seg: (v, el) => {
    const key = el.dataset.key;
    if (el.dataset.i !== undefined) { S.rules[+el.dataset.i][key] = v; changedRules(); return; }
    if (key === "ropt-sort") { S.ropts.sort = v; changedRules(); }
    if (key === "rest") { S.scheme.rest = v === "to" ? (S.scheme.rest || t("other")) : ""; schemeChanged(); }
    if (key === "naming") { S.naming.mode = v; render(); }
    if (key === "action") { S.scheme.action = v; schemeChanged(); }
  },
  ssw: (v, el) => {
    const on = el.getAttribute("aria-checked") !== "true";
    if (v === "unzip") S.scheme.unzip = on;
    if (v === "fallback") for (const r of S.scheme.rules || []) if (r.by === "date" && r.source === "taken") r.fallback = on;
    schemeChanged();
  },
  tplvar: (v, el) => {
    const i = +el.dataset.i, inp = document.querySelector(`input[data-i="${i}"][data-k="tpl"]`);
    const r = S.rules[i], tok = "{" + v + "}";
    const pos = inp && document.activeElement === inp ? inp.selectionStart : (inp ? inp.value.length : r.tpl.length);
    r.tpl = (r.tpl || "").slice(0, pos) + tok + (r.tpl || "").slice(pos);
    if (inp) { inp.value = r.tpl; inp.focus(); inp.selectionStart = inp.selectionEnd = pos + tok.length; }
    S.rdone = null; refreshPreview();
  },
  runrename: async () => {
    S.busy = true; busyBtn("#runBtn");
    const pv = S.preview;
    try {
      const r = await api.rename_run(S.folder, S.rules, S.ropts);
      const bad = new Map(r.failed.map(f => [f.name, f.err]));
      // 改了啥就是刚才那张预览；没动成的从结果里标出来
      r.items = (pv ? pv.items : []).filter(it => it.status === "ok" || it.status === "bumped").map(it => ({ ...it, ok: !bad.has(it.old), err: bad.get(it.old) }));
      S.rdone = r;
      S.cfg.rename_last = { rules: clone(S.rules), opts: clone(S.ropts) };
      api.hello().then(h => { S.cfg.rename_recent = h.cfg.rename_recent || []; });
      doneToast(r, "done_rename");
    } finally { S.busy = false; later(render); }
  },
  undo: () => doUndo(null),
  undoid: v => doUndo(v),
  scheme: v => {
    if (v === "custom" && S.schemeKey !== "custom") { S.scheme = clone(S.scheme || schemeByKey("p0")); S.scheme.name = ""; if (!S.scheme.rules.some(r => r.by !== "type")) S.scheme.rules = [{ by: "kw", kw: "", to: "" }, ...S.scheme.rules]; S.schemeKey = "custom"; schemeChanged(); return; }
    S.schemeKey = v; const keep = { action: S.scheme && S.scheme.action, unzip: S.scheme && S.scheme.unzip }; S.scheme = schemeByKey(v);
    if (keep.action) S.scheme.action = keep.action; if (keep.unzip) S.scheme.unzip = keep.unzip;
    schemeChanged();
  },
  sadd: () => { S.scheme.rules.push({ by: "kw", kw: "", to: "" }); schemeChanged(); },
  sdel: (_, el) => { S.scheme.rules.splice(+el.dataset.i, 1); schemeChanged(); },
  grp: v => { S.open[v] = !S.open[v]; renderOPreview(); },
  runsort: async () => {
    S.busy = true; busyBtn("#orunBtn");
    const pv = S.opreview;
    try {
      const r = await api.organize_run(S.folder, S.scheme);
      const bad = new Map(r.failed.map(f => [f.name, f.err]));
      r.items = (pv ? pv.items : []).filter(it => it.status !== "same").map(it => ({ ...it, ok: !bad.has(it.old), err: bad.get(it.old) }));
      S.odone = r; doneToast(r, "done_sort");
    } finally { S.busy = false; later(() => { render(); refreshPile(); }); }
  },
  retry: async () => {
    const rename = S.view === "rename", d = rename ? S.rdone : S.odone;
    if (!d) return;
    const items = d.items.filter(it => !it.ok);
    S.busy = true;
    try {
      const r = await api.retry(rename ? "rename" : "organize", S.folder, items);
      const bad = new Map(r.failed.map(f => [f.name, f.err]));
      for (const it of items) { it.ok = !bad.has(it.old); it.err = bad.get(it.old); }
      d.done += r.done; d.failed = r.failed;
      if (r.done) d.batches = [...(d.batches || [d.batch]), r.batch];
      doneToast(r, rename ? "done_rename" : "done_sort");
    } finally { S.busy = false; render(); }
  },
  undoall: async v => {  // 结果页的「撤销」：连「再试一次」那批一起撤
    const d = S.view === "rename" ? S.rdone : S.odone;
    const list = d && d.batches ? [...d.batches].reverse() : [v];
    let n = 0, skipped = 0, last = null;
    for (const b of list) { const r = await api.undo(b); if (r.ok) { n += r.restored; skipped += r.skipped.length; last = r; } }
    if (!last) { toast(t("err_nothing")); return; }
    toast(t("undone", { n: fmtN(n) }) + (skipped ? t("undo_skip", { n: skipped }) : ""));
    S.rdone = null; S.odone = null;
    S.watch = await api.watch_status();
    afterChange();
  },
  dpick: async () => { const p = await pickFolder(S.dlFolder || DOWNLOADS()); if (p) { S.dlFolder = p; render(); } },
  dgo: async () => {
    const naming = { mode: S.naming.mode, text: S.naming.text, digits: 2, start: 1 };
    const r = await api.dl_start(S.dlText, S.dlFolder || DOWNLOADS(), naming);
    if (!r.ok) { toast(t(r.err)); return; }
    S.dlText = ""; S.dl = await api.dl_status(); render();
  },
  dretry: async () => { await api.dl_retry(); S.dl = await api.dl_status(); render(); },
  dcancel: async () => { await api.dl_cancel(); },
  dclear: async () => { await api.dl_clear(); S.dl = null; render(); },
};

document.addEventListener("click", e => {
  if (!e.target.closest("#menu")) closeMenu();
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  e.preventDefault();
  const fn = ACT[el.dataset.act];
  if (fn) fn(el.dataset.v, el);
});

document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.i !== undefined && el.dataset.k && el.tagName === "INPUT") {
    const r = S.rules[+el.dataset.i];
    r[el.dataset.k] = ["start", "step", "digits", "first", "last"].includes(el.dataset.k) ? (parseInt(el.value, 10) || 0) : el.value;
    S.rfrom = null; S.rdone = null;
    refreshPreview();
  } else if (el.dataset.opt) {
    S.ropts[el.dataset.opt] = el.value; S.rdone = null; refreshPreview();
  } else if (el.dataset.sk && el.tagName === "INPUT") {
    if (el.dataset.si !== undefined) S.scheme.rules[+el.dataset.si][el.dataset.sk] = el.value; else S.scheme[el.dataset.sk] = el.value;
    S.odone = null;
    const w = watchOf(S.folder);
    if (w && w.on) api.watch_scheme(S.folder, S.scheme);
    refreshOPreview();
  } else if (el.id === "urls") {
    S.dlText = el.value;
    const n = parseUrls(S.dlText).length;
    $("#found").innerHTML = n ? t("d_found", { n: `<b class="tn">${n}</b>` }) : t("d_found0");
    const b = $("#dlGo"); b.disabled = !n; b.textContent = n ? t("d_go", { n }) : t("d_go0");
  } else if (el.id === "nmText") {
    S.naming.text = el.value;
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeMenu();
  if (e.target.id === "pathIn" && e.key === "Enter") setFolder(e.target.value);
  if (e.target.id === "wPath" && e.key === "Enter") {
    api.check_folder(e.target.value).then(async r => {
      if (!r.ok) { toast(t("nofolder")); return; }
      S.wAdding = false; S.watch = await api.watch_start(r.path, schemeByKey("p0"), false); render();
    });
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); doUndo(null); }
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    if (S.view === "rename") { const b = $("#runBtn"); if (b && !b.disabled) b.click(); }
    if (S.view === "sort") { const b = $("#orunBtn"); if (b && !b.disabled) b.click(); }
  }
});

/* 拖文件夹进来：整窗都能丢；桌面版由 Python 接住真实路径后调 __dropPath */
window.__dropPath = p => { if (p) setFolder(p); };
let dragN = 0;
document.addEventListener("dragenter", e => { e.preventDefault(); dragN++; $("#drop").classList.add("on"); });
document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("dragleave", () => { if (--dragN <= 0) { dragN = 0; $("#drop").classList.remove("on"); } });
document.addEventListener("drop", e => {
  e.preventDefault();
  dragN = 0; $("#drop").classList.remove("on");
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && f.pywebviewFullPath) setFolder(f.pywebviewFullPath);
});

/* 轮询：盯梢日志（新分的一眼看得到，能撤）、下载进度 */
const logSig = ws => ws.map(w => (w.log[0] ? w.log[0].ts + w.log[0].old : "") + w.count + (w.log.filter(r => r.undone).length)).join("|") + ws.map(w => w.on).join();
setInterval(async () => {
  try {
    if (S.watch.length) {
      const before = logSig(S.watch);
      const prevTop = new Set(S.watch.flatMap(w => w.log.slice(0, 20).map(r => r.ts + r.old)));
      const ws = await api.watch_status();
      if (logSig(ws) !== before) {
        S.watch = ws;
        const fresh = ws.flatMap(w => w.log.filter(r => r.ok && !r.undone && !prevTop.has(r.ts + r.old)));
        if (fresh.length && document.visibilityState === "visible") {
          const to = [...new Set(fresh.map(r => r.to || t("inplace")))].slice(0, 3).join(t("sep_list"));
          const msg = fresh.length === 1 ? t("w_toast", { name: fresh[0].old, to }) : t("w_toast_n", { name: fresh[0].old, n: fresh.length, more: fresh.length - 1, to });
          const b = fresh[0].batch;
          toast(msg, b ? { label: t("undo"), fn: () => doUndo(b) } : null);
        }
        if (S.view === "watch") render(); else renderSide();
      }
    }
    if (S.dl && S.dl.active) {
      S.dl = await api.dl_status();
      if (S.view === "dl") { const ta = $("#urls"); const focused = document.activeElement === ta; const pos = ta && ta.selectionStart; render(); if (focused) { const n = $("#urls"); n.focus(); n.selectionStart = n.selectionEnd = pos; } }
      else renderSide();
      if (!S.dl.active) toast(t("d_stat", { done: S.dl.done, total: S.dl.items.length }) + (S.dl.failed ? t("d_failed_n", { n: S.dl.failed }) : ""));
    }
  } catch (e) { /* 窗口关的时候会断，忽略 */ }
}, 1000);

/* ---------------- 启动 ---------------- */
(async function boot() {
  await bridgeReady;
  S.hello = await api.hello();
  S.cfg = S.hello.cfg || {};
  setLang(S.hello.lang || "en");
  if (["rename", "sort", "dl", "watch", "hist"].includes(S.cfg.view)) S.view = S.cfg.view;
  const last = S.cfg.rename_last;
  if (last && last.rules && last.rules.length) { S.rules = clone(last.rules); S.ropts = { ...S.ropts, ...(last.opts || {}) }; S.rfrom = "last"; }
  const d = S.cfg.dl || {};
  S.dlFolder = d.folder || S.hello.downloads;
  if (d.naming) S.naming = { mode: d.naming.mode || "keep", text: d.naming.text || "" };
  S.watch = await api.watch_status();
  if (S.cfg.intro && dlWatch()) S.pile = await api.pile();
  if (S.view === "hist") loadHist();
  render();
  api.check_update().then(u => { S.update = u; renderSide(); }).catch(() => {});
  document.documentElement.dataset.ready = "1";
})();
