// 0.3.0 交货截图（照 _ops/设计规范.md 最后一节）：插件弹窗 × 浅深 × 空状态、干活中、结果、出错 = 8 张；
// 另加框选面板、总览页 1280/390、加一串；介绍页 390/1280 × 浅深；顺手出介绍页用的 img/*.webp。
// 用法：node xunshan/bench/shots-0.3.js   → bench/shots-0.3/、img/
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'shots-0.3'), IMG = path.join(ROOT, 'img');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8791, BASE = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];

async function toWebp(browser, png, out, q) {
  const p = await browser.newPage();
  const b64 = fs.readFileSync(png).toString('base64');
  const data = await p.evaluate(async ([b64, q]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return { url: c.toDataURL('image/webp', q), w: c.width, h: c.height };
  }, [b64, q || 0.82]);
  fs.writeFileSync(out, Buffer.from(data.url.split(',')[1], 'base64'));
  await p.close();
  return data;
}

async function run(scheme) {
  await fetch(BASE + '/_step?k=0'); await fetch(BASE + '/_slow?ms=0');
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ext-'));
  fs.cpSync(path.join(ROOT, 'extension'), ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
  mf.host_permissions = ['http://localhost/*'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ud-')), {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  ctx.on('page', p => { p.on('pageerror', e => errors.push(scheme + ' ' + p.url() + ' :: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(scheme + ' ' + p.url() + ' :: ' + m.text()); }); });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const EXT = sw.url().split('/')[2];
  const X = p => `chrome-extension://${EXT}/${p}`;
  const WS = () => sw.evaluate(() => chrome.storage.local.get('watches').then(o => o.watches || {}));
  const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(250); } return null; };
  const tabIdOf = url => sw.evaluate(u => chrome.tabs.query({}).then(ts => (ts.find(t => (t.url || '') === u) || {}).id), url);
  const S = scheme === 'dark' ? 'dark' : 'light';
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 380, height: 640 });
  const popShot = async name => { await sleep(350); await pop.screenshot({ path: path.join(OUT, name + '-' + S + '.png'), fullPage: true }); };
  const open = async p => { const pg = await ctx.newPage(); await pg.goto(BASE + p); return pg; };
  const popFor = async p => { await pop.goto(X('popup.html?tab=' + (await tabIdOf(BASE + p)))); await pop.waitForSelector('[data-a="pick"]'); };
  const addRow = async (label, cond) => {
    const rows = await pop.$$eval('.row.cand[data-k]', els => els.map(e => e.querySelector('.t').textContent));
    await pop.locator(`.row.cand[data-k="${rows.indexOf(label)}"]`).click();
    await pop.waitForSelector('.sub');
    if (cond) { await pop.locator(`.sub [data-c="${cond[0]}"]`).click(); if (cond[1] != null) { await pop.fill('#cv', String(cond[1])); await pop.press('#cv', 'Enter'); } }
  };

  // 1. 空状态：刚装好，打开商品页点贫僧
  const price = await open('/price');
  await popFor('/price'); await pop.waitForSelector('.row.cand[data-k]');
  await popShot('1-empty');

  // 2. 干活中：点了价格那行，后台正去看第一眼（这页故意慢）
  const slow = await open('/slow');
  await fetch(BASE + '/_slow?ms=7000');
  await popFor('/slow'); await pop.waitForSelector('.row.cand[data-k]');
  await addRow('价格');
  await pop.waitForSelector('.row.on .spin');
  await popShot('2-working');
  await fetch(BASE + '/_slow?ms=0');
  await until(async () => Object.values(await WS()).every(w => w.lastText != null || w.err));
  await slow.close();

  // 3. 结果：盯了几处，过一阵降价、补货了
  await popFor('/price'); await addRow('价格', ['below', 1000]);
  await until(async () => Object.values(await WS()).some(w => w.url.endsWith('/price') && w.cond.value === 1000));
  for (const [p, label, c] of [['/stock', '库存'], ['/item', '价格', ['below', 420]], ['/guard', '价格', ['below', 500]]]) {
    const pg = await open(p); await popFor(p); await addRow(label, c); await sleep(400); await pg.close();
  }
  const live = await open('/live'); await popFor('/live'); await pop.click('[data-a="whole"]'); await sleep(600); await live.close();
  const ord = await open('/login?go=1');
  await until(async () => Object.values(await WS()).every(w => w.lastText != null), 20000);
  // 都改成开盯一小时前，好让列表里的时间像样
  await sw.evaluate(async () => { const ws = (await chrome.storage.local.get('watches')).watches; for (const w of Object.values(ws)) w.created = Date.now() - 3600e3; await chrome.storage.local.set({ watches: ws }); });
  for (const k of [2, 3]) { await fetch(BASE + '/_step?k=' + k); for (const id of Object.keys(await WS())) await sw.evaluate(id => handlers.checkNow({ id }), id); }
  await price.reload();
  await popFor('/price'); await pop.waitForSelector('.it');
  await popShot('3-result');

  // 4. 出错：热水壶那页出了验证码
  const guard = await open('/guard');
  await popFor('/guard'); await pop.waitForSelector('.sub .fix');
  await popShot('4-error');
  await guard.close();

  // 框选面板（订单状态认不出，自己框）
  await ord.waitForSelector('#status');
  await popFor('/orders'); await pop.click('[data-a="pick"]');
  await ord.bringToFront(); await ord.waitForSelector('qianshou-picker');
  const b = await ord.locator('#status').boundingBox();
  await ord.mouse.move(b.x + 10, b.y + 8); await ord.mouse.click(b.x + 10, b.y + 8);
  await ord.waitForSelector('qianshou-picker .pn .seg'); await sleep(900);
  await ord.screenshot({ path: path.join(OUT, 'x-pick-1280-' + S + '.png') });
  await ord.keyboard.press('Escape'); await ord.close();

  // 总览页 1280 / 390
  const pid = Object.values(await WS()).find(w => w.url.endsWith('/price')).id;
  const app = await ctx.newPage();
  await app.goto(X('app.html#' + pid)); await app.waitForSelector('.he'); await sleep(600);
  await app.screenshot({ path: path.join(OUT, 'x-app-1280-' + S + '.png') });
  const hb = await app.locator('.hist-h').boundingBox(), cb = await app.locator('#hist .he').first().boundingBox();
  await app.screenshot({ path: path.join(OUT, 'x-compare-' + S + '.png'), fullPage: true, clip: { x: cb.x - 24, y: hb.y - 24, width: cb.width + 48, height: cb.y + cb.height - hb.y + 48 } });
  await app.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  await app.screenshot({ path: path.join(OUT, 'x-app-390-' + S + '.png') });
  await app.setViewportSize({ width: 1280, height: 800 });
  // 加一串
  await app.goto(X('app.html#add')); await app.waitForSelector('#urls');
  await app.fill('#urls', [1, 2, 3, 4, 5, 6, 7, 8].map(i => BASE + '/shop/' + i).join('\n')); await app.fill('#lim', '100');
  await app.dispatchEvent('#urls', 'input'); await app.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); }); await sleep(300);
  const ab = await app.locator('#add').boundingBox();
  await app.screenshot({ path: path.join(OUT, 'x-batch-1280-' + S + '.png'), clip: { x: ab.x - 24, y: ab.y - 24, width: ab.width + 48, height: ab.height + 48 } });
  const hoz = await app.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (hoz) errors.push(S + ' 总览页横向溢出');
  await ctx.close();
}

