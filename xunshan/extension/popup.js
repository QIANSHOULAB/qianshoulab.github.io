/* 巡山僧弹窗：一打开就认这页的价格、库存（同一网站以前框过的那块也认），点一下就盯上；
   盯上的那条就地改条件、改频率、撤销。认不出的再自己框，或者盯整页。 */
const { t, ui, store, rules } = QS;
const $ = s => document.querySelector(s);
QS.applyT();

const qp = new URLSearchParams(location.search);
const S = { tab: null, ok: false, cands: null, ws: {}, open: null, draft: {}, busy: new Set() };
const okUrl = u => /^https?:\/\//.test(u || '') && !/^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com|microsoftedge\.microsoft\.com\/addons)/.test(u);
const originPat = u => { const x = new URL(u); return x.protocol + '//' + x.hostname + '/*'; };
const send = msg => chrome.runtime.sendMessage(msg);
const KIND = { price: ['kindPrice', 'tag'], stock: ['kindStock', 'box'], seats: ['kindSeats', 'seat'], known: ['kindKnown', 'pin'], pick: ['partPage', 'crop'], page: ['wholePage', 'page'] };
const kindName = c => c.kind === 'known' && c.label ? c.label : t((KIND[c.kind] || KIND.pick)[0]);
const kindIcon = k => ui.ICON[(KIND[k] || KIND.pick)[1]];
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();

async function getTab() {
  if (qp.get('tab')) return chrome.tabs.get(+qp.get('tab'));
  const [x] = await chrome.tabs.query({ active: true, currentWindow: true });
  return x;
}

/* ---------- 在网页上认 + 指给人看 ---------- */
async function detect() {
  const known = rules.knownFor(S.ws, S.tab.url);
  try {
    await chrome.scripting.executeScript({ target: { tabId: S.tab.id }, files: ['lib/page.js', 'lib/detect.js'] });
    const [r] = await chrome.scripting.executeScript({ target: { tabId: S.tab.id }, func: k => globalThis.QS.detect.serialize(document, k), args: [known] });
    return (r && r.result) || [];
  } catch (e) { return []; }
}
// 在网页上把那块圈出来：悬停时圈着，盯上时闪一下「盯上了」
function mark(selector, label) {
  chrome.scripting.executeScript({
    target: { tabId: S.tab.id },
    args: [selector || null, label || ''],
    func: (sel, label) => {
      let h = document.querySelector('qianshou-mark');
      if (h) h.remove();
      if (!sel) return;
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      h = document.createElement('qianshou-mark');
      h.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
      const root = h.attachShadow({ mode: 'closed' });
      root.innerHTML = `<style>.b{position:fixed;border-radius:10px;border:2px solid #4E5BD6;background:rgba(78,91,214,.10);transition:opacity .3s cubic-bezier(.2,.8,.2,1)}
        .l{position:absolute;left:-2px;top:-30px;height:24px;padding:0 8px;border-radius:8px;background:#4E5BD6;color:#fff;font:600 13px/24px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei UI",sans-serif;white-space:nowrap}</style>
        <div class="b" style="left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px">${label ? '<span class="l"></span>' : ''}</div>`;
      if (label) root.querySelector('.l').textContent = label;
      document.documentElement.appendChild(h);
      if (label) setTimeout(() => { const b = root.querySelector('.b'); if (b) b.style.opacity = '0'; setTimeout(() => h.remove(), 320); }, 1600);
    }
  }).catch(() => {});
}

