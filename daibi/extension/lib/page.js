/* 千手院通用：读页面。在网页里运行（content script），不含任何业务逻辑。
 *   QSLib.page.fields()          → 页面上所有可填的字段（单选/复选按 name 归成一组）
 *   QSLib.page.describe(el)      → 一个输入框的描述 {sel, kind, label, placeholder, name, options...}
 *   QSLib.page.find(sel)         → 按描述里的 sel 找回元素（单选/复选组返回数组）
 *   QSLib.page.pick({hint})      → 让用户在页面上点一个元素，Promise<element|null>，Esc 取消
 *   QSLib.page.flash(els)        → 闪一下高亮
 *   QSLib.page.captcha()         → 页面上像验证码的东西，没有返回 null
 */
(function (g) {
  'use strict';
  if (g.QSLib && g.QSLib.page) return;

  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
  // 自定义下拉（div 做的 select）：ARIA 写法 + 常见组件库的外壳
  const COMBO = ['[role=combobox]:not(input):not(select):not(textarea)', '[aria-haspopup=listbox]:not(input):not(select):not(textarea)',
    '.ant-select:not(.ant-select-dropdown)', '.el-select', '.el-select-v2', '.MuiSelect-select', '.select2-container', '.choices', '.v-select',
    '.ivu-select', '.n-base-selection', '.arco-select-view', '.t-select', '.vs__dropdown-toggle', '.multiselect'].join(',');
  // 下拉展开后的选项
  const OPT = '[role=option],.ant-select-item-option,.el-select-dropdown__item,.MuiMenuItem-root,.select2-results__option,.vs__dropdown-option,' +
    '.choices__item--choice,.ivu-select-item,.n-base-select-option,.arco-select-option,.t-select-option,.multiselect__option';
  const DATEISH = /日期|时间|生日|date|day|birth|yyyy|calendar|picker|选择日期|年月日/i;
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const cssEsc = s => (g.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');

  function visible(el) {
    if (!el.isConnected) return false;
    if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'file') {
      // 很多网站把原生单选/复选藏起来，换成好看的样式；看它的 label 可不可见
      const lab = el.labels && el.labels[0];
      if (lab && lab.getClientRects().length) return true;
      // 上传框常被藏起来，换成一个好看的按钮：外面那层看得见就算
      if (el.type === 'file' && el.parentElement && el.parentElement.getClientRects().length) return true;
    }
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function textOf(node) {
    if (!node) return '';
    const c = node.cloneNode(true);
    c.querySelectorAll('input,select,textarea,button,script,style,option').forEach(x => x.remove());
    return norm(c.textContent).replace(/[\s*＊:：]+$/, '').replace(/^[\s*＊]+/, '');
  }

  function nearbyText(el) {
    // 表格布局：左边那格；行内布局：前一个兄弟里的文字
    const cell = el.closest('td,th');
    if (cell) {
      let prev = cell.previousElementSibling;
      while (prev && !textOf(prev)) prev = prev.previousElementSibling;
      if (prev) return textOf(prev);
    }
    let n = el, hops = 0;
    while (n && hops < 4) {
      let p = n.previousSibling;
      while (p) {
        if (p.nodeType === 3 && norm(p.textContent)) return norm(p.textContent).replace(/[\s*＊:：]+$/, '');
        if (p.nodeType === 1) {
          if (p.matches('input,select,textarea')) return '';
          const t = textOf(p); if (t && t.length <= 40) return t; if (t) return '';
        }
        p = p.previousSibling;
      }
      n = n.parentElement; hops++;
      if (n && n.querySelectorAll('input,select,textarea').length > 1) break;
    }
    return '';
  }

  function labelOf(el) {
    if (el.getAttribute('aria-labelledby')) {
      const t = el.getAttribute('aria-labelledby').split(/\s+/).map(id => textOf(document.getElementById(id))).join(' ');
      if (norm(t)) return norm(t);
    }
    if (el.labels && el.labels.length && (el.type !== 'radio' && el.type !== 'checkbox')) {
      const t = textOf(el.labels[0]);
      // 上传框的 label 往往就是按钮上的「选择文件」，真名字在旁边
      if (el.type === 'file' && /^(点击)?(选择|上传|浏览|添加)|^(choose|upload|browse|select|add)/i.test(t)) { const n = nearbyText(el.labels[0]); if (n) return n; }
      if (t) return t;
    }
    if (el.getAttribute('aria-label')) return norm(el.getAttribute('aria-label'));
    return nearbyText(el);
  }

  function groupLabel(el) {
    const fs = el.closest('fieldset');
    if (fs) { const lg = fs.querySelector('legend'); if (lg && textOf(lg)) return textOf(lg); }
    const rg = el.closest('[role=radiogroup],[role=group]');
    if (rg) {
      const t = rg.getAttribute('aria-label') || (rg.getAttribute('aria-labelledby') && textOf(document.getElementById(rg.getAttribute('aria-labelledby'))));
      if (t) return norm(t);
    }
    // 组外面的标题：往上找，第一个包含整组又带文字的祖先，取组前面的文字
    const name = el.name;
    let box = el.parentElement;
    for (let i = 0; i < 5 && box; i++, box = box.parentElement) {
      const all = name ? box.querySelectorAll(`input[name="${cssEsc(name)}"]`) : [el];
      const others = box.querySelectorAll('input:not([type=hidden]),select,textarea');
      if (others.length > all.length) break;
      const cell = box.matches('td,th') ? box : null;
      if (cell) { const p = cell.previousElementSibling; if (p && textOf(p)) return textOf(p); }
      let p = box.previousElementSibling;
      if (p && textOf(p) && textOf(p).length <= 40 && !p.querySelector('input,select,textarea')) return textOf(p);
    }
    return '';
  }

  function optionText(el) {
    if (el.labels && el.labels.length) return textOf(el.labels[0]);
    if (el.getAttribute('aria-label')) return norm(el.getAttribute('aria-label'));
    let n = el.nextSibling;
    while (n && n.nodeType === 3 && !norm(n.textContent)) n = n.nextSibling;
    if (n) return n.nodeType === 3 ? norm(n.textContent) : textOf(n);
    return el.value;
  }

  // 一个元素所属的自定义下拉的最外层；不是就返回 null
  function comboRoot(el) {
    if (!el || el.nodeType !== 1 || !el.closest) return null;
    let r = el.closest(COMBO);
    if (!r) return null;
    let up;
    while (r.parentElement && (up = r.parentElement.closest(COMBO))) r = up;
    if (r.querySelector('select') && !r.matches('.select2-container')) return null; // 里面是原生下拉，按原生的填
    return r;
  }
  const isCombo = el => !!el && el.nodeType === 1 && !el.matches('input,select,textarea') && comboRoot(el) === el;
  // 只读的日期框（日历控件）：只能点日历，贫僧直接写进去
  function dateLike(el) {
    if (!el.matches('input') || !/^(text|search|)$/.test((el.type || '').toLowerCase())) return false;
    const hay = [el.placeholder, el.name, el.id, el.className, el.getAttribute('aria-label'), el.getAttribute('data-type'), el.readOnly ? labelOf(el) : ''].join(' ');
    return DATEISH.test(hay) || (el.labels && el.labels[0] && DATEISH.test(textOf(el.labels[0])) && el.readOnly);
  }
  function optionsOf(root, onlyVisible) {
    const pools = [root];
    const ids = [root, ...root.querySelectorAll('[aria-controls],[aria-owns]')].flatMap(e => ((e.getAttribute('aria-controls') || '') + ' ' + (e.getAttribute('aria-owns') || '')).split(/\s+/)).filter(Boolean);
    ids.forEach(id => { const x = document.getElementById(id); if (x) pools.push(x); });
    const seen = new Set(), out = [];
    const take = el => {
      if (seen.has(el) || el.closest('[data-qs-ui]')) return; seen.add(el);
      if (el.getAttribute('aria-disabled') === 'true' || /\bdisabled\b|is-disabled/.test(el.className || '')) return;
      if (onlyVisible && !el.getClientRects().length) return;
      out.push(el);
    };
    pools.forEach(p => p.querySelectorAll(OPT + ',li').forEach(take));
    if (onlyVisible && !out.length) document.querySelectorAll(OPT).forEach(take); // 弹层挂在 body 下面（AntD/Element 都这样）
    return out.filter(o => !out.some(x => x !== o && o.contains(x))); // 只留最里层
  }
  const optInfo = o => ({ value: o.getAttribute('data-value') || o.getAttribute('data-v') || o.getAttribute('value') || '', text: norm(o.textContent) });

  function uniq(sel) { try { return document.querySelectorAll(sel).length === 1; } catch (e) { return false; } }

  function pathOf(el) {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.body) {
      if (n.id && !/\d{4,}|^[0-9]/.test(n.id) && uniq('#' + cssEsc(n.id))) { parts.unshift('#' + cssEsc(n.id)); break; }
      let i = 1, s = n;
      while ((s = s.previousElementSibling)) if (s.tagName === n.tagName) i++;
      parts.unshift(n.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
      n = n.parentElement;
    }
    return parts.join(' > ');
  }

  function selectorOf(el) {
    const tag = el.tagName.toLowerCase();
    if ((el.type === 'radio' || el.type === 'checkbox') && el.name) {
      const sel = `input[type=${el.type}][name="${cssEsc(el.name)}"]`;
      return sel;
    }
    if (el.id && !/\d{5,}/.test(el.id) && uniq('#' + cssEsc(el.id))) return '#' + cssEsc(el.id);
    if (el.name) { const s = `${tag}[name="${cssEsc(el.name)}"]`; if (uniq(s)) return s; }
    return pathOf(el);
  }

  function kindOf(el) {
    const tag = el.tagName.toLowerCase();
    if (isCombo(el)) return 'combo';
    if (tag === 'select') return el.multiple ? 'multiselect' : 'select';
    if (tag === 'textarea') return 'textarea';
    if (el.isContentEditable && tag !== 'input') return 'editable';
    const t = (el.type || 'text').toLowerCase();
    if (t === 'radio') return 'radio';
    if (t === 'checkbox') return 'checkbox';
    if (t === 'file') return 'file';
    if (['date', 'datetime-local', 'time', 'month', 'week'].includes(t)) return t;
    if (dateLike(el)) return 'datetext';
    return 'text';
  }

  function describe(el) {
    if (!el) return null;
    const kind = kindOf(el);
    const d = {
      sel: selectorOf(el), kind, type: (el.type || '').toLowerCase(), name: el.name || '', id: el.id || '',
      placeholder: norm(el.getAttribute('placeholder')), title: norm(el.getAttribute('title')),
      label: '', required: !!el.required, options: null, autocomplete: el.getAttribute('autocomplete') || '',
      multiple: !!el.multiple, accept: el.getAttribute('accept') || ''
    };
    if (kind === 'radio' || kind === 'checkbox') {
      const group = el.name ? Array.from(document.querySelectorAll(d.sel)) : [el];
      if (kind === 'checkbox' && group.length === 1) {
        d.kind = 'checkbox';
        d.label = textOf(el.labels && el.labels[0]) || labelOf(el) || groupLabel(el);
        d.groupLabel = groupLabel(el);
      } else {
        if (kind === 'checkbox') d.kind = 'checkgroup';
        d.label = groupLabel(el);
        d.options = group.map(x => ({ value: x.value, text: optionText(x) }));
      }
      if (!el.name) d.sel = selectorOf(el);
    } else if (kind === 'combo') {
      d.label = labelOf(el) || norm((el.querySelector('[class*=placeholder]') || {}).textContent);
      const ph = el.querySelector('[class*=placeholder],.ph'); if (ph) d.placeholder = norm(ph.textContent);
      const os = optionsOf(el, false).map(optInfo).filter(o => o.text);
      if (os.length) d.options = os;
    } else {
      d.label = labelOf(el);
      if (kind === 'select' || kind === 'multiselect') d.options = Array.from(el.options).map(o => ({ value: o.value, text: norm(o.text) }));
    }
    if (!d.label) d.label = d.placeholder || d.title || '';
    return d;
  }

  function fields(root) {
    root = root || document;
    const out = [], seen = new Set();
    const els = new Set();
    root.querySelectorAll('input,select,textarea,[contenteditable=""],[contenteditable=true],' + COMBO).forEach(el => {
      if (el.matches('input,select,textarea')) {
        const c = comboRoot(el); if (c) { els.add(c); return; }   // 下拉里面的搜索框/隐藏框：算到下拉头上
        if (el.getAttribute('aria-hidden') === 'true') return;
      } else if (!el.isContentEditable) { const c = comboRoot(el); if (c) els.add(c); return; }
      els.add(el);
    });
    els.forEach(el => {
      if (el.matches('input') && SKIP_TYPES.has((el.type || '').toLowerCase())) return;
      if (el.disabled || el.readOnly && el.type !== 'date' && el.type !== 'file' && !dateLike(el)) return;
      if (el.getAttribute('aria-disabled') === 'true' || /is-disabled|ant-select-disabled/.test(el.className || '')) return;
      if (el.closest('[data-qs-ui]')) return;
      if (el.closest('.g-recaptcha,.h-captcha,.cf-turnstile,[class*="geetest"]')) return; // 验证码自己的勾，贫僧不碰
      if (!visible(el)) return;
      const d = describe(el);
      if (seen.has(d.sel)) return;
      seen.add(d.sel); out.push(d);
    });
    return out;
  }

  function find(sel) {
    if (!sel) return null;
    let list;
    try { list = Array.from(document.querySelectorAll(sel)); } catch (e) { return null; }
    if (!list.length) return null;
    if (/^input\[type=(radio|checkbox)\]/.test(sel)) return list.length > 1 || /type=radio/.test(sel) ? list : list[0];
    return list[0];
  }

  /* ---------- 高亮 / 点选 ---------- */
  let styleOn = false;
  function ensureStyle() {
    if (styleOn) return; styleOn = true;
    const st = document.createElement('style');
    st.setAttribute('data-qs-ui', '');
    st.textContent = `
      .qs-hl{position:fixed;z-index:2147483646;pointer-events:none;border-radius:8px;box-shadow:0 0 0 2px #0A84FF,0 0 0 6px rgba(10,132,255,.25);transition:all .08s ease-out}
      .qs-hl.flash{animation:qsflash 1.2s ease-out forwards}
      @keyframes qsflash{0%{opacity:1}70%{opacity:1}100%{opacity:0}}
      .qs-tip{position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);background:rgba(29,29,31,.92);color:#F5F5F7;font:500 13px/1.3 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;padding:9px 14px;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.25);pointer-events:none;white-space:nowrap}`;
    (document.head || document.documentElement).appendChild(st);
  }
  function box(el, cls) {
    ensureStyle();
    const b = document.createElement('div'); b.className = 'qs-hl ' + (cls || ''); b.setAttribute('data-qs-ui', '');
    document.documentElement.appendChild(b); place(b, el); return b;
  }
  function place(b, el) {
    const t = (el.type === 'radio' || el.type === 'checkbox') && el.labels && el.labels[0] ? el.labels[0] : el;
    const r = t.getBoundingClientRect();
    Object.assign(b.style, { left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
  }
  function flash(els) {
    els = [].concat(els || []).filter(Boolean);
    if (!els.length) return;
    els[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => els.forEach(el => { const b = box(el, 'flash'); setTimeout(() => b.remove(), 1300); }), 250);
  }

  function inputFrom(t) {
    if (!t || t.nodeType !== 1) return null;
    const c = comboRoot(t); if (c) return c;
    if (t.matches('input,select,textarea')) return t;
    const lab = t.closest('label');
    if (lab && lab.control) return lab.control;
    const inner = t.querySelectorAll ? t.querySelectorAll('input:not([type=hidden]),select,textarea') : [];
    if (inner.length === 1) return inner[0];
    return t.isContentEditable ? t : null;
  }

  let picking = null;
  function pick(opts) {
    opts = opts || {};
    if (picking) picking.cancel();
    ensureStyle();
    return new Promise(resolve => {
      const tip = document.createElement('div'); tip.className = 'qs-tip'; tip.setAttribute('data-qs-ui', '');
      tip.textContent = opts.hint || 'Click a field · Esc to cancel';
      if (!opts.noTip) document.documentElement.appendChild(tip);
      const hl = box(document.body); hl.style.opacity = '0';
      const want = opts.accept || inputFrom;
      const over = e => { const el = want(e.target); if (el) { hl.style.opacity = '1'; place(hl, el); } else hl.style.opacity = '0'; };
      const stop = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
      const click = e => { const el = want(e.target); stop(e); if (el) done(el); };
      const key = e => { if (e.key === 'Escape') { stop(e); done(null); } };
      function done(el) {
        document.removeEventListener('mouseover', over, true);
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(t => document.removeEventListener(t, t === 'click' ? click : stop, true));
        document.removeEventListener('keydown', key, true);
        tip.remove(); hl.remove(); picking = null; resolve(el);
      }
      document.addEventListener('mouseover', over, true);
      ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(t => document.addEventListener(t, t === 'click' ? click : stop, true));
      document.addEventListener('keydown', key, true);
      picking = { cancel: () => done(null) };
    });
  }
  function cancelPick() { if (picking) picking.cancel(); }

  /* ---------- 验证码 ---------- */
  function captcha() {
    const q = 'iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="challenges.cloudflare"],iframe[src*="geetest"],' +
      '.g-recaptcha,.h-captcha,.cf-turnstile,[class*="geetest"],[id*="captcha" i],[class*="captcha" i],[name*="captcha" i],img[src*="captcha" i],[id*="verifycode" i],[name*="verifycode" i]';
    for (const el of document.querySelectorAll(q)) {
      if (el.closest('[data-qs-ui]')) continue;
      if (el.getClientRects().length) return { sel: selectorOf(el) };
    }
    for (const el of document.querySelectorAll('input[placeholder],input[aria-label]')) {
      if (/验证码|captcha|校验码/i.test((el.placeholder || '') + (el.getAttribute('aria-label') || '')) && el.getClientRects().length) return { sel: selectorOf(el) };
    }
    return null;
  }

  g.QSLib = g.QSLib || {};
  g.QSLib.page = { fields, describe, find, pick, cancelPick, flash, captcha, labelOf, selectorOf, visible, comboRoot, optionsOf, optInfo };
})(globalThis);
