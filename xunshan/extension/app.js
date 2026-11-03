/* 巡山僧总览：全部盯梢、一次加一串网址、变化记录、前后对比、导入导出、设置。 */
const { t, ui, store, rules } = QS;
const $ = s => document.querySelector(s);
// 不跟数据走的字：开头画一次，换语言再画一次
function words() {
  QS.applyT();
  ui.docLang(() => t('app'));
  $('#addBtn').innerHTML = ui.ICON.plus + '<span>' + t('addMany') + '</span>';
  $('#imp').textContent = t('importBtn');
  $('#exp').textContent = t('exportBtn');
  $('#gear').innerHTML = ui.ICON.gear;
}
$('#ver').textContent = chrome.runtime.getManifest().version;

const hash0 = location.hash.slice(1);
const S = { ws: {}, sel: hash0 && hash0 !== 'add' ? hash0 : null, hist: [], shots: {}, open: null, pendingOrigins: [], draft: null };
const send = msg => chrome.runtime.sendMessage(msg);
const name = w => rules.labelOf(w) || w.title || ui.host(w.url);
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
const isNum = w => w.selector && w.lastNum != null && oneLine(w.lastText).length < 40;
const parseNum = s => { const m = String(s).replace(/[,，\s]/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };

function status(w) {
  if (w.demo) return `<span class="chip">${t('demoChip')}</span>`;
  if (w.paused) return `<span class="chip">${t('paused')}</span>`;
  if (w.err) return `<span class="chip err">${t('error')}</span>`;
  if (w.unread) return `<span class="chip hit">${t('hitPill')}</span>`;
  if (w.fresh) return `<span class="chip">${t('changed')}</span>`;
  return '';
}
// 列表副标题：框选的放当前值；整页放「新增了什么」，没有就放网页标题
const sub = w => w.lastText == null ? t('waitingFirst') : !w.selector ? (w.lastNew ? t('newPrefix') + w.lastNew : (w.title || ui.host(w.url))) : oneLine(w.lastText).slice(0, 70);
function errText(w) {
  const m = { fetch: t('errFetch', w.errDetail || '?'), blocked: t('errBlocked'), gone: t('errGone'), login: t('errLogin'), perm: t('errPerm') };
  return m[w.err] || t('error');
}
function sorted() {
  return Object.values(S.ws).sort((a, b) => (b.unread - a.unread) || ((b.lastChange || b.created) - (a.lastChange || a.created)));
}

function renderTop(list) {
  const hits = list.filter(w => w.unread).length;
  $('#duty').textContent = hits ? t('onDutyHit', hits) : list.length ? t('onDuty', list.length) : t('onDutyIdle');
  $('#dutyDot').className = 'dot ' + (hits ? 'hit' : 'on');
  $('#readAll').hidden = !list.some(w => w.unread || w.fresh);
}
function renderList() {
  const list = sorted();
  renderTop(list);
  $('#cnt').textContent = t('count', list.length);
  $('#hero').hidden = list.length > 0 || !$('#add').hidden;
  $('#main').hidden = list.length === 0;
  if (!S.ws[S.sel]) S.sel = list[0] ? list[0].id : null;
  $('#lst').innerHTML = list.map(w => `
    <button class="row li" data-id="${w.id}" aria-current="${w.id === S.sel}">
      ${ui.avatar(w.url)}
      <div class="grow"><div class="t">${ui.esc(name(w))}</div><div class="s">${ui.esc(sub(w))}</div></div>
      <span class="end">${status(w)}<span class="tn">${ui.ago(w.lastChange || w.lastCheck)}</span></span>
    </button>`).join('');
}

function condCtl(w) {
  const c = w.cond || { type: 'any' };
  const numeric = (w.selector && (w.numeric || w.lastNum != null)) || c.type === 'below' || c.type === 'above' || c.type === 'drop';
  const types = w.selector ? rules.condTypes(numeric) : ['any'];
  const type = S.draft || c.type;
  const ph = type === 'gone' ? t('condGonePh') : type === 'has' ? t('condHasPh') : t('condNumPh');
  const val = c.type === type && c.value != null ? c.value : '';
  return (types.length > 1 ? `<div class="seg" id="cseg" role="group">${types.map(o => `<button type="button" data-c="${o}" aria-pressed="${type === o}">${t('seg' + o[0].toUpperCase() + o.slice(1))}</button>`).join('')}</div>` : `<span class="muted">${t('condAny')}</span>`)
    + (rules.needsValue(type) ? `<input class="inp" id="cval" value="${ui.esc(val)}" placeholder="${ph}" ${numeric ? 'inputmode="decimal"' : ''} aria-label="${t('condWhen')}">` : '');
}

function histRows(w) {
  const h = S.hist.slice().reverse();
  if (h.length <= 1) return `<div class="none">${t('noHistory')}</div>` + (h[0] && S.shots[h[0].t] ? `<div class="he">${shotPair(h, 0)}</div>` : '');
  return h.map((e, i) => {
    const prev = h[i + 1];
    let chg = '';
    if (w.selector && prev && e.num != null && prev.num != null && e.num !== prev.num) chg = `<span class="chg">${rules.fmtNum(prev.num)} → ${rules.fmtNum(e.num)}</span>`;
    const tag = (e.first ? `<span class="chip tag">${t('firstSeen')}</span>` : (e.hit ? `<span class="chip hit tag">${t('hitTag')}</span>` : ''))
      + (e.moved ? `<span class="chip tag">${t('movedTag')}</span>` : '');
    const open = S.open === e.t;
    let body = `<div class="he-s">${ui.esc(e.added ? t('newPrefix') + e.added.join(' · ') : oneLine(e.text).slice(0, 140))}</div>`;
    if (open && prev) {
      const d = QS.diff(prev.text, e.text);
      body = `<div class="dif">${d.map(p => p.op === '+' ? `<ins>${ui.esc(p.s)}</ins>` : p.op === '-' ? `<del>${ui.esc(p.s)}</del>` : `<span class="ctx">${ui.esc(p.s)}</span>`).join('')}</div>
        <div class="dif-l"><span><i style="background:var(--del)"></i>${t('before')}</span><span><i style="background:var(--ins)"></i>${t('after')}</span></div>`;
    } else if (open) body = `<div class="dif">${ui.esc(e.text)}</div>`;
    if (open) body += shotPair(h, i);
    return `<div class="he" role="button" tabindex="0" data-t="${e.t}" aria-expanded="${open}"><div class="he-t"><span class="tm">${ui.stamp(e.t)}</span>${chg}${tag}</div>${body}</div>`;
  }).join('');
}

// 截图前后对比：这一条的照片，配上更早一条有照片的
function shotPair(h, i) {
  const cur = S.shots[h[i].t];
  if (!cur) return '';
  const old = h.slice(i + 1).find(x => S.shots[x.t]);
  const fig = (s, cap) => `<figure><img src="${s.src}" width="${s.cw || s.w / 2}" height="${s.ch || s.h / 2}" alt="${ui.esc(cap)}" loading="lazy"><figcaption>${ui.esc(cap)}</figcaption></figure>`;
  return `<div class="shots${old ? '' : ' one'}">${old ? fig(S.shots[old.t], t('before') + ' · ' + ui.stamp(old.t)) : ''}${fig(cur, (old ? t('after') : t('shotNow')) + ' · ' + ui.stamp(h[i].t))}</div>`;
}

function where(w) {
  if (!w.selector) return t('wholePage');
  const k = { price: 'kindPrice', stock: 'kindStock', seats: 'kindSeats' }[w.kind];
  return k ? t('autoPart', t(k)) : t('partPage');
}
function renderDet() {
  const w = S.ws[S.sel];
  if (!w) { $('#det').innerHTML = `<div class="none">${t('selectOne')}</div>`; return; }
  const checking = w.checkingSince && Date.now() - w.checkingSince < 60000;
  const big = w.lastText == null ? `<div class="big txt">${t('waitingFirst')}</div>`
    : isNum(w) ? `<div class="big">${ui.esc(oneLine(w.lastText))}</div>`
      : `<div class="big txt" id="bigTxt">${ui.esc(w.lastText)}</div>`;
  const ae = document.activeElement;
  const keep = ae && (ae.id === 'ttl' || ae.id === 'cval') ? { id: ae.id, v: ae.value, s: ae.selectionStart } : null;
  const fix = w.err === 'perm' ? `<button class="btn pri" data-a="perm">${t('fixGrant')}</button>` : (w.err === 'blocked' || w.err === 'login') ? `<button class="btn" data-a="open">${t('fixOpen')}</button>` : '';
  $('#det').innerHTML = `
    <div class="dh">${ui.avatar(w.url)}
      <div class="dh-m"><input class="ttl" id="ttl" value="${ui.esc(name(w))}" aria-label="${t('rename')}" spellcheck="false">
        <a class="dh-host" href="#" data-a="open"><span>${ui.esc(w.url)}</span>${ui.ICON.ext}</a></div>
    </div>
    <section class="group now">
      <div class="now-l"><span>${t('current')}</span><span title="${ui.esc(w.selector || '')}">${where(w)}</span></div>
      ${big}
      <div class="stat"><span class="dot ${w.paused ? 'off' : w.err ? 'err' : w.unread ? 'hit' : 'on'}"></span>
        <span>${checking ? t('checking') : w.lastCheck ? t('lastCheck', ui.ago(w.lastCheck)) : t('waitingFirst')}</span>
        ${!w.paused && w.nextCheck && !checking ? `<span>· ${t('nextCheck', ui.until(w.nextCheck))}</span>` : ''}
        <span>· ${ui.esc(rules.condLabel(w.cond))}</span></div>
      ${w.err ? `<div class="err-box"><span>${ui.esc(errText(w))}</span>${fix}</div>` : ''}
      ${w.demo ? `<div class="demo-note">${t('demoNote')}</div>` : ''}
    </section>
    <section class="group ctl">
      <div class="row"><div class="grow">${t('condWhen')}</div><div class="r">${condCtl(w)}</div></div>
      <div class="row"><div class="grow">${t('frequency')}</div><div class="r"><button class="pick" id="civ" data-a="iv">${rules.every(w.interval)}${ui.ICON.down}</button></div></div>
      <div class="row"><div class="grow">${t('pause')}</div><div class="r"><button class="toggle" role="switch" id="cpause" aria-checked="${!!w.paused}" aria-label="${t('pause')}"></button></div></div>
      <div class="row acts"><button class="btn" data-a="now" ${checking || w.demo ? 'disabled' : ''}>${ui.ICON.refresh}<span>${t('checkNow')}</span></button>
        <button class="btn" data-a="open">${ui.ICON.ext}<span>${t('open')}</span></button><span class="sp"></span>
        <button class="btn txt danger" data-a="del">${ui.ICON.trash}<span>${t('remove')}</span></button></div>
    </section>
    <div class="hist-h"><b>${t('history')}</b><span class="tn">${S.hist.length > 1 ? t('times', S.hist.length - 1) : ''}</span></div>
    <section class="group hist" id="hist">${histRows(w)}</section>`;
  if (keep) { const i = $('#' + keep.id); if (i) { i.value = keep.v; i.focus(); i.setSelectionRange(keep.s, keep.s); } }
}

async function loadHist() {
  S.hist = S.sel ? await store.get('h:' + S.sel, []) : [];
  S.shots = S.sel ? await store.get('shot:' + S.sel, {}) : {};
  if (S.open == null && S.hist.length > 1) S.open = S.hist[S.hist.length - 1].t;
}
async function refresh(full) {
  S.ws = await store.get('watches', {});
  renderList();
  if (full !== false) await loadHist();
  renderDet();
  if (S.sel && S.ws[S.sel] && (S.ws[S.sel].unread || S.ws[S.sel].fresh) && document.visibilityState === 'visible') send({ type: 'patch', id: S.sel, patch: { unread: false, fresh: false } });
}
async function select(id) {
  S.sel = id; S.open = null; S.draft = null;
  history.replaceState(null, '', '#' + id);
  await refresh();
  if (innerWidth <= 820) $('#det').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- 事件 ---------- */
$('#lst').addEventListener('click', e => { const b = e.target.closest('.li'); if (b) select(b.dataset.id); });
let saveT = null;
function saveVal(now) {
  clearTimeout(saveT);
  const go = () => {
    const w = S.ws[S.sel], i = $('#cval'); if (!w || !i) return;
    const type = S.draft || (w.cond || {}).type;
    const v = type === 'below' || type === 'above' ? parseNum(i.value) : i.value.trim();
    if (v == null || v === '') return;
    S.draft = null;
    send({ type: 'patch', id: w.id, patch: { cond: { type, value: v } } });
  };
  if (now) go(); else saveT = setTimeout(go, 600);
}
$('#det').addEventListener('click', async e => {
  const w = S.ws[S.sel]; if (!w) return;
  const he = e.target.closest('.he');
  if (he && !e.target.closest('.dif, .shots')) { S.open = S.open === +he.dataset.t ? -1 : +he.dataset.t; renderDet(); return; }
  const c = e.target.closest('[data-c]');
  if (c) {
    const type = c.dataset.c;
    if (rules.needsValue(type)) {
      const keep = w.cond && w.cond.type === type && w.cond.value != null;
      const guess = type === 'gone' ? (String(w.lastText || '').match(/暂时缺货|缺货|无货|售罄|已售完|sold out|out of stock/i) || [])[0] : null;
      if (keep) S.draft = null;
      else if (guess) { S.draft = null; await send({ type: 'patch', id: w.id, patch: { cond: { type, value: guess } } }); }
      else S.draft = type;
      renderDet();
      const i = $('#cval'); if (i) i.focus();
    } else { S.draft = null; await send({ type: 'patch', id: w.id, patch: { cond: { type } } }); }
    return;
  }
  if (e.target.id === 'cpause') { send({ type: 'patch', id: w.id, patch: { paused: !w.paused } }); return; }
  if (e.target.id === 'bigTxt') { e.target.classList.toggle('full'); return; }
  const a = e.target.closest('[data-a]'); if (!a) return;
  e.preventDefault();
  if (a.dataset.a === 'open') send({ type: 'open', id: w.id });
  if (a.dataset.a === 'iv') ui.menu(a, rules.IV.map(m => ({ v: m, label: rules.every(m) })), w.interval, v => send({ type: 'patch', id: w.id, patch: { interval: +v } }));
  if (a.dataset.a === 'now') { a.disabled = true; await send({ type: 'checkNow', id: w.id }); refresh(); }
  // 删：不问「确定吗」，删完给撤销
  if (a.dataset.a === 'del') {
    const snap = await send({ type: 'remove', id: w.id });
    S.sel = null; refresh();
    ui.toast(t('removed', name(w)), { undo: async () => { await send({ type: 'restore', snap }); S.sel = w.id; refresh(); } });
  }
  if (a.dataset.a === 'perm') {
    const ok = await chrome.permissions.request({ origins: [new URL(w.url).protocol + '//' + new URL(w.url).hostname + '/*'] }).catch(() => false);
    if (ok) { await send({ type: 'checkNow', id: w.id }); refresh(); }
  }
});
$('#det').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('he')) e.target.click();
  if (e.key === 'Enter' && e.target.id === 'ttl') e.target.blur();
  if (e.key === 'Enter' && e.target.id === 'cval') { saveVal(true); e.target.blur(); }
});
$('#det').addEventListener('input', e => { if (e.target.id === 'cval') saveVal(); });
$('#det').addEventListener('change', e => {
  const w = S.ws[S.sel]; if (!w) return;
  if (e.target.id === 'ttl') send({ type: 'patch', id: w.id, patch: { label: e.target.value.trim() } });
});