/* ---------- 画 ---------- */
const watchOf = c => Object.values(S.ws).find(w => w.url === S.tab.url && w.selector === c.selector);
const wholeOf = () => Object.values(S.ws).find(w => w.url === S.tab.url && !w.selector);
function errText(w) {
  const m = { fetch: t('errFetch', w.errDetail || '?'), blocked: t('errBlocked'), gone: t('errGone'), login: t('errLogin'), perm: t('errPerm') };
  return m[w.err] || t('error');
}
function sub(w) {
  const numeric = w.selector && (w.numeric || w.lastNum != null);
  const types = w.selector ? rules.condTypes(numeric) : ['any'];
  const c = w.cond || { type: 'any' };
  const type = S.draft[w.id] || c.type;
  const need = rules.needsValue(type);
  const val = c.type === type && c.value != null ? c.value : '';
  const ph = type === 'gone' ? t('condGonePh') : type === 'has' ? t('condHasPh') : t('condNumPh');
  const seg = types.length > 1 ? `<div class="sub-l"><div class="seg" role="group" aria-label="${t('condWhen')}">${types.map(x => `<button type="button" data-c="${x}" aria-pressed="${x === type}">${t('seg' + x[0].toUpperCase() + x.slice(1))}</button>`).join('')}</div></div>` : '';
  const fix = w.err ? `<div class="fix">${ui.esc(errText(w))}${w.err === 'perm' ? `<button class="btn txt" data-a="grant" data-id="${w.id}">${t('fixGrant')}</button>` : ''}</div>` : '';
  const anim = S.anim === w.id; S.anim = null;
  return `<div class="sub${anim ? ' anim' : ''}" data-id="${w.id}">${fix}${seg}${need ? `<input class="inp" id="cv" value="${ui.esc(val)}" placeholder="${ph}" ${numeric ? 'inputmode="decimal"' : ''} aria-label="${t('condWhen')}">` : ''}
    <button class="pick" data-a="iv" data-id="${w.id}">${t('every')} ${rules.ivLabel(w.interval)}${ui.ICON.down}</button></div>`;
}
function onRow(w, title, icon) {
  const first = w.lastText == null && !w.err;
  const recent = Date.now() - (w.created || 0) < 10 * 60e3;
  const s = w.err ? (recent ? `<div class="s warn">${t('error')}</div>` : '') : first ? `<div class="s">${t('firstLook')}</div>` : `<div class="s ok">${t('added')} · ${ui.esc(rules.condLabel(w.cond))}</div>`;
  const v = w.selector && w.lastText != null ? `<div class="v">${ui.esc(oneLine(w.lastText).slice(0, 60))}</div>` : '';
  return `<div class="row cand on" data-id="${w.id}">
      <span class="ic ${w.err ? '' : 'on'}">${w.err ? ui.ICON.alert : first ? '<span class="spin"></span>' : ui.ICON.check}</span>
      <button class="grow" data-a="toggle" data-id="${w.id}" style="text-align:left" aria-expanded="${S.open === w.id}"><div class="t">${ui.esc(title)}</div>${v}${s}</button>
      <span class="end">${Date.now() - (w.created || 0) < 10 * 60e3 ? `<button class="btn txt" data-a="undo" data-id="${w.id}">${t('undo')}</button>` : status(w)}</span></div>` + (S.open === w.id || (w.err && S.open !== '-' + w.id) ? sub(w) : '');
}
function renderHere() {
  const el = $('#cands');
  if (!S.ok) {
    el.innerHTML = `<div class="row note"><span class="ic">${ui.ICON.alert}</span><div class="grow"><div class="t" style="color:var(--fg)">${t('cantHere')}</div><div class="s" style="white-space:normal">${t('cantHereSub')}</div></div></div>`;
    return;
  }
  if (S.cands == null) { el.innerHTML = `<div class="row note"><span class="ic"><span class="spin"></span></span><div class="grow">${t('detecting')}</div></div>`; return; }
  let html = '';
  S.cands.forEach((c, i) => {
    const w = watchOf(c);
    if (w) { html += onRow(w, kindName(c), kindIcon(c.kind)); return; }
    html += `<button class="row cand" data-k="${i}" ${S.busy.has(i) ? 'disabled' : ''}>
      <span class="ic">${kindIcon(c.kind)}</span>
      <div class="grow"><div class="t">${ui.esc(kindName(c))}</div><div class="v">${ui.esc(oneLine(c.text).slice(0, 60))}</div></div>
      <span class="end">${S.busy.has(i) ? '<span class="spin"></span>' : `<span class="go">${t('watchIt')}</span>`}</span></button>`;
  });
  // 这页上盯着、但这回没认出来的那几块（自己框的、网页正出验证码的），也列在这儿
  for (const w of Object.values(S.ws)) if (w.url === S.tab.url && w.selector && !S.cands.some(c => c.selector === w.selector)) html += onRow(w, String(w.label || '').split(' · ').pop() || t('partPage'), 'crop');
  html += `<button class="row" data-a="pick"><span class="ic">${ui.ICON.crop}</span><div class="grow"><div class="t">${t('pickPart')}</div>${S.cands.length ? '' : `<div class="s">${t('nothingFound')}</div>`}</div>${ui.ICON.chev.replace('<svg', '<svg class="chev"')}</button>`;
  const whole = wholeOf();
  html += whole ? onRow(whole, t('watchPage'), 'page')
    : `<button class="row" data-a="whole"><span class="ic">${ui.ICON.page}</span><div class="grow"><div class="t">${t('watchPage')}</div></div>${ui.ICON.chev.replace('<svg', '<svg class="chev"')}</button>`;
  el.innerHTML = html;
}
function status(w) {
  if (w.demo) return `<span class="chip">${t('demoChip')}</span>`;
  if (w.paused) return `<span class="chip">${t('paused')}</span>`;
  if (w.err) return `<span class="chip err">${t('error')}</span>`;
  if (w.unread) return `<span class="chip hit">${t('hitPill')}</span>`;
  if (w.fresh) return `<span class="chip">${t('changed')}</span>`;
  return '';
}
function valueOf(w) {
  if (w.err && !w.paused) return `<span style="color:var(--warn-fg)">${ui.esc(errText(w))}</span>`;
  if (w.lastText == null) return t('waitingFirst');
  if (!w.selector) return ui.esc(w.lastNew ? t('newPrefix') + w.lastNew : (w.title || ui.host(w.url)));
  return `<span class="v">${ui.esc(oneLine(w.lastText).slice(0, 60))}</span> · ${ui.esc(rules.condLabel(w.cond))}`;
}
function renderList() {
  const all = Object.values(S.ws);
  const here = S.ok ? all.filter(w => w.url === S.tab.url) : [];
  const ws = all.filter(w => !here.includes(w)).sort((a, b) => (b.unread - a.unread) || (!!b.err - !!a.err) || ((b.lastChange || b.created) - (a.lastChange || a.created)));
  const shown = ws.slice(0, 4);
  $('#allN').textContent = all.length || '';
  const hits = all.filter(w => w.unread).length;
  $('#duty').textContent = hits ? t('onDutyHit', hits) : all.length ? t('onDuty', all.length) : t('onDutyIdle');
  $('#dutyDot').className = 'dot ' + (hits ? 'hit' : 'on');
  $('#list').innerHTML = shown.map(w => `
    <button class="row it" data-open="${w.id}">${ui.avatar(w.url)}
      <div class="grow"><div class="t">${ui.esc(w.label || w.title || ui.host(w.url))}</div><div class="s">${valueOf(w)}</div></div>
      <span class="end">${status(w)}<span class="tn">${ui.ago(w.lastChange || w.lastCheck)}</span></span></button>`).join('')
    + (ws.length > shown.length ? `<a class="row more" href="app.html" target="_blank"><div class="grow">${t('openAll')} ${t('count', all.length)}</div>${ui.ICON.chev.replace('<svg', '<svg class="chev"')}</a>` : '');
  $('#mine').hidden = !shown.length;
  $('#empty').hidden = all.length > 0;
}
function render() {
  const ae = document.activeElement;
  const typing = ae && ae.id === 'cv' ? { v: ae.value, s: ae.selectionStart } : null;
  renderHere(); renderList();
  if (typing) { const i = $('#cv'); if (i) { i.value = typing.v; i.focus(); i.setSelectionRange(typing.s, typing.s); } }
}