(async () => {
  const site = spawn(process.execPath, [path.join(__dirname, 'site.js'), String(PORT)], { stdio: 'ignore' });
  process.on('exit', () => site.kill());
  await sleep(700);
  await run('light');
  await run('dark');
  // 介绍页
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) for (const w of [390, 1280]) {
    const p = await browser.newPage({ viewport: { width: w, height: w === 390 ? 844 : 800 }, deviceScaleFactor: w === 390 ? 2 : 1, colorScheme: scheme });
    p.on('pageerror', e => errors.push('intro ' + e.message));
    await p.goto('file://' + path.join(ROOT, 'index.html')); await sleep(500);
    const bad = await p.evaluate(() => ({ hoz: document.documentElement.scrollWidth > innerWidth, broken: [...document.images].filter(i => i.complete && !i.naturalWidth).map(i => i.currentSrc || i.src) }));
    if (bad.hoz) errors.push(`介绍页 ${w} ${scheme} 横向溢出`);
    if (bad.broken.length) errors.push(`介绍页 ${w} ${scheme} 坏图 ${bad.broken.join(',')}`);
    await p.screenshot({ path: path.join(OUT, `intro-${w}-${scheme}.png`), fullPage: true });
    await p.close();
  }
  // 介绍页用图
  const pairs = [['x-app-1280', 'app'], ['3-result', 'popup'], ['x-batch-1280', 'batch'], ['x-compare', 'compare']];
  const dims = {};
  for (const [src, dst] of pairs) for (const s of ['light', 'dark']) {
    const d = await toWebp(browser, path.join(OUT, `${src}-${s}.png`), path.join(IMG, dst + (s === 'dark' ? '-dark' : '') + '.webp'));
    dims[dst] = [d.w, d.h];
  }
  console.log('img', JSON.stringify(dims));
  await browser.close();
  console.log('errors', errors.length ? '\n' + errors.join('\n') : 0);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
