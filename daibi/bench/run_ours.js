/* 代笔僧上场：真装插件（Playwright 的 Chromium，--load-extension），8 个网站各用 20 行表自动连填，
 * 服务器收到什么记进 results/ours-<N>.json，交给 score.py 判。
 * 跑法：cd daibi/bench && python3 gen.py && (cd real && npm ci && node build.js) && xvfb-run -a node run_ours.js [20|100] [网站,网站…]
 * 和 daibi/test/e2e.js 一样：侧栏当普通标签页开（panel.html?tab=<id>），测试副本 manifest 预给 127.0.0.1 权限（真用户这里点一次「允许」，算进动手次数）。
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const N = process.argv[2] || '20';
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const PORT = 18800;
const SITES = ['plain', 'react', 'dd', 'iframe', 'wizard', 'ajax', 'valid', 'date', 'antd', 'element', 'mui', 'select2', 'shadow'];
const PORTOF = { plain: 0, react: 1, dd: 2, iframe: 3, wizard: 4, ajax: 5, valid: 6, date: 7, antd: 9, element: 10, mui: 11, select2: 12, shadow: 13 }; // +8 是 iframe 里那张表
const URLS = { wizard: '/w/1' };
const NEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'answers.json'), 'utf8'));
const COLS = { plain: 9, react: 6, dd: 3, iframe: 4, wizard: 8, ajax: 4, valid: 5, date: 2, antd: 5, element: 5, mui: 5, select2: 4, shadow: 5 };
// 自动没对上时，人会去网页上点哪个元素（点选）
const PICK = {
  dd: { 产品: '.dd[data-name=product]', 城市: '.dd[data-name=city]' },
  iframe: { 姓名: '#i1', 手机: '#i2', 邮箱: '#i3', 公司: '#i4' },
  date: { 交付日期: '#t2' },
};
const OUT = path.join(__dirname, 'results'); fs.mkdirSync(OUT, { recursive: true });
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'site.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
  await sleep(600);
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-ext-'));
  fs.cpSync(path.resolve(__dirname, '../extension'), ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  mf.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-prof-')), {
    headless: false, viewport: { width: 900, height: 820 }, locale: 'zh-CN',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--disable-backgrounding-occluded-windows', '--window-position=0,0']
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const web = ctx.pages()[0] || await ctx.newPage();
  web.on('dialog', d => d.dismiss().catch(() => {}));
  const errors = [];
  web.on('pageerror', e => errors.push('web: ' + e.message));
  if (process.env.DBGWEB) web.on('console', m => /DAIBIDBG/.test(m.text()) && console.log('   ', m.text()));
  await web.goto(`http://127.0.0.1:${PORT}/`);
  // 侧栏单开一个窗口：网页标签留在前台，跟真用户（侧栏 + 网页并排）一样。
  // 0.2.1 以前侧栏是同一窗口里的另一个标签，网页在后台，动画和 requestAnimationFrame 不走——自建表单无所谓，组件库的下拉/日历会卡住。
  const tmp = await ctx.newPage();
  await tmp.goto(`chrome-extension://${extId}/panel.html`);
  const tabId = await tmp.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1/*' }))[0].id);
  const [panel] = await Promise.all([ctx.waitForEvent('page'), tmp.evaluate(u => chrome.windows.create({ url: u, left: 910, top: 0, width: 400, height: 860 }), `chrome-extension://${extId}/panel.html?tab=${tabId}`)]);
  await tmp.close();
  await web.bringToFront();
  panel.on('pageerror', e => errors.push('panel: ' + e.message));
  await panel.setViewportSize({ width: 380, height: 820 });
  await panel.waitForSelector('#btnMain');

  const st = () => panel.evaluate(() => window.__daibi.S().st);
  const binds = () => panel.evaluate(() => { const d = window.__daibi; return (d.maps()[d.tab.origin] || {}).b || null; });
  const reset = () => fetch(`http://127.0.0.1:${PORT}/api/reset`, { method: 'POST' });
  const getLog = async () => (await fetch(`http://127.0.0.1:${PORT}/api/log`)).json();
  const xlsx = path.join(__dirname, 'data', `表${N}.xlsx`);
  const put = () => panel.setInputFiles('#file', { name: path.basename(xlsx), mimeType: 'application/octet-stream', buffer: fs.readFileSync(xlsx) });
  const RF = path.join(OUT, `ours-${N}.json`);
  const results = ONLY && fs.existsSync(RF) ? JSON.parse(fs.readFileSync(RF, 'utf8')) : {};

  for (const site of SITES.filter(s => !ONLY || ONLY.includes(s))) {
    const k = PORTOF[site];
    console.log(`\n[${site}]`);
    await reset();
    await web.goto(`http://127.0.0.1:${PORT + k}${URLS[site] || '/'}`);
    await put();
    await sleep(1500);
    let b = await binds() || {};
    const auto = Object.fromEntries(Object.entries(b).map(([h, x]) => [h, x.label]));
    console.log('  自动对上：', JSON.stringify(auto));
    // 该填的列（看标准答案第一条非空的键）里没对上的，照人的做法去点选
    const want = Object.keys(NEED[N][site].find(Boolean));
    const picks = [], pickFail = [];
    if (process.env.DBG) console.log(await panel.evaluate(() => document.getElementById("fieldSec").outerHTML.slice(0, 3000)));
    let unfold = 0;
    for (const h of want) {
      if (b[h]) continue;
      if (PICK[site] && PICK[site][h] && !(await panel.isVisible(`.frow[data-h="${h}"]`).catch(() => false)) && await panel.isVisible('[data-act=fold]').catch(() => false)) {
        await panel.click('[data-act=fold]'); unfold++; await sleep(300); // 0.2.0 把这页用不上的列收起来了，要先点「展开」
      }
      const loc = PICK[site] && PICK[site][h];
      await panel.hover(`.frow[data-h="${h}"]`).catch(() => {});
      if (!loc || !(await panel.isVisible(`.frow[data-h="${h}"] [data-act=pick]`).catch(() => false))) { pickFail.push(h + '(没有点选入口)'); continue; }
      await panel.click(`.frow[data-h="${h}"] [data-act=pick]`);
      await sleep(400);
      try {
        if (site === 'iframe') await web.frameLocator('iframe').locator(loc).click({ timeout: 2000 });
        else await web.click(loc, { timeout: 2000 });
      } catch (e) {}
      await sleep(800);
      b = await binds() || {};
      if (b[h]) picks.push(h); else { pickFail.push(h); await panel.click(`.frow[data-h="${h}"] [data-act=pick]`).catch(() => {}); await panel.keyboard.press('Escape').catch(() => {}); }
    }
    console.log('  展开', unfold, '次  点选成功：', picks.join(',') || '无', ' 点选不成：', pickFail.join(',') || '无');
    if (!(await panel.isChecked('#set-auto'))) await panel.click('label.qs-set');
    await sleep(300);
    const mainTxt = (await panel.textContent('#btnMain')).trim();
    if (site === 'react' || site === 'plain') await panel.screenshot({ path: path.join(SHOTS, `ours-${site}-ready.png`) });
    const t0 = Date.now(); let secs = null, warned = 0;
    if (/连填/.test(mainTxt)) {
      await panel.click('#btnMain');
      await sleep(150);
      if (await panel.isVisible('#warn')) { warned = 1; console.log('  开跑前提醒：', (await panel.textContent('#warnTxt')).trim()); await panel.click('#warnGo'); }
      while (Date.now() - t0 < 240000) {
        const s = await st();
        if (s.every(x => x.s === 'done' || x.s === 'error') && !(await panel.evaluate(() => window.__daibi.run.going))) break;
        if (!(await panel.evaluate(() => window.__daibi.run.going)) && Date.now() - t0 > 3000) break;
        await sleep(200);
      }
      secs = +((Date.now() - t0) / 1000).toFixed(1);
    }
    const s = await st();
    const lg = (await getLog()).filter(x => x.site === site || (site === 'iframe' && x.site === 'inner'));
    const errs = s.map((x, i) => x.s === 'error' ? `${i + 1}:${x.m}` : null).filter(Boolean);
    console.log(`  主按钮「${mainTxt}」 用时 ${secs}s  完成 ${s.filter(x => x.s === 'done').length}  出错 ${errs.length}  服务器收到 ${lg.length}`);
    errs.slice(0, 6).forEach(e => console.log('    ' + e));
    results[site] = { auto, picks, pickFail, unfold, warned, secs, mainTxt, status: s, received: lg.map(x => x.f) };
    await panel.screenshot({ path: path.join(SHOTS, `ours-${site}-end.png`) });
    if (site === 'plain') await web.screenshot({ path: path.join(SHOTS, `ours-${site}-web.png`) });
  }
  results._errors = errors;
  fs.writeFileSync(RF, JSON.stringify(results, null, 1));
  console.log('\n页面报错：', errors.length ? errors.slice(0, 10) : '无');
  await ctx.close(); server.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
