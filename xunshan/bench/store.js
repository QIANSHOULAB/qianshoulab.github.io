// 商店上架图（_ops/上架单.md）：真装插件、在本地测试店上真点一遍，拍真界面，再摆进 1280×800 的图里加一句大字。英文、中文各一套。
// 另出小宣传图 440×280（图标 + 英文名 + 一句话）、商店图标 128×128（96×96 图案 + 四边 16 透明）。
// 每张都量：大字是不是一行、没出框；界面里我们自己的字有没有被省略号截断、按钮有没有挤两行 / 撑破。有一条就退出码 1。
// 用法：node xunshan/bench/store.js   → xunshan/store/shots/{en,zh}/1…4.png、store/promo-440x280.png、store/icon-128.png
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'store');
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-store-'));
const PORT = 18893, BASE = `http://localhost:${PORT}`;
// 测试店在浏览器里叫 hillstore.example（保留给示例用的域名，映射到本地测试站），截图里不露 localhost:端口
const SHOP = 'http://hillstore.example';
const sleep = ms => new Promise(r => setTimeout(r, ms));
require(path.join(ROOT, 'extension/lib/strings.js'));
const QS = globalThis.QS;
const errors = [], layout = [];

const VW = 1180, VH = 616;          // 假窗口里网页那块（CSS px），拍的时候 2 倍
const POP_W = 380, POP_MAX = 600;   // Chrome 弹窗最高 600
const CAP = {
  en: ['One click. Watching.', 'It calls. With receipts.', 'Pick any part of a page.', 'A whole list, one paste.'],
  zh: ['点一下，就盯上。', '变了就叫，还留了照。', '想盯哪块，框哪块。', '一串网址，一次贴。']
};
const FONT = `-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","PingFang SC","Hiragino Sans GB","Microsoft YaHei UI","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif`;
const b64 = f => fs.readFileSync(f).toString('base64');

// 界面里量：我们的控件挤两行 / 撑出框；带省略号被截断的字
async function measure(page, where) {
  const r = await page.evaluate(() => {
    const roots = [document];
    document.querySelectorAll('*').forEach(e => { if (e.shadowRoot) roots.push(e.shadowRoot); });
    const vis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.top < innerHeight && getComputedStyle(el).visibility !== 'hidden'; };
    const lines = el => {
      const tops = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const b of rg.getClientRects()) if (b.width > 1 && !tops.some(t => Math.abs(t - b.top) < 4)) tops.push(b.top);
      }
      return tops.length;
    };
    const CTRL = 'button.btn, a.btn, .pick, .chip, .seg button, .lang button, .all, .go, .menu button, .toast button, .pn .b, .pn .iv, .pn .seg button, .hint';
    const bad = [], cut = [];
    for (const root of roots) {
      for (const el of root.querySelectorAll(CTRL)) {
        if (!vis(el)) continue;
        const txt = el.textContent.replace(/\s+/g, ' ').trim(); if (!txt) continue;
        if (lines(el) > 1) bad.push('两行：' + txt);
        else if (el.scrollWidth > el.clientWidth + 1) bad.push('撑出框：' + txt);
      }
      for (const el of root.querySelectorAll('*')) {
        if (!vis(el) || el.children.length > 2) continue;
        if (getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) cut.push(el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60));
      }
    }
    return { bad, cut, hoz: document.documentElement.scrollWidth > innerWidth };
  });
  for (const b of r.bad) layout.push(where + ' ' + b);
  for (const c of r.cut) layout.push(where + ' 截断：' + c);
  if (r.hoz) layout.push(where + ' 横向滚动');
}

