// 化缘僧比武 · 跑分脚本：把我们的和对手的插件各装进 Playwright 的 Chromium，按「真人最少点几下」的路线跑每个场景，
// 记点击次数、用时，下载 xlsx，截面板图。准确度由 score.py 对标准答案打分。
// 用法：node huayuan/bench/run.js <输出目录> <工具:ours|ids|ods> [插件目录] [场景,逗号分隔]
//   ours 默认用 huayuan/extension；ids = Instant Data Scraper 商店版（1.9.3，crx 解包目录；1.4.1 的 Open Scraper 分支 ui 不同，已不支持）；ods = Open Data Scraper（IDS 克隆）
// ids 要先从 Chrome 应用商店官方地址下 crx（https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Dofaokhiedipichpaobibbnahnkdoiiah%26uc），unzip 解到仓库外。
// 需要先 node huayuan/bench/gen.js 生成测试站。跑之前 LANG=C.UTF-8（不然沙盒里中文下载名会变成 download）。
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const SITE = path.join(__dirname, 'site');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'hy-bench'));
const TOOL = process.argv[3] || 'ours';
const EXT = path.resolve(process.argv[4] || path.join(__dirname, '..', 'extension'));
const ALL = ['a-table300', 'b-cards', 'c-paged', 'd-ajax', 'e-loadmore', 'f-infinite'];
const ONLY = (process.argv[5] || ALL.join(',')).split(',');
const PORT = Number(process.env.PORT) || 8790, BASE = `http://127.0.0.1:${PORT}`;
const START = { 'c-paged': 'c-paged-1.html' };
// 0.4.0：插件默认英文，HY_LANG=zh 跑中文界面（跟 0.3.0 比用这个；测试站本身是中文的，不受影响）
const HY_LANG = process.env.HY_LANG === 'en' ? 'en' : 'zh';
// 每个场景的翻法：one 单页 / next 点下一页 / more 点「加载更多」 / scroll 无限滚动。next/more 时真人要点的那个按钮
const KIND = { 'a-table300': 'one', 'b-cards': 'one', 'c-paged': 'next', 'd-ajax': 'next', 'e-loadmore': 'more', 'f-infinite': 'scroll' };
const NEXT_SEL = { 'c-paged': '.pager a:has-text("下一页")', 'd-ajax': '.pager button.next', 'e-loadmore': '#more' };
const LIMIT = 240000;
fs.mkdirSync(path.join(OUT, TOOL), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
  return new Promise((r) => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, BASE).pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(SITE, p);
      if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(PORT, '127.0.0.1', () => r(s));
  });
}

