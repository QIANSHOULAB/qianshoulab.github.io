/* 千手院通用：界面小工具。拼 HTML、相对时间、提示条（带撤销）、浮层菜单、图标。 */
(function (g) {
  const QS = g.QS = g.QS || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function ago(ts) {
    if (!ts) return '';
    const d = Date.now() - ts, m = Math.round(d / 60000);
    if (m < 1) return QS.t('justNow');
    if (m < 60) return QS.t('minsAgo', m);
    const h = Math.round(m / 60);
    if (h < 24) return QS.t('hoursAgo', h);
    return QS.t('daysAgo', Math.round(h / 24));
  }
  function until(ts) {
    const m = Math.round((ts - Date.now()) / 60000);
    if (m < 1) return QS.t('soon');
    if (m < 60) return QS.t('inMins', m);
    return QS.t('inHours', Math.round(m / 60));
  }
  function stamp(ts) {
    const d = new Date(ts), p = n => String(n).padStart(2, '0');
    const today = new Date().toDateString() === d.toDateString();
    return (today ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ') + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  // 提示条：toast('删了', { undo: () => ... })，带撤销的多留一会儿
  let tt;
  function toast(msg, opt) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = '<span></span>';
    el.firstChild.textContent = msg;
    if (opt && opt.undo) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = QS.t('undo');
      b.onclick = () => { el.classList.remove('show'); opt.undo(); };
      el.appendChild(b);
    }
    el.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), opt && opt.undo ? 6000 : 2200);
  }
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  // 网站字母头像：不去外面拉图标，免得把你盯的网站告诉别人
  function avatar(u) {
    const h = host(u) || '?';
    return `<span class="av" aria-hidden="true">${esc(h[0].toUpperCase())}</span>`;
  }
  // 浮层菜单：代替系统下拉框。items: [{ v, label }]
  function menu(anchor, items, cur, onPick) {
    document.querySelectorAll('.menu').forEach(m => m.remove());
    const m = document.createElement('div');
    m.className = 'menu'; m.setAttribute('role', 'menu');
    m.innerHTML = items.map(i => `<button type="button" role="menuitemradio" aria-checked="${String(i.v) === String(cur)}" data-v="${esc(i.v)}"><i>${String(i.v) === String(cur) ? ICON.check : ''}</i>${esc(i.label)}</button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(), mh = m.offsetHeight, mw = m.offsetWidth;
    let top = r.bottom + 4; if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    m.style.top = top + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)) + 'px';
    const close = () => { m.remove(); removeEventListener('pointerdown', out, true); removeEventListener('keydown', key, true); };
    const out = e => { if (!m.contains(e.target)) close(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus(); } };
    m.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; close(); onPick(b.dataset.v); });
    setTimeout(() => { addEventListener('pointerdown', out, true); addEventListener('keydown', key, true); });
    const on = m.querySelector('[aria-checked="true"]') || m.querySelector('button');
    if (on) on.focus();
    return m;
  }
  const svg = (d, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    crop: svg('<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>'),
    page: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
    tag: svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
    box: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
    seat: svg('<path d="M3 9h18v10H3z"/><path d="M3 13h18M8 9V5h8v4"/>'),
    pin: svg('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.4),
    chev: svg('<path d="m9 6 6 6-6 6"/>'),
    down: svg('<path d="m6 9 6 6 6-6"/>'),
    refresh: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
    ext: svg('<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    trash: svg('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    list: svg('<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>', 2.4),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    up: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    dl: svg('<path d="M12 5v14M5 12l7 7 7-7"/>'),
    bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
    alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>'),
    mountain: svg('<path d="m3 19 6.5-10 4 6 2.5-3.5L21 19z"/><circle cx="17" cy="6" r="2"/>')
  };
  // 右上角 EN / 中文：点了马上换、记住（chrome.storage.local），后台通知和别的窗口跟着换
  function langSwitch(el) {
    const draw = () => {
      el.setAttribute('aria-label', QS.t('langLabel'));
      el.innerHTML = QS.LANGS.map(x => `<button type="button" data-l="${x.code}" lang="${QS.STR[x.code].htmlLang}" aria-pressed="${x.code === QS.lang()}">${x.label}</button>`).join('');
    };
    el.addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (b && b.dataset.l !== QS.lang()) QS.setLang(b.dataset.l); });
    QS.onLang(draw); draw();
  }
  // 页面跟着语言：<html lang>、标题
  function docLang(title) {
    document.documentElement.lang = QS.t('htmlLang');
    if (title) document.title = title();
  }
  QS.ui = { esc, ago, until, stamp, toast, host, avatar, menu, ICON, langSwitch, docLang };
})(typeof globalThis !== 'undefined' ? globalThis : self);
