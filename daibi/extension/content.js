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
  function fmtFor(el, box) {
    let ph = String(el.getAttribute('placeholder') || '').trim();
    if (!ph && box && box !== el) ph = (box.innerText || '').replace(/\s+/g, '').trim();   // MUI 分段框里写着 MM/DD/YYYY
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
  const fire = (el, ...types) => types.forEach(t => el.dispatchEvent(new Event(t, { bubbles: true, composed: true }))); // composed：Shadow DOM 外面的组件也听得到
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

  /* ---------- 自定义下拉：点开 → 找选项 → 点中（多选逐个点） ---------- */
  function press(el, kinds) {
    const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, buttons: 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    kinds.forEach(k => el.dispatchEvent(k.startsWith('pointer') ? new PointerEvent(k, { ...o, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(k, o)));
  }
  const CLICK = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  const key1 = (el, k) => ['keydown', 'keyup'].forEach(t => el.dispatchEvent(new KeyboardEvent(t, { key: k, code: k, bubbles: true, cancelable: true, composed: true })));
  async function until(fn, ms) { const t0 = Date.now(); let x; while (!(x = fn()) && Date.now() - t0 < ms) await sleep(30); return x; }
  const handleOf = root => root.querySelector('.ant-select-selector,.el-select__wrapper,.el-input__wrapper,.el-input__inner,.select2-selection,.vs__dropdown-toggle,.n-base-selection-label,.ivu-select-selection,[role=combobox]') || root;
  const SELD = /\b(ant-select-item-option-selected|is-selected|selected|Mui-selected|select2-results__option--selected|vs__dropdown-option--selected|multiselect__option--selected)\b/;
  const isSel = o => o.getAttribute('aria-selected') === 'true' || SELD.test(o.className || '');
  let stale = new Set(), openFor = null; // 点开之前就看得见的选项（上一个下拉正在收起的菜单），不算这个下拉的
  const openOpts = root => P.optionsOf(root, true).filter(o => !stale.has(o) || root.contains(o));
  async function openCombo(root) {
    const h = handleOf(root);
    try { h.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    const expanded = [root, ...root.querySelectorAll('[aria-expanded]')].some(e => e.getAttribute('aria-expanded') === 'true');
    let os = (openFor === root || expanded) ? openOpts(root) : [];
    if (os.length) return os;
    stale = new Set(P.optionsOf(document.body, true)); openFor = root;
    press(h, ['pointerdown', 'mousedown', 'pointerup', 'mouseup']);   // AntD / MUI 按下就开
    if ((os = await until(() => { const x = openOpts(root); return x.length && x; }, 250))) return os;
    press(h, ['click']);                                              // Element / 自家组件 点了才开
    if ((os = await until(() => { const x = openOpts(root); return x.length && x; }, 500))) return os;
    try { h.focus(); } catch (e) {} key1(document.activeElement || h, 'ArrowDown'); // 键盘开
    return (await until(() => { const x = openOpts(root); return x.length && x; }, 300)) || [];
  }
  async function closeCombo(root, picked) {
    openFor = null;
    const shut = () => !openOpts(root).length || [root, ...root.querySelectorAll('[aria-expanded]')].some(e => e.getAttribute('aria-expanded') === 'false');
    if (picked && await until(shut, 300)) return;   // 单选点中了一般自己收起；aria-expanded 先变，不等收起动画
    if (!openOpts(root).length) return;
    key1(document.activeElement || root, 'Escape');
    if (await until(shut, 250)) return;
    await sleep(40);
    if (openOpts(root).length) { press(handleOf(root), ['click']); await sleep(40); }
    if (openOpts(root).length) press(document.body, CLICK);
  }
  // 选项太多只画看得见的那几条（虚拟列表，AntD 默认就是）：往下滚着找
  async function scrollFind(root, v) {
    let os = openOpts(root);
    const box = os[0] && (function up(n) { while (n && n !== document.body) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) return n; n = n.parentElement; } return null; })(os[0].parentElement);
    if (!box) return -1;
    box.scrollTop = 0; box.dispatchEvent(new Event('scroll')); await sleep(40);
    for (let k = 0; k < 40; k++) {
      os = openOpts(root);
      const i = matchOption(os.map(P.optInfo), v); if (i >= 0) return i;
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) break;
      box.scrollTop += Math.max(40, box.clientHeight * 0.8); box.dispatchEvent(new Event('scroll')); await sleep(60);
    }
    return -1;
  }
  async function findOpt(root, v) {
    let os = await openCombo(root);
    let i = matchOption(os.map(P.optInfo), v);
    if (i < 0) { // 能搜的下拉：打字再找
      const inp = root.querySelector('input:not([type=hidden]):not([readonly]):not([aria-hidden=true])') || (document.activeElement && document.activeElement.matches('input:not([readonly])') && root.contains(document.activeElement) && document.activeElement);
      if (inp && P.visible(inp)) {
        setNative(inp, v); fire(inp, 'input');
        await until(() => matchOption(openOpts(root).map(P.optInfo), v) >= 0, 800);
        i = matchOption(openOpts(root).map(P.optInfo), v);
        if (i < 0) { setNative(inp, ''); fire(inp, 'input'); await sleep(60); if (!openOpts(root).length) await openCombo(root); } // 搜不到：把搜索词清掉，别把列表留成空的
      }
    }
    if (i < 0) i = await scrollFind(root, v);
    os = openOpts(root);
    return { os, i };
  }
  async function clickOpt(root, opt) {
    try { opt.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    press(opt, CLICK);
  }
  async function fillCombo(root, v, col) {
    const shown = () => (root.innerText || '').replace(/\s+/g, ' ').trim();
    // 先整格当一个选项找；找不到、又能拆成几个，就当多选
    let { os, i } = await findOpt(root, v);
    const parts = v.split(/[,，;；、|\/]+/).map(x => x.trim()).filter(Boolean);
    const exact = i >= 0 && (o => o.text === v || o.value === v || key(o.text) === key(v))(P.optInfo(os[i]));
    if (i >= 0 && (exact || parts.length < 2)) {
      const opt = os[i], txt = P.optInfo(opt).text;
      if (!isSel(opt) || !shown().includes(txt)) await clickOpt(root, opt);
      const ok = await until(() => shown().includes(txt) || isSel(opt), 500);
      await closeCombo(root, true);
      return ok ? { col, ok: true } : { col, err: 'FAILED', v };
    }
    if (parts.length < 2) { await closeCombo(root); return { col, err: os.length ? 'NO_OPTION' : 'FAILED', v }; }
    // 多选：先把不要的勾掉，再逐个点要的
    const want = new Set();
    for (const p of parts) {
      let r = await findOpt(root, p);
      if (r.i < 0) { await closeCombo(root); return { col, err: r.os.length ? 'NO_OPTION' : 'FAILED', v: p }; }
      const opt = r.os[r.i]; want.add(P.optInfo(opt).text);
      if (!isSel(opt) && !shown().includes(P.optInfo(opt).text)) { await clickOpt(root, opt); await sleep(60); }
    }
    for (const o of openOpts(root)) if (isSel(o) && !want.has(P.optInfo(o).text)) { await clickOpt(root, o); await sleep(60); }
    const s = shown();
    const ok = [...want].every(t => s.includes(t)) || [...want].every(t => openOpts(root).some(o => P.optInfo(o).text === t && isSel(o)));
    await closeCombo(root);
    return ok ? { col, ok: true } : { col, err: 'FAILED', v };
  }

  /* ---------- 日历控件：点开 → 翻到那个月 → 点那一格 ---------- */
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const OUTDAY = /prev-month|next-month|other-month|outside|out-of|adjacent|prevMonthDay|nextMonthDay|dayOutsideMonth|not-current|old\b|new\b|disabled/i;
  function parseYM(t) {
    t = String(t || '');
    const y = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(t); if (!y) return null;
    let m = /(\d{1,2})\s*月/.exec(t);
    if (m) return { y: +y[1], m: +m[1] };
    m = new RegExp('\\b(' + MON.join('|') + ')[a-z]*\\.?\\b', 'i').exec(t);
    if (m) return { y: +y[1], m: MON.indexOf(m[1].toLowerCase()) + 1 };
    m = /(?:19|20)\d{2}\s*[-/.]\s*(\d{1,2})(?!\d)/.exec(t) || /(?:^|\D)(\d{1,2})\s*[-/.]\s*(?:19|20)\d{2}/.exec(t);
    return m ? { y: +y[1], m: +m[1] } : null;
  }
  function attrDate(c) {
    for (let n = c, k = 0; n && k < 3; n = n.parentElement, k++) {
      const ts = n.getAttribute('data-timestamp'); if (ts && /^\d{12,}$/.test(ts)) { const d = new Date(+ts); return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate() }; }
      for (const a of ['data-date', 'data-value', 'datetime', 'title', 'aria-label', 'data-iso']) {
        const v = n.getAttribute(a); if (!v || !/\d/.test(v)) continue;
        let d = toDate(v);
        if (!d) { const ym = parseYM(v), dm = /(?:^|\D)(\d{1,2})(?:st|nd|rd|th|日)?(?:\D|$)/.exec(v.replace(/(?:19|20)\d{2}/, '')); if (ym && dm) d = { y: ym.y, mo: ym.m, d: +dm[1] }; }
        if (d && d.mo >= 1 && d.mo <= 12) return d;
      }
    }
    return null;
  }
  // 看得见的「日子格」：字是 1–31，最里层
  function dayCells(scope) {
    const out = [];
    scope.querySelectorAll('td,[role=gridcell],button,a,span,div,li').forEach(c => {
      if (c.closest('[data-qs-ui]')) return;
      const t = (c.textContent || '').trim();
      if (!/^\d{1,2}$/.test(t) || +t < 1 || +t > 31) return;
      if ([...c.children].some(x => (x.textContent || '').trim() === t)) return;
      if (!P.shown(c)) return;
      out.push(c);
    });
    return out;
  }
  const lca = els => { let a = els[0]; while (a && !els.every(e => a.contains(e))) a = a.parentElement; return a; };
  function navBtn(pop, dir, year) {
    const RX = year
      ? (dir < 0 ? /super-prev|d-arrow-left|prev-?year|previous year|上一?年|前一年|«/i : /super-next|d-arrow-right|next-?year|next year|下一?年|后一年|»/i)
      : (dir < 0 ? /prev|previous|上一?个?月|前一?月|‹|<|←|left/i : /next|下一?个?月|后一?月|›|>|→|right/i);
    const NOT = year ? null : /super|d-arrow|year|年|«|»/i;
    return [...pop.querySelectorAll('button,[role=button],a,span,i,th,div')].filter(b => P.shown(b) && b.children.length <= 3).find(b => {
      const s = [b.getAttribute('aria-label'), b.getAttribute('title'), b.className && b.className.baseVal == null ? b.className : '', b.children.length ? '' : b.textContent].join(' ');
      return RX.test(s) && !(NOT && NOT.test(s)) && !/^\d+$/.test((b.textContent || '').trim());
    }) || null;
  }
  function headerOf(pop) {
    const hs = [...pop.querySelectorAll('[class*=header i],[class*=caption i],[class*=title i],[aria-live],[class*=label i]')].filter(P.shown);
    for (const h of hs) { const ym = parseYM(h.innerText); if (ym) return ym; }
    return parseYM(pop.innerText);
  }
  async function openCal(el) {
    const before = new Set(dayCells(document.body));
    const btn = el.matches('input') ? null : el.querySelector('button[aria-label],button');
    const targets = [el.matches('input') ? el : null, btn, el].filter(Boolean);
    for (const t of targets) {
      try { t.focus({ preventScroll: true }); } catch (e) {}
      press(t, CLICK);
      const fresh = await until(() => { const c = dayCells(document.body).filter(x => !before.has(x)); return c.length >= 28 && c; }, 600);
      if (fresh) { let pop = lca(fresh); while (pop.parentElement && pop.parentElement !== document.body && !pop.parentElement.contains(el)) pop = pop.parentElement; return pop; } // 往上到弹层的最外层（含月份标题和翻页钮）
    }
    return null;
  }
  async function pickDate(el, d) {
    const pop = await openCal(el);
    if (!pop) return false;
    for (let step = 0; step < 150; step++) {
      const cells = dayCells(pop);
      let c = cells.find(x => { const a = attrDate(x); return a && a.y === d.y && a.mo === d.mo && a.d === d.d; });
      const ym = headerOf(pop) || (() => { const a = cells.map(attrDate).filter(Boolean); return a.length ? { y: a[Math.floor(a.length / 2)].y, m: a[Math.floor(a.length / 2)].mo } : null; })();
      if (!c && ym && ym.y === d.y && ym.m === d.mo) {
        const inMonth = cells.filter(x => !attrDate(x) && !OUTDAY.test(x.className + ' ' + (x.closest('td,[role=gridcell]') || x).className) && x.getAttribute('aria-disabled') !== 'true');
        const hits = inMonth.filter(x => +x.textContent.trim() === d.d);
        c = d.d <= 15 ? hits[0] : hits[hits.length - 1];   // 没标「不是本月」的日历：月初取第一个，月底取最后一个
      }
      if (c) {
        press(c, CLICK);
        await sleep(80);
        const ok = [...pop.querySelectorAll('button')].find(b => P.shown(b) && /^(确定|确认|ok|apply|done|完成)$/i.test(b.textContent.trim()));
        if (ok) press(ok, CLICK);
        return true;
      }
      if (!ym) return false;
      const diff = (d.y - ym.y) * 12 + d.mo - ym.m;
      const b = (Math.abs(diff) >= 12 && navBtn(pop, diff, true)) || navBtn(pop, diff, false);
      if (!b) return false;
      const sig = pop.innerText;
      press(b, CLICK);
      await until(() => pop.innerText !== sig, 600);
      await sleep(20);
    }
    return false;
  }
  // 日期框现在显示的是哪天
  const shownDate = el => {
    const t = el.matches('input') ? el.value : ((el.querySelector('input') || {}).value || el.innerText || '');
    return toDate(String(t).replace(/\s+/g, ''));
  };
  const same = (a, b) => a && b && a.y === b.y && a.mo === b.mo && a.d === b.d;
  async function fillDateText(el, v, col) {
    const d = toDate(v);
    const inp = el.matches('input') ? el : null;
    if (!d || d.mo < 1 || d.mo > 12 || d.d < 1 || d.d > 31) {
      if (!inp || inp.readOnly) return { col, err: 'BAD_DATE', v };
      typeIn(inp, v); return { col, ok: true };
    }
    if (same(shownDate(el), d)) return { col, ok: true };
    const fmtEl = inp || el.querySelector('input') || el;
    const s = fmtDate(d, fmtFor(fmtEl, el));
    // 1) 能打字的框：照框的格式写进去，回车，等框架重画一轮，值还在才算
    if (inp && !inp.readOnly) {
      try { inp.focus({ preventScroll: true }); } catch (e) {}
      setNative(inp, s); fire(inp, 'input', 'change'); key1(inp, 'Enter');
      await sleep(60); try { inp.blur(); } catch (e) {} key1(inp, 'Escape');
      if (await until(() => same(shownDate(el), d), 250)) { await sleep(60); if (same(shownDate(el), d)) return { col, ok: true }; }
    } else if (!inp) {
      // 分段日期框（MUI）：藏着的 input 接受整串粘贴
      const h = el.querySelector('input');
      if (h) { setNative(h, s); fire(h, 'input', 'change'); if (await until(() => same(shownDate(el), d), 250)) return { col, ok: true }; }
    }
    // 2) 只读框 / 写进去不认：点开日历，翻到那个月，点那一格
    const picked = await pickDate(el, d);
    if (picked && await until(() => same(shownDate(el), d), 600)) { key1(inp || el, 'Escape'); try { (inp || document.activeElement).blur(); } catch (e) {} return { col, ok: true }; }
    // 3) 都不行：老办法硬写（有的只读框写 value 就认）
    if (inp) {
      typeIn(inp, s); key1(inp, 'Escape');
      if (inp.value === s) return { col, ok: true };
    }
    return { col, err: 'FAILED', v };
  }

  async function fillOne(it) {
    const r = await fillOne0(it);
    if (r && r.sel) r.sel = it.sel;
    return r;
  }
  async function fillOne0(it) {
    const v = it.v == null ? '' : String(it.v);
    if (v.trim() === '') return { col: it.col, skip: 'empty' };
    let found = P.find(it.css);
    // 选择器找到的框，名字跟绑的时候对不上（网站改版、前面多了个提示条）：按名字在这页上重找，唯一的才用
    if (it.label && (!found || P.describe([].concat(found)[0]).label !== it.label)) {
      const alt = P.fields().filter(f => f.label === it.label);
      if (alt.length === 1) found = P.find(alt[0].sel);
    }
    if (!found) return { col: it.col, skip: 'absent' };
    const els = [].concat(found);
    const el = els[0];
    if (!P.visible(el) && !(el.type === 'radio' || el.type === 'checkbox')) return { col: it.col, skip: 'absent' };
    const kind = P.describe(el).kind;
    try {
      if (kind === 'combo') return await fillCombo(el, v.trim(), it.col);
      if (kind === 'datetext') return await fillDateText(el, v, it.col);
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
  // AntD 会在两个汉字的按钮中间塞空格（「提 交」），去掉再认
  function btnText(b) { return (b.value || b.textContent || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().replace(/([\u4e00-\u9fff]) (?=[\u4e00-\u9fff])/g, '$1'); }
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
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    const b = t.closest && t.closest('button,input[type=submit],input[type=button],[role=button]');
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
