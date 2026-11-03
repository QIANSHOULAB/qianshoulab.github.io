/* 千手院通用：在网页上框选元素。Shadow DOM 隔离样式，不碰原网页。
   QS.picker.start({ hint, keys, onPick(el, ctl), onCancel })
   ctl: { root（可挂面板的 shadow 根）, target, setTarget(el), bigger(), resume(), stop() } */
(function (g) {
  const QS = g.QS = g.QS || {};
  if (QS.picker && QS.picker.start) return;
  const CSS_TXT = `
  :host{all:initial}
  *{box-sizing:border-box}
  .box{position:fixed;pointer-events:none;z-index:2147483646;border-radius:8px;border:2px solid #4E5BD6;background:rgba(78,91,214,.10);box-shadow:0 0 0 4000px rgba(0,0,0,.0);transition:all .08s ease-out;display:none}
  .box.locked{background:rgba(78,91,214,.14);box-shadow:0 0 0 100vmax rgba(0,0,0,.28)}
  .hint{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;gap:10px;align-items:center;height:44px;padding:0 6px 0 16px;border-radius:12px;
    font:600 15px/1.2 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Microsoft YaHei UI","Segoe UI",sans-serif;color:#1D1D1F;background:rgba(255,255,255,.82);
    -webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 8px 28px rgba(0,0,0,.14)}
  .hint small{color:#6E6E73;font-size:13px;font-weight:400}
  .x{all:unset;cursor:pointer;width:32px;height:32px;border-radius:8px;display:grid;place-items:center;color:#6E6E73}.x:hover{background:rgba(120,120,128,.12)}.x svg{width:16px;height:16px}
  @media (prefers-color-scheme:dark){.hint{color:#F5F5F7;background:rgba(40,40,42,.82);box-shadow:0 0 0 .5px rgba(255,255,255,.14),0 8px 28px rgba(0,0,0,.5)}.hint small{color:#98989D}.x{background:rgba(118,118,128,.3);color:#c7c7cc}}
  `;
  function start(opt) {
    const host = document.createElement('qianshou-picker');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS_TXT}${opt.css || ''}</style><div class="box"></div><div class="hint" style="pointer-events:auto"><span class="ht"></span><small class="hk"></small><button class="x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
    root.querySelector('.ht').textContent = opt.hint || '';
    root.querySelector('.hk').textContent = opt.keys || '';
    root.querySelector('.x').setAttribute('aria-label', opt.close || 'Close');
    // 面板里的点击、按键到此为止，别让网页自己的脚本收到
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'keydown', 'keyup', 'keypress', 'input', 'change', 'wheel'].forEach(tp => host.addEventListener(tp, e => e.stopPropagation()));
    document.documentElement.appendChild(host);
    const box = root.querySelector('.box'), hint = root.querySelector('.hint');
    let locked = false, target = null;
    const isOurs = e => e.composedPath && e.composedPath().includes(host);
    function place(el) {
      if (!el) { box.style.display = 'none'; return; }
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
    }
    const pickable = el => el && el.nodeType === 1 && el !== document.documentElement && el !== host;
    function onMove(e) {
      if (locked || isOurs(e)) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (pickable(el)) { target = el; place(el); }
    }
    function onClick(e) {
      if (isOurs(e)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (locked) { opt.onOutside && opt.onOutside(); return; }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!pickable(el)) return;
      target = el; lock();
    }
    function lock() {
      locked = true; box.classList.add('locked'); place(target); hint.style.display = 'none';
      opt.onPick && opt.onPick(target, ctl);
    }
    function block(e) { if (!isOurs(e)) { e.preventDefault(); e.stopPropagation(); } }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); stop(); opt.onCancel && opt.onCancel(); return; }
      if (isOurs(e) && !locked) return;
      if ((e.key === 'ArrowUp') && target && target.parentElement && target.parentElement !== document.documentElement && !isOurs(e)) {
        e.preventDefault(); ctl.bigger();
      }
    }
    const reflow = () => place(target);
    function stop() {
      removeEventListener('mousemove', onMove, true); removeEventListener('click', onClick, true);
      ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'submit'].forEach(t => removeEventListener(t, block, true));
      removeEventListener('keydown', onKey, true); removeEventListener('scroll', reflow, true); removeEventListener('resize', reflow);
      host.remove(); QS.picker.active = null;
    }
    const ctl = {
      root, get target() { return target; },
      setTarget(el) { target = el; place(el); },
      bigger() {
        if (!target || !target.parentElement || target.parentElement === document.body.parentElement) return target;
        target = target.parentElement; place(target); if (locked) opt.onPick && opt.onPick(target, ctl); return target;
      },
      resume() { locked = false; box.classList.remove('locked'); hint.style.display = ''; },
      stop
    };
    root.querySelector('.x').addEventListener('click', () => { stop(); opt.onCancel && opt.onCancel(); });
    addEventListener('mousemove', onMove, true); addEventListener('click', onClick, true);
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'submit'].forEach(t => addEventListener(t, block, true));
    addEventListener('keydown', onKey, true); addEventListener('scroll', reflow, true); addEventListener('resize', reflow);
    QS.picker.active = ctl;
    return ctl;
  }
  QS.picker = { start, active: null };
})(typeof globalThis !== 'undefined' ? globalThis : self);
