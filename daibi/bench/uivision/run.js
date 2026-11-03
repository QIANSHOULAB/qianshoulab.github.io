// UI.Vision（Chrome 应用商店官方包，0.2.2 复赛用的是 10.0.303）实测：建宏 → 导入 CSV → 写 JS 宏 → 播放，服务器收到什么记下来。
// 取包：curl -L -o uiv.crx "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0.0.0&acceptformat=crx2,crx3&x=id%3Dgcbalfbdmfieckjlnblleoemohcganoc%26uc"
//       去掉 crx3 头（12 字节 + 头长）剩下的是 zip，解到一个空目录。
// 跑法：UIV_EXT=解开的目录 CSV=表20 另存的 csv OUT=输出目录 xvfb-run -a node run.js plain plain.js 0
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const EXT = process.env.UIV_EXT, OUT = process.env.OUT || __dirname, PORT = 19900;
const site = process.argv[2], scriptFile = process.argv[3], startPort = PORT + +process.argv[4];
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'site.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'uiv-')), { headless: false, viewport: { width: 1280, height: 860 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-backgrounding-occluded-windows'] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = sw.url().split('/')[2];
  await new Promise(r => setTimeout(r, 2000));
  for (const p of ctx.pages()) if (/ui\.vision/.test(p.url())) await p.close();
  const web = ctx.pages()[0] || await ctx.newPage();
  web.on('dialog', d => d.dismiss().catch(() => {}));
  await web.goto(`http://127.0.0.1:${startPort}/`);
  const d = await ctx.newPage();
  d.on('dialog', x => x.accept().catch(() => {}));
  await d.goto(`chrome-extension://${id}/popup.html`); await d.waitForTimeout(2500);
  await d.click('text=+ Macro'); await d.waitForTimeout(600);
  await d.fill('input[placeholder="Macro name"]', site); await d.click('button:has-text("Confirm")'); await d.waitForTimeout(1200);
  await d.click('.ant-tabs-tab:has-text("CSV/TXT")'); await d.waitForTimeout(500);
  await d.setInputFiles('input[accept=".csv,.txt"]', { name: 't20.csv', mimeType: 'text/csv', buffer: fs.readFileSync(process.env.CSV) });
  await d.waitForTimeout(1000);
  const code = fs.readFileSync(scriptFile, 'utf8');
  const how = scriptFile.endsWith('.json') ? await (async () => {
    await d.setInputFiles('#select_json_files_for_macros', { name: site + '_m.json', mimeType: 'application/json', buffer: fs.readFileSync(scriptFile) });
    await d.waitForTimeout(1500);
    await d.click(`text=${site}_m`).catch(e => console.log('no macro in list', e.message.slice(0, 60)));
    await d.waitForTimeout(1000); return 'imported';
  })() : await d.evaluate(code => { const cm = document.querySelector('.CodeMirror'); if (cm && cm.CodeMirror) { cm.CodeMirror.setValue(code); return 'cm5'; } return [...document.querySelectorAll('[class*=editor i],textarea')].map(e => e.className).join(',').slice(0, 300); }, code);
  console.log('editor', how);
  await d.click('button:has-text("Save..")').catch(() => {}); await d.waitForTimeout(800);
  await d.screenshot({ path: OUT + `/${site}-ready.png` });
  // 网页单开一个窗口放前台（跟侧栏并排的真用法一样；同窗口后台标签的计时器被节流，回放会慢得离谱）
  const [w2] = await Promise.all([ctx.waitForEvent('page'), d.evaluate(u => window.open(u, '_blank', 'popup,left=0,top=0,width=900,height=820'), `http://127.0.0.1:${startPort}/`)]);
  w2.on('dialog', x => x.dismiss().catch(() => {}));
  await web.close();
  await w2.waitForLoadState(); await w2.bringToFront(); await d.bringToFront(); await w2.bringToFront();
  await fetch(`http://127.0.0.1:${PORT}/api/reset`, { method: 'POST' });
  const t0 = Date.now(); ctx.on('page', p => console.log('new page', p.url())); d.on('close', () => console.log('dash closed at', (Date.now() - t0) / 1000));
  await d.click('button:has-text("Play")');
  // 等播放结束：Play 按钮重新可点 / 日志出现结束字样
  await d.waitForSelector('button:has-text("Stop")', { timeout: 15000 }).catch(() => {});
  while (Date.now() - t0 < 900000) {
    await new Promise(r => setTimeout(r, 500));
    const lg = await (await fetch(`http://127.0.0.1:${PORT}/api/log`)).json();
    if (process.env.MID && Date.now() - t0 > 150000 && !globalThis.__shot) { globalThis.__shot = 1; await d.screenshot({ path: OUT + '/mid.png' }); const tx = await d.evaluate(() => document.body.innerText); fs.writeFileSync(OUT + '/mid.txt', tx); await d.evaluate(() => { const c = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 50 && /Executing/.test(e.innerText) && e.children.length > 5); return c && c.innerText; }).then(t => fs.writeFileSync(OUT + '/midlog.txt', t || '')); break; }
    if (lg.length !== (globalThis.__n || 0)) { globalThis.__n = lg.length; console.log('t', ((Date.now() - t0) / 1000).toFixed(1), 'received', lg.length); fs.writeFileSync(OUT + `/uiv-${site}.json`, JSON.stringify({ secs: ((Date.now() - t0) / 1000).toFixed(1), received: lg.filter(x => x.site === site).map(x => x.f) }, null, 1)); }
    let on; try { on = await d.isVisible('button:has-text("Stop")'); } catch (e) { console.log('dash gone', e.message.slice(0, 80)); break; } if (!on) break;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  await d.click('.ant-tabs-tab:has-text("Logs")').catch(() => {});
  await d.waitForTimeout(300);
  await d.screenshot({ path: OUT + `/${site}-end.png` });
  const log = await (await fetch(`http://127.0.0.1:${PORT}/api/log`)).json();
  const logsTxt = await d.evaluate(() => (document.querySelector('.logs-screenshots, .ant-tabs-tabpane-active') || document.body).innerText);
  fs.writeFileSync(OUT + `/uiv-${site}.json`, JSON.stringify({ secs, received: log.filter(x => x.site === site || (site === 'iframe' && x.site === 'inner')).map(x => x.f) }, null, 1));
  console.log('secs', secs, 'received', log.length);
  const errs = logsTxt.split('\n').filter(l => /row error/.test(l));
  console.log('row errors', errs.length); console.log(errs.slice(0, 8).join('\n'));
  console.log(logsTxt.split('\n').slice(-6).join('\n'));
  await ctx.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
