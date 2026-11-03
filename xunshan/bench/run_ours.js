// 巡山僧跑剧本（0.3.0）：真装插件进 Playwright Chromium，照真人用法建全部 16 条盯梢，然后按剧本 8 步每步把每条都查一次，记谁叫了。
// 建法：弹窗一开就认出价格 / 库存 / 名额 → 点那行就盯上，条件跟默认不一样才改；认不出的自己框一块或盯整页；
//       同一网站 8 个小物用总览页「加一串」一次贴进去。点了几下、打了几处字都记下来。
// 用法：node xunshan/bench/run_ours.js（或先起 node bench/site.js 8790 再 NO_SITE=1 ...）
//       结果 → bench/results/ours-<版本>.json，截图 → bench/shots/
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { W, STEPS } = require('./scenario');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(__dirname, 'results'), SHOT = path.join(__dirname, 'shots');
fs.mkdirSync(RES, { recursive: true }); fs.mkdirSync(SHOT, { recursive: true });
const PORT = 8790, BASE = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 剧本要的条件（跟 0.2.1 那场一样）
const COND = { W1: ['below', 1000], W2: ['gone', '缺货'], W3: ['above', 0], W4: ['any'], W5: ['any'], W6: ['below', 420], W7: ['any'], W8: ['below', 500], W9: ['below', 100] };
const KIND = { W1: '价格', W2: '库存', W3: '名额', W5: '价格', W6: '价格', W8: '价格' };
const PICK = { W7: '#status' };

