// 化缘僧 · Chrome 应用商店的图：截图 1280×800（英文一套、中文一套，各 4 张）、小宣传图 440×280、商店图标 128×128。
// 真装插件（--load-extension），在本地示例站上真跑一遍再拍：网页 880 宽 + 侧栏 400 宽拼成一个窗口，上面一句大字。
// 用法：LANG=C.UTF-8 node huayuan/bench/store-shots.js            （出到 huayuan/store/；8775 被占用就加 PORT=…）
// 说明：Playwright 点不了工具栏图标，跟 e2e 一样复制一份插件、manifest 加 127.0.0.1 的读取权限当测试版；界面跟正式包一模一样。
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'store');
const PORT = Number(process.env.PORT) || 8775, BASE = `http://127.0.0.1:${PORT}`;
const W = 1280, H = 800, PAGE_W = 880, PANEL_W = 400, WIN_H = 733;   // 窗口 1281×733 缩到 1104 宽放进 1280×800
const errors = [], problems = [];

// 每张图一句大字。英文重写不翻译；中文照文案规范，寺院腔点到为止
const CAP = {
  en: {
    table: 'Any web list, straight into Excel.',
    cards: 'Turns the pages. Downloads the sheet.',
    scroll: 'Infinite scroll, finitely handled.',
    second: 'Same site again? Your edits are already done.',
  },
  zh: {
    table: '网页上的名单，一铲子铲进 Excel',
    cards: '自己翻页，化完自己下',
    scroll: '无限滚动？贫僧替你滚到底',
    second: '同一个网站再来，上回的改法自己办好',
  },
};
const PROMO = { name: 'Huayuan · List Grabber', line: 'Any web list, straight into Excel.' };
// 系统字（照设计规范的 --font）。要塞进 style="…" 里，所以字体名用单引号
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','PingFang SC','Hiragino Sans GB','Microsoft YaHei UI','Segoe UI Variable Text','Segoe UI',system-ui,sans-serif";

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-store-ext-'));
  fs.cpSync(path.join(ROOT, 'extension'), dir, { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  m.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  return dir;
}
// 2 倍拍，再用 PIL 缩成 1 倍、去掉透明通道（商店要 24 位 PNG）
function shrink(src, dst, w, h, keepAlpha) {
  execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1])