$('#readAll').addEventListener('click', () => send({ type: 'markAllRead' }));
$('#exp').addEventListener('click', async () => {
  const data = await send({ type: 'export' });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date(), p = n => String(n).padStart(2, '0');
  a.href = URL.createObjectURL(blob); a.download = `${t('exportName')}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  ui.toast(t('exported'));
});
$('#imp').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  let data; try { data = JSON.parse(await f.text()); } catch (x) { return ui.toast(t('importBad')); }
  const r = await send({ type: 'import', data });
  if (r.err) return ui.toast(t('importBad'));
  ui.toast(t('imported', r.added, r.skipped));
  await checkPerms();
  refresh();
});
async function checkPerms() {
  const need = new Set();
  for (const w of Object.values(await store.get('watches', {}))) {
    if (w.demo) continue;
    const o = new URL(w.url); const pat = o.protocol + '//' + o.hostname + '/*';
    if (!(await chrome.permissions.contains({ origins: [pat] }))) need.add(pat);
  }
  S.pendingOrigins = [...need];
  $('#permBar').hidden = !need.size;
}
$('#grant').addEventListener('click', async () => {
  const ok = await chrome.permissions.request({ origins: S.pendingOrigins }).catch(() => false);
  if (ok) { $('#permBar').hidden = true; send({ type: 'tick' }); }
});

/* ---------- 一次加一串网址 ---------- */
function urlsOf(text) {
  const good = [], bad = [];
  for (const l of String(text).split(/[\s,，]+/)) {
    const s = l.trim(); if (!s) continue;
    if (/^https?:\/\/[^\s/]+/i.test(s)) { if (!good.includes(s)) good.push(s); } else bad.push(s);
  }
  return { good, bad };
}
function showAdd(on) {
  $('#add').hidden = !on;
  $('#hero').hidden = on || Object.keys(S.ws).length > 0;
  if (on) { $('#settings').hidden = true; $('#urls').focus(); }
}
$('#addBtn').addEventListener('click', () => showAdd($('#add').hidden));
$('#heroAdd').addEventListener('click', () => showAdd(true));
function refreshAddGo() {
  const { good } = urlsOf($('#urls').value);
  $('#addGo').disabled = !good.length;
  $('#addGo').textContent = good.length ? t('addManyGo', good.length) : t('addManyNone');
}
$('#urls').addEventListener('input', refreshAddGo);
refreshAddGo();
$('#addGo').addEventListener('click', async () => {
  const { good, bad } = urlsOf($('#urls').value);
  if (!good.length) return;
  // 一次要齐这几个网站的权限，浏览器只问一回
  const origins = [...new Set(good.map(u => { const x = new URL(u); return x.protocol + '//' + x.hostname + '/*'; }))];
  const ok = await chrome.permissions.contains({ origins }) || await chrome.permissions.request({ origins }).catch(() => false);
  if (!ok) return ui.toast(t('permDenied'));
  const go = $('#addGo'); go.disabled = true;
  const msg = $('#addMsg');
  const before = new Set(Object.keys(S.ws));
  const tick = setInterval(async () => {
    const n = Object.keys(await store.get('watches', {})).filter(k => !before.has(k)).length;
    msg.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px"><span class="spin"></span>${t('addManyBusy', Math.min(n + 1, good.length), good.length)}</span>`;
  }, 300);
  const r = await send({ type: 'addMany', urls: good, below: $('#lim').value });
  clearInterval(tick);
  const added = (r && r.added) || [];
  const cnt = k => added.filter(x => x.kind === k).length;
  const page = cnt('page');
  msg.innerHTML = ui.esc(t('addManyDone', added.length, cnt('price'), cnt('stock') + cnt('seats') + cnt('known'), '')) + (page ? `<span class="doubt">${page}</span>` : '0')
    + (bad.length ? '<br>' + ui.esc(t('badUrls', bad.slice(0, 3).join(t('listSep')))) : '');
  $('#urls').value = ''; go.textContent = t('addManyNone');
  if (added[0]) select(added[0].id);
});

