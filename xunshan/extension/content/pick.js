/* 巡山僧：网页上框选要盯的那块，就地设条件和频率，一键开盯。 */
(function () {
  const QS = globalThis.QS, t = QS.t, P = QS.page, R = QS.rules;
  if (QS.picker.active) QS.picker.active.stop();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CSS = `
  .pn{position:fixed;z-index:2147483647;width:340px;pointer-events:auto;padding:14px;border-radius:16px;color:#1D1D1F;background:rgba(255,255,255,.9);
    -webkit-backdrop-filter:saturate(180%) blur(24px);backdrop-filter:saturate(180%) blur(24px);box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 18px 50px rgba(0,0,0,.22);
    font:400 13px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Microsoft YaHei UI","Microsoft YaHei","Segoe UI",sans-serif;animation:pop .18s cubic-bezier(.2,.8,.2,1)}
  @keyframes pop{from{opacity:0;transform:scale(.97) translateY(4px)}}
  .pn *{box-sizing:border-box;font:inherit;color:inherit}
  .pn [hidden]{display:none!important}
  .h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
  .h b{font-weight:600;font-size:14px}
  .nm{font:600 12px/1 ui-rounded,"SF Pro Rounded",-apple-system,sans-serif;color:#1F8A3B;background:rgba(52,199,89,.14);padding:4px 8px;border-radius:999px}
  .pv{max-height:74px;overflow:hidden;padding:8px 10px;border-radius:10px;background:rgba(118,118,128,.1);white-space:pre-wrap;word-break:break-word;font-size:12px;color:#3A3A3C;-webkit-mask-image:linear-gradient(#000 70%,transparent)}
  .row{display:flex;align-items:center;gap:8px;margin-top:10px}
  .lab{width:62px;flex:none;color:#6E6E73;font-size:12px}
  .seg{display:inline-flex;padding:2px;border-radius:9px;background:rgba(118,118,128,.12)}
  .seg button{all:unset;cursor:pointer;height:26px;padding:0 10px;border-radius:7px;font-size:12px;font-weight:500;display:inline-flex;align-items:center}
  .seg button[aria-pressed="true"]{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12)}
  .in,.sl{all:unset;height:28px;padding:0 10px;border-radius:8px;background:rgba(118,118,128,.12);font-size:13px;min-width:0}
  .in{flex:1;width:100%}
  .in:focus{outline:2px solid #0A84FF}
  .sl{padding-right:24px;cursor:pointer;line-height:28px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238E8E93' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center}
  .sl option{color:#1D1D1F;background:#fff}
  .ft{display:flex;align-items:center;gap:6px;margin-top:14px}
  .ft .sp{flex:1}
  .b{all:unset;cursor:pointer;height:32px;padding:0 14px;border-radius:999px;font-size:13px;font-weight:500;display:inline-flex;align-items:center;background:rgba(118,118,128,.12)}
  .b.g{background:none;color:#0071E3;padding:0 8px}
  .b.p{background:#0071E3;color:#fff;padding:0 18px}
  .b:hover{filter:brightness(.96)}
  .ok{display:flex;align-items:center;gap:10px;font-weight:500}
  .ok i{width:26px;height:26px;border-radius:50%;background:#34C759;display:grid;place-items:center;color:#fff;font-style:normal;font-weight:700}
  .warn{color:#B25000;font-size:12px;margin-top:8px}
  @media (prefers-color-scheme:dark){
    .pn{color:#F5F5F7;background:rgba(36,36,38,.9);box-shadow:0 0 0 .5px rgba(255,255,255,.14),0 18px 50px rgba(0,0,0,.6)}
    .pv{color:#D1D1D6;background:rgba(118,118,128,.22)}
    .lab{color:#98989D}
    .seg,.in,.sl,.b{background-color:rgba(118,118,128,.26)}
    .seg button[aria-pressed="true"]{background:#636366}
    .sl option{color:#F5F5F7;background:#2C2C2E}
    .b.g{background:none;color:#409CFF}.b.p{background:#0A84FF}
    .nm{color:#30D158;background:rgba(48,209,88,.18)}
    .warn{color:#FFB340}
  }`;

  let defIv = 30;
  chrome.storage.local.get('settings').then(o => { if (o.settings && o.settings.defaultInterval) defIv = o.settings.defaultInterval; });
  let panel = null, state = { type: 'any', value: '', iv: null };

  function place(el) {
    const r = el.getBoundingClientRect(), W = 340, H = panel.offsetHeight || 260, m = 12;
    let top = r.bottom + m;
    if (top + H > innerHeight - m) top = r.top - H - m;
    if (top < m) top = Math.max(m, Math.min(innerHeight - H - m, r.top + 8));
    let left = Math.min(Math.max(m, r.left), innerWidth - W - m);
    panel.style.top = top + 'px'; panel.style.left = left + 'px';
  }

  function show(el, ctl) {
    const text = P.readText(el);
    const num = P.parseNumber(text);
    if (!panel) { panel = document.createElement('div'); panel.className = 'pn'; ctl.root.appendChild(panel); }
    if (state.iv == null) state.iv = defIv;
    if (num == null && (state.type === 'below' || state.type === 'above')) state.type = 'any';
    const conds = num != null ? ['any', 'below', 'above'] : ['any', 'has', 'gone'];
    const cName = { any: 'condAny', below: 'condBelow', above: 'condAbove', has: 'condHas', gone: 'condGone' };
    if (!state.value && num != null) state.value = String(num);
    panel.innerHTML = `
      <div class="h"><b>${t('pickPreview')}</b>${num != null ? `<span class="nm">${t('foundNum')} ${esc(R.fmtNum(num))}</span>` : ''}</div>
      <div class="pv">${esc(text.slice(0, 300)) || '—'}</div>
      ${text ? '' : `<div class="warn">${t('emptyPick')}</div>`}
      <div class="row"><span class="lab">${t('condition')}</span><div class="seg">${conds.map(c => `<button type="button" data-c="${c}" aria-pressed="${state.type === c}">${t(cName[c])}</button>`).join('')}</div></div>
      <div class="row" ${state.type === 'any' ? 'hidden' : ''}><span class="lab"></span><input class="in" id="cv" ${num != null ? 'inputmode="decimal"' : ''} placeholder="${state.type === 'gone' ? t('condGonePh') : state.type === 'has' ? t('condHasPh') : ''}" value="${esc(state.type === 'has' || state.type === 'gone' ? (state.kw || '') : state.value)}"></div>
      <div class="row"><span class="lab">${t('frequency')}</span><select class="sl" id="iv">${R.IV.map(m => `<option value="${m}" ${+state.iv === m ? 'selected' : ''}>${t('every')} ${R.ivLabel(m)}</option>`).join('')}</select></div>
      <div class="ft"><button class="b g" data-a="bigger">${t('bigger')}</button><span class="sp"></span><button class="b" data-a="again">${t('reselect')}</button><button class="b p" data-a="go" ${text ? '' : 'disabled'}>${t('start')}</button></div>`;
    place(el);
    panel.onclick = async e => {
      const c = e.target.closest('[data-c]');
      if (c) { state.type = c.dataset.c; show(ctl.target, ctl); const i = panel.querySelector('#cv'); if (i && state.type !== 'any') i.focus(); return; }
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'bigger') ctl.bigger();
      if (a.dataset.a === 'again') { panel.remove(); panel = null; ctl.resume(); }
      if (a.dataset.a === 'go') go(ctl, text);
    };
    panel.oninput = e => {
      if (e.target.id === 'cv') { if (state.type === 'has' || state.type === 'gone') state.kw = e.target.value; else state.value = e.target.value; }
    };
    panel.onchange = e => { if (e.target.id === 'iv') state.iv = +e.target.value; };
    panel.onkeydown = e => { if (e.key === 'Enter' && e.target.id === 'cv') go(ctl, text); };
  }

  async function go(ctl, text) {
    const el = ctl.target;
    const selector = P.cssPath(el);
    let cond = { type: state.type };
    if (state.type === 'below' || state.type === 'above') {
      const v = P.parseNumber(state.value);
      cond = v == null ? { type: 'any' } : { type: state.type, value: v };
    } else if (state.type === 'has' || state.type === 'gone') {
      cond = (state.kw || '').trim() ? { type: state.type, value: state.kw.trim() } : { type: 'any' };
    }
    // 起个能分清的名字：页面标题 + 这块是啥（价格/库存/名额）
    const hint = (text + ' ' + (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
    const kind = /[¥$€£₹]|rmb|price|价|sgd|usd/.test(hint) && P.parseNumber(text) != null ? t('kindPrice')
      : /库存|有货|缺货|售罄|到货|stock|sold out|available/.test(hint) ? t('kindStock')
      : /名额|余票|剩余|seat|slot|ticket/.test(hint) ? t('kindSeats') : '';
    const base = (document.title || location.hostname).replace(/\s+/g, ' ').trim().slice(0, 50);
    const label = kind ? base + ' · ' + kind : base;
    panel.innerHTML = `<div class="ok"><i>✓</i><span>${t('added')}</span></div>`;
    chrome.runtime.sendMessage({ type: 'add', watch: { url: location.href, title: document.title, label, selector, pickedText: text, interval: state.iv, cond } });
    setTimeout(() => ctl.stop(), 1800);
  }

  QS.picker.start({
    hint: t('pickHint'), keys: t('pickKeys'), css: CSS,
    onPick: (el, ctl) => show(el, ctl),
    onCancel: () => {}
  });
})();
