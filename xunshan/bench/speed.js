// 测快：巡山僧和 changedetection.io 都设成每 5 分钟查一次，真等闹钟。
// 9 条：/fast/0 单独一个网站（127.0.0.1），/fast/1..8 同一个网站（localhost）。
// 开盯 7 分钟后改一次价、再过 10 分钟改第二次，记「改价 → 弹提醒」用时。约 30 分钟。
// 先起 site.js 8790，再 node speed.js   结果 → results/speed.json
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 8790; // 0.4.0：端口可换（PORT=…），免得跟同时在跑的比准撞
const SITE = 'http://localhost:' + PORT;
const url = i => (i === 0 ? 'http://127.0.0.1:' + PORT : SITE) + '/fast/' + i;
const CD = 'http://127.0.0.1:5056';
const MIN = 60000;
const F = u => fetch(u).then(r => r.text());
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  for (let i = 0; i <= 8; i++) await F(`${SITE}/_fast?i=${i}&v=300`);
  // ---- changedetection.io ----（NO_CDIO=1 只跑巡山僧：对手版本没变时用）
  const NOCD = !!process.env.NO_CDIO;
  let cd = null, chrome = null, api = async () => '{}';
  if (!NOCD) {
  const cdData = fs.mkdtempSync(path.join(os.tmpdir(), 'cdspeed-'));
  chrome = spawn(chromium.executablePath(), ['--headless=new', '--remote-debugging-port=9334', '--no-sandbox', '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'chr-'))], { stdio: 'ignore' });
  cd = spawn('changedetection.io', ['-d', cdData, '-p', '5056', '-h', '127.0.0.1'], { env: Object.assign({}, process.env, { ALLOW_IANA_RESTRICTED_ADDRESSES: 'true', PLAYWRIGHT_DRIVER_URL: 'http://127.0.0.1:9334' }), stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await F(CD + '/'); break; } catch (e) { await sleep(1000); } }
  const key = JSON.parse(fs.readFileSync(path.join(cdData, 'changedetection.json'))).settings.application.api_access_token;
  api = (m, p, b) => fetch(CD + '/api/v1' + p, { method: m, headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(r => r.text());
  for (const u of Object.keys(JSON.parse(await api('GET', '/watch')))) await api('DELETE', '/watch/' + u);
  for (let i = 0; i <= 8; i++) await api('POST', '/watch', { url: url(i), title: 'fast' + i, include_filters: ['.price'], time_between_check: { minutes: 5 }, time_between_check_use_default: false, notification_urls: [`json://localhost:${PORT}/hook/cd-fast-${i}`] });
  }

  // ---- 巡山僧 ----
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ext-'));
  fs.cpSync(path.join(ROOT, 'extension'), ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
  mf.host_permissions = ['http://localhost/*', 'http://127.0.0.1/*'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'xs-ud-')), {
    channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const ids = [];
  for (let i = 0; i <= 8; i++) {
    const w = await sw.evaluate(watch => handlers.add({ watch }), { url: url(i), title: 'fast' + i, selector: '.price', pickedText: '¥300.00', interval: 5, cond: { type: 'any' } });
    ids.push(w.id);
  }
  const t0 = Date.now();
  log('都开盯了');
  const events = [];
  const fire = async v => { const t = Date.now(); for (let i = 0; i <= 8; i++) await F(`${SITE}/_fast?i=${i}&v=${v}`); events.push({ t, v }); log('改价', v); };
  await sleep(7 * MIN - (Date.now() - t0)); await fire(280);
  await sleep(17 * MIN - (Date.now() - t0)); await fire(260);
  // 等最多 15 分钟让两边都叫完
  const ourHits = {}; const end = Date.now() + 15 * MIN;
  while (Date.now() < end) {
    const ws = await sw.evaluate(() => chrome.storage.local.get(null));
    for (let i = 0; i <= 8; i++) {
      const h = ws['h:' + ids[i]] || [];
      ourHits[i] = h.filter(e => e.hit).map(e => e.t);
    }
    const hooks = JSON.parse(await F(SITE + '/_hooks')).filter(h => h.name.startsWith('cd-fast-') && h.body.includes('had a change'));
    const done = Object.values(ourHits).every(a => a.length >= 2) && (NOCD || hooks.length >= 18);
    if (done) break;
    await sleep(5000);
  }
  const hooks = JSON.parse(await F(SITE + '/_hooks')).filter(h => h.name.startsWith('cd-fast-') && h.body.includes('had a change'));
  const lat = (times, e, next) => { const x = times.find(t => t >= e.t && (!next || t < next.t)); return x ? Math.round((x - e.t) / 1000) : null; };
  const out = { events, ours: {}, cdio: {} };
  for (let i = 0; i <= 8; i++) {
    const cdt = hooks.filter(h => h.name === 'cd-fast-' + i).map(h => h.t);
    out.ours[i] = events.map((e, k) => lat(ourHits[i] || [], e, events[k + 1]));
    out.cdio[i] = events.map((e, k) => lat(cdt, e, events[k + 1]));
  }
  log(JSON.stringify(out));
  fs.writeFileSync(path.join(__dirname, 'results', process.env.OUT || 'speed.json'), JSON.stringify(out, null, 1));
  await ctx.close(); if (cd) cd.kill(); if (chrome) chrome.kill();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
