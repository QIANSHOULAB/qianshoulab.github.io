// 步骤账：用 Playwright 把主流程从「第一次打开」走到「结果到手」，第一次用、第二次用各走一遍，每一步记下来。
// 用法：先起 node xunshan/bench/site.js 8790；再 node xunshan/bench/steps.js [插件目录]
//   不给目录就跑当前 extension/；给 0.2.1 的目录（git archive 出来的）就按 0.2.1 的界面走。
//   结果 → bench/results/steps-<版本>.json
// 剧本（两版一样，结果也得一样）：
//   第一次用：刚装好，在「降噪耳机」页要「低于 1000 叫我，每 5 分钟看一次」，然后降价了点通知去看。
//   第二次用 A：同一家店另一个商品「台灯」，要「低于 420 叫我」（还是每 5 分钟）。
//   第二次用 B：同一家店再盯 8 个小物，都是「低于 100 叫我」（还是每 5 分钟）。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const BASE = 'http://localhost:8790';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const src = path.resolve(process.argv[2] || path.join(__dirname, '../extension'));
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ext-'));
  fs.cpSync(src, ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
  const OLD = /^0\.2\./.test(mf.version);
  mf.host_permissions = ['http://localhost/*']; // 「允许」弹窗自动化点不了：预授权，账上照记一步
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
  await fetch(BASE + '/_step?k=0');
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ud-')), {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const EXT = sw.url().split('/')[2];
  const X = p => `chrome-extension://${EXT}/${p}`;
  const WS = () => sw.evaluate(() => chrome.storage.local.get('watches').then(o => o.watches || {}));
  const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(250); } return null; };
  const tabIdOf = url => sw.evaluate(u => chrome.tabs.query({}).then(ts => (ts.find(t => (t.url || '') === u) || {}).id), url);
  const ledger = {};
  let cur = null;
  const step = (what, kind) => { cur.push({ n: cur.length + 1, what, kind: kind || 'click' }); };
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 380, height: 600 });

  // 在一个商品页上加「低于 v」，频率要每 5 分钟
  async function addOne(p, v, first) {
    const pg = await ctx.newPage(); await pg.goto(BASE + p);
    const tab = await tabIdOf(BASE + p);
    const before = new Set(Object.keys(await WS()));
    await pop.goto(X('popup.html?tab=' + tab)); step('点工具栏里的巡山僧');
    if (OLD) {
      await pop.click('#pick'); step('点「框选一块」');
      if (first) step('浏览器问权限，点「允许」', 'perm');
      await pg.bringToFront(); await pg.waitForSelector('qianshou-picker');
      const b = await pg.locator('.price').first().boundingBox();
      await pg.mouse.move(b.x + 10, b.y + b.height / 2); await pg.mouse.click(b.x + 10, b.y + b.height / 2); step('在网页上点中价格');
      await pg.waitForSelector('qianshou-picker .pn');
      await pg.locator('qianshou-picker [data-c="below"]').click(); step('点「低于」');
      await pg.locator('qianshou-picker #cv').fill(String(v)); step('打 ' + v, 'type');
      await pg.locator('qianshou-picker #iv').selectOption('5'); step('点频率下拉'); step('选「每 5 分钟」');
      await pg.locator('qianshou-picker [data-a="go"]').click(); step('点「开盯」');
    } else {
      await pop.waitForSelector('[data-a="pick"]');
      const rows = await pop.$$eval('.row.cand[data-k]', els => els.map(e => e.querySelector('.t').textContent));
      await pop.locator(`.row.cand[data-k="${rows.indexOf('价格')}"]`).click(); step('点认出来的「价格 ¥…」那行（就盯上了）');
      if (first) step('浏览器问权限，点「允许」', 'perm');
      await pop.waitForSelector('.sub');
      await pop.locator('.sub [data-c="below"]').click(); step('点「低于」');
      await pop.locator('#cv').fill(String(v)); await pop.press('#cv', 'Enter'); step('打 ' + v + ' 回车', 'type');
      const w = await until(async () => Object.values(await WS()).find(x => !before.has(x.id)));
      if (w.interval !== 5) {
        await pop.click('.sub [data-a="iv"]'); step('点「每 30 分钟」');
        await pop.click('.menu [data-v="5"]'); step('选「每 5 分钟」');
      }
    }
    const w = await until(async () => Object.values(await WS()).find(x => !before.has(x.id) && x.lastText != null && (x.cond || {}).value === v && x.interval === 5));
    await pg.close();
    return w;
  }

  // ---- 第一次用 ----
  ledger.first = cur = [];
  const w1 = await addOne('/price', 1000, true);
  await fetch(BASE + '/_step?k=3'); // 降到 899
  await sw.evaluate(id => handlers.checkNow({ id }), w1.id);
  const n = await until(async () => { const x = await sw.evaluate(() => new Promise(r => chrome.notifications.getAll(r))); return Object.keys(x).length ? x : null; }, 5000);
  step('弹了通知「降到 899」，点通知去看', 'notif');
  const res1 = { ok: !!(w1 && n), cond: w1 && w1.cond, interval: w1 && w1.interval };
  await fetch(BASE + '/_step?k=0');

  // ---- 第二次用 A：同店另一个商品 ----
  ledger.secondA = cur = [];
  const w2 = await addOne('/item', 420, false);
  const res2 = { ok: !!w2, cond: w2 && w2.cond, interval: w2 && w2.interval };

  // ---- 第二次用 B：同店 8 个小物 ----
  ledger.secondB = cur = [];
  const urls = [1, 2, 3, 4, 5, 6, 7, 8].map(i => '/shop/' + i);
  const before = new Set(Object.keys(await WS()));
  if (OLD) {
    for (const u of urls) {
      step('打开第 ' + u.slice(-1) + ' 个商品页', 'nav');
      cur.pop(); // 打开网页两版都得做（0.3.0 是拿到网址），不进账
      await addOne(u, 100, false);
    }
  } else {
    await pop.goto(X('popup.html')); step('点工具栏里的巡山僧');
    const app = await ctx.newPage(); await app.goto(X('app.html')); step('点「全部」');
    await app.click('#addBtn'); step('点「加一串」');
    await app.fill('#urls', urls.map(u => BASE + u).join('\n')); step('贴 8 个网址', 'type');
    await app.fill('#lim', '100'); step('「低于多少叫」打 100', 'type');
    await app.click('#addGo'); step('点「盯这 8 个」');
    await app.waitForFunction(() => /盯上 8 个/.test(document.querySelector('#addMsg').textContent), null, { timeout: 60000 });
    await app.close();
  }
  const many = await until(async () => { const l = Object.values(await WS()).filter(x => !before.has(x.id) && x.lastText != null && (x.cond || {}).value === 100 && x.interval === 5); return l.length === 8 ? l : null; }, 60000);
  const res3 = { ok: !!many, n: many ? many.length : 0, cond: many && many[0].cond, interval: many && many[0].interval, kinds: many && many.map(x => x.selector && /price|div/.test(x.selector) ? '价格' : '?') };

  const count = l => ({ total: l.length, clicks: l.filter(s => s.kind === 'click' || s.kind === 'perm' || s.kind === 'notif').length, typed: l.filter(s => s.kind === 'type').length });
  const out = { version: mf.version, first: { steps: ledger.first, ...count(ledger.first), result: res1 }, secondA: { steps: ledger.secondA, ...count(ledger.secondA), result: res2 }, secondB: { steps: ledger.secondB, ...count(ledger.secondB), result: res3 } };
  fs.writeFileSync(path.join(__dirname, 'results', 'steps-' + mf.version + '.json'), JSON.stringify(out, null, 1));
  for (const k of ['first', 'secondA', 'secondB']) console.log(mf.version, k, out[k].steps.length + ' 步', JSON.stringify(out[k].result), '\n  ' + out[k].steps.map(s => s.n + '. ' + s.what).join('\n  '));
  await ctx.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
