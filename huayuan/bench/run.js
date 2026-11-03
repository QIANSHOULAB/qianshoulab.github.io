// 化缘僧比武 · 跑分脚本：把我们的和对手的插件各装进 Playwright 的 Chromium，按「真人最少点几下」的路线跑每个场景，
// 记点击次数、用时，下载 xlsx，截面板图。准确度由 score.py 对标准答案打分。
// 用法：node huayuan/bench/run.js <输出目录> <工具:ours|ids|ods> [插件目录] [场景,逗号分隔]
//   ours 默认用 huayuan/extension；ids = Open Scraper（Instant Data Scraper 1.4.1 反混淆分支）；ods = Open Data Scraper（IDS 克隆）
// 需要先 node huayuan/bench/gen.js 生成测试站。
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const SITE = path.join(__dirname, 'site');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'hy-bench'));
const TOOL = process.argv[3] || 'ours';
const EXT = path.resolve(process.argv[4] || path.join(__dirname, '..', 'extension'));
const ALL = ['a-table300', 'b-cards', 'c-paged', 'd-ajax', 'e-loadmore', 'f-infinite'];
const ONLY = (process.argv[5] || ALL.join(',')).split(',');
const PORT = 8790, BASE = `http://127.0.0.1:${PORT}`;
const START = { 'c-paged': 'c-paged-1.html' };
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
      await panel.waitForLoadState('domcontentloaded');
      if (TOOL === 'ours') await panel.setViewportSize({ width: 880, height: 640 });
      if (TOOL === 'ids') await panel.setViewportSize({ width: 720, height: 690 });
      if (TOOL === 'ods') await panel.setViewportSize({ width: 1100, height: 800 });
      await sw.evaluate(async (id) => { await chrome.tabs.update(id, { active: true }); }, tabId).catch(() => {});

      if (TOOL === 'ours') {
        await panel.waitForSelector('#ctl:not([hidden])', { timeout: 20000 });
        const mode = await panel.evaluate(() => document.querySelector('#seg [aria-pressed=true]')?.dataset.mode);
        r.note += `自动选了 ${mode}；`;
        if (kind !== 'one') {
          // 自动没选对 → 真人要多点：选模式 / 点选下一页
          if (kind === 'scroll' && mode !== 'scroll') await click(panel, '#seg [data-mode=scroll]', '选「滚动」');
          if ((kind === 'next' || kind === 'more') && mode !== 'next') await click(panel, '#seg [data-mode=next]', '选「翻页」');
          const found = await panel.evaluate(() => !document.getElementById('go').disabled);
          if ((kind === 'next' || kind === 'more') && !found) { await click(panel, '#pick', '点「自己点下一页」'); await sleep(300); await click(page, NEXT_SEL[sc], '在网页上点下一页'); await sleep(600); }
          await click(panel, '#go', '开始');
          await panel.waitForFunction(() => /化完了|停了/.test(document.getElementById('status').textContent), null, { timeout: LIMIT });
        }
        await sleep(300);
        r.rowsShown = await panel.evaluate(() => document.getElementById('blkN').textContent);
        r.file = await dl(panel, '#xlsx', r);
      } else if (TOOL === 'ids') {
        await panel.waitForSelector('#content', { state: 'visible', timeout: 30000 });
        await panel.waitForFunction(() => document.querySelectorAll('#hot tbody tr').length > 0, null, { timeout: 30000 }).catch(() => {});
        if (kind === 'scroll') { await click(panel, '#infinateScroll', '勾「Infinite scroll」'); }
        if (kind === 'next' || kind === 'more') { await click(panel, '#nextButton', '点「Locate Next」'); await sleep(500); await click(page, NEXT_SEL[sc], '在网页上点下一页'); await sleep(800); }
        if (kind !== 'one') {
          await click(panel, '#startScraping', 'Start crawling');
          // 收工的信号：出错提示（找不到下一页 / 没有新行）或 Start 按钮重新出现
          await sleep(1500);
          await panel.waitForFunction(() => {
            const vis = (id) => { const e = document.getElementById(id); return e && e.offsetParent !== null && e.textContent.trim(); };
            return vis('error') || vis('finished') || (document.getElementById('startScraping').offsetParent !== null);
          }, null, { timeout: LIMIT });
          r.note += (await panel.evaluate(() => ['error', 'finished', 'stats'].map((i) => document.getElementById(i)?.textContent.trim()).join(' / '))) + '；';
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
      r.ms = Date.now() - t0;
    } catch (e) { r.note += '出错：' + e.message.split('\n')[0]; r.ms = Date.now() - t0; }
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
  fs.writeFileSync(path.join(OUT, TOOL, 'run.json'), JSON.stringify(results, null, 1));
  await ctx.close(); server.close();

  async function dl(panel, sel, r) {
    r.clicks++; r.steps.push('导出 Excel');
    const [d] = await Promise.all([panel.waitForEvent('download', { timeout: 30000 }), panel.locator(sel).first().click()]);
    const f = path.join(OUT, TOOL, r.scene + '.xlsx'); await d.saveAs(f); return f;
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
