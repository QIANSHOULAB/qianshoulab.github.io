// 步骤账：用手机宽度把主流程从「第一次打开」走到「结果到手」（账单发出去、钱收齐、备份存好），
// 第一次用（8 月：建房、贴名单、网费、电费、发账单、收钱）和第二次用（9 月：没人搬动的普通月份）各走一遍，每一下都记下来。
// 0.4.0 起界面跟浏览器语言走，这里固定 zh-CN，跟 0.3.0 比同一套中文界面。
// 用法：node steps.js <网址> <0.2|0.3> <输出.json>（0.4 照 0.3 的流程走）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [BASE, VER, OUT] = process.argv.slice(2);
const sc = JSON.parse(fs.readFileSync(path.join(__dirname, 'scenario.json'), 'utf8'));
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const A = sc.houses[0], aug = sc.months['2026-08'].A;
const NAMES = aug.add.map(x => x.name);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: IPHONE_UA, hasTouch: true, acceptDownloads: true, locale: 'zh-CN' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const log = { first: [], second: [] }; let cur = log.first;
  const tap = async (label, loc) => { await loc.first().click(); cur.push({ k: 'tap', label }); await page.waitForTimeout(80); };
  const type = async (label, loc, text) => { await loc.first().fill(String(text)); cur.push({ k: 'type', label, text: String(text) }); await page.waitForTimeout(60); };
  const sheetGone = () => page.waitForSelector('#sheets', { state: 'hidden' });
  const at = async (ym, day) => { await page.clock.setFixedTime(new Date(`${ym}-${day}T10:00:00`)); await page.goto(BASE); await page.waitForSelector('.lt h1'); };
  const clip = () => page.evaluate(() => navigator.clipboard.readText());
  const bills = [];

  // ---------- 第一次用：2026-08 ----------
  await at('2026-08', '05');
  if (VER === '0.2') {
    await tap('关掉「放到主屏幕」卡片', page.locator('[data-act=a2hs-x]'));
    await tap('建第一套房', page.locator('[data-act=new-house]'));
    await type('小区', page.locator('#hEstate'), A.estate);
    await type('门牌', page.locator('#hUnit'), A.unit);
    await type('每月交大房东', page.locator('#hHead'), A.head);
    await tap('建好（房子）', page.locator('#hOk'));
    await type('贴房客名单', page.locator('#bText'), aug.paste);
    await page.waitForSelector('#bGo:not([disabled])');
    await tap('建好这 5 位', page.locator('#bGo')); await sheetGone();
  } else {
    await tap('建第一套房', page.locator('[data-act=new-house]'));
    await type('小区', page.locator('#hEstate'), A.estate);
    await type('门牌', page.locator('#hUnit'), A.unit);
    await type('每月交大房东', page.locator('#hHead'), A.head);
    await type('贴房客名单', page.locator('#hPaste'), aug.paste);
    await page.waitForSelector('#hOk:not([disabled])');
    await tap('建好（房子 + 5 位房客）', page.locator('#hOk')); await sheetGone();
  }
  await tap('加支出', page.locator('[data-act=add-exp]'));
  await tap('点「网费」', page.locator('#eQuick button', { hasText: '网费' }));
  await type('网费金额', page.locator('#eAmt'), 45);
  await tap('保存支出', page.locator('#eOk')); await sheetGone();
  await type('这个月电费', page.locator('#elecIn'), aug.elec);
  await page.waitForSelector('.split-main');
  if (VER === '0.2') {
    await tap('复制电费通知', page.locator('[data-act=copy-elec]')); bills.push(await clip());
    for (const n of NAMES) {
      await tap(`点 ${n}`, page.locator('.row.ten .row-btn', { hasText: n }));
      await tap(`复制 ${n} 的账单`, page.locator('#tCopy')); bills.push(await clip());
      await tap('取消', page.locator('.sh-x')); await sheetGone();
    }
    for (const n of NAMES) await tap(`${n} 已收`, page.locator('.row.ten', { hasText: n }).locator('button.paid'));
  } else {
    await tap('复制账单（全屋一条）', page.locator('[data-act=copy-bills]')); bills.push(await clip());
    await tap('都收了', page.locator('[data-act=all-paid]'));
  }
  await page.waitForSelector('#cfOk', { timeout: 3000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), tap('结清后存备份', page.locator('#cfOk'))]);
  await dl.path(); await sheetGone();

  // ---------- 第二次用：2026-09，没人搬动 ----------
  cur = log.second;
  await at('2026-09', '05');
  const autoIn = await page.locator('#elecIn').count() > 0;
  if (!autoIn) { await tap('进房子', page.locator('a.row', { hasText: A.unit })); await page.waitForSelector('#elecIn'); }
  const prevHint = await page.locator('.elec-hint').first().textContent().catch(() => '');
  await type('这个月电费', page.locator('#elecIn'), 301.75);
  await page.waitForSelector('.split-main');
  const sameRent = await page.evaluate(() => [...document.querySelectorAll('.row.ten .row-s')].map(s => s.textContent));
  if (VER === '0.2') {
    await tap('复制电费通知', page.locator('[data-act=copy-elec]'));
    for (const n of NAMES) {
      await tap(`点 ${n}`, page.locator('.row.ten .row-btn', { hasText: n }));
      await tap(`复制 ${n} 的账单`, page.locator('#tCopy'));
      await tap('取消', page.locator('.sh-x')); await sheetGone();
    }
    for (const n of NAMES) await tap(`${n} 已收`, page.locator('.row.ten', { hasText: n }).locator('button.paid'));
  } else {
    await tap('复制账单（全屋一条）', page.locator('[data-act=copy-bills]')); bills.push(await clip());
    await tap('都收了', page.locator('[data-act=all-paid]'));
  }
  await page.waitForSelector('#cfOk', { timeout: 3000 });
  const [dl2] = await Promise.all([page.waitForEvent('download'), tap('结清后存备份', page.locator('#cfOk'))]);
  await dl2.path();

  const sumUp = l => ({ steps: l.length, taps: l.filter(x => x.k === 'tap').length, types: l.filter(x => x.k === 'type').length });
  const res = { ver: VER, first: { ...sumUp(log.first), log: log.first }, second: { ...sumUp(log.second), autoIn, prevHint, log: log.second }, rentsCarried: sameRent, bills, errors };
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ ver: VER, first: sumUp(log.first), second: sumUp(log.second), autoIn, errors }));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
