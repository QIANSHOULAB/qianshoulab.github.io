/* 巡山僧总览：全部盯梢、变化记录、前后对比、导入导出、设置。 */
const { t, ui, store, rules } = QS;
const $ = s => document.querySelector(s);
QS.applyT();
$('#imp').innerHTML = ui.ICON.down + '<span>' + t('importBtn') + '</span>';
$('#exp').innerHTML = ui.ICON.up + '<span>' + t('exportBtn') + '</span>';
$('#gear').innerHTML = ui.ICON.gear;
$('#ver').textContent = chrome.runtime.getManifest().version;

const S = { ws: {}, sel: location.hash.slice(1) || null, hist: [], open: null, pendingOrigins: [] };
const send = msg => chrome.runtime.sendMessage(msg);
const name = w => w.label || w.title || ui.host(w.url);
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
const isNum = w => w.selector && w.lastNum != null && oneLine(w.lastText).length < 40;

function status(w) {
  if (w.paused) return `<span class="pill off">${t('paused')}</span>`;
  if (w.err) return `<span class="pill err">${t('error')}</span>`;
  if (w.unread) return `<span class="pill hit">${t('hitPill')}</span>`;
  if (w.fresh) return `<span class="pill off">${t('changed')}</span>`;
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

function renderList() {
  const list = sorted();
  $('#cnt').textContent = t('count', list.length);
  $('#hero').hidden = list.length > 0;
  $('#main').hidden = list.length === 0;
  $('#readAll').hidden = !list.some(w => w.unread || w.fresh);
  if (!S.ws[S.sel]) S.sel = list[0] ? list[0].id : null;
  $('#lst').innerHTML = list.map(w => `
    <button class="li" data-id="${w.id}" aria-current="${w.id === S.sel}">
      ${ui.avatar(w.url)}
      <div class="li-m"><div class="li-t">${ui.esc(name(w))}</div>
        <div class="li-s">${ui.esc(sub(w))}</div></div>
      <div class="li-r">${status(w)}<span>${ui.ago(w.lastChange || w.lastCheck)}</span></div>
    </button>`).join('');
}

function condCtl(w) {
  const c = w.cond || { type: 'any' };
  const numeric = (w.selector && w.lastNum != null) || c.type === 'below' || c.type === 'above'; // 整页里的日期不算数字
  const opts = numeric ? ['any', 'below', 'above'] : ['any', 'has', 'gone'];
  const nm = { any: 'condAny', below: 'condBelow', above: 'condAbove', has: 'condHas', gone: 'condGone' };
  const ph = c.type === 'gone' ? t('condGonePh') : c.type === 'has' ? t('condHasPh') : '';
  return `<div class="seg" id="cseg">${opts.map(o => `<button type="button" data-c="${o}" aria-pressed="${c.type === o}">${t(nm[o])}</button>`).join('')}</div>
    ${c.type === 'any' ? '' : `<input class="inp" id="cval" value="${ui.esc(c.value != null ? c.value : '')}" placeholder="${ph}" ${numeric ? 'inputmode="decimal"' : ''}>`}`;
}

function histRows(w) {
  const h = S.hist.slice().reverse();
  if (h.length <= 1) return `<div class="none">${t('noHistory')}</div>`;
  return h.map((e, i) => {
    const prev = h[i + 1];
    let chg = '';
    if (w.selector && prev && e.num != null && prev.num != null && e.num !== prev.num) {
      const dn = e.num < prev.num;
      chg = `<span class="chg ${dn ? 'dn' : 'upv'}">${rules.fmtNum(prev.num)} → ${rules.fmtNum(e.num)}</span>`;
    }
    const tag = (e.first ? `<span class="pill off tag">${t('firstSeen')}</span>` : (e.hit ? `<span class="pill hit tag">${t('hitTag')}</span>` : ''))
      + (e.moved ? `<span class="pill off tag">${t('movedTag')}</span>` : '');
    const open = S.open === e.t;
    let body = `<div class="he-s">${ui.esc(e.added ? t('newPrefix') + e.added.join(' · ') : oneLine(e.text).slice(0, 140))}</div>`;
    if (open && prev) {
      const d = QS.diff(prev.text, e.text);
      body = `<div class="dif">${d.map(p => p.op === '+' ? `<ins>${ui.esc(p.s)}</ins>` : p.op === '-' ? `<del>${ui.esc(p.s)}</del>` : `<span class="ctx">${ui.esc(p.s)}</span>`).join('')}</div>
        <div class="dif-l"><span><i style="background:var(--del)"></i>${t('before')}</span><span><i style="background:var(--ins)"></i>${t('after')}</span></div>`;
    } else if (open) {
      body = `<div class="dif">${ui.esc(e.text)}</div>`;
    }
    return `<div class="he" role="button" tabindex="0" data-t="${e.t}" aria-expanded="${open}"><div class="he-t"><span class="tm">${ui.stamp(e.t)}</span>${chg}${tag}</div>${body}</div>`;
  }).join('');
}

function renderDet() {
  const w = S.ws[S.sel];
  if (!w) { $('#det').innerHTML = `<div class="none">${t('selectOne')}</div>`; return; }
  const checking = w.checkingSince && Date.now() - w.checkingSince < 60000;
  const big = w.lastText == null ? `<div class="big txt">${t('waitingFirst')}</div>`
    : isNum(w) ? `<div class="big">${ui.esc(oneLine(w.lastText))}</div>`
      : `<div class="big txt" id="bigTxt">${ui.esc(w.lastText)}</div>`;
  const ae = document.activeElement;
  const keepTitle = ae && ae.id === 'ttl';
  $('#det').innerHTML = `
    <div class="dh">${ui.avatar(w.url)}
      <div class="dh-m"><input class="ttl" id="ttl" value="${ui.esc(name(w))}" aria-label="${t('rename')}" spellcheck="false">
        <a class="dh-host" href="#" data-a="open"><span>${ui.esc(w.url)}</span>${ui.ICON.ext}</a></div>
    </div>
    <section class="card now">
      <div class="now-l"><span>${t('current')}</span><span class="where" title="${ui.esc(w.selector || '')}">${w.selector ? t('partPage') : t('wholePage')}</span></div>
      ${big}
      <div class="stat"><span class="dot ${w.paused ? 'off' : w.err ? 'err' : w.unread ? 'hit' : 'on'}"></span>
        <span>${checking ? t('checking') : w.lastCheck ? t('lastCheck', ui.ago(w.lastCheck)) : t('waitingFirst')}</span>
        ${!w.paused && w.nextCheck && !checking ? `<span>· ${t('nextCheck', ui.until(w.nextCheck))}</span>` : ''}
        <span>· ${ui.esc(rules.condLabel(w.cond))}</span></div>
      ${w.err ? `<div class="err-box">${ui.esc(errText(w))}${w.err === 'perm' ? ` <button class="btn pri" data-a="perm" style="margin-left:8px">${t('grant')}</button>` : ''}</div>` : ''}
    </section>
    <section class="card ctl">
      <div class="crow"><span>${t('condition')}</span><div class="r">${condCtl(w)}</div></div>
      <div class="sep"></div>
      <div class="crow"><span>${t('frequency')}</span><div class="r"><select class="sel" id="civ">${rules.IV.map(m => `<option value="${m}" ${+w.interval === m ? 'selected' : ''}>${t('every')} ${rules.ivLabel(m)}</option>`).join('')}</select></div></div>
      <div class="sep"></div>
      <div class="crow"><span>${t('pause')}</span><div class="r"><button class="toggle" role="switch" id="cpause" aria-checked="${!!w.paused}" aria-label="${t('pause')}"></button></div></div>
      <div class="sep"></div>
      <div class="crow"><button class="btn pri" data-a="now" ${checking ? 'disabled' : ''}>${ui.ICON.refresh}<span>${t('checkNow')}</span></button>
        <div class="r"><button class="btn" data-a="open">${ui.ICON.ext}<span>${t('open')}</span></button><button class="btn danger" data-a="del">${ui.ICON.trash}<span>${t('remove')}</span></button></div></div>
    </section>
    <div class="hist-h"><b>${t('history')}</b><span>${S.hist.length > 1 ? t('times', S.hist.length - 1) : ''}</span></div>
    <section class="card hist" id="hist">${histRows(w)}</section>`;
  if (keepTitle) { const i = $('#ttl'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

async function loadHist() {
  S.hist = S.sel ? await store.get('h:' + S.sel, []) : [];
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
  S.sel = id; S.open = null;
  history.replaceState(null, '', '#' + id);
  await refresh();
  if (innerWidth <= 820) $('#det').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- 事件 ---------- */
$('#lst').addEventListener('click', e => { const b = e.target.closest('.li'); if (b) select(b.dataset.id); });
$('#det').addEventListener('click', async e => {
  const w = S.ws[S.sel]; if (!w) return;
  const he = e.target.closest('.he');
  if (he && !e.target.closest('.dif')) { S.open = S.open === +he.dataset.t ? -1 : +he.dataset.t; renderDet(); return; }
  const c = e.target.closest('[data-c]');
  if (c) {
    const type = c.dataset.c;
    let value = null;
    if (type === 'below' || type === 'above') value = w.lastNum;
    const cond = type === 'any' ? { type } : { type, value: (w.cond && w.cond.type === type) ? w.cond.value : value };
    if ((type === 'has' || type === 'gone') && !cond.value) cond.value = '';
    await send({ type: 'patch', id: w.id, patch: { cond } });
    setTimeout(() => { const i = $('#cval'); if (i) i.focus(); }, 60);
    return;
  }
  const a = e.target.closest('[data-a]'); if (!a) return;
  e.preventDefault();
  if (a.dataset.a === 'open') send({ type: 'open', id: w.id });
  if (a.dataset.a === 'now') { a.disabled = true; await send({ type: 'checkNow', id: w.id }); refresh(); }
  if (a.dataset.a === 'del') { if (confirm(t('removeAsk', name(w)))) { await send({ type: 'remove', id: w.id }); S.sel = null; refresh(); } }
  if (a.dataset.a === 'perm') {
    const ok = await chrome.permissions.request({ origins: [new URL(w.url).origin.replace(/:\d+$/, '') + '/*'] });
    if (ok) { await send({ type: 'checkNow', id: w.id }); refresh(); }
  }
});
$('#det').addEventListener('click', e => {
  if (e.target.id === 'cpause') { const w = S.ws[S.sel]; send({ type: 'patch', id: w.id, patch: { paused: !w.paused } }); }
  if (e.target.id === 'bigTxt') e.target.classList.toggle('full');
});
$('#det').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.closest('.he') && e.target.classList.contains('he')) e.target.click();
  if (e.key === 'Enter' && (e.target.id === 'ttl' || e.target.id === 'cval')) e.target.blur();
});
$('#det').addEventListener('change', e => {
  const w = S.ws[S.sel]; if (!w) return;
  if (e.target.id === 'civ') send({ type: 'patch', id: w.id, patch: { interval: +e.target.value } });
  if (e.target.id === 'ttl') { const v = e.target.value.trim(); send({ type: 'patch', id: w.id, patch: { label: v } }); }
  if (e.target.id === 'cval') {
    const c = w.cond || {};
    const v = (c.type === 'below' || c.type === 'above') ? QS.page_parse(e.target.value) : e.target.value.trim();
    send({ type: 'patch', id: w.id, patch: { cond: v == null || v === '' ? { type: 'any' } : { type: c.type, value: v } } });
  }
});
QS.page_parse = s => { const m = String(s).replace(/[,，\s]/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };

$('#readAll').addEventListener('click', () => send({ type: 'markAllRead' }));
$('#exp').addEventListener('click', async () => {
  const data = await send({ type: 'export' });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date(), p = n => String(n).padStart(2, '0');
  a.href = URL.createObjectURL(blob); a.download = `巡山僧清单-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
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

// 设置
$('#gear').addEventListener('click', () => { $('#settings').hidden = !$('#settings').hidden; });
(async () => {
  const s = await QS.settings.all();
  $('#sIv').innerHTML = rules.IV.map(m => `<option value="${m}" ${s.defaultInterval === m ? 'selected' : ''}>${t('every')} ${rules.ivLabel(m)}</option>`).join('');
  $('#sGap').innerHTML = [1, 3, 10, 30, 60].map(x => `<option value="${x}" ${s.hostGapSec === x ? 'selected' : ''}>${t('sec', x)}</option>`).join('');
})();
$('#sIv').addEventListener('change', e => QS.settings.set({ defaultInterval: +e.target.value }));
$('#sGap').addEventListener('change', e => QS.settings.set({ hostGapSec: +e.target.value }));

store.onChange(ch => {
  const histChanged = S.sel && ch['h:' + S.sel];
  if (ch.watches || histChanged) {
    if (histChanged) S.open = null;
    const ae = document.activeElement;
    if (ae && (ae.id === 'ttl' || ae.id === 'cval') && !histChanged) { S.ws = ch.watches ? ch.watches.newValue || {} : S.ws; renderList(); return; }
    refresh(true);
  }
});
addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && id !== S.sel) select(id); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
setInterval(() => { if (document.visibilityState === 'visible' && !$('#det').contains(document.activeElement)) renderDet(); }, 30000);
refresh().then(checkPerms);
