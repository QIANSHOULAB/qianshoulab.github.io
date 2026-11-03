// 化缘僧 0.3.0 交货截图（照 _ops/设计规范.md 最后一节）：
//   插件侧栏 400 宽 × 浅 / 深 × 空状态、干活中、结果、出错 = 8 张；介绍页 390 / 1280 × 浅 / 深 = 4 张。
// 用法：LANG=C.UTF-8 node huayuan/bench/shots-0.3.js [输出目录，默认 huayuan/bench/shots-0.3]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'shots-0.3'));
fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT) || 8767, BASE = `http://127.0.0.1:${PORT}`;
const errors = [];

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.zip': 'application/zip' };
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
    headless: true, channel: 'chromium', acceptDownloads: true, viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const watch = (p, tag) => {
    p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
  };
  async function openOn(url, scheme, tag) {
    const page = await ctx.newPage(); watch(page, tag);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(url); await page.waitForLoadState('networkidle').catch(() => {});
    await page.bringToFront();
    const tabId = await sw.evaluate(async (u) => { const t = (await chrome.tabs.query({})).find((x) => x.url === u) || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]; return t.id; }, page.url());
    const wait = ctx.waitForEvent('page', (p) => p.url().includes('panel.html'));
    await sw.evaluate(async (id) => globalThis.openPanel(await chrome.tabs.get(id)), tabId);
    const panel = await wait; watch(panel, tag + '-panel');
    await panel.emulateMedia({ colorScheme: scheme });
    await panel.setViewportSize({ width: 400, height: 820 });
    await panel.waitForSelector('body[data-ready]', { timeout: 30000 });
    return { page, panel };
  }
  const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') });

  for (const scheme of ['light', 'dark']) {
    await sw.evaluate(() => chrome.storage.local.clear());
    // 空状态：进不去的页面，给「用示例试试」
    let { page, panel } = await openOn('chrome://version/', scheme, 'empty');
    await panel.waitForSelector('#empty:not([hidden])');
    await shot(panel, `panel-${scheme}-1-empty`);
    await panel.close(); await page.close();

    // 干活中：每页多等 1.5 秒，好截到翻页途中
    await sw.evaluate(() => chrome.storage.local.set({ delay: 1.5 }));
    ({ page, panel } = await openOn(`${BASE}/demo/table.html`, scheme, 'work'));
    await panel.click('#go');
    await panel.waitForFunction(() => /第 3 页/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
    await panel.waitForTimeout(400);
    await shot(panel, `panel-${scheme}-2-working`);
    // 结果：化完了，自己下好了
    const dl = panel.waitForEvent('download', { timeout: 60000 });
    await panel.waitForFunction(() => /化完了/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
    await dl; await panel.waitForTimeout(2600); // 等提示条退了再截
    await shot(panel, `panel-${scheme}-3-result`);
    await panel.close(); await page.close();
    await sw.evaluate(() => chrome.storage.local.set({ delay: 0.3 }));

    // 出错：化着化着网页关了，表还在
    ({ page, panel } = await openOn(`${BASE}/demo/cards.html`, scheme, 'error'));
    await page.close();
    await panel.waitForSelector('#perm:not([hidden])');
    await panel.waitForTimeout(300);
    await shot(panel, `panel-${scheme}-4-error`);
    await panel.close();
  }

  // 介绍页
  for (const scheme of ['light', 'dark']) {
    for (const w of [390, 1280]) {
      const p = await ctx.newPage(); watch(p, 'intro');
      await p.emulateMedia({ colorScheme: scheme });
      await p.setViewportSize({ width: w, height: w === 390 ? 844 : 860 });
      await p.goto(`${BASE}/index.html`); await p.waitForLoadState('networkidle');
      // 懒加载的图：先滚到底让它们都出来，再回顶上截整页
      await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
      await p.waitForLoadState('networkidle'); await p.waitForTimeout(300);
      const sw2 = await p.evaluate(() => document.documentElement.scrollWidth);
      if (sw2 > w) errors.push(`intro ${w} 横向滚动：${sw2}`);
      await p.screenshot({ path: path.join(OUT, `intro-${w}-${scheme}.png`), fullPage: true });
      await p.close();
    }
  }
  await ctx.close(); server.close();
  if (errors.length) { console.log('报错：\n' + errors.join('\n')); process.exit(1); }
  console.log('截图在', OUT);
}
main().catch((e) => { console.error(e); console.log(errors.join('\n')); process.exit(1); });
