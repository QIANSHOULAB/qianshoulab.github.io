// 快：同一台机器、同一次跑，新旧两版轮流各测 N 回取中位数。
// 打开 = 新浏览器打开到首屏出字；填电费 = 在示例账本里改电费到分摊数出来。用法：node speed.js <旧版网址> <新版网址> [N]
const { chromium } = require('playwright');
const [OLD, NEW, N0] = process.argv.slice(2), N = +N0 || 15;
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
(async () => {
  const b = await chromium.launch();
  const out = {};
  for (const [k, url] of [['old', OLD], ['new', NEW]]) out[k] = { open: [], elec: [] };
  for (let i = 0; i < N; i++) for (const [k, url] of [['old', OLD], ['new', NEW]]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date('2026-11-05T10:00:00'));
    const t0 = Date.now(); await p.goto(url); await p.waitForSelector('.lt h1'); out[k].open.push(Date.now() - t0);
    await p.locator('[data-act=load-demo]').click(); await p.locator('a.row', { hasText: '3栋 11-05' }).click(); await p.waitForSelector('#elecIn');
    const ms = await p.evaluate(async () => { const el = document.querySelector('#elecIn'); const t = performance.now(); el.value = '199.90'; el.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => requestAnimationFrame(() => r())); if (!/199\.90/.test(document.querySelector('.split-main').textContent + document.querySelector('.split-sub').textContent) && !document.querySelector('.split-main')) return -1; return performance.now() - t; });
    out[k].elec.push(ms);
    await ctx.close();
  }
  await b.close();
  const r = {}; for (const k of Object.keys(out)) r[k] = { openMedianMs: med(out[k].open), elecMedianMs: +med(out[k].elec).toFixed(1), n: N };
  console.log(JSON.stringify(r));
})();
