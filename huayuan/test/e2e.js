// 化缘僧端到端测试：真把插件装进 Chromium，在本地示例站上从头点到尾。
// 用法：LANG=C.UTF-8 PW_CHANNEL=chromium node huayuan/test/e2e.js [截图目录]
//       （LANG 要是 UTF-8：沙盒默认 C 语言环境下 Chromium 把中文下载文件名换成 download，真电脑上没这事）
// 说明：Playwright 点不了工具栏图标，所以测试版 manifest 额外给了 localhost 的读取权限，
//       再从后台直接调用 openPanel(tab)（跟点图标走同一个函数）。正式包只有 activeTab。
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'huayuan-shots'));
fs.mkdirSync(SHOTS, { recursive: true });
const PORT = Number(process.env.PORT) || 8765, BASE = `http://127.0.0.1:${PORT}`;
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
    await panel.setViewportSize({ width: 400, height: 820 }); // 跟侧边栏差不多宽
    const opt = await sw.evaluate((id) => chrome.sidePanel.getOptions({ tabId: id }), tabId);
    if (!opt || !opt.enabled || !String(opt.path).includes('tab=' + tabId)) throw new Error('侧边栏没给这个标签页设上：' + JSON.stringify(opt));
    await panel.waitForLoadState('domcontentloaded');
    await panel.waitForSelector('body[data-ready]', { timeout: 30000 });
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
  // 介绍页用的图：网页 + 右边侧栏，拼成一张「浏览器窗口」
  async function duo(page, panel, name, dark) {
    const scheme = dark ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: scheme }); await panel.emulateMedia({ colorScheme: scheme });
    const vp = page.viewportSize();
    await page.setViewportSize({ width: 880, height: 820 });
    await page.waitForTimeout(300);
    const a = (await page.screenshot()).toString('base64');
    const b = (await panel.screenshot()).toString('base64');
    await page.setViewportSize(vp);
    const comp = await ctx.newPage();
    await comp.setViewportSize({ width: 1281, height: 820 });
    await comp.setContent(`<body style="margin:0;display:flex;background:${dark ? '#000' : '#fff'}"><img src="data:image/png;base64,${a}" style="width:880px;height:820px"><i style="width:1px;background:${dark ? '#38383A' : '#D2D2D7'}"></i><img src="data:image/png;base64,${b}" style="width:400px;height:820px"></body>`);
    await comp.screenshot({ path: path.join(SHOTS, name + '.png') });
    await comp.close();
    await page.emulateMedia({ colorScheme: 'light' }); await panel.emulateMedia({ colorScheme: 'light' });
  }
  const fresh = () => sw.evaluate(() => chrome.storage.local.clear()); // 当「第一次用」
  const saveDl = async (d) => { const f = path.join(SHOTS, d.suggestedFilename()); await d.saveAs(f); return f; };
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
  // 表横向放不下：右缘渐隐；滚到头渐隐去掉；一格不超过 176 宽（省略号），不切半个字
  ok(await panel.evaluate(() => document.getElementById('gridWrap').classList.contains('more-r')), '表横向放不下，右缘有渐隐');
  ok(await panel.evaluate(() => Math.max(...[...document.querySelectorAll('#grid td .c')].map((e) => e.getBoundingClientRect().width)) <= 176.5), '格子最宽 176，超出用省略号');
  await panel.evaluate(() => { const sc = document.getElementById('gridScroll'); sc.scrollLeft = sc.scrollWidth; });
  await panel.waitForFunction(() => !document.getElementById('gridWrap').classList.contains('more-r'));
  ok(true, '滚到最右，渐隐自己去掉');
  await panel.evaluate(() => { document.getElementById('gridScroll').scrollLeft = 0; });
  ok(await panel.locator('.bottom .qs-foot').count() === 0 && await panel.locator('#pop .qs-foot').count() === 1, '侧栏底部只留下载那一排，页脚收进设置浮层');
  await page.screenshot({ path: path.join(SHOTS, 'page-table-highlight.png') });
  await panel.screenshot({ path: path.join(SHOTS, 'panel-table-start.png') });
  await panel.emulateMedia({ colorScheme: 'dark' }); await page.emulateMedia({ colorScheme: 'dark' });
  await panel.screenshot({ path: path.join(SHOTS, 'panel-table-start-dark.png') });
  await page.screenshot({ path: path.join(SHOTS, 'page-table-highlight-dark.png') });
  await panel.emulateMedia({ colorScheme: 'light' }); await page.emulateMedia({ colorScheme: 'light' });
  await duo(page, panel, 'duo-table-start', false);
  await duo(page, panel, 'duo-table-start-dark', true);
  let auto = panel.waitForEvent('download', { timeout: 90000 });
  await crawl(panel);
  ok((await blk(panel)).startsWith('100'), '翻完 5 页，收 100 行：' + await status(panel));
  let f = await saveDl(await auto);
  ok(/已下载/.test(await status(panel)) && /^化缘_127\.0\.0\.1_\d{8}-\d{4}\.xlsx$/.test(path.basename(f)), '点了开始、没标黄：化完自己下好了，不用再点导出：' + path.basename(f));
  ok(py("import sys,openpyxl;print(openpyxl.load_workbook(sys.argv[1]).active.max_row-1)", f) === '100', '自己下的 xlsx 100 行');
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
  await panel.setViewportSize({ width: 760, height: 820 }); // 侧栏拉宽了再拖（窄的时候第一列躲在序号列后面，拖不准）
  const src = panel.locator('#grid th[data-key]').filter({ hasText: '邮箱' });
  const dst = panel.locator('#grid th[data-key]').first();
  const bb = await dst.boundingBox();
  await src.dragTo(dst, { targetPosition: { x: 4, y: bb.height / 2 } });
  ok((await heads(panel))[0] === '邮箱', '拖到第一列：' + (await heads(panel)).slice(0, 3).join(' | '));
  await panel.screenshot({ path: path.join(SHOTS, 'panel-table-done.png') });
  await panel.setViewportSize({ width: 400, height: 820 });
  f = await download(panel, '#xlsx');
  ok(/^化缘_127\.0\.0\.1_\d{8}-\d{4}\.xlsx$/.test(path.basename(f)), '下载文件名是中文：' + path.basename(f));
  let out = py("import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;r=list(ws.values);print(len(r)-1,'|'.join(str(x) for x in r[0]),'|'.join(str(x) for x in r[1]))", f);
  console.log('    xlsx:', out);
  ok(out.startsWith('100 邮箱|') && out.includes('对接人') && !out.includes('编号'), 'xlsx 100 行，改名/删列/顺序都带上');
  f = await download(panel, '#csv');
  const csv = fs.readFileSync(f, 'utf8');
  ok(csv.charCodeAt(0) === 0xFEFF && csv.trim().split('\r\n').length === 101, 'csv 带 BOM，101 行（含表头）');
  const d = await panel.evaluate(() => { const s = new QSSheet(); const m = { 'a|t': { type: 't' } }; s.add({ keys: ['a|t'], meta: m, rows: [{ 'a|t': '1' }, { 'a|t': '2' }, { 'a|t': '2' }] }); s.add({ keys: ['a|t'], meta: m, rows: [{ 'a|t': '3' }, { 'a|t': '1' }] }); return [s.rows.length, s.dupes]; });
  ok(d[0] === 3 && d[1] === 2, '去重：同页重复、换页又出现的都去掉');
  await panel.close(); await page.close();

  console.log('1b. 同一个网站第二回：照上次的改法，自己翻、自己下');
  ({ page, panel } = await openOn(`${BASE}/demo/table.html`, 'table-2'));
  auto = panel.waitForEvent('download', { timeout: 90000 });
  h = await heads(panel);
  ok(h[0] === '邮箱' && h.includes('对接人') && !h.includes('编号'), '列名、删列、顺序照上次：' + h.join(' | '));
  ok(/照上次的改法/.test(await panel.locator('#meta').textContent()), '写明照上次办了啥：' + await panel.locator('#meta').textContent());
  f = await saveDl(await auto);
  // 上回最后点的是 CSV，这回自己下的也是 CSV
  const lines = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').trim().split('\r\n');
  out = (lines.length - 1) + ' ' + lines[0];
  ok(f.endsWith('.csv') && out.startsWith('100 邮箱,') && out.includes('对接人') && !out.includes('编号'), '不点开始、不点下载，表到手（格式照上回的 CSV）：' + path.basename(f) + ' ' + out);
  await panel.screenshot({ path: path.join(SHOTS, 'panel-table-second.png') });
  await panel.locator('#meta button', { hasText: '还原' }).click();
  await panel.waitForFunction(() => !/照上次/.test(document.getElementById('meta').textContent));
  h = await heads(panel);
  ok(h.includes('编号') && h.includes('联系人') && h[0] !== '邮箱', '点「还原」回到自己猜的样子：' + h.join(' | '));
  const left = await sw.evaluate(() => chrome.storage.local.get('site:127.0.0.1'));
  ok(!left['site:127.0.0.1'], '还原后这个网站的记性忘干净');
  await panel.close(); await page.close();

  // ---------- 2. 卡片 + 不刷新翻页 ----------
  console.log('2. 销售线索（卡片，Ajax 翻页）');
  await fresh();
  ({ page, panel } = await openOn(`${BASE}/demo/cards.html`, 'cards'));
  await panel.waitForSelector('#ctl:not([hidden])');
  ok((await rows(panel)) === 12, '认出卡片，12 张');
  h = await heads(panel);
  ok(['电话', '邮箱', '城市'].every((x) => h.includes(x)), '「电话：」这种前缀变成列名：' + h.join(' | '));
  const firstPhone = await panel.evaluate(() => { const i = [...document.querySelectorAll('#grid th[data-key]')].findIndex((t) => t.textContent.includes('电话')); return document.querySelector('#grid tbody tr').children[i + 1].textContent; });
  ok(/^138-0000-\d{4}$/.test(firstPhone), '值里的前缀去掉了：' + firstPhone);
  auto = panel.waitForEvent('download', { timeout: 90000 });
  await crawl(panel);
  ok((await blk(panel)).startsWith('48'), '翻完 4 页，48 条：' + await status(panel));
  f = await saveDl(await auto);
  ok(py("import sys,openpyxl;print(openpyxl.load_workbook(sys.argv[1]).active.max_row-1)", f) === '48', '化完自己下好 48 条');
  await panel.waitForTimeout(2600); // 等「已进下载」提示条退了再截图
  await panel.screenshot({ path: path.join(SHOTS, 'panel-cards-done.png') });
  await panel.emulateMedia({ colorScheme: 'dark' });
  await panel.screenshot({ path: path.join(SHOTS, 'panel-cards-dark.png') });
  await duo(page, panel, 'duo-cards-done-dark', true);
  await panel.close(); await page.close();

  // ---------- 3. 无限滚动 ----------
  console.log('3. 商品列表（无限滚动）');
  await fresh();
  ({ page, panel } = await openOn(`${BASE}/demo/scroll.html`, 'scroll'));
  ok(await panel.locator('#seg button[data-mode=scroll][aria-pressed=true]').count() === 1, '没有下一页，试滚一下出了新货，自动选「滚动」');
  ok(/第 \d+ 屏/.test(await status(panel)) || /化完了/.test(await status(panel)), '不用点开始，自己接着滚：' + await status(panel));
  const t0 = Date.now();
  await panel.waitForFunction(() => /化完了|停了/.test(document.getElementById('status').textContent), null, { timeout: 90000 });
  ok((await blk(panel)).startsWith('120'), '滚到底，120 件：' + await status(panel) + `（收尾 ${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
  h = await heads(panel);
  ok(h.includes('图片') && h.includes('价格') && h.indexOf('图片') === h.length - 1, '图片列放最后：' + h.join(' | '));
  await panel.screenshot({ path: path.join(SHOTS, 'panel-scroll-done.png') });
  await duo(page, panel, 'duo-scroll-done', false);
  f = await download(panel, '#xlsx');
  out = py("import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;print(ws.max_row-1)", f);
  ok(out === '120', 'xlsx 120 行');
  // 换一块
  const n0 = await blk(panel);
  await panel.click('#swap');
  await panel.waitForFunction((n) => document.getElementById('blkN').textContent !== n, n0);
  ok(true, '换一块：' + n0 + ' → ' + await blk(panel));
  await panel.close(); await page.close();
  // 慢吞吞的无限滚动：1.5 秒才来货、也不写「加载中」。试滚半秒看不出来，后面盯着的 5 秒要接住
  // 这一块上面刚下过一回（第二回用），所以滚完也自己下
  ({ page, panel } = await openOn(`${BASE}/demo/scroll.html?slow=1`, 'scroll-slow'));
  auto = panel.waitForEvent('download', { timeout: 90000 });
  await panel.waitForFunction(() => document.querySelector('#seg [data-mode=scroll][aria-pressed=true]'), null, { timeout: 8000 });
  await panel.waitForFunction(() => /化完了|停了/.test(document.getElementById('status').textContent), null, { timeout: 90000 });
  ok((await blk(panel)).startsWith('120'), '慢加载的无限滚动：试滚没看出来，随后自己改成滚动收齐 120 件：' + await status(panel));
  f = await saveDl(await auto);
  ok(py("import sys,openpyxl;print(openpyxl.load_workbook(sys.argv[1]).active.max_row-1)", f) === '120', '第二回用：滚完自己下好 120 件');
  await panel.close(); await page.close();

  // ---------- 4. 手动指定下一页 + 中途停 ----------
  console.log('4. 手动指定下一页、中途停');
  await fresh();
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

  // ---------- 5. 列名、值清洗、xlsx 格式（直接喂数据） ----------
  console.log('5. 列名和值清洗');
  ({ page, panel } = await openOn(`${BASE}/demo/table.html`, 'units'));
  const u = await panel.evaluate(() => {
    const s = new QSSheet();
    const w = new QSSheet();
    w.add({ keys: ['x|t', 'y|t', 'z|t'], meta: { 'x|t': { type: 't', hint: 'foo' }, 'y|t': { type: 't' }, 'z|t': { type: 't', hint: '公司' } }, rows: [1, 2, 3, 4].map((i) => ({ 'x|t': 'a' + i, 'y|t': 'b' + i, 'z|t': 'c' + i })) });
    const weak = w.visible().map((c) => c.name + ':' + (c.weak ? 1 : 0)).join(',');
    w.rename('x|t', '型号');
    const weak2 = w.visible().filter((c) => c.weak).length;
    const keys = ['a|href', 'img|src', 'h3>a|t', 'p.price|t', 'p.orig|t', 'p.rate|t', 'p.loc|t', 'm|href', 'm|t'];
    const meta = { 'a|href': { type: 'href' }, 'img|src': { type: 'src' }, 'h3>a|t': { type: 't', hint: 'title' }, 'p.price|t': { type: 't', hint: 'price' }, 'p.orig|t': { type: 't', hint: 'orig' }, 'p.rate|t': { type: 't', hint: 'rate' }, 'p.loc|t': { type: 't', hint: 'loc' }, 'm|href': { type: 'href' }, 'm|t': { type: 't', hint: 'mail' } };
    const rows = [];
    for (let i = 0; i < 6; i++) rows.push({ 'a|href': 'http://x/' + i, 'img|src': 'http://x/' + i + '.png', 'h3>a|t': '货' + i, 'p.price|t': '¥' + (100 + i), 'p.orig|t': '¥' + (200 + i), 'p.rate|t': '评分 4.' + (i % 2 ? 5 : 0), 'p.loc|t': '上海', 'm|href': 'mailto:a' + i + '@x.com', 'm|t': 'a' + i + '@x.com' });
    rows[0]['p.loc|t'] = '杭州';
    s.add({ keys, meta, rows });
    const aoa = s.toAOA();
    const blob = QSExport.xlsx(aoa, 't');
    return blob.arrayBuffer().then((b) => ({ weak, weak2, head: aoa[0], r1: aoa[1], b64: btoa(String.fromCharCode(...new Uint8Array(b))) }));
  });
  ok(JSON.stringify(u.head) === JSON.stringify(['名称', '价格', '原价', '评分', '地区', '邮箱', '链接', '图片']), '列名：' + u.head.join(' | '));
  ok(u.weak === 'foo:1,字段1:1,公司:0' && u.weak2 === 1, '拿不准的列名标出来（照抄英文、字段N），改了名就不黄：' + u.weak);
  ok(u.r1[3] === '4.0', '「评分 4.0」拆成列名，值留 4.0');
  const xf = path.join(SHOTS, 'units.xlsx'); fs.writeFileSync(xf, Buffer.from(u.b64, 'base64'));
  out = py("import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;c=ws['D2'];print(c.value,c.number_format)", xf);
  ok(out === '4.0 0.0', 'xlsx 里 4.0 带一位小数格式：' + out);
  await panel.close(); await page.close();

  // ---------- 6. 进不去的页面：给示例 ----------
  console.log('6. 浏览器自带页面');
  ({ page, panel } = await openOn('chrome://version/', 'chrome'));
  await panel.waitForSelector('#empty:not([hidden])');
  ok((await panel.locator('#emptyT').textContent()).includes('进不去') && await panel.locator('#tryDemo').isVisible(), '说清楚进不去，给「用示例试试」');
  ok(await panel.locator('#xlsx').isDisabled(), '还没表，下载是灰的');
  await panel.screenshot({ path: path.join(SHOTS, 'panel-noaccess.png') });
  await panel.click('#tryDemo');
  ok((await rows(panel)) === 8 && !(await panel.locator('#xlsx').isDisabled()), '「用示例试试」一点就出示例表，能下来看看');
  await panel.close(); await page.close();

  // ---------- 7. 网页关了：表还在 ----------
  console.log('7. 化到一半网页关了');
  await fresh();
  ({ page, panel } = await openOn(`${BASE}/demo/cards.html`, 'gone'));
  await page.close();
  await panel.waitForSelector('#perm:not([hidden])');
  ok(/网页关了/.test(await panel.locator('#perm').textContent()) && (await rows(panel)) === 12 && !(await panel.locator('#xlsx').isDisabled()), '话放在出事的地方，已收的 12 行照样能下：' + await panel.locator('#perm').textContent());
  await panel.close();

  await ctx.close(); server.close();
  if (errors.length) { console.log('报错：\n' + errors.join('\n')); process.exit(1); }
  console.log('全部通过，零报错。截图在', SHOTS);
}
main().catch((e) => { console.error(e); console.log(errors.join('\n')); process.exit(1); });
