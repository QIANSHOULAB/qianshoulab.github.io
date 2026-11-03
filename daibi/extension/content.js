/* 代笔僧：在网页里干活的那只手。由侧栏按需注入（只在你授权过的网站，连同页里的 iframe），不常驻。
 * 侧栏用 scripting.executeScript 调 window.__daibiDo(消息)，每个 frame 各答各的，侧栏合起来。
 * 消息：scan / fill / submit / values / check / pick / flash / cancelPick
 * 选择器：顶层页面原样；iframe 里的加前缀「@来源|」，各 frame 只认自己的。
 */
(function () {
  'use strict';
  if (window.__daibiHand) return;
  window.__daibiHand = true;
  const P = QSLib.page;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const TOP = window === window.top;
  const FK = TOP ? '' : location.origin;
  const tag = sel => sel && FK ? '@' + FK + '|' + sel : sel;
  const mine = sel => {
    if (!sel) return null;
    if (sel[0] !== '@') return TOP ? sel : null;
    const k = sel.indexOf('|');
    return !TOP && sel.slice(1, k) === FK ? sel.slice(k + 1) : null;
  };
  const tagD = d => d && Object.assign(d, { sel: tag(d.sel) });

  /* ---------- 值的规整 ---------- */
  const key = s => String(s ?? '').toLowerCase().replace(/[\s\-_.,，。:：;；/\\|()（）[\]【】"'“”‘’*＊·•]/g, '');
  const YES = /^(是|y|yes|true|1|√|✓|✔|x|on|勾|对|有|要|同意|checked|已选|选中)$/i;
  const NO = /^(否|n|no|false|0|off|无|不|不要|不同意|×|未选)$/i;
  const pad = n => String(n).padStart(2, '0');

  function toDate(v) {
    v = String(v).trim();
    let m;
    if ((m = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?:[ T]+(\d{1,2})[:：](\d{2}))?/.exec(v))) return { y: +m[1], mo: +m[2], d: +m[3], h: m[4], mi: m[5] };
    if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?$/.exec(v))) {
      let a = +m[1], b = +m[2];
      const [mo, d] = a > 12 ? [b, a] : [a, b];
      return { y: +m[3], mo, d, h: m[4], mi: m[5] };
    }
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(v))) return { y: +m[1], mo: +m[2], d: +m[3] };
    if (/^\d{5}(\.\d+)?$/.test(v) && +v > 20000 && +v < 80000) { // Excel 序列号
      const dt = new Date(Math.round((+v - 25569) * 864e5));
      return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes() };
    }
    return null;
  }
  function toTime(v) {
    const m = /(\d{1,2})\s*[:：时]\s*(\d{1,2})/.exec(String(v));
    return m ? pad(+m[1]) + ':' + pad(+m[2]) : null;
  }
  function dateFor(kind, v) {
    if (kind === 'time') return toTime(v);
    const d = toDate(v); if (!d || d.mo < 1 || d.mo > 12 || d.d < 1 || d.d > 31) return null;
    const D = `${d.y}-${pad(d.mo)}-${pad(d.d)}`;
    if (kind === 'date') return D;
    if (kind === 'month') return `${d.y}-${pad(d.mo)}`;
    if (kind === 'datetime-local') return `${D}T${d.h != null ? pad(+d.h) : '00'}:${d.mi != null ? pad(+d.mi) : '00'}`;
    if (kind === 'week') { const t = new Date(Date.UTC(d.y, d.mo - 1, d.d)); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${pad(Math.ceil(((t - y0) / 864e5 + 1) / 7))}`; }
    return D;
  }

  // 照框的格式写日期：placeholder 写了 YYYY/MM/DD 就照它，写了个样例日期就照样例，都没有用 YYYY-MM-DD
  function fmtFor(el) {
    const ph = String(el.getAttribute('placeholder') || '').trim();
    if (/y{2,4}/i.test(ph) && /m{1,2}/i.test(ph) && /d{1,2}/i.test(ph)) return ph.replace(/[^ymdhs:\-/.年月日 ]/gi, '').trim();
    const ex = /\d{4}([-/.年])\d{1,2}([-/.月])\d{1,2}(日)?/.exec(ph + ' ' + (el.value || ''));
    if (ex) return 'YYYY' + ex[1] + 'MM' + ex[2] + 'DD' + (ex[3] || '');
    return 'YYYY-MM-DD';
  }
  function fmtDate(d, f) {
    return f.replace(/y{4}|y{2}|m{1,2}|d{1,2}|h{1,2}|i{2}|s{2}/gi, x => {
      const c = x[0].toLowerCase(), two = x.length >= 2;
      if (c === 'y') return x.length === 4 ? String(d.y) : String(d.y).slice(-2);
      if (c === 'm') return two ? pad(d.mo) : String(d.mo);
      if (c === 'd') return two ? pad(d.d) : String(d.d);
      if (c === 'h') return pad(+(d.h || 0));
      if (c === 'i') return pad(+(d.mi || 0));
      return '00';
    });
  }

  function matchOption(opts, v) {
    const raw = String(v).trim(), k = key(raw);
    let i = opts.findIndex(o => o.value === raw); if (i >= 0) return i;
    i = opts.findIndex(o => o.text === raw); if (i >= 0) return i;
    i = opts.findIndex(o => key(o.text) === k || key(o.value) === k); if (i >= 0) return i;
    if (k.length >= 1) {
      const hits = opts.map((o, j) => [j, key(o.text)]).filter(([, t]) => t && (t.includes(k) || (k.includes(t) && t.length >= 2)));
      if (hits.length === 1) return hits[0][0];
      if (hits.length > 1) { hits.sort((a, b) => Math.abs(a[1].length - k.length) - Math.abs(b[1].length - k.length)); return hits[0][0]; }
    }
    return -1;
  }

  /* ---------- 写进去：照顾 React / Vue 之类的框架 ---------- */
  function setNative(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    d && d.set ? d.set.call(el, v) : (el.value = v);
  }
  const fire = (el, ...types) => types.forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
  function typeIn(el, v) {
    try { el.focus({ preventScroll: true }); } catch (e) {}
    setNative(el, v);
    fire(el, 'input', 'change');
    try { el.blur(); } catch (e) {}
  }
  function setChecked(el, on) {
    if (el.checked === on) return;
    el.click(); // 走真点击，网站自己的监听都会触发
    if (el.checked !== on) { el.checked = on; fire(el, 'input', 'change'); }
  }

  /* ---------- 自定义下拉：点开 → 找选项 → 点中 ---------- */
  function press(el, kinds) {
    const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    kinds.forEach(k => el.dispatchEvent(k.startsWith('pointer') ? new PointerEvent(k, { ...o, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(k, o)));
  }
  const key1 = (el, k) => ['keydown', 'keyup'].forEach(t => el.dispatchEvent(new KeyboardEvent(t, { key: k, code: k, bubbles: true, cancelable: true })));
  async function until(fn, ms) { const t0 = Date.now(); let x; while (!(x = fn()) && Date.now() - t0 < ms) await sleep(30); return x; }
  const handleOf = root => root.querySelector('.ant-select-selector,.el-select__wrapper,.el-input__wrapper,.el-input__inner,.select2-selection,.vs__dropdown-toggle,.n-base-selection-label,.ivu-select-selection,[role=combobox]') || root;
  const openOpts = root => P.optionsOf(root, true);
  async function openCombo(root) {
    const h = handleOf(root);
    try { h.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    let os = openOpts(root); if (os.length) return os;
    press(h, ['pointerdown', 'mousedown', 'pointerup', 'mouseup']);   // AntD / MUI 按下就开
    if ((os = await until(() => { const x = openOpts(root); return x.length && x; }, 200))) return os;
    press(h, ['click']);                                              // Element / 自家组件 点了才开
    if ((os = await until(() => { const x = openOpts(root); return x.length && x; }, 500))) return os;
    try { h.focus(); } catch (e) {} key1(document.activeElement || h, 'ArrowDown'); // 键盘开
    return (await until(() => { const x = openOpts(root); return x.length && x; }, 300)) || [];
  }
  async function closeCombo(root) {
    key1(document.activeElement || root, 'Escape');
    await sleep(30);
    if (openOpts(root).length) { press(handleOf(root), ['click']); await sleep(30); }
    if (openOpts(root).length) press(document.body, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  }
  async function fillCombo(root, v, col) {
    const shown = () => (root.innerText || '').replace(/\s+/g, ' ').trim();
    let os = await openCombo(root);
    let i = matchOption(os.map(P.optInfo), v);
    if (i < 0) { // 能搜的下拉：打字再找
      const inp = root.querySelector('input:not([type=hidden]):not([readonly])') || (document.activeElement && document.activeElement.matches('input:not([readonly])') && document.activeElement);
      if (inp && P.visible(inp)) { setNative(inp, v); fire(inp, 'input'); os = await until(() => { const x = openOpts(root); return matchOption(x.map(P.optInfo), v) >= 0 && x; }, 800) || openOpts(root); i = matchOption(os.map(P.optInfo), v); }
    }
    if (i < 0) { await closeCombo(root); return { col, err: os.length ? 'NO_OPTION' : 'FAILED', v }; }
    const opt = os[i], txt = P.optInfo(opt).text;
    try { opt.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    press(opt, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
    const ok = await until(() => shown().includes(txt) || opt.getAttribute('aria-selected') === 'true', 400);
    if (openOpts(root).length && !root.matches('[aria-multiselectable=true]')) await closeCombo(root);
    return ok ? { col, ok: true } : { col, err: 'FAILED', v };
  }

  async function fillOne(it) {
    const r = await fillOne0(it);
    if (r && r.sel) r.sel = it.sel;
    return r;
  }
  async function fillOne0(it) {
    const v = it.v == null ? '' : String(it.v);
    if (v.trim() === '') return { col: it.col, skip: 'empty' };
    const found = P.find(it.css);
    if (!found) return { col: it.col, skip: 'absent' };
    const els = [].concat(found);
    const el = els[0];
    if (!P.visible(el) && !(el.type === 'radio' || el.type === 'checkbox')) return { col: it.col, skip: 'absent' };
    const kind = P.describe(el).kind;
    try {
      if (kind === 'combo') return await fillCombo(el, v.trim(), it.col);
      if (kind === 'datetext') {
        const d = toDate(v);
        if (!d || d.mo < 1 || d.mo > 12 || d.d < 1 || d.d > 31) { if (el.readOnly) return { col: it.col, err: 'BAD_DATE', v }; typeIn(el, v); return { col: it.col, ok: true }; }
        const s = fmtDate(d, fmtFor(el));
        typeIn(el, s); key1(el, 'Escape');
        if (el.value !== s) return { col: it.col, err: 'FAILED', v };
        return { col: it.col, ok: true };
      }
      if (kind === 'file') {
        const files = it.files || [];
        if (!files.length) return { col: it.col, skip: 'empty' };
        if (files.length > 1 && !el.multiple) return { col: it.col, err: 'ONE_FILE', v };
        const dt = new DataTransfer();
        files.forEach(f => {
          const bin = atob(f.data), u8 = new Uint8Array(bin.length);
          for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
          dt.items.add(new File([u8], f.name, { type: f.type || 'application/octet-stream' }));
        });
        el.files = dt.files;
        fire(el, 'input', 'change');
        if (el.files.length !== files.length) return { col: it.col, err: 'FAILED', v };
      } else if (kind === 'select') {
        const opts = Array.from(el.options).map(o => ({ value: o.value, text: o.text.trim() }));
        const i = matchOption(opts, v);
        if (i < 0) return { col: it.col, err: 'NO_OPTION', v };
        try { el.focus({ preventScroll: true }); } catch (e) {}
        el.selectedIndex = i; fire(el, 'input', 'change');
      } else if (kind === 'multiselect') {
        const opts = Array.from(el.options).map(o => ({ value: o.value, text: o.text.trim() }));
        const parts = v.split(/[,，;；、|\/]+/).map(s => s.trim()).filter(Boolean);
        const idx = parts.map(p => matchOption(opts, p));
        if (idx.some(i => i < 0)) return { col: it.col, err: 'NO_OPTION', v: parts[idx.findIndex(i => i < 0)] };
        Array.from(el.options).forEach((o, j) => o.selected = idx.includes(j)); fire(el, 'input', 'change');
      } else if (kind === 'radio') {
        const opts = els.map(x => P.describe(x)).map((d, j) => ({ value: els[j].value, text: (els[j].labels && els[j].labels[0] ? els[j].labels[0].textContent : '').trim() || els[j].value }));
        const i = matchOption(opts, v);
        if (i < 0) return { col: it.col, err: 'NO_OPTION', v };
        setChecked(els[i], true);
      } else if (kind === 'checkbox' && els.length === 1) {
        if (YES.test(v.trim())) setChecked(el, true);
        else if (NO.test(v.trim())) setChecked(el, false);
        else return { col: it.col, err: 'NOT_BOOL', v };
      } else if (kind === 'checkbox' || kind === 'checkgroup') {
        const opts = els.map(x => ({ value: x.value, text: (x.labels && x.labels[0] ? x.labels[0].textContent : '').trim() || x.value }));
        const parts = v.split(/[,，;；、|\/]+/).map(s => s.trim()).filter(Boolean);
        const idx = parts.map(p => matchOption(opts, p));
        const bad = idx.findIndex(i => i < 0);
        if (bad >= 0) return { col: it.col, err: 'NO_OPTION', v: parts[bad] };
        els.forEach((x, j) => setChecked(x, idx.includes(j)));
      } else if (['date', 'datetime-local', 'time', 'month', 'week'].includes(kind)) {
        const s = dateFor(kind, v);
        if (!s) return { col: it.col, err: 'BAD_DATE', v };
        typeIn(el, s);
        if (el.value !== s) return { col: it.col, err: 'BAD_DATE', v };
      } else if (kind === 'editable') {
        el.focus(); el.textContent = v; fire(el, 'input', 'change');
      } else {
        let s = v;
        if (el.type === 'number') { s = v.replace(/[,，\s¥￥$€£]/g, ''); if (s !== '' && isNaN(+s)) return { col: it.col, err: 'NOT_NUMBER', v }; }
        else if ((it.num || el.inputMode === 'numeric' || el.inputMode === 'decimal') && /^[-+]?\d{1,3}([,，]\d{3})+(\.\d+)?$/.test(v.trim())) s = v.trim().replace(/[,，]/g, ''); // 1,200 → 1200
        if (el.maxLength > 0 && s.length > el.maxLength) return { col: it.col, err: 'TOO_LONG', v, max: el.maxLength };
        typeIn(el, s);
      }
    } catch (e) {
      return { col: it.col, err: 'FAILED', v, msg: String(e && e.message || e) };
    }
    return { col: it.col, ok: true };
  }

  /* ---------- 提交按钮 ---------- */
  const SUBMIT_TXT = /^(提交|下一步|下一页|保存|确定|确认|完成|发送|报名|登记|创建|添加|新增|submit|next|continue|save|send|create|add|register|sign\s*up|apply|confirm|done|ok)/i;
  function btnText(b) { return (b.value || b.textContent || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(); }
  function findSubmit(sels) {
    const els = sels.map(s => [].concat(P.find(s) || [])[0]).filter(Boolean).map(e => e.form ? e : (e.closest('form') || e));
    const form = els.map(e => e.form || e.closest('form')).find(Boolean);
    const vis = b => b.getClientRects().length && !b.disabled;
    if (form) {
      const cands = Array.from(form.querySelectorAll('button,input[type=submit],input[type=image]'))
        .concat(form.id ? Array.from(document.querySelectorAll(`[form="${CSS.escape(form.id)}"]`)) : [])
        .filter(vis).filter(b => b.tagName !== 'BUTTON' || (b.type || 'submit') === 'submit');
      const named = cands.find(b => SUBMIT_TXT.test(btnText(b)));
      if (named || cands[0]) return { btn: named || cands[0], form };
    }
    const scope = form || document;
    const any = Array.from(scope.querySelectorAll('button,[role=button],input[type=button],a.btn,a.button')).filter(vis).filter(b => SUBMIT_TXT.test(btnText(b)));
    return { btn: any[any.length - 1] || null, form };
  }

  function firstInvalid(form) {
    const root = form || document;
    const bad = Array.from(root.querySelectorAll('input,select,textarea')).find(el => el.willValidate && !el.checkValidity() && P.visible(el));
    if (!bad) return null;
    const d = P.describe(bad);
    return { label: d.label || d.name || d.placeholder, msg: bad.validationMessage, sel: tag(d.sel) };
  }

  /* ---------- 记住用户自己点提交 ---------- */
  let lastSent = 0;
  function told() {
    const now = Date.now(); if (now - lastSent < 800) return; lastSent = now;
    try { chrome.runtime.sendMessage({ type: 'daibi:submitted', url: location.href }); } catch (e) {}
  }
  document.addEventListener('submit', told, true);
  document.addEventListener('click', e => {
    if (!e.isTrusted) return;
    const b = e.target.closest && e.target.closest('button,input[type=submit],input[type=button],[role=button]');
    if (b && SUBMIT_TXT.test(btnText(b))) setTimeout(told, 0);
  }, true);

  function valuesOf(sels) {
    return sels.map(s => {
      const f = P.find(s); if (!f) return null;
      const els = [].concat(f);
      if (els[0].type === 'radio' || els[0].type === 'checkbox') return els.filter(e => e.checked).map(e => e.value).join(',');
      if (els[0].type === 'file') return Array.from(els[0].files || []).map(f => f.name).join(',');
      return els[0].value ?? els[0].textContent;
    });
  }

  // 网页弹框（alert）拦提交：提交那几秒里，贫僧把弹框的话记下来当出错原因，不让它卡住网页。钩子由侧栏装在网页自己的世界里。
  const DE = document.documentElement;
  function takeAlert() { const a = DE.getAttribute('data-daibi-alert'); if (a != null) DE.removeAttribute('data-daibi-alert'); return a; }
  let disarm = 0;

  async function handle(m) {
    const t = m.type.slice(6);
    const own = (m.sels || []).map(mine).filter(Boolean);
    if (t === 'ping') return { ok: true, top: TOP };
    if (t === 'scan') {
      const fields = P.fields().map(tagD);
      const present = (m.sels || []).filter(s => { const c = mine(s); const f = c && P.find(c); return f && [].concat(f).some(x => P.visible(x)); });
      const cap = P.captcha();
      const frames = TOP ? Array.from(document.querySelectorAll('iframe[src],frame[src]')).filter(f => f.getClientRects().length).map(f => { try { return new URL(f.src, location.href).origin; } catch (e) { return null; } }).filter(o => o && /^https?:/.test(o)) : [];
      return { url: location.href, title: document.title, fields, present, captcha: cap && { sel: tag(cap.sel) }, frames };
    }
    if (t === 'fill') {
      const items = m.items || [], out = [];
      for (const it of items) { const c = mine(it.sel); out.push(c ? await fillOne({ ...it, css: c }) : null); }
      const cap = P.captcha();
      return { items: out, captcha: out.some(Boolean) && cap ? { sel: tag(cap.sel) } : null, url: location.href };
    }
    if (t === 'values') {
      const vals = valuesOf((m.sels || []).map(s => mine(s) || '\u0000'));
      return { values: vals.map((v, k) => mine(m.sels[k]) ? v : '\u0001'), alert: takeAlert() }; // \u0001 = 不归这个 frame
    }
    if (t === 'check') {
      if (!own.length && !(TOP && !(m.sels || []).length)) return { mine: false };
      const { form } = findSubmit(own);
      return { mine: true, invalid: firstInvalid(form), captcha: P.captcha(), alert: takeAlert() };
    }
    if (t === 'submit') {
      const bc = mine(m.btn);
      if (!bc && !own.length && !(TOP && !(m.sels || []).length && !m.btn)) return { mine: false };
      let btn = bc ? [].concat(P.find(bc) || [])[0] : null;
      let form = null;
      if (!btn) ({ btn, form } = findSubmit(own));
      else form = btn.form;
      const inv = firstInvalid(form);
      if (inv) return { mine: true, ok: false, err: 'INVALID', invalid: inv };
      if (!btn) return { mine: true, ok: false, err: 'NO_BUTTON' };
      lastSent = Date.now(); // 自己点的，不当成用户点的
      takeAlert(); DE.setAttribute('data-daibi-arm', '');
      clearTimeout(disarm); disarm = setTimeout(() => DE.removeAttribute('data-daibi-arm'), 4000);
      btn.click();
      return { mine: true, ok: true, label: btnText(btn), alert: takeAlert() };
    }
    if (t === 'pick') {
      const el = await P.pick({ hint: m.hint, noTip: !TOP, accept: m.button ? (e => e.closest && e.closest('button,input[type=submit],input[type=button],[role=button],a')) : undefined });
      return el ? (m.button ? { sel: tag(P.selectorOf(el)), label: btnText(el) } : tagD(P.describe(el))) : null;
    }
    if (t === 'cancelPick') { P.cancelPick(); return { ok: true }; }
    if (t === 'flash') { const c = mine(m.sel); const f = c && P.find(c); if (f) P.flash(f); return { ok: !!f }; }
    return null;
  }
  window.__daibiDo = m => (m && typeof m.type === 'string' && m.type.startsWith('daibi:') ? handle(m) : null);
})();
