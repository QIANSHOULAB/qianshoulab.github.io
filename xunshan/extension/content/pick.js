/* 巡山僧：网页上自己框一块。点中就盯上（不用再点「开盯」），面板就地改条件、频率，能撤销、能重框。 */
(function () {
  const QS = globalThis.QS, t = QS.t, P = QS.page, R = QS.rules;
  if (QS.picker.active) QS.picker.active.stop();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const CSS = `
  .pn{position:fixed;z-index:2147483647;width:360px;pointer-events:auto;padding:16px;border-radius:18px;color:#1d1d1f;background:rgba(255,255,255,.86);
    -webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);box-shadow:0 0 0 .5px rgba(0,0,0,.1),0 12px 32px rgba(0,0,0,.14);
    font:400 15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Hiragino Sans GB","Microsoft YaHei UI","Segoe UI",system-ui,sans-serif;animation:pop 240ms cubic-bezier(.2,.8,.2,1)}
  @keyframes pop{from{opacity:0;transform:translateY(4px)}}
  @media (prefers-reduced-motion:reduce){.pn{animation:none}}
  .pn *{box-sizing:border-box;font:inherit;color:inherit}
  .pn [hidden]{display:none!important}
  .h{display:flex;align-items:center;gap:12px}
  .ok{width:32px;height:32px;flex:none;border-radius:8px;display:grid;place-items:center;background:#4e5bd6;color:#fff}
  .ok svg{width:18px;height:18px}
  .ok.wait{background:rgba(120,120,128,.12)}
  .spin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(120,120,128,.3);border-top-color:#6e6e73;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .hm{flex:1;min-width:0}
  .hm b{display:block;font-weight:600}
  .hm span{display:block;font-size:13px;color:#6e6e73;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
  .b{all:unset;cursor:pointer;height:32px;padding:0 8px;border-radius:8px;display:inline-flex;align-items:center;gap:4px;font-size:15px;color:#4e5bd6;white-space:nowrap}
  .b:hover{background:rgba(78,91,214,.1)}
  .b svg{width:14px;height:14px;color:#86868b}
  .bar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:16px}
  .seg{display:inline-flex;padding:2px;border-radius:10px;background:rgba(120,120,128,.12)}
  .seg button{all:unset;cursor:pointer;height:28px;padding:0 12px;border-radius:8px;font-size:13px;display:inline-flex;align-items:center}
  .seg button[aria-pressed="true"]{background:#fff;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08),0 0 0 .5px rgba(0,0,0,.04)}
  .in{all:unset;height:32px;padding:0 12px;border-radius:10px;background:rgba(120,120,128,.12);font-size:15px;width:96px}
  .in:focus{outline:2px solid #4e5bd6}
  .iv{all:unset;cursor:pointer;margin-left:auto;height:32px;padding:0 8px 0 12px;border-radius:10px;background:rgba(120,120,128,.12);display:inline-flex;align-items:center;gap:4px;font-size:15px}
  .iv svg{width:14px;height:14px;color:#86868b}
  .ft{display:flex;align-items:center;gap:4px;margin-top:12px;margin-left:-8px}
  .ft .sp{flex:1}
  .warn{margin-top:12px;font-size:13px;color:#b25000}
  .menu{position:absolute;right:16px;bottom:56px;min-width:150px;padding:4px;border-radius:12px;background:rgba(255,255,255,.96);box-shadow:0 0 0 .5px rgba(0,0,0,.1),0 12px 32px rgba(0,0,0,.18)}
  .menu button{all:unset;cursor:pointer;display:flex;align-items:center;width:100%;height:36px;padding:0 12px;border-radius:8px;box-sizing:border-box;font-size:15px}
  .menu button:hover{background:#4e5bd6;color:#fff}
  .menu button[aria-checked="true"]{font-weight:600}
  @media (prefers-color-scheme:dark){
    .pn{color:#f5f5f7;background:rgba(28,28,30,.86);box-shadow:0 0 0 .5px rgba(255,255,255,.14),0 12px 32px rgba(0,0,0,.6)}
    .ok{background:#5562de}.ok.wait{background:rgba(120,120,128,.24)}
    .hm span{color:#a1a1a6}
    .b{color:#8c9aff}.b:hover{background:rgba(124,138,255,.18)}
    .seg,.in,.iv{background:rgba(120,120,128,.24)}
    .seg button[aria-pressed="true"]{background:#636366;box-shadow:none}
    .warn{color:#ffd60a}
    .menu{background:rgba(44,44,46,.98);box-shadow:0 0 0 .5px rgba(255,255,255,.14),0 12px 32px rgba(0,0,0,.6)}
    .menu button:hover{background:#5562de}
  }`;

  let panel = null, W = null, draft = null, menuOpen = false, idle = null, el = null;
  const send = m => chrome.runtime.sendMessage(m);

  function place(target) {
    const r = target.getBoundingClientRect(), Wd = 360, H = panel.offsetHeight || 200, m = 12;
    let top = r.bottom + m;
    if (top + H > innerHeight - m) top = r.top - H - m;
    if (top < m) top = Math.max(m, Math.min(innerHeight - H - m, r.top + 8));
    const left = Math.min(Math.max(m, r.left), innerWidth - Wd - m);
    panel.style.top = top + 'px'; panel.style.left = left + 'px';
  }
  // 没人碰就自己收起来（已经盯上了，收起来不丢东西）
  function arm(ctl) { clearTimeout(idle); idle = setTimeout(() => { if (!panel || panel.matches(':hover') || panel.contains(ctl.root.activeElement) || menuOpen) return arm(ctl); ctl.stop(); }, 6000); }

  async function add(target, ctl) {
    const text = P.readText(target);
    if (!panel) { panel = document.createElement('div'); panel.className = 'pn'; ctl.root.appendChild(panel); }
    el = target;
    if (!text) { panel.innerHTML = `<div class="warn">${t('emptyPick')}</div><div class="ft"><button class="b" data-a="again">${t('reselect')}</button></div>`; place(target); return; }
    if (W) { await send({ type: 'remove', id: W.id }); W = null; } // 放大一圈 / 重框：换掉刚才那条
    const hint = (text + ' ' + (target.id || '') + ' ' + (typeof target.className === 'string' ? target.className : '') + ' ' + (target.getAttribute('aria-label') || '')).toLowerCase();
    const kind = /[¥$€£₹]|rmb|price|价|sgd|usd/.test(hint) && P.parseNumber(text) != null ? 'price'
      : /库存|有货|缺货|售罄|到货|stock|sold out|available/.test(hint) ? 'stock'
      : /名额|余票|剩余|seat|slot|ticket/.test(hint) ? 'seats' : 'pick';
    const kn = { price: 'kindPrice', stock: 'kindStock', seats: 'kindSeats' }[kind];
    const base = (document.title || location.hostname).replace(/\s+/g, ' ').trim().slice(0, 50);
    const watch = { url: location.href, title: document.title, kind: kind === 'pick' ? 'pick' : kind, label: kn ? base + ' · ' + t(kn) : base, selector: P.cssPath(target), alts: P.altSelectors(target), anchor: P.anchorOf(target), pickedText: text };
    if (kind === 'pick') watch.cond = R.condFor('pick', text, P.parseNumber(text));
    W = await send({ type: 'add', wait: false, watch });
    draft = null;
    show(ctl); arm(ctl);
  }

  function show(ctl) {
    if (!W || !panel) return;
    const numeric = W.numeric || W.lastNum != null;
    const types = R.condTypes(numeric);
    const c = W.cond || { type: 'any' };
    const type = draft || c.type;
    const need = R.needsValue(type);
    const val = c.type === type && c.value != null ? c.value : '';
    const ph = type === 'gone' ? t('condGonePh') : type === 'has' ? t('condHasPh') : t('condNumPh');
    const first = W.lastText == null && !W.err;
    const now = W.lastText != null ? String(W.lastText).replace(/\s+/g, ' ').slice(0, 60) : P.readText(el).replace(/\s+/g, ' ').slice(0, 60);
    const ae = ctl.root.activeElement, typing = ae && ae.id === 'cv' ? ae.value : null;
    panel.innerHTML = `
      <div class="h"><span class="ok ${first ? 'wait' : ''}">${first ? '<span class="spin"></span>' : svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>')}</span>
        <div class="hm"><b>${first ? t('firstLook') : t('added')}</b><span>${esc(now)}</span></div>
        <button class="b" data-a="undo">${t('undo')}</button></div>
      <div class="bar"><div class="seg" role="group" aria-label="${t('condWhen')}">${types.map(x => `<button type="button" data-c="${x}" aria-pressed="${x === type}">${t('seg' + x[0].toUpperCase() + x.slice(1))}</button>`).join('')}</div>
        ${need ? `<input class="in" id="cv" ${numeric ? 'inputmode="decimal"' : ''} placeholder="${ph}" value="${esc(typing != null ? typing : val)}" aria-label="${t('condWhen')}">` : ''}
        <button class="iv" data-a="iv">${R.every(W.interval)}${svg('<path d="m6 9 6 6 6-6"/>')}</button></div>
      ${W.err ? `<div class="warn">${esc(t({ blocked: 'errBlocked', gone: 'errGone', login: 'errLogin', perm: 'errPerm' }[W.err] || 'error'))}</div>` : ''}
      <div class="ft"><button class="b" data-a="bigger">${t('bigger')}</button><button class="b" data-a="again">${t('reselect')}</button></div>
      ${menuOpen ? `<div class="menu" role="menu">${R.IV.map(m => `<button type="button" role="menuitemradio" data-iv="${m}" aria-checked="${+W.interval === m}">${R.every(m)}</button>`).join('')}</div>` : ''}`;
    place(el);
    if (typing != null) { const i = panel.querySelector('#cv'); i.focus(); i.setSelectionRange(typing.length, typing.length); }
  }

  let saveT = null;
  function saveVal(now) {
    clearTimeout(saveT);
    const go = () => {
      const i = panel && panel.querySelector('#cv'); if (!i || !W) return;
      const type = draft || W.cond.type;
      const v = type === 'below' || type === 'above' ? P.parseNumber(i.value) : i.value.trim();
      if (v == null || v === '') return;
      draft = null;
      send({ type: 'patch', id: W.id, patch: { cond: { type, value: v } } });
    };
    if (now) go(); else saveT = setTimeout(go, 600);
  }

  function wire(ctl) {
    ctl.root.addEventListener('click', async e => {
      if (!panel || !panel.contains(e.target)) return;
      arm(ctl);
      const iv = e.target.closest('[data-iv]');
      if (iv) { menuOpen = false; send({ type: 'patch', id: W.id, patch: { interval: +iv.dataset.iv } }); return; }
      const c = e.target.closest('[data-c]');
      if (c) {
        const type = c.dataset.c;
        if (R.needsValue(type)) {
          const keep = W.cond.type === type && W.cond.value != null;
          const guess = type === 'gone' ? (String(W.lastText || W.pickedText || '').match(/暂时缺货|缺货|无货|售罄|已售完|sold out|out of stock/i) || [])[0] : null;
          if (keep) draft = null;
          else if (guess) { draft = null; send({ type: 'patch', id: W.id, patch: { cond: { type, value: guess } } }); }
          else draft = type;
          show(ctl);
          const i = panel.querySelector('#cv'); if (i) i.focus();
        } else { draft = null; send({ type: 'patch', id: W.id, patch: { cond: { type } } }); }
        return;
      }
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'iv') { menuOpen = !menuOpen; show(ctl); return; }
      if (a.dataset.a === 'undo') { clearTimeout(idle); if (W) await send({ type: 'remove', id: W.id }); W = null; ctl.stop(); return; }
      if (a.dataset.a === 'bigger') { ctl.bigger(); return; }
      if (a.dataset.a === 'again') { clearTimeout(idle); if (W) await send({ type: 'remove', id: W.id }); W = null; panel.remove(); panel = null; ctl.resume(); }
    });
    ctl.root.addEventListener('input', e => { if (e.target.id === 'cv') { arm(ctl); saveVal(); } });
    ctl.root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'cv') { saveVal(true); e.target.blur(); } });
  }

  // 后台看完第一眼、或者条件改了，面板跟着变
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !ch.watches || !W) return;
    const nw = (ch.watches.newValue || {})[W.id];
    if (nw) { W = nw; const ctl = QS.picker.active; if (ctl && panel) show(ctl); }
  });

  let wired = false;
  // 等读到右上角选的语言再出提示（框选面板也跟着那个语言）
  (QS.langReady || Promise.resolve()).then(() => QS.picker.start({
    hint: t('pickHint'), keys: t('pickKeys'), close: t('close'), css: CSS,
    onPick: (target, ctl) => { if (!wired) { wire(ctl); wired = true; } add(target, ctl); },
    onOutside: () => { const ctl = QS.picker.active; if (ctl && !menuOpen) ctl.stop(); else if (menuOpen) { menuOpen = false; show(ctl); } },
    onCancel: () => {}
  }));
})();
