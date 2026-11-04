/* 商店上架图（_ops/上架单.md）：真装插件，侧栏走一遍「用示例试试」真流程，拍网页 + 侧栏，摆进 1280×800 的图里加一句大字。英文、中文各一套。
 * 另出小宣传图 440×280（图标 + 英文名 + 一句话）、商店图标 128×128（96×96 图案 + 四边 16 透明）。
 * 每张都量：大字是不是一行；侧栏里我们自己的字（按钮、状态、提示条、小标签）有没有被撑破或截断。有一条就退出码 1。
 * 跑法：xvfb-run -a node daibi/bench/store.js   → daibi/store/shots/{en,zh}/1…4.png、store/promo-440x280.png、store/icon-128.png
 * 「用示例试试」打开的 https://qianshoulab.github.io/daibi/… 用 Playwright 接到本地 daibi/ 下的文件（跟 shots04.js 一样）。
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');

const D = path.resolve(__dirname, '..');
const OUT = path.join(D, 'store');
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-store-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const issues = [], errors = [];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8' };
const WEB_W = 800, PAN_W = 380, VH = 616; // 假窗口里：网页 800 + 侧栏 380，高 616（CSS px），拍的时候 2 倍
const CAP = {
  en: ['Drop in a spreadsheet. It fills the form.', 'Columns find their fields on their own.', 'Five rows in. You typed nothing.', 'Errors say why. One click to retry.'],
  zh: ['Excel 丢进来，网页表单它来填。', '表头自己对上输入框。', '五行交完，你一个字没打。', '出错写明原因，一下重试。']
};
const FONT = `-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","PingFang SC","Hiragino Sans GB","Microsoft YaHei UI","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif`;
const b64 = f => fs.readFileSync(f).toString('base64');

// 坏一行的表（第 3 行的产品选项里没有），跟 shots04.js 一样
function badSample(lang) {
  const txt = fs.readFileSync(path.join(D, 'extension', lang === 'en' ? 'sample-en.csv' : 'sample.csv'), 'utf8').split('\n');
  txt[3] = lang === 'en' ? txt[3].replace(',Premium,', ',Enterprise,') : txt[3].replace(',旗舰版,', ',企业版,');
  return { name: lang === 'en' ? 'orders-batch-2.csv' : '第二批订单.csv', mimeType: 'text/csv', buffer: Buffer.from(txt.join('\n'), 'utf8') };
}

// 量：侧栏里我们自己的字有没有被撑破或截断（跟 shots04.js 同一套选择器）
const MEASURE = () => {
  const SEL = '#btnMain,#btnRetry,.qs-btn,.fbtn,.seg button,.sheets button,.lang-seg button,.qs-link,.pill,.top p,.top h1,.empty h2,.empty p,.toast span,.warn p,.qs-set-l,.menu-i,.menu-h,.note,.fempty p,.prog-t #sum,.tinfo-t span,.fcol,.fto';
  const out = [];
  document.querySelectorAll(SEL).forEach(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.top > innerHeight || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden]')) return;
    const txt = el.textContent.trim(); if (!txt) return;
    if (el.scrollWidth > el.clientWidth + 1) out.push(`截断/撑破：${el.id ? '#' + el.id : el.className || el.tagName}「${txt}」`);
    if (el.matches('button,.qs-btn,.fbtn,.pill') && r.height > 46) out.push(`按钮挤成两行：「${txt}」`);
  });
  if (document.documentElement.scrollWidth > innerWidth) out.push('横向滚动');
  return out;
};

// 停在一个不切字的位置：从想要的 scrollY 附近找，看得见的那一段（扣掉顶栏、底栏）上下两条边都不压着一行字或一个输入框
const PLACE = ({ y, topSel, dockSel }) => {
  const top = topSel && document.querySelector(topSel), dock = dockSel && document.querySelector(dockSel);
  const fixed = el => !!el && ((top && top.contains(el)) || (dock && dock.contains(el)));
  const rects = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim() || fixed(n.parentElement) || n.parentElement.closest('[hidden]')) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const b of rg.getClientRects()) if (b.width > 0 && b.height > 0) rects.push([b.top + scrollY, b.bottom + scrollY]);
  }
  document.querySelectorAll('input,select,textarea,button').forEach(el => { if (fixed(el)) return; const b = el.getBoundingClientRect(); if (b.height) rects.push([b.top + scrollY, b.bottom + scrollY]); });
  const max = document.documentElement.scrollHeight - innerHeight;
  const lo = top ? top.getBoundingClientRect().bottom : 0, hi = dock ? dock.getBoundingClientRect().top : innerHeight;
  const ok = s => rects.every(([a, b]) => !((a < s + lo && b > s + lo) || (a < s + hi && b > s + hi)));
  for (let d = 0; d <= 200; d += 2) for (const s of [y + d, y - d]) if (s >= 0 && s <= max && ok(s)) { scrollTo(0, s); return s; }
  scrollTo(0, Math.max(0, Math.min(max, y))); return null;
};
const NO_BAR = '::-webkit-scrollbar{display:none}'; // 示例表单的滚动条：Linux 沙盒里是老式灰条，Mac / Win11 平时不露

async function capture(LANG) {
  const R = n => path.join(RAW, `${LANG}-${n}.png`);
  // 原样复制一份装（manifest 一个字不改：示例表单在 qianshoulab.github.io，正式包本来就带这个网站权限，不用授权）
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-ext-'));
  fs.cpSync(path.join(D, 'extension'), ext, { recursive: true });
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-prof-')), {
    headless: false, viewport: { width: WEB_W, height: VH }, deviceScaleFactor: 2, locale: LANG === 'en' ? 'en-US' : 'zh-CN', colorScheme: 'light',
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
  await web.goto('https://qianshoulab.github.io/daibi/demo/');
  const tmp = await ctx.newPage(); await tmp.goto(`chrome-extension://${extId}/panel.html`);
  const tabId = await tmp.evaluate(async () => (await chrome.tabs.query({ url: 'https://qianshoulab.github.io/*' }))[0].id);
  await tmp.waitForSelector('#langSeg button'); await sleep(200);
  if (LANG !== 'en') { await tmp.click(`#langSeg button[data-l=${LANG}]`); await sleep(300); } // 跟真人一样点右上角「中文」，选过就记住
  const [panel] = await Promise.all([ctx.waitForEvent('page'), tmp.evaluate(u => chrome.windows.create({ url: u, left: 820, top: 0, width: 400, height: 700 }), `chrome-extension://${extId}/panel.html?tab=${tabId}`)]);
  await tmp.close(); await web.bringToFront();
  watch(panel, 'panel');
  await panel.setViewportSize({ width: PAN_W, height: VH });
  await panel.waitForSelector('#btnMain'); await sleep(600);
  const st = () => panel.evaluate(() => window.__daibi.S().st.map(x => x.s));
  const waitFor = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } issues.push(`${LANG}: 超时 ${what}`); return false; };
  // webY：网页想停的位置（数字，或一个元素：把它放到离顶 140 的地方）；sec：侧栏里想贴着顶栏的那一节
  const shot = async (name, webY, sec) => {
    await panel.evaluate(() => document.activeElement && document.activeElement.blur()); await panel.mouse.move(2, 300);
    await web.addStyleTag({ content: NO_BAR }).catch(() => {});
    const wy = typeof webY === 'string' ? await web.evaluate(sel => Math.round(document.querySelector(sel).getBoundingClientRect().top + scrollY - 140), webY) : webY;
    if ((await web.evaluate(PLACE, { y: wy })) == null) issues.push(`${LANG} ${name}：网页找不到不切字的位置`);
    if (sec) {
      const py = await panel.evaluate(sel => { const e = document.querySelector(sel), t = document.querySelector('.top'); return Math.round(e.getBoundingClientRect().top + scrollY - t.getBoundingClientRect().height - 4); }, sec);
      if ((await panel.evaluate(PLACE, { y: py, topSel: '.top', dockSel: '.dock' })) == null) issues.push(`${LANG} ${name}：侧栏找不到不切字的位置`);
    } else await panel.evaluate(() => scrollTo(0, 0));
    await sleep(300);
    (await panel.evaluate(MEASURE)).forEach(x => issues.push(`${LANG} 侧栏 ${name}：${x}`));
    await panel.screenshot({ path: R(name + '-panel') });
    await web.screenshot({ path: R(name + '-web') });
  };

  // 用示例试试：读示例表、开示例表单、自己对字段、填好第 1 行
  await panel.click('#btnDemo');
  await waitFor(async () => (await st())[0] === 'filled', 10000, '示例第 1 行');
  // 交第 1 行，第 2 行自己填好（字段那张拍第 2 行：网页上的人跟第 1 张不一样，邮箱也短，预览不出省略号）
  await sleep(1200); await web.click('button[type=submit]');
  await waitFor(async () => (await st())[1] === 'filled', 8000, '示例第 2 行');
  await sleep(5800); // 等提示条收起
  // 2. 字段：点「全部」展开，看表头各对上了哪个框
  await panel.click('#fieldList [data-act="fold"]'); await sleep(400);
  await shot('fields', 0, '#fieldSec');
  await panel.click('#fieldList [data-act="fold"]'); await sleep(300);
  await panel.evaluate(() => scrollTo(0, 0));
  // 1. 再交一行，第 3 行填好等你提交
  for (let k = 1; k < 2; k++) {
    await sleep(1200);
    await web.click('button[type=submit]');
    await waitFor(async () => (await st())[k + 1] === 'filled', 8000, `示例第 ${k + 2} 行`);
  }
  await sleep(700); await shot('hero', 0, '#rowSec');
  // 3. 剩下三行交完：网页上收到 5 单
  for (let k = 2; k < 5; k++) {
    await sleep(1200);
    await web.click('button[type=submit]');
    await waitFor(async () => (await st())[k] === 'done', 8000, `示例第 ${k + 1} 行交上`);
  }
  await waitFor(async () => (await st()).every(s => s === 'done'), 8000, '示例全交');
  await sleep(5600); // 等提示条收起
  const got = await web.evaluate(() => document.querySelectorAll('#got li').length);
  if (got !== 5) issues.push(`${LANG}: 示例表单收到 ${got} 单`);
  await shot('done', 'h2[data-t="form.got"]', '#rowSec');
  await web.evaluate(() => scrollTo(0, 0)); await panel.evaluate(() => scrollTo(0, 0));
  // 4. 出错：第二批表第 3 行的产品选项里没有；开「自动提交」连填
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
  await sleep(5600);
  await shot('error', 0, '#rowSec');
  await ctx.close();
}

function frame(lang, cap, name) {
  const R = n => path.join(RAW, `${lang}-${n}.png`);
  return `<!doctype html><html lang="${lang === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1280px;height:800px;overflow:hidden;background:#f5f5f7;font-family:${FONT};-webkit-font-smoothing:antialiased}
  h1{position:absolute;left:40px;right:40px;top:38px;margin:0;text-align:center;font-size:36px;line-height:44px;font-weight:700;letter-spacing:-.02em;color:#1d1d1f;white-space:nowrap}
  html[lang=zh-CN] h1{letter-spacing:0}
  .win{position:absolute;left:50px;top:118px;width:${WEB_W + PAN_W}px;height:${VH + 36}px;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.14),0 24px 60px rgba(0,0,0,.14)}
  .bar{height:36px;box-sizing:border-box;background:#ececf0;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:.5px solid rgba(0,0,0,.1)}
  .bar i{width:12px;height:12px;border-radius:50%}
  .ct{display:flex;height:${VH}px}
  .ct img{display:block;height:${VH}px}
  .ct .pn{width:${PAN_W}px;border-left:.5px solid rgba(0,0,0,.12)}
  </style></head><body><h1>${cap}</h1>
  <div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
  <div class="ct"><img style="width:${WEB_W}px" src="data:image/png;base64,${b64(R(name + '-web'))}"><img class="pn" src="data:image/png;base64,${b64(R(name + '-panel'))}"></div></div></body></html>`;
}

async function compose(browser, lang) {
  const dir = path.join(OUT, 'shots', lang); fs.mkdirSync(dir, { recursive: true });
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const order = ['hero', 'fields', 'done', 'error'];
  for (let i = 0; i < order.length; i++) {
    await p.setContent(frame(lang, CAP[lang][i], order[i])); await p.evaluate(() => document.fonts.ready); await sleep(200);
    const h = await p.evaluate(() => { const e = document.querySelector('h1'), r = e.getBoundingClientRect(); return { h: r.height, over: e.scrollWidth > e.clientWidth + 1 }; });
    if (h.h > 50 || h.over) issues.push(`${lang} 第 ${i + 1} 张大字不是一行或出框`);
    await p.screenshot({ path: path.join(dir, `${i + 1}.png`) });
  }
  await p.close();
}

// 小宣传图 440×280：图标 + 英文名 + 一句话；商店图标 128×128：96 图案 + 四边 16 透明
async function promoAndIcon(browser) {
  // 英文名、一句话从 strings.js 取（跟 strings04.js 一样在 vm 里跑 i18n.js + strings.js，挂钩子接住字典）
  const vm = require('vm'), box = {}; box.globalThis = box; vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(D, 'extension/lib/i18n.js'), 'utf8'), box);
  const STR = {}, add0 = box.QSLib.i18n.add;
  box.QSLib.i18n.add = (l, o) => { STR[l] = Object.assign(STR[l] || {}, o); add0(l, o); };
  vm.runInContext(fs.readFileSync(path.join(D, 'extension/strings.js'), 'utf8'), box);
  const en = STR.en || {};
  const svg = fs.readFileSync(path.join(D, 'img/icon.svg'), 'utf8');
  const p = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    html,body{margin:0;width:440px;height:280px;overflow:hidden;background:#f5f5f7;font-family:${FONT};-webkit-font-smoothing:antialiased}
    main{height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
    .ic{width:88px;height:88px;filter:drop-shadow(0 6px 14px rgba(58,65,80,.28))}
    h1{margin:20px 0 0;font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-.02em;color:#1d1d1f;white-space:nowrap}
    p{margin:8px 0 0;font-size:17px;line-height:1.4;color:#6e6e73;white-space:nowrap}
  </style></head><body><main><div class="ic">${svg.replace('<svg ', '<svg width="88" height="88" ')}</div>
  <h1>${en['app.full']}</h1><p>${en['app.tag']}</p></main></body></html>`);
  await p.evaluate(() => document.fonts.ready);
  if (!en['app.full'] || !en['app.tag']) issues.push('小宣传图没取到英文名 / 一句话');
  const over = await p.evaluate(() => [...document.querySelectorAll('h1,p')].some(e => e.getBoundingClientRect().right > 440 - 16 || e.getBoundingClientRect().left < 16));
  if (over) issues.push('小宣传图字出框');
  await p.screenshot({ path: path.join(OUT, 'promo-440x280.png') });
  await p.close();
  const q = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
  await q.setContent(`<html><body style="margin:0;background:transparent"><div style="padding:16px;width:96px;height:96px">${svg.replace('<svg ', '<svg width="96" height="96" style="display:block" ')}</div></body></html>`);
  await q.screenshot({ path: path.join(OUT, 'icon-128.png'), omitBackground: true });
  await q.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const L of ['en', 'zh']) { console.log('[' + L + ']'); await capture(L); await compose(browser, L); }
  await promoAndIcon(browser);
  await browser.close();
  console.log('raw', RAW);
  console.log('量出来的毛病：', issues.length ? issues : '无');
  console.log('报错：', errors.length ? errors : '无');
  process.exit(issues.length || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
