/* 代笔僧步骤账：照真人的做法，把主流程从「第一次打开」走到「结果到手」，第一次用、第二次用各走一遍，记下人动的每一下。
 * 默认模式（手动提交，拍板 2A：提交由人点）。两种网站：
 *   订单站（交完回空表单，16 列里「开发票」自动对不上，要人点选）
 *   报名向导（两页 + 成功页，交完不回表单）
 * 第一次 = 新装的浏览器、这个网站没答应过；第二次 = 隔天换一批（同表头的新文件），再开一次侧栏。
 * 跑法：xvfb-run -a node daibi/bench/steps.js [插件目录] [输出 json]
 * 授权弹窗：测试副本 manifest 预给了 127.0.0.1 权限才进得去网页；侧栏里的 chrome.permissions 换成假的，
 *          第一次问某个网站就记一下「允许」（真用户在浏览器弹窗里点的那一下），以后不再算。
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const EXT = path.resolve(process.argv[2] || path.join(__dirname, '../extension'));
const OUTF = process.argv[3] || path.join(__dirname, 'results', 'steps.json');
const PORT = 18950;
const SITE = n => `http://127.0.0.1:${PORT + n}`;
const K = 3; // 每批 3 行，够看出每行要人动几下
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 两批数据：从测试表取前 6 行，拆成两个 CSV（同表头）
const gbk = new TextDecoder('gbk').decode(fs.readFileSync(path.join(__dirname, '../test/data/订单20行-GBK.csv')));
const lines = gbk.split(/\r?\n/).filter(Boolean);
const batch = (a, b) => Buffer.from('﻿' + [lines[0], ...lines.slice(a, b)].join('\n'), 'utf8');
const FILES = { 1: { name: '本周订单.csv', buf: batch(1, 1 + K) }, 2: { name: '下周订单.csv', buf: batch(1 + K, 1 + 2 * K) } };

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '../test/site.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await sleep(500);
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-ext-'));
  fs.cpSync(EXT, ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  mf.host_permissions = [...(mf.host_permissions || []), 'http://127.0.0.1/*'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-prof-')), {
    headless: false, viewport: { width: 900, height: 820 }, locale: 'zh-CN',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--disable-backgrounding-occluded-windows']
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const version = mf.version;
  const web = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  web.on('pageerror', e => errors.push('web: ' + e.message));
  await web.goto(SITE(0) + '/order');
  const tabId = await (async () => { const p = await ctx.newPage(); await p.goto(`chrome-extension://${extId}/panel.html`); const id = await p.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1/*' }))[0].id); await p.close(); return id; })();

  const MOCK = () => {
    const KEY = '__granted';
    const get = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
    const P = chrome.permissions;
    const fake = {
      request: async ({ origins = [] }) => { const g = get(); const need = origins.filter(o => !g.includes(o)); if (need.length) { localStorage.setItem(KEY, JSON.stringify([...g, ...need])); localStorage.setItem('__asks', String(+(localStorage.getItem('__asks') || 0) + 1)); } return true; },
      contains: async ({ origins = [] }) => { const g = get(); return origins.every(o => g.includes(o) || /qianshoulab/.test(o)); }
    };
    try { Object.defineProperty(chrome, 'permissions', { value: Object.assign(Object.create(P), fake), configurable: true }); } catch (e) { P.request = fake.request; P.contains = fake.contains; }
  };

  const result = { version, scenarios: [] };
  for (const [siteN, siteName, startPath, submitSel] of [[0, '订单站（交完回空表单）', '/order', 'button[type=submit]'], [1, '报名向导（两页 + 成功页）', '/wizard/1', 'button[type=submit]']]) {
    for (const use of [1, 2]) {
      const steps = []; const add = (who, what) => steps.push({ who, what });
      await fetch(SITE(0) + '/api/reset', { method: 'POST' });
      await web.goto(SITE(siteN) + startPath);
      // 打开侧栏（真用户：点工具栏上的代笔僧图标）
      const panel = await ctx.newPage();
      panel.on('pageerror', e => errors.push('panel: ' + e.message));
      await panel.addInitScript(MOCK);
      await panel.setViewportSize({ width: 380, height: 820 });
      await panel.goto(`chrome-extension://${extId}/panel.html?tab=${tabId}`);
      if (use === 1) await panel.evaluate(() => localStorage.removeItem('__granted')); // 换了个网站：没答应过
      await web.bringToFront();
      add('人', '点工具栏图标，开侧栏');
      await panel.waitForSelector('#btnMain'); await sleep(800);
      const asks = () => panel.evaluate(() => +(localStorage.getItem('__asks') || 0));
      const S = () => panel.evaluate(() => { const d = window.__daibi, b = document.getElementById('btnMain'); return { st: d.S().st.map(x => x.s), name: d.S().table && d.S().table.name, row: d.run.row, phase: d.run.phase, going: d.run.going, picking: !!document.querySelector('.fbtn.picking'), warn: !document.getElementById('warn').hidden, mode: b.dataset.mode, dis: b.disabled, label: b.textContent.trim() }; });
      // 放表
      const f = FILES[use];
      let s = await S();
      if (s.mode === 'needTable' && !s.dis) { await panel.click('#btnMain').catch(() => {}); add('人', `点「${s.label}」`); }
      else add('人', '点「选文件」');
      await panel.setInputFiles('#file', { name: f.name, mimeType: 'text/csv', buffer: f.buf });
      add('人', `文件框里点 ${f.name}`); add('人', '文件框点「打开」');
      await sleep(1500);
      const t0 = Date.now(); let idle = 0, lastAsks = await asks(), stuck = '';
      for (;;) {
        s = await S();
        if (s.name === f.name && s.st.length && s.st.every(x => x === 'done')) break;
        if (Date.now() - t0 > 60000) { stuck = '超时：' + JSON.stringify(s); break; }
        if (s.warn) {
          const txt = (await panel.textContent('#warnTxt')).trim();
          await panel.click('#warnPick'); add('人', `黄条「${txt}」点「去点选」`); await sleep(400);
          if (!(await S()).picking) { await panel.click('.frow[data-h="开发票"] [data-act=pick]'); add('人', '「开发票」那行点「点选」'); await sleep(300); }
          await web.click('text=需要发票'); add('人', '网页上点「需要发票」'); await sleep(1200); idle = 0; continue;
        }
        if (s.row >= 0 && s.st[s.row] === 'filled' && s.phase === 'wait' && !s.going) {
          await sleep(300); // 人看一眼
          const btn = web.locator(submitSel).first();
          const label = (await btn.textContent().catch(() => '提交')).trim();
          await btn.click(); add('人', `看一眼第 ${s.row + 1} 行，点网页上的「${label}」`); await sleep(900); idle = 0; continue;
        }
        if (!s.dis && ['fill', 'go', 'back', 'match'].includes(s.mode) && ((s.phase === 'idle' && s.row < 0) || s.phase === 'needBack')) {
          await panel.click('#btnMain'); add('人', `点侧栏「${s.label}」`); await sleep(700);
          const a = await asks(); if (a > lastAsks) { add('人', '浏览器弹窗点「允许」'); lastAsks = a; }
          idle = 0; continue;
        }
        if (++idle > 60) { stuck = '卡住：' + JSON.stringify(s); break; }
        await sleep(250);
      }
      const a = await asks(); if (a > lastAsks) add('人', '浏览器弹窗点「允许」');
      const lg = (await (await fetch(SITE(0) + '/api/log')).json());
      const got = lg.length;
      const n = steps.length;
      console.log(`\n[${version}] ${siteName} · 第 ${use} 次（${K} 行）：人动 ${n} 下，网站收到 ${got} 单${stuck ? '  ' + stuck : ''}`);
      steps.forEach((x, i) => console.log(`  ${i + 1}. ${x.what}`));
      result.scenarios.push({ site: siteName, use, rows: K, clicks: n, received: got, stuck, steps: steps.map(x => x.what) });
      await panel.close();
    }
  }
  result.errors = errors;
  fs.mkdirSync(path.dirname(OUTF), { recursive: true });
  fs.writeFileSync(OUTF, JSON.stringify(result, null, 1));
  console.log('\n页面报错：', errors.length ? errors : '无');
  await ctx.close(); server.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
