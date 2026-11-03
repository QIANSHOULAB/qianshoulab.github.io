// panel.js — 化缘僧侧栏。面板是大脑：数据都存在这里；网页那边只负责「看」和「点」。
// 0.3.0：人只做两件事——扫一眼认得对不对（拿不准的标黄）、决定翻不翻全部页。别的自己来：
//   化完、没标黄 → 自己下载；同一个网站第二回 → 照上次的改法（列名、删列、顺序、哪一块、下一页、翻全部）自己办，都能「还原」。
(() => {
  const T = (k, v) => QSStrings.t(k, v);
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const tabId = Number(params.get('tab'));
  const PREVIEW = 200;
  const FILES = ['lib/page.js', 'content/huayuan.js'];
  const AMBIGUOUS = 0.6; // 第二块的分数到第一块的六成，就算「还有一块也像」

  const sheet = new QSSheet();
  const S = {
    cands: [], ci: 0, target: null, host: '', origin: '',
    mode: 'one', next: null, nextSpec: null, canScroll: false,
    running: false, stopAsked: false, pages: 0, ended: null, picking: false,
    settings: { delay: 0.3, maxPages: 50, auto: true, fmt: 'xlsx' },
    trying: false, complete: false,
    lastCount: 0, port: null, permWaiter: null,
    memo: [],          // 这个网站记下的几块
    site: null,        // 这一块记下的改法
    matched: false,    // 这回认的这块跟上回是同一块
    picked: false,     // 这一块是人挑的（换过、上回挑过）
    applied: null,     // 照上次办了哪几样（给人看、能还原）
    userStarted: false, ran: false, dlDone: false, demo: false, gone: false,
  };

  // ---------- 文字：默认英文，右上角 EN / 中文 切换，选过就记住（QSStrings.load / use） ----------
  function applyStatic() {
    document.documentElement.lang = T('htmlLang');
    for (const el of document.querySelectorAll('[data-t]')) el.textContent = T(el.dataset.t);
    for (const el of document.querySelectorAll('[data-t-aria]')) { el.setAttribute('aria-label', T(el.dataset.tAria)); el.title = T(el.dataset.tAria); }
    for (const b of $('lang').children) b.setAttribute('aria-pressed', String(b.dataset.lang === QSStrings.lang));
    document.title = S.host ? T('hyName') + ' · ' + S.host : T('hyName');
  }
  const num = (n) => QSStrings.num(n);

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

  // ---------- 记性：同一个网站第二回照上次办 ----------
  // 按网站存一串（最多 8 条，最近用的在前），每条认一块名单：{ block, prefs, next, ok, run }
  function remember(extra) {
    if (!S.host || S.demo || !S.target) return;
    const prev = S.site && S.matched ? S.site : {};
    const e = { ...prev, block: { path: S.target.path, sig: S.target.sig }, prefs: sheet.prefs(), next: S.nextSpec || null, ...extra };
    S.memo = [e, ...S.memo.filter((x) => x !== S.site && !sameBlock(x.block, e.block))].slice(0, 8);
    S.site = e; S.matched = true;
    QSSettings.setSite(S.host, { list: S.memo });
  }
  async function forget() {
    S.memo = S.memo.filter((x) => x !== S.site);
    S.site = null; S.matched = false;
    if (S.memo.length) await QSSettings.setSite(S.host, { list: S.memo }); else await QSSettings.forgetSite(S.host);
  }
  function sameBlock(c, b) { return !!(c && b && c.path === b.path && c.sig === b.sig); }
  // 这页的哪一块上回认过：先找路径和长相都一样的；找不到，再找长相一样、而且这页只有一块长这样的
  function recall() {
    const list = [...S.memo.filter((e) => e.ok), ...S.memo.filter((e) => !e.ok)]; // 下载过的那块优先
    for (const e of list) { const i = S.cands.findIndex((c) => sameBlock(c, e.block)); if (i >= 0) return { e, i }; }
    for (const e of list) {
      const hits = S.cands.map((c, i) => (c.sig === e.block.sig ? i : -1)).filter((i) => i >= 0);
      if (hits.length === 1) return { e, i: hits[0] };
    }
    return null;
  }

  // ---------- 开场 ----------
  async function init() {
    // 语言和设置一起读（分两回读，表晚出来几十毫秒）
    await Promise.all([QSStrings.load(), QSSettings.get(S.settings).then((v) => { S.settings = v; })]);
    applyStatic();
    $('setDelay').value = S.settings.delay;
    $('setMax').value = S.settings.maxPages;
    $('setAuto').checked = !!S.settings.auto;
    setFormat();
    if (!tabId) return showEmpty('noAccess');
    let info;
    try { await inject(); info = await call('scan'); }
    catch { return showEmpty('noAccess'); }
    S.host = info.host; S.origin = new URL(info.url).origin;
    $('host').textContent = info.host;
    document.title = T('hyName') + ' · ' + info.host;
    S.cands = info.list;
    if (!S.cands.length) return showEmpty('noList');
    const saved = await QSSettings.site(S.host);
    S.memo = (saved && Array.isArray(saved.list)) ? saved.list.filter((e) => e && e.block) : [];
    const hit = recall();
    S.site = hit ? hit.e : null;
    await choose(hit ? hit.i : 0, true);
  }

  async function choose(i, first) {
    S.ci = i; S.target = S.cands[i]; S.nextSpec = null; S.ended = null; S.pages = 1;
    S.applied = null; S.userStarted = false; S.autoRun = false; S.ran = false; S.dlDone = false;
    if (!first) S.site = null; // 换了一块：上回记的那块不套到这块上
    S.matched = !!(first && S.site);
    S.picked = S.matched || !first;
    sheet.reset();
    const data = await call('extract', S.target);
    sheet.add(data);
    let autoRun = false;
    if (S.matched && first) {
      // 照上次的改法办，记下办了哪几样，给人看、能还原
      sheet.applyPrefs(S.site.prefs);
      if (S.site.next) S.nextSpec = S.site.next;
      const e = sheet.edits(), parts = [];
      if (e.rename) parts.push(['remRename', { n: e.rename }]);
      if (e.hide) parts.push(['remHide', { n: e.hide }]);
      if (e.order) parts.push(['remOrder']);
      if (i > 0) parts.push(['remBlock']);
      if (S.site.next) parts.push(['remNext']);
      S.applied = parts; // 存键不存字：中途换语言也跟着换
    }
    await probe(true);
    S.complete = false; S.trying = false;
    let tr = null;
    if (S.next && S.next.found) {
      S.mode = 'next';
      // 上回在这个网站这一块翻完了全部页 → 这回不用再点「开始」
      if (S.matched && first && S.site.run === 'next') { autoRun = true; S.applied.push(['remRun']); }
    }
    else if (S.canScroll) { S.mode = 'scroll'; S.trying = true; tr = await trialStart(); } // 先滚出去，画表的工夫顺便等着
    else { S.mode = 'one'; S.complete = true; }
    if (S.applied && !S.applied.length) S.applied = null;
    await call('highlight', S.target, S.nextSpec, !first && !tr).catch(() => {}); // 试滚着就别把名单滚回视野
    show('ctl'); render(true);
    if (S.trying) return trial(tr);
    document.body.dataset.ready = '1';
    if (autoRun) { S.userStarted = true; S.autoRun = true; run(); }
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

  // ---------- 拿不准的：标黄 ----------
  function doubts() {
    const cols = sheet.visible().filter((c) => c.weak).map((c) => c.key);
    const block = !S.picked && S.ci === 0 && S.cands.length > 1 && S.cands[1].score >= S.cands[0].score * AMBIGUOUS;
    const max = S.ended === 'max';
    return { cols, block, max, n: cols.length + (block ? 1 : 0) + (max ? 1 : 0) };
  }

  // ---------- 化缘（翻页 / 滚动） ----------
  async function run() {
    if (S.running) { S.stopAsked = true; return; }
    S.running = true; S.stopAsked = false; S.ended = null; S.ran = true; S.dlDone = false;
    render();
    let stale = 0;
    const max = Math.max(1, Number(S.settings.maxPages) || 50);
    const d = Number(S.settings.delay);
    const delay = Math.min(30000, Math.max(0, (Number.isFinite(d) ? d : 0.3) * 1000));
    try {
      while (!S.stopAsked) {
        if (S.pages >= max) { S.ended = 'max'; break; }
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
    if (!S.gone) {
      try {
        await settle(delay);
        const data = await safeCall('extract', S.target);
        if (data && data.ok) sheet.add(data);
      } catch {}
    }
    S.running = false; S.stopAsked = false;
    if (S.gone) return render();
    await probe();
    await call('highlight', S.target, S.nextSpec, false).catch(() => {});
    // 化完了、没有拿不准的 → 人肯定要下，替他下。人点过「开始」，或者上回在这个网站下过这一块，才算他认过这张表
    const okToSave = S.ended === 'end' && S.settings.auto && sheet.rows.length && doubts().n === 0 && (S.userStarted || (S.matched && S.site && S.site.ok));
    if (okToSave) { save(S.settings.fmt, true); S.dlDone = true; }
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
        if (await tabGone()) { tabClosed(); throw new Error('gone'); }
        if (isPermError(e)) { await askPermission(); continue; }
        // 页面正在跳转，等一下再试
        await sleep(400);
        try { return await call(method, ...args); } catch (e2) { if (isPermError(e2)) { await askPermission(); continue; } return null; }
      }
    }
  }
  async function tabGone() { try { await chrome.tabs.get(tabId); return false; } catch { return true; } }
  function askPermission() {
    $('perm').hidden = false; updatePrimary();
    return new Promise((resolve) => { S.permWaiter = resolve; });
  }
  $('grant').onclick = async () => {
    const ok = await chrome.permissions.request({ origins: [S.origin + '/*'] }).catch(() => false);
    if (ok) { $('perm').hidden = true; const w = S.permWaiter; S.permWaiter = null; w && w(); render(); }
  };

  // ---------- 画界面 ----------
  function show(which) {
    $('loading').hidden = true;
    $('ctl').hidden = which !== 'ctl';
    $('empty').hidden = which !== 'empty';
    $('gridWrap').hidden = which === 'empty' && !S.demo;
  }

  function showEmpty(kind) {
    S.running = false; S.trying = false;
    document.body.dataset.ready = '1';
    show('empty');
    $('perm').hidden = true;
    S.emptyKind = kind === 'noList' ? 'noList' : 'noAccess';
    renderEmpty();
    $('meta').textContent = '';
    setExport(); updatePrimary();
  }

  function renderEmpty() {
    $('emptyT').textContent = T(S.emptyKind);
    $('emptyS').textContent = T(S.emptyKind + 'Sub');
  }

  // 网页关了：表还在，照样能下。话放在出事的地方
  function tabClosed() {
    if (S.gone) return;
    S.gone = true; S.stopAsked = true; S.trying = false;
    document.body.dataset.ready = '1';
    if (!$('ctl').hidden || sheet.rows.length) { $('ctl').hidden = true; $('loading').hidden = true; $('gridWrap').hidden = false; }
    renderGone();
    $('perm').hidden = false;
    renderMeta(); setExport(); updatePrimary();
  }

  function renderGone() {
    $('perm').replaceChildren(Object.assign(document.createElement('span'), { textContent: T('tabGone', { rows: num(sheet.rows.length) }) }));
  }

  function svgOk() { return '<svg class="ok" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>'; }

  function render(fresh) {
    if (S.gone) { renderGrid(fresh); renderMeta(); setExport(); updatePrimary(); return; }
    const n = S.cands.length;
    const dz = doubts();
    $('blkN').textContent = T('rows', { n: num(sheet.rows.length) });
    const bs = $('blkS'); bs.textContent = '';
    if (dz.block) { const c = document.createElement('span'); c.className = 'chip'; c.textContent = T('blockDoubt'); bs.append(c, ' '); }
    else bs.append((n > 1 ? T('block', { i: S.ci + 1, n }) : T('blockOnly')) + ' · ');
    bs.append(T('cols', { n: sheet.visible().length }));
    $('swap').hidden = n < 2;
    $('swap').disabled = S.running || S.trying;
    for (const b of $('seg').children) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode));
      b.disabled = S.running || S.trying;
    }
    // 提示 + 下一页
    const hint = $('hint'), pick = $('pick');
    pick.hidden = S.mode !== 'next' || S.running || S.ended === 'end' || S.ended === 'max';
    if (S.trying) { hint.innerHTML = '<span class="spin"></span> '; hint.append(T('trying')); }
    else if (S.picking) { hint.textContent = T('pickWait'); pick.textContent = T('cancel'); pick.hidden = false; }
    else if (S.mode === 'next') {
      if (S.next && S.next.found) { hint.textContent = T('nextFound'); const k = document.createElement('span'); k.className = 'k'; k.textContent = S.next.text; hint.append(k); pick.textContent = T('nextRepick'); }
      else { hint.textContent = T(S.ended === 'end' ? 'nextEnd' : 'nextNone'); pick.textContent = T('nextPick'); }
    } else hint.textContent = T(S.mode === 'scroll' ? 'scrollHint' : S.complete ? 'allHere' : 'oneHint');
    $('ctl').querySelector('.mode').hidden = S.running && S.mode === 'scroll';
    // 开始 / 停 / 接着化
    const go = $('go');
    go.hidden = S.mode === 'one' || S.trying || ((S.ended === 'end' || S.ended === 'max') && !S.running); // 化完了就别再亮「开始」，下一步是下载
    go.className = 'btn ' + (S.running ? 'plain' : 'primary');
    go.textContent = S.running ? T('stop') : S.ended === 'stop' ? T('again') : T('start');
    go.disabled = !S.running && S.mode === 'next' && !(S.next && S.next.found);
    $('bar').hidden = !S.running;
    // 状态
    const st = $('status'); st.textContent = '';
    const rows = num(sheet.rows.length);
    if (S.running) {
      st.innerHTML = '<span class="spin"></span>';
      st.append(T(S.mode === 'scroll' ? 'runningScroll' : 'running', { p: S.pages, rows }));
    } else if (S.ended) {
      const unit = T(S.mode === 'scroll' ? 'unitScreen' : 'unitPage', { p: S.pages });
      const key = S.ended === 'stop' ? 'finishedStop' : S.dlDone ? 'finishedDl' : 'finished';
      if (S.ended !== 'stop') st.innerHTML = svgOk();
      const b = document.createElement('b'); b.textContent = T(key, { p: S.pages, rows, unit }); st.append(b);
    }
    if (!S.running && !S.trying && dz.n && !S.dlDone) {
      const w = document.createElement('span'); w.className = 'warn';
      w.textContent = dz.max ? T('doubtMax', { n: S.settings.maxPages }) : T('doubts', { n: dz.n });
      if (dz.max && dz.n > 1) w.textContent += ' · ' + T('doubts', { n: dz.n - 1 });
      st.append(w);
    }
    renderGrid(fresh);
    renderMeta();
    setExport();
    updatePrimary();
    // 测试、跑分认状态用（不看字，中英都一样）：running / end / stop / max / trying / idle
    document.body.dataset.state = S.running ? 'running' : S.trying ? 'trying' : (S.ended || 'idle');
    document.body.dataset.dl = S.dlDone ? '1' : '';
  }

  function renderMeta() {
    const m = $('meta'); m.textContent = '';
    const add = (t) => { const s = document.createElement('span'); s.textContent = t; m.append(s); return s; };
    const link = (s, text, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = fn; s.append(b); return b; };
    if (S.demo) { const s = add(''); const t = document.createElement('span'); t.className = 'tag'; t.textContent = T('demoBadge'); s.append(t, ' ' + T('demoNote')); return; }
    if (S.dlDone) { const s = add(T('autoDl') + ' · '); link(s, T('autoDlOff'), () => { S.settings.auto = false; $('setAuto').checked = false; QSSettings.set(S.settings); S.dlDone = false; toast(T('autoDlOffDone')); render(); }); }
    if (S.applied) { const s = add(T('remembered', { what: S.applied.map(([k, v]) => T(k, v)).join(T('listSep')) }) + ' · '); link(s, T('undo'), undoMemory); }
    if (sheet.dupes) add(T('dupes', { n: sheet.dupes }));
    const hid = sheet.columns().filter((c) => c.hidden).length;
    if (hid) { const s = add(T('hiddenCols', { n: hid }) + ' · '); link(s, T('restore'), () => { sheet.showAll(); remember(); render(); }); }
    if (sheet.rows.length > PREVIEW) add(T('moreRows', { shown: PREVIEW, rows: num(sheet.rows.length) }));
    if (!S.applied && sheet.visible().length > 1 && !S.running) add(T('dragTip'));
  }

  // 还原：照上次办的全不算，忘掉这个网站，回到自己猜的样子
  async function undoMemory() {
    if (S.running && S.autoRun) S.stopAsked = true; // 自己开翻的也一起撤：停下，不自己下
    S.applied = null;
    await forget();
    sheet.applyPrefs(null);
    if (!S.running) { S.nextSpec = null; await probe(); await call('highlight', S.target, S.nextSpec, false).catch(() => {}); }
    render();
  }

  const X = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg>';
  const isUrl = (v) => /^https?:\/\//.test(v);
  const isNum = (v) => /^[-+¥￥$€£]?[\d,.]+%?$/.test(v);

  function renderGrid(fresh) {
    const demo = S.demo;
    const cols = sheet.visible();
    const weak = new Set(demo ? [] : doubts().cols);
    const grid = $('grid');
    grid.classList.toggle('demo', demo);
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
      if (c.name.length > 8) th.title = c.name; // 名字太长被省略时，悬停看全名
      if (weak.has(c.key)) { th.classList.add('doubt'); th.title = T('doubtCol'); }
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
        else {
          const sp = document.createElement('span'); sp.className = 'c'; sp.textContent = v; td.append(sp); // 一格最宽 176，超出省略号
          if (v.length > 12) td.title = v;
          if (isUrl(v)) td.className = 'u'; else if (isNum(v)) td.className = 'n';
        }
        tr.append(td);
      }
      frag.append(tr);
    });
    tbody.append(frag);
    grid.replaceChildren(thead, tbody);
    S.lastCount = Math.min(sheet.rows.length, PREVIEW);
    sc.scrollTop = keepTop; sc.scrollLeft = keepLeft;
    fade();
  }

  // 右缘渐隐：横向还有没露出来的列才显示，滚到头就去掉；让开滚动条
  function fade() {
    const sc = $('gridScroll'), w = $('gridWrap');
    w.style.setProperty('--sb-r', (sc.offsetWidth - sc.clientWidth) + 'px');
    w.style.setProperty('--sb-b', (sc.offsetHeight - sc.clientHeight) + 'px');
    w.classList.toggle('more-r', sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 2);
  }
  $('gridScroll').addEventListener('scroll', fade, { passive: true });
  try { new ResizeObserver(fade).observe($('gridScroll')); } catch {}

  // ---------- 表头：改名、删列、拖动 ----------
  const grid = $('grid');
  grid.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-key]');
    if (!th || !th.draggable) return;
    if (e.target.closest('.x')) { sheet.hide(th.dataset.key); remember(); render(); return; }
    const nm = e.target.closest('.nm');
    if (!nm) return;
    const inp = document.createElement('input');
    inp.value = nm.textContent;
    nm.replaceWith(inp); inp.focus(); inp.select();
    th.draggable = false;
    let done = false;
    const commit = (ok) => { if (done) return; done = true; if (ok) { sheet.rename(th.dataset.key, inp.value); remember(); } render(); };
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
    if (th.dataset.key !== dragKey) { sheet.move(dragKey, before); remember(); }
    dragKey = null; render();
  });
  grid.addEventListener('dragend', () => { dragKey = null; clearOver(); for (const t of grid.querySelectorAll('.drag')) t.classList.remove('drag'); });

  // ---------- 按钮 ----------
  $('swap').onclick = async () => { if (S.running || S.trying) return; await choose((S.ci + 1) % S.cands.length); remember(); render(); };
  $('seg').onclick = async (e) => {
    const b = e.target.closest('button[data-mode]'); if (!b || S.running || S.trying) return;
    S.mode = b.dataset.mode; S.ended = null; S.complete = false; render();
  };
  $('go').onclick = () => { if (!S.running) { S.userStarted = true; S.autoRun = false; } run(); };
  $('pick').onclick = async () => {
    if (S.picking) { S.picking = false; await call('clear').catch(() => {}); await call('highlight', S.target, S.nextSpec, false).catch(() => {}); render(); return; }
    S.picking = true; render();
    let r = null;
    try { r = await call('pickNext', T('pickHint')); } catch {}
    if (!S.picking) return;
    S.picking = false;
    if (r) { S.nextSpec = r; S.mode = 'next'; remember(); }
    await probe();
    await call('highlight', S.target, S.nextSpec, false).catch(() => {});
    render();
  };
  $('tryDemo').onclick = () => {
    S.demo = true; showDemo();
    $('tryDemo').hidden = true; $('gridWrap').hidden = false;
    render(true);
  };
  $('openDemo').onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: T('demoUrl') }); };

  $('gear').onclick = (e) => { e.stopPropagation(); const p = $('pop'); p.hidden = !p.hidden; $('gear').setAttribute('aria-expanded', String(!p.hidden)); };
  document.addEventListener('click', (e) => { if (!e.target.closest('.top-r')) { $('pop').hidden = true; $('gear').setAttribute('aria-expanded', 'false'); } });
  for (const id of ['setDelay', 'setMax', 'setAuto']) $(id).addEventListener('change', () => {
    const dv = Number($('setDelay').value);
    S.settings.delay = Math.min(30, Math.max(0, Number.isFinite(dv) ? Math.round(dv * 10) / 10 : 0.3));
    S.settings.maxPages = Math.min(1000, Math.max(1, Math.round(Number($('setMax').value) || 50)));
    S.settings.auto = $('setAuto').checked;
    $('setDelay').value = S.settings.delay; $('setMax').value = S.settings.maxPages;
    QSSettings.set(S.settings);
  });

  // ---------- 下载 ----------
  // 主按钮是上回用的格式；另一个格式和「复制」是灰按钮
  function setFormat() {
    const csv = S.settings.fmt === 'csv';
    $('xlsx').textContent = T(csv ? 'fmtXlsx' : 'dlXlsx');
    $('csv').textContent = T(csv ? 'dlCsv' : 'fmtCsv');
    $('xlsx').classList.toggle('main', !csv);
    $('csv').classList.toggle('main', csv);
  }
  // 一屏只一个主按钮：「开始」亮着时下载是灰的
  function updatePrimary() {
    const goPrimary = !$('ctl').hidden && !$('go').hidden && !S.running;
    const emptyPrimary = !$('empty').hidden && !$('tryDemo').hidden;
    const permPrimary = !$('perm').hidden && !!S.permWaiter;
    const main = $(S.settings.fmt === 'csv' ? 'csv' : 'xlsx');
    const other = $(S.settings.fmt === 'csv' ? 'xlsx' : 'csv');
    main.className = 'btn main ' + (goPrimary || emptyPrimary || permPrimary || S.running ? 'plain' : 'primary');
    other.className = 'btn plain';
  }
  function setExport() {
    const has = sheet.rows.length > 0 && sheet.visible().length > 0 && ($('empty').hidden || S.demo);
    for (const id of ['copy', 'csv', 'xlsx']) $(id).disabled = !has;
  }
  const fileBase = () => `${T('filePrefix')}_${S.demo ? T('demoBadge') : (S.host || 'page').replace(/^www\./, '')}_${QSExport.stamp()}`;
  function save(kind, auto) {
    const aoa = sheet.toAOA();
    const blob = kind === 'xlsx' ? QSExport.xlsx(aoa, S.host || 'Sheet1') : QSExport.csv(aoa);
    QSExport.download(blob, fileBase() + '.' + kind);
    toast(T('exported', { n: num(aoa.length - 1) }));
    if (S.demo) return;
    // 下过了 = 人认过这一块；翻完全部页再下的，下回自己开翻
    const extra = { ok: true };
    if (S.ran && S.mode === 'next' && (S.ended === 'end' || S.ended === 'max')) extra.run = 'next';
    else if (!S.ran && S.mode !== 'next') extra.run = null;
    remember(extra);
    if (!auto && S.settings.fmt !== kind) { S.settings.fmt = kind; QSSettings.set(S.settings); setFormat(); updatePrimary(); }
  }
  $('xlsx').onclick = () => save('xlsx');
  $('csv').onclick = () => save('csv');
  $('copy').onclick = async () => { const aoa = sheet.toAOA(); await QSExport.copy(QSExport.tsv(aoa)); toast(T('copied', { n: num(aoa.length - 1) })); };

  // 提示条浮在下载按钮上方：记下底栏有多高
  try { new ResizeObserver(() => document.documentElement.style.setProperty('--foot-h', $('bottom').offsetHeight + 'px')).observe($('bottom')); } catch {}
  let tt = null;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2200); }

  chrome.tabs.onRemoved.addListener((id) => { if (id === tabId) tabClosed(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.running) S.stopAsked = true; });

  // 示例数据（假的，字在 strings.js 的 demo 里）：打不开网页时让人一眼看懂这尊是干嘛的
  function showDemo() {
    const d = QSStrings.demo();
    const keys = ['a|t', 'b|t', 'c|t', 'd|t', 'e|t'];
    const names = ['colCompany', 'colContact', 'colPhone', 'colCity', 'colStage'];
    const meta = Object.fromEntries(keys.map((k) => [k, { type: 't' }]));
    const rows = d.co.map((c, i) => ({ 'a|t': QSStrings.fill(d.company, { a: c, b: d.ind[i] }), 'b|t': d.person[i], 'c|t': d.phone[i], 'd|t': d.city[i], 'e|t': d.stage[i % d.stage.length] }));
    sheet.reset(); sheet.add({ keys, meta, rows });
    keys.forEach((k, i) => sheet.rename(k, T(names[i])));
  }

  // 换语言：字全换，自己起的列名跟着换（人改过的不动），别的照旧
  $('lang').onclick = async (e) => {
    const b = e.target.closest('button[data-lang]');
    if (!b || b.dataset.lang === QSStrings.lang) return;
    await QSStrings.use(b.dataset.lang);
    applyStatic(); setFormat();
    sheet.relabel();
    if (S.demo) showDemo();
    if (S.emptyKind) renderEmpty();
    if (S.gone) renderGone();
    if (S.demo || S.gone || !$('ctl').hidden) render();
  };

  init();
})();
