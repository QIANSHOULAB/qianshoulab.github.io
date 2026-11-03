// 化缘僧 0.4.0 交货截图（照 _ops/文案规范.md「交货前自查」）+ 排版检查：
//   英文、中文各：侧栏 400 宽 × 空状态、结果、设置浮层；介绍页 390、1280 各一张整页。放 bench/shots-0.4/（en-*.png、zh-*.png）。
//   排版检查（layout-check.json）：按钮被长单词撑破 / 折成两行、该一行的字折行、带省略号的字被截断、横向滚动。
//   侧栏另外在 360 宽（侧栏最窄的常见宽度）各状态再查一遍。
// 用法：LANG=C.UTF-8 node huayuan/bench/shots-0.4.js [输出目录，默认 huayuan/bench/shots-0.4]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'shots-0.4'));
fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT) || 8768, BASE = `http://127.0.0.1:${PORT}`;
const errors = [];
const report = [];

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

// 在页面里查排版。sel = { buttons, oneLine, noTrunc }
function layoutProblems(sel) {
  const out = [];
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const lines = (e) => {
    const tops = new Set();
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      if (!n.nodeValue.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const x of r.getClientRects()) if (x.width > 0) tops.add(Math.round(x.top / 4));
    }
    return tops.size;
  };
  const name = (e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  for (const b of document.querySelectorAll(sel.buttons)) {
    if (!vis(b)) continue;
    if (b.scrollWidth > b.clientWidth + 1) out.push('按钮被撑破：' + name(b));
    if (lines(b) > 1) out.push('按钮折成两行：' + name(b));
  }
  for (const e of document.querySelectorAll(sel.oneLine || 'x-none')) if (vis(e) && lines(e) > 1) out.push('该一行的折了行：' + name(e));
  for (const e of document.querySelectorAll(sel.noTrunc || 'x-none')) if (vis(e) && e.scrollWidth > e.clientWidth + 1) out.push('字被截断：' + name(e));
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push('横向滚动：页面宽 ' + document.documentElement.scrollWidth);
  return out;
}
const PANEL_SEL = {
  buttons: 'button, .btn, #openDemo',
  oneLine: '.seg button, .blk-n, .pop .row > span:first-child, .ttl b, #hint',
  noTrunc: '#hint, #blkS, #status b, #status .warn, .meta > span, .empty-t, .ttl b, .pop .row > span:first-child',
};
const INTRO_SEL = {
  buttons: '.btn, .lnk, .lang button',
  oneLine: '.nav b, .nav .home, .score b, .feats b, .ver',
  noTrunc: '',
};

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
  async function openOn(url, tag) {
    const page = await ctx.newPage(); watch(page, tag);
    await page.goto(url); await page.waitForLoadState('networkidle').catch(() => {});
    await page.bringToFront();
    const tabId = await sw.evaluate(async (u) => { const t = (await chrome.tabs.query({})).find((x) => x.url === u) || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]; return t.id; }, page.url());
    const wait = ctx.waitForEvent('page', (p) => p.url().includes('panel.html'));
    await sw.evaluate(async (id) => globalThis.openPanel(await chrome.tabs.get(id)), tabId);
    const panel = await wait; watch(panel, tag + '-panel');
    await panel.setViewportSize({ width: 400, height: 820 });
    await panel.waitForSelector('body[data-ready]', { timeout: 30000 });
    return { page, panel };
  }
  // 400 宽截图 + 查；再缩到 360 查一遍
  async function check(p, what, sel, widths) {
    for (const w of widths) {
      const vp = p.viewportSize();
      if (w !== vp.width) { await p.setViewportSize({ width: w, height: vp.height }); await p.waitForTimeout(200); }
      const pr = await p.evaluate(layoutProblems, sel);
      report.push({ what: `${what} @${w}`, problems: pr });
      if (w !== vp.width) await p.setViewportSize(vp);
    }
  }
  const shot = (p, name, full) => p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!full });

  for (const lang of ['en', 'zh']) {
    // 插件：选过的语言存在 chrome.storage.local（英文是默认，不存也一样）
    await sw.evaluate(async (l) => { await chrome.storage.local.clear(); await chrome.storage.local.set({ lang: l }); }, lang);
    // 空状态：进不去的页面
    let { page, panel } = await openOn('chrome://version/', 'empty-' + lang);
    await panel.waitForSelector('#empty:not([hidden])');
    await shot(panel, `${lang}-panel-empty`);
    await check(panel, `${lang} 侧栏 空状态`, PANEL_SEL, [400, 360]);
    await panel.click('#tryDemo');
    await check(panel, `${lang} 侧栏 示例表`, PANEL_SEL, [400, 360]);
    await panel.close(); await page.close();

    // 结果：表格翻 5 页，化完自己下好
    ({ page, panel } = await openOn(`${BASE}/demo/table.html?lang=${lang}`, 'result-' + lang));
    await check(panel, `${lang} 侧栏 开始前`, PANEL_SEL, [400, 360]);
    const dl = panel.waitForEvent('download', { timeout: 60000 });
    await panel.click('#go');
    await panel.waitForFunction(() => document.body.dataset.state === 'running');
    await check(panel, `${lang} 侧栏 翻页中`, PANEL_SEL, [400]);
    await panel.waitForFunction(() => ['end', 'stop', 'max'].includes(document.body.dataset.state), null, { timeout: 60000 });
    await dl; await panel.waitForTimeout(2600); // 等提示条退了再截
    await shot(panel, `${lang}-panel-result`);
    await check(panel, `${lang} 侧栏 结果`, PANEL_SEL, [400, 360]);
    await panel.click('#gear'); await panel.waitForTimeout(300);
    await shot(panel, `${lang}-panel-settings`);
    await check(panel, `${lang} 侧栏 设置浮层`, PANEL_SEL, [400, 360]);
    await panel.close(); await page.close();

    // 出错：网页关了，表还在
    ({ page, panel } = await openOn(`${BASE}/demo/cards.html?lang=${lang}`, 'error-' + lang));
    await page.close();
    await panel.waitForSelector('#perm:not([hidden])');
    await check(panel, `${lang} 侧栏 网页关了`, PANEL_SEL, [400, 360]);
    await panel.close();
  }

  // 介绍页：默认英文；点右上角「中文」，刷新还是中文（记住了）
  for (const w of [390, 1280]) {
    const p = await ctx.newPage(); watch(p, 'intro');
    await p.setViewportSize({ width: w, height: w === 390 ? 844 : 860 });
    await p.goto(`${BASE}/index.html`); await p.evaluate(() => localStorage.clear()); await p.reload();
    for (const lang of ['en', 'zh']) {
      if (lang === 'zh') {
        await p.click('.lang [data-lang=zh]');
        await p.reload();
        const ok = await p.evaluate(() => document.documentElement.lang === 'zh-CN' && document.title.startsWith('化缘僧') && document.querySelector('meta[name=description]').content.startsWith('专治'));
        if (!ok) errors.push(`intro ${w}：点了中文、刷新后不是中文`);
      } else {
        const ok = await p.evaluate(() => document.documentElement.lang === 'en' && document.title.startsWith('Huayuan · List Grabber') && /Excel or CSV/.test(document.querySelector('meta[name=description]').content));
        if (!ok) errors.push(`intro ${w}：默认不是英文`);
      }
      await p.waitForLoadState('networkidle');
      // 懒加载的图：先滚到底让它们都出来，再回顶上截整页
      await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
      await p.waitForLoadState('networkidle'); await p.waitForTimeout(300);
      const imgs = await p.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src));
      if (imgs.length) errors.push(`intro ${w} ${lang} 图没出来：${imgs.join(', ')}`);
      await shot(p, `${lang}-intro-${w}`, true);
      const pr = await p.evaluate(layoutProblems, INTRO_SEL);
      report.push({ what: `${lang} 介绍页 @${w}`, problems: pr });
    }
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  // 示例站：默认英文，?lang=zh 换中文
  for (const lang of ['en', 'zh']) {
    const p = await ctx.newPage(); watch(p, 'demo');
    await p.setViewportSize({ width: 1280, height: 860 });
    await p.goto(`${BASE}/demo/${lang === 'zh' ? '?lang=zh' : '?lang=en'}`);
    report.push({ what: `${lang} 示例站首页 @1280`, problems: await p.evaluate(layoutProblems, { buttons: '.lang a', oneLine: 'h1, .idx > a b' }) });
    await p.close();
  }

  fs.writeFileSync(path.join(OUT, 'layout-check.json'), JSON.stringify(report, null, 1));
  const bad = report.filter((r) => r.problems.length);
  for (const r of report) console.log((r.problems.length ? '✗ ' : '✓ ') + r.what + (r.problems.length ? '：' + r.problems.join('；') : ''));
  await ctx.close(); server.close();
  if (errors.length) { console.log('报错：\n' + errors.join('\n')); process.exit(1); }
  console.log(`排版检查 ${report.length} 处，有毛病 ${bad.length} 处。截图在`, OUT);
  if (bad.length) process.exit(2);
}
main().catch((e) => { console.error(e); console.log(errors.join('\n')); process.exit(1); });
