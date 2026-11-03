/* 知客僧界面。所有文字走 t()（见 strings.js）；所有数据走 call()（pywebview 或开发用 HTTP）。
   0.3：第一次打开就是连邮箱；连上后贫僧拟好规则，人只管收不收；能撤销的不问「确定吗」。 */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function call(name, ...args) {
  if (window.pywebview && window.pywebview.api) return await window.pywebview.api[name](...args);
  const r = await fetch("/api/" + name, { method: "POST", body: JSON.stringify(args) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  return j.result;
}

/* 线性图标，2px 笔画、圆头（像 SF Symbols） */
const sv = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  logo: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="zkg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F09A6B"/><stop offset="1" stop-color="#C2552A"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#zkg)"/><rect x="11" y="19" width="42" height="28" rx="4.5" fill="#fff"/><path d="M13.5 22.5L32 35.5l18.5-13" stroke="#C2552A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  inbox: sv('<path d="M3.5 13.5l2.3-7.2A2 2 0 0 1 7.7 5h8.6a2 2 0 0 1 1.9 1.3l2.3 7.2"/><path d="M3.5 13.5V18a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4.5h-5l-1.5 2.5h-4L8.5 13.5z"/>'),
  rules: sv('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  table: sv('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>'),
  draft: sv('<path d="M13.5 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h10a2.5 2.5 0 0 0 2.5-2.5v-6.5"/><path d="M18 3.5l2.5 2.5-8 8-3.2.7.7-3.2z"/>'),
  log: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  clip: sv('<path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7"/>'),
  cursor: sv('<path d="M9 4h6M9 20h6M12 4v16"/>'),
  x: sv('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  up: sv('<path d="M6 15l6-6 6 6"/>'),
  down: sv('<path d="M6 9l6 6 6-6"/>'),
  chev: sv('<path d="M9 6l6 6-6 6"/>'),
  updown: sv('<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>'),
  fwd: sv('<path d="M14 5l6 6-6 6"/><path d="M20 11H9a5 5 0 0 0-5 5v3"/>'),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  refresh: sv('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  spark: sv('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
  warn: sv('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>'),
  power: sv('<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
  mail: sv('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/>'),
};

const S = {
  view: "inbox", boot: null, mails: [], sel: null, rules: [], ruleSel: null, tableRule: null, tick: {}, rev: -1,
  hits: {}, tries: {}, recs: [], rec: {}, tryDemo: false, want: null, autostartNote: null, addAcct: false, fixpw: null,
  seen: new Set(),
};
const NAV = [["inbox", "inbox"], ["rules", "rules"], ["table", "table"], ["drafts", "draft"], ["log", "log"], ["settings", "gear"]];

/* ---------- 小工具 ---------- */
let toastTimer = null;
function toast(msg, action) {
  $$(".toast").forEach((x) => x.remove());
  clearTimeout(toastTimer);
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-act">${esc(action.label)}</button>` : ""}`;
  if (action) $(".toast-act", el).onclick = async () => { el.remove(); await action.run(); };
  document.body.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), action ? 8000 : 2200);
}
function undoToast(msg, token) {
  toast(msg, { label: t("btn_undo"), run: async () => { await call("undo", token); await reloadAll(); render(); } });
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
  const cls = { ok: "", pending: "doubt", net: "doubt", auth: "bad", quota: "bad", error: "bad", demo: "" }[code] || "";
  return `<span class="chip ${cls}">${esc(extra || t("s_" + code))}</span>`;
}
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const demoMode = () => !!(S.boot && S.boot.demo);
const welcoming = () => S.boot && !S.boot.accounts.length && !S.tryDemo;

/* 浮层菜单（代替系统下拉框） */
function menu(anchor, items, cur, onPick) {
  closePop(".menu");
  const m = document.createElement("div");
  m.className = "menu";
  m.innerHTML = items.map(([v, label]) => `<button data-v="${esc(v)}" class="${v === cur ? "on" : ""}">${v === cur ? I.check : "<i></i>"}<span>${esc(label)}</span></button>`).join("");
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const W = innerWidth, H = innerHeight;
  let x = Math.min(r.left, W - m.offsetWidth - 12), y = r.bottom + 4;
  if (y + m.offsetHeight > H - 12) y = Math.max(12, r.top - m.offsetHeight - 4);
  m.style.left = x + "px"; m.style.top = y + "px"; m.style.minWidth = Math.max(r.width, 180) + "px";
  m.addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (!b) return; ev.stopPropagation(); m.remove(); onPick(b.dataset.v); });
}
function closePop(sel = ".pop,.menu") { $$(sel).forEach((p) => p.remove()); }

/* ---------- 骨架 ---------- */
function render() {
  const solo = welcoming();
  $("#app").classList.toggle("solo", !!solo);
  if (solo) { $("#side").innerHTML = ""; viewWelcome(); return; }
  renderSide();
  ({ inbox: viewInbox, recs: viewRecs, rules: viewRules, table: viewTable, drafts: viewDrafts, log: viewLog, settings: viewSettings }[S.view] || viewInbox)();
}
function statusLine() {
  const tk = S.tick || {};
  const sts = Object.entries(tk.status || {});
  const accts = (S.boot && S.boot.accounts) || [];
  const who = (id) => (accts.find((a) => a.id === id) || {}).email || "";
  if (demoMode()) return { dot: "", l1: t("st_demo"), l2: "" };
  const bad = sts.find(([, s]) => s.state === "auth");
  const net = sts.find(([, s]) => s.state === "net");
  const err = sts.find(([, s]) => s.state === "error");
  if (bad) return { dot: "bad", l1: t("st_auth", { who: who(bad[0]) }), l2: "" };
  if (net) {
    const s = net[1].retry_in || 120;
    return { dot: "warn", l1: s < 60 ? t("st_net", { s }) : t("st_net_m", { m: Math.round(s / 60) }), l2: "" };
  }
  if (err) return { dot: "bad", l1: t("st_error", { who: who(err[0]) }), l2: "" };
  if (!accts.length) return { dot: "", l1: t("st_idle"), l2: "" };
  const last = sts.map(([, s]) => s.last_check).filter(Boolean).sort().pop();
  const l2 = tk.pending_rows ? t("st_pending", { n: tk.pending_rows }) : last ? t("st_checked", { t: ago(last) }) : "";
  return { dot: "ok", l1: accts.length === 1 ? accts[0].email : t("st_ok_n", { n: accts.length }), l2: l2 || t("acc_watching") };
}
function renderSide() {
  const tk = S.tick || {};
  const cnt = { inbox: S.mails.length || "", drafts: S.draftCount || "" };
  const nrec = tk.recs || 0;
  const st = statusLine();
  const on = (v) => S.view === v || (v === "rules" && S.view === "recs");
  $("#side").innerHTML = `
    <div class="brand"><span class="brand-ico">${I.logo}</span><div><b>${t("app")}</b><span>${t("tagline")}</span></div></div>
    <nav class="nav">${NAV.map(([v, ic]) => `<button class="nav-i ${on(v) ? "on" : ""}" data-nav="${v}">${I[ic]}<span>${t("nav_" + v)}</span>${v === "rules" && nrec ? `<em class="badge">${nrec}</em>` : cnt[v] ? `<span class="cnt">${cnt[v]}</span>` : ""}</button>`).join("")}</nav>
    <div class="side-sp"></div>
    ${tk.update && tk.update.ready ? `<button class="upd" data-act="restart">${I.refresh}<div><b>${esc(t("side_update", { v: tk.update.latest }))}</b>${t("btn_restart")}</div></button>` : ""}
    <button class="stat" data-nav="settings"><i class="dot ${st.dot}"></i><div><b>${esc(st.l1)}</b>${st.l2 ? `<span>${esc(st.l2)}</span>` : ""}</div></button>`;
}
function head(title, right = "", sub = "") {
  return `<header class="bar"><div class="bar-t"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="bar-r">${right}</div></header>`;
}
function demoBar() {
  return demoMode() ? `<div class="demo">${I.spark}<span>${t("demo_bar")}</span><button class="btn pri sm" data-act="to-welcome">${t("demo_btn")}</button></div>` : "";
}
function recBar() {
  const n = (S.tick && S.tick.recs) || 0;
  return n && S.view !== "recs" ? `<button class="recbar" data-nav="recs">${I.spark}<span>${esc(t("recs_banner", { n }))}</span><b>${t("recs_look")} ›</b></button>` : "";
}

/* ---------- 第一次打开：连邮箱 ---------- */
function connectForm(id) {
  const b = S.boot;
  return `<form class="cform" id="${id}" autocomplete="off" onsubmit="return false">
    <div class="field"><label>${t("acc_email")}</label><input class="in" name="email" type="email" placeholder="${t("acc_email_ph")}" autocomplete="off" spellcheck="false"></div>
    <div class="field pwf"><label class="pwl">${t("acc_pw")}</label><input class="in" name="pw" type="password" placeholder="${t("acc_pw_ph")}" autocomplete="off"><p class="err pw-err" hidden></p></div>
    <div class="ms-only" hidden>${b.ms_login ? `<button class="btn pri wide" data-act="ms-login" type="button">${t("ms_btn")}</button>` : ""}</div>
    <p class="help ahelp" hidden></p>
    <div class="adv" hidden>
      ${["imap", "smtp"].map((k) => `<div class="adv-row"><div class="field grow"><label>${t("acc_" + k)}</label><input class="in" name="${k}host" placeholder="${k}.example.com" spellcheck="false"></div>
        <div class="field port"><label>${t("acc_port")}</label><input class="in" name="${k}port" placeholder="${k === "imap" ? 993 : 465}" inputmode="numeric"></div>
        <div class="seg" data-seg="${k}sec">${["ssl", "starttls", "plain"].map((s, i) => `<button type="button" data-v="${s}" class="${i ? "" : "on"}">${t("sec_" + s)}</button>`).join("")}</div></div>`).join("")}
    </div>
    <p class="err all-err" hidden></p>
    <div class="cform-go"><button class="btn pri wide" data-act="connect" type="submit">${t("btn_connect")}</button>
      <button class="btn text sm" data-act="adv" type="button">${t("acc_custom")}</button></div>
    <p class="foot-note">${t("pw_where_" + b.secret_where)}</p>
  </form>`;
}
const HELP = {
  gmail: () => `${t("help_gmail")}<a data-url="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords</a>`,
  outlook: () => `${t("help_outlook")}<a data-url="https://account.live.com/proofs/AppPassword">account.live.com</a>`,
  qq: () => t("help_qq"), exmail: () => t("help_qq"), "163": () => t("help_163"), "126": () => t("help_163"),
  custom: () => t("help_custom"),
};
function wireForm(f) {
  const em = $("[name=email]", f);
  const upd = debounce(async () => {
    const v = em.value.trim();
    if (!/@.+\./.test(v)) return;
    const g = await call("guess", v);
    const ms = g.provider === "outlook";
    $(".ahelp", f).hidden = false;
    $(".ahelp", f).innerHTML = ms ? esc(S.boot.ms_login ? t("ms_note") : t("ms_soon"))
      : (HELP[g.provider] || HELP.custom)() + (g.imap_host ? `<br>${t("acc_server")}：${esc(g.imap_host)} / ${esc(g.smtp_host)}` : "");
    $(".pwl", f).textContent = ["qq", "exmail", "163", "126"].includes(g.provider) ? t("acc_pw_qq") : t("acc_pw");
    $$(".ms-only", f).forEach((x) => (x.hidden = !(ms && S.boot.ms_login)));
    $(".pwf", f).hidden = ms;
    $("[data-act=connect]", f).hidden = ms;
    if (g.provider === "custom") $(".adv", f).hidden = false;
  }, 250);
  em.addEventListener("input", upd);
}
function viewWelcome() {
  $("#main").innerHTML = `<div class="welcome"><div class="wl">
    <span class="wl-ico">${I.logo}</span>
    <h1>${t("welcome_t")}</h1>
    <p class="wl-s">${t("welcome_s")}</p>
    <div class="card">${connectForm("wform")}</div>
    <button class="btn text" data-act="try-demo">${t("try_demo")}</button>
  </div></div>`;
  wireForm($("#wform"));
  setTimeout(() => $("#wform [name=email]")?.focus(), 30);
}
async function doConnect(f, btn) {
  const email = $("[name=email]", f).value.trim(), pw = $("[name=pw]", f).value;
  // 出错：一句人话，就放在出事的那个框下面
  $$(".err", f).forEach((x) => (x.hidden = true));
  $$(".in.bad", f).forEach((x) => x.classList.remove("bad"));
  const fail = (msg, where) => {
    const e = where === "pw" ? $(".pw-err", f) : $(".all-err", f);
    e.hidden = false; e.innerHTML = `${I.warn}<span>${esc(msg)}</span>`;
    if (where === "pw") $("[name=pw]", f).classList.add("bad");
    if (where === "email") $("[name=email]", f).classList.add("bad");
    e.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  if (!isEmail(email)) { fail(t("err_bad_email"), "email"); $("[name=email]", f).focus(); return; }
  if (!pw) { fail(t("err_need_pw"), "pw"); $("[name=pw]", f).focus(); return; }
  const ov = {};
  const adv = $(".adv", f);
  if (!adv.hidden && $("[name=imaphost]", f).value) {
    const sec = (k) => ($(`[data-seg=${k}] .on`, f) || {}).dataset?.v || "ssl";
    Object.assign(ov, { provider: "custom", imap_host: $("[name=imaphost]", f).value.trim(), imap_port: +$("[name=imapport]", f).value || 993, imap_security: sec("imapsec"),
      smtp_host: $("[name=smtphost]", f).value.trim(), smtp_port: +$("[name=smtpport]", f).value || 465, smtp_security: sec("smtpsec") });
  }
  btn.disabled = true; btn.innerHTML = `<i class="spin"></i>${t("connecting")}`;
  const res = await safe(call("add_account", email, pw, ov)).finally(() => { btn.disabled = false; btn.textContent = t("btn_connect"); });
  if (!res.ok) {
    if (res.code === "need_server") adv.hidden = false;
    fail(t("err_" + res.code, { d: res.detail || "" }), res.code === "auth" ? "pw" : "");
    return;
  }
  S.tryDemo = false; S.addAcct = false;
  S.autostartNote = res.autostart ? "on" : null;
  await reloadAll();
  S.view = res.recs ? "recs" : "inbox";
  render();
}

/* ---------- 贫僧拟的规则：人只管收不收 ---------- */
function recState(r) {
  return (S.rec[r.id] = S.rec[r.id] || { on: true, name: r.name, forward: [] });
}
function viewRecs() {
  const rs = S.recs;
  const m = (S.boot && S.boot.samples) || 0;
  if (!rs.length) {
    $("#main").innerHTML = `<div class="scroll">${head(t("nav_rules"))}${note()}<div class="empty"><div class="empty-ico">${I.rules}</div><b>${t("recs_none_t")}</b><p>${t("recs_none_s")}</p><button class="btn" data-nav="inbox">${t("nav_inbox")}</button></div></div>`;
    return;
  }
  rs.forEach((r) => S.seen.add(r.id));
  const on = rs.filter((r) => recState(r).on).length;
  const cards = rs.map((r) => {
    const st = recState(r);
    const who = r.senders.map((s) => esc(s.who)).slice(0, 3).join("、") + (r.senders.length > 3 ? " …" : "");
    const cond = r.open ? `${t("rec_anyone")} · ${esc(t("rec_subj", { s: r.conditions.subject.slice(0, 4).join(" / ") }))}`
      : `${who}${r.conditions.subject.length ? " · " + esc(t("rec_subj", { s: r.conditions.subject.join(" / ") })) : ""}`;
    const kv = r.fields.map((f) => `<div class="kv"><span>${esc(f.name)}</span><b title="${esc(f.examples[0].raw)}">${esc(f.examples[0].raw)}</b></div>`).join("")
      + (r.attachments ? `<div class="kv"><span>${t("rec_atts")}</span><b>${esc(r.att_example)}</b></div>` : "");
    return `<section class="card rec ${st.on ? "" : "off"}" data-rec="${r.id}">
      <div class="rec-h">
        ${r.kind === "extend" ? `<div class="rec-t"><b>${esc(t("rec_extend", { r: r.name }))}</b><span>${t("rec_extend_s")}</span></div>`
          : `<div class="rec-t"><input class="rec-name" data-recname="${r.id}" value="${esc(st.name)}" maxlength="24" spellcheck="false"><span>${esc(t("rec_n", { n: r.count }))}</span></div>`}
        <label class="switch" title="${t("rec_off")}"><input type="checkbox" data-recon="${r.id}" ${st.on ? "checked" : ""}><i></i></label>
      </div>
      <p class="rec-who">${cond}</p>
      <div class="rec-f">${kv}</div>
      <div class="rec-fw"><span>${t("rec_fw")}</span>${tagBox("rec:" + r.id, st.forward, t("rec_fw_ph"))}</div>
    </section>`;
  }).join("");
  $("#main").innerHTML = `<div class="scroll">
    ${head(rs.length === 1 ? t("recs_t", { n: 1 }) : t("recs_t", { n: rs.length }), "", esc(t("recs_s", { m })))}
    <div class="page narrow">${note()}${cards}</div>
    <footer class="dock"><span>${t("dock_hint")}</span><button class="btn pri" data-act="accept">${on ? t("btn_accept", { n: on }) : t("btn_accept_none")}</button></footer>
  </div>`;
}
function note() {
  if (!S.autostartNote) return "";
  const on = S.autostartNote === "on";
  return `<div class="note">${I.power}<span>${on ? t("autostart_on") : t("autostart_off")}</span><button class="btn text sm" data-act="${on ? "auto-off" : "auto-on"}">${on ? t("btn_off") : t("btn_on")}</button></div>`;
}
async function acceptRecs(btn) {
  const items = [], skipped = [];
  for (const r of S.recs) {
    const st = recState(r);
    const pendingInput = $(`[data-tagin="rec:${r.id}"]`);
    const fw = st.forward.slice();
    if (pendingInput && isEmail(pendingInput.value)) fw.push(pendingInput.value.trim());
    if (st.on) items.push({ id: r.id, name: st.name, forward: fw });
    else skipped.push(r.id);
  }
  btn.disabled = true;
  const res = await safe(call("accept_recs", items, skipped)).finally(() => (btn.disabled = false));
  S.rec = {};
  S.autostartNote = null;
  await reloadAll();
  S.view = "inbox";
  render();
  const n = res.created + res.extended;
  undoToast(!n ? t("dismissed") : res.caught_up ? t("accepted_caught", { n, m: res.caught_up }) : t("accepted", { n }), res.undo);
}

/* ---------- 收件 ---------- */
function viewInbox() {
  const right = !demoMode() ? `<button class="icon-btn" data-act="run-now" title="${t("btn_run_now")}">${I.refresh}</button>` : "";
  if (!S.mails.length) {
    $("#main").innerHTML = `${head(t("nav_inbox"), right)}${demoBar()}${recBar()}<div class="empty"><div class="empty-ico">${I.inbox}</div><b>${t("inbox_empty_t")}</b><p>${t("inbox_empty_s")}</p></div>`;
    return;
  }
  if (!S.sel || !S.mails.find((m) => m.key === S.sel)) S.sel = S.mails[0].key;
  const list = S.mails.map((m) => `
    <button class="li ${m.key === S.sel ? "on" : ""}" data-mail="${esc(m.key)}">
      <div class="li-top"><span class="li-from">${esc(m.from_name || m.from_addr)}</span><span class="li-time">${fmtTime(m.date)}</span></div>
      <div class="li-sub">${esc(m.subject)}</div>
      ${m.rule || m.rec || m.attachments.length ? `<div class="li-chips">${m.rule ? `<span class="chip">${esc(m.rule.name)}</span>` : m.rec ? `<span class="chip ghost">${I.spark}${esc(m.rec.name)}</span>` : ""}${m.attachments.length ? `<span class="chip">${I.clip}${m.attachments.length}</span>` : ""}</div>` : ""}
    </button>`).join("");
  const scroll = $(".list") ? $(".list").scrollTop : 0;
  $("#main").innerHTML = `${head(t("nav_inbox"), right)}${demoBar()}${recBar()}<div class="inbox"><div class="list">${list}</div><div class="reader" id="reader"></div></div>`;
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
      if (v && v.raw) return `<div class="kv"><span>${esc(f.name)}</span><b title="${esc(v.raw)}">${esc(v.raw)}</b></div>`;
      const on = S.want && S.want.rule === rule.id && S.want.name === f.name;
      return `<div class="kv"><span>${esc(f.name)}</span>${f.builtin ? `<b class="miss">${t("field_missing")}</b>` : `<button class="want ${on ? "on" : ""}" data-want="${esc(f.name)}" title="${t("field_missing_tip")}">${t("field_missing")} ›</button>`}</div>`;
    }).join("");
    let acts = [`<span class="chip">${I.check}${t("act_excel")}</span>`];
    if (rule.forward.enabled && rule.forward.to.length) acts.push(`<span class="chip">${I.fwd}${esc(t("act_forward", { to: rule.forward.to.join("、") }))}</span>`);
    if (rule.reply.enabled) acts.push(`<span class="chip">${I.draft}${t("act_draft")}</span>`);
    if (m.junk) acts = [`<span class="chip doubt">${I.warn}${t("junk_" + m.junk)}</span><span class="help">${t("junk_note")}</span>`];
    claim = `<div class="claim"><div class="claim-h"><b>${esc(t("by_rule", { r: rule.name }))}</b><button class="btn text sm" data-goto-rule="${rule.id}">${t("nav_rules")} ›</button></div>
      <div class="claim-g">${kv}</div><div class="claim-a">${acts.join("")}</div></div>`;
    if (S.want && S.want.rule === rule.id) claim += `<div class="want-bar">${I.cursor}<span>${esc(t("want_hint", { f: S.want.name }))}</span><button class="btn text sm" data-act="want-cancel">${t("want_cancel")}</button></div>`;
  } else if (m.rec) {
    claim = `<div class="claim none"><div class="t"><b>${t("no_rule")}</b><span>${esc(t("rec_hint", { r: m.rec.name }))}</span></div><button class="btn" data-nav="recs">${t("recs_look")} ›</button></div>`;
  } else {
    claim = `<div class="claim none"><div class="t"><b>${t("no_rule")}</b><span>${t("no_rule_s")}</span></div><button class="btn" data-act="rule-from">${t("btn_new_rule_from")}</button></div>`;
  }
  const init = (m.from_name || m.from_addr || "?").trim().slice(0, 1).toUpperCase();
  el.innerHTML = `
    <h2 class="r-subj">${esc(m.subject)}</h2>
    <div class="r-meta"><div class="avatar">${esc(init)}</div><div><b>${esc(m.from_name || m.from_addr)}</b> <span>&lt;${esc(m.from_addr)}&gt;</span><br><span>${new Date(m.date).toLocaleString("zh-CN", { hour12: false })}</span></div></div>
    ${m.orig ? `<div class="r-fwd">${I.fwd}<span>${esc(t("fwd_by", { who: m.from_name || m.from_addr }))}</span><b>${esc(t("fwd_orig", { who: (m.orig.from_name ? m.orig.from_name + " " : "") + (m.orig.from ? "<" + m.orig.from + ">" : "") }))}</b></div>` : ""}
    ${m.attachments.length ? `<div class="r-atts">${m.attachments.map((a) => `<span class="chip">${I.clip}${esc(a)}</span>`).join("")}</div>` : ""}
    ${claim}
    <p class="hint">${I.cursor}${t("pick_hint")}</p>
    <div class="body" id="mbody">${bodyHTML(m, rule)}</div>`;
}
function bodyHTML(m, rule) {
  const text = m.text || "";
  const marks = [];
  if (rule) for (const f of rule.fields) {
    const v = m.fields[f.name];
    if (v && v.span) marks.push({ s: v.span[0], e: v.span[1], k: "f", name: f.name });
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
      ? `<mark class="hl" data-s="${mk.s}" title="${esc(mk.name)}">${seg}</mark>`
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
    if (el === body) {
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
  const g = left.match(/([^\s:：|｜]{1,12})\s*[:：#]\s*$/);
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
  const opts = (m.rule ? [rules.find((r) => r.id === m.rule.id)] : []).concat(rules.filter((r) => !m.rule || r.id !== m.rule.id)).filter(Boolean);
  const choices = opts.map((r) => [r.id, r.name]).concat([["__new", t("pop_new_rule")]]);
  let rid = m.rule ? m.rule.id : "__new";
  const pop = document.createElement("div");
  pop.className = "pop";
  pop.innerHTML = `
    <p class="val">「<b>${esc(m.text.slice(s, e))}</b>」</p>
    <div class="field"><label>${t("pop_name")}</label><input class="in" id="pname" value="${esc(name || (S.want && m.rule && S.want.rule === m.rule.id ? S.want.name : "") || guessName(m, s))}" maxlength="20" autocomplete="off"></div>
    <div class="field"><label>${t("pop_rule")}</label><button class="in pick" id="prule" type="button"><span>${esc((choices.find((c) => c[0] === rid) || choices[0])[1])}</span>${I.updown}</button></div>
    <div class="pop-row"><button class="btn" data-act="pop-close">${t("btn_cancel")}</button><button class="btn pri" id="padd">${t("pop_add")}</button></div>
    <p class="pop-note">${t("pop_more")}</p>`;
  document.body.appendChild(pop);
  const W = innerWidth, H = innerHeight;
  const x = Math.min(Math.max(12, rect.left), W - pop.offsetWidth - 12);
  let y = rect.bottom + 8;
  if (y + pop.offsetHeight > H - 12) y = Math.max(12, rect.top - pop.offsetHeight - 8);
  pop.style.left = x + "px"; pop.style.top = y + "px";
  const nm = $("#pname", pop); nm.focus(); nm.select();
  $("#prule", pop).onclick = (ev) => { ev.stopPropagation(); menu($("#prule", pop), choices, rid, (v) => { rid = v; $("#prule span", pop).textContent = choices.find((c) => c[0] === v)[1]; }); };
  const go = async () => {
    const fname = nm.value.trim() || "字段";
    closePop();
    let target = rid;
    if (target === "__new") {
      const r = await safe(call("new_rule", m.key));
      target = r.id;
      toast(t("toast_rule", { r: r.name }));
    }
    await safe(call("learn", target, fname, m.key, s, e));
    toast(t("toast_field", { f: fname }));
    S.want = null;
    // 规则也要重新拿：界面手里那份旧规则没有刚学的字段，接着改名/加条件会把它存回去、把新字段冲掉
    await reloadAll();
    render();
  };
  $("#padd", pop).onclick = go;
  pop.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.id === "pname") go(); if (ev.key === "Escape") closePop(); });
}

/* ---------- 规则 ---------- */
function viewRules() {
  const n = (S.tick && S.tick.recs) || 0;
  const right = `<button class="btn" data-act="new-rule">${I.plus}${t("btn_new_rule")}</button>`;
  if (!S.rules.length) {
    $("#main").innerHTML = `${head(t("nav_rules"), right)}${demoBar()}${recBar()}<div class="empty"><div class="empty-ico">${I.rules}</div><b>${t("rules_empty_t")}</b><p>${t("rules_empty_s")}</p><button class="btn" data-nav="inbox">${t("nav_inbox")}</button></div>`;
    return;
  }
  if (!S.ruleSel || !S.rules.find((r) => r.id === S.ruleSel)) S.ruleSel = S.rules[0].id;
  const list = S.rules.map((r, i) => `<button class="ri ${r.id === S.ruleSel ? "on" : ""}" data-rule="${r.id}"><i class="num">${i + 1}</i><div><b>${esc(r.name)}</b><span>${esc(t("n_fields", { n: r.fields.length }))}${r.forward.enabled && r.forward.to.length ? " · " + t("s_fw") : ""}${r.reply.enabled ? " · " + t("s_reply") : ""}</span></div></button>`).join("");
  $("#main").innerHTML = `${head(t("nav_rules"), right)}${demoBar()}<div class="rules"><div class="rlist">
      ${n ? `<button class="ri rec-ri" data-nav="recs">${I.spark}<div><b>${t("rules_recs")}</b><span>${esc(t("recs_banner", { n }))}</span></div><em class="badge">${n}</em></button>` : ""}
      ${list}<p class="grp-f">${t("rule_order_note")}</p></div>
    <div class="rdetail-wrap"><div class="page" id="rdetail"></div></div></div>`;
  renderRule();
}
function tagBox(path, items, ph) {
  return `<div class="tags" data-tags="${path}">${items.map((x, i) => `<span class="tag">${esc(x)}<button data-untag="${path}" data-i="${i}" title="${t("del")}">${I.x}</button></span>`).join("")}<input class="tag-in" data-tagin="${path}" placeholder="${esc(ph || t("cond_ph"))}" spellcheck="false"></div>`;
}
function renderRule() {
  const r = S.rules.find((x) => x.id === S.ruleSel);
  const el = $("#rdetail");
  if (!r || !el) return;
  const firstMail = S.mails.find((m) => m.rule && m.rule.id === r.id);
  const fields = r.fields.map((f) => {
    const v = firstMail && firstMail.fields[f.name];
    const lab = (f.labels || []).map((x) => "「" + (/[一-鿿]/.test(x) ? x.replace(/:$/, "：") : x) + "」").join(" ");
    const how = f.builtin ? "" : lab ? t(f.next_line ? "how_next" : "how_after", { l: lab }) : t("how_nth", { n: (f.nth || 0) + 1 });
    const learned = how + (f.examples && f.examples.length ? " · " + t("learned_from", { n: f.examples.length }) : "");
    return `<div class="row"><div class="l"><input class="fname" data-fname="${esc(f.name)}" value="${esc(f.name)}" spellcheck="false">${learned ? `<span>${esc(learned)}</span>` : ""}</div>
      <span class="sample ${v && v.raw ? "" : "miss"}">${v && v.raw ? esc(v.raw) : (firstMail ? t("field_missing") : "")}</span>
      <span class="typ">${t("type_" + (f.type || "text"))}</span>
      <button class="icon-btn sm" data-delfield="${esc(f.name)}" title="${t("del")}">${I.x}</button></div>`;
  }).join("");
  const have = new Set(r.fields.map((f) => f.builtin).filter(Boolean));
  const B = ["@received", "@from", "@from_name", "@subject", "@attachments"];
  const builtins = B.filter((k) => !have.has(k)).map((k) => `<button class="btn text sm" data-builtin="${k}">${I.plus}${t("b_" + k.slice(1))}</button>`).join("");
  const tr = S.tries[r.id];
  const idx = S.rules.indexOf(r);
  const fwOn = r.forward.enabled && r.forward.to.length;
  el.innerHTML = `
    <div class="rhead"><input class="rname" id="rname" value="${esc(r.name)}" maxlength="24" spellcheck="false">
      <button class="icon-btn" data-move="-1" title="${t("move_up")}" ${idx === 0 ? "disabled" : ""}>${I.up}</button><button class="icon-btn" data-move="1" title="${t("move_down")}" ${idx === S.rules.length - 1 ? "disabled" : ""}>${I.down}</button></div>
    <div class="grp"><div class="grp-h"><h2>${t("cond_h")}</h2><span class="help" id="hits">${S.hits[r.id] != null ? esc(t("hits", { n: S.hits[r.id] })) : ""}</span></div>
      <div class="box">
        <div class="row"><span class="k">${t("cond_from")}</span>${tagBox("conditions.from", r.conditions.from)}</div>
        <div class="row"><span class="k">${t("cond_subject")}</span>${tagBox("conditions.subject", r.conditions.subject)}</div>
        <div class="row"><span class="k">${t("cond_body")}</span>${tagBox("conditions.body", r.conditions.body)}</div>
        <div class="row"><span class="k">${t("cond_exclude")}</span>${tagBox("conditions.exclude", r.conditions.exclude || (r.conditions.exclude = []))}</div>
      </div><p class="grp-f">${t("cond_note")}</p></div>
    <div class="grp"><div class="grp-h"><h2>${t("fields_h")}</h2><span class="help">${t("fields_note")}</span></div>
      <div class="box">${fields}</div>
      ${builtins ? `<div class="grp-f builtins">${t("fields_builtin")} ${builtins}</div>` : ""}</div>
    <div class="grp"><div class="grp-h"><h2>${t("actions_h")}</h2></div>
      <div class="box">
        <div class="row"><div class="l"><b>${t("a_excel")}</b><span>${esc(t("a_excel_s", { s: r.name }))}</span></div><span class="ok-mark">${I.check}</span></div>
        <div class="row"><span class="k">${t("a_forward")}</span>${tagBox("forward.to", r.forward.to, t("a_forward_ph"))}</div>
        <div class="row"><div class="l"><b>${t("a_reply")}</b><span>${t("a_reply_s")}</span></div><label class="switch"><input type="checkbox" data-toggle="reply.enabled" ${r.reply.enabled ? "checked" : ""}><i></i></label></div>
        ${r.reply.enabled ? `
        <div class="row"><div class="l"></div><div class="seg" data-seg="reply-mode"><button class="${r.reply.mode !== "template" ? "on" : ""}" data-mode="auto">${t("reply_auto")}</button><button class="${r.reply.mode === "template" ? "on" : ""}" data-mode="template">${t("reply_tpl")}</button></div></div>
        ${r.reply.mode !== "template" ? `<div class="row col"><span class="help">${t("reply_hint_h")}</span><input class="in" data-text="reply.hint" value="${esc(r.reply.hint || "")}" placeholder="${t("reply_hint_ph")}"></div>` : ""}
        <div class="row col"><span class="help">${t("reply_tpl_h")} · ${esc(t("reply_tpl_note"))}</span><textarea class="in" data-text="reply.template">${esc(r.reply.template || "")}</textarea>
          <div class="row-end"><button class="btn" data-act="try" ${firstMail ? "" : "disabled"}>${t("btn_try")}</button></div>
          ${tr ? `<div class="draft-try"><small>${esc(t("try_by", { s: tr.subj }))}${tr.mode === "ai" ? t("try_ai") : t("try_tpl")}${tr.ai_error ? " · " + esc(t("ai_fallback", { why: t("why_" + tr.ai_error) })) : ""}</small>${esc(tr.body)}</div>` : ""}
        </div>` : ""}
      </div>${fwOn ? "" : ""}</div>
    <div class="grp"><button class="btn text danger" data-act="del-rule">${t("btn_delete_rule")}</button></div>`;
  if (S.hits[r.id] == null) call("preview_rule", r.id).then((x) => { S.hits[r.id] = x.length; const h = $("#hits"); if (h && S.ruleSel === r.id) h.textContent = t("hits", { n: x.length }); }).catch(() => {});
}
function curRule() { return S.rules.find((x) => x.id === S.ruleSel); }
function setPath(o, path, v) { const ks = path.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; x[ks[ks.length - 1]] = v; }
function getPath(o, path) { return path.split(".").reduce((x, k) => x[k], o); }
/* 正在改规则名、模板：先别让心跳把手里这份规则换成后台那份（不然刚打的字还没存，下一下改动会把它冲掉——0.2 就有这个坑） */
let editingUntil = 0;
const saveRuleSoon = debounce(async (r) => { await safe(call("save_rule", r)); S.hits[r.id] = null; loadMails(); }, 450);
function editing() { editingUntil = Date.now() + 1500; }
function syncForward(r) { r.forward.enabled = r.forward.to.length > 0; }

/* ---------- 表格 ---------- */
async function viewTable() {
  if (!S.rules.length) { $("#main").innerHTML = `${head(t("nav_table"))}${demoBar()}<div class="empty"><div class="empty-ico">${I.table}</div><b>${t("table_empty")}</b><p>${t("table_none_s")}</p></div>`; return; }
  if (!S.tableRule || !S.rules.find((r) => r.id === S.tableRule)) S.tableRule = S.rules[0].id;
  const tb = await safe(call("table", S.tableRule));
  if (S.view !== "table") return;
  const demo = demoMode();
  const right = demo ? "" : `<span class="path" title="${esc(tb.path)}">${esc(tb.path || "")}</span><button class="btn" data-act="show-folder">${t("btn_show_folder")}</button><button class="btn pri" data-act="open-excel">${t("btn_open_excel")}</button>`;
  const tabs = `<div class="tabs"><div class="seg">${S.rules.map((r) => `<button class="${r.id === S.tableRule ? "on" : ""}" data-tab="${r.id}">${esc(r.name)}</button>`).join("")}</div>${demo ? `<span class="help">${t("demo_table")}</span>` : ""}</div>`;
  const pend = tb.pending ? `<div class="note doubt">${I.warn}<span>${esc(t("pending_note", { n: tb.pending }))}</span><button class="btn sm" data-act="flush">${t("btn_flush")}</button></div>` : "";
  const rows = (tb.pending_rows || []).map((r) => ({ r, p: 1 })).concat(tb.rows.map((r) => ({ r, p: 0 })));
  const isNum = (v) => /^[¥￥$S]*[\d,.\-]+$/.test(String(v || "").replace(/^S\$/, ""));
  const body = rows.length
    ? `<div class="tbl-wrap"><table><thead><tr>${tb.columns.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(({ r, p }) => `<tr class="${p ? "pend" : ""}">${tb.columns.map((h) => `<td class="${isNum(r[h]) ? "num" : ""}">${esc(r[h] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : `<div class="empty short"><div class="empty-ico">${I.table}</div><b>${t("table_empty")}</b><p>${t("table_empty_s")}</p></div>`;
  $("#main").innerHTML = `<div class="scroll">${head(t("nav_table"), right)}${demoBar()}<div class="page wide">${tabs}${pend}${body}</div></div>`;
}

/* ---------- 草稿 / 记录 ---------- */
async function viewDrafts() {
  const ds = await safe(call("drafts"));
  S.draftCount = ds.length;
  if (S.view !== "drafts") return;
  if (!ds.length) { $("#main").innerHTML = `${head(t("nav_drafts"))}${demoBar()}<div class="empty"><div class="empty-ico">${I.draft}</div><b>${t("drafts_empty_t")}</b><p>${t("drafts_empty_s")}</p></div>`; return; }
  const st = (s) => ({ ok: chip("ok", t("d_saved_ok")), quota: chip("quota", t("d_saved_quota")), auth: chip("auth", t("d_saved_auth")), demo: chip("demo", t("d_saved_demo")) }[s] || chip("error", t("d_saved_error")));
  $("#main").innerHTML = `<div class="scroll">${head(t("nav_drafts"))}${demoBar()}<div class="page narrow cards">${ds.map((d, i) => `<article class="card dcard"><div class="card-h"><div class="t"><b>${esc(d.subject)}</b><span>${esc(t("d_to", { to: d.to }))} · ${fmtTime(d.time)}</span></div>${st(d.saved)}<button class="btn sm" data-copy="${i}">${t("btn_copy")}</button></div><pre>${esc(d.body)}</pre></article>`).join("")}</div></div>`;
  S._drafts = ds;
}
async function viewLog() {
  const lg = await safe(call("logs"));
  if (S.view !== "log") return;
  if (!lg.length) { $("#main").innerHTML = `${head(t("nav_log"))}${demoBar()}<div class="empty"><div class="empty-ico">${I.log}</div><b>${t("log_empty")}</b></div>`; return; }
  const cell = (code, what) => code ? chip(code, what + " · " + t("s_" + code)) : "";
  const held = (l) => l.held ? `${chip("pending", t("held_" + (l.junk || "promo")))}${l.id ? `<button class="btn sm" data-release="${esc(l.id)}">${t("btn_release")}</button>` : ""}` : "";
  $("#main").innerHTML = `<div class="scroll">${head(t("nav_log"))}${demoBar()}<div class="page wide"><div class="tbl-wrap lg"><table><thead><tr><th>${t("log_time")}</th><th>${t("log_subject")}</th><th>${t("log_rule")}</th><th>${t("log_did")}</th></tr></thead><tbody>${lg.map((l) => `<tr class="${l.held ? "pend" : ""}"><td>${fmtTime(l.time)}</td><td class="subj">${esc(l.subject)}</td><td>${l.rule ? esc(l.rule) : l.held ? `<span class="help">${esc(l.held)}</span>` : '<span class="help">—</span>'}</td><td class="did">${held(l)}${cell(l.excel, t("act_excel"))}${cell(l.forward, t("w_forward"))}${cell(l.draft, t("w_draft"))}${l.ai_fields && l.ai_fields.length ? chip("demo", t("by_ai") + " · " + l.ai_fields.join("、")) : ""}${l.ai_error ? chip("pending", t("ai_fallback", { why: t("why_" + l.ai_error) })) : ""}</td></tr>`).join("")}</tbody></table></div></div></div>`;
}

/* ---------- 设置 ---------- */
function viewSettings() {
  const b = S.boot, st = S.tick.status || {};
  const accts = b.accounts.map((a) => {
    const s = st[a.id] || {};
    const badge = s.state === "auth" ? chip("auth") : s.state === "net" ? chip("net") : s.state === "ok" ? `<span class="chip">${t("acc_watching")}</span>` : "";
    const fix = s.state === "auth" ? (a.auth === "oauth" ? `<button class="btn sm" data-relogin="${a.id}">${t("ms_relogin")}</button>` : `<button class="btn sm" data-fixpw="${a.id}">${t("acc_fix_pw")}</button>`) : "";
    const pwrow = S.fixpw === a.id ? `<div class="row inset"><input class="in grow" id="newpw" type="password" placeholder="${t("acc_new_pw")}"><button class="btn pri sm" data-savepw="${a.id}">${t("btn_save")}</button></div><p class="err row-err" id="pwerr" hidden></p>` : "";
    return `<div class="row"><div class="l"><b>${esc(a.email)}</b><span>${esc(a.imap_host)}${s.last_check ? " · " + esc(t("st_checked", { t: ago(s.last_check) })) : ""}</span></div>${badge}${fix}<button class="btn sm" data-samples="${a.id}">${t("acc_samples")}</button><button class="btn text sm danger" data-rmacct="${a.id}">${t("acc_remove")}</button></div>${pwrow}`;
  }).join("");
  const iv = [1, 2, 5, 10, 30];
  $("#main").innerHTML = `<div class="scroll">${head(t("nav_settings"))}<div class="page narrow">
    <div class="grp"><div class="grp-h"><h2>${t("set_accounts")}</h2></div>
      ${accts ? `<div class="box">${accts}</div>` : ""}
      ${S.addAcct || !b.accounts.length ? `<div class="box pad">${connectForm("sform")}</div>` : `<button class="btn text sm addacct" data-act="add-acct">${I.plus}${t("acc_add")}</button>`}</div>
    <div class="grp"><div class="grp-h"><h2>${t("set_ai")}</h2><a class="link" data-url="https://aistudio.google.com/apikey">${t("ai_get")}</a></div>
      <div class="box"><div class="row"><span class="k">${t("ai_key")}</span><input class="in grow" id="aikey" type="password" placeholder="${t("ai_ph")}"><button class="btn sm" data-act="ai-save">${t("btn_save")}</button>${b.has_ai_key ? `<button class="btn text sm" data-act="ai-clear">${t("btn_clear")}</button>` : ""}</div></div>
      <p class="grp-f" id="aimsg">${b.has_ai_key ? t("ai_on") : t("ai_off")}</p></div>
    <div class="grp"><div class="grp-h"><h2>${t("set_run")}</h2></div>
      <div class="box">
        <div class="row"><div class="l"><b>${t("autostart")}</b><span>${t("autostart_s")}</span></div><label class="switch"><input type="checkbox" id="autostart" ${b.settings.autostart ? "checked" : ""}><i></i></label></div>
        <div class="row"><div class="l"><b>${t("interval")}</b></div><div class="seg" data-seg="interval">${iv.map((n) => `<button data-v="${n * 60}" class="${b.settings.interval_sec === n * 60 ? "on" : ""}">${t("min", { n })}</button>`).join("")}</div></div>
        <div class="row"><div class="l"><b>${t("excel_at")}</b><span class="path">${esc(b.settings.excel_path)}</span></div>${b.platform === "win32" ? `<button class="btn sm" data-act="pick-excel">${t("btn_change")}</button>` : ""}</div>
      </div></div>
    <div class="grp"><div class="grp-h"><h2>${t("set_about")}</h2></div>
      <div class="box"><div class="row"><div class="l"><b>${t("version", { v: b.version })}</b><span id="upmsg">${upMsg(S.tick.update)}</span></div>${S.tick.update && S.tick.update.ready ? `<button class="btn pri sm" data-act="restart">${t("btn_restart")}</button>` : `<button class="btn sm" data-act="update">${t("btn_update")}</button>`}</div></div>
      <div class="foot">${t("foot_name")} ${b.version}<br>${t("foot_mail")}<span class="mail">oilsongchengmin@gmail.com</span><br><a class="link" data-url="https://qianshoulab.github.io/">${t("foot_home")} https://qianshoulab.github.io/</a></div></div>
  </div></div>`;
  const f = $("#sform");
  if (f) { wireForm(f); if (S.focusEmail) { $("[name=email]", f).focus(); S.focusEmail = false; } }
}
function upMsg(u) {
  if (!u) return "";
  if (!u.newer) return t("up_none");
  if (u.ready) return esc(t("up_ready", { v: u.latest }));
  return `${esc(t("up_new", { v: u.latest }))} · <a class="link" data-url="${esc(u.url)}">${t("btn_download")}</a>`;
}

/* ---------- 数据 ---------- */
async function loadBoot() { S.boot = await call("boot"); S.rules = S.boot.rules; }
async function loadMails() { S.mails = await call("mails"); }
async function loadRecs() { S.recs = S.boot && !S.boot.demo ? await call("recs") : []; }
async function reloadAll() {
  await loadBoot();
  await Promise.all([loadMails(), loadRecs(), call("drafts").then((d) => { S.draftCount = d.length; })]);
  S.tick = await call("tick"); S.rev = S.tick.rev;
}

/* ---------- 事件 ---------- */
document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-nav],[data-mail],[data-act],[data-rule],[data-goto-rule],[data-tab],[data-untag],[data-delfield],[data-builtin],[data-mode],[data-move],[data-copy],[data-url],[data-rmacct],[data-fixpw],[data-savepw],[data-relogin],[data-samples],[data-want],[data-release],.seg[data-seg] button,.sg");
  if (!ev.target.closest(".pop,.menu") && !(el && el.classList.contains("sg"))) closePop();
  if (!el) return;
  const d = el.dataset;
  if (el.closest(".seg[data-seg]") && el.tagName === "BUTTON" && !d.mode && !d.tab) {
    const seg = el.closest(".seg");
    $$("button", seg).forEach((x) => x.classList.toggle("on", x === el));
    if (seg.dataset.seg === "interval") { await safe(call("set_setting", "interval_sec", +el.dataset.v)); await loadBoot(); toast(t("toast_saved")); }
    return;
  }
  if (d.nav) { S.view = d.nav; if (d.nav === "inbox" || d.nav === "rules" || d.nav === "recs") { await loadMails(); await loadRecs(); } render(); return; }
  if (d.mail) { S.sel = d.mail; $$(".li").forEach((x) => x.classList.toggle("on", x.dataset.mail === d.mail)); renderReader(); return; }
  if (el.classList.contains("sg")) {
    const m = S.mails.find((x) => x.key === S.sel), g = m.suggest[+d.sg];
    openPop(m, g.start, g.end, el.getBoundingClientRect(), g.name); return;
  }
  if (d.url) { call("open_url", d.url); return; }
  if (d.want) { const m = S.mails.find((x) => x.key === S.sel); S.want = { rule: m.rule.id, name: d.want }; renderReader(); return; }
  if (d.release) { el.disabled = true; const ok = await safe(call("release", d.release)); if (ok) toast(t("toast_saved")); await loadMails(); viewLog(); return; }
  if (d.relogin) { el.disabled = true; el.innerHTML = `<i class="spin"></i>${t("ms_wait")}`; const res = await safe(call("relogin_microsoft", d.relogin)).finally(() => { el.disabled = false; el.textContent = t("ms_relogin"); }); toast(res.ok ? t("toast_saved") : t("err_" + res.code, { d: res.detail || "" })); return; }
  if (d.rule) { S.ruleSel = d.rule; viewRules(); return; }
  if (d.gotoRule) { S.ruleSel = d.gotoRule; S.view = "rules"; render(); return; }
  if (d.tab) { S.tableRule = d.tab; viewTable(); return; }
  if (d.copy != null) { const x = S._drafts[+d.copy]; try { await navigator.clipboard.writeText(x.body); } catch { const ta = document.createElement("textarea"); ta.value = x.body; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } toast(t("copied")); return; }
  if (d.untag && d.untag.startsWith("rec:")) { const st = S.rec[d.untag.slice(4)]; st.forward.splice(+d.i, 1); viewRecs(); return; }
  const r = curRule();
  if (d.untag) { const arr = getPath(r, d.untag); arr.splice(+d.i, 1); if (d.untag === "forward.to") syncForward(r); await safe(call("save_rule", r)); S.hits[r.id] = null; await loadMails(); renderRule(); return; }
  if (d.delfield) { const nr = await safe(call("remove_field", r.id, d.delfield)); Object.assign(r, nr); await loadMails(); renderRule(); return; }
  if (d.builtin) { const nr = await safe(call("add_builtin", r.id, d.builtin)); Object.assign(r, nr); await loadMails(); renderRule(); return; }
  if (d.mode) { r.reply.mode = d.mode; await safe(call("save_rule", r)); renderRule(); return; }
  if (d.move) { await safe(call("move_rule", r.id, +d.move)); await reloadAll(); viewRules(); return; }
  if (d.rmacct) { const a = S.boot.accounts.find((x) => x.id === d.rmacct); const res = await safe(call("remove_account", d.rmacct)); await reloadAll(); render(); undoToast(t("removed_acct", { e: a ? a.email : "" }), res.undo); return; }
  if (d.samples) { el.disabled = true; await safe(call("refresh_samples")); await reloadAll(); toast(t("toast_saved")); el.disabled = false; render(); return; }
  if (d.fixpw) { S.fixpw = d.fixpw; viewSettings(); $("#newpw")?.focus(); return; }
  if (d.savepw) {
    const pw = $("#newpw").value; if (!pw) return;
    el.disabled = true;
    const res = await safe(call("update_password", d.savepw, pw)).finally(() => (el.disabled = false));
    if (res.ok) { S.fixpw = null; toast(t("toast_saved")); viewSettings(); }
    else { const e = $("#pwerr"); e.hidden = false; e.innerHTML = `${I.warn}<span>${esc(t("err_" + res.code))}</span>`; }
    return;
  }
  switch (d.act) {
    case "try-demo": S.tryDemo = true; S.view = "inbox"; render(); break;
    case "to-welcome": S.tryDemo = false; render(); break;
    case "add-acct": S.addAcct = true; viewSettings(); $("#sform [name=email]")?.focus(); break;
    case "connect": await doConnect(el.closest("form"), el); break;
    case "accept": await acceptRecs(el); break;
    case "auto-off": case "auto-on": { const on = d.act === "auto-on"; await safe(call("set_setting", "autostart", on)); await loadBoot(); S.autostartNote = on ? "on" : "off"; render(); break; }
    case "run-now": { el.disabled = true; el.classList.add("busy"); const res = await safe(call("run_now")).finally(() => el.classList.remove("busy")); await reloadAll(); toast(t("ran", { n: res.new })); render(); break; }
    case "rule-from": { const m = S.mails.find((x) => x.key === S.sel); const nr = await safe(call("new_rule", m.key)); toast(t("toast_rule", { r: nr.name })); await reloadAll(); render(); break; }
    case "new-rule": { const nr = await safe(call("new_rule", null, null)); await reloadAll(); S.ruleSel = nr.id; viewRules(); setTimeout(() => $("#rname")?.select(), 30); break; }
    case "del-rule": { const name = r.name; const res = await safe(call("delete_rule", r.id)); await reloadAll(); S.ruleSel = null; viewRules(); undoToast(t("deleted_rule", { r: name }), res.undo); break; }
    case "try": {
      const m = S.mails.find((x) => x.rule && x.rule.id === r.id); if (!m) return;
      el.innerHTML = '<i class="spin"></i>'; el.disabled = true;
      const res = await safe(call("try_draft", r.id, m.key));
      S.tries[r.id] = { ...res, subj: m.subject }; renderRule(); break;
    }
    case "open-excel": if (!(await call("open_excel"))) toast(t("table_empty")); break;
    case "show-folder": call("show_excel_folder"); break;
    case "flush": { const res = await safe(call("flush_excel")); viewTable(); if (res.locked) toast(t("pending_note", { n: res.waiting })); break; }
    case "adv": { const a = $(".adv", el.closest("form")); a.hidden = !a.hidden; break; }
    case "ai-save": case "ai-clear": {
      const key = d.act === "ai-clear" ? "" : $("#aikey").value.trim();
      if (d.act === "ai-save" && !key) return;
      el.disabled = true;
      const res = await safe(call("set_ai_key", key)).finally(() => (el.disabled = false));
      if (res.ok) { await loadBoot(); viewSettings(); $("#aimsg").textContent = res.cleared ? t("ai_off") : t("ai_saved"); }
      else { const m = $("#aimsg"); m.classList.add("err"); m.innerHTML = `${I.warn}<span>${esc(t("err_" + res.code, { d: res.detail || "" }))}</span>`; }
      break;
    }
    case "pick-excel": { const p = await call("pick_excel"); if (p) { await call("set_setting", "excel_path", p); await loadBoot(); viewSettings(); } break; }
    case "update": {
      $("#upmsg").textContent = t("up_checking"); el.disabled = true;
      const u = await call("check_update").finally(() => (el.disabled = false));
      S.tick.update = u;
      if (S.view === "settings") viewSettings();
      if (!u) $("#upmsg").textContent = t("up_fail");
      renderSide();
      break;
    }
    case "pop-close": closePop(); break;
    case "want-cancel": S.want = null; renderReader(); break;
    case "restart": el.disabled = true; call("restart_update"); break;
    case "ms-login": {
      const f = el.closest("form"); const email = $("[name=email]", f).value.trim(); if (!email) return;
      el.disabled = true; el.innerHTML = `<i class="spin"></i>${t("ms_wait")}`;
      const res = await safe(call("add_microsoft", email)).finally(() => { el.disabled = false; el.textContent = t("ms_btn"); });
      if (res.ok) { S.tryDemo = false; S.autostartNote = res.autostart ? "on" : null; await reloadAll(); S.view = res.recs ? "recs" : "inbox"; render(); }
      else { const e = $(".err", f); e.hidden = false; e.innerHTML = `${I.warn}<span>${esc(t("err_" + res.code, { d: res.detail || "" }))}</span>`; }
      break;
    }
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
  const tagin = el.dataset && el.dataset.tagin;
  if (tagin && (ev.key === "Enter" || ev.key === ",")) {
    ev.preventDefault();
    const v = el.value.trim().replace(/[,，]$/, ""); if (!v) return;
    if (tagin.startsWith("rec:")) { const st = S.rec[tagin.slice(4)]; if (!st.forward.includes(v)) st.forward.push(v); viewRecs(); $(`[data-tagin="${tagin}"]`)?.focus(); return; }
    const r = curRule(); getPath(r, tagin).push(v);
    if (tagin === "forward.to") syncForward(r);
    call("save_rule", r).then(async () => { S.hits[r.id] = null; await loadMails(); renderRule(); $(`[data-tagin="${tagin}"]`)?.focus(); });
    return;
  }
  if (tagin && ev.key === "Backspace" && !el.value) {
    if (tagin.startsWith("rec:")) { const st = S.rec[tagin.slice(4)]; if (st.forward.length) { st.forward.pop(); viewRecs(); $(`[data-tagin="${tagin}"]`)?.focus(); } return; }
    const r = curRule(), arr = getPath(r, tagin); if (!arr.length) return;
    arr.pop(); if (tagin === "forward.to") syncForward(r);
    call("save_rule", r).then(() => { renderRule(); $(`[data-tagin="${tagin}"]`)?.focus(); });
  }
  if (ev.key === "Enter" && el.closest && el.closest("form.cform") && el.tagName === "INPUT") { ev.preventDefault(); const f = el.closest("form"); doConnect(f, $("[data-act=connect]", f)); }
  if (ev.key === "Enter" && el.id === "newpw") { $("[data-savepw]")?.click(); }
  if (ev.key === "Escape") closePop();
});
document.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (el.dataset.recon) { recState(S.recs.find((r) => r.id === el.dataset.recon)).on = el.checked; viewRecs(); return; }
  const r = curRule();
  if (el.dataset.toggle) { setPath(r, el.dataset.toggle, el.checked); await safe(call("save_rule", r)); await loadMails(); renderRule(); return; }
  if (el.dataset.fname) { const nr = await safe(call("rename_field", r.id, el.dataset.fname, el.value)); Object.assign(r, nr); await loadMails(); renderRule(); return; }
  if (el.id === "autostart") { await safe(call("set_setting", "autostart", el.checked)); await loadBoot(); return; }
});
document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.dataset.recname) { recState(S.recs.find((r) => r.id === el.dataset.recname)).name = el.value; return; }
  const r = curRule();
  if (el.id === "rname" && r) { editing(); r.name = el.value.trim() || r.name; saveRuleSoon(r); const li = $(`.ri[data-rule="${r.id}"] b`); if (li) li.textContent = r.name; return; }
  if (el.dataset.text && r) { editing(); setPath(r, el.dataset.text, el.value); saveRuleSoon(r); }
});

/* ---------- 心跳 ---------- */
async function heartbeat() {
  if (Date.now() < editingUntil) return;      // 改着呢，等存完再对一遍
  try {
    const tk = await call("tick");
    const changed = tk.rev !== S.rev;
    const recsChanged = (tk.recs || 0) !== ((S.tick && S.tick.recs) || 0);
    S.tick = tk;
    if (changed && S.rev !== -1 && !welcoming()) {
      await loadBoot(); await Promise.all([loadMails(), loadRecs()]);
      if (S.view === "inbox") viewInbox();
      if (S.view === "log") viewLog();
      if (S.view === "drafts") viewDrafts();
      if (S.view === "recs" && recsChanged) viewRecs();
    }
    S.rev = tk.rev;
    if (!welcoming()) renderSide();
  } catch (e) { /* 后台忙，下次再问 */ }
}

async function start() {
  await reloadAll();
  if (S.recs.length && !S.rules.length) S.view = "recs";
  render();
  document.documentElement.classList.add("ready");
  setInterval(heartbeat, 4000);
}
/* 从托盘打开窗口时（app.py 调）：有没看过的拟稿，直接摆出来——人点开就是来看它的 */
window.zkShown = async () => {
  if (!started) return;
  await reloadAll();
  if (S.recs.some((r) => !S.seen.has(r.id))) S.view = "recs";
  render();
};

let started = false;
const go = () => { if (!started) { started = true; start(); } };
if (window.pywebview && window.pywebview.api && window.pywebview.api.boot) go();
else {
  window.addEventListener("pywebviewready", go);
  // 浏览器里开发调试（devserver）：没有 pywebview，直接走 HTTP
  setTimeout(() => { if (!window.pywebview) go(); }, 600);
}
