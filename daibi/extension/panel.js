/* 代笔僧侧栏：读表、对字段、按行填、跟踪提交、标状态。表格和对应只存在本机 chrome.storage.local。 */
(() => {
  'use strict';
  const { t, apply } = QSLib.i18n;
  const store = QSLib.store, TB = QSLib.table, M = DaibiMatch;
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  apply();
  $('homeLink').href = t('common.homeUrl');

  const SETTINGS = store.settings('daibi', [
    { key: 'auto', type: 'bool', def: false, label: 'set.auto', hint: 'set.autoHint' }
  ]);
  let cfg = { auto: false };

  let S = { table: null, st: [], cur: 0 };       // 表格 + 每行状态
  let maps = {};                                 // 每个网站一份：origin → {b:{表头:{sel,label,kind,conf}}, btn, start}
  const tab = { id: null, url: '', origin: '', host: '', pat: '', win: null };
  let page = { fields: null, present: [], note: '', noteBad: false };
  const run = { row: -1, seen: new Set(), textSels: new Set(), start: '', phase: 'idle', going: false, nav: false, human: false, timer: 0, tries: 0, busy: false };
  let filter = 'all', picking = null, lastFile = null, showAll = false;
  const FIXED_TAB = new URLSearchParams(location.search).get('tab'); // 测试用：指定要填的标签页

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
    if (changed) { page = { fields: null, present: [], note: '', noteBad: false }; }
  }

  async function inject() {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/page.js', 'content.js'] });
  }
  async function call(msg) {
    if (tab.id == null) throw new Error('NO_TAB');
    try { const r = await chrome.tabs.sendMessage(tab.id, msg); if (r !== undefined) return r; } catch (e) {}
    try { await inject(); } catch (e) { throw new Error('NO_ACCESS'); }
    return chrome.tabs.sendMessage(tab.id, msg);
  }
  async function learnUrl() { // 没拿到网址时（只有 activeTab），从页面里问
    if (tab.url) return;
    try { const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => location.href }); setUrl(r && r.result); } catch (e) {}
  }
  // 必须在点击里同步调用，浏览器才会弹授权
  function askAccess() {
    if (!tab.pat) return Promise.resolve(false);
    return chrome.permissions.request({ origins: [tab.pat] }).catch(() => false);
  }

  const boundSels = () => { const m = map(); return m && S.table ? S.table.headers.map(h => m.b[h] && m.b[h].sel).filter(Boolean) : []; };
  async function scan() {
    const r = await call({ type: 'daibi:scan', sels: boundSels() });
    page.fields = r.fields; page.present = r.present;
    if (r.url) setUrl(r.url);
    return r;
  }

  async function refreshPage() {
    if (!S.table || tab.id == null) return render();
    try { await scan(); if (page.note === t('fields.noPage') || page.note === t('fields.needClick')) note(''); }
    catch (e) { page.fields = null; page.present = []; }
    render();
  }

  /* ---------- 对字段 ---------- */
  function note(s, bad) { page.note = s; page.noteBad = !!bad; }
  function startMatch() {
    const p = askAccess();
    p.then(async ok => {
      await learnUrl();
      try { await scan(); } catch (e) { note(t(tab.url ? (ok ? 'fields.cantRun' : 'fields.denied') : 'fields.needClick'), true); return render(); }
      matchNow(false);
    });
  }
  function matchNow(quiet) {
    const m = map(); if (!m || !page.fields) return;
    if (!page.fields.length) { note(t('fields.noFields'), true); return render(); }
    m.b = M.autoMatch(S.table.headers, S.table.rows, page.fields, m.b);
    m.start = tab.url;
    saveMaps(); note('');
    if (!quiet) toast(t('toast.matched', { n: bound() }));
    render();
  }
  function addNewMatches() { // 多页表单：翻到新的一页，把有把握的新格子补上
    const m = map(); if (!m || !page.fields || !S.table) return;
    const nb = M.autoMatch(S.table.headers, S.table.rows, page.fields, m.b, true);
    let n = 0;
    Object.entries(nb).forEach(([h, b]) => { if (!m.b[h] && b.conf === 'sure') { m.b[h] = b; n++; } });
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
        r = await call(h === '\u0000btn'
          ? { type: 'daibi:pick', button: true, hint: t('fields.pickBtnHint') }
          : { type: 'daibi:pick', hint: t('fields.pickHint', { col: h }) });
      } catch (e) { note(t('fields.needClick'), true); }
      if (picking !== h) return;
      picking = null;
      const m = map();
      if (r && m) {
        if (h === '\u0000btn') m.btn = { sel: r.sel, label: r.label };
        else {
          Object.keys(m.b).forEach(k => { if (m.b[k] && m.b[k].sel === r.sel) delete m.b[k]; });
          m.b[h] = { sel: r.sel, label: r.label || r.placeholder || r.name || r.sel, kind: r.kind, conf: 'manual' };
          if (!m.start) m.start = tab.url;
        }
        saveMaps();
        try { await scan(); } catch (e) {}
      }
      render();
    });
  }

  /* ---------- 填 ---------- */
  const autoOn = () => cfg.auto && run.going;
  const flowOn = () => cfg.auto ? run.going : true;
  const TEXTISH = new Set(['text', 'textarea', 'editable', 'date', 'datetime-local', 'time', 'month', 'week']);
  function setSt(i, s, m) { S.st[i] = m ? { s, m } : { s }; saveSheet(); }
  function nextTodo(from) {
    const n = S.st.length;
    for (let k = 0; k < n; k++) { const i = (from + k) % n; if (S.st[i].s === 'todo' || S.st[i].s === 'filled') return i; }
    return -1;
  }
  const errText = x => t('err.' + x.err, { col: x.col, v: x.v, max: x.max, label: x.invalid && x.invalid.label, msg: x.invalid && x.invalid.msg });

  async function startRow(i) {
    if (i < 0) return finish();
    clearTimeout(run.timer);
    run.row = i; S.cur = i; run.seen = new Set(); run.textSels = new Set(); run.human = false; run.phase = 'filling';
    render();
    let sc;
    try { sc = await scan(); } catch (e) { run.phase = 'idle'; run.row = -1; note(t('fields.needClick'), true); return render(); }
    const m = map();
    if (!sc.present.length && m && m.start && m.start !== tab.url) { // 不在表单页：先回去
      run.phase = 'back'; run.nav = true;
      return chrome.tabs.update(tab.id, { url: m.start });
    }
    run.start = tab.url;
    return fillStep(sc);
  }

  async function fillStep(sc) {
    const i = run.row; if (i < 0) return;
    const m = map(), H = S.table.headers, row = S.table.rows[i];
    if (!sc) sc = await scan();
    addNewMatches();
    const items = [];
    H.forEach((h, ci) => { const b = m.b[h]; if (b && !run.seen.has(b.sel)) items.push({ col: h, sel: b.sel, v: row[ci] }); });
    let r;
    try { r = await call({ type: 'daibi:fill', items }); } catch (e) { run.phase = 'idle'; run.row = -1; return render(); }
    const present = new Set((await scan()).present);
    r.items.forEach((x, k) => {
      const sel = items[k].sel;
      if (present.has(sel) || x.ok || x.err) run.seen.add(sel);
      if (x.ok && TEXTISH.has((m.b[x.col] || {}).kind || 'text')) run.textSels.add(sel);
    });
    const errs = r.items.filter(x => x.err);
    if (errs.length) {
      setSt(i, 'error', errs.map(errText).join('；'));
      run.phase = 'wait'; render();
      return autoOn() ? recover() : undefined;
    }
    if (!run.seen.size) { setSt(i, 'error', t('err.NOFIELD')); run.phase = 'idle'; run.row = -1; render(); return autoOn() ? finish() : undefined; }
    if (r.captcha) {
      setSt(i, 'filled', t('err.CAPTCHA'));
      run.human = true; run.phase = 'wait'; render();
      toast(t('toast.captcha'), 6000);
      return;
    }
    setSt(i, 'filled');
    run.phase = 'wait'; render();
    if (autoOn()) { await sleep(200); if (autoOn() && run.row === i) return submitNow(); }
    else if (!cfg.auto) toast(t('toast.filled', { n: i + 1 }));
  }

  async function submitNow() {
    const i = run.row, m = map();
    const btn = m.btn && page.present ? m.btn.sel : null;
    let r;
    try { r = await call({ type: 'daibi:submit', sels: [...run.seen], btn }); } catch (e) { r = { ok: false, err: 'STUCK' }; }
    if (!r.ok) {
      if (r.err === 'NO_BUTTON' && btn) r = await call({ type: 'daibi:submit', sels: [...run.seen] }).catch(() => r);
      if (!r.ok) { setSt(i, 'error', errText(r)); render(); return recover(); }
    }
    afterSubmit();
  }

  function afterSubmit() {
    run.phase = 'submitted'; run.nav = false; run.tries = 0; run.human = false;
    clearTimeout(run.timer); run.timer = setTimeout(checkAfter, 500);
  }

  async function cleared() {
    const sels = [...run.textSels];
    if (!sels.length) return null;
    let r; try { r = await call({ type: 'daibi:values', sels }); } catch (e) { return null; }
    const vals = r.values.filter(v => v !== null);
    if (!vals.length) return true;
    return vals.filter(v => v === '').length >= Math.ceil(vals.length / 2);
  }

  async function checkAfter() { // 不跳页的网站（Ajax 提交）：看表单有没有清空
    if (run.nav || run.phase !== 'submitted') return;
    const c = await cleared();
    if (run.nav || run.phase !== 'submitted') return;
    if (c) {
      let sc = null; try { sc = await scan(); } catch (e) {}
      return rowDone(sc);
    }
    if (++run.tries < 10) { run.timer = setTimeout(checkAfter, 400); return; }
    let chk = null; try { chk = await call({ type: 'daibi:check', sels: [...run.seen] }); } catch (e) {}
    const i = run.row;
    if (chk && chk.invalid) setSt(i, 'error', errText({ err: 'INVALID', invalid: chk.invalid }));
    else if (cfg.auto) setSt(i, 'error', t('err.STUCK'));
    else { run.phase = 'wait'; return render(); }
    render();
    if (autoOn()) recover();
  }

  async function onPage() {
    if (run.phase === 'back') { run.phase = 'idle'; run.nav = false; await sleep(120); return startRow(run.row); }
    if (run.row < 0 || run.phase === 'idle' || run.phase === 'needBack') return refreshPage();
    await sleep(120);
    let sc; try { sc = await scan(); } catch (e) { return render(); }
    addNewMatches();
    try { sc = await scan(); } catch (e) {}
    const fresh = sc.present.filter(s => !run.seen.has(s));
    if (fresh.length && run.seen.size) return fillStep(sc); // 多页表单的下一页
    if (sc.present.length) {
      const c = await cleared();
      if (c === false) { // 页面又回来了，值还在：没交上
        const chk = await call({ type: 'daibi:check', sels: [...run.seen] }).catch(() => null);
        if (chk && chk.invalid) setSt(run.row, 'error', errText({ err: 'INVALID', invalid: chk.invalid }));
        else if (run.phase === 'submitted') setSt(run.row, 'error', t('err.STUCK'));
        run.phase = 'wait'; render();
        return autoOn() ? recover() : undefined;
      }
    }
    return rowDone(sc);
  }

  function rowDone(sc) {
    clearTimeout(run.timer);
    const i = run.row; if (i < 0) return;
    setSt(i, 'done');
    const next = nextTodo(i + 1);
    run.seen = new Set(); run.textSels = new Set();
    if (next < 0) return finish();
    S.cur = next; run.row = -1; run.phase = 'idle';
    if (!flowOn()) { render(); return; }
    if (sc && sc.present.length) return startRow(next);           // 回到了空表单：直接填下一行
    const m = map();
    if (autoOn() && m && m.start) { run.row = next; run.phase = 'back'; run.nav = true; render(); return chrome.tabs.update(tab.id, { url: m.start }); }
    run.phase = 'needBack'; render();                             // 成功页：等用户点「回表单」
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
  async function setTable(tb) {
    S = { table: tb, st: tb.rows.map(() => ({ s: 'todo' })), cur: 0 };
    clearTimeout(run.timer); Object.assign(run, { row: -1, phase: 'idle', going: false, seen: new Set(), textSels: new Set() });
    filter = 'all'; saveSheet();
    $('pasteBox').hidden = true;
    note('');
    await refreshPage();
    const m = tab.origin && maps[tab.origin];
    if (bound()) note(t('fields.restored'));
    else if (page.fields && page.fields.length && (!m || !Object.keys(m.b).length)) matchNow(true);
    render();
  }

  /* ---------- 界面 ---------- */
  const counts = () => {
    const done = S.st.filter(x => x.s === 'done').length, err = S.st.filter(x => x.s === 'error').length;
    return { done, err, left: S.st.length - done - err };
  };
  function mainMode() {
    if (!S.table) return ['needTable', true];
    if (!tab.id) return ['noPage', true];
    if (!bound()) return ['match', false];
    if (S.st.every(x => x.s === 'done')) return ['alldone', true];
    if (cfg.auto && run.going) return ['pause', false];
    if (run.phase === 'needBack') return ['back', false];
    if (!S.st.some(x => x.s === 'todo' || x.s === 'filled')) return ['nothing', true];
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
      const ss = $('sheetSel');
      ss.hidden = !(tb.sheets && tb.sheets.length > 1 && lastFile);
      if (!ss.hidden && ss.options.length !== tb.sheets.length) ss.innerHTML = tb.sheets.map(n => `<option>${esc(n)}</option>`).join('');
      if (!ss.hidden) ss.value = tb.sheet;
      renderFields(); renderRows();
    }
    const [mode, dis] = mainMode();
    const remain = S.st.filter(x => x.s === 'todo' || x.s === 'filled').length;
    const label = {
      needTable: t('run.needTable'), noPage: t('fields.noPage'), match: t('run.match'), alldone: t('run.alldone'),
      pause: t('run.pause'), back: t('run.back', { n: S.cur + 1 }), go: t('run.go', { n: remain }), fill: t('run.fill', { n: S.cur + 1 }), refill: t('run.refill', { n: S.cur + 1 }), nothing: t('run.nothing')
    }[mode];
    const b = $('btnMain');
    b.textContent = label; b.disabled = dis || (run.busy && mode !== 'pause'); b.dataset.mode = mode;
    b.classList.toggle('gray', mode === 'pause'); b.classList.toggle('pri', mode !== 'pause');
    const ne = S.st.filter(x => x.s === 'error').length;
    $('btnRetry').hidden = !ne || (cfg.auto && run.going);
    $('btnRetry').textContent = t('run.retry', { n: ne });
  }

  function renderFields() {
    const m = tab.origin && maps[tab.origin];
    $('host').textContent = tab.host || t('fields.here');
    const n = bound();
    $('fieldEmpty').hidden = n > 0;
    $('fieldList').hidden = n === 0;
    $('btnRematch').hidden = n === 0;
    $('fieldNote').hidden = !page.note;
    $('fieldNote').textContent = page.note;
    $('fieldNote').classList.toggle('bad', page.noteBad);
    if (!n) return;
    const tb = S.table, row = tb.rows[S.cur] || [];
    const here = page.fields ? new Set(page.fields.map(f => f.sel)) : null;
    const pres = new Set(page.present);
    const x = '<svg viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    const okCls = h => { const bd = m.b[h]; if (!bd) return false; return bd.conf === 'sure' || bd.conf === 'manual'; };
    const nOk = tb.headers.filter(okCls).length;
    const fold = !showAll && nOk >= 4 && !picking;
    let html = '';
    if (nOk >= 4) html += `<div class="frow fsum"><i class="dot"></i><div class="fmain"><span class="fcol">${esc(t('fields.okN', { n: nOk, total: tb.headers.length }))}</span></div>
      <div class="fact"><button class="qs-link" data-act="fold">${esc(t(fold ? 'fields.expand' : 'fields.fold'))}</button></div></div>`;
    html += tb.headers.map((h, ci) => {
      if (fold && okCls(h)) return '';
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
        <span class="rt"><b>${esc(prev)}</b>${st.m ? `<small${st.s === 'filled' ? ' style="color:var(--warn)"' : ''}>${esc(st.m)}</small>` : ''}</span>
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

  let toastT = 0;
  function toast(s, ms) {
    const el = $('toast'); el.textContent = s; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms || 3200);
  }

  /* ---------- 事件 ---------- */
  $('btnChoose').onclick = () => $('file').click();
  $('btnChange').onclick = () => $('file').click();
  $('file').onchange = e => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; };
  $('sheetSel').onchange = e => lastFile && loadFile(lastFile, e.target.value);
  $('btnPaste').onclick = () => { $('pasteBox').hidden = false; render(); $('pasteText').focus(); };
  $('pasteCancel').onclick = () => { $('pasteBox').hidden = true; render(); };
  $('pasteOk').onclick = () => {
    const tb = TB.parseText($('pasteText').value, t('table.paste'));
    if (!tb.rows.length) return toast(t('table.empty'));
    lastFile = null; $('pasteText').value = ''; setTable(tb);
  };
  document.addEventListener('paste', e => {
    if (S.table || e.target.closest('textarea,input')) return;
    const txt = e.clipboardData.getData('text/plain');
    if (txt && /\t|\n/.test(txt)) { const tb = TB.parseText(txt, t('table.paste')); if (tb.rows.length) { lastFile = null; setTable(tb); } }
  });
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); $('drop').classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || !e.relatedTarget) $('drop').classList.remove('over'); }));
  document.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });

  $('btnMatch').onclick = startMatch;
  $('btnRematch').onclick = startMatch;
  $('fieldList').onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const h = b.closest('.frow').dataset.h, m = map(); if (!m) return;
    const act = b.dataset.act;
    if (act === 'fold') { showAll = !showAll; return render(); }
    if (act === 'pick') pickFor(h);
    if (act === 'unbind') { if (h === '\u0000btn') m.btn = null; else delete m.b[h]; saveMaps(); render(); }
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
    const csv = TB.toCSV([...tb.headers, t('rows.statusCol')], tb.rows.map((r, i) => [...r, t('st.' + S.st[i].s) + (S.st[i].m ? '：' + S.st[i].m : '')]));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = tb.name.replace(/\.[^.]+$/, '') + '-代笔僧.csv';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(t('toast.exported'));
  };
  $('btnMain').onclick = () => {
    const [mode] = mainMode();
    if (mode === 'match') return startMatch();
    if (mode === 'pause') { run.going = false; clearTimeout(run.timer); toast(t('toast.paused', { n: S.cur + 1 })); return render(); }
    askAccess(); // 顺手拿持久授权（已有就不弹）
    if (mode === 'back') { const m = map(); run.row = S.cur; run.phase = 'back'; run.nav = true; render(); return chrome.tabs.update(tab.id, { url: m.start }); }
    if (mode === 'go') { run.going = true; render(); return startRow(nextTodo(S.cur)); }
    if (mode === 'fill' || mode === 'refill') return startRow(S.cur);
  };
  $('btnRetry').onclick = () => {
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

  /* ---------- 启动 ---------- */
  (async () => {
    cfg = await SETTINGS.load();
    store.renderSettings($('setBox'), SETTINGS.schema, cfg, async (k, v) => {
      cfg[k] = v; await SETTINGS.save(cfg);
      if (k === 'auto' && !v) run.going = false;
      render();
    }, t);
    maps = await store.get('daibi:maps', {});
    const saved = await store.get('daibi:sheet', null);
    if (saved && saved.table) S = saved;
    S.st = S.st.map(x => x.s === 'filled' ? { s: 'todo' } : x);
    await resolveTab();
    render();
    await refreshPage();
  })();

  window.__daibi = { S: () => S, run, maps: () => maps, tab, page: () => page }; // 调试/测试用
})();
