// 0.4.0 交货截图（_ops/文案规范.md「交货前自查」）：英文、中文各一套。
// 弹窗 × 空状态、结果（另加出错、框选面板、总览页 1280 / 390、加一串）；介绍页 390、1280；顺手出介绍页用的 img/en/*.webp（英文）和 img/*.webp（中文）。
// 每张图都量一遍：按钮被撑破 / 挤成两行、界面字被截断（…）、横向滚动，有就记下来，最后打出来。
// 英文版用 bench/site.js 的英文店（/_lang?l=en）：网页上的内容本来就是网页自己的语言，插件不翻。
// 用法：node xunshan/bench/shots-0.4.js   → bench/shots-0.4/、img/、img/en/
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'shots-0.4');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(path.join(ROOT, 'img/en'), { recursive: true });
const PORT = 18792, BASE = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [], layout = [], clipped = [];
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-shot-'));
require(path.join(ROOT, 'extension/lib/strings.js'));
const QS = globalThis.QS;

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

// 在页面里量：控件（按钮、分段、小标签、下拉）字挤成两行或撑出框；带省略号被截断的字；横向滚动
async function measure(page, where) {
  const r = await page.evaluate(() => {
    const roots = [document];
    document.querySelectorAll('*').forEach(e => { if (e.shadowRoot) roots.push(e.shadowRoot); });
    const vis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const lines = el => {
      const tops = [];
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const b of rg.getClientRects()) if (b.width > 1 && !tops.some(t => Math.abs(t - b.top) < 4)) tops.push(b.top);
      }
      return tops.length;
    };
    const CTRL = 'button.btn, a.btn, .pick, .chip, .seg button, .lang button, .all, .go, .menu button, .toast button, .pn .b, .pn .iv, .pn .seg button, .pn .menu button, .hint, .cta .btn';
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
        const cs = getComputedStyle(el);
        if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) cut.push(el.textContent.replace(/\s+/g, ' ').trim().slice(0, 80));
      }
    }
    const wide = document.documentElement.scrollWidth > innerWidth
      ? [...document.querySelectorAll('body *')].filter(e => vis(e) && e.getBoundingClientRect().right > innerWidth + 1 && !(e.parentElement && e.parentElement.getBoundingClientRect().right > innerWidth + 1)).slice(0, 4).map(e => e.tagName.toLowerCase() + '.' + String(e.className).replace(/\s+/g, '.') + ' 「' + e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) + '」')
      : [];
    return { bad, cut, hoz: wide.length ? wide.join(' / ') : false };
  });
  for (const b of r.bad) layout.push(where + ' ' + b);
  if (r.hoz) layout.push(where + ' 横向滚动：' + r.hoz);
  for (const c of r.cut) clipped.push(where + ' …' + c);
}

