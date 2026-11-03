// 截图：手机 390 / 电脑 1280，浅色 / 深色；外加跟对手并排。用法：node shots.js BASE 备份.json 对手截图目录
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [BASE, BK, OPP] = process.argv.slice(2), OUT = path.join(__dirname, 'shots');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const data = JSON.parse(fs.readFileSync(BK, 'utf8'));
  for (const [w, h] of [[390, 844], [1280, 860]]) for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: scheme });
    await ctx.addInitScript(d => { if (!localStorage.getItem('baozuseng.v1')) { localStorage.setItem('baozuseng.v1', JSON.stringify({ v: 2, houses: d.houses, order: d.order })); localStorage.setItem('baozuseng.ui', '{"a2hs":1,"lastBk":"2026-11-05"}'); } }, data);
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await p.clock.setFixedTime(new Date('2026-11-05T10:00:00'));
    await p.goto(BASE); await p.waitForSelector('.hero');
    await p.screenshot({ path: path.join(OUT, `home-${w}-${scheme}.png`) });
    await p.locator('a.row', { hasText: '12栋 08-21' }).click(); await p.waitForSelector('#elecIn'); await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, `house-${w}-${scheme}.png`) });
    if (w === 390) { await p.locator('.row.ten .row-btn', { hasText: '阿杰' }).click(); await p.waitForTimeout(600); await p.screenshot({ path: path.join(OUT, `sheet-${w}-${scheme}.png`) }); await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
    const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w) errors.push(`横向溢出 ${w}: ${sw}`);
    await ctx.close();
  }
  // 并排：包租僧 / Spliit / Omni（同为 390 宽）
  const img = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const cols = [['包租僧 0.2.0', path.join(OUT, 'house-390-light.png')], ['Spliit', path.join(OPP, 'spliit-shares-filled.png')], ['Spliit 结余', path.join(OPP, 'spliit-balances.png')], ['Omni 按天折房租', path.join(OPP, 'omni-raj.png')]];
  const p = await b.newPage({ viewport: { width: 1640, height: 1000 } });
  await p.setContent(`<body style="margin:0;background:#e5e5ea;font:600 22px -apple-system,'Noto Sans SC',sans-serif;display:flex;gap:16px;padding:16px;align-items:flex-start">${cols.map(([t, f]) => `<div style="width:390px"><div style="padding:0 0 10px">${t}</div><div style="width:390px;height:844px;overflow:hidden;border-radius:18px;background:#fff"><img src="${img(f)}" style="width:390px;display:block"></div></div>`).join('')}</body>`);
  await p.screenshot({ path: path.join(OUT, 'side-by-side.png'), fullPage: true });
  await b.close();
  console.log(JSON.stringify({ errors }));
})();
