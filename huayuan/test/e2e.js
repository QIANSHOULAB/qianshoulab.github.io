// 化缘僧端到端测试：真把插件装进 Chromium，在本地示例站上从头点到尾。
// 用法：node huayuan/test/e2e.js [截图目录]
// 说明：Playwright 点不了工具栏图标，所以测试版 manifest 额外给了 localhost 的读取权限，
//       再从后台直接调用 openPanel(tab)（跟点图标走同一个函数）。正式包只有 activeTab。
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'huayuan-shots'));
fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8765, BASE = `http://127.0.0.1:${PORT}`;
const errors = [];
const ok = (c, m) => { if (!c) throw new Error('✗ ' + m); console.log('  ✓ ' + m); };

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
  return new Promise((r) => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, BASE).pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(PORT, '127.0.0.1', () => r(s));
  });
}

function testBuild() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-ext-'));
  fs.cpSync(path.join(ROOT, 'extension'), dir, { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  m.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  return dir;
}

async function main() {
  const server = await serve();
  const ext = testBuild();
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'hy-prof-')), {
    headless: !process.env.HEADED, channel: process.env.PW_CHANNEL || undefined, acceptDownloads: true, viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  const watch = (p, tag) => {
    p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
  };
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  console.log('扩展已加载', extId);

  async function openOn(url, tag) {
    const page = await ctx.newPage(); watch(page, tag);
    await page.goto(url); await page.waitForLoadState('networkidle');
    await page.bringToFront();
    const tabId = await sw.evaluate(async (u) => { const t = (await chrome.tabs.query({})).find((x) => x.url === u) || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]; return t.id; }, page.url());
    const wait = ctx.waitForEvent('page', (p) => p.url().includes('panel.html'));
    await sw.evaluate(async (id) => { const t = await chrome.tabs.get(id); await globalThis.openPanel(t); }, tabId);
    const panel = await wait; watch(panel, tag + '-panel');
    await panel.setViewportSize({ width: 880, height: 640 }); // 跟真窗口一样大
    await panel.waitForLoadState('domcontentloaded');
    return { page, panel, tabId };
  }
  const rows = (panel) => panel.evaluate(() => document.querySelectorAll('#grid tbody tr').length);
  const heads = (panel) => panel.evaluate(() => [...document.querySelectorAll('#grid th[data-key] .nm')].map((e) => e.textContent));
  const status = (panel) => panel.locator('#status').textContent();
  const blk = (panel) => panel.locator('#blkN').textContent();
  async function crawl(panel, timeout = 90000) {
    await panel.click('#go');
    await panel.waitForFunction(() => /化完了|停了/.test(document.getElementById('status').textContent), null, { timeout });
  }
  async function download(panel, btn) {
    const [d] = await Promise.all([panel.waitForEvent('download'), panel.click(btn)]);
    const f = path.join(SHOTS, d.suggestedFilename()); await d.saveAs(f); return f;
  }
  const py = (code, f) => execFileSync('python3', ['-c', code, f], { encoding: 'utf8' }).trim();

  // ---------- 1. 表格 + 整页跳转翻页 ----------
  console.log('1. 客户名单（表格，5 页整页跳转）');
  let { page, panel } = await openOn(`${BASE}/demo/table.html`, 'table');
  await panel.waitForSelector('#ctl:not([hidden])');
  ok((await rows(panel)) === 20, '一打开就认出表格，20 行');
  let h = await heads(panel);
  ok(['编号', '公司', '联系人', '电话', '邮箱', '城市'].every((x) => h.includes(x)), '列名直接用表头：' + h.join(' | '));
  ok(await panel.locator('#seg button[data-mode=next][aria-pressed=true]').count() === 1, '自动选了「翻页」');
  ok((await panel.locator('#hint').textContent()).includes('下一页'), '自动找到下一页按钮');
  ok(await page.locator('[data-qs-list]').count() === 1 && await page.locator('[data-qs-next]').count() === 1, '网页上高亮了名单和下一页');
  await page.screenshot({ path: path.join(SHOTS, 'page-table-highlight.png') });
  await panel.screenshot({ path: path.join(SHOTS, 'panel-table-start.png') });
  await panel.emulateMedia({ colorScheme: 'dark' }); await page.emulateMedia({ colorScheme: 'dark' });
  await panel.screenshot({ path: path.join(SHOTS, 'panel-table-start-dark.png') });
  await page.screenshot({ path: path.join(SHOTS, 'page-table-highlight-dark.png') });
  await panel.emulateMedia({ colorScheme: 'light' }); await page.emulateMedia({ colorScheme: 'light' });
  await crawl(panel);
  ok((await blk(panel)).startsWith('100'), '翻完 5 页，收 100 行：' + await status(panel));
  ok(page.url().includes('p=5'), '网页停在第 5 页');
  // 改列：删「操作」链接列、改名、拖顺序
  const before = await heads(panel);
  if (before.includes('操作')) { await panel.hover('#grid th[data-key] >> text=操作'); }
  const idCol = panel.locator('#grid th[data-key]').filter({ hasText: '编号' });
  await idCol.hover(); await idCol.locator('.x').click();
  ok(!(await heads(panel)).includes('编号'), '删掉一列');
  await panel.locator('#grid th[data-key] .nm', { hasText: /^联系人$/ }).click();
  await panel.keyboard.press('Control+A'); await panel.keyboard.type('对接人'); await panel.keyboard.press('Enter');
  ok((await heads(panel)).includes('对接人'), '改列名');
  const src = panel.locator('#grid th[data-key]').filter({ hasText: '邮箱' });
  const dst = panel.locator('#grid th[data-key]').first();
  const bb = await dst.boundingBox();
  await src.dragTo(dst, { targetPosition: { x: 4, y: bb.height / 2 } });
  ok((await heads(panel))[0] === '邮箱', '拖到第一列：' + (await heads(panel)).slice(0, 3).join(' | '));
  await panel.screenshot({ path: path.join(SHOTS, 'panel-table-done.png') });
  let f = await download(panel, '#xlsx');
  let out = py("import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;r=list(ws.values);print(len(r)-1,'|'.join(str(x) for x in r[0]),'|'.join(str(x) for x in r[1]))", f);
  console.log('    xlsx:', out);
  ok(out.startsWith('100 邮箱|') && out.includes('对接人') && !out.includes('编号'), 'xlsx 100 行，改名/删列/顺序都带上');
  f = await download(panel, '#csv');
  const csv = fs.readFileSync(f, 'utf8');
  ok(csv.charCodeAt(0) === 0xFEFF && csv.trim().split('\r\n').length === 101, 'csv 带 BOM，101 行（含表头）');
  const d = await panel.evaluate(() => { const s = new QSSheet(); const m = { 'a|t': { type: 't' } }; s.add({ keys: ['a|t'], meta: m, rows: [{ 'a|t': '1' }, { 'a|t': '2' }, { 'a|t': '2' }] }); s.add({ keys: ['a|t'], meta: m, rows: [{ 'a|t': '3' }, { 'a|t': '1' }] }); return [s.rows.length, s.dupes]; });
  ok(d[0] === 3 && d[1] === 2, '去重：同页重复、换页又出现的都去掉');
  await panel.close(); await page.close();

  // ---------- 2. 卡片 + 不刷新翻页 ----------
  console.log('2. 销售线索（卡片，Ajax 翻页）');
  ({ page, panel } = await openOn(`${BASE}/demo/cards.html`, 'cards'));
  await panel.waitForSelector('#ctl:not([hidden])');
  ok((await rows(panel)) === 12, '认出卡片，12 张');
  h = await heads(panel);
  ok(['电话', '邮箱', '城市'].every((x) => h.includes(x)), '「电话：」这种前缀变成列名：' + h.join(' | '));
  const firstPhone = await panel.evaluate(() => { const i = [...document.querySelectorAll('#grid th[data-key]')].findIndex((t) => t.textContent.includes('电话')); return document.querySelector('#grid tbody tr').children[i + 1].textContent; });
  ok(/^138-0000-\d{4}$/.test(firstPhone), '值里的前缀去掉了：' + firstPhone);
  await crawl(panel);
  ok((await blk(panel)).startsWith('48'), '翻完 4 页，48 条：' + await status(panel));
  await panel.screenshot({ path: path.join(SHOTS, 'panel-cards-done.png') });
  await panel.emulateMedia({ colorScheme: 'dark' });
  await panel.screenshot({ path: path.join(SHOTS, 'panel-cards-dark.png') });
  await panel.close(); await page.close();

  // ---------- 3. 无限滚动 ----------
  console.log('3. 商品列表（无限滚动）');
  ({ page, panel } = await openOn(`${BASE}/demo/scroll.html`, 'scroll'));
  await panel.waitForSelector('#ctl:not([hidden])');
  ok((await rows(panel)) === 24, '认出商品，24 件');
  ok(await panel.locator('#seg button[data-mode=scroll][aria-pressed=true]').count() === 1, '没有下一页，自动选「滚动」');
  h = await heads(panel);
  ok(h.includes('图片') && h.includes('价格'), '图片列、价格列：' + h.join(' | '));
  await crawl(panel);
  ok((await blk(panel)).startsWith('120'), '滚到底，120 件：' + await status(panel));
  await panel.screenshot({ path: path.join(SHOTS, 'panel-scroll-done.png') });
  f = await download(panel, '#xlsx');
  out = py("import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;print(ws.max_row-1)", f);
  ok(out === '120', 'xlsx 120 行');
  // 换一块
  const n0 = await blk(panel);
  await panel.click('#swap');
  await panel.waitForFunction((n) => document.getElementById('blkN').textContent !== n, n0);
  ok(true, '换一块：' + n0 + ' → ' + await blk(panel));
  await panel.close(); await page.close();

  // ---------- 4. 手动指定下一页 + 中途停 ----------
  console.log('4. 手动指定下一页、中途停');
  ({ page, panel } = await openOn(`${BASE}/demo/table.html`, 'pick'));
  await panel.waitForSelector('#ctl:not([hidden])');
  await panel.click('#pick');
  await page.waitForSelector('#qs-pick-tip');
  await page.bringToFront();
  await page.click('.pager a:has-text("下一页")');
  await panel.waitForFunction(() => document.getElementById('hint').textContent.includes('下一页'));
  ok(page.url().endsWith('table.html'), '点选时网页没跳走');
  await panel.click('#go');
  await panel.waitForFunction(() => /第 2 页/.test(document.getElementById('status').textContent), null, { timeout: 20000 });
  await panel.click('#go');
  await panel.waitForFunction(() => /停了/.test(document.getElementById('status').textContent), null, { timeout: 20000 });
  ok(true, '用指定的按钮翻页后喊停：' + await status(panel));
  await panel.close();
  await page.waitForTimeout(300);
  ok(await page.locator('[data-qs-list],[data-qs-next]').count() === 0, '关掉面板，网页上的高亮清干净');
  await page.close();

  // ---------- 5. 进不去的页面：给示例 ----------
  console.log('5. 浏览器自带页面');
  ({ page, panel } = await openOn('chrome://version/', 'chrome'));
  await panel.waitForSelector('#empty:not([hidden])');
  ok((await panel.locator('#emptyT').textContent()).includes('进不去') && (await rows(panel)) === 8, '说清楚进不去，并摆出示例表');
  ok(await panel.locator('#xlsx').isDisabled(), '示例不让导出');
  await panel.screenshot({ path: path.join(SHOTS, 'panel-noaccess.png') });
  await panel.close(); await page.close();

  await ctx.close(); server.close();
  if (errors.length) { console.log('报错：\n' + errors.join('\n')); process.exit(1); }
  console.log('全部通过，零报错。截图在', SHOTS);
}
main().catch((e) => { console.error(e); console.log(errors.join('\n')); process.exit(1); });