// 设置
$('#gear').addEventListener('click', () => { $('#settings').hidden = !$('#settings').hidden; if (!$('#settings').hidden) $('#add').hidden = true; });
async function renderSettings() {
  const s = await QS.settings.all();
  $('#sIv').innerHTML = `${rules.every(s.defaultInterval)}${ui.ICON.down}`;
  $('#sGap').innerHTML = [1, 3, 10, 30, 60].map(x => `<button type="button" data-g="${x}" aria-pressed="${s.hostGapSec === x}">${t('sec', x)}</button>`).join('');
}
$('#sIv').addEventListener('click', async e => {
  const s = await QS.settings.all();
  ui.menu(e.currentTarget, rules.IV.map(m => ({ v: m, label: rules.every(m) })), s.defaultInterval, v => QS.settings.set({ defaultInterval: +v }).then(renderSettings));
});
$('#sGap').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) QS.settings.set({ hostGapSec: +b.dataset.g }).then(renderSettings); });

$('#demo').addEventListener('click', async () => { const w = await send({ type: 'demo' }); if (w) select(w.id); });

store.onChange(ch => {
  if (ch.settings) renderSettings();
  const histChanged = S.sel && ch['h:' + S.sel];
  if (S.sel && ch['shot:' + S.sel] && !ch.watches && !histChanged) { loadHist().then(renderDet); return; }
  if (ch.watches || histChanged) {
    if (histChanged) S.open = null;
    const ae = document.activeElement;
    if (ae && ae.id === 'ttl' && !histChanged) { S.ws = ch.watches ? ch.watches.newValue || {} : S.ws; renderList(); return; }
    refresh(true);
  }
});
addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id === 'add') showAdd(true); else if (id && id !== S.sel) select(id); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
setInterval(() => { if (document.visibilityState === 'visible' && !$('#det').contains(document.activeElement)) renderDet(); }, 30000);
// 先拿到上回选的语言再画
QS.langReady.then(() => {
  words(); ui.langSwitch($('#lang'));
  QS.onLang(() => { words(); renderSettings(); refreshAddGo(); renderList(); renderDet(); });
  renderSettings();
  return refresh();
}).then(() => { checkPerms(); if (hash0 === 'add') showAdd(true); });
