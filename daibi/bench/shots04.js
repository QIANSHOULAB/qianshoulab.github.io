/* 0.4.0 交货截图（_ops/文案规范.md「交货前自查」）：英文、中文各走一遍真流程——
 *   侧栏 380 宽：空状态 / 「…」菜单 / 干活中 / 结果 / 出错（结果、出错另出深色）
 *   介绍页 390 / 1280，示例表单 390
 * 顺带出介绍页用的图：英文 img/en/，中文 img/。
 * 每一屏都量一遍：按钮、状态行、提示条、小标签有没有被撑破或截断（scrollWidth > clientWidth），侧栏 360 宽再量一遍；
 * 介绍页、示例表单 390 宽有没有横向滚动。量出来的写进 shots-0.4/check.json，有一条就退出码 1。
 * 跑法：xvfb-run -a node daibi/bench/shots04.js
 * 「用示例试试」打开的 https://qianshoulab.github.io/daibi/… 沙盒里打不开，用 Playwright 接到本地 daibi/ 下的文件。
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const D = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'shots-0.4'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 18990, SITE = n => `http://127.0.0.1:${PORT + n}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const issues = [], errors = [];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8', '.zip': 'application/zip' };

// 坏一行的表（第 3 行的产品选项里没有）：英文界面用英文示例改的，中文界面用中文示例改的
function badSample(lang) {
  const txt = fs.readFileSync(path.join(D, 'extension', lang === 'en' ? 'sample-en.csv' : 'sample.csv'), 'utf8').split('\n');
  txt[3] = lang === 'en' ? txt[3].replace(',Premium,', ',Enterprise,') : txt[3].replace(',旗舰版,', ',企业版,');
  return { name: lang === 'en' ? 'orders-batch-2.csv' : '第二批订单.csv', mimeType: 'text/csv', buffer: Buffer.from(txt.join('\n'), 'utf8') };
}

// 量：我们自己的字（按钮、状态、提示、标签）有没有被撑破或截断
const MEASURE = () => {
  const SEL = '#btnMain,#btnRetry,.qs-btn,.fbtn,.seg button,.sheets button,.lang-seg button,.qs-link,.pill,.top p,.top h1,.empty h2,.empty p,.toast span,.warn p,.qs-set-l,.menu-i,.menu-h,.note,.fempty p,.prog-t #sum,.tinfo-t span';
  const out = [];
  document.querySelectorAll(SEL).forEach(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
    if (el.closest('[hidden]')) return;
    const txt = el.textContent.trim(); if (!txt) return;
    if (el.scrollWidth > el.clientWidth + 1) out.push(`截断/撑破：${el.id ? '#' + el.id : el.className || el.tagName}「${txt}」 ${el.scrollWidth}>${el.clientWidth}`);
    if (el.matches('button,.qs-btn,.fbtn,.pill') && r.height > 46) out.push(`按钮挤成两行：「${txt}」 高 ${Math.round(r.height)}`);
  });
  if (document.documentElement.scrollWidth > innerWidth) out.push(`横向滚动：${document.documentElement.scrollWidth}>${innerWidth}`);
  return out;
};

async function runLang(LANG) {
  const IMG = path.join(D, LANG === 'en' ? 'img/en' : 'img'); fs.mkdirSync(IMG, { recursive: true });
  const P = n => path.join(OUT, `${LANG}-${n}.png`);
  const server = spawn(process.execPath, [path.join(D, 'test/site.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await sleep(500);
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-ext-'));
  fs.cpSync(path.join(D, 'extension'), ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  mf.host_permissions = [...(mf.host_permissions || []), 'http://127.0.0.1/*'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-prof-')), {
    headless: false, viewport: { width: 900, height: 760 }, deviceScaleFactor: 2, locale: LANG === 'en' ? 'en-US' : 'zh-CN',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--disable-backgrounding-occluded-windows']
  });
  await ctx.route('https://qianshoulab.github.io/**', r => {
    const u = new URL(r.request().url());
    let rel = decodeURIComponent(u.pathname).replace(/^\/daibi\/?/, '');
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const f = path.join(D, rel);
    if (u.pathname.startsWith('/daibi') && f.startsWith(D) && fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
    return r.fulfill({ status: 404, body: '' });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const watch = (p, n) => { p.on('pageerror', e => errors.push(`${LANG} ${n}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`${LANG} ${n} console: ${m.text()}`); }); };
  const web = ctx.pages()[0] || await ctx.newPage(); watch(web, 'web');
  await web.goto(SITE(0) + '/order');
  const tmp = await ctx.newPage(); await tmp.goto(`chrome-extension://${extId}/panel.html`);
  const tabId = await tmp.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1/*' }))[0].id);
  // 右上角选语言：第一次打开默认英文，中文这一遍先在右上角点「中文」（点完记住，下面新开的侧栏窗口直接是中文）
  await tmp.waitForSelector('#langSeg button'); await sleep(200);
  if ((await tmp.evaluate(() => window.__daibi.lang())) !== 'en') issues.push(`${LANG}: 没选过语言时侧栏不是英文`);
  if (LANG !== 'en') { await tmp.click(`#langSeg button[data-l=${LANG}]`); await sleep(300); }
  const [panel] = await Promise.all([ctx.waitForEvent('page'), tmp.evaluate(u => chrome.windows.create({ url: u, left: 910, top: 0, width: 400, height: 820 }), `chrome-extension://${extId}/panel.html?tab=${tabId}`)]);
  await tmp.close(); await web.bringToFront();
  watch(panel, 'panel');
  await panel.setViewportSize({ width: 380, height: 760 });
  await panel.waitForSelector('#btnMain'); await sleep(600);
  if ((await panel.evaluate(() => window.__daibi.lang())) !== LANG) issues.push(`${LANG}: 新开侧栏没记住选的语言`);
  const st = () => panel.evaluate(() => window.__daibi.S().st.map(x => x.s));
  const waitFor = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } issues.push(`${LANG}: 超时 ${what}`); return false; };
  const measure = async what => {
    for (const w of [380, 360]) {
      await panel.setViewportSize({ width: w, height: 760 }); await sleep(120);
      (await panel.evaluate(MEASURE)).forEach(x => issues.push(`${LANG} 侧栏 ${w} ${what}：${x}`));
    }
    await panel.setViewportSize({ width: 380, height: 760 }); await sleep(120);
  };
  const shot = async (name, dark) => {
    await panel.screenshot({ path: P(`panel-${name}-light`) });
    if (dark) { await panel.emulateMedia({ colorScheme: 'dark' }); await sleep(260); await panel.screenshot({ path: P(`panel-${name}-dark`) }); await panel.emulateMedia({ colorScheme: 'light' }); await sleep(120); }
  };

  // 1 空状态
  await measure('空状态'); await shot('1-empty', true);
  // 右上角「…」
  await panel.click('#btnMore'); await sleep(300);
  await measure('菜单'); await shot('5-menu');
  await panel.keyboard.press('Escape'); await sleep(200);
  // 2 干活中：用示例试试 → 自己对字段、填第 1 行；交两行，第 3 行填好等提交
  await panel.click('#btnDemo');
  await waitFor(async () => (await st())[0] === 'filled', 10000, '示例第 1 行');
  if (!/[?&]lang=/.test(web.url()) || !web.url().includes('lang=' + LANG)) issues.push(`${LANG}: 示例表单没带语言 ${web.url()}`);
  const webLang = await web.evaluate(() => document.documentElement.lang);
  if (webLang !== (LANG === 'en' ? 'en' : 'zh-CN')) issues.push(`${LANG}: 示例表单语言不对 ${webLang}`);
  await sleep(500);
  await panel.screenshot({ path: path.join(IMG, 'panel-ready.png') });
  for (let k = 0; k < 2; k++) {
    await sleep(1200);
    await web.click('button[type=submit]');
    await waitFor(async () => (await st())[k + 1] === 'filled', 8000, `示例第 ${k + 2} 行`);
  }
  await sleep(600);
  await measure('干活中'); await shot('2-working');
  await panel.screenshot({ path: path.join(IMG, 'panel-run.png') });
  await web.screenshot({ path: P('demo-form-working') });
  const webPng = await web.screenshot(), panPng = await panel.screenshot();
  // 3 结果
  for (let k = 2; k < 5; k++) {
    await sleep(1200);
    await web.click('button[type=submit]');
    await waitFor(async () => (await st())[k] === 'done', 8000, `示例第 ${k + 1} 行交上`);
  }
  await waitFor(async () => (await st()).every(s => s === 'done'), 8000, '示例全交');
  await measure('结果（提示条在）');
  await sleep(5500); // 等提示条收起
  await measure('结果'); await shot('3-result', true);
  const got = await web.evaluate(() => [...document.querySelectorAll('#got li')].map(li => li.textContent));
  if (got.length !== 5) issues.push(`${LANG}: 示例表单收到 ${got.length} 单`);
  // 4 出错：同一个示例表单，第二批表第 3 行的产品选项里没有；开自动提交连填
  await panel.setInputFiles('#file', badSample(LANG));
  await sleep(1500);
  if (await panel.isVisible('#warn')) await panel.click('#warnGo');
  if (!(await panel.isChecked('#set-auto'))) await panel.click('label.qs-set');
  await sleep(300);
  if ((await panel.getAttribute('#btnMain', 'data-mode')) === 'go') await panel.click('#btnMain');
  await sleep(200); if (await panel.isVisible('#warn')) await panel.click('#warnGo');
  await waitFor(async () => (await st()).every(s => s === 'done' || s === 'error') && !(await panel.evaluate(() => window.__daibi.run.going)), 30000, '第二批跑完');
  const s4 = await st();
  if (s4.filter(x => x === 'error').length !== 1 || s4[2] !== 'error') issues.push(`${LANG}: 第二批应只有第 3 行出错：${s4.join(',')}`);
  await measure('出错（提示条在）');
  await sleep(5600);
  await measure('出错'); await shot('4-error', true);
  await panel.screenshot({ path: path.join(IMG, 'panel-error.png') });
  await panel.emulateMedia({ colorScheme: 'dark' }); await sleep(260);
  await panel.screenshot({ path: path.join(IMG, 'panel-dark.png') });
  await panel.emulateMedia({ colorScheme: 'light' });
  if (await panel.isChecked('#set-auto')) await panel.click('label.qs-set');
  // 开跑前提醒（黄条）：订单站，表里「开发票」对不上、网页上「需要发票」没主
  await web.goto(SITE(0) + '/order');
  await panel.setInputFiles('#file', { name: 'orders.xlsx', mimeType: 'application/octet-stream', buffer: fs.readFileSync(path.join(D, 'test/data/订单20行.xlsx')) });
  await waitFor(() => panel.isVisible('#warn'), 6000, '黄条');
  await measure('黄条'); await shot('6-warn');

  // 介绍页大图：网页 + 侧栏并排
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
  await ctx.close(); server.kill();

  // 介绍页 390（按手机：触屏、浮动滚动条）/ 1280；示例表单 390
  const b = await chromium.launch();
  for (const w of [390, 1280]) {
    const sctx = await b.newContext(w === 390 ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: LANG === 'en' ? 'en-US' : 'zh-CN' } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: LANG === 'en' ? 'en-US' : 'zh-CN' });
    const site = await sctx.newPage(); watch(site, 'site');
    // 第一次打开：没选过就是英文；中文这一遍点右上角「中文」，刷新还是中文
    await site.goto('file://' + path.join(D, 'index.html'));
    if ((await site.evaluate(() => document.documentElement.lang)) !== 'en') issues.push(`${LANG} 介绍页 ${w}：没选过语言时不是英文`);
    if (LANG !== 'en') { await site.click(`#langSeg button[data-l=${LANG}]`); await sleep(200); await site.reload(); }
    const head = await site.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, desc: document.querySelector('meta[name=description]').content, hero: document.querySelector('.shot img').getAttribute('src') }));
    if (head.lang !== (LANG === 'en' ? 'en' : 'zh-CN') || !head.title || !head.desc || !head.hero.startsWith(LANG === 'en' ? 'img/en/' : 'img/hero')) issues.push(`${LANG} 介绍页 ${w}：语言/标题/简介/图没跟着换 ${JSON.stringify(head)}`);
    await site.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; }));
    await site.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth)); await sleep(400);
    const bad = await site.evaluate(() => {
      const o = [];
      if (document.documentElement.scrollWidth > innerWidth) o.push(`横向滚动 ${document.documentElement.scrollWidth}>${innerWidth}`);
      document.querySelectorAll('.btn,.more,.nav a,.lang-seg button').forEach(el => { const r = el.getBoundingClientRect(); if (el.scrollWidth > el.clientWidth + 1 || r.height > 50) o.push(`按钮撑破/两行「${el.textContent.trim()}」`); });
      document.querySelectorAll('[data-t],[data-th]').forEach(el => { if (!el.textContent.trim()) o.push(`空字 ${el.dataset.t || el.dataset.th}`); });
      return o;
    });
    bad.forEach(x => issues.push(`${LANG} 介绍页 ${w}：${x}`));
    await site.screenshot({ path: P(`site-${w}`), fullPage: true });
    if (w === 390) {
      await site.goto('file://' + path.join(D, 'demo/index.html')); await sleep(300);
      const dbad = await site.evaluate(() => { const o = []; if (document.documentElement.scrollWidth > innerWidth) o.push('横向滚动'); document.querySelectorAll('[data-t]').forEach(el => { if (!el.textContent.trim()) o.push('空字 ' + el.dataset.t); }); return o; });
      dbad.forEach(x => issues.push(`${LANG} 示例表单 390：${x}`));
      await site.screenshot({ path: P('demo-form-390') });
    }
    await sctx.close();
  }
  await b.close();
}

(async () => {
  for (const L of ['en', 'zh']) { console.log('\n[' + L + ']'); await runLang(L); }
  fs.writeFileSync(path.join(OUT, 'check.json'), JSON.stringify({ issues, errors }, null, 1));
  console.log('量出来的毛病：', issues.length ? issues : '无');
  console.log('报错：', errors.length ? errors : '无');
  process.exit(issues.length || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
