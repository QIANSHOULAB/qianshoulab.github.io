// 化缘僧 · 步骤账：把主流程从「第一次打开」走到「Excel 到手」，第一次用、第二次用各走一遍，每一下都记下来。
// 新版旧版用同一个脚本跑：脚本只照「人想要的结果」做，界面已经替人做了的就不点。
// 用法：LANG=C.UTF-8 node huayuan/bench/steps.js <插件目录> <输出 json>
// 场景（都是 huayuan/demo 的假数据）：
//   客户名单 table.html：5 页整页跳转。人要的表：不要「编号」，「联系人」叫「对接人」，「邮箱」放第一列，5 页全要，Excel。
//   销售线索 cards.html：4 页 Ajax 翻页，全要，Excel。
//   商品 scroll.html：无限滚动 120 件，全要，Excel。
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.resolve(process.argv[2] || path.join(ROOT, 'extension'));
const OUT = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'hy-steps.json'));
const PORT = Number(process.env.PORT) || 8766, BASE = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-steps-'));
// 0.4.0：插件默认英文、示例站默认英文。HY_LANG=zh（默认）跑中文（跟老版本比用这个），en 跑英文
const HY_LANG = process.env.HY_LANG === 'en' ? 'en' : 'zh';
const N = HY_LANG === 'en' ? { id: 'ID', contact: 'Contact', renamed: 'Point of contact', email: 'Email' } : { id: '编号', contact: '联系人', renamed: '对接人', email: '邮箱' };

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
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
  fs.cpSync(EXT, dir, { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  m.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  return { dir, version: m.version };
}

async function main() {
  const server = await serve();
  const { dir, version } = testBuild();
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'hy-prof-')), {
    headless: true, channel: 'chromium', acceptDownloads: true, viewport: { width: 1280, height: 860 },
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate((l) => chrome.storage.local.set({ lang: l }), HY_LANG); // 侧栏语言（老版本不认这个键，没影响）
  const heads = (panel) => panel.evaluate(() => [...document.querySelectorAll('#grid th[data-key] .nm')].map((e) => e.textContent));
  const out = { version, runs: [] };

  async function walk(scene, use) {
    const steps = [];
    const step = (what, kind = 'click') => steps.push({ what, kind });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/demo/${scene.file}?lang=${HY_LANG}`); await page.waitForLoadState('networkidle');
    await page.bringToFront();
    const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((x) => x.url === u).id, page.url());
    const t0 = Date.now();
    step('点工具栏图标');
    const wait = ctx.waitForEvent('page', (p) => p.url().includes('panel.html'));
    await sw.evaluate(async (id) => globalThis.openPanel(await chrome.tabs.get(id)), tabId);
    const panel = await wait;
    await panel.setViewportSize({ width: 400, height: 820 });
    const downloads = [];
    panel.on('download', (d) => downloads.push(d));
    await panel.waitForSelector('body[data-ready]', { timeout: 30000 });
    step('扫一眼认出的表对不对', 'look');
    if (scene.edits) {
      let h = await heads(panel);
      if (h.includes(N.id)) {
        const th = panel.locator('#grid th[data-key]').filter({ has: panel.locator('.nm', { hasText: new RegExp('^' + N.id + '$') }) });
        await th.hover(); await th.locator('.x').click(); step(`删「${N.id}」列`);
      }
      h = await heads(panel);
      if (h.includes(N.contact)) {
        await panel.locator('#grid th[data-key] .nm', { hasText: new RegExp('^' + N.contact + '$') }).click();
        await panel.keyboard.press('Control+A'); await panel.keyboard.type(N.renamed); await panel.keyboard.press('Enter');
        step(`「${N.contact}」改名「${N.renamed}」（点、打字、回车）`);
      }
      h = await heads(panel);
      if (h[0] !== N.email) {
        await panel.setViewportSize({ width: 760, height: 820 });
        const src = panel.locator('#grid th[data-key]').filter({ has: panel.locator('.nm', { hasText: new RegExp('^' + N.email + '$') }) });
        const dst = panel.locator('#grid th[data-key]').first();
        const bb = await dst.boundingBox();
        await src.dragTo(dst, { targetPosition: { x: 4, y: bb.height / 2 } });
        await panel.setViewportSize({ width: 400, height: 820 });
        step(`把「${N.email}」拖到第一列`);
      }
    }
    const done = () => panel.evaluate((() => { const s = document.body.dataset.state; return s ? ['end', 'stop', 'max'].includes(s) : /化完了|停了/.test(document.getElementById('status').textContent); }));
    if (!(await done())) {
      // 已经自己滚起来了（状态写着「第 N 屏」）就等着，别去点「停」
      const running = await panel.evaluate(() => { const s = document.body.dataset.state; return s ? s === 'running' : /第 \d+ (页|屏)/.test(document.getElementById('status').textContent); });
      if (!running && await panel.locator('#go').isVisible()) { await panel.click('#go'); step('点「开始」'); }
      await panel.waitForFunction((() => { const s = document.body.dataset.state; return s ? ['end', 'stop', 'max'].includes(s) : /化完了|停了/.test(document.getElementById('status').textContent); }), null, { timeout: 120000 });
    }
    // 化完了：自己下了就不点；没下就点导出
    const tw = Date.now();
    while (!downloads.length && Date.now() - tw < 1500) await panel.waitForTimeout(100);
    if (!downloads.length) {
      await Promise.all([panel.waitForEvent('download'), panel.click('#xlsx')]);
      step('点「导出 Excel」');
    }
    const d = downloads[downloads.length - 1] || (await panel.waitForEvent('download'));
    const f = path.join(TMP, `${scene.name}-${use}.xlsx`); await d.saveAs(f);
    const ms = Date.now() - t0;
    const chk = execFileSync('python3', ['-c', "import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;r=list(ws.values);print(len(r)-1,'|'.join(str(x) for x in r[0]))", f], { encoding: 'utf8' }).trim();
    await panel.close(); await page.close();
    const clicks = steps.filter((s) => s.kind === 'click').length;
    const r = { scene: scene.name, use, steps, clicks, ms, xlsx: chk, file: path.basename(d.suggestedFilename()) };
    console.log(JSON.stringify(r));
    out.runs.push(r);
  }

  const scenes = [
    { name: '客户名单（表格 5 页，改列）', file: 'table.html', edits: true },
    { name: '销售线索（卡片 Ajax 4 页）', file: 'cards.html' },
    { name: '商品（无限滚动）', file: 'scroll.html' },
  ];
  for (const sc of scenes) { await walk(sc, '第一次'); await walk(sc, '第二次'); }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  await ctx.close(); server.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
