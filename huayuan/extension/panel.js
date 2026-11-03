// panel.js — 化缘僧面板（独立小窗口）。面板是大脑：数据都存在这里；网页那边只负责「看」和「点」。
(() => {
  const T = (k, v) => QSStrings.t(k, v);
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const tabId = Number(params.get('tab'));
  const PREVIEW = 200;
  const FILES = ['lib/page.js', 'content/huayuan.js'];

  const sheet = new QSSheet();
  const S = {
    cands: [], ci: 0, target: null, host: '', origin: '',
    mode: 'one', next: null, nextSpec: null, canScroll: false,
    running: false, stopAsked: false, pages: 0, ended: null, picking: false,
    settings: { delay: 0.3, maxPages: 50 },
    trying: false, complete: false,
    lastCount: 0, port: null, permWaiter: null,
  };

  // ---------- 文字 ----------
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = T(el.dataset.t);
  for (const el of document.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', T(el.dataset.tAria));

  // ---------- 跟网页说话 ----------
  async function inject() {
    await chrome.scripting.executeScript({ target: { tabId }, files: FILES });
    connectPort();
  }
  function connectPort() {
    try {
      if (S.port) return;
      S.port = chrome.tabs.connect(tabId, { name: 'qs-panel' });
      S.port.onDisconnect.addListener(() => { void chrome.runtime.lastError; S.port = null; });
    } catch { S.port = null; }
  }
  async function call(method, ...args) {
    for (let i = 0; i < 3; i++) {
      const [r] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (m, a) => (globalThis.Huayuan ? globalThis.Huayuan[m](...a) : { __missing: true }),
        args: [method, args],
      });
      const v = r && r.result;
      if (v && v.__missing) { await inject(); continue; }
      return v;
    }
    throw new Error('inject failed');
  }
  const isPermError = (e) => /cannot access|permission|must request|host/i.test(String(e && e.message || e));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- 开场 ----------
  async function init() {
    S.settings = await QSSettings.get(S.settings);
    $('setDelay').value = S.settings.delay;
    $('setMax').value = S.settings.maxPages;
    if (!tabId) return showEmpty('noAccess');
    let info;
    try { await inject(); info = await call('scan'); }
    catch { return showEmpty('noAccess'); }
    S.host = info.host; S.origin = new URL(info.url).origin;
    $('host').textContent = info.host;
    document.title = T('hyName') + ' · ' + info.host;
    S.cands = info.list;
    if (!S.cands.length) return showEmpty('noList');
    await choose(0, true);
  }

  async function choose(i, first) {
    S.ci = i; S.target = S.cands[i]; S.nextSpec = null; S.ended = null; S.pages = 1;
    sheet.reset();
    const data = await call('extract', S.target);
    sheet.add(data);
    await probe(true);
    S.complete = false; S.trying = false;
    let tr = null;
    if (S.next && S.next.found) S.mode = 'next';
    else if (S.canScroll) { S.mode = 'scroll'; S.trying = true; tr = await trialStart(); } // 先滚出去，画表的工夫顺便等着
    else { S.mode = 'one'; S.complete = true; }
    await call('highlight', S.target, S.nextSpec, !first && !tr).catch(() => {}); // 试滚着就别把名单滚回视野
    show('ctl'); render(true);
    if (S.trying) return trial(tr);
    document.body.dataset.ready = '1';
  }

  async function trialStart() {
    try {
      const before = await call('fingerprint', S.target);
      const t0 = Date.now();
      await call('trialScroll', S.target);
      return { before, t0 };
    } catch { return null; }
  }

  // 长页面：先替用户往下滚一下。出了新货 = 无限滚动，直接接着滚完；没出 = 整页都在，回到原位。
  async function trial(tr) {
    let ch = { changed: false };
    try {
      if (tr) ch = await waitChange(tr.before, { timeout: 6000, quickNo: 450, t0: tr.t0 });
    } catch {}
    S.trying = false;
    if (ch.changed) {
      await settle(0);
      const data = await safeCall('extract', S.target);
      if (data && data.ok) sheet.add(data);
      S.pages++;
      document.body.dataset.ready = '1';
      return run();
    }
    await call('restoreScroll').catch(() => {});
    S.mode = 'one'; S.complete = true;
    render();
    document.body.dataset.ready = '1';
    lateWatch();
  }

  // 试滚只看半秒就下结论，所以后面再盯 5 秒：名单要是自己长了（慢吞吞的无限滚动），改成「滚动」接着滚完
  async function lateWatch() {
    const ci = S.ci;
    const base = await safeCall('fingerprint', S.target).catch(() => null);
    if (!base || !base.ok) return;
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      await sleep(400);
      if (S.ci !== ci || S.running || S.picking || S.mode !== 'one') return;
      const f = await safeCall('fingerprint', S.target).catch(() => null);
      if (!f || !f.ok || f.fp === base.fp || f.rows <= base.rows) continue;
      await settle(0);
      const data = await safeCall('extract', S.target);
      if (!data || !data.ok || !sheet.add(data)) return;
      if (S.ci !== ci || S.running || S.mode !== 'one') return;
      S.mode = 'scroll'; S.complete = false; S.pages++;
      return run();
    }
  }

  async function probe() {
    try {
      const p = await call('probe', S.target, S.nextSpec);
      S.next = p.next; S.canScroll = p.scroll;
    } catch { S.next = { found: false }; }
  }

  // ---------- 化缘（翻页 / 滚动） ----------
  async function run() {
    if (S.running) { S.stopAsked = true; return; }
    S.running = true; S.stopAsked = false; S.ended = null;
    render();
    let stale = 0;
    const max = Math.max(1, Number(S.settings.maxPages) || 50);
    const d = Number(S.settings.delay);
    const delay = Math.min(30000, Math.max(0, (Number.isFinite(d) ? d : 0.3) * 1000));
    try {
      while (!S.stopAsked && S.pages < max) {
        const before = await safeCall('fingerprint', S.target);
        if (S.mode === 'next') {
          const r = await safeCall('clickNext', S.target, S.nextSpec);
          if (!r || !r.ok) { S.ended = 'end'; break; }
        } else {
          if (before && before.end) { S.ended = 'end'; break; } // 页面已经写着「到底了」
          await safeCall('scrollMore', S.target);
        }
        const ch = await waitChange(before, S.mode === 'scroll' ? { timeout: 8000, quickNo: 3000 } : { timeout: 15000 });
        if (S.stopAsked) break;
        if (!ch.changed) {
          // 页面还在长、只是名单没动（虚拟列表、慢）→ 再滚两次；写着到底了 / 高度不长了 → 立刻收
          if (S.mode === 'scroll' && !ch.end && ch.grew && ++stale < 3) continue;
          S.ended = 'end'; break;
        }
        // 追加式（加载更多 / 无限滚动）旧行还留在页面上，这一批晚到的下一轮照样收得到，不用多等；整页换内容的才多等
        const append = ch.rows > ((before && before.rows) || 0);
        await settle(append ? 0 : delay);
        const data = await safeCall('extract', S.target);
        const added = data && data.ok ? sheet.add(data) : 0;
        S.pages++;
        if (added === 0) { if (++stale >= 3) { S.ended = 'end'; break; } } else stale = 0;
        render();
      }
    } catch (e) {
      if (String(e.message) !== 'gone') console.warn(e);
    }
    if (!S.ended) S.ended = S.stopAsked ? 'stop' : 'end';
    // 收尾再收一遍：追加式最后一批没多等，这里补上
    try {
      await settle(delay);
      const data = await safeCall('extract', S.target);
      if (data && data.ok) sheet.add(data);
    } catch {}
    S.running = false; S.stopAsked = false;
    await probe();
    await call('highlight', S.target, S.nextSpec, false).catch(() => {});
    render();
  }

  // 等页面变：Ajax 换内容、整页跳转、滚动追加都算。返回 { changed, end, grew }
  // quickNo：滚动时，过了这么久名单没动、页面没长、网络也安静、没有「加载中」，就当到底了，不干等
  async function waitChange(before, { timeout, quickNo = 0, t0 = Date.now() }) {
    const fp = before && before.fp, h0 = (before && before.height) || 0;
    let lastSeen = null, last = null;
    while (Date.now() - t0 < timeout) {
      if (S.stopAsked) return { changed: false };
      await sleep(100);
      const f = await safeCall('fingerprint', S.target).catch(() => null);
      if (!f || !f.ok || f.ready === 'loading') { lastSeen = null; continue; }
      last = f;
      if (f.fp !== fp) {
        if (f.fp === lastSeen) return { changed: true, rows: f.rows }; // 连续两次一样 = 渲染稳了
        lastSeen = f.fp;
      } else if (quickNo) {
        if (f.end) return { changed: false, end: true };
        const t = Date.now() - t0;
        if (t > quickNo && !f.loading && f.height <= h0 + 2 && f.quiet > Math.min(t, quickNo) * 0.6) return { changed: false, grew: false };
      }
    }
    return { changed: lastSeen !== null && lastSeen !== fp, grew: !!(last && last.height > h0 + 2), end: !!(last && last.end) };
  }

  // 页面稳了再抓：等网络安静 300 毫秒（最多 2 秒），再按设置多等一会
  async function settle(delay) {
    const t0 = Date.now();
    while (Date.now() - t0 < 2000) {
      const f = await safeCall('fingerprint', S.target).catch(() => null);
      if (!f || !(f.quiet < 300)) break;
      await sleep(80);
    }
    if (delay) await sleep(delay);
  }

  // 跳了页之后浏览器可能收回临时授权：停下来请用户点一下「允许」
  async function safeCall(method, ...args) {
    for (;;) {
      try { return await call(method, ...args); }
      catch (e) {
        if (await tabGone()) { showEmpty('tabGone'); throw new Error('gone'); }
        if (isPermError(e)) { await askPermission(); continue; }
        // 页面正在跳转，等一下再试
        await sleep(400);
        try { return await call(method, ...args); } catch (e2) { if (isPermError(e2)) { await askPermission(); continue; } return null; }
      }
    }
  }
  async function tabGone() { try { await chrome.tabs.get(tabId); return false; } catch { return true; } }
  function askPermission() {
    $('perm').hidden = false;
    return new Promise((resolve) => { S.permWaiter = resolve; });
  }
  $('grant').onclick = async () => {
    const ok = await chrome.permissions.request({ origins: [S.origin + '/*'] }).catch(() => false);
    if (ok) { $('perm').hidden = true; const w = S.permWaiter; S.permWaiter = null; w && w(); }
  };

  // ---------- 画界面 ----------
  function show(which) {
    $('loading').hidden = true;
    $('ctl').hidden = which !== 'ctl';
    $('gridWrap').hidden = false;
    $('empty').hidden = which === 'ctl';
  }

  function showEmpty(kind) {
    S.running = false; S.trying = false;
    document.body.dataset.ready = '1';
    show('empty');
    $('perm').hidden = true;
    $('emptyT').textContent = T(kind === 'noList' ? 'noList' : kind === 'tabGone' ? 'tabGone' : 'noAccess');
    $('emptyS').textContent = kind === 'noList' ? T('noListSub') : kind === 'tabGone' ? '' : T('noAccessSub');
    if (kind !== 'tabGone') { sheet.reset(); sheet.add(DEMO); }
    $('meta').textContent = '';
    renderGrid(false, true);
    setExport();
  }

  function render(fresh) {
    const n = S.cands.length;
    $('blkN').textContent = T('rows', { n: sheet.rows.length.toLocaleString() });
    $('blkS').textContent = (n > 1 ? T('block', { i: S.ci + 1, n }) : T('blockOnly')) + ' · ' + T('cols', { n: sheet.visible().length });
    $('swap').hidden = n < 2;
    $('swap').disabled = S.running || S.trying;
    for (const b of $('seg').children) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode));
      b.disabled = S.running || S.trying;
    }
    // 提示 + 下一页
    const hint = $('hint'), pick = $('pick');
    pick.hidden = S.mode !== 'next' || S.running;
    if (S.trying) { hint.innerHTML = '<span class="spin"></span>'; hint.append(T('trying')); }
    else if (S.picking) { hint.textContent = T('pickWait'); pick.textContent = T('cancel'); pick.hidden = false; }
    else if (S.mode === 'next') {
      if (S.next && S.next.found) { hint.innerHTML = ''; const k = document.createElement('span'); k.className = 'k'; k.textContent = S.next.text; hint.append(T('nextFound', { text: '' }), k); pick.textContent = T('nextRepick'); }
      else { hint.textContent = T(S.ended === 'end' ? 'nextEnd' : 'nextNone'); pick.textContent = T('nextPick'); }
    } else hint.textContent = T(S.mode === 'scroll' ? 'scrollHint' : S.complete ? 'allHere' : 'oneHint');
    // 主按钮
    const go = $('go');
    go.hidden = S.mode === 'one' || S.trying || (S.ended === 'end' && !S.running); // 化完了就别再亮「开始」，下一步是导出
    go.className = 'btn big ' + (S.running ? 'stop' : 'primary');
    go.textContent = S.running ? T('stop') : S.ended === 'stop' ? T('again') : T('start');
    go.disabled = !S.running && S.mode === 'next' && !(S.next && S.next.found);
    $('bar').hidden = !S.running;
    // 状态
    const st = $('status');
    const rows = sheet.rows.length.toLocaleString();
    if (S.running) st.textContent = T(S.mode === 'scroll' ? 'runningScroll' : 'running', { p: S.pages, rows });
    else if (S.ended) {
      const b = document.createElement('b');
      b.textContent = T(S.ended === 'stop' ? 'finishedStop' : 'finished', { p: S.pages, rows, unit: T(S.mode === 'scroll' ? 'unitScreen' : 'unitPage') });
      st.replaceChildren(b);
    }
    else st.textContent = '';
    renderGrid(fresh);
    renderMeta();
    setExport();
  }

  function renderMeta() {
    const m = $('meta'); m.textContent = '';
    const add = (t) => { const s = document.createElement('span'); s.textContent = t; m.append(s); return s; };
    if (sheet.dupes) add(T('dupes', { n: sheet.dupes }));
    const hid = sheet.columns().filter((c) => c.hidden).length;
    if (hid) {
      const s = add(T('hiddenCols', { n: hid }) + ' · ');
      const b = document.createElement('button'); b.type = 'button'; b.textContent = T('restore');
      b.onclick = () => { sheet.showAll(); render(); };
      s.append(b);
    }
    if (sheet.rows.length > PREVIEW) add(T('moreRows', { shown: PREVIEW, rows: sheet.rows.length.toLocaleString() }));
    if (sheet.visible().length > 1) add(T('dragTip'));
  }

  const X = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg>';
  const isUrl = (v) => /^https?:\/\//.test(v);
  const isNum = (v) => /^[-+¥￥$€£]?[\d,.]+%?$/.test(v);

  function renderGrid(fresh, demo) {
    const cols = sheet.visible();
    const grid = $('grid');
    const sc = $('gridScroll');
    const keepTop = fresh ? 0 : sc.scrollTop, keepLeft = fresh ? 0 : sc.scrollLeft;
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const i0 = document.createElement('th'); i0.className = 'idx'; i0.textContent = '#'; hr.append(i0);
    for (const c of cols) {
      const th = document.createElement('th');
      th.dataset.key = c.key;
      th.draggable = !demo;
      th.innerHTML = '<div class="hc"><span class="nm"></span><button type="button" class="x"></button></div>';
      th.querySelector('.nm').textContent = c.name;
      const x = th.querySelector('.x'); x.innerHTML = X; x.setAttribute('aria-label', T('delCol')); x.title = T('delCol');
      if (demo) x.remove();
      hr.append(th);
    }
    thead.append(hr);
    const tbody = document.createElement('tbody');
    const rows = sheet.rows.slice(0, PREVIEW);
    const frag = document.createDocumentFragment();
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (!fresh && i >= S.lastCount && S.lastCount) tr.className = 'new';
      const td0 = document.createElement('td'); td0.className = 'idx'; td0.textContent = i + 1; tr.append(td0);
      for (const c of cols) {
        const td = document.createElement('td');
        const v = sheet.value(r, c);
        if (c.type === 'src' && isUrl(v)) { const im = document.createElement('img'); im.src = v; im.loading = 'lazy'; im.alt = ''; im.referrerPolicy = 'no-referrer'; td.append(im); td.title = v; }
        else { td.textContent = v; if (v.length > 30) td.title = v; if (isUrl(v)) td.className = 'u'; else if (isNum(v)) td.className = 'n'; }
        tr.append(td);
      }
      frag.append(tr);
    });
    tbody.append(frag);
    grid.replaceChildren(thead, tbody);
    S.lastCount = Math.min(sheet.rows.length, PREVIEW);
    sc.scrollTop = keepTop; sc.scrollLeft = keepLeft;
  }

  // ---------- 表头：改名、删列、拖动 ----------
  const grid = $('grid');
  grid.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-key]');
    if (!th || !th.draggable) return;
    if (e.target.closest('.x')) { sheet.hide(th.dataset.key); render(); return; }
    const nm = e.target.closest('.nm');
    if (!nm) return;
    const inp = document.createElement('input');
    inp.value = nm.textContent;
    nm.replaceWith(inp); inp.focus(); inp.select();
    th.draggable = false;
    let done = false;
    const commit = (ok) => { if (done) return; done = true; if (ok) sheet.rename(th.dataset.key, inp.value); render(); };
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(true); if (ev.key === 'Escape') commit(false); });
    inp.addEventListener('blur', () => commit(true));
  });
  let dragKey = null;
  grid.addEventListener('dragstart', (e) => {
    const th = e.target.closest('th[data-key]'); if (!th) return;
    dragKey = th.dataset.key; th.classList.add('drag');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragKey);
  });
  const clearOver = () => { for (const t of grid.querySelectorAll('.over-l,.over-r')) t.classList.remove('over-l', 'over-r'); };
  grid.addEventListener('dragover', (e) => {
    const th = e.target.closest('th[data-key]'); if (!th || !dragKey) return;
    e.preventDefault(); clearOver();
    const r = th.getBoundingClientRect();
    th.classList.add(e.clientX < r.left + r.width / 2 ? 'over-l' : 'over-r');
  });
  grid.addEventListener('drop', (e) => {
    const th = e.target.closest('th[data-key]'); if (!th || !dragKey) return;
    e.preventDefault();
    const left = th.classList.contains('over-l');
    let before = left ? th.dataset.key : (th.nextElementSibling && th.nextElementSibling.dataset.key) || null;
    if (before === dragKey) before = null;
    if (th.dataset.key !== dragKey) sheet.move(dragKey, before);
    dragKey = null; render();
  });
  grid.addEventListener('dragend', () => { dragKey = null; clearOver(); for (const t of grid.querySelectorAll('.drag')) t.classList.remove('drag'); });

  // ---------- 按钮 ----------
  $('swap').onclick = async () => { if (S.running || S.trying) return; await choose((S.ci + 1) % S.cands.length); };
  $('seg').onclick = async (e) => {
    const b = e.target.closest('button[data-mode]'); if (!b || S.running || S.trying) return;
    S.mode = b.dataset.mode; S.ended = null; S.complete = false; render();
  };
  $('go').onclick = () => run();
  $('pick').onclick = async () => {
    if (S.picking) { S.picking = false; await call('clear').catch(() => {}); await call('highlight', S.target, S.nextSpec, false).catch(() => {}); render(); return; }
    S.picking = true; render();
    let r = null;
    try { r = await call('pickNext', T('pickHint')); } catch {}
    if (!S.picking) return;
    S.picking = false;
    if (r) { S.nextSpec = r; S.mode = 'next'; }
    await probe();
    await call('highlight', S.target, S.nextSpec, false).catch(() => {});
    render();
  };
  $('openDemo').onclick = () => chrome.tabs.create({ url: T('demoUrl') });

  $('gear').onclick = (e) => { e.stopPropagation(); $('pop').hidden = !$('pop').hidden; };
  document.addEventListener('click', (e) => { if (!e.target.closest('.top-r')) $('pop').hidden = true; });
  for (const id of ['setDelay', 'setMax']) $(id).addEventListener('change', () => {
    const dv = Number($('setDelay').value);
    S.settings.delay = Math.min(30, Math.max(0, Number.isFinite(dv) ? Math.round(dv * 10) / 10 : 0.3));
    S.settings.maxPages = Math.min(1000, Math.max(1, Math.round(Number($('setMax').value) || 50)));
    $('setDelay').value = S.settings.delay; $('setMax').value = S.settings.maxPages;
    QSSettings.set(S.settings);
  });

  function setExport() {
    const has = sheet.rows.length > 0 && sheet.visible().length > 0 && !$('empty').hidden === false;
    for (const id of ['copy', 'csv', 'xlsx']) $(id).disabled = !has;
  }
  const fileBase = () => `${T('filePrefix')}_${(S.host || 'page').replace(/^www\./, '')}_${QSExport.stamp()}`;
  function save(kind) {
    const aoa = sheet.toAOA();
    const blob = kind === 'xlsx' ? QSExport.xlsx(aoa, S.host || 'Sheet1') : QSExport.csv(aoa);
    QSExport.download(blob, fileBase() + '.' + kind);
    toast(T('exported', { n: (aoa.length - 1).toLocaleString() }));
  }
  $('xlsx').onclick = () => save('xlsx');
  $('csv').onclick = () => save('csv');
  $('copy').onclick = async () => { const aoa = sheet.toAOA(); await QSExport.copy(QSExport.tsv(aoa)); toast(T('copied', { n: aoa.length - 1 })); };

  // 提示条浮在导出按钮上方：记下底栏有多高
  try { new ResizeObserver(() => document.documentElement.style.setProperty('--foot-h', $('bottom').offsetHeight + 'px')).observe($('bottom')); } catch {}
  let tt = null;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2200); }

  chrome.tabs.onRemoved.addListener((id) => { if (id === tabId) { S.stopAsked = true; showEmpty('tabGone'); } });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.running) S.stopAsked = true; });

  // 示例数据（假的）：打不开网页时让人一眼看懂这尊是干嘛的
  const DEMO = (() => {
    const keys = ['a|t', 'b|t', 'c|t', 'd|t', 'e|t'];
    const meta = { 'a|t': { type: 't', hint: '公司' }, 'b|t': { type: 't', hint: '联系人' }, 'c|t': { type: 't', hint: '电话' }, 'd|t': { type: 't', hint: '城市' }, 'e|t': { type: 't', hint: '阶段' } };
    const co = ['青禾', '远山', '白鹭', '银杏', '北辰', '南风', '松石', '云杉'];
    const ind = ['科技', '贸易', '物流', '文创', '餐饮', '建材', '咨询', '医疗器械'];
    const city = ['上海', '深圳', '杭州', '成都', '新加坡', '广州', '苏州', '北京'];
    const stage = ['初次接触', '已报价', '谈判中', '已成交'];
    const fam = ['张', '王', '李', '陈', '林', '黄', '周', '吴'];
    const rows = co.map((c, i) => ({ 'a|t': `${c}${ind[i]}（示例）`, 'b|t': `${fam[i]}小${'一二三四五六七八'[i]}`, 'c|t': `138-0000-${String(1000 + i * 137).slice(-4)}`, 'd|t': city[i], 'e|t': stage[i % 4] }));
    return { keys, meta, rows };
  })();

  init();
})();
