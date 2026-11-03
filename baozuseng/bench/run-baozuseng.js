// 真流程比武（0.3.0 流程）：用手机宽度从头录四个月账，数点几下、打几处字，读界面上的数和标准答案对；
// 每月复制全屋账单，账单里每人那行的钱也跟答案对。
// 0.4.0 起分中英两套：第三个参数 en 就用英文界面（locale en-US）跑同一份账，名字、名单换成 scenario-en.json 里英文用户会写的，答案照旧。
// 用法：node run-baozuseng.js http://127.0.0.1:8765/baozuseng/ 输出目录 [zh|en]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.argv[2], OUT = process.argv[3] || '.', LANG = process.argv[4] || 'zh';
const STR = require(path.join(__dirname, '..', 'strings.js')), L = STR[LANG], LOCALE = LANG === 'en' ? 'en-US' : 'zh-CN';
const EN = LANG === 'en' ? JSON.parse(fs.readFileSync(path.join(__dirname, 'scenario-en.json'), 'utf8')) : null;
const NM = n => (EN ? EN.names[n] || n : n); // 答案里的名字 → 界面上的
const UN = n => (EN ? Object.keys(EN.names).find(k => EN.names[k] === n) || n : n); // 界面上的 → 答案里的
const Q = n => L.quick[STR.zh.quick.findIndex(q => q[0] === n)][0]; // 支出快捷钮
const RM = n => L.rooms[STR.zh.rooms.indexOf(n)]; // 房间快捷钮
const PASTE = (k, zh) => (EN ? EN.paste[k] : zh);
const rx = f => f('@@').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('@@', '([\\d,.]+)');
const RX = { rent: rx(L.rowRent), elec: rx(L.rowElec), neg: L.net(-1) };
const sc = JSON.parse(fs.readFileSync(path.join(__dirname, 'scenario.json'), 'utf8'));
const ans = JSON.parse(fs.readFileSync(path.join(__dirname, 'answer.json'), 'utf8'));
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const errors = [];
const cnt = {}; let bucket = 'setup';
const C = () => (cnt[bucket] = cnt[bucket] || { taps: 0, fields: 0, chars: 0, ms: 0 });
const cents = s => Math.round(parseFloat(String(s).replace(/[^\d.\-−]/g, '').replace('−', '-')) * 100);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: IPHONE_UA, hasTouch: true, acceptDownloads: true, locale: LOCALE });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const tap = async (loc) => { await loc.first().click(); C().taps++; await page.waitForTimeout(60); };
  const type = async (loc, text) => { await loc.first().fill(String(text)); C().fields++; C().chars += String(text).length; await page.waitForTimeout(40); };
  const sheetGone = () => page.waitForSelector('#sheets', { state: 'hidden' });
  const at = async (ym, day) => { await page.clock.setFixedTime(new Date(`${ym}-${day}T10:00:00`)); const t0 = Date.now(); await page.goto(BASE); await page.waitForSelector('.lt h1'); return Date.now() - t0; };
  // 只有一套房时打开就在房子里（0.3.0），不用点；不在就点进去
  const openHouse = async unit => { if (await page.locator('#elecIn').count() && (await page.locator('.lt h1').textContent()).trim() === unit) return; await tap(page.locator('a.row', { hasText: unit })); await page.waitForSelector('#elecIn'); };
  const home = async () => { await tap(page.locator('.nav-back')); await page.waitForSelector('.hero'); };
  // 要记已收的正好是还没收的全部 → 一下「都收了」；否则一个个点
  const markPaid = async (names0) => {
    const names = names0.map(NM);
    const open = await page.evaluate(() => [...document.querySelectorAll('.row.ten')].filter(r => !r.querySelector('.paid.on,.paid.owe')).map(r => r.querySelector('.row-t').childNodes[0].textContent.trim()));
    if (open.length >= 2 && open.length === names.length && names.every(n => open.includes(n))) { await tap(page.locator('[data-act=all-paid]')); return; }
    for (const n of names) await tap(page.locator('.row.ten', { hasText: n }).locator('button.paid'));
  };
  // 复制全屋账单，读剪贴板，每人一行「名字 $应交（…）」跟答案（应交 + 之前欠）对
  const prevOf = (ym, name) => { let c = 0; for (const [k, mo] of Object.entries(sc.months)) if (k < ym) for (const h of Object.values(mo)) for (const o of h.owe || []) if (o.name === name) c += Math.round(o.amt * 100); return c; };
  let billChecks = 0;
  const checkBills = async (ym, key) => {
    await tap(page.locator('[data-act=copy-bills]'));
    const text = await page.evaluate(() => navigator.clipboard.readText());
    for (const [n, r] of Object.entries(ans[ym][key].rows)) {
      billChecks++; checks++;
      const line = text.split('\n').find(l => l.startsWith(NM(n) + ' $'));
      if (!line) { diffs.push(`${ym} ${key} 账单里没有 ${n}`); continue; }
      const d = cents(line.slice(NM(n).length + 1).split(/[（(]/)[0]) - (r.due + prevOf(ym, n));
      if (d) diffs.push(`${ym} ${key} 账单 ${n} 差 ${d} 分`);
    }
    return text;
  };
  const billTexts = {};
  const tenant = n => page.locator('.row.ten .row-btn', { hasText: NM(n) });
  const maybePrompt = async (choice) => { try { await page.waitForSelector('#cfOk', { timeout: 1200 }); } catch (e) { return false; }
    if (choice === 'save') { const [dl] = await Promise.all([page.waitForEvent('download'), tap(page.locator('#cfOk'))]); await dl.saveAs(path.join(OUT, 'backup-' + bucket + '.json')); }
    else await tap(page.locator('.cf .btn.gray')); await sheetGone(); return true; };
  async function readHouse() {
    return page.evaluate((RX) => {
      const rows = {};
      for (const r of document.querySelectorAll('.row.ten')) {
        const name = r.querySelector('.row-t').childNodes[0].textContent.trim(); const sEl = r.querySelector('.row-s').cloneNode(true); sEl.querySelectorAll('.chip').forEach(c => c.remove()); const s = sEl.textContent;
        const rent = (s.match(new RegExp(RX.rent)) || [])[1], el = (s.match(new RegExp(RX.elec)) || [])[1];
        rows[name] = { rent, elec: el || '0', due: r.querySelector('.row-v').textContent, chips: [...r.querySelectorAll('.chip')].map(c => c.textContent) };
      }
      const neg = new RegExp(RX.neg, 'i').test(document.querySelector('#hHero .hero-l').textContent);
      return { rows, net: (neg ? '-' : '') + document.querySelector('#hHero .hero-n').textContent, owed: (document.querySelector('#hHero .hero-note.bad') || {}).textContent || '' };
    }, RX);
  }
  const diffs = []; let checks = 0;
  function compare(ym, key, got) {
    const a = ans[ym][key];
    for (const [n, r] of Object.entries(a.rows)) {
      const g = got.rows[NM(n)];
      if (!g) { diffs.push(`${ym} ${key} ${n} 不见了`); continue; }
      for (const [f, gv] of [['rent', g.rent], ['elec', g.elec], ['due', g.due]]) { checks++; const d = cents(gv) - r[f]; if (d) diffs.push(`${ym} ${key} ${n} ${f} 差 ${d} 分`); }
    }
    for (const n of Object.keys(got.rows)) if (!a.rows[UN(n)]) diffs.push(`${ym} ${key} 多出 ${n}`);
    checks++; const d = cents(got.net) - a.net; if (d) diffs.push(`${ym} ${key} 净赚 差 ${d} 分`);
    if (a.prevOwed) { checks++; if (!got.owed.includes((a.prevOwed / 100).toFixed(2))) diffs.push(`${ym} ${key} 欠租结转不对：${got.owed}`); }
  }
  const loads = [];

  // ---------- 2026-08：建房、贴名单、填电费、收齐 ----------
  bucket = 'setup'; loads.push(await at('2026-08', '05'));
  await page.screenshot({ path: path.join(OUT, 'first-open-390.png') });
  const A = Object.assign({}, sc.houses[0], EN ? EN.houses.A : {}), B = Object.assign({}, sc.houses[1], EN ? EN.houses.B : {});
  await tap(page.locator('[data-act=new-house]'));
  await type(page.locator('#hEstate'), A.estate); await type(page.locator('#hUnit'), A.unit); await type(page.locator('#hHead'), A.head);
  await type(page.locator('#hPaste'), PASTE('2026-08A', sc.months['2026-08'].A.paste));
  await tap(page.locator('#hOk')); await sheetGone();
  await tap(page.locator('[data-act=add-exp]')); await tap(page.locator('#eQuick button', { hasText: Q('网费') })); await type(page.locator('#eAmt'), 45); await tap(page.locator('#eOk')); await sheetGone();
  bucket = '2026-08';
  { const t0 = Date.now(); await type(page.locator('#elecIn'), sc.months['2026-08'].A.elec); await page.waitForSelector('.split-main'); C().ms += Date.now() - t0; }
  billTexts['2026-08A'] = await checkBills('2026-08', 'A');
  await markPaid(['阿明', '小美', '阿强', '阿杰', 'Raj']);
  const prompt8 = await maybePrompt('save');
  compare('2026-08', 'A', await readHouse());
  await page.screenshot({ path: path.join(OUT, 'aug-house-390.png'), fullPage: true });

  // ---------- 2026-09：Raj 9/18 走，Ken 9/20 进，修空调 ----------
  bucket = '2026-09'; loads.push(await at('2026-09', '05'));
  await openHouse(A.unit);
  await type(page.locator('#elecIn'), 301.75);
  await tap(tenant('Raj')); await type(page.locator('#tTo'), '2026-09-18'); await tap(page.locator('#tOk')); await sheetGone();
  await tap(page.locator('[data-act=add-tenant]')); await type(page.locator('#tName'), NM('Ken')); await type(page.locator('#tRent'), 540);
  await tap(page.locator('#tRooms button', { hasText: RM('小房') })); await type(page.locator('#tFrom'), '2026-09-20'); await tap(page.locator('#tOk')); await sheetGone();
  await tap(page.locator('[data-act=add-exp]')); await tap(page.locator('#eQuick button', { hasText: Q('维修') })); await type(page.locator('#eAmt'), 120); await tap(page.locator('#eOk')); await sheetGone();
  billTexts['2026-09A'] = await checkBills('2026-09', 'A');
  await markPaid(['阿明', '小美', '阿强', '阿杰', 'Raj', 'Ken']);
  const prompt9 = await maybePrompt('later');
  compare('2026-09', 'A', await readHouse());
  await page.screenshot({ path: path.join(OUT, 'sep-house-390.png'), fullPage: true });

  // ---------- 2026-10：陈姐 10/9 进（包电），小美涨租，阿强欠 200；开第二套房（二房东自住） ----------
  bucket = '2026-10'; loads.push(await at('2026-10', '05'));
  await openHouse(A.unit);
  await type(page.locator('#elecIn'), 284.10);
  await tap(page.locator('[data-act=add-tenant]')); await type(page.locator('#tName'), NM('陈姐')); await type(page.locator('#tRent'), 450);
  await tap(page.locator('#tRooms button', { hasText: RM('客厅') })); await tap(page.locator('#tShare')); await type(page.locator('#tFrom'), '2026-10-09'); await tap(page.locator('#tOk')); await sheetGone();
  await tap(tenant('小美')); await type(page.locator('#tRent'), 680); await tap(page.locator('#tOk')); await sheetGone();
  await tap(tenant('阿强')); await tap(page.locator('#tOwe')); await type(page.locator('#tOweAmt'), 200); await tap(page.locator('#tOk')); await sheetGone();
  billTexts['2026-10A'] = await checkBills('2026-10', 'A');
  await markPaid(['阿明', '小美', '阿杰', 'Ken', '陈姐']);
  compare('2026-10', 'A', await readHouse());
  await home();
  bucket = '2026-10-newhouse';
  await tap(page.locator('[data-act=new-house]'));
  await type(page.locator('#hEstate'), B.estate); await type(page.locator('#hUnit'), B.unit); await type(page.locator('#hHead'), B.head); await tap(page.locator('#hSelf'));
  await type(page.locator('#hPaste'), PASTE('2026-10B', sc.months['2026-10'].B.paste));
  await tap(page.locator('#hOk')); await sheetGone();
  bucket = '2026-10';
  await type(page.locator('#elecIn'), 165.60);
  billTexts['2026-10B'] = await checkBills('2026-10', 'B');
  await markPaid(['小李', 'Tom']);
  const prompt10 = await maybePrompt('later');
  compare('2026-10', 'B', await readHouse());

  // ---------- 2026-11：阿杰 11/15 走；B 套 Tom 11/10 走，Amy 11/11 进同一间，Sara+Lily 合住一间（Lily 包电） ----------
  bucket = '2026-11'; loads.push(await at('2026-11', '05'));
  await openHouse(A.unit);
  await type(page.locator('#elecIn'), 250);
  await tap(tenant('阿杰')); await type(page.locator('#tTo'), '2026-11-15'); await tap(page.locator('#tOk')); await sheetGone();
  billTexts['2026-11A'] = await checkBills('2026-11', 'A');
  await markPaid(['阿明', '小美', '阿强', '阿杰', 'Ken', '陈姐']);
  compare('2026-11', 'A', await readHouse());
  await page.screenshot({ path: path.join(OUT, 'nov-houseA-390.png'), fullPage: true });
  await home();
  await openHouse(B.unit);
  await type(page.locator('#elecIn'), 172.50);
  await tap(tenant('Tom')); await type(page.locator('#tTo'), '2026-11-10'); await tap(page.locator('#tOk')); await sheetGone();
  await tap(page.locator('[data-act=bulk]')); await type(page.locator('#bText'), PASTE('2026-11B', 'Amy 普通房 760 11号入住\nSara 普通房2 380\nLily 普通房2 380 包电'));
  await page.waitForSelector('#bGo:not([disabled])'); await tap(page.locator('#bGo')); await sheetGone();
  billTexts['2026-11B'] = await checkBills('2026-11', 'B');
  await markPaid(['小李', 'Tom', 'Sara', 'Lily']);
  compare('2026-11', 'B', await readHouse());
  await tap(page.locator('#segR')); await page.screenshot({ path: path.join(OUT, 'nov-houseB-byroom-390.png'), fullPage: true }); await page.locator('#segP').click();

  // ---------- 回头翻旧月：冻结的旧账不许被后来的改动带歪 ----------
  bucket = 'recheck';
  await home(); await openHouse(A.unit);
  for (const ym of ['2026-10', '2026-09', '2026-08']) { await page.locator('[data-act=m-prev]').click(); await page.waitForTimeout(80); compare(ym, 'A', await readHouse()); }
  await page.locator('[data-act=m-cur]').click();
  await home(); await page.screenshot({ path: path.join(OUT, 'nov-home-390.png'), fullPage: true });

  // ---------- 存备份 → 换台「新手机」导回 → 数要一样 ----------
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act=bk-save]').click()]);
  const bkPath = path.join(OUT, 'backup-final.json'); await dl.saveAs(bkPath);
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, hasTouch: true, locale: LOCALE });
  const p2 = await ctx2.newPage(); p2.on('pageerror', e => errors.push('pageerror(new phone): ' + e.message));
  await p2.clock.setFixedTime(new Date('2026-11-05T10:00:00')); await p2.goto(BASE); await p2.waitForSelector('.empty');
  const restoreCnt = { taps: 0 };
  const [fc] = await Promise.all([p2.waitForEvent('filechooser'), p2.locator('.empty [data-act=bk-load]').click()]); restoreCnt.taps++;
  await fc.setFiles(bkPath); await p2.waitForSelector('.hero');
  await p2.locator('a.row', { hasText: A.unit }).click(); await p2.waitForSelector('#elecIn');
  const pr = page; // reuse reader on p2
  const got2 = await p2.evaluate(() => ({ net: document.querySelector('#hHero .hero-n').textContent, n: document.querySelectorAll('.row.ten').length }));
  const restoreOk = cents(got2.net) === ans['2026-11'].A.net && got2.n === Object.keys(ans['2026-11'].A.rows).length;

  const result = { lang: LANG, ver: await page.evaluate(() => window.__bzs && window.__bzs.VERSION), counts: cnt, loadsMs: loads, billChecks, billTexts, prompts: { aug: prompt8, sep: prompt9, oct: prompt10 }, checks, diffs, restore: { ok: restoreOk, taps: restoreCnt.taps }, errors };
  fs.writeFileSync(path.join(OUT, 'result-baozuseng.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
