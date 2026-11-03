// 0.4.0 中英文字交货：
// 1) 截图（浅色）：中、英 × 手机 390 / 电脑 1280 × 空状态 / 结果 = 8 张，放 shots-0.4/；另加手机上新房子、改房客两个浮层（x-*），中英各 2 张。
// 2) 排版检查：中英 × 390 / 1280，把每一屏、每个浮层都打开一遍（空状态、示例、首页、房子页、填电费、出错、按房间、总账、
//    新房子 / 加房客 / 改房客 / 加支出 / 这套房 / 贴名单 / 结清提示、提示条，页脚语言切换来回切一遍），查：按钮折成两行、字被截断或撑出去、输入框被挤扁、整页横向滚动。
// 用法：node shots-0.4.js <网址> <中文备份.json> <英文备份.json>（备份用 run-baozuseng.js 跑出来的 backup-final.json）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [BASE, BKZH, BKEN] = process.argv.slice(2), OUT = path.join(__dirname, 'shots-0.4');
fs.mkdirSync(OUT, { recursive: true });
const STR = require(path.join(__dirname, '..', 'strings.js'));
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const BULK = { zh: '小周 小房 300\n小燕 储物间', en: 'Zed  Small room  300\nYan  Store room' };
const PASTE = { zh: '阿明 主人房 900\n小美 普通房1 650 包电\n阿强 普通房2\nRaj 小房 520 15号入住', en: 'Ming  Master room  900\nMei  Common room 1  650 incl.\nKeong  Common room 2\nRaj  Small room  520  from 15th' };

// 页面里跑：按钮类的东西不许折行、不许被截断 / 撑出去；表单输入框不许被标签挤扁；整页不许横向滚动
function audit() {
  const out = [], vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw) out.push(`横向滚动 ${document.documentElement.scrollWidth}>${vw}`);
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]'); };
  const lines = el => { const rg = document.createRange(); rg.selectNodeContents(el); const tops = new Set(); for (const r of rg.getClientRects()) if (r.width > 1) tops.add(Math.round(r.top + r.height / 2)); const ys = [...tops].sort((a, b) => a - b); let n = 0, last = -99; for (const y of ys) { if (y - last > 6) n++; last = y; } return n; };
  const label = el => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const SEL = '.btn, .nav-a:not(.round), .nav-back, .chip, .seg button, .sh-x, .sh-ok, .sh-t, .bk-sh, .pick button, #toast button, .ms-t, .txt-btn, .ro-go, .foot .lang, .hero-f .go, .row.add > span:not(.plus):not(.row-main), .row.add .row-t, .grp-h h2, .hero-l, .elec-h, .f-k small, .f-k:not(:has(small)), .f-label, .sub-h span, .bk-h span, .demo-bar b, .lt h1:not(.big), .cf-t, .ms-now, .ms-back, .row-t, .row-v, .tag2, .ro-m, .ro-v, .lbl';
  for (const el of document.querySelectorAll(SEL)) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect(), t = label(el);
    if (!t) continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push(`截断：${t}`);
    else if (el.scrollWidth > el.clientWidth + 1 && el.matches('.btn, .chip, .seg button, .bk-sh, .pick button, .nav-a')) out.push(`撑出去：${t}`);
    if (lines(el) > 1) out.push(`折成两行：${t}`);
    if (r.right > vw + 1 || r.left < -1) out.push(`出屏：${t}`);
  }
  for (const inp of document.querySelectorAll('.f-row input')) if (vis(inp) && inp.getBoundingClientRect().width < 72) out.push(`输入框被挤扁 ${Math.round(inp.getBoundingClientRect().width)}px：${label(inp.closest('.f-row'))}`);
  for (const row of document.querySelectorAll('.f-row, .row, .demo-bar, .a2hs, .prev-owe, .bk-2')) if (vis(row) && row.scrollWidth > row.clientWidth + 1) out.push(`一行装不下：${label(row)}`);
  return out;
}

