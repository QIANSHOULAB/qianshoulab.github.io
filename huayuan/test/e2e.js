// 化缘僧端到端测试：真把插件装进 Chromium，在本地示例站上从头点到尾。中文、英文各跑一遍（HY_LANG=zh|en，默认 zh）。
// 用法：LANG=C.UTF-8 PW_CHANNEL=chromium HY_LANG=en node huayuan/test/e2e.js [截图目录]
//   zh：浏览器 locale zh-CN，第一次打开侧栏照样是英文（默认英文，不跟浏览器），点右上角「中文」，后面一直中文（记住了）；示例站 ?lang=zh
//   en：浏览器 locale en-US，不点切换，全程英文；示例站 ?lang=en
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
const LANG = process.env.HY_LANG === 'en' ? 'en' : 'zh';
// 两种语言下各自该看到的东西（示例站的表头、插件起的列名、状态字）
const X = {
  zh: { locale: 'zh-CN', q: '?lang=zh', table: ['编号', '公司', '联系人', '电话', '邮箱', '城市'], id: '编号', contact: '联系人', renamed: '对接人', email: '邮箱',
    cardHeads: ['电话', '邮箱', '城市'], phone: /^138-0000-\d{4}$/, image: '图片', price: '价格', file: /^化缘_127\.0\.0\.1_\d{8}-\d{4}\.(xlsx|csv)$/,
    pagerNext: '.pager a:has-text("下一页")', hintNext: '下一页', page2: /第 2 页/, units: ['名称', '价格', '原价', '评分', '地区', '邮箱', '链接', '图片'], weak: 'foo:1,字段1:1,公司:0',
    noAccess: '进不去', remembered: /照上次的改法/, undo: '还原', gone: /网页关了/, dlWord: /已下载/, extName: '化缘僧 · 过路留名，见网扒皮', demoFile: /^化缘_示例_/,
    fb: '提意见', fbSubject: '[千手院反馈] 化缘僧 0.4.1', fbFirst: ['哪里不好用：', '', '想要什么：', '', '别的：'] },
  en: { locale: 'en-US', q: '?lang=en', table: ['ID', 'Company', 'Contact', 'Phone', 'Email', 'City'], id: 'ID', contact: 'Contact', renamed: 'Point of contact', email: 'Email',
    cardHeads: ['Phone', 'Email', 'City'], phone: /^\+1 555-01\d{2}$/, image: 'Image', price: 'Price', file: /^Huayuan_127\.0\.0\.1_\d{8}-\d{4}\.(xlsx|csv)$/,
    pagerNext: '.pager a:has-text("Next")', hintNext: 'Next', page2: /Page 2 /, units: ['Name', 'Price', 'Original price', '评分', 'Location', 'Email', 'Link', 'Image'], weak: 'foo:1,Field 1:1,公司:0',
    noAccess: 'off-limits', remembered: /Same as last time/, undo: 'Undo', gone: /page closed/, dlWord: /downloaded/, extName: 'Huayuan · List Grabber', demoFile: /^Huayuan_Sample_/,
    fb: 'Feedback', fbSubject: '[QIANSHOU feedback] Huayuan · List Grabber 0.4.1', fbFirst: ['What’s not working:', '', 'What you wish it did:', '', 'Anything else:'] },
}[LANG];
const DONE = () => ['end', 'stop', 'max'].includes(document.body.dataset.state);

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
    locale: X.locale, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${X.locale}`],
  });
  const watch = (p, tag) => {
    p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
  };
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  console.log('扩展已加载', extId, '语言', LANG);
  // 插件名、说明跟浏览器语言走（_locales，浏览器自己的规矩）
  const extName = await sw.evaluate(() => chrome.i18n.getMessage('extName'));
  ok(extName === X.extName, '浏览器 ' + X.locale + ' 下插件名：' + extName);

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
  const waitDone = (panel, timeout = 90000) => panel.waitForFunction(DONE, null, { timeout });
  const blk = (panel) => panel.locator('#blkN').textContent();
  async function crawl(panel, timeout = 90000) {
    await panel.click('#go');
    await waitDone(panel, timeout);
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
  // 提意见：点一下，拦下浏览器要交给邮件程序的 mailto 导航（context 的 request 事件），拆出收件人、标题、正文，逐项核对
  const VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension/manifest.json'), 'utf8')).version;
  async function feedback(pg, sel, want) {
    const req = ctx.waitForEvent('request', { predicate: (r) => r.url().startsWith('mailto:'), timeout: 15000 });
    await pg.click(sel);
    const u = (await req).url();
    const [to, qs] = [u.slice(7, u.indexOf('?')), u.slice(u.indexOf('?') + 1)];
    const q = Object.fromEntries(qs.split('&').map((kv) => [kv.slice(0, kv.indexOf('=')), decodeURIComponent(kv.slice(kv.indexOf('=') + 1))]));
    const lines = q.body.split(/\r?\n/);
    ok(/^[\x21-\x7e]+$/.test(u), 'mailto 整串都编过码（没有裸中文、空格、换行）');
    ok(to === 'oilsongchengmin@gmail.com', '收件人：' + to);
    ok(q.subject === want.subject, '标题：' + q.subject);
    ok(want.first.every((x, i) => lines[i] === x), '正文先三行空着的提示：' + JSON.stringify(lines.slice(0, want.first.length)));
    const last = lines[lines.length - 1];
    ok(new RegExp('^' + VER.replace(/\./g, '\\.') + ' · Linux · Chromium \\d+$').test(last) && lines[lines.length - 2] === '——', '正文最后一行带版本和设备：' + last);
    return { to, subject: q.subject, last };
  }
  const FB = [];

  // 当「第一次用」：记性全清，只留语言（语言是人选过的，换个场景不该忘）
  const fresh = () => sw.evaluate(async () => { const { lang } = await chrome.storage.local.get('lang'); await chrome.storage.local.clear(); if (lang) await chrome.storage.local.set({ lang }); });
  const saveDl = async (d) => { const f = path.join(SHOTS, d.suggestedFilename()); await d.saveAs(f); return f; };
  const py = (code, f) => execFileSync('python3', ['-c', code, f], { encoding: 'utf8' }).trim();

  // ---------- 1. 表格 + 整页跳转翻页 ----------
  console.log('1. 客户名单（表格，5 页整页跳转）');
  let { page, panel } = await openOn(`${BASE}/demo/table.html${X.q}`, 'table');
  await panel.waitForSelector('#ctl:not([hidden])');
  // 默认英文：浏览器是中文也一样，不自己切
  ok(await panel.evaluate(() => document.documentElement.lang) === 'en' && (await panel.locator('#go').textContent()) === 'Start', `第一次打开是英文（浏览器 ${X.locale}，没选过）`);
  if (LANG === 'zh') {
    await panel.click('#lang [data-lang=zh]');
    await panel.waitForFunction(() => document.documentElement.lang === 'zh-CN');
    ok((await panel.locator('#go').textContent()) === '开始' && (await panel.locator('#seg [data-mode=next]').textContent()) === '翻页', '点右上角「中文」，整页换中文');
    const st = await sw.evaluate(() => chrome.storage.local.get('lang'));
    ok(st.lang === 'zh', '选的语言记在 chrome.storage.local：' + JSON.stringify(st));
  }
  ok(await panel.locator('#lang [aria-pressed=true]').getAttribute('data-lang') === LANG, '右上角切换标着当前语言');
  ok((await rows(panel)) === 20, '一打开就认出表格，20 行');
  let h = await heads(panel);
  ok(X.table.every((x) => h.includes(x)), '列名直接用表头：' + h.join(' | '));
  ok(await panel.locator('#seg button[data-mode=next][aria-pressed=true]').count() === 1, '自动选了「翻页」');
  ok((await panel.locator('#hint').textContent()).includes(X.hintNext), '自动找到下一页按钮：' + await panel.locator('#hint').textContent());
  ok(await page.locator('[data-qs-list]').count() === 1 && await page.locator('[data-qs-next]').count() === 1, '网页上高亮了名单和下一页');
  // 表横向放不下：右缘渐隐；滚到头渐隐去掉；一格不超过 176 宽（省略号），不切半个字
  ok(await panel.evaluate(() => document.getElementById('gridWrap').classList.contains('more-r')), '表横向放不下，右缘有渐隐');
  ok(await panel.evaluate(() => Math.max(...[...document.querySelectorAll('#grid td .c')].map((e) => e.getBoundingClientRect().width)) <= 176.5), '格子最宽 176，超出用省略号');
  await panel.evaluate(() => { const sc = document.getElementById('gridScroll'); sc.scrollLeft = sc.scrollWidth; });
  await panel.waitForFunction(() => !document.getElementById('gridWrap').classList.contains('more-r'));
  ok(true, '滚到最右，渐隐自己去掉');
  await panel.evaluate(() => { document.getElementById('gridScroll').scrollLeft = 0; });
  ok(await panel.locator('.bottom .qs-foot').count() === 0 && await panel.locator('#pop .qs-foot').count() === 1, '侧栏底部只留下载那一排，页脚收进设置浮层');
  // 提意见：设置浮层里一行，点了拉起邮件，什么都填好
  await panel.click('#gear');
  ok(await panel.locator('#pop #fb').isVisible() && (await panel.locator('#fb').textContent()) === X.fb, '设置浮层里有「' + X.fb + '」');
  ok((await panel.locator('#fb').getAttribute('target')) === '_blank', '「' + X.fb + '」新标签页打开（交给默认邮件程序，侧栏不跳走）');
  await panel.screenshot({ path: path.join(SHOTS, 'panel-feedback.png') });
  await panel.emulateMedia({ colorScheme: 'dark' });
  await panel.screenshot({ path: path.join(SHOTS, 'panel-feedback-dark.png') });
  await panel.emulateMedia({ colorScheme: 'light' });
  FB.push(await feedback(panel, '#fb', { subject: X.fbSubject, first: X.fbFirst }));
  await panel.click('#gear');
  ok(await panel.locator('#pop').isHidden(), '再点一下设置，浮层收起');
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
  ok(await panel.evaluate(() => document.body.dataset.dl === '1') && X.dlWord.test(await status(panel)) && X.file.test(path.basename(f)) && f.endsWith('.xlsx'), '点了开始、没标黄：化完自己下好了，不用再点导出：' + path.basename(f));
  ok(py("import sys,openpyxl;print(openpyxl.load_workbook(sys.argv[1]).active.max_row-1)", f) === '100', '自己下的 xlsx 100 行');
  ok(page.url().includes('p=5'), '网页停在第 5 页');
  // 改列：删「操作」链接列、改名、拖顺序
  const idCol = panel.locator('#grid th[data-key]').filter({ has: panel.locator('.nm', { hasText: new RegExp('^' + X.id + '$') }) });
  await idCol.hover(); await idCol.locator('.x').click();
  ok(!(await heads(panel)).includes(X.id), '删掉一列');
  await panel.locator('#grid th[data-key] .nm', { hasText: new RegExp('^' + X.contact + '$') }).click();
  await panel.keyboard.press('Control+A'); await panel.keyboard.type(X.renamed); await panel.keyboard.press('Enter');
  ok((await heads(panel)).includes(X.renamed), '改列名');
  await panel.setViewportSize({ width: 760, height: 820 }); // 侧栏拉宽了再拖（窄的时候第一列躲在序号列后面，拖不准）
  const src = panel.locator('#grid th[data-key]').filter({ has: panel.locator('.nm', { hasText: new RegExp('^' + X.email + '$') }) });
  const dst = panel.locator('#grid th[data-key]').first();
  const bb = await dst.boundingBox();
  await src.dragTo(dst, { targetPosition: { x: 4, y: bb.height / 2 } });
  ok((await heads(panel))[0] === X.email, '拖到第一列：' + (await heads(panel)).slice(0, 3).join(' | '));
  await panel.screenshot({ path: path.join(SHOTS, 'panel-table-done.png') });
  await panel.setViewportSize({ width: 400, height: 820 });
  f = await download(panel, '#xlsx');
  ok(X.file.test(path.basename(f)), '下载文件名（' + LANG + '）：' + path.basename(f));
  let out = py("import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;r=list(ws.values);print(len(r)-1,'|'.join(str(x) for x in r[0]),'|'.join(str(x) for x in r[1]))", f);
  console.log('    xlsx:', out);
  ok(out.startsWith('100 ' + X.email + '|') && out.includes(X.renamed) && !out.split(' ')[1].split('|').includes(X.id), 'xlsx 100 行，改名/删列/顺序都带上');
  f = await download(panel, '#csv');
  const csv = fs.readFileSync(f, 'utf8');
  ok(csv.charCodeAt(0) === 0xFEFF && csv.trim().split('\r\n').length === 101, 'csv 带 BOM，101 行（含表头）');
  const d = await panel.evaluate(() => { const s = new QSSheet(); const m = { 'a|t': { type: 't' } }; s.add({ keys: ['a|t'], meta: m, rows: [{ 'a|t': '1' }, { 'a|t': '2' }, { 'a|t': '2' }] }); s.add({ keys: ['a|t'], meta: m, rows: [{ 'a|t': '3' }, { 'a|t': '1' }] }); return [s.rows.length, s.dupes]; });
  ok(d[0] === 3 && d[1] === 2, '去重：同页重复、换页又出现的都去掉');
  await panel.close(); await page.close();

  console.log('1b. 同一个网站第二回：照上次的改法，自己翻、自己下');
  ({ page, panel } = await openOn(`${BASE}/demo/table.html${X.q}`, 'table-2'));
  auto = panel.waitForEvent('download', { timeout: 90000 });
  ok(await panel.evaluate(() => document.documentElement.lang) === (LANG === 'zh' ? 'zh-CN' : 'en'), '再打开还是上回选的语言：' + LANG);
  h = await heads(panel);
  ok(h[0] === X.email && h.includes(X.renamed) && !h.includes(X.id), '列名、删列、顺序照上次：' + h.join(' | '));
  ok(X.remembered.test(await panel.locator('#meta').textContent()), '写明照上次办了啥：' + await panel.locator('#meta').textContent());
  f = await saveDl(await auto);
  // 上回最后点的是 CSV，这回自己下的也是 CSV
  const lines = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').trim().split('\r\n');
  out = (lines.length - 1) + ' ' + lines[0];
  ok(f.endsWith('.csv') && out.startsWith('100 ' + X.email + ',') && out.includes(X.renamed) && !out.split(' ')[1].split(',').includes(X.id), '不点开始、不点下载，表到手（格式照上回的 CSV）：' + path.basename(f) + ' ' + out);
  await panel.screenshot({ path: path.join(SHOTS, 'panel-table-second.png') });
  await panel.locator('#meta button', { hasText: X.undo }).click();
  await panel.waitForFunction((src) => !new RegExp(src).test(document.getElementById('meta').textContent), X.remembered.source);
  h = await heads(panel);
  ok(h.includes(X.id) && h.includes(X.contact) && h[0] !== X.email, '点「还原」回到自己猜的样子：' + h.join(' | '));
  const left = await sw.evaluate(() => chrome.storage.local.get('site:127.0.0.1'));
  ok(!left['site:127.0.0.1'], '还原后这个网站的记性忘干净');
  await panel.close(); await page.close();

  // ---------- 2. 卡片 + 不刷新翻页 ----------
  console.log('2. 销售线索（卡片，Ajax 翻页）');
  await fresh();
  ({ page, panel } = await openOn(`${BASE}/demo/cards.html${X.q}`, 'cards'));
  await panel.waitForSelector('#ctl:not([hidden])');
  ok((await rows(panel)) === 12, '认出卡片，12 张');
  h = await heads(panel);
  ok(X.cardHeads.every((x) => h.includes(x)), '「电话：」这种前缀变成列名：' + h.join(' | '));
  const firstPhone = await panel.evaluate((nm) => { const i = [...document.querySelectorAll('#grid th[data-key]')].findIndex((t) => t.textContent === nm); return document.querySelector('#grid tbody tr').children[i + 1].textContent; }, X.cardHeads[0]);
  ok(X.phone.test(firstPhone), '值里的前缀去掉了：' + firstPhone);
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
  ({ page, panel } = await openOn(`${BASE}/demo/scroll.html${X.q}`, 'scroll'));
  ok(await panel.locator('#seg button[data-mode=scroll][aria-pressed=true]').count() === 1, '没有下一页，试滚一下出了新货，自动选「滚动」');
  ok(await panel.evaluate(() => ['running', 'end'].includes(document.body.dataset.state)), '不用点开始，自己接着滚：' + await status(panel));
  const t0 = Date.now();
  await waitDone(panel);
  ok((await blk(panel)).startsWith('120'), '滚到底，120 件：' + await status(panel) + `（收尾 ${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
  h = await heads(panel);
  ok(h.includes(X.image) && h.includes(X.price) && h.indexOf(X.image) === h.length - 1, '图片列放最后：' + h.join(' | '));
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
  ({ page, panel } = await openOn(`${BASE}/demo/scroll.html${X.q}&slow=1`, 'scroll-slow'));
  auto = panel.waitForEvent('download', { timeout: 90000 });
  await panel.waitForFunction(() => document.querySelector('#seg [data-mode=scroll][aria-pressed=true]'), null, { timeout: 8000 });
  await waitDone(panel);
  ok((await blk(panel)).startsWith('120'), '慢加载的无限滚动：试滚没看出来，随后自己改成滚动收齐 120 件：' + await status(panel));
  f = await saveDl(await auto);
  ok(py("import sys,openpyxl;print(openpyxl.load_workbook(sys.argv[1]).active.max_row-1)", f) === '120', '第二回用：滚完自己下好 120 件');
  await panel.close(); await page.close();

  // ---------- 4. 手动指定下一页 + 中途停 ----------
  console.log('4. 手动指定下一页、中途停');
  await fresh();
  ({ page, panel } = await openOn(`${BASE}/demo/table.html${X.q}`, 'pick'));
  await panel.waitForSelector('#ctl:not([hidden])');
  await panel.click('#pick');
  await page.waitForSelector('#qs-pick-tip');
  ok(/Esc/.test(await page.locator('#qs-pick-tip').textContent()), '网页上的点选提示：' + await page.locator('#qs-pick-tip').textContent());
  await page.bringToFront();
  await page.click(X.pagerNext);
  await panel.waitForFunction((w) => document.getElementById('hint').textContent.includes(w), X.hintNext);
  ok(page.url().endsWith('table.html' + X.q), '点选时网页没跳走');
  await panel.click('#go');
  await panel.waitForFunction((src) => new RegExp(src).test(document.getElementById('status').textContent), X.page2.source, { timeout: 20000 });
  await panel.click('#go');
  await panel.waitForFunction(() => document.body.dataset.state === 'stop', null, { timeout: 20000 });
  ok(true, '用指定的按钮翻页后喊停：' + await status(panel));
  await panel.close();
  await page.waitForTimeout(300);
  ok(await page.locator('[data-qs-list],[data-qs-next]').count() === 0, '关掉面板，网页上的高亮清干净');
  await page.close();

  // ---------- 5. 列名、值清洗、xlsx 格式（直接喂数据） ----------
  console.log('5. 列名和值清洗');
  ({ page, panel } = await openOn(`${BASE}/demo/table.html${X.q}`, 'units'));
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
  ok(JSON.stringify(u.head) === JSON.stringify(X.units), '列名：' + u.head.join(' | '));
  ok(u.weak === X.weak && u.weak2 === 1, '拿不准的列名标出来（照抄英文、字段N），改了名就不黄：' + u.weak);
  ok(u.r1[3] === '4.0', '「评分 4.0」拆成列名，值留 4.0');
  const xf = path.join(SHOTS, 'units.xlsx'); fs.writeFileSync(xf, Buffer.from(u.b64, 'base64'));
  out = py("import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;c=ws['D2'];print(c.value,c.number_format)", xf);
  ok(out === '4.0 0.0', 'xlsx 里 4.0 带一位小数格式：' + out);
  await panel.close(); await page.close();

  // ---------- 6. 进不去的页面：给示例 ----------
  console.log('6. 浏览器自带页面');
  ({ page, panel } = await openOn('chrome://version/', 'chrome'));
  await panel.waitForSelector('#empty:not([hidden])');
  ok((await panel.locator('#emptyT').textContent()).includes(X.noAccess) && await panel.locator('#tryDemo').isVisible(), '说清楚进不去，给「用示例试试」：' + await panel.locator('#emptyT').textContent());
  ok(await panel.locator('#xlsx').isDisabled(), '还没表，下载是灰的');
  await panel.screenshot({ path: path.join(SHOTS, 'panel-noaccess.png') });
  await panel.click('#tryDemo');
  ok((await rows(panel)) === 8 && !(await panel.locator('#xlsx').isDisabled()), '「用示例试试」一点就出示例表，能下来看看：' + (await heads(panel)).join(' | '));
  f = await download(panel, '#xlsx');
  ok(X.demoFile.test(path.basename(f)), '示例表下下来的文件名：' + path.basename(f));
  // 中途换语言：示例表、列名、按钮一起换，换回来也对
  const other = LANG === 'zh' ? 'en' : 'zh';
  await panel.click(`#lang [data-lang=${other}]`);
  const h2 = await heads(panel);
  ok(h2[0] === (other === 'en' ? 'Company' : '公司') && (await panel.locator('#emptyT').textContent()) === (other === 'en' ? 'This page is off-limits' : '这页贫僧进不去'), `中途切到 ${other}：` + h2.join(' | ') + ' / ' + await panel.locator('#emptyT').textContent());
  await panel.click(`#lang [data-lang=${LANG}]`);
  ok((await heads(panel))[0] === (LANG === 'en' ? 'Company' : '公司'), '再切回来：' + (await heads(panel)).join(' | '));
  await panel.close(); await page.close();

  // ---------- 7. 网页关了：表还在 ----------
  console.log('7. 化到一半网页关了');
  await fresh();
  ({ page, panel } = await openOn(`${BASE}/demo/cards.html${X.q}`, 'gone'));
  await page.close();
  await panel.waitForSelector('#perm:not([hidden])');
  ok(X.gone.test(await panel.locator('#perm').textContent()) && (await rows(panel)) === 12 && !(await panel.locator('#xlsx').isDisabled()), '话放在出事的地方，已收的 12 行照样能下：' + await panel.locator('#perm').textContent());
  await panel.close();

  // ---------- 8. 介绍页页脚：提意见 ----------
  console.log('8. 介绍页页脚「提意见」');
  const intro = await ctx.newPage(); watch(intro, 'intro');
  await intro.setViewportSize({ width: 1280, height: 860 });
  await intro.goto(`${BASE}/index.html${X.q}`); await intro.waitForLoadState('networkidle');
  ok((await intro.locator('.foot #fb').textContent()) === X.fb, '介绍页页脚有「' + X.fb + '」');
  await intro.locator('.foot').scrollIntoViewIfNeeded();
  await intro.screenshot({ path: path.join(SHOTS, 'intro-feedback.png') });
  FB.push(await feedback(intro, '#fb', { subject: X.fbSubject, first: X.fbFirst }));
  // 介绍页上换语言：标题和提示跟着换
  const oth = LANG === 'zh' ? 'en' : 'zh';
  await intro.click(`.lang [data-lang=${oth}]`);
  const OX = oth === 'en' ? { subject: '[QIANSHOU feedback] Huayuan · List Grabber ' + VER, first: ['What’s not working:'] } : { subject: '[千手院反馈] 化缘僧 ' + VER, first: ['哪里不好用：'] };
  await feedback(intro, '#fb', OX);
  await intro.close();
  fs.writeFileSync(path.join(SHOTS, 'feedback.json'), JSON.stringify(FB, null, 2));

  await ctx.close(); server.close();
  if (errors.length) { console.log('报错：\n' + errors.join('\n')); process.exit(1); }
  console.log('全部通过，零报错。截图在', SHOTS);
}
main().catch((e) => { console.error(e); console.log(errors.join('\n')); process.exit(1); });