/* ---------- 动作 ---------- */
async function needPerm() {
  const pat = originPat(S.tab.url);
  if (await chrome.permissions.contains({ origins: [pat] })) return true;
  return chrome.permissions.request({ origins: [pat] }).catch(() => false);
}
// 先记下来再要权限：浏览器问「允许」的时候弹窗就算被关了，放行后后台照样接着看
async function addWatch(watch) {
  const pat = originPat(S.tab.url);
  const has = await chrome.permissions.contains({ origins: [pat] });
  const w = await send({ type: 'add', wait: false, hold: !has, watch });
  if (!w || !w.id) return null;
  if (!has) {
    const ok = await chrome.permissions.request({ origins: [pat] }).catch(() => false);
    if (!ok) { await send({ type: 'remove', id: w.id }); ui.toast(t('permDenied')); return null; }
    send({ type: 'checkNow', id: w.id });
  }
  return w;
}
async function addCand(i) {
  const c = S.cands[i];
  if (S.busy.has(i)) return;
  S.busy.add(i); render();
  const base = (S.tab.title || ui.host(S.tab.url)).replace(/\s+/g, ' ').trim().slice(0, 50);
  const kind = c.kind === 'known' ? 'pick' : c.kind;
  const w = await addWatch({ url: S.tab.url, title: S.tab.title, kind, label: base + ' · ' + kindName(c), selector: c.selector, alts: c.alts, anchor: c.anchor, pickedText: c.text });
  S.busy.delete(i);
  if (w) { S.ws[w.id] = w; S.open = S.anim = w.id; mark(c.selector, t('added')); }
  render();
}
async function addWhole() {
  const w = await addWatch({ url: S.tab.url, title: S.tab.title, selector: null });
  if (w) { S.ws[w.id] = w; S.open = w.id; }
  render();
}
async function startPick() {
  if (!(await needPerm())) return ui.toast(t('permDenied'));
  await chrome.scripting.executeScript({ target: { tabId: S.tab.id }, files: ['lib/strings.js', 'lib/page.js', 'lib/picker.js', 'core/rules.js', 'content/pick.js'] });
  if (!qp.get('tab')) window.close();
}
let saveT = null;
function saveVal(id, now) {
  clearTimeout(saveT);
  const go = () => {
    const w = S.ws[id], i = $('#cv'); if (!w || !i) return;
    const type = S.draft[id] || (w.cond || {}).type;
    const raw = i.value.trim();
    const v = type === 'below' || type === 'above' ? QS_parse(raw) : raw;
    if (v == null || v === '') return;
    delete S.draft[id];
    send({ type: 'patch', id, patch: { cond: { type, value: v } } });
  };
  if (now) go(); else saveT = setTimeout(go, 600);
}
const QS_parse = s => { const m = String(s).replace(/[,，\s]/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };

document.addEventListener('click', async e => {
  const k = e.target.closest('[data-k]');
  if (k) return addCand(+k.dataset.k);
  const c = e.target.closest('[data-c]');
  if (c) {
    const id = c.closest('.sub').dataset.id, w = S.ws[id], type = c.dataset.c;
    if (rules.needsValue(type)) {
      const keep = w.cond && w.cond.type === type && w.cond.value != null;
      const guess = type === 'gone' ? (String(w.lastText || '').match(/暂时缺货|缺货|无货|售罄|已售完|sold out|out of stock/i) || [])[0] : null;
      if (keep) { delete S.draft[id]; send({ type: 'patch', id, patch: { cond: w.cond } }); }
      else if (guess) { delete S.draft[id]; send({ type: 'patch', id, patch: { cond: { type, value: guess } } }); }
      else S.draft[id] = type; // 等人填了数再存
      render();
      const i = $('#cv'); if (i) i.focus();
    } else { delete S.draft[id]; send({ type: 'patch', id, patch: { cond: { type } } }); }
    return;
  }
  const a = e.target.closest('[data-a]');
  if (a) {
    const id = a.dataset.id, w = id && S.ws[id];
    if (a.dataset.a === 'pick') return startPick();
    if (a.dataset.a === 'whole') return addWhole();
    if (a.dataset.a === 'toggle') { const shown = S.open === id || (w && w.err && S.open !== '-' + id); S.open = shown ? '-' + id : id; if (!shown) S.anim = id; render(); return; }
    if (a.dataset.a === 'undo' && w) { await send({ type: 'remove', id }); delete S.ws[id]; if (S.open === id) S.open = null; mark(null); render(); ui.toast(t('undone')); return; }
    if (a.dataset.a === 'iv' && w) {
      ui.menu(a, rules.IV.map(m => ({ v: m, label: t('every') + ' ' + rules.ivLabel(m) })), w.interval, v => send({ type: 'patch', id, patch: { interval: +v } }));
      return;
    }
    if (a.dataset.a === 'grant' && w) {
      const ok = await chrome.permissions.request({ origins: [originPat(w.url)] }).catch(() => false);
      if (ok) send({ type: 'checkNow', id });
      return;
    }
  }
  const o = e.target.closest('[data-open]');
  if (o) { chrome.tabs.create({ url: chrome.runtime.getURL('app.html#' + o.dataset.open) }); if (!qp.get('tab')) window.close(); }
});
document.addEventListener('input', e => { if (e.target.id === 'cv') saveVal(e.target.closest('.sub').dataset.id); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'cv') { saveVal(e.target.closest('.sub').dataset.id, true); e.target.blur(); } });
document.addEventListener('mouseover', e => {
  const k = e.target.closest('[data-k]');
  const on = e.target.closest('.row.on');
  const sel = k ? S.cands[+k.dataset.k].selector : on && S.ws[on.dataset.id] ? S.ws[on.dataset.id].selector : null;
  if (sel !== S.hover) { S.hover = sel; if (S.ok) mark(sel); }
});
$('#demo').addEventListener('click', async () => { const w = await send({ type: 'demo' }); if (w) S.ws[w.id] = w; render(); });

(async () => {
  S.tab = await getTab().catch(() => null);
  S.ok = !!(S.tab && okUrl(S.tab.url));
  S.ws = await store.get('watches', {});
  if (S.ok) $('#hereHost').textContent = ui.host(S.tab.url);
  render();
  store.onChange(async ch => { if (ch.watches) { S.ws = ch.watches.newValue || {}; render(); } });
  if (S.ok) { S.cands = await detect(); render(); }
})();
