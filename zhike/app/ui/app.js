/* 知客僧界面。所有文字走 t()（见 strings.js）；所有数据走 call()（pywebview 或开发用 HTTP）。 */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function call(name, ...args) {
  if (window.pywebview && window.pywebview.api) return await window.pywebview.api[name](...args);
  const r = await fetch("/api/" + name, { method: "POST", body: JSON.stringify(args) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  return j.result;
}

const I = {
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2.5"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l2.2-7.1A2 2 0 0 1 8.1 4.5h7.8a2 2 0 0 1 1.9 1.4L20 13"/><path d="M4 13v4.5A2 2 0 0 0 6 19.5h12a2 2 0 0 0 2-2V13h-4.5l-1.5 2.5h-4L8.5 13z"/></svg>',
  rules: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/></svg>',
  draft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h10a2.5 2.5 0 0 0 2.5-2.5v-7"/><path d="M18.5 3.5l2 2L12 14l-3 1 1-3z"/></svg>',
  log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7"/></svg>',
  cursor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 4h6M9 20h6M12 4v16"/></svg>',
  x: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5l6 6-6 6"/><path d="M20 11H9a5 5 0 0 0-5 5v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
};

const S = { view: "inbox", boot: null, mails: [], sel: null, rules: [], ruleSel: null, tableRule: null, tick: {}, rev: -1, hits: {}, tries: {} };
const NAV = [["inbox", "inbox"], ["rules", "rules"], ["table", "table"], ["drafts", "draft"], ["log", "log"], ["settings", "gear"]];

/* ---------- 小工具 ---------- */
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso), n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  if (d.toDateString() === n.toDateString()) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
function ago(iso) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return t("ago_now");
  if (m < 60) return t("ago_min", { n: m });
  return t("ago_hour", { n: Math.round(m / 60) });
}
const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
async function safe(p) {
  try { return await p; } catch (e) { toast(t("err_generic", { d: String(e.message || e).slice(0, 80) })); throw e; }
}
function chip(code, extra) {
  const cls = { ok: "green", pending: "amber", net: "amber", auth: "red", quota: "red", error: "red", demo: "blue" }[code] || "";
  return `<span class="chip ${cls}">${esc(extra || t("s_" + code))}</span>`;
}

/* ---------- 骨架 ---------- */
function renderSide() {
  const cnt = { inbox: S.mails.length || "", drafts: S.draftCount || "" };
  const tk = S.tick || {};
  let dot = "", line1 = "", line2 = "";
  const sts = Object.entries(tk.status || {});
  const accts = (S.boot && S.boot.accounts) || [];
  if (tk.demo ?? S.boot?.demo) { line1 = t("st_demo"); }
  else {
    const bad = sts.find(([, s]) => s.state === "auth");
    const net = sts.find(([, s]) => s.state === "net");
    const err = sts.find(([, s]) => s.state === "error");
    const who = (id) => (accts.find((a) => a.id === id) || {}).email || "";
    if (bad) { dot = "bad"; line1 = t("st_auth", { who: who(bad[0]) }); }
    else if (net) { dot = "warn"; line1 = t("st_net", { m: Math.max(1, Math.round((net[1].retry_in || 120) / 60)) }); }
    else if (err) { dot = "bad"; line1 = t("st_error", { who: who(err[0]) }); }
    else if (accts.length) {
      dot = "ok"; line1 = t("st_ok", { n: accts.length });
      const last = sts.map(([, s]) => s.last_check).filter(Boolean).sort().pop();
      if (last) line2 = t("st_checked", { t: ago(last) });
    } else line1 = t("st_idle");
    if (tk.pending_rows) line2 = t("st_pending", { n: tk.pending_rows });
  }
  $("#side").innerHTML = `
    <div class="brand"><div class="brand-ico">${I.logo}</div><div><b>${t("app")}</b><span>${t("tagline")}</span></div></div>
    ${NAV.map(([v, ic]) => `<button class="nav-i ${S.view === v ? "on" : ""}" data-nav="${v}" title="${t("nav_" + v)}">${I[ic]}<span>${t("nav_" + v)}</span>${cnt[v] ? `<span class="cnt">${cnt[v]}</span>` : ""}</button>`).join("")}
    <div class="side-sp"></div>
    <button class="stat" data-nav="settings"><i class="dot ${dot}"></i><div><b>${esc(line1)}</b>${line2 ? esc(line2) : ""}</div></button>`;
}
function renderDemo() {
  const demo = S.tick.demo ?? S.boot?.demo;
  $("#demo").innerHTML = demo && S.view !== "settings"
    ? `<div class="demo"><b>${t("demo_title")}</b><span>${t("demo_sub")}</span><button class="btn pri" data-nav="settings" data-focus="email">${t("demo_btn")}</button></div>` : "";
}
function bar(title, right = "") {
  $("#bar").innerHTML = `<h1>${esc(title)}</h1>${right}`;
}
function render() {
  renderSide();
  renderDemo();
  ({ inbox: viewInbox, rules: viewRules, table: viewTable, drafts: viewDrafts, log: viewLog, settings: viewSettings }[S.view])();
}