alpha = sys.argv[5] == '1'
# 带透明的（商店图标）用面积平均缩，Lanczos 会把一丝半透明渗进四边留白
im = im.convert('RGBA' if alpha else 'RGB').resize((int(sys.argv[3]), int(sys.argv[4])), Image.BOX if alpha else Image.LANCZOS)
im.save(sys.argv[2], optimize=True)
`, src, dst, String(w), String(h), keepAlpha ? '1' : '0']);
  fs.unlinkSync(src);
}

// 侧栏里有没有被撑破的按钮、被截掉的字（表格格子本来就用省略号，不算）
async function layoutCheck(panel, tag) {
  const bad = await panel.evaluate(() => {
    const out = [];
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
    for (const el of document.querySelectorAll('button, a, #status, #meta, #hint, #blkN, .qs-btn, label')) {
      if (!vis(el) || el.closest('#grid')) continue;
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push('截断：' + (el.id || el.className || el.tagName) + ' ' + el.textContent.trim().slice(0, 40));
      if (el.matches('button, .qs-btn')) {
        const r = el.getBoundingClientRect(), lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
        if (r.height > Math.max(48, lh * 1.9) && el.textContent.trim()) out.push('按钮折行：' + (el.id || el.className) + ' ' + el.textContent.trim().slice(0, 40));
      }
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('横向滚动 ' + document.documentElement.scrollWidth);
    return out;
  });
  bad.forEach((b) => problems.push(tag + ' ' + b));
}

async function compose(ctx, file, caption, pageB64, panelB64, dark, lang) {
  const bg = dark ? '#000000' : '#f5f5f7', fg = dark ? '#f5f5f7' : '#1d1d1f';
  const s = 1104 / (PAGE_W + 1 + PANEL_W);
  const comp = await ctx.newPage();
  await comp.setViewportSize({ width: W, height: H });
  await comp.setContent(`<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${bg};font-family:${FONT};-webkit-font-smoothing:antialiased">
  <h1 id="cap" style="position:absolute;left:64px;right:64px;top:40px;margin:0;text-align:center;white-space:nowrap;overflow:hidden;color:${fg};font-weight:700;font-size:40px;line-height:52px;${lang === 'en' ? 'letter-spacing:-.02em' : ''}">${caption}</h1>
  <div style="position:absolute;left:${(W - 1104) / 2}px;top:124px;width:1104px;height:${Math.round(WIN_H * s)}px;border-radius:12px;overflow:hidden;${dark ? 'box-shadow:0 0 0 1px rgba(255,255,255,.16)' : 'box-shadow:0 24px 64px rgba(0,0,0,.12),0 0 0 .5px rgba(0,0,0,.1)'}">
    <div style="display:flex;width:${PAGE_W + 1 + PANEL_W}px;height:${WIN_H}px;transform:scale(${s});transform-origin:0 0">
      <img src="data:image/png;base64,${pageB64}" style="width:${PAGE_W}px;height:${WIN_H}px;display:block">
      <i style="width:1px;background:${dark ? '#38383A' : '#D2D2D7'}"></i>
      <img src="data:image/png;base64,${panelB64}" style="width:${PANEL_W}px;height:${WIN_H}px;display:block">
    </div>
  </div></body></html>`);
  await comp.evaluate(() => document.fonts.ready);
  const c = await comp.evaluate(() => { const e = document.getElementById('cap'); return { sw: e.scrollWidth, cw: e.clientWidth, h: e.getBoundingClientRect().height }; });
  if (c.sw > c.cw || c.h > 53) problems.push(`${file} 大字放不下：${c.sw}/${c.cw} 高 ${c.h}`);
  const tmp = path.join(OUT, '.' + path.basename(file) + '.2x.png');
  await comp.screenshot({ path: tmp });
  await comp.close();
  shrink(tmp, file, W, H, false);
}

async function run(lang) {
  const server = await serve();
  const ext = testBuild();
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'hy-store-prof-')), {
    headless: true, channel: 'chromium', acceptDownloads: true, viewport: { width: PAGE_W, height: WIN_H }, deviceScaleFactor: 2,
    locale: lang === 'zh' ? 'zh-CN' : 'en-US', args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  const watch = (p, tag) => {
    p.on('pageerror', (e) => errors.push(`${lang} ${tag} pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`${lang} ${tag} console: ${m.text()}`); });
  };
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate((l) => chrome.storage.local.set({ lang: l }), lang);
  const q = '?lang=' + lang;
  const dir = path.join(OUT, 'screenshots-' + lang);
  fs.mkdirSync(dir, { recursive: true });

  async function openOn(url, tag) {
    const page = await ctx.newPage(); watch(page, tag);
    await page.setViewportSize({ width: PAGE_W, height: WIN_H });
    await page.goto(url); await page.waitForLoadState('networkidle');
    await page.bringToFront();
    const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((x) => x.url === u).id, page.url());
    const wait = ctx.waitForEvent('page', (p) => p.url().includes('panel.html'));
    await sw.evaluate(async (id) => { const t = await chrome.tabs.get(id); await globalThis.openPanel(t); }, tabId);
    const panel = await wait; watch(panel, tag + '-panel');
    await panel.setViewportSize({ width: PANEL_W, height: WIN_H });
    await panel.waitForSelector('body[data-ready]', { timeout: 30000 });
    return { page, panel };
  }
  const done = (panel) => panel.waitForFunction(() => ['end', 'stop', 'max'].includes(document.body.dataset.state), null, { timeout: 90000 });
  async function shot(page, panel, name, dark, top) {
    const scheme = dark ? 'dark' : 'light';
    if (top) await page.evaluate(() => window.scrollTo(0, 0));   // 翻完 / 滚完网页停在底下，拍之前回到顶上，看得见网站的样子
    await page.emulateMedia({ colorScheme: scheme }); await panel.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(400);
    await layoutCheck(panel, `${lang}/${name}`);
    const a = (await page.screenshot()).toString('base64');
    const b = (await panel.screenshot()).toString('base64');
    const file = path.join(dir, `${['table', 'cards', 'scroll', 'second'].indexOf(name) + 1}-${name}${dark ? '-dark' : ''}.png`);
    await compose(ctx, file, CAP[lang][name], a, b, dark, lang);
    await page.emulateMedia({ colorScheme: 'light' }); await panel.emulateMedia({ colorScheme: 'light' });
    console.log('  ' + path.relative(ROOT, file));
  }

  // 1. 客户名单：一打开就认出表格、找到下一页（金框、虚框）
  let { page, panel } = await openOn(`${BASE}/demo/table.html${q}`, 'table');
  await panel.waitForSelector('#ctl:not([hidden])');
  await shot(page, panel, 'table', false);
  // 顺手做第 4 张的前戏：翻完、删一列、改个名、拖个顺序、下一份
  let dl = panel.waitForEvent('download', { timeout: 90000 });
  await panel.click('#go'); await done(panel); await dl;
  const X = lang === 'zh' ? { id: '编号', contact: '联系人', renamed: '对接人', email: '邮箱' } : { id: 'ID', contact: 'Contact', renamed: 'Point of contact', email: 'Email' };
  const th = (nm) => panel.locator('#grid th[data-key]').filter({ has: panel.locator('.nm', { hasText: new RegExp('^' + nm + '$') }) });
  await th(X.id).hover(); await th(X.id).locator('.x').click();
  await panel.locator('#grid th[data-key] .nm', { hasText: new RegExp('^' + X.contact + '$') }).click();
  await panel.keyboard.press('Control+A'); await panel.keyboard.type(X.renamed); await panel.keyboard.press('Enter');
  await panel.setViewportSize({ width: 760, height: WIN_H });
  const bb = await panel.locator('#grid th[data-key]').first().boundingBox();
  await th(X.email).dragTo(panel.locator('#grid th[data-key]').first(), { targetPosition: { x: 4, y: bb.height / 2 } });
  await panel.setViewportSize({ width: PANEL_W, height: WIN_H });
  await Promise.all([panel.waitForEvent('download'), panel.click('#xlsx')]);
  await panel.close(); await page.close();

  // 2. 销售线索：卡片 Ajax 翻 4 页，化完自己下（深色）
  ({ page, panel } = await openOn(`${BASE}/demo/cards.html${q}`, 'cards'));
  await panel.waitForSelector('#ctl:not([hidden])');
  dl = panel.waitForEvent('download', { timeout: 90000 });
  await panel.click('#go'); await done(panel); await dl;
  await panel.waitForTimeout(2600); // 等「已进下载」提示条退了
  await shot(page, panel, 'cards', true, true);
  await panel.close(); await page.close();

  // 3. 商品：无限滚动，不点开始，自己滚到底
  ({ page, panel } = await openOn(`${BASE}/demo/scroll.html${q}`, 'scroll'));
  await done(panel);
  await panel.waitForTimeout(600);
  await shot(page, panel, 'scroll', false, true);
  await panel.close(); await page.close();

  // 4. 客户名单第二回：照上回的改法，自己翻、自己下
  ({ page, panel } = await openOn(`${BASE}/demo/table.html${q}`, 'second'));
  dl = panel.waitForEvent('download', { timeout: 90000 });
  await done(panel); await dl;
  await panel.waitForTimeout(2600);
  await shot(page, panel, 'second', false);
  await panel.close(); await page.close();

  await ctx.close(); server.close();
}

