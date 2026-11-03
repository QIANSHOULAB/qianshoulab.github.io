// 巡山僧跑剧本：真装插件，用真框选建 16 条盯梢，然后按剧本 8 步每步把每条都查一次，记谁叫了。
// 用法：node xunshan/bench/run_ours.js   结果 → bench/results/ours.json，截图 → bench/shots/
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { W, STEPS } = require('./scenario');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(__dirname, 'results'), SHOT = path.join(__dirname, 'shots');
fs.mkdirSync(RES, { recursive: true }); fs.mkdirSync(SHOT, { recursive: true });
const PORT = 8790, BASE = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const COND = { W1: ['below', '1000'], W2: ['gone', '缺货'], W3: ['above', '0'], W6: ['below', '420'], W8: ['below', '500'] };
const TARGET = { W1: '.price', W2: '#stock', W3: '.seats', W5: '.price', W6: '.price', W7: '#status', W8: '.price' };

(async () => {
  const site = process.env.NO_SITE ? null : spawn(process.execPath, [path.join(__dirname, 'site.js'), String(PORT)], { stdio: 'inherit' });
  await sleep(600);
  await fetch(BASE + '/_step?k=0');
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ext-'));
  fs.cpSync(path.join(ROOT, 'extension'), ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
  mf.host_permissions = ['http://localhost/*']; // 测试版预授权；正式用时开盯会弹一次「允许」，点数里另算
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

  const ids = {}, clicks = {}, typed = {};
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 360, height: 520 });
  for (const w of W) {
    let n = 0, ty = 0;
    const pg = await ctx.newPage(); await pg.goto(BASE + w.path);
    const key = w.id.startsWith('W9') ? 'W9' : w.id;
    const target = TARGET[key] || (key === 'W9' ? '.price' : null);
    if (target) await pg.waitForSelector(target);
    const tab = await tabIdOf(BASE + w.path);
    await pop.goto(X('popup.html?tab=' + tab)); n++; // 点工具栏图标
    if (w.id === 'W1') await pop.screenshot({ path: path.join(SHOT, 'ours-1-popup.png') });
    if (!target) { await pop.click('#whole'); n++; }
    else {
      await pop.click('#pick'); n++;
      await pg.bringToFront(); await pg.waitForSelector('qianshou-picker');
      const b = await pg.locator(target).first().boundingBox();
      await pg.mouse.move(b.x + Math.min(12, b.width / 2), b.y + b.height / 2); await sleep(120);
      await pg.mouse.click(b.x + Math.min(12, b.width / 2), b.y + b.height / 2); n++;
      await pg.waitForSelector('qianshou-picker .pn');
      const c = COND[key] || (key === 'W9' ? ['below', '100'] : null);
      if (c) { await pg.locator(`qianshou-picker [data-c="${c[0]}"]`).click(); n++; await pg.locator('qianshou-picker #cv').fill(c[1]); ty++; }
      if (w.id === 'W1') { await sleep(150); await pg.screenshot({ path: path.join(SHOT, 'ours-2-pick.png') }); }
      await pg.locator('qianshou-picker [data-a="go"]').click(); n++;
    }
    const got = await until(async () => Object.values(await WS()).find(x => x.url === BASE + w.path && (x.lastText != null || x.err) && !Object.values(ids).includes(x.id)));
    ids[w.id] = got && got.id; clicks[w.id] = n; typed[w.id] = ty;
    console.log(w.id, got ? JSON.stringify({ sel: got.selector, mode: got.mode, text: (got.lastText || '').slice(0, 40), cond: got.cond, err: got.err }) : 'NOT CREATED');
    await pg.close();
  }

  // 剧本：每一步把所有盯梢查一遍
  const out = {};
  for (const w of W) out[w.id] = [];
  for (let k = 1; k < STEPS; k++) {
    await fetch(BASE + '/_step?k=' + k);
    for (const w of W) {
      const id = ids[w.id]; if (!id) { out[w.id].push('none'); continue; }
      const before = (await H(id)).length;
      await sw.evaluate(id => handlers.checkNow({ id }), id);
      const h = await H(id), ws = (await WS())[id];
      const e = h.length > before ? h[h.length - 1] : null;
      out[w.id].push(ws.err ? 'err:' + ws.err : e ? (e.hit ? 'alert' : 'change') : 'same');
    }
    console.log('step', k, W.map(w => w.id + '=' + out[w.id][k - 1]).join(' '));
  }

  const app = await ctx.newPage(); await app.goto(X('app.html')); await sleep(800);
  await app.screenshot({ path: path.join(SHOT, 'ours-3-list.png') });
  fs.writeFileSync(path.join(RES, 'ours.json'), JSON.stringify({ tool: '巡山僧 0.1.0', clicks, typed, steps: out }, null, 1));
  await ctx.close(); if (site) site.kill();
})().catch(e => { console.error(e); process.exit(1); });