function build() {
  if (TOOL !== 'ours') return EXT;
  // 跟 test/e2e.js 一样：测试版多给 127.0.0.1 的读权限（Playwright 点不了工具栏图标，拿不到 activeTab）
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-ext-'));
  fs.cpSync(EXT, dir, { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  m.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  return dir;
}

async function main() {
  const server = await serve();
  const ext = build();
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'hy-prof-')), {
    headless: true, channel: 'chromium', acceptDownloads: true, viewport: { width: 1280, height: 860 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const results = [];
  let onboard = 0;
  if (TOOL === 'ids') {
    // 商店版 IDS 1.9.x 装好后先弹一页开户向导：Get Started → 勾服务条款 → Confirm & Activate → 「Continue with Basic Only」。
    // 那一页还要你同意收集、转卖浏览数据（Browsing Activity / AI / Ads Data），我们不勾，只勾必填的服务条款。一次性，记在 onboard 里不算进每个场景。
    await sleep(2500);
    const o = ctx.pages().find((p) => p.url().includes('options.html')) || await ctx.waitForEvent('page', { predicate: (p) => p.url().includes('options.html'), timeout: 15000 });
    await o.click('text=Get Started'); onboard++; await sleep(600);
    await o.check('#options-terms-checkbox'); onboard++;
    await o.click('text=Confirm & Activate'); onboard++; await sleep(600);
    await o.click('text=Continue with Basic Only'); onboard++; await sleep(1200);
    await o.close();
    console.log(JSON.stringify({ tool: TOOL, onboardClicks: onboard }));
  }

  for (const sc of ONLY) {
    const kind = KIND[sc];
    const r = { tool: TOOL, scene: sc, kind, clicks: 0, steps: [], ms: null, file: null, note: '' };
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${BASE}/${START[sc] || sc + '.html'}`);
    await page.waitForLoadState('networkidle'); await sleep(800);
    await page.bringToFront();
    const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((x) => x.url === u).id, page.url());
    let panel;
    // 每个场景都当「第一次用」：清掉上一个场景记下的改法（同一个 127.0.0.1，不清会串）
    if (TOOL === 'ours') await sw.evaluate(async (l) => { await chrome.storage.local.clear(); await chrome.storage.local.set({ lang: l }); }, HY_LANG);
    const click = async (where, sel, label) => { r.clicks++; r.steps.push(label); await where.locator(sel).first().click({ timeout: 15000 }); };
    const t0 = Date.now();
    try {
      // 1) 点工具栏图标（Playwright 点不了，直接调各家图标的处理函数，跟点图标等价）
      r.clicks++; r.steps.push('点图标');
      const wait = ctx.waitForEvent('page', { predicate: (p) => p.url().startsWith(`chrome-extension://${extId}`), timeout: 20000 });
      if (TOOL === 'ours') await sw.evaluate(async (id) => globalThis.openPanel(await chrome.tabs.get(id)), tabId);
      else if (TOOL === 'ids') await sw.evaluate(async (id) => { const t = await chrome.tabs.get(id); chrome.windows.create({ url: chrome.runtime.getURL('src/popup.html?' + new URLSearchParams({ tabid: String(t.id), url: t.url })), type: 'popup', width: 720, height: 690 }); }, tabId);
      else await sw.evaluate(async (id) => { chrome.windows.create({ url: chrome.runtime.getURL('src/dashboard.html') + '#tab=' + id, type: 'normal', width: 1100, height: 800 }); }, tabId);
      panel = await wait;
      panel.on('pageerror', (e) => errs.push('panel: ' + e.message));
      r.autoDl = null;
      panel.on('download', (d) => { if (!r.autoDl) r.autoDl = { d, at: Date.now() }; });
      await panel.waitForLoadState('domcontentloaded');
      if (TOOL === 'ours') await panel.setViewportSize({ width: 400, height: 820 }); // 侧边栏宽
      if (TOOL === 'ids') await panel.setViewportSize({ width: 720, height: 690 });
      if (TOOL === 'ods') await panel.setViewportSize({ width: 1100, height: 800 });
      await sw.evaluate(async (id) => { await chrome.tabs.update(id, { active: true }); }, tabId).catch(() => {});

      if (TOOL === 'ours') {
        await panel.waitForSelector('#ctl:not([hidden])', { timeout: 20000 });
        r.tableMs = Date.now() - t0; // 表出来的时刻（试滚还在后台跑）
        if (kind === 'one') {
          // 单页：跟 IDS 同一条路——表一出来就点导出（导出键这时已经能点）。试滚的结论另记 readyMs，拿来核对没有漏
          r.file = await dl(panel, '#xlsx', r); r.ms = Date.now() - t0;
          await panel.waitForSelector('body[data-ready]', { timeout: 20000 });
          r.readyMs = Date.now() - t0;
          const m = await panel.evaluate(() => document.querySelector('#seg [aria-pressed=true]')?.dataset.mode);
          r.note += `表 ${r.tableMs} 毫秒出来、${r.ms} 毫秒导完；试滚 ${r.readyMs} 毫秒下结论：${m}${m === 'one' ? '（导出的就是全部）' : '（还有，导早了）'}；`;
        } else {
        await panel.waitForSelector('body[data-ready]', { timeout: 20000 }); // 长页面先试滚一下，看完再算
        const mode = await panel.evaluate(() => document.querySelector('#seg [aria-pressed=true]')?.dataset.mode);
        const auto = await panel.evaluate(() => { const s = document.body.dataset.state; return s ? ['running', 'end'].includes(s) : /第 \d+ 屏|化完了/.test(document.getElementById('status').textContent); });
        r.note += `自动选了 ${mode}${auto ? '，自己滚起来了' : ''}；`;
        if (auto) {
          await panel.waitForFunction((() => { const s = document.body.dataset.state; return s ? ['end', 'stop', 'max'].includes(s) : /化完了|停了/.test(document.getElementById('status').textContent); }), null, { timeout: LIMIT });
        } else if (kind !== 'one') {
          // 自动没选对 → 真人要多点：选模式 / 点选下一页
          if (kind === 'scroll' && mode !== 'scroll') await click(panel, '#seg [data-mode=scroll]', '选「滚动」');
          if ((kind === 'next' || kind === 'more') && mode !== 'next') await click(panel, '#seg [data-mode=next]', '选「翻页」');
          const found = await panel.evaluate(() => !document.getElementById('go').disabled);
          if ((kind === 'next' || kind === 'more') && !found) { await click(panel, '#pick', '点「自己点下一页」'); await sleep(300); await click(page, NEXT_SEL[sc], '在网页上点下一页'); await sleep(600); }
          await click(panel, '#go', '开始');
          await panel.waitForFunction((() => { const s = document.body.dataset.state; return s ? ['end', 'stop', 'max'].includes(s) : /化完了|停了/.test(document.getElementById('status').textContent); }), null, { timeout: LIMIT });
        }
        r.rowsShown = await panel.evaluate(() => document.getElementById('blkN').textContent);
        // 0.3.0：人点过「开始」、化完没标黄，就自己下好了，不用再点导出
        // 状态写着「已下载」才等那份自己下的；没写就照旧点导出（不白等）
        const autoSaid = await panel.evaluate(() => document.body.dataset.dl === '1' || /已下载/.test(document.getElementById('status').textContent));
        const tw = Date.now();
        while (autoSaid && !r.autoDl && Date.now() - tw < 5000) await sleep(20);
        if (r.autoDl) {
          r.steps.push('（自己下好了）'); r.ms = r.autoDl.at - t0;
          const f = path.join(OUT, TOOL, r.scene + '.xlsx'); await r.autoDl.d.saveAs(f); r.file = f;
        } else { await sleep(300); r.file = await dl(panel, '#xlsx', r); }
        }
      } else if (TOOL === 'ids') {
        await panel.waitForSelector('#xlsx', { state: 'visible', timeout: 30000 });
        await panel.waitForFunction(() => document.querySelectorAll('.handsontable tbody tr').length > 0, null, { timeout: 30000 }).catch(() => {});
        if (kind === 'scroll') { await click(panel, '#infinateScroll', '勾「Infinite scroll」'); }
        if (kind === 'next' || kind === 'more') { await click(panel, '#nextButton', '点「Locate Next」'); await sleep(500); await page.bringToFront(); await click(page, NEXT_SEL[sc], '在网页上点下一页'); await sleep(800); }
        if (kind !== 'one') {
          await click(panel, '#startScraping', 'Start crawling');
          // 收工：Start 按钮变 Stop，再变回来（或出提示）
          await panel.waitForFunction((on) => [...document.querySelectorAll('button')].some((b) => b.offsetParent !== null && /Stop crawling/.test(b.textContent)) === on, true, { timeout: 8000 }).catch(() => {});
          await panel.waitForFunction((on) => [...document.querySelectorAll('button')].some((b) => b.offsetParent !== null && /Stop crawling/.test(b.textContent)) === on, false, { timeout: LIMIT, polling: 200 });
          r.note += (await panel.evaluate(() => document.body.innerText.match(/Pages scraped[\s\S]*?Working time: \S+/)?.[0].replace(/\s+/g, ' '))) + '；';
        }
        r.file = await dl(panel, '#xlsx', r);
      } else {
        await click(panel, '#btnDetect', 'Try another table（侦测）');
        await panel.waitForFunction(() => /\d+ rows|rows/.test(document.getElementById('previewCount').textContent) && !/No data/.test(document.getElementById('previewCount').textContent), null, { timeout: 20000 }).catch(() => {});
        if (kind === 'scroll') await click(panel, '#btnInfiniteScroll', 'Infinite scroll mode');
        if (kind === 'next' || kind === 'more') { await click(panel, '#btnLocateNext', 'Locate Next'); await sleep(600); await page.bringToFront(); await click(page, NEXT_SEL[sc], '在网页上点下一页'); await sleep(800); }
        if (kind === 'one') {
          // 单页也得点 Start 才能导出（导出按钮在爬完前是灰的）
          const dis = await panel.evaluate(() => document.getElementById('btnXLSX').disabled);
          if (dis) { await click(panel, '#btnStart', 'Start crawling'); }
        } else await click(panel, '#btnStart', 'Start crawling');
        await panel.waitForFunction(() => !document.getElementById('btnXLSX').disabled && document.getElementById('btnStop').disabled, null, { timeout: LIMIT });
        r.note += (await panel.evaluate(() => document.getElementById('statusMsg').textContent)) + '；';
        r.file = await dl(panel, '#btnXLSX', r);
      }
      r.ms = r.ms || Date.now() - t0;
      delete r.autoDl;
    } catch (e) { r.note += '出错：' + e.message.split('\n')[0]; r.ms = Date.now() - t0; delete r.autoDl; }
    r.pageErrors = errs.slice(0, 5);
    if (panel) {
      await panel.screenshot({ path: path.join(OUT, TOOL, sc + '-panel.png') }).catch(() => {});
      await panel.close().catch(() => {});
    }
    await page.screenshot({ path: path.join(OUT, TOOL, sc + '-page.png') }).catch(() => {});
    await page.close();
    console.log(JSON.stringify(r));
    results.push(r);
  }
  fs.writeFileSync(path.join(OUT, TOOL, 'run.json'), JSON.stringify({ onboardClicks: onboard, results }, null, 1));
  await ctx.close(); server.close();

  async function dl(panel, sel, r) {
    r.clicks++; r.steps.push('导出 Excel');
    const [d] = await Promise.all([panel.waitForEvent('download', { timeout: 30000 }), panel.locator(sel).first().click()]);
    const f = path.join(OUT, TOOL, r.scene + '.xlsx'); await d.saveAs(f); return f;
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