(async () => {
  const b = await chromium.launch();
  const report = {}, errors = [], shots = [];
  for (const lang of ['zh', 'en']) for (const [w, h] of [[390, 844], [1280, 860]]) {
    const L = STR[lang], key = `${lang}-${w}`, issues = report[key] = {};
    const data = JSON.parse(fs.readFileSync(lang === 'zh' ? BKZH : BKEN, 'utf8'));
    const mk = async (seed) => {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: 'light', locale: lang === 'zh' ? 'zh-CN' : 'en-US', ...(w === 390 ? { userAgent: IPHONE_UA, hasTouch: true } : {}) });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
      if (seed) await ctx.addInitScript(d => { if (!localStorage.getItem('baozuseng.v1')) { localStorage.setItem('baozuseng.v1', JSON.stringify({ v: 2, houses: d.houses, order: d.order })); localStorage.setItem('baozuseng.ui', '{"a2hs":1,"lastBk":"2026-12-01"}'); } }, data);
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(`${key}: ${e.message}`)); p.on('console', m => m.type() === 'error' && errors.push(`${key}: ${m.text()}`));
      await p.clock.setFixedTime(new Date('2026-12-05T10:00:00'));
      await p.goto(BASE); await p.waitForSelector('.lt h1');
      return { ctx, p };
    };
    const check = async (p, state) => { await p.waitForTimeout(350); const r = await p.evaluate(audit); if (r.length) issues[state] = [...new Set(r)]; };
    const sheet = async (p, sel, state, fn) => { await p.locator(sel).first().click(); await p.waitForSelector('#sheets.open .sheet'); if (fn) await fn(); await check(p, state); await p.keyboard.press('Escape'); await p.waitForSelector('#sheets', { state: 'hidden' }); };
    const shot = async (p, name) => { await p.waitForTimeout(450); const f = `${lang}-${name}-${w}.png`; await p.screenshot({ path: path.join(OUT, f) }); shots.push(f); };
    const unitA = data.houses[data.order[0]].unit, unitB = data.houses[data.order[1]].unit;

    // 空状态（手机上带「放到主屏幕」卡片）、新房子浮层（贴了一份缺月租的名单）
    { const { ctx, p } = await mk(false);
      if ((await p.evaluate(() => document.documentElement.lang)) !== L.lang) errors.push(`${key}: <html lang> 没跟着切`);
      if ((await p.title()) !== L.appFull) errors.push(`${key}: <title> 没跟着切`);
      await check(p, '空状态'); await shot(p, 'empty');
      await sheet(p, '[data-act=new-house]', '新房子浮层', async () => { await p.locator('#hPaste').fill(PASTE[lang]); await p.waitForTimeout(300); await p.locator('#hPaste').evaluate(el => el.blur());
        if (w === 390) { await p.locator('.sheet').evaluate(el => el.scrollTo(0, 220)); await shot(p, 'x-newhouse'); } });
      // 示例账本
      await p.locator('[data-act=load-demo]').click(); await p.waitForSelector('.demo-bar'); await check(p, '示例首页');
      await p.locator('a.row').first().click(); await p.waitForSelector('#elecIn'); await check(p, '示例房子页');
      // 页脚的语言切换：切过去、刷新还在、再切回来
      const O = STR[L.other], state = () => p.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, mf: document.querySelector('link[rel=manifest]').getAttribute('href'), h: document.querySelector('.grp-h h2').textContent }));
      await p.locator('.foot .lang').click(); await p.waitForTimeout(200);
      let st = await state();
      if (st.lang !== O.lang || st.title !== O.appFull || st.mf !== O.manifest || !st.h.startsWith(O.tenants)) errors.push(`${key}: 语言切换没切过去 ${JSON.stringify(st)}`);
      await p.reload(); await p.waitForSelector('#elecIn'); st = await state();
      if (st.lang !== O.lang) errors.push(`${key}: 切过的语言刷新后没记住`);
      await p.locator('.foot .lang').click(); await p.waitForTimeout(200); st = await state();
      if (st.lang !== L.lang || st.title !== L.appFull || !st.h.startsWith(L.tenants)) errors.push(`${key}: 语言切不回来 ${JSON.stringify(st)}`);
      await ctx.close(); }
    // 有账：首页、房子页、各浮层、结果、出错、按房间、总账
    { const { ctx, p } = await mk(true);
      await check(p, '首页');
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await check(p, '首页底部（备份、页脚、语言切换）');
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.locator('a.row', { hasText: unitA }).click(); await p.waitForSelector('#elecIn'); await check(p, '房子页（电费没填）');
      await p.locator('#elecIn').fill('263.40'); await p.locator('#elecIn').evaluate(el => el.blur()); await check(p, '房子页（电费填了）');
      await sheet(p, '[data-act=add-tenant]', '加房客浮层');
      await sheet(p, '.row.ten .row-btn', '改房客浮层（标欠租）', async () => { await p.locator('#tOwe').click(); if (w === 390) { await p.locator('#tOweAmt').evaluate(el => el.blur()); await shot(p, 'x-tenant'); } });
      await sheet(p, '[data-act=add-exp]', '加支出浮层');
      await sheet(p, '[data-act=bulk]', '贴名单浮层（有一位缺月租）', async () => { await p.locator('#bText').fill(BULK[lang]); await p.waitForTimeout(300); });
      await sheet(p, '[data-act=house-menu]', '这套房浮层');
      await p.locator('#segR').click(); await check(p, '按房间'); await p.locator('#segP').click();
      await p.locator('[data-act=copy-bills]').click(); await p.waitForSelector('#toast.show'); await check(p, '提示条（复制账单）');
      await p.locator('[data-act=all-paid]').click(); await p.waitForSelector('#toast.show #toastAct'); await check(p, '提示条（都收了 + 撤销）');
      if (w === 390) await p.evaluate(() => { const l = document.querySelector('#hTen .list'); window.scrollTo(0, l.getBoundingClientRect().bottom + scrollY - (innerHeight - 108)); });
      else await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await shot(p, 'result');
      // 另一套也收齐 → 结清提示
      await p.locator('.nav-back').click(); await p.waitForSelector('.hero');
      await p.locator('a.row', { hasText: unitB }).click(); await p.waitForSelector('#elecIn');
      await p.locator('#elecIn').fill('180'); await p.locator('#elecIn').evaluate(el => el.blur());
      if (await p.locator('[data-act=all-paid]').count()) await p.locator('[data-act=all-paid]').click();
      else for (const x of await p.locator('.paid:not(.on)').all()) await x.click();
      try { await p.waitForSelector('#cfOk', { timeout: 2500 }); await check(p, '结清提示'); await p.keyboard.press('Escape'); } catch (e) { issues['结清提示'] = ['没弹出来']; }
      await p.locator('#elecIn').fill(''); await p.locator('#elecIn').pressSequentially('26o.4'); await check(p, '出错（电费打了字母）');
      await p.locator('.nav-back').click(); await p.waitForSelector('.hero');
      await p.locator('.nav-a').click(); await p.waitForSelector('.chart'); await check(p, '总账');
      await ctx.close(); }
  }
  await b.close();
  const n = Object.values(report).reduce((s, r) => s + Object.values(r).reduce((a, x) => a + x.length, 0), 0);
  const res = { issues: n, report, errors, shots };
  fs.writeFileSync(path.join(OUT, 'layout-check.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error('FAIL', e); process.exit(1); });
