/* 0.3.0 交货截图（照 _ops/设计规范.md 最后一节）：侧栏 × 浅深 × 空状态 / 干活中 / 结果 / 出错 = 8 张，
 * 介绍页 390 / 1280 × 浅深 = 4 张，示例表单 2 张；顺带出介绍页用的 img/。
 * 跑法：xvfb-run -a node daibi/bench/shots03.js
 * 「用示例试试」打开的 https://qianshoulab.github.io/daibi/demo/ 在沙盒里打不开，用 Playwright 把它接到本地的 daibi/demo/index.html。
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const D = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'shots-0.3'); fs.mkdirSync(OUT, { recursive: true });
const IMG = path.join(D, 'img');
const PORT = 18980, SITE = n => `http://127.0.0.1:${PORT + n}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(D, 'test/site.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await sleep(500);
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-ext-'));
  fs.cpSync(path.join(D, 'extension'), ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  mf.host_permissions = [...(mf.host_permissions || []), 'http://127.0.0.1/*'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-prof-')), {
    headless: false, viewport: { width: 900, height: 760 }, deviceScaleFactor: 2, locale: 'zh-CN',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--disable-backgrounding-occluded-windows']
  });
  const demoHtml = fs.readFileSync(path.join(D, 'demo/index.html'));
  const iconPng = fs.readFileSync(path.join(D, 'img/icon.png'));
  await ctx.route('https://qianshoulab.github.io/**', r => {
    const u = r.request().url();
    if (/icon\.png$/.test(u)) return r.fulfill({ body: iconPng, contentType: 'image/png' });
    if (/\/daibi\/demo\/?$/.test(u)) return r.fulfill({ body: demoHtml, contentType: 'text/html; charset=utf-8' });
    return r.fulfill({ status: 404, body: '' });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const errors = [];
  const watch = (p, n) => { p.on('pageerror', e => errors.push(n + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(n + ' console: ' + m.text()); }); };
  const web = ctx.pages()[0] || await ctx.newPage(); watch(web, 'web');
  await web.goto(SITE(0) + '/order');
  const tmp = await ctx.newPage(); await tmp.goto(`chrome-extension://${extId}/panel.html`);
  const tabId = await tmp.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1/*' }))[0].id);
  const [panel] = await Promise.all([ctx.waitForEvent('page'), tmp.evaluate(u => chrome.windows.create({ url: u, left: 910, top: 0, width: 400, height: 820 }), `chrome-extension://${extId}/panel.html?tab=${tabId}`)]);
  await tmp.close(); await web.bringToFront();
  watch(panel, 'panel');
  await panel.setViewportSize({ width: 380, height: 760 });
  await panel.waitForSelector('#btnMain'); await sleep(600);
  const st = () => panel.evaluate(() => window.__daibi.S().st.map(x => x.s));
  const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } console.log('  超时'); return false; };
  const both = async name => {
    for (const cs of ['light', 'dark']) {
      await panel.emulateMedia({ colorScheme: cs }); await sleep(260);
      await panel.screenshot({ path: path.join(OUT, `${name}-${cs}.png`) });
    }
    await panel.emulateMedia({ colorScheme: 'light' });
  };

  // 1 空状态
  await both('panel-1-empty');
  // 右上角「…」：署名、总舵、找方丈
  await panel.click('#btnMore'); await sleep(300);
  await both('panel-5-menu');
  await panel.keyboard.press('Escape'); await sleep(200);
  // 2 干活中：用示例试试 → 自己对字段、填第 1 行；人交两行，第 3 行填好等提交
  await panel.click('#btnDemo');
  await waitFor(async () => (await st())[0] === 'filled', 10000);
  await sleep(500);
  await panel.screenshot({ path: path.join(IMG, 'panel-ready.png') });
  for (let k = 0; k < 2; k++) {
    await sleep(1200); // 人看一眼
    await web.click('button[type=submit]');
    await waitFor(async () => (await st())[k + 1] === 'filled', 8000);
  }
  await sleep(600);
  await both('panel-2-working');
  await panel.screenshot({ path: path.join(IMG, 'panel-run.png') });
  await web.screenshot({ path: path.join(OUT, 'demo-form-working-light.png') });
  await web.emulateMedia({ colorScheme: 'dark' }); await web.screenshot({ path: path.join(OUT, 'demo-form-working-dark.png') }); await web.emulateMedia({ colorScheme: 'light' });
  // 介绍页大图：网页 + 侧栏并排
  const webPng = await web.screenshot(); const panPng = await panel.screenshot();
  // 3 结果：交完剩下 3 行
  for (let k = 2; k < 5; k++) {
    await sleep(1200);
    await web.click('button[type=submit]');
    await waitFor(async () => (await st())[k] === 'done', 8000);
  }
  await waitFor(async () => (await st()).every(s => s === 'done'), 8000);
  await sleep(5500); // 等提示条收起

  await both('panel-3-result');
  // 4 出错：订单站，坏一行的表，自动提交
  await web.goto(SITE(0) + '/order');
  await panel.setInputFiles('#file', { name: '坏一行.csv', mimeType: 'text/csv', buffer: fs.readFileSync(path.join(D, 'test/data/坏一行.csv')) });
  await sleep(1500);
  if (await panel.isVisible('#warn')) await panel.click('#warnGo');
  if (!(await panel.isChecked('#set-auto'))) await panel.click('label.qs-set');
  await sleep(300);
  await panel.click('#btnMain');
  await sleep(200); if (await panel.isVisible('#warn')) await panel.click('#warnGo');
  await waitFor(async () => (await st()).every(s => s === 'done' || s === 'error') && !(await panel.evaluate(() => window.__daibi.run.going)), 30000);
  await sleep(5600);
  await both('panel-4-error');
  await panel.screenshot({ path: path.join(IMG, 'panel-error.png') });
  await panel.emulateMedia({ colorScheme: 'dark' }); await sleep(260);
  await panel.screenshot({ path: path.join(IMG, 'panel-dark.png') });
  await panel.emulateMedia({ colorScheme: 'light' });
  if (await panel.isChecked('#set-auto')) await panel.click('label.qs-set');

  // 介绍页大图
  const comp = await ctx.newPage();
  await comp.setViewportSize({ width: 800, height: 500 });
  await comp.setContent(`<html><body style="margin:0;background:#e8e8ed;display:grid;place-items:center;height:100vh">
    <div style="width:760px;border-radius:12px;overflow:hidden;box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 24px 60px rgba(0,0,0,.18);background:#fff">
      <div style="height:28px;background:#f2f2f5;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:.5px solid rgba(0,0,0,.08)">
        <i style="width:10px;height:10px;border-radius:50%;background:#ff5f57"></i><i style="width:10px;height:10px;border-radius:50%;background:#febc2e"></i><i style="width:10px;height:10px;border-radius:50%;background:#28c840"></i></div>
      <div style="display:flex;height:420px;background:#f5f5f7">
        <img src="data:image/png;base64,${webPng.toString('base64')}" style="flex:1;min-width:0;height:420px;object-fit:cover;object-position:top left">
        <img src="data:image/png;base64,${panPng.toString('base64')}" style="width:210px;height:420px;object-fit:cover;object-position:top;border-left:.5px solid rgba(0,0,0,.1)">
      </div></div></body></html>`);
  await sleep(300);
  await comp.screenshot({ path: path.join(IMG, 'hero.jpg'), type: 'jpeg', quality: 86 });
  await comp.close();

  // 介绍页：390（按手机模拟：浮动滚动条、触屏）/ 1280 × 浅深
  const plainB = await chromium.launch();
  for (const w of [390, 1280]) for (const cs of ['light', 'dark']) {
    const sctx = await plainB.newContext(w === 390 ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: cs, locale: 'zh-CN' } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: cs, locale: 'zh-CN' });
    const site = await sctx.newPage(); watch(site, 'site');
    await site.goto('file://' + path.join(D, 'index.html'));
    await site.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; })); // 整页截图：懒加载的图先叫出来
    await site.waitForFunction(() => [...document.images].every(i => i.complete)); await sleep(400);
    const sw2 = await site.evaluate(() => document.documentElement.scrollWidth);
    if (sw2 > w) errors.push(`介绍页 ${w} 宽有横向滚动：${sw2}`);
    await site.screenshot({ path: path.join(OUT, `site-${w}-${cs}.png`), fullPage: true });
    if (w === 390) { // 示例表单 390
      await site.goto('file://' + path.join(D, 'demo/index.html')); await sleep(200);
      const dw = await site.evaluate(() => document.documentElement.scrollWidth); if (dw > 390) errors.push(`示例表单 390 宽有横向滚动：${dw}`);
      await site.screenshot({ path: path.join(OUT, `demo-form-390-${cs}.png`) });
    }
    await sctx.close();
  }
  await plainB.close();

  // 参照：apple.com（打得开就截）
  try {
    const ap = await ctx.newPage();
    await ap.setViewportSize({ width: 1280, height: 800 });
    await ap.goto('https://www.apple.com/macos/', { timeout: 20000 }); await sleep(2500);
    await ap.screenshot({ path: path.join(OUT, 'ref-apple-macos.jpg'), type: 'jpeg', quality: 80 });
    await ap.goto('https://www.apple.com/iphone/', { timeout: 20000 }); await sleep(2500);
    await ap.screenshot({ path: path.join(OUT, 'ref-apple-iphone.jpg'), type: 'jpeg', quality: 80 });
  } catch (e) { console.log('apple.com 打不开：', e.message.split('\n')[0]); }

  console.log('报错：', errors.length ? errors : '无');
  await ctx.close(); server.kill(); process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
