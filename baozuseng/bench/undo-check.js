// 0.3.0 自动做掉的、去掉「确定吗」的地方都能撤：都收了 → 撤销；删房子 → 撤销；整页丢备份 → 换账 → 撤销。用法：node undo-check.js <网址> <备份.json>（固定 zh-CN）
const { chromium } = require('playwright');
const fs = require('fs');
const [BASE, BK] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const errors = [], res = {};
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, locale: 'zh-CN' });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await p.clock.setFixedTime(new Date('2026-12-05T10:00:00'));
  await p.goto(BASE); await p.locator('[data-act=load-demo]').click();
  await p.locator('a.row', { hasText: '12栋 08-21' }).click(); await p.waitForSelector('#elecIn');
  const paidN = () => p.locator('.paid.on').count();
  const before = await paidN();
  await p.locator('[data-act=all-paid]').click(); const after = await paidN();
  await p.locator('#toastAct').click(); const undone = await paidN();
  res.allPaid = { before, after, undone, ok: after > before && undone === before };
  await p.locator('[data-act=house-menu]').click(); await p.locator('#mDel').click(); await p.waitForSelector('.hero');
  const gone = await p.locator('a.row', { hasText: '12栋 08-21' }).count();
  await p.locator('#toastAct').click(); await p.waitForTimeout(200);
  const back = await p.locator('a.row', { hasText: '12栋 08-21' }).count();
  res.delHouse = { gone, back, ok: gone === 0 && back === 1 };
  // 整页丢备份：只有示例时直接换；已有自己的账时也直接换，提示条给撤销
  const text = fs.readFileSync(BK, 'utf8');
  const drop = t => p.evaluate(t => { const dt = new DataTransfer(); dt.items.add(new File([t], 'bk.json', { type: 'application/json' })); for (const ty of ['dragenter', 'dragover', 'drop']) document.body.dispatchEvent(new DragEvent(ty, { dataTransfer: dt, bubbles: true, cancelable: true })); }, t);
  await drop(text); await p.waitForTimeout(400);
  const swapped = await p.locator('a.row', { hasText: '3栋 11-05' }).count(), demoGone = await p.locator('.demo-bar').count() === 0;
  // 再丢一份少了金沙苑的备份 → 直接换成一套 → 撤销后两套都回来
  const j = JSON.parse(text); const ida = Object.keys(j.houses).find(k => j.houses[k].estate === '金沙苑'); delete j.houses[ida]; j.order = j.order.filter(x => x !== ida);
  const housesBefore = await p.locator('#view a.row').count();
  await drop(JSON.stringify(j)); await p.waitForTimeout(400);
  const housesAfter = await p.locator('#view a.row').count();
  await p.locator('#toastAct').click(); await p.waitForTimeout(200);
  const housesUndone = await p.locator('#view a.row').count();
  res.drop = { swapped, demoGone, housesBefore, housesAfter, housesUndone, ok: swapped > 0 && demoGone && housesAfter === housesBefore - 1 && housesUndone === housesBefore };
  res.errors = errors;
  console.log(JSON.stringify(res));
  await b.close();
})();