async function run(lang, scheme, keep) {
  QS.setLang(lang);
  await fetch(BASE + '/_step?k=0'); await fetch(BASE + '/_slow?ms=0'); await fetch(BASE + '/_lang?l=' + lang);
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ext-'));
  fs.cpSync(path.join(ROOT, 'extension'), ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
  mf.host_permissions = ['http://localhost/*'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ud-')), {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme,
    locale: lang === 'en' ? 'en-US' : 'zh-CN',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  const tag = lang + ' ' + scheme;
  ctx.on('page', p => { p.on('pageerror', e => errors.push(tag + ' ' + p.url() + ' :: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(tag + ' ' + p.url() + ' :: ' + m.text()); }); });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const EXT = sw.url().split('/')[2];
  const X = p => `chrome-extension://${EXT}/${p}`;
  // 中文：照真人那样点右上角「中文」（选过就记住）；英文：刚装好默认就是英文，不用动
  const WS = () => sw.evaluate(() => chrome.storage.local.get('watches').then(o => o.watches || {}));
  const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(250); } return null; };
  const tabIdOf = url => sw.evaluate(u => chrome.tabs.query({}).then(ts => (ts.find(t => (t.url || '') === u) || {}).id), url);
  const P = name => keep ? path.join(OUT, `${lang}-${name}.png`) : path.join(TMP, `${lang}-${scheme}-${name}.png`);
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 380, height: 640 });
  const popShot = async name => { await sleep(350); if (keep) await measure(pop, `${lang} 弹窗 ${name}`); await pop.screenshot({ path: P(name), fullPage: true }); };
  const open = async p => { const pg = await ctx.newPage(); await pg.goto(BASE + p); return pg; };
  const popFor = async p => { await pop.goto(X('popup.html?tab=' + (await tabIdOf(BASE + p)))); await pop.waitForSelector('[data-a="pick"]'); };
  const addRow = async (kind, cond) => {
    const label = QS.t(kind);
    const rows = await pop.$$eval('.row.cand[data-k]', els => els.map(e => e.querySelector('.t').textContent));
    await pop.locator(`.row.cand[data-k="${rows.indexOf(label)}"]`).click();
    await pop.waitForSelector('.sub');
    if (cond) { await pop.locator(`.sub [data-c="${cond[0]}"]`).click(); if (cond[1] != null) { await pop.fill('#cv', String(cond[1])); await pop.press('#cv', 'Enter'); } }
  };

  // 1. 空状态：刚装好，打开商品页点巡山僧
  const price = await open('/price');
  await popFor('/price'); await pop.waitForSelector('.row.cand[data-k]');
  if (lang === 'zh') {
    const before = await pop.textContent('.hd-t b');
    if (before !== QS.STR.en.app) errors.push(tag + ' 刚装好不是英文：' + before);
    await pop.click('#lang [data-l="zh"]'); await pop.waitForFunction(() => document.documentElement.lang === 'zh-CN');
    await pop.reload(); await pop.waitForSelector('.row.cand[data-k]');
    if (await pop.textContent('.hd-t b') !== QS.STR.zh.app) errors.push(tag + ' 选了中文，重开弹窗没记住');
  }
  await popShot('1-empty');

  // 2. 干活中：点了价格那行，后台正去看第一眼（这页故意慢）
  const slow = await open('/slow');
  await fetch(BASE + '/_slow?ms=7000');
  await popFor('/slow'); await pop.waitForSelector('.row.cand[data-k]');
  await addRow('kindPrice');
  await pop.waitForSelector('.row.on .spin');
  await popShot('2-working');
  await fetch(BASE + '/_slow?ms=0');
  await until(async () => Object.values(await WS()).every(w => w.lastText != null || w.err));
  await slow.close();

  // 3. 结果：盯了几处，过一阵降价、补货了
  await popFor('/price'); await addRow('kindPrice', ['below', 1000]);
  await until(async () => Object.values(await WS()).some(w => w.url.endsWith('/price') && w.cond.value === 1000));
  for (const [p, kind, c] of [['/stock', 'kindStock'], ['/item', 'kindPrice', ['below', 420]], ['/guard', 'kindPrice', ['below', 500]]]) {
    const pg = await open(p); await popFor(p); await addRow(kind, c); await sleep(400); await pg.close();
  }
  const live = await open('/live'); await popFor('/live'); await pop.click('[data-a="whole"]'); await sleep(600); await live.close();
  const ord = await open('/login?go=1');
  await until(async () => Object.values(await WS()).every(w => w.lastText != null), 20000);
  await sw.evaluate(async () => { const ws = (await chrome.storage.local.get('watches')).watches; for (const w of Object.values(ws)) w.created = Date.now() - 3600e3; await chrome.storage.local.set({ watches: ws }); });
  // 通知文字也跟着语言：把后台发的通知抄一份
  await sw.evaluate(() => { const c = chrome.notifications.create.bind(chrome.notifications); globalThis.__n = []; chrome.notifications.create = (id, o, cb) => { __n.push(o); return c(id, o, cb); }; });
  for (const k of [2, 3]) { await fetch(BASE + '/_step?k=' + k); for (const id of Object.keys(await WS())) await sw.evaluate(id => handlers.checkNow({ id }), id); }
  const notes = await sw.evaluate(() => globalThis.__n);
  if (keep) fs.writeFileSync(path.join(OUT, `${lang}-notifications.txt`), notes.map(n => n.title + ' | ' + n.message + ' | ' + n.contextMessage).join('\n') + '\n');
  const wantOpen = QS.STR[lang].notifOpen;
  if (!notes.length || notes.some(n => !n.contextMessage.endsWith(wantOpen))) errors.push(tag + ' 通知不是这门语言：' + JSON.stringify(notes[0]));
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
  if (keep) await measure(ord, `${lang} 框选提示`);
  const b = await ord.locator('#status').boundingBox();
  await ord.mouse.move(b.x + 10, b.y + 8); await ord.mouse.click(b.x + 10, b.y + 8);
  await ord.waitForSelector('qianshou-picker .pn .seg'); await sleep(900);
  if (keep) { await measure(ord, `${lang} 框选面板`); await ord.screenshot({ path: P('x-pick-1280') }); }
  await ord.locator('qianshou-picker [data-a="iv"]').click(); await sleep(300);
  if (keep) await measure(ord, `${lang} 框选面板频率菜单`);
  await ord.keyboard.press('Escape'); await ord.close();

  // 总览页 1280 / 390
  const pid = Object.values(await WS()).find(w => w.url.endsWith('/price')).id;
  const app = await ctx.newPage();
  await app.goto(X('app.html#' + pid)); await app.waitForSelector('.he'); await sleep(600);
  if (keep) await measure(app, `${lang} 总览 1280`);
  await app.screenshot({ path: P('x-app-1280') });
  const hb = await app.locator('.hist-h').boundingBox(), cb = await app.locator('#hist .he').first().boundingBox();
  await app.screenshot({ path: P('x-compare'), fullPage: true, clip: { x: cb.x - 24, y: hb.y - 24, width: cb.width + 48, height: cb.y + cb.height - hb.y + 48 } });
  await app.click('#civ'); await sleep(300); if (keep) await measure(app, `${lang} 总览频率菜单`); await app.keyboard.press('Escape');
  await app.click('#gear'); await sleep(300); if (keep) await measure(app, `${lang} 总览设置`); await app.click('#gear');
  await app.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  if (keep) await measure(app, `${lang} 总览 390`);
  await app.screenshot({ path: P('x-app-390') });
  await app.setViewportSize({ width: 1280, height: 800 });
  // 加一串
  await app.goto(X('app.html#add')); await app.waitForSelector('#urls');
  await app.fill('#urls', [1, 2, 3, 4, 5, 6, 7, 8].map(i => BASE + '/shop/' + i).join('\n')); await app.fill('#lim', '100');
  await app.dispatchEvent('#urls', 'input'); await app.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); }); await sleep(300);
  if (keep) await measure(app, `${lang} 加一串`);
  const ab = await app.locator('#add').boundingBox();
  await app.screenshot({ path: P('x-batch-1280'), clip: { x: ab.x - 24, y: ab.y - 24, width: ab.width + 48, height: ab.height + 48 } });
  await app.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  if (keep) await measure(app, `${lang} 加一串 390`);
  await ctx.close();
  return P;
}