async function capture(lang) {
  QS.setLang(lang);
  await fetch(BASE + '/_step?k=0'); await fetch(BASE + '/_slow?ms=0'); await fetch(BASE + '/_lang?l=' + lang);
  // 测试副本：给 localhost 预授权（浏览器权限弹窗自动化点不了；正式包按网站现要）
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ext-'));
  fs.cpSync(path.join(ROOT, 'extension'), ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
  mf.host_permissions = [SHOP + '/*'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ud-')), {
    channel: 'chromium', headless: true, viewport: { width: VW, height: VH }, deviceScaleFactor: 2, colorScheme: 'light',
    locale: lang === 'en' ? 'en-US' : 'zh-CN',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--host-resolver-rules=MAP hillstore.example 127.0.0.1:${PORT}`]
  });
  ctx.on('page', p => { p.on('pageerror', e => errors.push(lang + ' ' + p.url() + ' :: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(lang + ' ' + p.url() + ' :: ' + m.text()); }); });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const X = p => `chrome-extension://${sw.url().split('/')[2]}/${p}`;
  const WS = () => sw.evaluate(() => chrome.storage.local.get('watches').then(o => o.watches || {}));
  const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(250); } return null; };
  const tabIdOf = url => sw.evaluate(u => chrome.tabs.query({}).then(ts => (ts.find(t => (t.url || '') === u) || {}).id), url);
  const R = n => path.join(RAW, `${lang}-${n}.png`);
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: POP_W, height: POP_MAX });
  const open = async p => { const pg = await ctx.newPage(); await pg.goto(SHOP + p); return pg; };
  const popFor = async p => { await pop.setViewportSize({ width: POP_W, height: POP_MAX }); await pop.goto(X('popup.html?tab=' + (await tabIdOf(SHOP + p)))); await pop.waitForSelector('[data-a="pick"]'); };
  const addRow = async (kind, cond) => {
    const label = QS.t(kind);
    const rows = await pop.$$eval('.row.cand[data-k]', els => els.map(e => e.querySelector('.t').textContent));
    await pop.locator(`.row.cand[data-k="${rows.indexOf(label)}"]`).click();
    await pop.waitForSelector('.sub');
    if (cond) { await pop.locator(`.sub [data-c="${cond[0]}"]`).click(); if (cond[1] != null) { await pop.fill('#cv', String(cond[1])); await pop.press('#cv', 'Enter'); } }
  };
  // 弹窗照内容高度拍（跟真弹窗一样，最高 600）
  const popShot = async name => {
    await sleep(400);
    await pop.setViewportSize({ width: POP_W, height: 100 }); await sleep(150);
    const h = await pop.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    await pop.setViewportSize({ width: POP_W, height: Math.min(h, POP_MAX) }); await sleep(200);
    await measure(pop, `${lang} 弹窗 ${name}`);
    await pop.screenshot({ path: R(name) });
    return Math.min(h, POP_MAX);
  };

  // 4. 加一串：同一家店 5 个商品，低于 100 就叫（先拍：清单还空着，底下不露半截别的）
  const app = await ctx.newPage();
  await app.goto(X('app.html#add')); await app.waitForSelector('#urls');
  if (lang === 'zh') { // 跟真人一样点右上角「中文」，选过就记住
    await app.click('#lang [data-l="zh"]'); await app.waitForFunction(() => document.documentElement.lang === 'zh-CN');
    await app.reload(); await app.waitForSelector('#urls');
  }
  await app.fill('#urls', [1, 2, 3, 4, 5].map(i => SHOP + '/shop/' + i).join('\n')); await app.fill('#lim', '100');
  await app.dispatchEvent('#urls', 'input'); await app.evaluate(() => { document.activeElement.blur(); document.getElementById('urls').scrollTop = 0; scrollTo(0, 0); }); await sleep(400);
  await measure(app, `${lang} 加一串`);
  await app.screenshot({ path: R('batch') });

  // 1. 打开商品页，点巡山僧：认出价格和库存，点价格那行就盯上了
  const price = await open('/price');
  // 商品页往左收一点，别让弹窗压住商品名（只动测试店的版式）
  await price.addStyleTag({ content: 'main,footer{margin-left:16px!important}main{grid-template-columns:280px 1fr!important}.pic{height:280px!important}' });
  await measure(price, `${lang} 商品页`);
  await price.screenshot({ path: R('page1') });
  await popFor('/price'); await pop.waitForSelector('.row.cand[data-k]');
  await addRow('kindPrice');
  await until(async () => Object.values(await WS()).some(w => w.lastText != null));
  await popFor('/price'); await pop.waitForSelector('.row.cand.on');
  const popH = await popShot('pop1');

  // 再盯几处：登山包等到货、台灯低于 420、店铺公告整页
  for (const [p, kind, c] of [['/stock', 'kindStock'], ['/item', 'kindPrice', ['below', 420]]]) {
    const pg = await open(p); await popFor(p); await addRow(kind, c); await sleep(400); await pg.close();
  }
  const live = await open('/live'); await popFor('/live'); await pop.click('[data-a="whole"]'); await sleep(600); await live.close();

  // 3. 订单状态认不出：自己框一块
  const ord = await open('/login?go=1'); await ord.waitForSelector('#status');
  await popFor('/orders'); await pop.click('[data-a="pick"]');
  await ord.bringToFront(); await ord.waitForSelector('qianshou-picker');
  const b = await ord.locator('#status').boundingBox();
  await ord.mouse.move(b.x + 10, b.y + 8); await ord.mouse.click(b.x + 10, b.y + 8);
  await ord.waitForSelector('qianshou-picker .pn .seg'); await sleep(900);
  await measure(ord, `${lang} 框选面板`);
  await ord.screenshot({ path: R('pick') });
  await ord.keyboard.press('Escape'); await ord.close();

  // 过了一阵：降价、到货、出了新公告（剧本第 2、3 步）
  await until(async () => Object.values(await WS()).every(w => w.lastText != null), 20000);
  await sw.evaluate(async () => { const ws = (await chrome.storage.local.get('watches')).watches; for (const w of Object.values(ws)) w.created = Date.now() - 3600e3; await chrome.storage.local.set({ watches: ws }); });
  for (const k of [2, 3]) { await fetch(BASE + '/_step?k=' + k); for (const id of Object.keys(await WS())) await sw.evaluate(id => handlers.checkNow({ id }), id); }

  // 2. 总览：耳机 1,299 → 1,099 → 899，变化记录带前后截图
  const pid = Object.values(await WS()).find(w => w.url.endsWith('/price')).id;
  // 名字去掉店名前缀（跟人在总览里改名一样，存成 label），清单里不出省略号
  await sw.evaluate(async () => { const ws = (await chrome.storage.local.get('watches')).watches; const cut = x => x.replace(/^(Hill Store|山货铺) · /, ''); for (const w of Object.values(ws)) { if (w.label) w.label = cut(w.label); else if (w.title) w.title = cut(w.title); } await chrome.storage.local.set({ watches: ws }); });
  await app.goto(X('app.html#' + pid)); await app.waitForSelector('#hist .he'); await sleep(800);
  // 滚到变化记录：标题贴着顶栏下面，前后两张截图都在一屏里
  await app.evaluate(() => { const h = document.querySelector('.hist-h'); if (h) scrollTo(0, Math.max(0, h.getBoundingClientRect().top + scrollY - 84)); }); await sleep(400);
  await measure(app, `${lang} 总览`);
  await app.screenshot({ path: R('app') });
  await ctx.close();
  return { popH };
}

