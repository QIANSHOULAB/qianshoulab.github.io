// 0.3.0 交货截图：手机 390 / 电脑 1280 × 浅色 / 深色 × 空状态 / 干活中 / 结果 / 出错 = 16 张，放 shots-0.3/。
// 另加新建房子浮层（贴名单）两张。用法：node shots-0.3.js <网址> <备份.json（run-baozuseng.js 出的 backup-final.json）>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [BASE, BK] = process.argv.slice(2), OUT = path.join(__dirname, 'shots-0.3');
fs.mkdirSync(OUT, { recursive: true });
const data = JSON.parse(fs.readFileSync(BK, 'utf8'));
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await chromium.launch(); const errors = [], overflow = [];
  for (const [w, h] of [[390, 844], [1280, 860]]) for (const scheme of ['light', 'dark']) {
    const mk = async (seed) => {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: scheme, ...(w === 390 ? { userAgent: IPHONE_UA, hasTouch: true } : {}) });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
      if (seed) await ctx.addInitScript(d => { if (!localStorage.getItem('baozuseng.v1')) { localStorage.setItem('baozuseng.v1', JSON.stringify({ v: 2, houses: d.houses, order: d.order })); localStorage.setItem('baozuseng.ui', '{"a2hs":1,"lastBk":"2026-12-01"}'); } }, data);
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
      await p.clock.setFixedTime(new Date('2026-12-05T10:00:00'));
      await p.goto(BASE); await p.waitForSelector('.lt h1');
      return { ctx, p };
    };
    const shot = async (p, name) => {
      await p.waitForTimeout(450);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w) overflow.push(`${name}: ${sw}`);
      await p.screenshot({ path: path.join(OUT, `${name}-${w}-${scheme}.png`) });
    };
    // 空状态：第一次打开
    { const { ctx, p } = await mk(false); await shot(p, '1-empty');
      if (w === 390) { await p.locator('[data-act=new-house]').click(); await p.locator('#hEstate').fill('碧水湾'); await p.locator('#hUnit').fill('12栋 08-21'); await p.locator('#hHead').fill('2600');
        await p.locator('#hPaste').fill('阿明 主人房 900\n小美 普通房1 650 包电\n阿强 普通房2 400\nRaj 小房 520 15号入住'); await p.waitForTimeout(300);
        await p.locator('#hPaste').evaluate(el => el.blur()); await p.locator('.sheet').evaluate(el => el.scrollTo(0, 220)); await shot(p, 'x-newhouse'); }
      await ctx.close(); }
    // 干活中：12 月，进碧水湾，电费刚填，都还没收
    { const { ctx, p } = await mk(true);
      await p.locator('a.row', { hasText: '12栋 08-21' }).click(); await p.waitForSelector('#elecIn');
      await p.locator('#elecIn').fill('263.40'); await p.locator('#elecIn').evaluate(el => el.blur());
      await shot(p, '2-working');
      // 结果：复制账单 + 都收了
      await p.locator('[data-act=copy-bills]').click(); await p.waitForTimeout(300);
      await p.locator('[data-act=all-paid]').click(); await p.waitForTimeout(200);
      if (await p.locator('#cfOk').count()) { await p.waitForTimeout(400); await p.keyboard.press('Escape'); }
      await p.evaluate(() => window.scrollTo(0, 0));
      await shot(p, '3-result');
      await ctx.close(); }
    // 出错：电费里打了字母
    { const { ctx, p } = await mk(true);
      await p.locator('a.row', { hasText: '12栋 08-21' }).click(); await p.waitForSelector('#elecIn');
      await p.locator('#elecIn').pressSequentially('26o.4'); await shot(p, '4-error');
      await ctx.close(); }
  }
  await b.close();
  console.log(JSON.stringify({ errors, overflow }));
})();