/* ---------- 收件 ---------- */
function colorOf(rule, name) {
  const fs = (S.rules.find((r) => r.id === rule) || { fields: [] }).fields.filter((f) => !f.builtin);
  const i = fs.findIndex((f) => f.name === name);
  return i < 0 ? 0 : i % 4;
}
function viewInbox() {
  bar(t("nav_inbox"), S.boot && !S.boot.demo ? `<button class="btn" data-act="run-now">${I.refresh}${t("btn_run_now")}</button>` : "");
  const c = $("#content");
  if (!S.mails.length) {
    c.innerHTML = `<div class="empty"><div><div class="empty-ico">${I.inbox}</div><b>${t("inbox_empty_t")}</b><p>${t("inbox_empty_s")}</p></div></div>`;
    return;
  }
  if (!S.sel || !S.mails.find((m) => m.key === S.sel)) S.sel = S.mails[0].key;
  const list = S.mails.map((m) => `
    <button class="li ${m.key === S.sel ? "on" : ""}" data-mail="${esc(m.key)}">
      ${m.rule ? '<i class="ruled"></i>' : ""}
      <div class="li-top"><span class="li-from">${esc(m.from_name || m.from_addr)}</span><span class="li-time">${fmtTime(m.date)}</span></div>
      <div class="li-sub">${esc(m.subject)}</div>
      ${m.rule || m.attachments.length ? `<div class="li-chips">${m.rule ? `<span class="chip blue">${esc(m.rule.name)}</span>` : ""}${m.attachments.length ? `<span class="chip">${I.clip}${m.attachments.length}</span>` : ""}</div>` : ""}
    </button>`).join("");
  const scroll = $(".list") ? $(".list").scrollTop : 0;
  c.innerHTML = `<div class="inbox"><div class="list">${list}</div><div class="reader" id="reader"></div></div>`;
  $(".list").scrollTop = scroll;
  renderReader();
}
function renderReader() {
  const m = S.mails.find((x) => x.key === S.sel);
  const el = $("#reader");
  if (!m || !el) return;
  const rule = m.rule && S.rules.find((r) => r.id === m.rule.id);
  let claim;
  if (rule) {
    const kv = rule.fields.map((f) => {
      const v = m.fields[f.name];
      const sw = f.builtin ? "" : `<i class="sw${colorOf(rule.id, f.name)}"></i>`;
      return `<div class="kv"><span>${sw}${esc(f.name)}</span><b class="${v && v.raw ? "" : "miss"}" title="${esc(v ? v.raw : "")}">${v && v.raw ? esc(v.raw) : t("field_missing")}</b></div>`;
    }).join("");
    const acts = [`<span class="chip green">${I.check}${t("act_excel")}</span>`];
    if (rule.forward.enabled && rule.forward.to.length) acts.push(`<span class="chip blue">${I.fwd}${esc(t("act_forward", { to: rule.forward.to.join("、") }))}</span>`);
    if (rule.reply.enabled) acts.push(`<span class="chip blue">${I.draft}${t("act_draft")}</span>`);
    claim = `<div class="claim"><div class="claim-h"><div class="t">${esc(t("by_rule", { r: rule.name }))}</div><button class="btn ghost" data-goto-rule="${rule.id}">${t("nav_rules")} ›</button></div>
      <div class="claim-g">${kv}</div><div class="claim-a">${acts.join("")}</div></div>`;
  } else {
    claim = `<div class="claim none"><div class="t"><b>${t("no_rule")}</b><span>${t("no_rule_s")}</span></div><button class="btn tint" data-act="rule-from">${I.plus}${t("btn_new_rule_from")}</button></div>`;
  }
  const init = (m.from_name || m.from_addr || "?").trim().slice(0, 1).toUpperCase();
  el.innerHTML = `
    <h2 class="r-subj">${esc(m.subject)}</h2>
    <div class="r-meta"><div class="avatar">${esc(init)}</div><div><b>${esc(m.from_name || m.from_addr)}</b> &lt;${esc(m.from_addr)}&gt;<br>${new Date(m.date).toLocaleString("zh-CN", { hour12: false })}</div></div>
    ${m.attachments.length ? `<div class="r-atts">${m.attachments.map((a) => `<span class="chip">${I.clip}${esc(a)}</span>`).join("")}</div>` : ""}
    ${claim}
    <div class="hint">${I.cursor}${t("pick_hint")}</div>
    <div class="body" id="mbody">${bodyHTML(m, rule)}</div>`;
}
function bodyHTML(m, rule) {
  const text = m.text || "";
  const marks = [];
  if (rule) for (const f of rule.fields) {
    const v = m.fields[f.name];
    if (v && v.span) marks.push({ s: v.span[0], e: v.span[1], k: "f", name: f.name, c: colorOf(rule.id, f.name) });
  }
  (m.suggest || []).forEach((g, i) => {
    if (rule && rule.fields.some((f) => f.name === g.name)) return;
    marks.push({ s: g.start, e: g.end, k: "s", name: g.name, i });
  });
  marks.sort((a, b) => a.s - b.s || (a.k === "f" ? -1 : 1));
  let out = "", pos = 0;
  for (const mk of marks) {
    if (mk.s < pos || mk.e <= mk.s) continue;
    if (mk.s > pos) out += `<span data-s="${pos}">${esc(text.slice(pos, mk.s))}</span>`;
    const seg = esc(text.slice(mk.s, mk.e));
    out += mk.k === "f"
      ? `<mark class="hl" data-c="${mk.c}" data-s="${mk.s}" title="${esc(mk.name)}">${seg}</mark>`
      : `<span class="sg" data-s="${mk.s}" data-sg="${mk.i}" title="${esc(mk.name)}">${seg}</span>`;
    pos = mk.e;
  }
  if (pos < text.length) out += `<span data-s="${pos}">${esc(text.slice(pos))}</span>`;
  return out;
}
function selOffsets() {
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  const body = $("#mbody");
  if (!body || !body.contains(r.commonAncestorContainer)) return null;
  const off = (node, o) => {
    let el = node.nodeType === 3 ? node.parentElement : node;
    if (el === body) { // 落在两段之间
      const kid = body.childNodes[Math.min(o, body.childNodes.length - 1)];
      return kid ? +kid.dataset.s + (o >= body.childNodes.length ? kid.textContent.length : 0) : 0;
    }
    el = el.closest("[data-s]");
    return el ? +el.dataset.s + (node.nodeType === 3 ? o : (o > 0 ? el.textContent.length : 0)) : 0;
  };
  const m = S.mails.find((x) => x.key === S.sel);
  let s = off(r.startContainer, r.startOffset), e = off(r.endContainer, r.endOffset);
  while (s < e && /\s/.test(m.text[s])) s++;
  while (e > s && /\s/.test(m.text[e - 1])) e--;
  if (e <= s || e - s > 300) return null;
  return { s, e, rect: r.getBoundingClientRect() };
}
function guessName(m, s) {
  const text = m.text;
  const ls = text.lastIndexOf("\n", s - 1) + 1;
  const left = text.slice(ls, s);
  let g = left.match(/([^\s:：|｜]{1,12})\s*[:：#]\s*$/);
  if (g) return g[1];
  if (!left.trim()) {
    const prev = text.slice(0, ls).trimEnd().split("\n").pop() || "";
    if (prev.trim().length && prev.trim().length <= 14) return prev.trim().replace(/[:：]$/, "");
  }
  const sg = (m.suggest || []).find((x) => x.start === s);
  return sg ? sg.name : "";
}
function openPop(m, s, e, rect, name) {
  closePop();
  const rules = S.rules;
  const def = m.rule ? m.rule.id : "__new";
  const opts = (m.rule ? [rules.find((r) => r.id === m.rule.id)] : []).concat(rules.filter((r) => !m.rule || r.id !== m.rule.id)).filter(Boolean);
  const pop = document.createElement("div");
  pop.className = "pop";
  pop.innerHTML = `
    <div class="val">「<b>${esc(m.text.slice(s, e))}</b>」</div>
    <label>${t("pop_name")}</label><input class="in" id="pname" value="${esc(name || guessName(m, s))}" maxlength="20" autocomplete="off">
    <label>${t("pop_rule")}</label>
    <select class="in" id="prule">${opts.map((r) => `<option value="${r.id}" ${r.id === def ? "selected" : ""}>${esc(r.name)}</option>`).join("")}<option value="__new" ${def === "__new" ? "selected" : ""}>${t("pop_new_rule")}</option></select>
    <div class="pop-row"><button class="btn" data-act="pop-close">${t("btn_cancel")}</button><button class="btn pri" id="padd">${t("pop_add")}</button></div>
    <div class="pop-note">${t("pop_more")}</div>`;
  document.body.appendChild(pop);
  const W = innerWidth, H = innerHeight;
  let x = Math.min(Math.max(12, rect.left), W - 292), y = rect.bottom + 8;
  if (y + pop.offsetHeight > H - 12) y = Math.max(12, rect.top - pop.offsetHeight - 8);
  pop.style.left = x + "px"; pop.style.top = y + "px";
  const nm = $("#pname", pop); nm.focus(); nm.select();
  const go = async () => {
    const fname = nm.value.trim() || "字段";
    let rid = $("#prule", pop).value;
    closePop();
    if (rid === "__new") {
      const r = await safe(call("new_rule", m.key));
      rid = r.id;
      toast(t("toast_rule", { r: r.name }));
    }
    await safe(call("learn", rid, fname, m.key, s, e));
    toast(t("toast_field", { f: fname }));
    // 规则也要重新拿：界面手里那份旧规则没有刚学的字段，接着改名/加条件会把它存回去、把新字段冲掉
    await reloadAll();
    render();
  };
  $("#padd", pop).onclick = go;
  pop.addEventListener("keydown", (ev) => { if (ev.key === "Enter") go(); if (ev.key === "Escape") closePop(); });
}
function closePop() { document.querySelectorAll(".pop").forEach((p) => p.remove()); }

/* ---------- 规则 ---------- */
const TYPES = ["text", "id", "money", "date", "datetime", "email", "phone", "number"];
function viewRules() {
  bar(t("nav_rules"), `<button class="btn" data-act="new-rule">${I.plus}${t("btn_new_rule")}</button>`);
  const c = $("#content");
  if (!S.rules.length) {
    c.innerHTML = `<div class="empty"><div><div class="empty-ico">${I.rules}</div><b>${t("rules_empty_t")}</b><p>${t("rules_empty_s")}</p><button class="btn pri" data-nav="inbox">${t("nav_inbox")}</button></div></div>`;
    return;
  }
  if (!S.ruleSel || !S.rules.find((r) => r.id === S.ruleSel)) S.ruleSel = S.rules[0].id;
  const list = S.rules.map((r, i) => `<button class="ri ${r.id === S.ruleSel ? "on" : ""}" data-rule="${r.id}"><i class="num">${i + 1}</i><div><div class="n">${esc(r.name)}</div><span>${r.fields.length} 项${r.forward.enabled ? " · 转发" : ""}${r.reply.enabled ? " · 起草" : ""}</span></div></button>`).join("");
  c.innerHTML = `<div class="rules"><div class="rlist">${list}<div class="grp-f" style="padding:10px">${t("rule_order_note")}</div></div><div style="overflow:auto"><div class="page" id="rdetail"></div></div></div>`;
  renderRule();
}
function tagBox(path, items, ph) {
  return `<div class="tags" data-tags="${path}">${items.map((x, i) => `<span class="tag">${esc(x)}<button data-untag="${path}" data-i="${i}">${I.x}</button></span>`).join("")}<input class="tag-in" data-tagin="${path}" placeholder="${esc(ph || t("cond_ph"))}"></div>`;
}
function renderRule() {
  const r = S.rules.find((x) => x.id === S.ruleSel);
  const el = $("#rdetail");
  if (!r || !el) return;
  const firstMail = S.mails.find((m) => m.rule && m.rule.id === r.id);
  const fields = r.fields.map((f) => {
    const v = firstMail && firstMail.fields[f.name];
    const lab = (f.labels || []).map((x) => "「" + (/[\u4e00-\u9fff]/.test(x) ? x.replace(/:$/, "：") : x) + "」").join(" ");
    const how = f.builtin ? "" : lab ? t(f.next_line ? "how_next" : "how_after", { l: lab }) : t("how_nth", { n: (f.nth || 0) + 1 });
    const learned = how + (f.examples && f.examples.length ? " · " + t("learned_from", { n: f.examples.length }) : "");
    return `<div class="row">${f.builtin ? "" : `<i class="sw${colorOf(r.id, f.name)}" style="width:8px;height:8px;border-radius:2px;flex:none"></i>`}
      <div class="l"><input class="fname" data-fname="${esc(f.name)}" value="${esc(f.name)}"><span>${esc(learned)}</span></div>
      <span class="sample ${v && v.raw ? "" : "miss"}">${v && v.raw ? esc(v.raw) : (firstMail ? t("field_missing") : "")}</span>
      <span class="typ">${t("type_" + (f.type || "text"))}</span>
      <button class="icon-btn" data-delfield="${esc(f.name)}" title="删">${I.x}</button></div>`;
  }).join("");
  const have = new Set(r.fields.map((f) => f.builtin).filter(Boolean));
  const B = { "@received": "收到时间", "@from": "发件人", "@from_name": "发件人名字", "@subject": "主题", "@attachments": "附件" };
  const builtins = Object.entries(B).filter(([k]) => !have.has(k)).map(([k, n]) => `<button class="btn tint" data-builtin="${k}">${I.plus}${n}</button>`).join(" ");
  const tr = S.tries[r.id];
  const idx = S.rules.indexOf(r);
  el.innerHTML = `
    <div class="grp" style="display:flex;align-items:center;gap:8px"><input class="rname" id="rname" value="${esc(r.name)}" maxlength="24">
      <button class="icon-btn" data-move="-1" title="${t("move_up")}" ${idx === 0 ? "disabled" : ""}>${I.up}</button><button class="icon-btn" data-move="1" title="${t("move_down")}" ${idx === S.rules.length - 1 ? "disabled" : ""}>${I.down}</button></div>
    <div class="grp"><div class="grp-h"><h2>${t("cond_h")}</h2><span class="help">${S.hits[r.id] != null ? esc(t("hits", { n: S.hits[r.id] })) : ""}</span></div>
      <div class="box">
        <div class="row"><span class="k">${t("cond_from")}</span>${tagBox("conditions.from", r.conditions.from)}</div>
        <div class="row"><span class="k">${t("cond_subject")}</span>${tagBox("conditions.subject", r.conditions.subject)}</div>
        <div class="row"><span class="k">${t("cond_body")}</span>${tagBox("conditions.body", r.conditions.body)}</div>
      </div><div class="grp-f">${t("cond_note")}</div></div>
    <div class="grp"><div class="grp-h"><h2>${t("fields_h")}</h2><span class="help">${t("fields_note")}</span></div>
      <div class="box">${fields}</div>
      ${builtins ? `<div class="grp-f" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${t("fields_builtin")} ${builtins}</div>` : ""}</div>
    <div class="grp"><div class="grp-h"><h2>${t("actions_h")}</h2></div>
      <div class="box">
        <div class="row"><div class="l"><b>${t("a_excel")}</b><span>${esc(t("a_excel_s", { s: r.name }))}</span></div><span class="chip green">${I.check}</span></div>
        <div class="row"><div class="l"><b>${t("a_forward")}</b></div><label class="switch"><input type="checkbox" data-toggle="forward.enabled" ${r.forward.enabled ? "checked" : ""}><i></i></label></div>
        ${r.forward.enabled ? `<div class="row">${tagBox("forward.to", r.forward.to, t("a_forward_ph"))}</div>` : ""}
        <div class="row"><div class="l"><b>${t("a_reply")}</b><span>${t("a_reply_s")}</span></div><label class="switch"><input type="checkbox" data-toggle="reply.enabled" ${r.reply.enabled ? "checked" : ""}><i></i></label></div>
        ${r.reply.enabled ? `
        <div class="row"><div class="l"></div><div class="seg"><button class="${r.reply.mode !== "template" ? "on" : ""}" data-mode="auto">${t("reply_auto")}</button><button class="${r.reply.mode === "template" ? "on" : ""}" data-mode="template">${t("reply_tpl")}</button></div></div>
        ${r.reply.mode !== "template" ? `<div class="row col"><span class="help">${t("reply_hint_h")}</span><input class="in" data-text="reply.hint" value="${esc(r.reply.hint || "")}" placeholder="${t("reply_hint_ph")}"></div>` : ""}
        <div class="row col"><span class="help">${t("reply_tpl_h")} · ${esc(t("reply_tpl_note"))}</span><textarea class="in" data-text="reply.template">${esc(r.reply.template || "")}</textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" data-act="try" ${firstMail ? "" : "disabled"}>${t("btn_try")}</button></div>
          ${tr ? `<div class="draft-try"><small>${esc(t("try_by", { s: tr.subj }))}${tr.mode === "ai" ? t("try_ai") : t("try_tpl")}${tr.ai_error ? " · " + esc(t("ai_fallback", { why: t("why_" + tr.ai_error) })) : ""}</small>${esc(tr.body)}</div>` : ""}
        </div>` : ""}
      </div></div>
    <div class="grp"><button class="btn danger" data-act="del-rule">${I.trash}${t("btn_delete_rule")}</button></div>`;
  if (S.hits[r.id] == null) call("preview_rule", r.id).then((x) => { S.hits[r.id] = x.length; if (S.view === "rules" && S.ruleSel === r.id) { const h = $("#rdetail .grp-h .help"); if (h) h.textContent = t("hits", { n: x.length }); } }).catch(() => {});
}
function curRule() { return S.rules.find((x) => x.id === S.ruleSel); }
function setPath(o, path, v) { const ks = path.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; x[ks[ks.length - 1]] = v; }
function getPath(o, path) { return path.split(".").reduce((x, k) => x[k], o); }
const saveRuleSoon = debounce(async (r) => { await safe(call("save_rule", r)); S.hits[r.id] = null; loadMails(); }, 450);

/* ---------- 表格 ---------- */
async function viewTable() {
  bar(t("nav_table"));
  const c = $("#content");
  if (!S.rules.length) { c.innerHTML = `<div class="empty"><div><div class="empty-ico">${I.table}</div><b>${t("table_empty")}</b><p>${t("rules_empty_s")}</p></div></div>`; return; }
  if (!S.tableRule || !S.rules.find((r) => r.id === S.tableRule)) S.tableRule = S.rules[0].id;
  const tb = await safe(call("table", S.tableRule));
  if (S.view !== "table") return;
  const demo = S.boot.demo;
  bar(t("nav_table"), demo ? "" : `<span class="path" title="${esc(tb.path)}">${esc(tb.path || "")}</span><button class="btn" data-act="show-folder">${t("btn_show_folder")}</button><button class="btn pri" data-act="open-excel">${t("btn_open_excel")}</button>`);
  const tabs = `<div class="tabs"><div class="seg">${S.rules.map((r) => `<button class="${r.id === S.tableRule ? "on" : ""}" data-tab="${r.id}">${esc(r.name)}</button>`).join("")}</div>${demo ? `<span class="help">${t("demo_table")}</span>` : ""}</div>`;
  const note = tb.pending ? `<div class="note"><span>${esc(t("pending_note", { n: tb.pending }))}</span><button class="btn" data-act="flush">${t("btn_flush")}</button></div>` : "";
  const rows = (tb.pending_rows || []).map((r) => ({ r, p: 1 })).concat(tb.rows.map((r) => ({ r, p: 0 })));
  if (!rows.length) { c.innerHTML = tabs + note + `<div class="empty" style="height:auto;padding-top:80px"><div><div class="empty-ico">${I.table}</div><b>${t("table_empty")}</b><p>${t("table_empty_s")}</p></div></div>`; return; }
  const isNum = (v) => /^[¥￥$S]*[\d,.\-]+$/.test(String(v || "").replace(/^S\$/, ""));
  c.innerHTML = tabs + note + `<div class="tbl-wrap"><table><thead><tr>${tb.columns.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(({ r, p }) => `<tr class="${p ? "pend" : ""}">${tb.columns.map((h) => `<td class="${isNum(r[h]) ? "num" : ""}">${esc(r[h] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/* ---------- 草稿 / 记录 ---------- */
async function viewDrafts() {
  bar(t("nav_drafts"));
  const ds = await safe(call("drafts"));
  S.draftCount = ds.length;
  if (S.view !== "drafts") return;
  const c = $("#content");
  if (!ds.length) { c.innerHTML = `<div class="empty"><div><div class="empty-ico">${I.draft}</div><b>${t("drafts_empty_t")}</b><p>${t("drafts_empty_s")}</p></div></div>`; return; }
  const st = (s) => ({ ok: chip("ok", t("d_saved_ok")), quota: chip("quota", t("d_saved_quota")), auth: chip("auth", t("d_saved_auth")), demo: chip("demo", t("d_saved_demo")) }[s] || chip("error", t("d_saved_error")));
  c.innerHTML = `<div class="cards">${ds.map((d, i) => `<div class="card"><div class="card-h"><div class="t"><b>${esc(d.subject)}</b><span>${esc(t("d_to", { to: d.to }))} · ${fmtTime(d.time)}</span></div>${st(d.saved)}<button class="btn" data-copy="${i}">${t("btn_copy")}</button></div><pre>${esc(d.body)}</pre></div>`).join("")}</div>`;
  S._drafts = ds;
}
async function viewLog() {
  bar(t("nav_log"));
  const lg = await safe(call("logs"));
  if (S.view !== "log") return;
  const c = $("#content");
  if (!lg.length) { c.innerHTML = `<div class="empty"><div><div class="empty-ico">${I.log}</div><b>${t("log_empty")}</b></div></div>`; return; }
  const cell = (code, what) => code ? chip(code, what + " · " + t("s_" + code)) : "";
  c.innerHTML = `<div class="tbl-wrap lg"><table><thead><tr><th>时间</th><th>主题</th><th>规则</th><th>干了啥</th></tr></thead><tbody>${lg.map((l) => `<tr><td>${fmtTime(l.time)}</td><td>${esc(l.subject)}</td><td>${l.rule ? esc(l.rule) : '<span class="help">—</span>'}</td><td>${cell(l.excel, t("act_excel"))}${cell(l.forward, "转发")}${cell(l.draft, "草稿")}${l.ai_error ? chip("pending", t("ai_fallback", { why: t("why_" + l.ai_error) })) : ""}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ---------- 设置 ---------- */
const HELP = {
  gmail: () => `${t("help_gmail")}<a data-url="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords</a>`,
  outlook: () => `${t("help_outlook")}<a data-url="https://account.live.com/proofs/AppPassword">account.live.com</a>`,
  qq: () => t("help_qq"), exmail: () => t("help_qq"), "163": () => t("help_163"), "126": () => t("help_163"),
  custom: () => t("help_custom"),
};
function viewSettings() {
  bar(t("nav_settings"));
  const b = S.boot, st = S.tick.status || {};
  const accts = b.accounts.map((a) => {
    const s = st[a.id] || {};
    const badge = s.state === "auth" ? chip("auth") : s.state === "net" ? chip("net") : s.state === "ok" ? chip("ok", "在盯") : "";
    return `<div class="row"><div class="l"><b>${esc(a.email)}</b><span>${esc(a.imap_host)} · ${s.last_check ? esc(t("st_checked", { t: ago(s.last_check) })) : ""}</span></div>${badge}
      ${s.state === "auth" ? `<button class="btn" data-fixpw="${a.id}">${t("acc_fix_pw")}</button>` : ""}<button class="btn" data-samples="${a.id}">${t("acc_samples")}</button><button class="btn danger" data-rmacct="${a.id}">${t("acc_remove")}</button></div>`;
  }).join("");
  const iv = [1, 2, 5, 10, 30].map((n) => `<option value="${n * 60}" ${b.settings.interval_sec === n * 60 ? "selected" : ""}>${t("min", { n })}</option>`).join("");
  $("#content").innerHTML = `<div class="page">
    <div class="grp"><div class="grp-h"><h2>${t("set_accounts")}</h2></div>
      ${accts ? `<div class="box" style="margin-bottom:12px">${accts}</div>` : ""}
      <div class="box"><div class="form">
        <label>${t("acc_email")}</label><input class="in" id="aemail" type="email" placeholder="name@qq.com" autocomplete="off">
        <label id="apwl">${t("acc_pw")}</label><input class="in" id="apw" type="password" placeholder="${t("acc_pw_ph")}" autocomplete="off">
        <div></div><div class="help" id="ahelp">${t("help_custom")}</div>
        <div></div><div><a class="link" data-act="adv" style="font-size:12.5px">${t("acc_custom")}</a></div>
        <div class="full" id="advbox" hidden>
          <div class="adv" style="margin-bottom:8px"><input class="in" id="ihost" placeholder="${t("acc_imap")}"><input class="in" id="iport" placeholder="993"><select class="in" id="isec"><option>ssl</option><option>starttls</option><option>plain</option></select></div>
          <div class="adv"><input class="in" id="shost" placeholder="${t("acc_smtp")}"><input class="in" id="sport" placeholder="465"><select class="in" id="ssec"><option>ssl</option><option>starttls</option><option>plain</option></select></div>
        </div>
        <div></div><div style="display:flex;align-items:center;gap:10px"><button class="btn pri" data-act="connect">${t("btn_connect")}</button><span class="help">${t("pw_where_" + b.secret_where)}</span></div>
        <div class="full" id="amsg"></div>
      </div></div></div>
    <div class="grp"><div class="grp-h"><h2>${t("set_ai")}</h2><a class="link help" data-url="https://aistudio.google.com/apikey">${t("ai_get")}</a></div>
      <div class="box"><div class="row"><span class="k">${t("ai_key")}</span><input class="in" id="aikey" type="password" placeholder="${t("ai_ph")}" style="flex:1"><button class="btn" data-act="ai-save">${t("btn_save")}</button>${b.has_ai_key ? `<button class="btn" data-act="ai-clear">${t("btn_clear")}</button>` : ""}</div></div>
      <div class="grp-f" id="aimsg">${b.has_ai_key ? t("ai_on") : t("ai_off")}</div></div>
    <div class="grp"><div class="grp-h"><h2>${t("set_run")}</h2></div>
      <div class="box">
        <div class="row"><div class="l"><b>${t("autostart")}</b><span>${t("autostart_s")}</span></div><label class="switch"><input type="checkbox" id="autostart" ${b.settings.autostart ? "checked" : ""} ${b.platform === "win32" ? "" : "disabled"}><i></i></label></div>
        <div class="row"><div class="l"><b>${t("interval")}</b></div><select class="in" id="interval" style="width:120px">${iv}</select></div>
        <div class="row"><div class="l"><b>${t("excel_at")}</b><span class="path" style="max-width:none">${esc(b.settings.excel_path)}</span></div>${b.platform === "win32" ? `<button class="btn" data-act="pick-excel">${t("btn_change")}</button>` : ""}</div>
      </div></div>
    <div class="grp"><div class="grp-h"><h2>${t("set_about")}</h2></div>
      <div class="box"><div class="row"><div class="l"><b>${t("version", { v: b.version })}</b><span id="upmsg"></span></div><button class="btn" data-act="update">${t("btn_update")}</button></div></div>
      <div class="foot">${t("foot_name")} ${b.version}<br>${t("foot_mail")}<span class="mail">oilsongchengmin@gmail.com</span><br><a class="link" data-url="https://qianshoulab.github.io/">${t("foot_home")} https://qianshoulab.github.io/</a></div></div>
  </div>`;
  const em = $("#aemail");
  const upd = debounce(async () => {
    const v = em.value.trim();
    if (!/@.+\./.test(v)) return;
    const g = await call("guess", v);
    $("#ahelp").innerHTML = (HELP[g.provider] || HELP.custom)() + (g.imap_host ? `<br>${t("acc_server")}：${esc(g.imap_host)} / ${esc(g.smtp_host)}` : "");
    $("#apwl").textContent = ["qq", "exmail", "163", "126"].includes(g.provider) ? t("acc_pw_qq") : t("acc_pw");
    if (g.provider === "custom") $("#advbox").hidden = false;
  }, 250);
  em.addEventListener("input", upd);
  if (S.focusEmail) { em.focus(); S.focusEmail = false; }
}

/* ---------- 数据 ---------- */
async function loadBoot() { S.boot = await call("boot"); S.rules = S.boot.rules; }
async function loadMails() { S.mails = await call("mails"); }
async function reloadAll() { await loadBoot(); await loadMails(); }

/* ---------- 事件 ---------- */
document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-nav],[data-mail],[data-act],[data-rule],[data-goto-rule],[data-tab],[data-untag],[data-delfield],[data-builtin],[data-mode],[data-move],[data-copy],[data-url],[data-rmacct],[data-fixpw],[data-samples],.sg");
  if (!ev.target.closest(".pop") && !(el && el.classList.contains("sg"))) closePop();
  if (!el) return;
  const d = el.dataset;
  if (d.nav) { S.view = d.nav; if (d.focus) S.focusEmail = true; if (d.nav === "inbox" || d.nav === "rules") await loadMails(); render(); return; }
  if (d.mail) { S.sel = d.mail; document.querySelectorAll(".li").forEach((x) => x.classList.toggle("on", x.dataset.mail === d.mail)); renderReader(); return; }
  if (el.classList.contains("sg")) {
    const m = S.mails.find((x) => x.key === S.sel), g = m.suggest[+d.sg];
    openPop(m, g.start, g.end, el.getBoundingClientRect(), g.name); return;
  }
  if (d.url) { call("open_url", d.url); return; }
  if (d.rule) { S.ruleSel = d.rule; viewRules(); return; }
  if (d.gotoRule) { S.ruleSel = d.gotoRule; S.view = "rules"; render(); return; }
  if (d.tab) { S.tableRule = d.tab; viewTable(); return; }
  if (d.copy != null) { const x = S._drafts[+d.copy]; try { await navigator.clipboard.writeText(x.body); } catch { const ta = document.createElement("textarea"); ta.value = x.body; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } toast(t("copied")); return; }
  const r = curRule();
  if (d.untag) { const arr = getPath(r, d.untag); arr.splice(+d.i, 1); await safe(call("save_rule", r)); S.hits[r.id] = null; await loadMails(); renderRule(); return; }
  if (d.delfield) { const nr = await safe(call("remove_field", r.id, d.delfield)); Object.assign(r, nr); await loadMails(); renderRule(); return; }
  if (d.builtin) { const nr = await safe(call("add_builtin", r.id, d.builtin)); Object.assign(r, nr); await loadMails(); renderRule(); return; }
  if (d.mode) { r.reply.mode = d.mode; await safe(call("save_rule", r)); renderRule(); return; }
  if (d.move) { await safe(call("move_rule", r.id, +d.move)); await reloadAll(); viewRules(); return; }
  if (d.rmacct) { await safe(call("remove_account", d.rmacct)); await reloadAll(); render(); return; }
  if (d.samples) { el.disabled = true; await safe(call("refresh_samples")); await loadMails(); toast(t("toast_saved")); el.disabled = false; return; }
  if (d.fixpw) { const pw = prompt(t("acc_pw")); if (!pw) return; const res = await safe(call("update_password", d.fixpw, pw)); toast(res.ok ? t("toast_saved") : t("err_" + res.code)); return; }
  switch (d.act) {
    case "run-now": { el.disabled = true; const res = await safe(call("run_now")); await loadMails(); toast(t("ran", { n: res.new })); render(); break; }
    case "rule-from": { const m = S.mails.find((x) => x.key === S.sel); const nr = await safe(call("new_rule", m.key)); toast(t("toast_rule", { r: nr.name })); await reloadAll(); render(); break; }
    case "new-rule": { const nr = await safe(call("new_rule", null, null)); await reloadAll(); S.ruleSel = nr.id; viewRules(); setTimeout(() => $("#rname")?.select(), 30); break; }
    case "del-rule": { if (!confirm(t("confirm_delete"))) return; await safe(call("delete_rule", r.id)); await reloadAll(); S.ruleSel = null; viewRules(); break; }
    case "try": {
      const m = S.mails.find((x) => x.rule && x.rule.id === r.id); if (!m) return;
      el.innerHTML = '<i class="spin"></i>'; el.disabled = true;
      const res = await safe(call("try_draft", r.id, m.key));
      S.tries[r.id] = { ...res, subj: m.subject }; renderRule(); break;
    }
    case "open-excel": if (!(await call("open_excel"))) toast(t("table_empty")); break;
    case "show-folder": call("show_excel_folder"); break;
    case "flush": { const res = await safe(call("flush_excel")); viewTable(); if (res.locked) toast(t("pending_note", { n: res.waiting })); break; }
    case "adv": $("#advbox").hidden = !$("#advbox").hidden; break;
    case "connect": {
      const email = $("#aemail").value.trim(), pw = $("#apw").value;
      if (!email || !pw) return;
      const ov = {};
      if (!$("#advbox").hidden && $("#ihost").value) Object.assign(ov, { provider: "custom", imap_host: $("#ihost").value.trim(), imap_port: +$("#iport").value || 993, imap_security: $("#isec").value, smtp_host: $("#shost").value.trim(), smtp_port: +$("#sport").value || 465, smtp_security: $("#ssec").value });
      el.disabled = true; el.innerHTML = `<i class="spin"></i>${t("connecting")}`;
      const res = await safe(call("add_account", email, pw, ov)).finally(() => { el.disabled = false; el.textContent = t("btn_connect"); });
      const box = $("#amsg");
      if (res.ok) { await reloadAll(); render(); $("#amsg").innerHTML = `<div class="msg ok">${esc(t("acc_ok", { n: res.samples }))}</div>`; }
      else box.innerHTML = `<div class="msg bad">${esc(t("err_" + res.code, { d: res.detail || "" }))}</div>`;
      break;
    }
    case "ai-save": case "ai-clear": {
      const key = d.act === "ai-clear" ? "" : $("#aikey").value.trim();
      if (d.act === "ai-save" && !key) return;
      el.disabled = true;
      const res = await safe(call("set_ai_key", key)).finally(() => (el.disabled = false));
      if (res.ok) { await loadBoot(); viewSettings(); $("#aimsg").textContent = res.cleared ? t("ai_off") : t("ai_saved"); }
      else $("#aimsg").innerHTML = `<span style="color:var(--bad)">${esc(t("err_" + res.code, { d: res.detail || "" }))}</span>`;
      break;
    }
    case "pick-excel": { const p = await call("pick_excel"); if (p) { await call("set_setting", "excel_path", p); await loadBoot(); viewSettings(); } break; }
    case "update": {
      const u = await call("check_update");
      $("#upmsg").innerHTML = !u ? t("up_fail") : u.newer ? `${esc(t("up_new", { v: u.latest }))} · <a class="link" data-url="${esc(u.url)}">${t("btn_download")}</a>` : t("up_none");
      break;
    }
    case "pop-close": closePop(); break;
  }
});
document.addEventListener("mouseup", (ev) => {
  if (ev.target.closest(".pop") || !ev.target.closest("#mbody")) return;
  setTimeout(() => {
    const o = selOffsets();
    if (!o) return;
    const m = S.mails.find((x) => x.key === S.sel);
    openPop(m, o.s, o.e, o.rect);
  }, 0);
});
document.addEventListener("keydown", (ev) => {
  const el = ev.target;
  if (el.dataset && el.dataset.tagin && ev.key === "Enter") {
    const v = el.value.trim(); if (!v) return;
    const r = curRule(); getPath(r, el.dataset.tagin).push(v);
    call("save_rule", r).then(async () => { S.hits[r.id] = null; await loadMails(); renderRule(); $(`[data-tagin="${el.dataset.tagin}"]`)?.focus(); });
  }
  if (el.dataset && el.dataset.tagin && ev.key === "Backspace" && !el.value) {
    const r = curRule(), arr = getPath(r, el.dataset.tagin); if (!arr.length) return;
    arr.pop(); call("save_rule", r).then(() => { renderRule(); $(`[data-tagin="${el.dataset.tagin}"]`)?.focus(); });
  }
  if (ev.key === "Escape") closePop();
});
document.addEventListener("change", async (ev) => {
  const el = ev.target, r = curRule();
  if (el.dataset.toggle) { setPath(r, el.dataset.toggle, el.checked); await safe(call("save_rule", r)); await loadMails(); renderRule(); return; }
  if (el.dataset.fname) { const nr = await safe(call("rename_field", r.id, el.dataset.fname, el.value)); Object.assign(r, nr); await loadMails(); renderRule(); return; }
  if (el.id === "autostart") { await safe(call("set_setting", "autostart", el.checked)); return; }
  if (el.id === "interval") { await safe(call("set_setting", "interval_sec", +el.value)); toast(t("toast_saved")); return; }
});
document.addEventListener("input", (ev) => {
  const el = ev.target, r = curRule();
  if (el.id === "rname" && r) { r.name = el.value.trim() || r.name; saveRuleSoon(r); const li = $(`.ri[data-rule="${r.id}"] .n`); if (li) li.textContent = r.name; return; }
  if (el.dataset.text && r) { setPath(r, el.dataset.text, el.value); saveRuleSoon(r); }
});

/* ---------- 心跳 ---------- */
async function heartbeat() {
  try {
    const tk = await call("tick");
    const changed = tk.rev !== S.rev;
    S.tick = tk;
    if (changed && S.rev !== -1) {
      await reloadAll();
      if (S.view === "inbox") viewInbox();
      if (S.view === "log") viewLog();
      if (S.view === "drafts") viewDrafts();
    }
    S.rev = tk.rev;
    renderSide();
  } catch (e) { /* 后台忙，下次再问 */ }
}

async function start() {
  await reloadAll();
  S.tick = await call("tick");
  S.rev = S.tick.rev;
  call("drafts").then((d) => { S.draftCount = d.length; renderSide(); }).catch(() => {});
  render();
  setInterval(heartbeat, 4000);
}
let started = false;
const go = () => { if (!started) { started = true; start(); } };
if (window.pywebview && window.pywebview.api && window.pywebview.api.boot) go();
else {
  window.addEventListener("pywebviewready", go);
  // 浏览器里开发调试（devserver）：没有 pywebview，直接走 HTTP
  setTimeout(() => { if (!window.pywebview) go(); }, 600);
}