(async () => {
  const site = spawn(process.execPath, [path.join(__dirname, 'site.js'), String(PORT)], { stdio: 'ignore' });
  process.on('exit', () => site.kill());
  await sleep(700);
  const browser = await chromium.launch();
  const dims = {};
  for (const lang of ['en', 'zh']) {
    for (const scheme of ['light', 'dark']) {
      const P = await run(lang, scheme, scheme === 'light');
      // 介绍页用图：英文 img/en/，中文 img/
      for (const [src, dst] of [['x-app-1280', 'app'], ['3-result', 'popup'], ['x-batch-1280', 'batch'], ['x-compare', 'compare']]) {
        const d = await toWebp(browser, P(src), path.join(ROOT, lang === 'en' ? 'img/en' : 'img', dst + (scheme === 'dark' ? '-dark' : '') + '.webp'));
        dims[dst] = [d.w, d.h];
      }
    }
    // 介绍页 390 / 1280（浅色截图交货；深色也量一遍）
    for (const scheme of ['light', 'dark']) for (const w of [390, 1280]) {
      const p = await browser.newPage({ viewport: { width: w, height: w === 390 ? 844 : 800 }, deviceScaleFactor: w === 390 ? 2 : 1, colorScheme: scheme, locale: lang === 'en' ? 'en-US' : 'zh-CN' });
      p.on('pageerror', e => errors.push('intro ' + e.message));
      await p.goto('file://' + path.join(ROOT, 'index.html') + (lang === 'zh' ? '?lang=zh' : '')); await sleep(600);
      const bad = await p.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, broken: [...document.images].filter(i => i.complete && !i.naturalWidth).map(i => i.currentSrc || i.src) }));
      if (bad.broken.length) errors.push(`介绍页 ${lang} ${w} ${scheme} 坏图 ${bad.broken.join(',')}`);
      if (bad.lang !== QS.STR[lang].htmlLang || bad.title !== QS.STR[lang].iTitle) errors.push(`介绍页 ${lang} 语言没换：${bad.lang} ${bad.title}`);
      await measure(p, `${lang} 介绍页 ${w} ${scheme}`);
      if (scheme === 'light') await p.screenshot({ path: path.join(OUT, `${lang}-intro-${w}.png`), fullPage: true });
      await p.close();
    }
  }
  // 介绍页：默认英文；点「中文」后记住，再开还是中文
  {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto('file://' + path.join(ROOT, 'index.html')); await sleep(300);
    const l0 = await p.evaluate(() => document.documentElement.lang);
    await p.click('#lang [data-l="zh"]'); await p.reload(); await sleep(300);
    const l1 = await p.evaluate(() => [document.documentElement.lang, document.title]);
    if (l0 !== 'en' || l1[0] !== 'zh-CN' || l1[1] !== QS.STR.zh.iTitle) errors.push('介绍页默认英文 / 记住中文不对：' + l0 + ' ' + l1.join(' '));
    await p.close();
  }
  console.log('img', JSON.stringify(dims));
  await browser.close();
  console.log('\n控件挤两行 / 撑破 / 横向滚动：' + (layout.length ? '\n' + layout.join('\n') : 0));
  console.log('\n带省略号截断的（看是不是界面字）：' + (clipped.length ? '\n' + [...new Set(clipped)].join('\n') : 0));
  console.log('\nerrors', errors.length ? '\n' + errors.join('\n') : 0);
  process.exit(errors.length || layout.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
