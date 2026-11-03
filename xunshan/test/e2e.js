// 巡山僧端到端测试：真把插件装进 Chromium，在本地测试网站上把整条链路跑一遍。
// 用法：node xunshan/test/e2e.js  （截图写到 xunshan/test/out/）
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const PORT = 8787, BASE = `http://localhost:${PORT}`;
const SLOW = !process.argv.includes('--fast'); // --fast 跳过等真闹钟那一步
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra) => { results.push({ name, pass: !!cond, extra }); console.log((cond ? '✓ ' : '✗ ') + name + (extra ? '  ' + extra : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = p => fetch(BASE + p).then(r => r.json());

(async () => {
  const site = spawn(process.execPath, [path.join(__dirname, 'site.js'), String(PORT)], { stdio: 'inherit' });
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
  await pop.screenshot({ path: path.join(OUT, '01-popup-empty.png') });
  ok('弹窗空状态显示', await pop.isVisible('#empty'));

  // ---- 2. 框选价格，设「低于 1000」，开盯 ----
  await shop.evaluate(() => { window.__clicks = 0; document.addEventListener('click', () => window.__clicks++); });
  await pop.click('#pick');
  await shop.bringToFront();
  await shop.waitForSelector('qianshou-picker');
  const pb = await shop.locator('.price').boundingBox();
  await shop.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await sleep(150);
  await shop.screenshot({ path: path.join(OUT, '02-pick-hover.png') });
  await shop.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await shop.waitForSelector('qianshou-picker .pn');
  ok('框选后出现面板并认出数字', (await shop.locator('qianshou-picker .nm').textContent()).includes('1,299'));
  await shop.locator('qianshou-picker [data-c="below"]').click();
  await shop.locator('qianshou-picker #cv').fill('1000');
  await sleep(100);
  await shop.screenshot({ path: path.join(OUT, '03-pick-panel.png') });
  ok('框选时网页本身收不到点击（不会误点按钮）', (await shop.evaluate(() => window.__clicks)) === 0);
  await shop.locator('qianshou-picker [data-a="go"]').click();
  await shop.waitForSelector('qianshou-picker .ok');
  await shop.screenshot({ path: path.join(OUT, '04-pick-done.png') });
  const priceW = await until(async () => Object.values(await W()).find(w => w.url.endsWith('/shop') && w.lastText != null));
  ok('自动起名带「价格」', priceW && /价格$/.test(priceW.label), priceW && priceW.label);
  ok('价格盯梢建好并拿到基准', priceW && /1,299/.test(priceW.lastText), priceW && JSON.stringify({ sel: priceW.selector, text: priceW.lastText, mode: priceW.mode, cond: priceW.cond }));
  ok('条件存成 低于 1000', priceW && priceW.cond.type === 'below' && priceW.cond.value === 1000);
  ok('静态页走直接抓取', priceW && priceW.mode === 'fetch');
  await until(async () => !(await shop.$('qianshou-picker')), 4000);
  ok('面板自动收起', !(await shop.$('qianshou-picker')));

  // ---- 3. 再框一个库存（文字条件：「缺货」消失）----
  await pop.reload();
  await pop.click('#pick');
  await shop.waitForSelector('qianshou-picker');
  const sb = await shop.locator('#stock').boundingBox();
  await shop.mouse.move(sb.x + 8, sb.y + 8); await shop.mouse.click(sb.x + 8, sb.y + 8);
  await shop.locator('qianshou-picker [data-c="gone"]').click();
  await shop.locator('qianshou-picker #cv').fill('缺货');
  await shop.locator('qianshou-picker #iv').selectOption('5');
  await shop.locator('qianshou-picker [data-a="go"]').click();
  const stockW = await until(async () => Object.values(await W()).find(w => w.selector && w.selector.includes('stock') && w.lastText != null));
  ok('库存盯梢建好，频率 5 分钟', stockW && stockW.interval === 5 && stockW.lastText === '缺货', stockW && stockW.selector);

  // ---- 4. 脚本渲染页：自动改用后台标签 ----
  const spa = await ctx.newPage(); await spa.goto(BASE + '/spa'); await spa.waitForSelector('#seats');
  const spaTab = await tabIdOf(BASE + '/spa');
  await pop.goto(X('popup.html?tab=' + spaTab));
  await pop.click('#pick');
  await spa.bringToFront();
  await spa.waitForSelector('qianshou-picker');
  const eb = await spa.locator('.seats').boundingBox();
  await spa.mouse.move(eb.x + 10, eb.y + 8); await spa.mouse.click(eb.x + 10, eb.y + 8);
  await spa.locator('qianshou-picker [data-a="go"]').click();
  const spaW = await until(async () => Object.values(await W()).find(w => w.url.endsWith('/spa') && w.lastText != null), 40000);
  ok('脚本渲染页（还不许被嵌）自动改用看不见的小窗', spaW && spaW.mode === 'frame' && /剩余名额：0/.test(spaW.lastText), spaW && JSON.stringify({ mode: spaW.mode, text: spaW.lastText }));
  tabsOpened = await bgTabs();
  const spaTabs = await sw.evaluate(() => chrome.tabs.query({}).then(ts => ts.filter(t => (t.url || '').endsWith('/spa')).length));
  ok('巡山不在用户窗口里开标签', spaTabs === 1 && tabsOpened === 0, 'spa 标签数 ' + spaTabs + '，巡山开过的标签 ' + tabsOpened);

  // ---- 5. 盯整页（公告）----
  const nws = await ctx.newPage(); await nws.goto(BASE + '/news');
  const newsTab = await tabIdOf(BASE + '/news');
  await pop.goto(X('popup.html?tab=' + newsTab));
  await pop.click('#whole');
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
  await pop.click('#pick');
  await lg.bringToFront(); await lg.waitForSelector('qianshou-picker');
  const vb = await lg.locator('#vip').boundingBox();
  await lg.mouse.move(vb.x + 10, vb.y + 10); await lg.mouse.click(vb.x + 10, vb.y + 10);
  await lg.locator('qianshou-picker [data-a="go"]').click();
  const memW = await until(async () => Object.values(await W()).find(w => w.url.endsWith('/member') && (w.lastText != null || w.err)));
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
  ok('验证码页标成「被拦」并退避', cap && cap.err === 'blocked' && cap.nextCheck - Date.now() > 25 * 60000, cap && cap.err);
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
  await pop.goto(X('popup.html?tab=' + lampTab)); await pop.click('#pick');
  await lp.bringToFront(); await lp.waitForSelector('qianshou-picker');
  const lb = await lp.locator('.price').boundingBox();
  await lp.mouse.move(lb.x + 10, lb.y + 10); await lp.mouse.click(lb.x + 10, lb.y + 10);
  await lp.locator('qianshou-picker [data-c="below"]').click(); await lp.locator('qianshou-picker #cv').fill('420');
  await lp.locator('qianshou-picker [data-a="go"]').click();
  const lampW = await until(async () => Object.values(await W()).find(w => w.url.endsWith('/lamp') && w.lastText != null));
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
  await app.selectOption('#civ', '60');
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
  await pop.goto(X('popup.html?tab=' + shopTab)); await pop.waitForSelector('.it');
  await pop.screenshot({ path: path.join(OUT, '08-popup-list.png') });
  await pop.emulateMedia({ colorScheme: 'dark' }); await pop.reload(); await pop.waitForSelector('.it');
  await pop.screenshot({ path: path.join(OUT, '09-popup-dark.png') });
  // 框选面板深色
  await shop.emulateMedia({ colorScheme: 'dark' });
  await pop.click('#pick'); await shop.bringToFront(); await shop.waitForSelector('qianshou-picker');
  const pb2 = await shop.locator('.price').boundingBox();
  await shop.mouse.move(pb2.x + 20, pb2.y + 10); await shop.mouse.click(pb2.x + 20, pb2.y + 10);
  await shop.waitForSelector('qianshou-picker .pn'); await sleep(250);
  await shop.screenshot({ path: path.join(OUT, '10-pick-dark.png') });
  await shop.keyboard.press('Escape');
  ok('Esc 退出框选', !(await shop.$('qianshou-picker')));

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
