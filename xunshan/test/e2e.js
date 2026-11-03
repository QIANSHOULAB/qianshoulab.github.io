// 巡山僧端到端测试：真把插件装进 Chromium，在本地测试网站上把整条链路跑一遍。
// 用法：node xunshan/test/e2e.js [--fast] [--lang=en|zh]  （截图写到 xunshan/test/out/）
// 0.4.0 起界面默认英文、右上角切中文；--lang 先把语言存好再跑（默认 en），界面字的断言照 strings.js 那门语言的文案对
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const PORT = 8787, BASE = `http://localhost:${PORT}`;
const SLOW = !process.argv.includes('--fast'); // --fast 跳过等真闹钟那一步
const LANG = ((process.argv.find(a => a.startsWith('--lang=')) || '').split('=')[1]) || 'en';
require(path.join(ROOT, 'extension/lib/strings.js'));
globalThis.QS.setLang(LANG);
const L = (...a) => globalThis.QS.t(...a); // 界面字：照 strings.js 那门语言
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra) => { results.push({ name, pass: !!cond, extra }); console.log((cond ? '✓ ' : '✗ ') + name + (extra ? '  ' + extra : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = p => fetch(BASE + p).then(r => r.json());

(async () => {
  const site = spawn(process.execPath, [path.join(__dirname, 'site.js'), String(PORT)], { stdio: 'inherit' });
  process.on('exit', () => { try { site.kill(); } catch (e) {} });
  await sleep(600);

  // 测试版：给 localhost 预授权，跳过浏览器权限弹窗（正式版按网站现要）
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ext-'));
  fs.cpSync(path.join(ROOT, 'extension'), ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
  mf.host_permissions = ['http://localhost/*'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));

  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ud-'));
  const ctx = await chromium.launchPersistentContext(ud, {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, acceptDownloads: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  const errors = [];
  const watchPage = p => {
    p.on('console', m => { if (m.type() === 'error') errors.push(p.url() + ' :: ' + m.text()); });
    p.on('pageerror', e => errors.push(p.url() + ' :: ' + e.message));
  };
  ctx.on('page', watchPage);
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const EXT = sw.url().split('/')[2];
  const X = p => `chrome-extension://${EXT}/${p}`;
  const W = () => sw.evaluate(() => chrome.storage.local.get('watches').then(o => o.watches || {}));
  const H = id => sw.evaluate(id => chrome.storage.local.get('h:' + id).then(o => o['h:' + id] || []), id);
  const notifs = () => sw.evaluate(() => new Promise(r => chrome.notifications.getAll(r)));
  const badge = () => sw.evaluate(() => chrome.action.getBadgeText({}));
  const until = async (fn, ms = 20000, step = 300) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
  const tabIdOf = url => sw.evaluate(u => chrome.tabs.query({}).then(ts => (ts.find(t => (t.url || '').startsWith(u)) || {}).id), url);
  await sw.evaluate(l => chrome.storage.local.set({ lang: l }), LANG);

  // 记一下后台有没有偷偷开标签（巡山时不该开）
  let tabsOpened = 0;
  await sw.evaluate(() => { globalThis.__tabs = 0; chrome.tabs.onCreated.addListener(t => { if (!t.active) globalThis.__tabs++; }); });
  const bgTabs = () => sw.evaluate(() => globalThis.__tabs);

  // ---- 1. 空状态弹窗 ----
  const shop = await ctx.newPage(); watchPage(shop);
  await shop.goto(BASE + '/shop');
  const shopTab = await tabIdOf(BASE + '/shop');
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 360, height: 520 });
  await pop.goto(X('popup.html?tab=' + shopTab));
  await pop.waitForSelector('#empty:not([hidden])');
  await pop.waitForSelector('.row.cand');
  await pop.screenshot({ path: path.join(OUT, '01-popup-empty.png') });
  ok('弹窗空状态显示（带「用示例试试」）', await pop.isVisible('#empty') && await pop.isVisible('#demo'));

  // ---- 2. 一打开就认出价格、库存；点价格那行就盯上（不用框、不用点开盯）----
  const kinds = await pop.$$eval('.row.cand .t', els => els.map(e => e.textContent));
  ok('弹窗自己认出价格和库存（不认划掉的原价）', kinds.join() === [L('kindPrice'), L('kindStock')].join() && /1,299/.test(await pop.locator('.row.cand .v').first().textContent()), kinds.join() + ' ' + (await pop.locator('.row.cand .v').allTextContents()).join(' / '));
  await shop.evaluate(() => { window.__clicks = 0; document.addEventListener('click', () => window.__clicks++); });
  await pop.locator('.row.cand[data-k="0"]').click();
  await pop.waitForSelector('.row.cand.on .sub, .sub');
  let priceW = await until(async () => Object.values(await W()).find(w => w.url.endsWith('/shop') && w.lastText != null));
  ok('点一下就盯上，默认「降了就叫」', priceW && priceW.kind === 'price' && priceW.cond.type === 'drop' && /1,299/.test(priceW.lastText), priceW && JSON.stringify({ sel: priceW.selector, text: priceW.lastText, cond: priceW.cond }));
  ok('自动起名带「价格」', priceW && priceW.label.endsWith(' · ' + L('kindPrice')), priceW && priceW.label);
  ok('认出来的那块也记了备用找法（改版不丢）', priceW && priceW.alts.length > 0 && priceW.anchor && priceW.anchor.shape === '¥#', priceW && JSON.stringify({ alts: priceW.alts, anchor: priceW.anchor }));
  ok('网页上闪一下「盯上了」指给人看', !!(await shop.$('qianshou-mark')));
  // 要「低于 1000」：点低于、打 1000、回车
  await pop.locator('.sub [data-c="below"]').click();
  await pop.locator('#cv').fill('1000'); await pop.press('#cv', 'Enter');
  await until(async () => ((await W())[priceW.id].cond || {}).value === 1000, 4000);
  priceW = (await W())[priceW.id];
  await pop.screenshot({ path: path.join(OUT, '03-popup-added.png') });
  ok('条件存成 低于 1000', priceW.cond.type === 'below' && priceW.cond.value === 1000);
  ok('静态页走直接抓取', priceW.mode === 'fetch');
  ok('网页本身收不到点击', (await shop.evaluate(() => window.__clicks)) === 0);

  // ---- 3. 库存：点库存那行；「缺货」自动设成「缺货没了就叫」；频率改 5 分钟（以后新加的都记住）----
  await pop.reload(); await pop.waitForSelector('.row.cand[data-k]');
  await pop.locator('.row.cand[data-k]').first().click();
  const stockW0 = await until(async () => Object.values(await W()).find(w => w.selector && w.selector.includes('stock') && w.lastText != null));
  ok('库存认出来，默认「缺货」消失就叫', stockW0 && stockW0.kind === 'stock' && stockW0.cond.type === 'gone' && stockW0.cond.value === '缺货', stockW0 && JSON.stringify(stockW0.cond));
  await pop.locator('.sub [data-a="iv"]').click();
  await pop.locator('.menu [data-v="5"]').click();
  await until(async () => (await W())[stockW0.id].interval === 5, 4000);
  const stockW = (await W())[stockW0.id];
  ok('库存盯梢建好，频率 5 分钟', stockW && stockW.interval === 5 && stockW.lastText === '缺货', stockW && stockW.selector);
  ok('频率记住了：下回新加的也每 5 分钟', (await sw.evaluate(() => QS.settings.all())).defaultInterval === 5);

  // 撤销：刚盯上的那条一下撤掉
  const nBefore = Object.keys(await W()).length;
  await pop.reload(); await pop.waitForSelector('[data-a="whole"]');
  await pop.click('[data-a="whole"]');
  await until(async () => Object.keys(await W()).length === nBefore + 1, 4000);
  await pop.locator(`.row.on:has-text("${L('watchPage')}") [data-a="undo"]`).click();
  await until(async () => Object.keys(await W()).length === nBefore, 4000);
  ok('刚盯上的能一下撤销', Object.keys(await W()).length === nBefore);

  // ---- 4. 脚本渲染页：自己认出名额；直接抓读不到就改用看不见的小窗 ----
  const spa = await ctx.newPage(); await spa.goto(BASE + '/spa'); await spa.waitForSelector('#seats');
  const spaTab = await tabIdOf(BASE + '/spa');
  await pop.goto(X('popup.html?tab=' + spaTab));
  await pop.waitForSelector('.row.cand[data-k]');
  ok('脚本页也认出名额', (await pop.locator('.row.cand[data-k] .t').first().textContent()) === L('kindSeats'));
  await pop.locator('.row.cand[data-k]').first().click();
  const spaW = await until(async () => Object.values(await W()).find(w => w.url.endsWith('/spa') && w.lastText != null), 40000);
  ok('名额是 0 的默认「高于 0 就叫」', spaW && spaW.cond.type === 'above' && spaW.cond.value === 0, spaW && JSON.stringify(spaW.cond));
  ok('脚本渲染页（还不许被嵌）自动改用看不见的小窗', spaW && spaW.mode === 'frame' && /剩余名额：0/.test(spaW.lastText), spaW && JSON.stringify({ mode: spaW.mode, text: spaW.lastText }));
  tabsOpened = await bgTabs();
  const spaTabs = await sw.evaluate(() => chrome.tabs.query({}).then(ts => ts.filter(t => (t.url || '').endsWith('/spa')).length));
  ok('巡山不在用户窗口里开标签', spaTabs === 1 && tabsOpened === 0, 'spa 标签数 ' + spaTabs + '，巡山开过的标签 ' + tabsOpened);

  // ---- 5. 盯整页（公告）----
  const nws = await ctx.newPage(); await nws.goto(BASE + '/news');
  const newsTab = await tabIdOf(BASE + '/news');
  await pop.goto(X('popup.html?tab=' + newsTab));
  await pop.waitForSelector('[data-a="whole"]');
  ok('认不出价格库存的页面，只给「自己框一块」「盯整页」', (await pop.locator('.row.cand[data-k]').count()) === 0);
  await pop.click('[data-a="whole"]');
  const newsW = await until(async () => Object.values(await W()).find(w => w.url.endsWith('/news') && w.lastText != null));
  ok('整页盯梢建好', newsW && newsW.selector === null && /双十一/.test(newsW.lastText));

  // ---- 6. 条件：价格变了但没到线，不叫；到线才叫 ----
  await get('/_set?price=1099');
  await sw.evaluate(id => handlers.checkNow({ id }), priceW.id);
  let h = await H(priceW.id);
  ok('价格 1299→1099 记进历史，但没触发', h.length === 2 && h[1].hit === false && h[1].num === 1099);
  ok('没到线不弹通知', Object.keys(await notifs()).length === 0);
  await get('/_set?price=899');
  await sw.evaluate(id => handlers.checkNow({ id }), priceW.id);
  h = await H(priceW.id);
  const n1 = await until(async () => { const n = await notifs(); return Object.keys(n).length ? n : null; }, 3000) || {};
  ok('降到 899 低于 1000 → 触发', h.length === 3 && h[2].hit === true);
  ok('弹出系统通知', Object.keys(n1).length === 1, Object.keys(n1).join(','));
  ok('工具栏角标 = 1', (await badge()) === '1');

  // 截图：开盯、每次变化各一张，存在本机，有大小上限
  await sw.evaluate(() => snapChain);
  const shots = await sw.evaluate(id => chrome.storage.local.get('shot:' + id).then(o => o['shot:' + id] || {}), priceW.id);
  const shotList = Object.values(shots);
  ok('开盯和两次变化各存一张所盯区域的截图', shotList.length === 3 && shotList.every(x => /^data:image\/webp/.test(x.src) && x.src.length < 90000) && h.every(e => shots[e.t]), shotList.map(x => Math.round(x.src.length / 1024) + 'KB ' + x.w + '×' + x.h).join(', '));
  fs.writeFileSync(path.join(OUT, 'shot-price.webp'), Buffer.from(shotList[shotList.length - 1].src.split(',')[1], 'base64'));

  // 库存：缺货 → 有货
  await get('/_set?stock=' + encodeURIComponent('有货'));
  await sw.evaluate(id => handlers.checkNow({ id }), stockW.id);
  const sh = await H(stockW.id), nn = await notifs();
  ok('「缺货」消失 → 触发补货提醒', sh.slice(-1)[0].hit === true && Object.keys(nn).some(k => k.includes(stockW.id)), JSON.stringify({ hist: sh.map(e => [e.text, e.hit]), notifs: Object.keys(nn).length }));

  // 名额：脚本渲染页变化
  await get('/_set?seats=3');
  await sw.evaluate(id => handlers.checkNow({ id }), spaW.id);
  ok('脚本渲染页的名额变化被抓到', /剩余名额：3/.test((await W())[spaW.id].lastText));
  const spaShots = await sw.evaluate(id => chrome.storage.local.get('shot:' + id).then(o => Object.values(o['shot:' + id] || {})), spaW.id);
  ok('小窗读的时候顺手拍照（开盯 + 变化）', spaShots.length === 2 && spaShots.every(x => x.src.length > 1000), spaShots.map(x => Math.round(x.src.length / 1024) + 'KB').join(', '));
  if (spaShots[1]) fs.writeFileSync(path.join(OUT, 'shot-spa.webp'), Buffer.from(spaShots[1].src.split(',')[1], 'base64'));

  // ---- 7. 点通知直接打开那一页 ----
  const nid = Object.keys(n1)[0];
  const before = ctx.pages().length;
  const newPageP = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await sw.evaluate(nid => openWatch(nid.split(':')[1], nid), nid);
  const opened = await newPageP;
  ok('点通知打开原网页', opened && opened.url().startsWith(BASE + '/shop'), opened && opened.url());
  ok('点过以后标为已读', (await W())[priceW.id].unread === false);
  if (opened) await opened.close();

  // ---- 8. 登录页：用浏览器自己的登录 ----
  const lg = await ctx.newPage(); await lg.goto(BASE + '/member');
  ok('没登录时会员页跳登录', lg.url().endsWith('/login'));
  await lg.click('#go'); await lg.waitForSelector('#vip');
  const memTab = await tabIdOf(BASE + '/member');
  await pop.goto(X('popup.html?tab=' + memTab));
  await pop.waitForSelector('[data-a="pick"]');
  await pop.click('[data-a="pick"]');
  await lg.bringToFront(); await lg.waitForSelector('qianshou-picker');
  await lg.evaluate(() => { window.__clicks = 0; document.addEventListener('click', () => window.__clicks++); });
  const vb = await lg.locator('#vip').boundingBox();
  await lg.mouse.move(vb.x + 10, vb.y + 10); await sleep(150);
  await lg.screenshot({ path: path.join(OUT, '02-pick-hover.png') });
  await lg.mouse.click(vb.x + 10, vb.y + 10);
  await lg.waitForSelector('qianshou-picker .pn');
  const memW = await until(async () => Object.values(await W()).find(w => w.url.endsWith('/member') && (w.lastText != null || w.err)));
  ok('自己框：点中就盯上，不用再点「开盯」', !!memW);
  ok('框选时网页本身收不到点击（不会误点按钮）', (await lg.evaluate(() => window.__clicks)) === 0);
  await sleep(300);
  await lg.screenshot({ path: path.join(OUT, '04-pick-done.png') });
  ok('登录后的会员价能盯（带上浏览器登录）', memW && !memW.err && /¥809/.test(memW.lastText), memW && JSON.stringify({ err: memW.err, text: memW.lastText }));
  // 同一页换成看不见的小窗读，也带着登录
  await sw.evaluate(async id => { await store.update('watches', ws => { ws[id].mode = 'frame'; return ws; }, {}); }, memW.id);
  await get('/_set?price=1199');
  await sw.evaluate(id => handlers.checkNow({ id }), memW.id);
  const memF = (await W())[memW.id];
  ok('看不见的小窗里也带着浏览器登录', memF.mode === 'frame' && !memF.err && /¥1079/.test(memF.lastText), JSON.stringify({ err: memF.err, text: memF.lastText }));
  await get('/_set?price=899');
  await sw.evaluate(id => handlers.checkNow({ id }), memW.id);
  await lg.close();

  // ---- 9. 验证码页：识别出来，不硬闯 ----
  const cap = await sw.evaluate(() => handlers.add({ watch: { url: 'http://localhost:8787/captcha', title: '验证', selector: null } }));
  ok('验证码页标成「被拦」并退避', cap && cap.err === 'blocked' && cap.nextCheck - Date.now() > cap.interval * 4 * 60000 - 5000, cap && cap.err);
  await sw.evaluate(id => handlers.remove({ id }), cap.id);

  // ---- 9b. 盯不了要叫人：连着 3 回被拦，发一条「盯不了了」----
  const cap2 = await sw.evaluate(() => handlers.add({ watch: { url: 'http://localhost:8787/captcha', title: '验证', selector: null } }));
  await sw.evaluate(id => handlers.checkNow({ id }), cap2.id);
  await sw.evaluate(id => handlers.checkNow({ id }), cap2.id);
  const brokenN = await until(async () => { const k = Object.keys(await notifs()).filter(k => k.startsWith('e:' + cap2.id)); return k.length ? k : null; }, 3000) || [];
  const cw = (await W())[cap2.id] || {};
  ok('连着 3 回没看成，发「盯不了了」通知（只发一次）', brokenN.length === 1, JSON.stringify({ n: brokenN.length, err: cw.err, errCount: cw.errCount, told: cw.errNotified }));
  await sw.evaluate(id => handlers.checkNow({ id }), cap2.id);
  ok('之后不重复发', Object.keys(await notifs()).filter(k => k.startsWith('e:' + cap2.id)).length === 1);
  await sw.evaluate(id => handlers.remove({ id }), cap2.id);
  await sw.evaluate(() => new Promise(r => chrome.notifications.getAll(n => { Object.keys(n).filter(k => k.startsWith('e:')).forEach(k => chrome.notifications.clear(k)); r(); })));

  // ---- 9c. 整页去噪：只变时间、人数，不记不叫 ----
  const noisy = await sw.evaluate(() => handlers.add({ watch: { url: 'http://localhost:8787/shop', title: '整页', selector: null } }));
  await sleep(1100);
  await sw.evaluate(id => handlers.checkNow({ id }), noisy.id);
  await sw.evaluate(id => handlers.checkNow({ id }), noisy.id);
  const nh = await H(noisy.id), nw = (await W())[noisy.id];
  ok('整页只变时钟和在看人数：不记、不叫', nh.length === 1 && !nw.unread && !nw.fresh, JSON.stringify({ hist: nh.length }));
  await sw.evaluate(id => handlers.remove({ id }), noisy.id);

  // ---- 9d. 网页改版：路径断了，按类名 / 文字锚点重新找到 ----
  const lp = await ctx.newPage(); await lp.goto(BASE + '/lamp');
  const lampTab = await tabIdOf(BASE + '/lamp');
  await pop.goto(X('popup.html?tab=' + lampTab)); await pop.waitForSelector('[data-a="pick"]'); await pop.click('[data-a="pick"]');
  await lp.bringToFront(); await lp.waitForSelector('qianshou-picker');
  const lb = await lp.locator('.price').boundingBox();
  await lp.mouse.move(lb.x + 10, lb.y + 10); await lp.mouse.click(lb.x + 10, lb.y + 10);
  await lp.waitForSelector('qianshou-picker .pn [data-c="below"]');
  await lp.locator('qianshou-picker [data-c="below"]').click(); await lp.locator('qianshou-picker #cv').fill('420'); await lp.locator('qianshou-picker #cv').press('Enter');
  const lampW = await until(async () => Object.values(await W()).find(w => w.url.endsWith('/lamp') && w.lastText != null && w.cond.value === 420));
  ok('框选面板里改「低于 420」', lampW && lampW.cond.type === 'below');
  ok('框的时候频率照上回的 5 分钟', lampW && lampW.interval === 5);
  ok('框选时多记了备用找法', lampW && lampW.alts.length > 0 && lampW.anchor && lampW.anchor.shape === '¥#', lampW && JSON.stringify({ alts: lampW.alts, anchor: lampW.anchor }));
  await get('/_set?redesign=1');
  await sw.evaluate(id => handlers.checkNow({ id }), lampW.id);
  let lw = (await W())[lampW.id], lh = await H(lampW.id);
  ok('改版后重新找到，记一笔「改版」，不叫', !lw.err && lh.slice(-1)[0].moved === true && !lh.slice(-1)[0].hit && lw.selector !== lampW.selector, JSON.stringify({ err: lw.err, sel: lw.selector }));
  await get('/_set?lamp=399');
  await sw.evaluate(id => handlers.checkNow({ id }), lampW.id);
  lh = await H(lampW.id);
  ok('改版后降到 399 照样叫', lh.slice(-1)[0].hit === true && lh.slice(-1)[0].num === 399);
  await get('/_set?lamp=410');
  await sw.evaluate(id => handlers.checkNow({ id }), lampW.id);
  ok('已在线下、往回涨（399→410）不叫', (await H(lampW.id)).slice(-1)[0].hit === false);
  await get('/_set?lamp=379');
  await sw.evaluate(id => handlers.checkNow({ id }), lampW.id);
  ok('线下再降（410→379）叫', (await H(lampW.id)).slice(-1)[0].hit === true);
  await sw.evaluate(id => handlers.remove({ id }), lampW.id);
  await lp.close();
  await sw.evaluate(() => new Promise(r => chrome.notifications.getAll(n => { Object.keys(n).filter(k => !k.includes('w:') ).forEach(k => chrome.notifications.clear(k)); r(); })));

  // ---- 10. 同站排队：一轮里同一网站挨个查完，同一网址只抓一次 ----
  await sw.evaluate(() => snapChain);
  const spa2 = await sw.evaluate(() => handlers.add({ watch: { url: 'http://localhost:8787/spa', title: '名额 2', selector: '#seats', pickedText: '3' } }));
  ok('同一网址第二条也走小窗', spa2 && spa2.mode === 'frame' && spa2.lastText === '3', spa2 && JSON.stringify({ mode: spa2.mode, text: spa2.lastText }));
  await sw.evaluate(() => snapChain);
  await sw.evaluate(async () => { const ws = (await chrome.storage.local.get('watches')).watches; for (const w of Object.values(ws)) w.nextCheck = 0; await chrome.storage.local.set({ watches: ws }); });
  const hits0 = await get('/_hits');
  const r0 = Date.now();
  await sw.evaluate(() => runDue());
  const roundSec = (Date.now() - r0) / 1000;
  const hits1 = await get('/_hits');
  const total = k => (hits1[k] || 0) - (hits0[k] || 0);
  const wsAfter = Object.values(await W());
  ok('一轮把同站到期的全查完', wsAfter.every(w => w.nextCheck > Date.now()), roundSec.toFixed(1) + ' 秒');
  ok('同一网址两条只抓一次', total('/shop') === 1, JSON.stringify({ shop: total('/shop'), spa: total('/spa'), news: total('/news'), member: total('/member') }));
  ok('同站之间隔开几秒，不扎堆', roundSec >= 6 && roundSec < 40, roundSec.toFixed(1) + ' 秒');
  ok('小窗模式同一网址两条只开一个小窗', total('/spa') === 1 && total('/api/stock') === 1, JSON.stringify({ spa: total('/spa'), api: total('/api/stock') }));
  await sw.evaluate(id => handlers.remove({ id }), spa2.id);

  // ---- 10b. 临近到期提前抓 + 掐着点醒：同站两条快到期，提前开工，最后一条不晚于到期 ----
  const T = await sw.evaluate(async ([a, b]) => {
    const T = Date.now() + 12000;
    const ws = (await chrome.storage.local.get('watches')).watches;
    for (const w of Object.values(ws)) w.nextCheck = w.id === a ? T : w.id === b ? T + 1000 : Date.now() + 3600e3;
    await chrome.storage.local.set({ watches: ws });
    await runDue();
    return T;
  }, [spaW.id, newsW.id]);
  await until(async () => { const ws = await W(); return ws[newsW.id].lastCheck > T - 10000 && ws[spaW.id].lastCheck > T - 10000; }, 30000, 250);
  const wsT = await W();
  const ds = [wsT[spaW.id].lastCheck - T, wsT[newsW.id].lastCheck - (T + 1000)];
  ok('同站快到期的并一批提前开工，都不晚于到期', ds.every(d => d <= 1500) && ds[0] >= -5000, '相对到期 ' + ds.map(d => (d / 1000).toFixed(1) + ' 秒').join(' / '));
  ok('下次照原节奏排（不往后漂）', wsT[spaW.id].nextCheck === T + wsT[spaW.id].interval * 60000 && wsT[newsW.id].nextCheck === T + 1000 + wsT[newsW.id].interval * 60000);

  // ---- 11. 真闹钟：不点按钮，等后台自己去看 ----
  if (SLOW) {
    await get('/_set?news=' + encodeURIComponent('11/02 补货通知：降噪耳机 Pro 到货 200 台'));
    await sw.evaluate(async id => { const ws = (await chrome.storage.local.get('watches')).watches; for (const w of Object.values(ws)) w.nextCheck = w.id === id ? 0 : Date.now() + 3600e3; await chrome.storage.local.set({ watches: ws }); }, newsW.id);
    const t0 = Date.now();
    const got = await until(async () => /补货通知/.test((await W())[newsW.id].lastText || ''), 70000, 2000);
    ok('定时器自己巡到公告更新', !!got, Math.round((Date.now() - t0) / 1000) + ' 秒');
    ok('整页有新公告就弹通知', Object.keys(await notifs()).some(k => k.includes(newsW.id)));
  }

  // ---- 12. 总览页：列表、详情、前后对比 ----
  const app = await ctx.newPage();
  await app.goto(X('app.html#' + priceW.id));
  await app.waitForSelector('.he');
  ok('总览页列出全部', (await app.locator('.li').count()) === 5);
  ok('变化记录 3 条（含开盯）', (await app.locator('.he').count()) === 3);
  ok('最新一条自动展开前后对比', (await app.locator('.dif ins').count()) > 0 && (await app.locator('.dif del').count()) > 0);
  await app.waitForFunction(() => [...document.querySelectorAll('.shots img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 5000 }).catch(() => {});
  ok('历史里截图前后对比', (await app.locator('.shots img').count()) === 2 && await app.evaluate(() => [...document.querySelectorAll('.shots img')].every(i => i.naturalWidth > 0)));
  await app.screenshot({ path: path.join(OUT, '05-app-price.png') });
  const clipHist = async () => { const hb = await app.locator('.hist-h').boundingBox(), cb = await app.locator('#hist .he').first().boundingBox(); return { x: cb.x - 24, y: hb.y - 20, width: cb.width + 48, height: cb.y + cb.height - hb.y + 44 }; };
  await app.screenshot({ path: path.join(OUT, '05b-app-shots.png'), fullPage: true, clip: await clipHist() });
  await app.goto(X('app.html#' + newsW.id)); await app.waitForSelector('.he'); await sleep(200);
  await app.screenshot({ path: path.join(OUT, '06-app-news.png') });
  await app.emulateMedia({ colorScheme: 'dark' });
  await app.goto(X('app.html#' + priceW.id)); await app.waitForSelector('.he'); await sleep(200);
  await app.screenshot({ path: path.join(OUT, '07-app-dark.png') });
  await app.screenshot({ path: path.join(OUT, '07b-app-shots-dark.png'), fullPage: true, clip: await clipHist() });
  await app.emulateMedia({ colorScheme: 'light' });

  // 改频率、改条件、暂停（走界面）
  await app.goto(X('app.html#' + priceW.id)); await app.waitForSelector('#civ');
  await app.click('#civ'); await app.click('.menu [data-v="60"]');
  await sleep(300);
  ok('界面改频率生效', (await W())[priceW.id].interval === 60);
  await app.click('#cpause'); await sleep(300);
  ok('界面暂停生效', (await W())[priceW.id].paused === true);
  await app.click('#cpause'); await sleep(300);
  await app.fill('#cval', '800'); await app.press('#cval', 'Enter'); await sleep(300);
  ok('界面改阈值生效', (await W())[priceW.id].cond.value === 800);
  await app.fill('#ttl', '耳机价格'); await app.press('#ttl', 'Enter'); await sleep(300);
  ok('界面改名生效', (await W())[priceW.id].label === '耳机价格');
  // 现在就看（走界面）
  await get('/_set?price=799');
  await app.click('[data-a="now"]');
  await until(async () => (await H(priceW.id)).length === 4, 10000);
  ok('「现在就看」按钮能用', (await H(priceW.id)).length === 4);

  // ---- 13. 导出 → 删除 → 导入 ----
  await app.click('#gear');
  const dlP = app.waitForEvent('download');
  await app.click('#exp');
  const dl = await dlP; const dlPath = path.join(OUT, 'export.json'); await dl.saveAs(dlPath);
  const ex = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
  ok('导出 JSON 含 5 处和历史', ex.app === 'xunshan' && ex.watches.length === 5 && ex.watches.some(w => w.history && w.history.length === 4));
  await sw.evaluate(id => handlers.remove({ id }), stockW.id);
  await app.setInputFiles('#file', dlPath);
  await until(async () => Object.keys(await W()).length === 5, 5000);
  ok('导入补回删掉的那处、跳过重复', Object.keys(await W()).length === 5);
  await sleep(400);

  // ---- 14. 弹窗有内容时 ----
  await pop.setViewportSize({ width: 360, height: 560 });
  await pop.goto(X('popup.html?tab=' + shopTab)); await pop.waitForSelector('.it'); await pop.waitForSelector('.row.cand.on');
  ok('弹窗里这页已盯的两块标「在盯」', (await pop.locator('.row.cand.on').count()) === 2);
  await pop.screenshot({ path: path.join(OUT, '08-popup-list.png') });
  await pop.emulateMedia({ colorScheme: 'dark' }); await pop.reload(); await pop.waitForSelector('.it');
  await pop.screenshot({ path: path.join(OUT, '09-popup-dark.png') });
  // 框选面板深色；框完点「撤销」不留东西
  const nB = Object.keys(await W()).length;
  await shop.emulateMedia({ colorScheme: 'dark' });
  await pop.click('[data-a="pick"]'); await shop.bringToFront(); await shop.waitForSelector('qianshou-picker');
  const pb2 = await shop.locator('#buy-box').boundingBox();
  await shop.mouse.move(pb2.x + 4, pb2.y + pb2.height - 4); await shop.mouse.click(pb2.x + 4, pb2.y + pb2.height - 4);
  await shop.waitForSelector('qianshou-picker .pn .seg'); await sleep(400);
  await shop.screenshot({ path: path.join(OUT, '10-pick-dark.png') });
  await shop.locator('qianshou-picker [data-a="undo"]').click();
  await until(async () => Object.keys(await W()).length === nB, 4000);
  ok('框选面板「撤销」：刚盯的那条没了、框选收起', Object.keys(await W()).length === nB && !(await shop.$('qianshou-picker')));
  await pop.click('[data-a="pick"]'); await shop.waitForSelector('qianshou-picker');
  await shop.keyboard.press('Escape');
  ok('Esc 退出框选', !(await shop.$('qianshou-picker')));
  await shop.emulateMedia({ colorScheme: 'light' });

  // ---- 15. 同一网站第二次：新页面按上回的那块认（不用再框）----
  // 公告页本来认不出东西；同站另一页上回框过「头条公告」，这回直接按那块认出来
  const head = await sw.evaluate(w => handlers.add({ watch: w }), { url: BASE + '/news?y=1', title: '公告', label: '山货铺 · 头条公告', kind: 'pick', selector: 'ul.news > li:nth-of-type(1)', alts: [], anchor: null, pickedText: '11/02 补货通知' });
  const nw2 = await ctx.newPage(); await nw2.goto(BASE + '/news');
  await pop.emulateMedia({ colorScheme: 'light' });
  await pop.goto(X('popup.html?tab=' + (await tabIdOf(BASE + '/news')))); await pop.waitForSelector('[data-a="pick"]'); await sleep(500);
  const cands2 = await pop.$$eval('.row.cand[data-k]', els => els.map(e => e.querySelector('.t').textContent));
  ok('同一网站上回框过的那块，新页面直接认出（不用再框）', cands2[0] === '头条公告', cands2.join(' | '));
  await sw.evaluate(id => handlers.remove({ id }), head.id);
  await nw2.close();

  // ---- 16. 一次贴一串网址 ----
  await app.goto(X('app.html#add')); await app.waitForSelector('#urls');
  await app.fill('#urls', [BASE + '/lamp', BASE + '/news?x=1', 'not a url'].join('\n'));
  ok('按钮写清要盯几个', (await app.textContent('#addGo')) === L('addManyGo', 2));
  await app.fill('#lim', '420');
  await app.screenshot({ path: path.join(OUT, '11-app-add.png') });
  const nA = Object.keys(await W()).length;
  await app.click('#addGo');
  await app.waitForFunction(s => document.querySelector('#addMsg').textContent.startsWith(s), L('addManyDone', 2, '', '', '').split(/[:：.]/)[0], { timeout: 30000 });
  const many = Object.values(await W()).filter(w => /\/lamp$|\/news\?x=1$/.test(w.url) && w.created > Date.now() - 60000);
  const mLamp = many.find(w => w.url.endsWith('/lamp')), mNews = many.find(w => w.url.includes('/news'));
  ok('一串网址一次盯上：认出价格的设了「低于 420」，认不出的盯整页', Object.keys(await W()).length === nA + 2 && mLamp && mLamp.kind === 'price' && mLamp.cond.type === 'below' && mLamp.cond.value === 420 && mNews && !mNews.selector,
    JSON.stringify(many.map(w => ({ u: w.url, k: w.kind, c: w.cond, sel: w.selector }))));
  ok('不像网址的那行跳过并说一声', (await app.textContent('#addMsg')).includes(L('badUrls', '').replace(/[:：]\s*$/, '')));
  await app.screenshot({ path: path.join(OUT, '12-app-added.png') });

  // ---- 17. 删除不问「确定吗」，给撤销 ----
  await app.goto(X('app.html#' + mLamp.id)); await app.waitForSelector('[data-a="del"]');
  await app.click('[data-a="del"]');
  await until(async () => !(await W())[mLamp.id], 4000);
  ok('删除直接删，出「撤销」', !(await W())[mLamp.id] && await app.isVisible('.toast button'));
  await app.click('.toast button');
  await until(async () => !!(await W())[mLamp.id], 4000);
  const back = (await W())[mLamp.id];
  ok('撤销原样放回（含记录）', back && back.cond.value === 420 && (await H(mLamp.id)).length >= 1);
  for (const w of many) await sw.evaluate(id => handlers.remove({ id }), w.id);

  // ---- 18. 用示例试试：一点就有结果 ----
  const demo = await sw.evaluate(() => handlers.demo());
  ok('示例一点就有一条降了价的', demo && demo.demo && demo.unread && (await H(demo.id)).length === 3);
  const dc = await sw.evaluate(id => handlers.checkNow({ id }), demo.id);
  ok('示例不真去看', (await H(demo.id)).length === 3 && !(await W())[demo.id].err);
  await sw.evaluate(id => handlers.remove({ id }), demo.id);

  // ---- 结束 ----
  const swErr = await sw.evaluate(() => globalThis.__errs || []);
  const fails = results.filter(r => !r.pass);
  const realErr = errors.filter(e => !/favicon|404 \(Not Found\)/.test(e));
  console.log('\n页面报错：' + (realErr.length ? '\n' + realErr.join('\n') : '0'));
  console.log(`\n${results.length - fails.length}/${results.length} 通过`);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ results, errors: realErr }, null, 2));
  await ctx.close(); site.kill();
  process.exit(fails.length || realErr.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