async function extras() {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 2 });
  const icon = fs.readFileSync(path.join(ROOT, 'img/icon.svg'), 'utf8');
  // 商店图标：128×128，图案 96×96，四边各留 16 透明
  await p.setViewportSize({ width: 128, height: 128 });
  await p.setContent(`<html><body style="margin:0;background:transparent"><div style="padding:16px">${icon.replace('<svg ', '<svg width="96" height="96" style="display:block" ')}</div></body></html>`);
  let tmp = path.join(OUT, '.icon.2x.png');
  await p.screenshot({ path: tmp, omitBackground: true });
  shrink(tmp, path.join(OUT, 'icon-128.png'), 128, 128, true);
  // 小宣传图 440×280：图标 + 英文名 + 一句话（深底，商店页白底上不糊）
  await p.setViewportSize({ width: 440, height: 280 });
  await p.setContent(`<!doctype html><html lang="en"><body style="margin:0;width:440px;height:280px;overflow:hidden;background:#1d1d1f;font-family:${FONT};-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
    ${icon.replace('<svg ', '<svg width="80" height="80" style="display:block" ')}
    <div id="n" style="margin-top:20px;color:#f5f5f7;font-weight:700;font-size:28px;line-height:34px;letter-spacing:-.02em;white-space:nowrap">${PROMO.name}</div>
    <div id="l" style="margin-top:6px;color:#a1a1a6;font-size:17px;line-height:22px;white-space:nowrap">${PROMO.line}</div>
  </body></html>`);
  await p.evaluate(() => document.fonts.ready);
  const wd = await p.evaluate(() => ['n', 'l'].map((id) => document.getElementById(id).getBoundingClientRect().width));
  if (wd.some((x) => x > 440 - 48)) problems.push('小宣传图字太宽：' + wd.join(' / '));
  tmp = path.join(OUT, '.promo.2x.png');
  await p.screenshot({ path: tmp });
  shrink(tmp, path.join(OUT, 'promo-440x280.png'), 440, 280, false);
  await b.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const lang of ['en', 'zh']) { console.log('截图 ' + lang); await run(lang); }
  await extras();
  console.log('商店图标、小宣传图 ok');
  if (problems.length) console.log('排版问题：\n' + problems.join('\n'));
  if (errors.length) { console.log('报错：\n' + errors.join('\n')); process.exit(1); }
  if (problems.length) process.exit(2);
  console.log('全部拍完，零报错，排版 0 问题');
})().catch((e) => { console.error(e); console.log(errors.join('\n')); process.exit(1); });