(async () => {
  const site = process.env.NO_SITE ? null : spawn(process.execPath, [path.join(__dirname, 'site.js'), String(PORT)], { stdio: 'inherit' });
  if (site) process.on('exit', () => site.kill());
  await sleep(600);
  await fetch(BASE + '/_step?k=0');
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ext-'));
  fs.cpSync(path.join(ROOT, 'extension'), ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
  mf.host_permissions = ['http://localhost/*']; // 测试版预授权；正式用时每个新网站第一次会弹一次「允许」，两版一样，点数里不算
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ud-'));
  const ctx = await chromium.launchPersistentContext(ud, {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const EXT = sw.url().split('/')[2];
  const X = p => `chrome-extension://${EXT}/${p}`;
  const WS = () => sw.evaluate(() => chrome.storage.local.get('watches').then(o => o.watches || {}));
  const H = id => sw.evaluate(id => chrome.storage.local.get('h:' + id).then(o => o['h:' + id] || []), id);
  const until = async (fn, ms = 40000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(300); } return null; };
  const tabIdOf = url => sw.evaluate(u => chrome.tabs.query({}).then(ts => (ts.find(t => (t.url || '') === u) || {}).id), url);

  // 用户本来就登录着这家店
  const lg = await ctx.newPage(); await lg.goto(BASE + '/login?go=1'); await lg.close();

  const ids = {}, clicks = {}, typed = {}, how = {};
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 380, height: 600 });
  const setCond = async (scope, key, w) => {
    const want = COND[key];
    if (w.cond.type === want[0] && (want[1] === undefined || w.cond.value === want[1])) return 0;
    let n = 0;
    await scope.locator(`[data-c="${want[0]}"]`).first().click(); n++;
    if (want[1] !== undefined) { const i = scope.locator('#cv'); if (await i.count()) { await i.fill(String(want[1])); await i.press('Enter'); typed[key + '_'] = 1; } }
    return n;
  };
  for (const w of W.filter(x => !x.id.startsWith('W9'))) {
    let n = 0, ty = 0;
    const key = w.id;
    const pg = await ctx.newPage(); await pg.goto(BASE + w.path);
    if (key === 'W3') await pg.waitForSelector('.seats');
    const tab = await tabIdOf(BASE + w.path);
    await pop.goto(X('popup.html?tab=' + tab)); n++; // 点工具栏图标
    await pop.waitForSelector('[data-a="pick"]');
    if (w.id === 'W1') await pop.screenshot({ path: path.join(SHOT, 'ours-0.3-1-popup.png') });
    const rows = await pop.$$eval('.row.cand[data-k]', els => els.map(e => e.querySelector('.t').textContent));
    const before = new Set(Object.keys(await WS()));
    let got;
    if (KIND[key] && rows.includes(KIND[key])) {
      await pop.locator(`.row.cand[data-k="${rows.indexOf(KIND[key])}"]`).click(); n++;
      got = await until(async () => Object.values(await WS()).find(x => !before.has(x.id)));
      await pop.waitForSelector('.sub');
      delete typed[key + '_'];
      n += await setCond(pop.locator('.sub'), key, got);
      ty += typed[key + '_'] ? 1 : 0;
      how[key] = '认出' + KIND[key];
      if (w.id === 'W1') { await sleep(300); await pop.screenshot({ path: path.join(SHOT, 'ours-0.3-2-added.png') }); }
    } else if (PICK[key]) {
      await pop.click('[data-a="pick"]'); n++;
      await pg.bringToFront(); await pg.waitForSelector('qianshou-picker');
      const b = await pg.locator(PICK[key]).first().boundingBox();
      await pg.mouse.move(b.x + Math.min(12, b.width / 2), b.y + b.height / 2); await sleep(120);
      await pg.mouse.click(b.x + Math.min(12, b.width / 2), b.y + b.height / 2); n++;
      await pg.waitForSelector('qianshou-picker .pn .seg');
      got = await until(async () => Object.values(await WS()).find(x => !before.has(x.id)));
      delete typed[key + '_'];
      n += await setCond(pg.locator('qianshou-picker .pn'), key, got);
      ty += typed[key + '_'] ? 1 : 0;
      how[key] = '自己框';
    } else {
      await pop.click('[data-a="whole"]'); n++;
      how[key] = '盯整页';
    }
    const done = await until(async () => Object.values(await WS()).find(x => !before.has(x.id) && (x.lastText != null || x.err)));
    ids[key] = done && done.id; clicks[key] = n; typed[key] = ty;
    console.log(key, how[key], done ? JSON.stringify({ sel: done.selector, mode: done.mode, text: (done.lastText || '').slice(0, 40), cond: done.cond, err: done.err }) : 'NOT CREATED');
    await pg.close();
  }
  // 同一网站 8 个小物：总览页「加一串」一次贴进去，一个「低于 100」管 8 个
  {
    let n = 0, ty = 0;
    const app = await ctx.newPage(); await app.setViewportSize({ width: 1280, height: 800 });
    await app.goto(X('app.html')); n += 2; // 点图标 → 点「全部」
    await app.click('#addBtn'); n++;
    const urls = W.filter(x => x.id.startsWith('W9')).map(x => BASE + x.path);
    await app.fill('#urls', urls.join('\n')); ty++;
    await app.fill('#lim', '100'); ty++;
    await app.screenshot({ path: path.join(SHOT, 'ours-0.3-3-batch.png') });
    const before = new Set(Object.keys(await WS()));
    await app.click('#addGo'); n++;
    await app.waitForFunction(() => /盯上 8 个/.test(document.querySelector('#addMsg').textContent), null, { timeout: 60000 });
    await until(async () => Object.values(await WS()).filter(x => !before.has(x.id) && x.lastText != null).length === 8);
    for (const w of W.filter(x => x.id.startsWith('W9'))) {
      const x = Object.values(await WS()).find(y => y.url === BASE + w.path);
      ids[w.id] = x && x.id; how[w.id] = '加一串';
      console.log(w.id, JSON.stringify({ sel: x && x.selector, text: x && x.lastText, cond: x && x.cond }));
    }
    clicks.W9 = n; typed.W9 = ty;
    await app.close();
  }
  for (const k of Object.keys(typed)) if (k.endsWith('_')) delete typed[k];
  // 条件得跟剧本一样，准才能跟上一版比
  const ws = await WS();
  const bad = Object.entries(ids).filter(([k, id]) => { const c = COND[k.startsWith('W9') ? 'W9' : k], w = ws[id]; return !w || w.cond.type !== c[0] || (c[1] !== undefined && w.cond.value !== c[1]); });
  console.log('条件跟剧本对不上的：', bad.length ? bad.map(b => b[0]).join(',') : '无');

  // 剧本：每一步把所有盯梢查一遍
  const out = {};
  for (const w of W) out[w.id] = [];
  for (let k = 1; k < STEPS; k++) {
    await fetch(BASE + '/_step?k=' + k);
    for (const w of W) {
      const id = ids[w.id]; if (!id) { out[w.id].push('none'); continue; }
      const before = (await H(id)).length;
      await sw.evaluate(id => handlers.checkNow({ id }), id);
      const h = await H(id), x = (await WS())[id];
      const e = h.length > before ? h[h.length - 1] : null;
      out[w.id].push(x.err ? 'err:' + x.err : e ? (e.hit ? 'alert' : 'change') : 'same');
    }
    console.log('step', k, W.map(w => w.id + '=' + out[w.id][k - 1]).join(' '));
  }

  const app = await ctx.newPage(); await app.goto(X('app.html')); await sleep(800);
  await app.screenshot({ path: path.join(SHOT, 'ours-0.3-4-list.png') });
  fs.writeFileSync(path.join(RES, 'ours-' + mf.version + '.json'), JSON.stringify({ tool: '巡山僧 ' + mf.version, clicks, typed, how, condMismatch: bad.map(b => b[0]), steps: out }, null, 1));
  await ctx.close(); if (site) site.kill();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