// 摆图：一句大字 + 一个干净的窗口框（只留红黄绿三个点），里面是真界面
function frame(lang, cap, inner, toolbarIcon) {
  return `<!doctype html><html lang="${lang === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1280px;height:800px;overflow:hidden;background:#f5f5f7;font-family:${FONT};-webkit-font-smoothing:antialiased}
  h1{position:absolute;left:40px;right:40px;top:38px;margin:0;text-align:center;font-size:36px;line-height:44px;font-weight:700;letter-spacing:-.02em;color:#1d1d1f;white-space:nowrap}
  html[lang=zh-CN] h1{letter-spacing:0}
  .win{position:absolute;left:50px;top:118px;width:${VW}px;height:${VH + 36}px;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.14),0 24px 60px rgba(0,0,0,.14)}
  .bar{height:36px;box-sizing:border-box;background:#ececf0;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:.5px solid rgba(0,0,0,.1);position:relative}
  .bar i{width:12px;height:12px;border-radius:50%}
  .tb{position:absolute;right:22px;top:5px;width:26px;height:26px;border-radius:7px;background:rgba(0,0,0,.08);display:grid;place-items:center}
  .tb img{width:16px;height:16px}
  .ct{position:relative;width:${VW}px;height:${VH}px;overflow:hidden}
  .ct>img{display:block;width:${VW}px;height:${VH}px}
  .pop{position:absolute;right:10px;top:2px;width:${POP_W}px;border-radius:10px;overflow:hidden;box-shadow:0 0 0 .5px rgba(0,0,0,.16),0 12px 36px rgba(0,0,0,.2)}
  .pop img{display:block;width:${POP_W}px}
  </style></head><body><h1>${cap}</h1>
  <div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>${toolbarIcon ? `<span class="tb"><img src="data:image/png;base64,${b64(path.join(ROOT, 'extension/icons/32.png'))}"></span>` : ''}</div>
  <div class="ct">${inner}</div></div></body></html>`;
}

