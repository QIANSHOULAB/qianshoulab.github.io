/* 扫地僧界面。核心逻辑全在 Python（saodi/），这里只管长相和点哪里。 */
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
const fmtN = n => Number(n).toLocaleString("zh-CN");
const base = p => (p || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;
const fmtSize = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : b >= 1024 ? Math.round(b / 1024) + " KB" : b + " B";
const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
const URL_RE = /https?:\/\/[^\s,，;；<>"'）)】]+/g;
const parseUrls = text => [...new Set((text.match(URL_RE) || []).map(u => u.replace(/[.。、]+$/, "")))];

const I = {
  broom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 3 11.5 10.5"/><path d="M9.6 9.4c1.6-.8 3.6-.4 4.7.8l.5.5c1.2 1.2 1.6 3.1.8 4.7L13.8 18 6 10.2Z"/><path d="M6 10.2 3 13.5c-.6.6-.6 1.6 0 2.2l5.3 5.3c.6.6 1.6.6 2.2 0l3.3-3"/><path d="M6.5 16.5 5 18"/><path d="M9 19l-1 1"/></svg>',
  rename: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5V7"/><path d="M12 4v16"/><path d="M9 20h6"/></svg>',
  sort: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/><path d="M8 13h8M8 16h5"/></svg>',
  watch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>',
  hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.2 1.6.7L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/></svg>',
  folderO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.2 1.6.7L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.4-1.2"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
};

/* ---------------- 状态 ---------------- */
const RULE_DEFAULTS = {
  number: () => ({ type: "number", start: 1, step: 1, digits: 3, where: "start", sep: "-" }),
  replace: () => ({ type: "replace", find: "", to: "", regex: false, case: false }),
  date: () => ({ type: "date", source: "modified", fmt: "YYYY-MM-DD", where: "start", sep: " " }),
  taken: () => ({ type: "date", source: "taken", fmt: "YYYY-MM-DD hh.mm.ss", where: "name", sep: " " }),
  case: () => ({ type: "case", mode: "lower" }),
  trim: () => ({ type: "trim" }),
  insert: () => ({ type: "insert", text: "", where: "start" }),
  remove: () => ({ type: "remove", first: 1, last: 0 }),
  ext: () => ({ type: "ext", mode: "lower", to: "" }),
};
const S = {
  view: "rename", hello: null, folder: null, rules: [], ropts: { recursive: false, ext: "", kw: "", sort: "name" },
  preview: null, previewing: false, schemeKey: "p0", scheme: null, opreview: null, open: {},
  watch: [], wFolder: null, wKey: "p0", wExisting: false,
  dl: null, dlText: "", dlFolder: null, naming: { mode: "keep", text: "", digits: 2 },
  hist: [], update: null, busy: false,
};
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------------- 框架 ---------------- */
const NAV = [["rename", "nav_rename", I.rename], ["sort", "nav_sort", I.sort], ["watch", "nav_watch", I.watch], ["dl", "nav_dl", I.dl], ["hist", "nav_hist", I.hist]];

function renderSide() {
  $("#logo").innerHTML = I.broom.replace("<svg", '<svg width="20" height="20"');
  $("#appName").textContent = t("app");
  $("#tagline").textContent = t("tagline");
  const watching = S.watch.filter(w => w.running).length;
  const dling = S.dl ? S.dl.active : 0;
  $("#nav").innerHTML = NAV.map(([k, label, ico]) => {
    let extra = "";
    if (k === "watch" && watching) extra = '<i class="dot"></i>';
    if (k === "dl" && dling) extra = `<span class="badge">${dling}</span>`;
    return `<button type="button" data-act="nav" data-v="${k}" class="${S.view === k ? "on" : ""}">${ico}<span>${t(label)}</span>${extra}</button>`;
  }).join("");
  const upd = S.update && S.update.newer ? `<button type="button" class="upd" data-act="update">${I.up.replace("<svg", '<svg width="12" height="12"')}${esc(t("update", { v: S.update.version }))}</button><br>` : "";
  $("#foot").innerHTML = `${upd}<div>${t("foot_lab")} ${S.hello ? S.hello.version : ""}</div>
    <div>${t("foot_mail_pre")}<span class="sel">oilsongchengmin@gmail.com</span></div>
    <div><a href="https://qianshoulab.github.io/" data-act="ext" data-v="https://qianshoulab.github.io/">${t("foot_home")}</a></div>`;
}

function render() {
  renderSide();
  const m = $("#main");
  const v = { rename: viewRename, sort: viewSort, watch: viewWatch, dl: viewDl, hist: viewHist }[S.view];
  m.innerHTML = v();
  if (S.view === "rename" && S.folder) renderPreview();
  if (S.view === "sort" && S.folder) renderOPreview();
}

const chip = p => `<div class="chip" title="${esc(p)}">${I.folder}<b>${esc(base(p))}</b><span class="p">${esc(p)}</span></div>`;
function head(title, withFolder) {
  const fc = withFolder && S.folder ? `${chip(S.folder)}
    <button type="button" class="lnk" data-act="pick">${t("change")}</button><button type="button" class="lnk" data-act="openf">${t("open_folder")}</button>` : "";
  return `<div class="head"><h1>${title}</h1>${fc}<span class="sp"></span></div>`;
}

function picker() {
  const rec = (S.hello?.cfg?.recent || []).slice(0, 5);
  return `<div class="empty"><div class="drop" id="drop">
    <div class="ico">${I.folderO}</div><h2>${t("pick_title")}</h2><p>${t("pick_sub")}</p>
    <button type="button" class="btn primary big" data-act="pick">${t("pick_btn")}</button>
    <input class="in" id="pathIn" placeholder="${esc(t("pick_paste"))}" spellcheck="false">
    ${rec.length ? `<div class="recent"><div class="lbl">${t("recent")}</div>${rec.map(p => `<button type="button" data-act="usefolder" data-v="${esc(p)}">${I.folder}<span>${esc(p)}</span></button>`).join("")}</div>` : ""}
  </div></div>`;
}

/* ---------------- 改名 ---------------- */
function viewRename() {
  if (!S.folder) return head(t("r_title")) + picker();
  const q = [["number", "q_number"], ["replace", "q_replace"], ["date", "q_date"], ["taken", "q_taken"], ["case", "q_case"], ["trim", "q_trim"], ["insert", "q_insert"], ["remove", "q_remove"], ["ext", "q_ext"]];
  const presets = S.hello?.cfg?.rename_presets || [];
  return head(t("r_title"), true) + `<div class="body">
    <div class="pane-l"><div class="scroll">
      <div class="lbl">${t("r_quick")}</div>
      <div class="quick">${q.map(([k, l]) => `<button type="button" data-act="addrule" data-v="${k}">${I.plus}${t(l)}</button>`).join("")}</div>
      <div id="rules">${rulesHtml()}</div>
      <div class="opts">
        <div class="lbl">${t("opt_scope")}</div>
        <label class="tog"><input type="checkbox" data-opt="recursive" ${S.ropts.recursive ? "checked" : ""}>${t("opt_sub")}</label>
        <div class="row"><span class="k">${t("opt_ext")}</span><input class="in grow" data-opt="ext" value="${esc(S.ropts.ext)}" placeholder="${t("opt_ext_ph")}"></div>
        <div class="row"><span class="k">${t("opt_kw")}</span><input class="in grow" data-opt="kw" value="${esc(S.ropts.kw)}" placeholder="${t("opt_kw_ph")}"></div>
        <div class="lbl" style="margin-top:14px">${t("opt_sort")}</div>
        ${seg("ropt-sort", S.ropts.sort, [["name", t("sort_name")], ["mtime", t("sort_mtime")], ["taken", t("sort_taken")]])}
        <div class="lbl" style="margin-top:16px">${t("presets")}</div>
        <div class="presets">${presets.map(p => `<span class="pchip"><button type="button" data-act="loadpreset" data-v="${esc(p.name)}">${esc(p.name)}</button><button type="button" class="x" data-act="delpreset" data-v="${esc(p.name)}" aria-label="删除">${I.x.replace("<svg", '<svg width="10" height="10"')}</button></span>`).join("")}
          <button type="button" class="lnk" data-act="savepreset" ${S.rules.length ? "" : "disabled"}>${t("preset_save")}</button></div>
      </div>
    </div></div>
    <div class="pane-r"><div class="stat" id="stat"></div><div class="tbl" id="tbl"></div>
      <div class="bar"><button type="button" class="btn" data-act="undo">${I.undo}${t("undo")}</button><span class="sp"></span>
      <button type="button" class="btn primary big" id="runBtn" data-act="runrename" disabled>${t("nothing")}</button></div></div>
  </div>`;
}

function seg(key, cur, opts, i) {
  return `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-act="seg" data-key="${key}" ${i !== undefined ? `data-i="${i}"` : ""} data-v="${esc(v)}" class="${String(cur) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
}
const fin = (i, k, ph = "", cls = "grow") => `<input class="in ${cls}" data-i="${i}" data-k="${k}" value="${esc(S.rules[i][k])}" placeholder="${esc(ph)}" spellcheck="false">`;
const fsel = (i, k, opts) => `<select class="sel-in grow" data-i="${i}" data-k="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(S.rules[i][k]) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const fchk = (i, k, l) => `<label class="tog"><input type="checkbox" data-i="${i}" data-k="${k}" ${S.rules[i][k] ? "checked" : ""}>${l}</label>`;
const WHERE = () => [["start", t("at_start")], ["end", t("at_end")]];

function rulesHtml() {
  if (!S.rules.length) return `<div class="hint">${t("rules_empty")}</div>`;
  return S.rules.map((r, i) => {
    let body = "";
    const ti = { number: "rule_number", replace: "rule_replace", date: "rule_date", case: "rule_case", trim: "rule_trim", insert: "rule_insert", remove: "rule_remove", ext: "rule_ext" }[r.type];
    if (r.type === "replace") body = `<div class="row"><span class="k">${t("f_find")}</span>${fin(i, "find")}</div><div class="row"><span class="k">${t("f_to")}</span>${fin(i, "to")}</div>
      <div class="row" style="gap:16px;margin-top:8px">${fchk(i, "regex", t("f_regex"))}${fchk(i, "case", t("f_matchcase"))}</div>`;
    if (r.type === "number") body = `<div class="row"><span class="k">${t("f_start")}</span>${fin(i, "start", "", "num")}<span class="k">${t("f_step")}</span>${fin(i, "step", "", "num")}<span class="k">${t("f_digits")}</span>${fin(i, "digits", "", "num")}</div>
      <div class="row"><span class="k">${t("f_where")}</span>${seg("where", r.where, [...WHERE(), ["name", t("at_name")]], i)}</div>
      ${r.where !== "name" ? `<div class="row"><span class="k">${t("f_sep")}</span>${fin(i, "sep", "", "num")}</div>` : ""}`;
    if (r.type === "date") body = `<div class="row"><span class="k">${t("f_source")}</span>${fsel(i, "source", [["modified", t("s_modified")], ["created", t("s_created")], ["taken", t("s_taken")], ["today", t("s_today")]])}</div>
      <div class="row"><span class="k">${t("f_fmt")}</span>${fsel(i, "fmt", (S.hello?.date_formats || ["YYYY-MM-DD"]).map(f => [f, f]))}</div>
      <div class="row"><span class="k">${t("f_where")}</span>${seg("where", r.where, [...WHERE(), ["name", t("at_name")]], i)}</div>`;
    if (r.type === "case") body = `<div class="row">${fsel(i, "mode", [["lower", t("c_lower")], ["upper", t("c_upper")], ["title", t("c_title")], ["sentence", t("c_sentence")]])}</div>`;
    if (r.type === "insert") body = `<div class="row"><span class="k">${t("f_text")}</span>${fin(i, "text")}</div><div class="row"><span class="k">${t("f_where")}</span>${seg("where", r.where, WHERE(), i)}</div>`;
    if (r.type === "remove") body = `<div class="row"><span class="k">${t("f_first")}</span>${fin(i, "first", "", "num")}<span class="k">${t("f_chars")}</span></div><div class="row"><span class="k">${t("f_last")}</span>${fin(i, "last", "", "num")}<span class="k">${t("f_chars")}</span></div>`;
    if (r.type === "ext") body = `<div class="row">${seg("mode", r.mode, [["lower", t("e_lower")], ["upper", t("e_upper")], ["set", t("e_set")]], i)}${r.mode === "set" ? fin(i, "to", ".jpg", "num") : ""}</div>`;
    return `<div class="rule ${r.off ? "off" : ""}"><div class="rule-h"><span class="n">${i + 1}</span><b>${t(ti)}</b><span class="sp"></span>
      <button type="button" class="ib" data-act="toggle" data-i="${i}" title="开/关">${r.off ? I.eyeOff : I.eye}</button>
      ${i ? `<button type="button" class="ib" data-act="ruleup" data-i="${i}" title="上移">${I.up}</button>` : ""}
      <button type="button" class="ib" data-act="delrule" data-i="${i}" title="删掉">${I.x}</button></div>${body}</div>`;
  }).join("");
}

let pvSeq = 0;
const refreshPreview = debounce(async () => {
  if (!S.folder) return;
  const seq = ++pvSeq;
  try {
    const p = await api.rename_preview(S.folder, S.rules, S.ropts);
    if (seq !== pvSeq) return;
    S.preview = p;
  } catch (e) { S.preview = null; }
  if (S.view === "rename") renderPreview();
}, 120);

const NOTE_TAG = { fixed: ["amber", "n_fixed"], notaken: ["amber", "n_notaken"], empty: ["bad", "n_empty"], badregex: ["bad", "n_badregex"] };
function renderPreview() {
  const p = S.preview, st = $("#stat"), tb = $("#tbl"), btn = $("#runBtn");
  if (!st) return;
  if (!p) { st.innerHTML = '<span class="spin"></span>'; tb.innerHTML = ""; return; }
  st.innerHTML = `<span>${t("stat", { total: `<b>${fmtN(p.total)}</b>`, changed: `<b>${fmtN(p.changed)}</b>` })}${p.bumped ? `<span class="warn">${t("stat_bump", { n: p.bumped })}</span>` : ""}${p.errors ? `<span class="bad">${t("stat_err", { n: p.errors })}</span>` : ""}</span>`;
  const LIM = 1500;
  const rows = p.items.slice(0, LIM).map(it => {
    const tags = [];
    if (it.status === "bumped") tags.push(`<span class="tag amber">${t("n_bumped")}</span>`);
    for (const n of it.notes || []) if (NOTE_TAG[n]) tags.push(`<span class="tag ${NOTE_TAG[n][0]}">${t(NOTE_TAG[n][1])}</span>`);
    const ch = it.status === "ok" || it.status === "bumped";
    const rel = it.rel ? `<i>${esc(it.rel)}/</i>` : "";
    return `<div class="tr ${ch ? "ch" : "same"}"><span class="o sel" title="${esc(it.old)}">${rel}${esc(it.old)}</span><span class="ar">→</span><span class="w sel" title="${esc(it.new)}">${esc(it.new)}${tags.join("")}</span></div>`;
  }).join("");
  tb.innerHTML = `<div class="tr th"><span>${t("col_old")}</span><span></span><span>${t("col_new")}</span></div>${rows}${p.items.length > LIM ? `<div class="more">${t("more_rows", { n: fmtN(p.items.length - LIM) })}</div>` : ""}`;
  btn.disabled = !p.changed || S.busy;
  btn.innerHTML = S.busy ? '<span class="spin"></span>' : p.changed ? t("run_rename", { n: fmtN(p.changed) }) : t("nothing");
}

/* ---------------- 分文件夹 ---------------- */
function schemeList() {
  const pre = (S.hello?.presets || []).map((p, i) => ["p" + i, p]);
  const saved = (S.hello?.cfg?.schemes || []).map(s => ["s:" + s.name, s]);
  return [...pre, ...saved];
}
function schemeByKey(k) {
  if (k === "custom") return S.scheme && S.schemeKey === "custom" ? S.scheme : { name: "", rules: [{ by: "kw", kw: "", to: "" }], rest: "" };
  const f = schemeList().find(([kk]) => kk === k);
  return f ? clone(f[1]) : clone(S.hello.presets[0]);
}
const SCHEME_DESC = s => (s.rules || []).map(r => r.by === "type" ? "图片/文档/表格…" : r.by === "date" ? (r.source === "taken" ? "拍摄时间 " : "") + (r.fmt || "") : r.by === "kw" ? `“${r.kw}”→${r.to || r.kw}` : r.by === "ext" ? `.${r.ext}→${r.to || r.ext}` : r.by === "size" ? `>${r.mb}MB` : "").join("，");

function viewSort() {
  if (!S.folder) return head(t("s_title")) + picker();
  if (!S.scheme) S.scheme = schemeByKey(S.schemeKey);
  const cards = schemeList().map(([k, s]) => `<button type="button" class="sc ${S.schemeKey === k ? "on" : ""}" data-act="scheme" data-v="${esc(k)}"><b>${esc(s.name)}</b><span>${esc(SCHEME_DESC(s))}</span></button>`).join("")
    + `<button type="button" class="sc ${S.schemeKey === "custom" ? "on" : ""}" data-act="scheme" data-v="custom"><b>${t("scheme_custom")}</b><span>关键词、扩展名、日期、大小随便组合</span></button>`;
  return head(t("s_title"), true) + `<div class="body">
    <div class="pane-l"><div class="scroll">
      <div class="schemes">${cards}</div>
      ${S.schemeKey === "custom" || S.schemeKey.startsWith("s:") ? schemeEditor() : ""}
    </div></div>
    <div class="pane-r"><div class="stat" id="ostat"></div><div class="tbl" id="otbl"></div>
      <div class="bar"><button type="button" class="btn" data-act="undo">${I.undo}${t("undo")}</button>
      <button type="button" class="btn" data-act="watchthis">${I.watch}${t("watch_this")}</button><span class="sp"></span>
      <button type="button" class="btn primary big" id="orunBtn" data-act="runsort" disabled>${t("nothing")}</button></div></div>
  </div>`;
}

function schemeEditor() {
  const s = S.scheme;
  const byOpts = [["kw", t("by_kw")], ["ext", t("by_ext")], ["type", t("by_type")], ["date", t("by_date")], ["size", t("by_size")]];
  const rules = s.rules.map((r, i) => {
    const sel = `<select class="sel-in" style="width:96px" data-si="${i}" data-sk="by">${byOpts.map(([v, l]) => `<option value="${v}" ${r.by === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    const inp = (k, ph, w) => `<input class="in" style="${w ? "width:" + w : ""}" data-si="${i}" data-sk="${k}" value="${esc(r[k] ?? "")}" placeholder="${esc(ph)}" spellcheck="false">`;
    let mid = "";
    if (r.by === "kw") mid = inp("kw", "发票,invoice");
    if (r.by === "ext") mid = inp("ext", "pdf,docx");
    if (r.by === "size") mid = `${inp("mb", "100", "60px")}<span class="k">${t("mb")}</span>`;
    if (r.by === "date") mid = `<select class="sel-in" data-si="${i}" data-sk="source"><option value="modified" ${r.source !== "taken" ? "selected" : ""}>${t("s_modified")}</option><option value="taken" ${r.source === "taken" ? "selected" : ""}>${t("s_taken")}</option></select>
       <select class="sel-in" data-si="${i}" data-sk="fmt">${(S.hello.dir_formats || []).map(f => `<option ${r.fmt === f ? "selected" : ""}>${f}</option>`).join("")}</select>`;
    const to = (r.by === "kw" || r.by === "ext" || r.by === "size") ? `<div class="row"><span class="k">${t("to_folder")}</span>${inp("to", r.by === "size" ? "大文件" : "文件夹名")}</div>` : "";
    return `<div class="rule"><div class="row" style="margin-top:0">${sel}${mid}<button type="button" class="ib" data-act="sdel" data-i="${i}">${I.x}</button></div>${to}</div>`;
  }).join("");
  const restOn = !!s.rest;
  return `<div class="lbl">${t("scheme_custom")}</div>${rules}
    <button type="button" class="lnk" data-act="sadd">+ ${t("add_rule")}</button>
    <div class="row" style="margin-top:12px"><span class="k">${t("rest")}</span>${seg("rest", restOn ? "to" : "stay", [["stay", t("rest_stay")], ["to", t("rest_to")]])}
      ${restOn ? `<input class="in" style="width:80px" data-sk="rest" value="${esc(s.rest)}">` : ""}</div>
    <div class="row" style="margin-top:14px"><input class="in grow" id="schemeName" placeholder="${t("scheme_name_ph")}" value="${esc(s.name || "")}">
      <button type="button" class="btn" data-act="savescheme">${t("scheme_save")}</button></div>
    ${S.schemeKey.startsWith("s:") ? `<button type="button" class="lnk" style="margin-top:8px;color:var(--bad)" data-act="delscheme">${t("scheme_del")}</button>` : ""}`;
}

const refreshOPreview = debounce(async () => {
  if (!S.folder || !S.scheme) return;
  try { S.opreview = await api.organize_preview(S.folder, S.scheme); } catch (e) { S.opreview = null; }
  if (S.view === "sort") renderOPreview();
}, 120);

function renderOPreview() {
  const p = S.opreview, st = $("#ostat"), tb = $("#otbl"), btn = $("#orunBtn");
  if (!st) return;
  if (!p) { st.innerHTML = '<span class="spin"></span>'; tb.innerHTML = ""; return; }
  const groups = {};
  for (const it of p.items) (groups[it.status === "same" ? "\u0000" : it.to || "."] ||= []).push(it);
  const keys = Object.keys(groups).filter(k => k !== "\u0000").sort((a, b) => groups[b].length - groups[a].length);
  const stay = groups["\u0000"] || [];
  st.innerHTML = `<span>${t("stat", { total: `<b>${fmtN(p.total)}</b>`, changed: `<b>${fmtN(p.changed)}</b>` }).replace("要改", "要挪")} · ${t("groups", { n: keys.length })}${p.bumped ? `<span class="warn">${t("stat_bump", { n: p.bumped })}</span>` : ""}</span>`;
  const grp = (k, list, isStay) => {
    const name = isStay ? t("stay_n", { n: list.length }) : (k === "." ? "（原地改名）" : k);
    const open = S.open[k] ? "open" : "";
    return `<div class="grp ${open}"><button type="button" class="grp-h" data-act="grp" data-v="${esc(k)}">${I.chev}<svg class="f" viewBox="0 0 24 24" fill="${isStay ? "var(--fg3)" : "currentColor"}"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.2 1.6.7L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/></svg><b>${esc(name)}</b><span class="c">${fmtN(list.length)}</span></button>
      <div class="grp-b">${list.slice(0, 300).map(it => `<div class="${it.status === "bumped" ? "bump" : ""} sel">${esc(it.old)}${it.new !== it.old ? " → " + esc(it.new) : ""}</div>`).join("")}${list.length > 300 ? `<div>… +${list.length - 300}</div>` : ""}</div></div>`;
  };
  tb.innerHTML = keys.map(k => grp(k, groups[k], false)).join("") + (stay.length ? grp("\u0000", stay, true) : "") || `<div class="nil">${t("nothing")}</div>`;
  btn.disabled = !p.changed || S.busy;
  btn.innerHTML = S.busy ? '<span class="spin"></span>' : p.changed ? t("run_sort", { n: fmtN(p.changed) }) : t("nothing");
}

/* ---------------- 盯着 ---------------- */
function viewWatch() {
  const list = S.watch.map(w => `<div class="card"><div class="wc-h"><span class="st"><i></i>${t("w_running")}</span><b>${esc(w.name)}</b>
      <span class="m">${esc(w.scheme.name || "")} · ${t("w_count", { n: w.count })}</span><span class="sp"></span>
      <button type="button" class="lnk" data-act="openpath" data-v="${esc(w.folder)}">${t("open_folder")}</button>
      <button type="button" class="btn" data-act="wstop" data-v="${esc(w.folder)}">${t("w_stop")}</button></div>
      <div class="log">${w.log.length ? w.log.map(r => `<div><span class="tm">${esc(r.time)}</span><span class="nm sel">${esc(r.old || r.err || "")}</span>${r.ok ? `<span class="to">→ ${esc(r.to || r.new)}</span>` : `<span class="tag bad">${t("err_busy")}</span>`}</div>`).join("") : `<div>${t("w_log_empty")}</div>`}</div></div>`).join("");
  const opts = (S._wScheme ? `<option value="cur" ${S.wKey === "cur" ? "selected" : ""}>${esc(S._wScheme.name)}</option>` : "")
    + schemeList().map(([k, s]) => `<option value="${esc(k)}" ${S.wKey === k ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  const dlf = S.hello?.downloads;
  const add = `<div class="card sunk"><div class="lbl">${t("w_add")}</div>
    <div class="form-row">${S.wFolder ? chip(S.wFolder) : ""}
      <button type="button" class="btn" data-act="wpick">${I.folderO}${S.wFolder ? t("change") : t("pick_btn")}</button>
      ${!S.wFolder && dlf ? `<button type="button" class="lnk" data-act="wdl">${t("w_dl_suggest")}</button>` : ""}</div>
    <div class="form-row"><span class="k">${t("w_scheme")}</span><select class="sel-in" style="width:200px" id="wScheme">${opts}</select></div>
    <div class="form-row"><label class="tog"><input type="checkbox" id="wExisting" ${S.wExisting ? "checked" : ""}>${t("w_existing")}</label><span class="sp" style="flex:1"></span>
      <button type="button" class="btn primary" data-act="wstart" ${S.wFolder ? "" : "disabled"}>${t("w_start")}</button></div></div>`;
  return head(t("w_title")) + `<div class="page"><div class="page-in"><p class="sub">${t("w_sub")}</p>${list || ""}${add}${S.watch.length ? "" : `<p class="sub" style="margin-top:14px">${t("w_empty")}</p>`}</div></div>`;
}

/* ---------------- 下载 ---------------- */
function viewDl() {
  const n = parseUrls(S.dlText).length;
  const folder = S.dlFolder || S.hello?.downloads || "";
  const st = S.dl;
  const list = st && st.items.length ? `<div class="card"><div class="wc-h"><b>${t("d_stat", { done: st.done, total: st.items.length })}</b>${st.failed ? `<span class="m" style="color:var(--bad)">${t("d_failed_n", { n: st.failed })}</span>` : ""}<span class="sp"></span>
      ${st.failed ? `<button type="button" class="btn" data-act="dretry">${t("d_retry")}</button>` : ""}
      ${st.active ? `<button type="button" class="btn" data-act="dcancel">${t("d_cancel")}</button>` : `<button type="button" class="lnk" data-act="dclear">${t("d_clear")}</button>`}
      <button type="button" class="lnk" data-act="openpath" data-v="${esc(st.folder)}">${t("open_folder")}</button></div>
      <div style="margin-top:8px">${st.items.map(it => {
        const pct = it.total ? Math.min(100, it.got / it.total * 100) : (it.state === "done" ? 100 : 0);
        const lab = it.state === "retry" ? t("st_retry", { n: it.tries }) : t("st_" + it.state);
        const size = it.total ? `${fmtSize(it.got)} / ${fmtSize(it.total)}` : it.got ? fmtSize(it.got) : "";
        return `<div class="dl"><div class="nm sel">${esc(it.name || base(it.url.split("?")[0]) || it.url)}<small title="${esc(it.url)}">${esc(it.url)}</small></div>
          <div><div class="pb ${it.state}"><i style="width:${pct}%"></i></div><small style="color:var(--fg3);font-size:11px">${size}</small></div>
          <div class="s ${it.state}" title="${esc(it.err)}">${lab}${it.state === "failed" && it.err ? " · " + esc(it.err.slice(0, 18)) : ""}</div></div>`;
      }).join("")}</div></div>` : "";
  return head(t("d_title")) + `<div class="page"><div class="page-in">
    <textarea class="urls" id="urls" placeholder="${esc(t("d_ph"))}" spellcheck="false">${esc(S.dlText)}</textarea>
    <div class="found" id="found">${n ? t("d_found", { n: `<b>${n}</b>` }) : "&nbsp;"}</div>
    <div class="form-row"><span class="k">${t("d_folder")}</span>${chip(folder)}<button type="button" class="lnk" data-act="dpick">${t("change")}</button></div>
    <div class="form-row"><span class="k">${t("d_naming")}</span>${seg("naming", S.naming.mode, [["keep", t("nm_keep")], ["number", t("nm_number")], ["custom", t("nm_custom")]])}
      ${S.naming.mode === "custom" ? `<input class="in" style="width:120px" id="nmText" value="${esc(S.naming.text)}" placeholder="${t("nm_custom_ph")}"><span class="m" style="color:var(--fg3);font-size:12px">-01, -02 …</span>` : ""}
      <span style="flex:1"></span><button type="button" class="btn primary big" id="dlGo" data-act="dgo" ${n ? "" : "disabled"}>${n ? t("d_go", { n }) : t("d_go0")}</button></div>
    <div style="height:18px"></div>${list}</div></div>`;
}

/* ---------------- 记录 ---------------- */
function viewHist() {
  const rows = S.hist.map(h => `<div class="hrow"><span class="k">${t("k_" + h.kind)}</span><div class="t"><b>${esc(h.label || "")}</b><span>${esc(h.time.replace("T", " "))} · ${t("h_line", { n: h.done })}${h.failed.length ? " · " + t("done_failed", { n: h.failed.length }) : ""}</span></div>
    ${h.undone ? `<span class="u">${t("h_undone")}</span>` : h.done ? `<button type="button" class="btn" data-act="undoid" data-v="${esc(h.batch)}">${I.undo}${t("undo")}</button>` : ""}</div>`).join("");
  return head(t("h_title")) + `<div class="page"><div class="page-in"><p class="sub">${t("h_sub")}</p><div class="card">${rows || `<div class="nil">${t("h_empty")}</div>`}</div></div></div>`;
}

/* ---------------- 提示条 ---------------- */
let toastH;
function toast(msg, action) {
  const el = $("#toast");
  el.innerHTML = `<span class="ok">${I.check}</span><span>${esc(msg)}</span>${action ? `<button type="button" id="toastAct">${esc(action.label)}</button>` : ""}`;
  el.classList.add("show");
  if (action) $("#toastAct").onclick = () => { el.classList.remove("show"); action.fn(); };
  clearTimeout(toastH);
  toastH = setTimeout(() => el.classList.remove("show"), action ? 8000 : 3500);
}

/* ---------------- 动作 ---------------- */
async function setFolder(path) {
  const r = await api.check_folder(path);
  if (!r.ok) { toast(t("nofolder")); return; }
  S.folder = r.path;
  if (!S.hello.cfg.recent.includes(r.path)) S.hello.cfg.recent.unshift(r.path);
  S.preview = null; S.opreview = null; S.open = {};
  if (S.view !== "rename" && S.view !== "sort") S.view = "rename";
  render();
  refreshPreview(); refreshOPreview();
}
async function pickFolder(start) {
  const p = await api.pick_folder(start || "");
  if (p) return p;
  if (!window.pywebview) { const v = prompt(t("pick_paste")); return v || null; }
  return null;
}
async function doUndo(id) {
  const r = await api.undo(id || null);
  if (!r.ok) { toast(t("err_" + r.err)); return; }
  toast(t("undone", { n: r.restored }) + (r.skipped.length ? t("undo_skip", { n: r.skipped.length }) : ""));
  afterChange();
}
function afterChange() {
  S.preview = null; S.opreview = null;
  if (S.view === "hist") loadHist(); else render();
  refreshPreview(); refreshOPreview();
}
async function loadHist() { S.hist = await api.history(); if (S.view === "hist") render(); }
function doneToast(r, key) {
  let msg = t(key, { n: fmtN(r.done) });
  if (r.failed.length) msg += " · " + t("done_failed", { n: r.failed.length }) + "（" + t("err_" + r.failed[0].err) + "）";
  toast(msg, r.done ? { label: t("undo"), fn: () => doUndo(r.batch) } : null);
}

const ACT = {
  nav: v => { S.view = v; if (v === "hist") loadHist(); render(); if (v === "rename") refreshPreview(); if (v === "sort") refreshOPreview(); },
  pick: async () => { const p = await pickFolder(S.folder); if (p) setFolder(p); },
  usefolder: v => setFolder(v),
  openf: () => api.open_path(S.folder),
  openpath: v => api.open_path(v),
  ext: v => api.open_path(v),
  update: () => api.open_path(S.update.url),
  addrule: v => {
    S.rules.push(RULE_DEFAULTS[v]());
    if (v === "taken") S.ropts.sort = "taken";
    render(); refreshPreview();
    const inputs = document.querySelectorAll(`#rules .rule:last-child input.in`);
    if (inputs.length && (v === "replace" || v === "insert")) inputs[0].focus();
  },
  delrule: (_, el) => { S.rules.splice(+el.dataset.i, 1); render(); refreshPreview(); },
  toggle: (_, el) => { const r = S.rules[+el.dataset.i]; r.off = !r.off; render(); refreshPreview(); },
  ruleup: (_, el) => { const i = +el.dataset.i; [S.rules[i - 1], S.rules[i]] = [S.rules[i], S.rules[i - 1]]; render(); refreshPreview(); },
  seg: (v, el) => {
    const key = el.dataset.key;
    if (el.dataset.i !== undefined) { S.rules[+el.dataset.i][key] = v; render(); refreshPreview(); return; }
    if (key === "ropt-sort") { S.ropts.sort = v; render(); refreshPreview(); }
    if (key === "rest") { S.scheme.rest = v === "to" ? (S.scheme.rest || "其他") : ""; render(); refreshOPreview(); }
    if (key === "naming") { S.naming.mode = v; render(); }
  },
  runrename: async () => {
    S.busy = true; renderPreview();
    try { const r = await api.rename_run(S.folder, S.rules, S.ropts); doneToast(r, "done_rename"); }
    finally { S.busy = false; afterChange(); }
  },
  savepreset: async () => {
    const name = prompt(t("preset_name_ph"), S.rules.map(r => t("rule_" + r.type)).join("+"));
    if (!name) return;
    S.hello.cfg.rename_presets = await api.save_rename_preset(name, S.rules); render();
  },
  loadpreset: v => { const p = S.hello.cfg.rename_presets.find(x => x.name === v); if (p) { S.rules = clone(p.rules); render(); refreshPreview(); } },
  delpreset: async v => { S.hello.cfg.rename_presets = await api.delete_rename_preset(v); render(); },
  undo: () => doUndo(null),
  undoid: v => doUndo(v),
  scheme: v => {
    if (v === "custom" && S.schemeKey !== "custom") { S.scheme = clone(S.scheme || schemeByKey("p0")); S.scheme.name = ""; S.schemeKey = "custom"; S.opreview = null; render(); refreshOPreview(); return; }
    S.schemeKey = v; S.scheme = schemeByKey(v); S.opreview = null; render(); refreshOPreview(); },
  sadd: () => { S.scheme.rules.push({ by: "kw", kw: "", to: "" }); render(); refreshOPreview(); },
  sdel: (_, el) => { S.scheme.rules.splice(+el.dataset.i, 1); render(); refreshOPreview(); },
  savescheme: async () => {
    const name = ($("#schemeName").value || "").trim() || "我的方案";
    S.scheme.name = name;
    S.hello.cfg.schemes = await api.save_scheme(clone(S.scheme));
    S.schemeKey = "s:" + name; toast("✓ " + name); render();
  },
  delscheme: async () => { S.hello.cfg.schemes = await api.delete_scheme(S.scheme.name); S.schemeKey = "p0"; S.scheme = schemeByKey("p0"); render(); refreshOPreview(); },
  grp: v => { S.open[v] = !S.open[v]; renderOPreview(); },
  runsort: async () => {
    S.busy = true; renderOPreview();
    try { const r = await api.organize_run(S.folder, S.scheme); doneToast(r, "done_sort"); }
    finally { S.busy = false; afterChange(); }
  },
  watchthis: () => {
    S._wScheme = clone(S.scheme); S._wScheme.name = S._wScheme.name || t("scheme_custom");
    S.wFolder = S.folder; S.wKey = "cur"; S.view = "watch"; render();
  },
  wpick: async () => { const p = await pickFolder(S.wFolder); if (p) { const r = await api.check_folder(p); if (r.ok) { S.wFolder = r.path; render(); } } },
  wdl: () => { S.wFolder = S.hello.downloads; render(); },
  wstart: async () => {
    const key = $("#wScheme").value;
    const scheme = key === "cur" && S._wScheme ? S._wScheme : schemeByKey(key);
    S._wScheme = null; S.wKey = "p0";
    S.watch = await api.watch_start(S.wFolder, scheme, $("#wExisting").checked);
    S.wFolder = null; render();
  },
  wstop: async v => { S.watch = await api.watch_stop(v); render(); },
  dpick: async () => { const p = await pickFolder(S.dlFolder || S.hello.downloads); if (p) { S.dlFolder = p; render(); } },
  dgo: async () => {
    const naming = { mode: S.naming.mode, text: S.naming.text, digits: 2, start: 1 };
    const r = await api.dl_start(S.dlText, S.dlFolder || S.hello.downloads, naming);
    if (!r.ok) { toast(t(r.err)); return; }
    S.dlText = ""; S.dl = await api.dl_status(); render();
  },
  dretry: async () => { await api.dl_retry(); S.dl = await api.dl_status(); render(); },
  dcancel: async () => { await api.dl_cancel(); },
  dclear: async () => { await api.dl_clear(); S.dl = null; render(); },
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  e.preventDefault();
  const fn = ACT[el.dataset.act];
  if (fn) fn(el.dataset.v, el);
});

document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.i !== undefined && el.dataset.k && el.type !== "checkbox" && el.tagName === "INPUT") {
    const r = S.rules[+el.dataset.i];
    r[el.dataset.k] = ["start", "step", "digits", "first", "last"].includes(el.dataset.k) ? (parseInt(el.value, 10) || 0) : el.value;
    refreshPreview();
  } else if (el.dataset.opt && el.type !== "checkbox") {
    S.ropts[el.dataset.opt] = el.value; refreshPreview();
  } else if (el.dataset.sk && el.tagName === "INPUT") {
    if (el.dataset.si !== undefined) S.scheme.rules[+el.dataset.si][el.dataset.sk] = el.value; else S.scheme[el.dataset.sk] = el.value;
    refreshOPreview();
  } else if (el.id === "urls") {
    S.dlText = el.value;
    const n = parseUrls(S.dlText).length;
    $("#found").innerHTML = n ? t("d_found", { n: `<b>${n}</b>` }) : "&nbsp;";
    const b = $("#dlGo"); b.disabled = !n; b.textContent = n ? t("d_go", { n }) : t("d_go0");
  } else if (el.id === "nmText") {
    S.naming.text = el.value;
  }
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.i !== undefined && el.dataset.k) {
    S.rules[+el.dataset.i][el.dataset.k] = el.type === "checkbox" ? el.checked : el.value;
    if (el.tagName === "SELECT" || el.type === "checkbox") { render(); refreshPreview(); }
  } else if (el.dataset.opt === "recursive") {
    S.ropts.recursive = el.checked; refreshPreview();
  } else if (el.dataset.sk && el.tagName === "SELECT") {
    const r = S.scheme.rules[+el.dataset.si];
    r[el.dataset.sk] = el.value;
    if (el.dataset.sk === "by" && el.value === "date") { r.fmt = r.fmt || "YYYY/MM"; r.source = r.source || "modified"; }
    if (el.dataset.sk === "by" && el.value === "size") r.mb = r.mb || 100;
    render(); refreshOPreview();
  } else if (el.id === "wScheme") { S.wKey = el.value; }
  else if (el.id === "wExisting") { S.wExisting = el.checked; }
});
document.addEventListener("keydown", e => {
  if (e.target.id === "pathIn" && e.key === "Enter") setFolder(e.target.value);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); doUndo(null); }
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    if (S.view === "rename") { const b = $("#runBtn"); if (b && !b.disabled) b.click(); }
    if (S.view === "sort") { const b = $("#orunBtn"); if (b && !b.disabled) b.click(); }
  }
});

/* 拖文件夹进来：桌面版由 Python 接住真实路径后调 __dropPath */
window.__dropPath = p => { if (p) setFolder(p); };
["dragenter", "dragover"].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); const d = $("#drop"); if (d) d.classList.add("over"); }));
document.addEventListener("dragleave", e => { if (!e.relatedTarget) { const d = $("#drop"); if (d) d.classList.remove("over"); } });
document.addEventListener("drop", e => {
  e.preventDefault();
  const d = $("#drop"); if (d) d.classList.remove("over");
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && f.pywebviewFullPath) setFolder(f.pywebviewFullPath);
});

/* 轮询：盯梢日志、下载进度 */
setInterval(async () => {
  try {
    if (S.watch.length) {
      const before = S.watch.reduce((a, w) => a + w.count, 0);
      S.watch = await api.watch_status();
      const after = S.watch.reduce((a, w) => a + w.count, 0);
      if (S.view === "watch" && after !== before) render();
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
  S.dlFolder = S.hello.downloads;
  render();
  S.watch = await api.watch_resume();
  renderSide();
  api.check_update().then(u => { S.update = u; renderSide(); }).catch(() => {});
  document.documentElement.dataset.ready = "1";
})();
