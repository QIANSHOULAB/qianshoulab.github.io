/* 代笔僧侧栏：读表、对字段、按行填、跟踪提交、标状态。表格和对应只存在本机 chrome.storage.local。 */
(() => {
  'use strict';
  const I18N = QSLib.i18n, { t } = I18N;
  const store = QSLib.store, TB = QSLib.table, FILES = QSLib.files, M = DaibiMatch;
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // 语言：默认英文，右上角 EN / 中文 选过就记在 chrome.storage.local「daibi:lang」，下次打开直接用；不跟浏览器语言走
  const LANG_KEY = 'daibi:lang';
  function applyLang() {
    I18N.apply();
    document.title = t('app.name');
    $('homeLink').href = t('common.homeUrl');
    I18N.toggle($('langSeg'), pickLang);
  }
  async function pickLang(l) {
    I18N.setLang(l);
    await store.set(LANG_KEY, I18N.lang);
    hideToast(); applyLang(); drawSettings(); render();
  }
  $('ver').textContent = chrome.runtime.getManifest().version;
  // 顶栏右上角「…」：署名、总舵、找方丈都收在这里，侧栏正文只干一件事
  const menuOpen = on => { $('menu').hidden = !on; $('btnMore').setAttribute('aria-expanded', String(on)); };
  $('btnMore').onclick = e => { e.stopPropagation(); menuOpen($('menu').hidden); };
  document.addEventListener('click', e => { if (!$('menu').hidden && !e.target.closest('#menu')) menuOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('menu').hidden) menuOpen(false); });

  const SETTINGS = store.settings('daibi', [
    { key: 'auto', type: 'bool', def: false, label: 'set.auto', hint: 'set.autoHint' }
  ]);
  let cfg = { auto: false };

  let S = { table: null, st: [], cur: 0 };       // 表格 + 每行状态
  let maps = {};                                 // 每个网站一份：origin → {b:{表头:{sel,label,kind,conf}}, btn, start}
  const tab = { id: null, url: '', origin: '', host: '', pat: '', win: null };
  let page = { fields: null, present: [], note: '', noteBad: false, frames: [] };
  const run = { row: -1, seen: new Set(), textSels: new Set(), start: '', phase: 'idle', going: false, nav: false, human: false, timer: 0, tries: 0, busy: false, hold: false, gen: 0, active: 0 };
  let keptN = 0, filter = 'all', picking = null, lastFile = null, showAll = false, attN = 0, warnCols = null, demoTable = null;
  const FIXED_TAB = new URLSearchParams(location.search).get('tab'); // 测试用：指定要填的标签页
  const DEMO_URL = 'https://qianshoulab.github.io/daibi/demo/';
  const SAMPLE = { en: 'sample-en.csv', zh: 'sample.csv' }; // 示例表各写一套：英文界面给英文示例

  /* ---------- 存 ---------- */
  let saveT = 0;
  const saveSheet = () => { clearTimeout(saveT); saveT = setTimeout(() => store.set('daibi:sheet', S), 250); };
  const saveMaps = () => store.set('daibi:maps', maps);
  const map = () => tab.origin ? (maps[tab.origin] = maps[tab.origin] || { b: {}, btn: null, start: '' }) : null;
  const bound = () => { const m = tab.origin && maps[tab.origin]; return m && S.table ? S.table.headers.filter(h => m.b[h]).length : 0; };

  /* ---------- 标签页 ---------- */
  function setUrl(u) {
    tab.url = u || '';
    try {
      const x = new URL(u);
      if (!/^https?:$/.test(x.protocol)) throw 0;
      tab.origin = x.origin; tab.host = x.host; tab.pat = `${x.protocol}//${x.hostname}/*`;
    } catch (e) { tab.origin = ''; tab.host = ''; tab.pat = ''; }
  }
  async function resolveTab() {
    let tb = null;
    try {
      if (FIXED_TAB) tb = await chrome.tabs.get(+FIXED_TAB);
      else {
        const w = await chrome.windows.getCurrent(); tab.win = w.id;
        [tb] = await chrome.tabs.query({ active: true, windowId: w.id });
      }
    } catch (e) {}
    const changed = !tb || tb.id !== tab.id;
    tab.id = tb ? tb.id : null; setUrl(tb && tb.url);
    if (changed) { page = { fields: null, present: [], note: '', noteBad: false, frames: [] }; }
  }

  /* 跟网页说话：顶层页面和里面的 iframe（授权过的）各跑一份手，executeScript 一次问遍，按 frame 收答案再合起来 */
  const ASK = m => (window.__daibiDo ? window.__daibiDo(m) : { __missing: true });
  const exec = (msg, frameIds) => chrome.scripting.executeScript({ target: frameIds ? { tabId: tab.id, frameIds } : { tabId: tab.id, allFrames: true }, func: ASK, args: [msg] });
  async function ask(msg) {
    if (tab.id == null) throw new Error('NO_TAB');
    let rs = null;
    try { rs = await exec(msg); } catch (e) { try { rs = await exec(msg, [0]); } catch (e2) {} }
    if (!rs || rs.some(r => r.result && r.result.__missing)) {
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['lib/page.js', 'content.js'] }); }
      catch (e) {
        try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/page.js', 'content.js'] }); } catch (e2) { throw new Error('NO_ACCESS'); }
      }
      try { rs = await exec(msg); } catch (e) { rs = await exec(msg, [0]); }
    }
    return rs.filter(r => r.result && !r.result.__missing).sort((a, b) => a.frameId - b.frameId);
  }
  async function call(msg) {
    const rs = await ask(msg), R = rs.map(r => r.result);
    const top = (rs.find(r => r.frameId === 0) || rs[0] || {}).result || {};
    const first = f => { for (const x of R) { const v = f(x); if (v != null) return v; } return null; };
    switch (msg.type) {
      case 'daibi:scan': return { url: top.url, title: top.title, fields: R.flatMap(x => x.fields || []), present: R.flatMap(x => x.present || []), captcha: first(x => x.captcha), frames: top.frames || [] };
      case 'daibi:fill': return { url: top.url, captcha: first(x => x.captcha), items: msg.items.map((it, k) => first(x => x.items && x.items[k]) || { col: it.col, skip: 'absent' }) };
      case 'daibi:values': return { alert: first(x => x.alert), values: (msg.sels || []).map((_, k) => { for (const x of R) { const v = x.values && x.values[k]; if (v !== '\u0001' && v !== undefined) return v; } return null; }) };
      case 'daibi:check': { const o = R.find(x => x.mine) || {}; return { invalid: o.invalid || null, captcha: first(x => x.captcha), alert: first(x => x.alert) }; }
      case 'daibi:submit': return R.find(x => x.mine) || { ok: false, err: 'NO_BUTTON' };
      default: return top;
    }
  }
  // 点选：每个 frame 都等着，用户点在哪个算哪个
  async function pickAny(msg) {
    const ids = (await ask({ type: 'daibi:ping' })).map(r => r.frameId);
    return new Promise(resolve => {
      let left = ids.length, done = false;
      const end = r => { if (done) return; done = true; resolve(r); call({ type: 'daibi:cancelPick' }).catch(() => {}); };
      ids.forEach(fid => exec(fid === 0 ? msg : { ...msg, hint: '' }, [fid])
        .then(x => { const r = x && x[0] && x[0].result; if (r && !r.__missing) end(r); else if (r === null && fid === 0) end(null); })
        .catch(() => {}).finally(() => { if (--left === 0) end(null); }));
    });
  }
  // 网页的 alert 装个耳朵：只在贫僧点提交后的几秒里收下弹框的话，平时原样弹
  function hookAlert() {
    if (window.__daibiAlert) return; window.__daibiAlert = 1;
    const de = document.documentElement, orig = window.alert;
    window.alert = function (m) { if (de.hasAttribute('data-daibi-arm')) { de.setAttribute('data-daibi-alert', String(m ?? '')); return; } return orig.apply(this, arguments); };
  }
  const armAlert = () => chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, world: 'MAIN', func: hookAlert }).catch(() => {});
  async function learnUrl() { // 没拿到网址时（只有 activeTab），从页面里问
    if (tab.url) return;
    try { const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => location.href }); setUrl(r && r.result); } catch (e) {}
  }
  // 必须在点击里同步调用，浏览器才会弹授权
  // 表单在别家网站的 iframe 里（嵌入的报名表、第三方表单）：一并要
  function askAccess() {
    if (!tab.pat) return Promise.resolve(false);
    const pats = [tab.pat, ...(page.frames || []).map(o => { try { const u = new URL(o); return `${u.protocol}//${u.hostname}/*`; } catch (e) { return null; } }).filter(Boolean)];
    return chrome.permissions.request({ origins: [...new Set(pats)] }).catch(() => false);
  }

  const boundSels = () => { const m = map(); return m && S.table ? S.table.headers.map(h => m.b[h] && m.b[h].sel).filter(Boolean) : []; };
  async function scan() {
    const r = await call({ type: 'daibi:scan', sels: boundSels() });
    page.fields = r.fields; page.present = r.present; page.frames = r.frames || [];
    if (r.url) setUrl(r.url);
    return r;
  }

  async function refreshPage() {
    if (demoTable && tab.url.startsWith(DEMO_URL)) { const d = demoTable; demoTable = null; lastFile = null; return setTable(d, true); }
    if (!S.table || tab.id == null) return render();
    try { await scan(); if (page.note === 'fields.noPage' || page.note === 'fields.needClick') note(''); }
    catch (e) { page.fields = null; page.present = []; }
    render();
    autoFill();
  }

  /* 手动模式：表放进来、字段对上、这个网站已经答应过 → 直接把这一行填进网页（没提交），人只管看一眼、点提交。
   * 第一次进某个网站还没答应，就留着主按钮那一下（浏览器要人在侧栏里点一下才肯问「允许吗」）。
   * 填了马上出提示条「撤」：网页刷新回空表，这一行退回待填，不再自己填，等人点主按钮。 */
  const hasPerm = () => tab.pat ? chrome.permissions.contains({ origins: [tab.pat] }).catch(() => false) : Promise.resolve(false);
  // 只在当初对字段的那一页自己填（同一网站别的页碰巧有个同名的框，不往里填）
  const onStartPage = () => { const m = tab.origin && maps[tab.origin]; if (!m || !m.start) return false; try { return new URL(m.start).pathname === new URL(tab.url).pathname; } catch (e) { return false; } };
  async function autoFill() {
    if (run.af) return;
    run.af = true;
    try { await autoFill0(); } finally { run.af = false; }
  }
  async function autoFill0() {
    if (cfg.auto || run.hold || picking || !S.table || run.row >= 0 || run.phase !== 'idle' || run.going) return;
    const st = S.st[S.cur];
    if (!st || st.s !== 'todo' || !bound() || !onStartPage()) return;
    if (!page.present.length) { try { await scan(); } catch (e) { return; } if (!page.present.length) return; } // 刚对完字段，present 还是对之前扫的
    if (!(await hasPerm())) return;
    if (run.row >= 0 || run.phase !== 'idle') return;
    const miss = unmatchedFields(); // 有框没主、表里又有没对上的列：先问一句，问完再填
    if (miss.length) { warnCols = miss; return render(); }
    if (warnCols) { warnCols = null; render(); }
    startRow(S.cur);
  }
  function undoFill() {
    clearTimeout(run.timer); run.gen++;
    const i = run.row >= 0 ? run.row : S.cur;
    if (S.st[i] && S.st[i].s === 'filled') setSt(i, 'todo');
    S.cur = i; run.row = -1; run.phase = 'idle'; run.going = false; run.hold = true;
    run.seen = new Set(); run.textSels = new Set();
    hideToast(); render();
    if (tab.id != null) chrome.tabs.reload(tab.id).catch(() => {});
  }

  /* ---------- 对字段 ---------- */
  function note(k, bad) { page.note = k; page.noteBad = !!bad; } // 存 key，画的时候按当前语言出字
  function startMatch() {
    const p = askAccess();
    p.then(async ok => {
      await learnUrl();
      try { await scan(); } catch (e) { note(tab.url ? (ok ? 'fields.cantRun' : 'fields.denied') : 'fields.needClick', true); return render(); }
      matchNow(false);
      autoFill();
    });
  }
  function matchNow(quiet) {
    const m = map(); if (!m || !page.fields) return;
    if (!page.fields.length) { note('fields.noFields', true); return render(); }
    m.b = M.autoMatch(S.table.headers, S.table.rows, page.fields, m.b);
    m.start = tab.url; m.off = [];
    saveMaps(); note('');
    if (!quiet) toast(t('toast.matched', { n: bound() }));
    render();
  }
  function addNewMatches() { // 多页表单：翻到新的一页，把有把握的新格子补上
    const m = map(); if (!m || !page.fields || !S.table) return;
    const nb = M.autoMatch(S.table.headers, S.table.rows, page.fields, m.b, true);
    let n = 0;
    const off = new Set(m.off || []); // 用户亲手解绑的列，跑的时候不再自作主张补回去
    Object.entries(nb).forEach(([h, b]) => { if (!m.b[h] && !off.has(h) && b.conf === 'sure') { m.b[h] = b; n++; } });
    if (n) saveMaps();
  }

  function pickFor(h) {
    if (picking) { const was = picking; picking = null; call({ type: 'daibi:cancelPick' }).catch(() => {}); render(); if (was === h) return; }
    const p = askAccess();
    picking = h; render();
    p.then(async () => {
      await learnUrl();
      let r = null;
      try {
        r = await pickAny(h === '\u0000btn'
          ? { type: 'daibi:pick', button: true, hint: t('fields.pickBtnHint') }
          : { type: 'daibi:pick', hint: t('fields.pickHint', { col: h }) });
      } catch (e) { note('fields.needClick', true); }
      if (picking !== h) return;
      picking = null;
      const m = map();
      if (r && m) {
        if (h === '\u0000btn') m.btn = { sel: r.sel, label: r.label };
        else {
          Object.keys(m.b).forEach(k => { if (m.b[k] && m.b[k].sel === r.sel) delete m.b[k]; });
          m.b[h] = { sel: r.sel, label: r.label || r.placeholder || r.name || r.sel, kind: r.kind, conf: 'manual' };
          m.off = (m.off || []).filter(x => x !== h);
          if (!m.start) m.start = tab.url;
        }
        saveMaps();
        try { await scan(); } catch (e) {}
      }
      render();
      autoFill();
    });
  }

  /* ---------- 填 ---------- */
  const autoOn = () => cfg.auto && run.going;
  const flowOn = () => cfg.auto ? run.going : true;
  const TEXTISH = new Set(['text', 'textarea', 'editable', 'date', 'datetime-local', 'time', 'month', 'week', 'datetext']);
  // 整列都是数（允许 1,200 这种千分位）：填进文本框时去掉逗号
  let numCols = null;
  const NUMV = /^[-+]?(\d{1,3}([,，]\d{3})+|\d+)(\.\d+)?$/;
  function isNumCol(ci) {
    if (!numCols || numCols.t !== S.table) {
      numCols = { t: S.table, c: S.table.headers.map((_, k) => { const v = S.table.rows.map(r => String(r[k] ?? '').trim()).filter(Boolean); return v.length > 0 && v.every(x => NUMV.test(x)) && v.some(x => /[,，]/.test(x)); }) };
    }
    return numCols.c[ci];
  }
  function setSt(i, s, m) { S.st[i] = m ? { s, m } : { s }; if (s === 'done' && tab.origin) S.site = tab.origin; saveSheet(); }
  function nextTodo(from) {
    const n = S.st.length;
    for (let k = 0; k < n; k++) { const i = (from + k) % n; if (S.st[i].s === 'todo' || S.st[i].s === 'filled') return i; }
    return -1;
  }
  const msg = (k, v) => ({ k, v });
  const errText = x => msg('err.' + x.err, { col: x.col, v: x.v, max: x.max, label: x.invalid && x.invalid.label, msg: x.invalid && x.invalid.msg });
  // 行上的话：0.3.0 存的是字（老数据原样显示）；0.4.0 起存 {k, v}，几条一起的存数组
  const mText = m => m == null ? '' : typeof m === 'string' ? m : Array.isArray(m) ? m.map(mText).join(t('fmt.sep')) : t(m.k, m.v);

  // 每次开一行记一个号；旧的那条链（被「撤」「从头来」「连填」打断的）醒来发现号变了就收手
  async function startRow(i) {
    run.active = (run.active || 0) + 1;
    try { return await startRow0(i); } finally { run.active--; }
  }
  async function startRow0(i) {
    if (i < 0) return finish();
    clearTimeout(run.timer);
    const gen = ++run.gen;
    run.row = i; S.cur = i; run.seen = new Set(); run.textSels = new Set(); run.human = false; run.phase = 'filling';
    render();
    let sc;
    try { sc = await scan(); } catch (e) { if (gen !== run.gen) return; run.phase = 'idle'; run.row = -1; note('fields.needClick', true); return render(); }
    if (gen !== run.gen) return;
    const m = map();
    if (!sc.present.length && m && m.start && m.start !== tab.url) { // 不在表单页：先回去
      run.phase = 'back'; run.nav = true;
      return chrome.tabs.update(tab.id, { url: m.start });
    }
    run.start = tab.url;
    return fillStep(sc);
  }

  async function fillStep(sc) {
    run.fillBusy = true;
    try { return await fillStep0(sc); } finally { run.fillBusy = false; }
  }
  async function fillStep0(sc) {
    const i = run.row, gen = run.gen; if (i < 0) return;
    const m = map(), H = S.table.headers, row = S.table.rows[i];
    if (!sc) sc = await scan();
    addNewMatches();
    const items = [];
    H.forEach((h, ci) => { const b = m.b[h]; if (b && !run.seen.has(b.sel)) items.push({ col: h, sel: b.sel, v: row[ci], num: isNumCol(ci), label: b.label }); });
    // 上传框：按单元格里的文件名去附件袋里取
    const missing = [];
    for (const it of items) {
      if ((m.b[it.col] || {}).kind !== 'file') continue;
      const names = String(it.v || '').split(/[;；,，、|\n]+/).map(x => x.trim()).filter(Boolean);
      it.files = [];
      for (const n of names) {
        const rec = await FILES.find(n).catch(() => null);
        if (!rec) { missing.push({ col: it.col, err: 'NO_FILE', v: FILES.base(n) }); break; }
        it.files.push(await FILES.toPayload(rec));
      }
    }
    if (missing.length) {
      setSt(i, 'error', missing.map(errText));
      run.phase = 'wait'; render();
      return autoOn() ? recover() : undefined;
    }
    if (gen !== run.gen) return;
    let r;
    try { r = await call({ type: 'daibi:fill', items }); } catch (e) { if (gen !== run.gen) return; run.phase = 'idle'; run.row = -1; return render(); }
    const present = new Set((await scan()).present);
    if (gen !== run.gen) return;
    r.items.forEach((x, k) => {
      const sel = items[k].sel;
      if (present.has(sel) || x.ok || x.err) run.seen.add(sel);
      if (x.ok && TEXTISH.has((m.b[x.col] || {}).kind || 'text')) run.textSels.add(sel);
    });
    const errs = r.items.filter(x => x.err);
    if (errs.length) {
      setSt(i, 'error', errs.map(errText));
      run.phase = 'wait'; render();
      return autoOn() ? recover() : undefined;
    }
    if (!run.seen.size) { setSt(i, 'error', msg('err.NOFIELD')); run.phase = 'idle'; run.row = -1; render(); return autoOn() ? finish() : undefined; }
    if (r.captcha) {
      setSt(i, 'filled', msg('err.CAPTCHA'));
      run.human = true; run.phase = 'wait'; render();
      toast(t('toast.captcha'), 6000);
      return;
    }
    setSt(i, 'filled');
    run.phase = 'wait'; render();
    if (autoOn()) { await sleep(200); if (autoOn() && run.row === i) return submitNow(); }
    else if (!cfg.auto) {
      if (keptN) toast(t('toast.keptFilled', { n: keptN, k: i + 1 }), 8000, { label: t('toast.fromTop'), fn: fromTop });
      else toast(t('toast.filled', { n: i + 1 }), 6000, { label: t('toast.undo'), fn: undoFill });
      keptN = 0;
    }
  }

  async function submitNow() {
    const i = run.row, m = map();
    const btn = m.btn && page.present ? m.btn.sel : null;
    await armAlert();
    let r;
    try { r = await call({ type: 'daibi:submit', sels: [...run.seen], btn }); } catch (e) { r = { ok: true }; } // 点完页面就跳走了，答案没回来：当交了，看跳到哪
    if (!r.ok) {
      if (r.err === 'NO_BUTTON' && btn) r = await call({ type: 'daibi:submit', sels: [...run.seen] }).catch(() => r);
      if (!r.ok) { setSt(i, 'error', errText(r)); render(); return recover(); }
    }
    if (r.alert != null) return alerted(r.alert);
    afterSubmit();
  }
  function alerted(said) { // 网站弹框拦下了：弹框的话就是原因
    clearTimeout(run.timer);
    setSt(run.row, 'error', msg('err.ALERT', { msg: String(said).replace(/\s+/g, ' ').trim().slice(0, 80) || '…' }));
    run.phase = 'wait'; render();
    if (autoOn()) recover();
  }

  function afterSubmit() {
    run.phase = 'submitted'; run.nav = false; run.tries = 0; run.human = false;
    clearTimeout(run.timer); run.timer = setTimeout(checkAfter, 500);
  }

  async function cleared() {
    const sels = [...run.textSels];
    if (!sels.length) return null;
    let r; try { r = await call({ type: 'daibi:values', sels }); } catch (e) { return null; }
    if (r.alert != null) return { alert: r.alert };
    const vals = r.values.filter(v => v !== null);
    if (!vals.length) return true;
    return vals.filter(v => v === '').length >= Math.ceil(vals.length / 2);
  }

  async function checkAfter() { // 不跳页的网站（Ajax 提交）：看表单有没有清空
    if (run.nav || run.phase !== 'submitted') return;
    const c = await cleared();
    if (run.nav || run.phase !== 'submitted') return;
    if (c && c.alert != null) return alerted(c.alert);
    if (c) {
      let sc = null; try { sc = await scan(); } catch (e) {}
      return rowDone(sc);
    }
    if (++run.tries < 10) { run.timer = setTimeout(checkAfter, 400); return; }
    let chk = null; try { chk = await call({ type: 'daibi:check', sels: [...run.seen] }); } catch (e) {}
    const i = run.row;
    if (chk && chk.alert != null) return alerted(chk.alert);
    if (chk && chk.invalid) setSt(i, 'error', errText({ err: 'INVALID', invalid: chk.invalid }));
    else if (cfg.auto) setSt(i, 'error', msg('err.STUCK'));
    else { run.phase = 'wait'; return render(); }
    render();
    if (autoOn()) recover();
  }

  async function onPage() {
    if (run.phase === 'back') { run.phase = 'idle'; run.nav = false; await sleep(120); return startRow(run.row); }
    if (run.row < 0 || run.phase === 'idle' || run.phase === 'needBack') return refreshPage();
    if (run.phase === 'filling') { // 填到一半网页换了（人刷新了、点走了）：这一行在新页上从头填，不能算交了
      const i = run.row;
      if ((run.navFill = (run.navFill || 0) + 1) > 2) { run.gen++; run.navFill = 0; setSt(i, 'error', msg('err.NAVAWAY')); run.row = -1; run.phase = 'idle'; run.going = false; return render(); }
      await sleep(120); return startRow(i);
    }
    await sleep(120);
    let sc; try { sc = await scan(); } catch (e) { return render(); }
    addNewMatches();
    try { sc = await scan(); } catch (e) {}
    const fresh = sc.present.filter(s => !run.seen.has(s));
    if (fresh.length && run.seen.size) return fillStep(sc); // 多页表单的下一页
    if (sc.present.length) {
      const c = await cleared();
      if (c && c.alert != null) return alerted(c.alert);
      if (c === false) { // 页面又回来了，值还在：没交上
        const chk = await call({ type: 'daibi:check', sels: [...run.seen] }).catch(() => null);
        if (chk && chk.invalid) setSt(run.row, 'error', errText({ err: 'INVALID', invalid: chk.invalid }));
        else if (run.phase === 'submitted') setSt(run.row, 'error', msg('err.STUCK'));
        run.phase = 'wait'; render();
        return autoOn() ? recover() : undefined;
      }
    }
    return rowDone(sc);
  }

  function rowDone(sc) {
    clearTimeout(run.timer); run.navFill = 0;
    const i = run.row; if (i < 0) return;
    setSt(i, 'done');
    const next = nextTodo(i + 1);
    run.seen = new Set(); run.textSels = new Set();
    if (next < 0) return finish();
    S.cur = next; run.row = -1; run.phase = 'idle';
    if (!flowOn()) { render(); return; }
    if (sc && sc.present.length) return startRow(next);           // 回到了空表单：直接填下一行
    const m = map();
    // 成功页：人肯定要回表单填下一行，自己回去（0.2.x 手动模式这里要人点「回表单，填第 N 行」）
    if (m && m.start && !run.hold) {
      run.row = next; run.phase = 'back'; run.nav = true; render();
      if (!cfg.auto) toast(t('toast.back', { n: i + 1, m: next + 1 }), 4000, { label: t('toast.stop'), fn: stopHere });
      return chrome.tabs.update(tab.id, { url: m.start });
    }
    run.phase = 'needBack'; render();
  }

  function stopHere() { // 「停」：回到表单页也不再自己填，等人点主按钮
    clearTimeout(run.timer); run.gen++;
    run.row = -1; run.phase = 'idle'; run.going = false; run.hold = true; run.nav = false;
    run.seen = new Set(); run.textSels = new Set();
    hideToast(); render();
  }

  function recover() { // 自动模式下这一行出错：回表单页，接着下一行
    const i = run.row;
    const next = nextTodo(i + 1);
    run.seen = new Set(); run.textSels = new Set();
    if (next < 0 || next === i) return finish();
    S.cur = next;
    const m = map();
    run.row = next; run.phase = 'back'; run.nav = true; render();
    chrome.tabs.update(tab.id, { url: (m && m.start) || run.start || tab.url });
  }

  function finish() {
    clearTimeout(run.timer);
    const wasGoing = run.going;
    run.going = false; run.row = -1; run.phase = 'idle';
    const done = S.st.filter(x => x.s === 'done').length;
    if (S.st.every(x => x.s === 'done')) toast(t('toast.all', { n: done }), 5000);
    else if (wasGoing) toast(t('rows.sum', counts()), 5000);
    render(); saveSheet();
  }

  /* ---------- 表格 ---------- */
  async function loadFile(f, sheet) {
    try {
      const tb = await TB.read(f, { sheet });
      if (!tb.rows.length) throw new Error('EMPTY');
      lastFile = f; setTable(tb);
    } catch (e) {
      toast(e.message === 'OLD_XLS' ? t('table.oldXls') : e.message === 'EMPTY' ? t('table.empty') : t('table.bad'), 4000);
    }
  }
  const LINK_ERR = { BAD_LINK: 'table.linkFail', LINK_FAIL: 'table.linkFail', LINK_PRIVATE: 'table.linkPrivate', EMPTY: 'table.empty' };
  // 必须在点击/粘贴里同步调用：先要权限，再读
  function loadLink(url, keep) {
    const info = TB.linkInfo(url);
    if (!info) { toast(t('table.linkFail')); return false; }
    chrome.permissions.request({ origins: info.origins }).catch(() => false).then(async ok => {
      if (!ok) return toast(t('table.denied'), 4000);
      try {
        const tb = await TB.readUrl(url, info.kind === 'google' ? t('table.google') : '');
        if (!tb.rows.length) throw new Error('EMPTY');
        tb.src = url; lastFile = null;
        if (keep && S.table) {
          // 刷新：内容没变的行保留状态，新行待填
          const old = {};
          S.table.rows.forEach((r, i) => { const k = JSON.stringify(r); (old[k] = old[k] || []).push(S.st[i]); });
          let added = 0;
          const st = tb.rows.map(r => { const a = old[JSON.stringify(r)]; if (a && a.length) return a.shift(); added++; return { s: 'todo' }; });
          S = { table: tb, st, cur: Math.max(0, st.findIndex(x => x.s === 'todo')), site: S.site };
          saveSheet(); render();
          toast(t('table.reloaded', { n: added }));
        } else { $('pasteText').value = ''; setTable(tb); }
      } catch (e) { toast(t(LINK_ERR[e.message] || 'table.linkFail'), 5000); }
    });
    return true;
  }
  const isLink = s => /^\s*https?:\/\/\S+\s*$/.test(s || '');
  async function addAtt(files) {
    const n = await FILES.add(files).catch(() => 0);
    attN = (await FILES.list().catch(() => [])).length;
    if (n) toast(t('att.added', { n }));
    render();
  }
  const TABLE_EXT = /\.(xlsx|xlsm|csv|tsv|txt|xls)$/i;

  // 同一张表又放进来（同名、同表头）：上回交过的行记着，不再填第二遍（0.2.x 一律清零，人得自己找到第 13 行点上，不然重复提交）
  function carryOver(tb) {
    const old = S.table;
    if (!old || old.name !== tb.name || old.headers.join('\u0001') !== tb.headers.join('\u0001') || !S.site || S.site !== tab.origin) return null; // 交过 = 交到这个网站；换了网站不算
    const pool = {};
    old.rows.forEach((r, i) => { if (S.st[i] && S.st[i].s === 'done') { const k = JSON.stringify(r); (pool[k] = pool[k] || []).push(S.st[i]); } });
    let n = 0;
    const st = tb.rows.map(r => { const a = pool[JSON.stringify(r)]; if (a && a.length) { n++; return a.shift(); } return { s: 'todo' }; });
    return n ? { st, n } : null;
  }
  async function fromTop() {
    hideToast(); keptN = 0; await settled();
    S.st = S.st.map(() => ({ s: 'todo' })); S.cur = 0; saveSheet();
    if (run.row >= 0 && !cfg.auto) { run.row = -1; run.phase = 'idle'; return startRow(0); }
    render(); autoFill();
  }
  async function settled() { const t0 = Date.now(); while ((run.fillBusy || run.active > 0) && Date.now() - t0 < 20000) await sleep(50); }
  async function setTable(tb, fresh) {
    const keep = fresh ? null : carryOver(tb);
    S = { table: tb, st: keep ? keep.st : tb.rows.map(() => ({ s: 'todo' })), cur: 0, site: keep ? S.site : '' }; warnCols = null;
    if (keep) S.cur = Math.max(0, S.st.findIndex(x => x.s !== 'done'));
    clearTimeout(run.timer); Object.assign(run, { row: -1, phase: 'idle', going: false, seen: new Set(), textSels: new Set(), hold: false });
    filter = 'all'; saveSheet();
    $('pasteBox').hidden = true;
    note('');
    run.hold = true; // 先别自己填：对完字段再说
    await refreshPage();
    run.hold = false;
    const m = tab.origin && maps[tab.origin];
    if (bound()) note('fields.restored');
    else if (page.fields && page.fields.length && (!m || !Object.keys(m.b).length)) matchNow(true);
    render();
    keptN = keep ? keep.n : 0;
    if (keep) toast(t('toast.kept', { n: keep.n, k: S.cur + 1 }), 8000, { label: t('toast.fromTop'), fn: fromTop });
    autoFill();
  }

  /* ---------- 界面 ---------- */
  const counts = () => {
    const done = S.st.filter(x => x.s === 'done').length, err = S.st.filter(x => x.s === 'error').length;
    return { done, err, left: S.st.length - done - err };
  };
  function mainMode() {
    if (!S.table) return ['needTable', false];
    if (!tab.id) return ['noPage', true];
    if (!bound()) return ['match', false];
    if (S.st.every(x => x.s === 'done')) return ['alldone', false];
    if (cfg.auto && run.going) return ['pause', false];
    if (run.phase === 'filling' || run.phase === 'back' || run.phase === 'submitted') return ['busy', true]; // 正在填 / 回表单 / 看交上没：别让人再点一下抢着填
    if (run.phase === 'needBack') return ['back', false];
    if (!S.st.some(x => x.s === 'todo' || x.s === 'filled')) return S.st.some(x => x.s === 'error') ? ['retry', false] : ['nothing', true]; // 只剩出错的：主按钮就是重试
    if (cfg.auto) return ['go', false];
    if (run.phase === 'wait' && run.row === S.cur) return ['refill', false];
    return ['fill', false];
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function render() {
    const has = !!S.table;
    $('drop').hidden = has || !$('pasteBox').hidden;
    $('tableInfo').hidden = !has;
    $('fieldSec').hidden = !has;
    $('rowSec').hidden = !has;
    if (has) {
      const tb = S.table;
      $('tName').textContent = tb.name;
      $('tMeta').textContent = t('table.meta', { rows: tb.rows.length, cols: tb.headers.length });
      const ss = $('sheetSeg');
      ss.hidden = !(tb.sheets && tb.sheets.length > 1 && lastFile);
      if (!ss.hidden) ss.innerHTML = tb.sheets.map(n => `<button role="tab" aria-selected="${n === tb.sheet}" data-s="${esc(n)}">${esc(n)}</button>`).join('');
      $('btnReload').hidden = !tb.src;
      const m = tab.origin && maps[tab.origin];
      const needAtt = attN > 0 || (m && Object.values(m.b).some(b => b && b.kind === 'file')) || (page.fields || []).some(f => f.kind === 'file');
      $('attRow').hidden = !needAtt;
      $('attTxt').textContent = attN ? t('att.n', { n: attN }) : t('att.none');
      $('btnAttClr').hidden = !attN;
      renderFields(); renderRows();
    }
    const [mode, dis] = mainMode();
    const remain = S.st.filter(x => x.s === 'todo' || x.s === 'filled').length;
    const label = {
      needTable: t('run.choose'), noPage: t('fields.noPage'), match: t('run.match'), alldone: t('run.next'), retry: t('run.retry', { n: S.st.filter(x => x.s === 'error').length }), busy: t('run.busy'),
      pause: t('run.pause'), back: t('run.back', { n: S.cur + 1 }), go: t('run.go', { n: remain }), fill: t('run.fill', { n: S.cur + 1 }), refill: t('run.refill', { n: S.cur + 1 }), nothing: t('run.nothing')
    }[mode];
    const b = $('btnMain');
    b.textContent = label; b.disabled = dis || (run.busy && mode !== 'pause'); b.dataset.mode = mode;
    $('setBox').hidden = !has;
    b.classList.toggle('gray', mode === 'pause' || mode === 'refill'); b.classList.toggle('pri', mode !== 'pause' && mode !== 'refill');
    $('status').textContent = statusText(mode);
    document.body.dataset.state = mode;
    const ne = S.st.filter(x => x.s === 'error').length;
    $('btnRetry').hidden = !ne || (cfg.auto && run.going) || mode === 'retry';
    $('warn').hidden = !warnCols;
    if (warnCols) $('warnTxt').textContent = t('warn.fields', { n: warnCols.length, f: warnCols.slice(0, 3).map(x => t('fmt.q', { x: x.label })).join(t('fmt.join')) + (warnCols.length > 3 ? t('warn.more', { n: warnCols.length, rest: warnCols.length - 3 }) : '') });
    $('btnRetry').textContent = t('run.retry', { n: ne });
  }

  // 顶栏一句：现在在干嘛
  function statusText(mode) {
    if (!S.table) return t('st.noTable');
    const c = counts();
    if (mode === 'alldone') return t('st.allDone', { n: c.done });
    if (mode === 'retry') return t('st.errLeft', { n: c.err });
    if (run.going) return t('st.going', { n: (run.row >= 0 ? run.row : S.cur) + 1, total: S.st.length });
    if (run.row >= 0 && S.st[run.row] && S.st[run.row].s === 'filled' && run.phase === 'wait') return t('st.yourTurn', { n: run.row + 1 });
    if (run.phase === 'filling' || run.phase === 'back') return t('st.filling', { n: (run.row >= 0 ? run.row : S.cur) + 1 });
    return tab.host || t('fields.noPage');
  }

  function renderFields() {
    const m = tab.origin && maps[tab.origin];
    $('host').textContent = tab.host || t('fields.here');
    const n = bound();
    $('fieldEmpty').hidden = n > 0;
    $('fieldList').hidden = n === 0;
    $('btnRematch').hidden = n === 0;
    $('fieldNote').hidden = !page.note;
    $('fieldNote').textContent = page.note ? t(page.note) : '';
    $('fieldNote').classList.toggle('bad', page.noteBad);
    if (!n) return;
    const tb = S.table, row = tb.rows[S.cur] || [];
    const here = page.fields ? new Set(page.fields.map(f => f.sel)) : null;
    const pres = new Set(page.present);
    const x = '<svg viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    const okCls = h => { const bd = m.b[h]; if (!bd) return false; return bd.conf === 'sure' || bd.conf === 'manual'; };
    const nOk = tb.headers.filter(okCls).length;
    // 这页的格子都有主了，没对上的列在这页用不上，一起收起来
    const usedSels = new Set(Object.values(m.b).filter(Boolean).map(x => x.sel));
    const idle = !!page.fields && page.fields.every(f => usedSels.has(f.sel));
    const nIdle = idle ? tb.headers.filter(h => !m.b[h]).length : 0;
    const foldable = nOk >= 4 || nIdle >= 3;
    const fold = !showAll && foldable && !picking;
    const hide = h => fold && (okCls(h) || (idle && !m.b[h]));
    let html = '';
    const sumTxt = t('fields.okN', { n: nOk }) + (nIdle ? ' · ' + t('fields.idleN', { n: nIdle }) : '');
    if (foldable) html += `<div class="frow fsum"><i class="dot"></i><div class="fmain"><span class="fcol">${esc(sumTxt)}</span></div>
      <div class="fact"><button class="qs-link" data-act="fold">${esc(t(fold ? 'fields.expand' : 'fields.fold'))}</button></div></div>`;
    html += tb.headers.map((h, ci) => {
      if (hide(h)) return '';
      const bd = m.b[h];
      let cls = 'none', to = `<em>${esc(t('fields.unbound'))}</em>`;
      if (bd) {
        const away = here && !here.has(bd.sel) && !pres.has(bd.sel);
        cls = away ? 'away' : bd.conf;
        to = `<b>${esc(bd.label || bd.sel)}</b>${away ? ' · ' + esc(t('fields.otherPage')) : bd.conf === 'maybe' ? ' · ' + esc(t('fields.maybe')) : ''}`;
      }
      const v = row[ci] ? ` <em>· ${esc(String(row[ci]).slice(0, 24))}</em>` : '';
      const pk = picking === h;
      return `<div class="frow ${cls}" data-h="${esc(h)}"><i class="dot"></i>
        <div class="fmain"><span class="fcol">${esc(h)}</span><button class="fto${bd ? ' on' : ''}" data-act="flash" tabindex="${bd ? 0 : -1}">→ ${to}${v}</button></div>
        <div class="fact"><button class="fbtn${pk ? ' picking' : ''}" data-act="pick">${esc(t(pk ? 'fields.picking' : 'fields.pick'))}</button>${bd ? `<button class="fx" data-act="unbind" aria-label="${esc(t('fields.unbind'))}">${x}</button>` : ''}</div></div>`;
    }).join('');
    const pk = picking === '\u0000btn';
    if (!fold) html += `<div class="frow btnrow ${m.btn ? 'manual' : 'none'}" data-h="\u0000btn"><i class="dot"></i>
      <div class="fmain"><span class="fcol">${esc(t('fields.submitBtn'))}</span><span class="fto">→ ${m.btn ? `<b>${esc(m.btn.label || m.btn.sel)}</b>` : `<em>${esc(t('fields.submitAuto'))}</em>`}</span></div>
      <div class="fact"><button class="fbtn${pk ? ' picking' : ''}" data-act="pick">${esc(t(pk ? 'fields.picking' : 'fields.pick'))}</button>${m.btn ? `<button class="fx" data-act="unbind" aria-label="${esc(t('fields.unbind'))}">${x}</button>` : ''}</div></div>`;
    $('fieldList').innerHTML = html;
  }

  function renderRows() {
    const c = counts(), n = S.st.length;
    $('sum').textContent = t('rows.sum', c);
    $('barDone').style.width = (c.done / n * 100) + '%';
    $('barErr').style.width = (c.err / n * 100) + '%';
    $('errN').textContent = c.err || '';
    if (filter === 'error' && !c.err) filter = 'all';
    document.querySelectorAll('#seg button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.f === filter)));
    const tb = S.table;
    const idx = []; for (let i = 0; i < n; i++) if (filter === 'all' || S.st[i].s === 'error') idx.push(i);
    const LIM = 500;
    let html = idx.slice(0, LIM).map(i => {
      const st = S.st[i], r = tb.rows[i];
      const prev = r.filter(Boolean).slice(0, 2).join(' · ');
      return `<li class="ri${i === S.cur ? ' cur' : ''}" data-i="${i}"><span class="rn">${i + 1}</span>
        <span class="rt"><b>${esc(prev)}</b>${st.m ? `<small${st.s === 'filled' ? ' class="wait"' : ''}>${esc(mText(st.m))}</small>` : ''}</span>
        <span class="pill ${st.s}">${esc(t('st.' + st.s))}</span></li>`;
    }).join('');
    if (idx.length > LIM) html += `<li class="rmore">${esc(t('rows.more', { n: idx.length - LIM }))}</li>`;
    const list = $('rowList');
    const keep = list.scrollTop;
    list.innerHTML = html;
    list.scrollTop = keep;
    const cur = list.querySelector('.cur');
    if (cur && (cur.offsetTop < list.scrollTop || cur.offsetTop + cur.offsetHeight > list.scrollTop + list.clientHeight)) list.scrollTop = cur.offsetTop - list.clientHeight / 2;
  }

  // 提示条：一句话，自动做掉的事旁边带一个「撤 / 停」
  let toastT = 0, toastFn = null;
  function toast(s, ms, act) {
    const el = $('toast');
    $('toastTxt').textContent = s;
    toastFn = act ? act.fn : null;
    $('toastAct').hidden = !act; if (act) $('toastAct').textContent = act.label;
    el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(hideToast, ms || 3200);
  }
  function hideToast() { clearTimeout(toastT); $('toast').classList.remove('on'); toastFn = null; }
  $('toastAct').onclick = () => { const f = toastFn; hideToast(); if (f) f(); };

  /* ---------- 事件 ---------- */
  $('btnChange').onclick = () => $('file').click();
  $('file').onchange = e => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; };
  $('sheetSeg').onclick = e => { const b = e.target.closest('button'); if (b && lastFile && b.getAttribute('aria-selected') !== 'true') loadFile(lastFile, b.dataset.s); };
  $('btnPaste').onclick = () => { $('pasteBox').hidden = false; render(); $('pasteText').focus(); };
  $('pasteCancel').onclick = () => { $('pasteBox').hidden = true; render(); };
  $('pasteOk').onclick = () => {
    if (isLink($('pasteText').value)) return loadLink($('pasteText').value.trim());
    const tb = TB.parseText($('pasteText').value, t('common.pasted'));
    if (!tb.rows.length) return toast(t('table.empty'));
    lastFile = null; $('pasteText').value = ''; setTable(tb);
  };
  document.addEventListener('paste', e => {
    if (S.table || e.target.closest('textarea,input')) return;
    const txt = e.clipboardData.getData('text/plain');
    if (isLink(txt)) return loadLink(txt.trim());
    if (txt && /\t|\n/.test(txt)) { const tb = TB.parseText(txt, t('common.pasted')); if (tb.rows.length) { lastFile = null; setTable(tb); } }
  });
  // 整个侧栏都能丢，拖进来整页高亮
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); document.body.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || !e.relatedTarget) document.body.classList.remove('over'); }));
  document.addEventListener('drop', e => {
    const fs = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (!fs.length) return;
    const tbl = !S.table || (fs.length === 1 && TABLE_EXT.test(fs[0].name)) ? fs.find(f => TABLE_EXT.test(f.name)) : null;
    if (tbl) loadFile(tbl);
    const rest = fs.filter(f => f !== tbl);
    if (rest.length) addAtt(rest);
  });
  // 用示例试试：一张 5 行的示例表 + 千手院自己的示例表单，开新标签页，对字段、填第 1 行都自己来
  $('btnDemo').onclick = async () => {
    try { demoTable = TB.parseText(await (await fetch(SAMPLE[I18N.lang])).text(), t('demo.name')); } catch (e) { return toast(t('table.bad')); }
    const url = DEMO_URL + '?lang=' + I18N.lang;
    if (FIXED_TAB) return chrome.tabs.update(tab.id, { url });
    const nt = await chrome.tabs.create({ url, active: true });
    tab.id = nt.id; setUrl(url); page = { fields: null, present: [], note: '', noteBad: false, frames: [] };
  };
  $('btnReload').onclick = () => S.table && S.table.src && loadLink(S.table.src, true);
  $('btnAtt').onclick = () => $('attFile').click();
  $('attFile').onchange = e => { if (e.target.files.length) addAtt(e.target.files); e.target.value = ''; };
  $('btnAttClr').onclick = async () => { await FILES.clear().catch(() => {}); attN = 0; render(); };

  $('btnMatch').onclick = startMatch;
  $('btnRematch').onclick = startMatch;
  $('fieldList').onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const h = b.closest('.frow').dataset.h, m = map(); if (!m) return;
    const act = b.dataset.act;
    if (act === 'fold') { showAll = !showAll; return render(); }
    if (act === 'pick') pickFor(h);
    if (act === 'unbind') { if (h === '\u0000btn') m.btn = null; else { delete m.b[h]; m.off = [...new Set([...(m.off || []), h])]; } saveMaps(); render(); }
    if (act === 'flash' && m.b[h]) call({ type: 'daibi:flash', sel: m.b[h].sel }).catch(() => {});
  };
  $('seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; renderRows(); };
  $('rowList').onclick = e => {
    const li = e.target.closest('.ri'); if (!li || run.going) return;
    S.cur = +li.dataset.i; clearTimeout(run.timer);
    if (run.row >= 0 && run.row !== S.cur) { run.row = -1; run.phase = 'idle'; }
    saveSheet(); render();
  };
  $('btnExport').onclick = () => {
    const tb = S.table;
    const csv = TB.toCSV([...tb.headers, t('rows.statusCol')], tb.rows.map((r, i) => [...r, t('st.' + S.st[i].s) + (S.st[i].m ? t('fmt.colon') + mText(S.st[i].m) : '')]));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = t('rows.file', { name: tb.name.replace(/\.[^.]+$/, '') });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(t('toast.exported'));
  };
  // 开跑前看一眼：网页上还有没主的框，表里又有带数据、没对上的列——多半是漏了，先问一句。说的是网页上那个框（列多半是这页本来就没有的）。
  // 「照填」后这些框在这个网站不再问。
  function unmatchedFields() {
    const m = map(); if (!m || !page.fields || !S.table) return [];
    const used = new Set(Object.values(m.b).filter(Boolean).map(x => x.sel)), skip = new Set(m.skipF || []);
    const free = page.fields.filter(f => !used.has(f.sel) && !skip.has(f.sel) && f.kind !== 'file');
    const cols = S.table.headers.map((h, ci) => [h, ci]).filter(([h, ci]) => !m.b[h] && S.table.rows.some((r, i) => /todo|filled/.test(S.st[i].s) && String(r[ci] ?? '').trim()));
    if (!free.length || !cols.length) return [];
    return free.map(f => {
      let best = null, bs = 0.3;
      cols.forEach(([h, ci]) => { const sc = M.score(h, S.table.rows.slice(0, 8).map(r => String(r[ci] ?? '').trim()), f); if (sc > bs) { bs = sc; best = h; } });
      return { sel: f.sel, label: f.label || f.placeholder || f.name || '?', col: best };
    });
  }
  $('warnGo').onclick = () => {
    const m = map(); if (m) { m.skipF = [...new Set([...(m.skipF || []), ...(warnCols || []).map(x => x.sel)])]; saveMaps(); }
    warnCols = null; askAccess(); go(mainMode()[0]);
  };
  $('warnPick').onclick = () => { const w = warnCols && warnCols.find(x => x.col); warnCols = null; showAll = true; if (w) pickFor(w.col); else render(); };
  async function go(mode) {
    run.hold = false;
    await settled(); // 手动模式自己填的那一行可能还在填：等它填完再开跑，不两头抢一张表
    if (mode === 'go') { run.going = true; render(); return startRow(nextTodo(S.cur)); }
    if (mode === 'fill' || mode === 'refill') { render(); return startRow(S.cur); }
  }
  $('btnMain').onclick = () => {
    const [mode] = mainMode();
    if (mode === 'needTable' || mode === 'alldone') return $('file').click();
    if (mode === 'retry') return $('btnRetry').onclick();
    if (mode === 'match') return startMatch();
    if (mode === 'pause') { run.going = false; clearTimeout(run.timer); toast(t('toast.paused', { n: S.cur + 1 })); return render(); }
    askAccess(); // 顺手拿持久授权（已有就不弹）
    if ((mode === 'go' || mode === 'fill') && !warnCols) { const miss = unmatchedFields(); if (miss.length) { warnCols = miss; return render(); } }
    warnCols = null;
    if (mode === 'back') { run.hold = false; const m = map(); run.row = S.cur; run.phase = 'back'; run.nav = true; render(); return chrome.tabs.update(tab.id, { url: m.start }); }
    return go(mode);
  };
  $('btnRetry').onclick = () => {
    run.hold = false;
    S.st.forEach((x, i) => { if (x.s === 'error') S.st[i] = { s: 'todo' }; });
    const first = nextTodo(0); filter = 'all'; saveSheet();
    if (cfg.auto) run.going = true;
    startRow(first);
  };

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== 'daibi:submitted' || !sender.tab || sender.tab.id !== tab.id) return;
    if (run.row >= 0 && (run.phase === 'wait' || run.phase === 'filling')) afterSubmit();
  });
  chrome.tabs.onUpdated.addListener((id, info, tb) => {
    if (id !== tab.id) return;
    if (info.url || tb.url) setUrl(info.url || tb.url);
    if (info.status === 'loading') run.nav = true;
    if (info.status === 'complete') { picking = null; onPage(); }
  });
  chrome.tabs.onActivated.addListener(async ({ windowId }) => {
    if (FIXED_TAB || run.going || run.row >= 0 || windowId !== tab.win) return;
    picking = null; await resolveTab(); refreshPage();
  });
  chrome.tabs.onRemoved.addListener(id => { if (id === tab.id && !FIXED_TAB) { run.going = false; run.row = -1; resolveTab().then(render); } });

  // 底部那块多高，页面就留多少底，不压最后一行；提示条挪到顶上（压的是招牌，不压数据）
  new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', $('dock').offsetHeight + 'px')).observe($('dock'));

  /* ---------- 启动 ---------- */
  function drawSettings() {
    store.renderSettings($('setBox'), SETTINGS.schema, cfg, async (k, v) => {
      cfg[k] = v; await SETTINGS.save(cfg);
      if (k === 'auto' && !v) run.going = false;
      render();
    }, t);
  }
  (async () => {
    I18N.setLang(await store.get(LANG_KEY, 'en'));
    applyLang();
    cfg = await SETTINGS.load();
    drawSettings();
    maps = await store.get('daibi:maps', {});
    attN = (await FILES.list().catch(() => [])).length;
    const saved = await store.get('daibi:sheet', null);
    if (saved && saved.table) S = saved;
    S.st = S.st.map(x => x.s === 'filled' ? { s: 'todo' } : x);
    await resolveTab();
    render();
    await refreshPage();
  })();

  window.__daibi = { S: () => S, run, maps: () => maps, tab, page: () => page, call, mText, lang: () => I18N.lang }; // 调试/测试用
})();