async function compose(browser, lang, popH) {
  const dir = path.join(OUT, 'shots', lang); fs.mkdirSync(dir, { recursive: true });
  const R = n => path.join(RAW, `${lang}-${n}.png`);
  const img = n => `<img src="data:image/png;base64,${b64(R(n))}">`;
  const shots = [
    frame(lang, CAP[lang][0], img('page1') + `<div class="pop" style="height:${popH}px">${img('pop1')}</div>`, true),
    frame(lang, CAP[lang][1], img('app')),
    frame(lang, CAP[lang][2], img('pick')),
    frame(lang, CAP[lang][3], img('batch'))
  ];
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  for (let i = 0; i < shots.length; i++) {
    await p.setContent(shots[i]); await p.evaluate(() => document.fonts.ready); await sleep(200);
    const h = await p.evaluate(() => { const e = document.querySelector('h1'), r = e.getBoundingClientRect(); return { h: r.height, over: e.scrollWidth > e.clientWidth + 1 }; });
    if (h.h > 50 || h.over) layout.push(`${lang} 第 ${i + 1} 张大字不是一行或出框`);
    await p.screenshot({ path: path.join(dir, `${i + 1}.png`) });
  }
  await p.close();
}

// 小宣传图 440×280：图标 + 英文名 + 一句话；商店图标 128×128：96 图案 + 四边 16 透明
async function promoAndIcon(browser) {
  const svg = fs.readFileSync(path.join(ROOT, 'extension/icons/icon.svg'), 'utf8');
  const p = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    html,body{margin:0;width:440px;height:280px;overflow:hidden;background:#f5f5f7;font-family:${FONT};-webkit-font-smoothing:antialiased}
    main{height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
    .ic{width:88px;height:88px;filter:drop-shadow(0 6px 14px rgba(78,91,214,.28))}
    h1{margin:20px 0 0;font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-.02em;color:#1d1d1f;white-space:nowrap}
    p{margin:8px 0 0;font-size:17px;line-height:1.4;color:#6e6e73;white-space:nowrap}
  </style></head><body><main><div class="ic">${svg.replace('<svg ', '<svg width="88" height="88" ')}</div>
  <h1>${QS.STR.en.appFull}</h1><p>${QS.STR.en.slogan}</p></main></body></html>`);
  await p.evaluate(() => document.fonts.ready);
  const over = await p.evaluate(() => [...document.querySelectorAll('h1,p')].some(e => e.getBoundingClientRect().right > 440 - 16 || e.getBoundingClientRect().left < 16));
  if (over) layout.push('小宣传图字出框');
  await p.screenshot({ path: path.join(OUT, 'promo-440x280.png') });
  await p.close();
  const q = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
  await q.setContent(`<html><body style="margin:0;background:transparent"><div style="padding:16px;width:96px;height:96px">${svg.replace('<svg ', '<svg width="96" height="96" style="display:block" ')}</div></body></html>`);
  await q.screenshot({ path: path.join(OUT, 'icon-128.png'), omitBackground: true });
  await q.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const site = spawn(process.execPath, [path.join(__dirname, 'site.js'), String(PORT)], { stdio: 'ignore' });
  process.on('exit', () => { try { site.kill(); } catch (e) {} });
  await sleep(700);
  const browser = await chromium.launch();
  for (const lang of ['en', 'zh']) {
    const { popH } = await capture(lang);
    await compose(browser, lang, popH);
  }
  await promoAndIcon(browser);
  await browser.close();
  console.log('raw', RAW);
  console.log('\n挤两行 / 撑破 / 截断 / 横向滚动：' + (layout.length ? '\n' + layout.join('\n') : 0));
  console.log('\nerrors', errors.length ? '\n' + errors.join('\n') : 0);
  process.exit(errors.length || layout.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
