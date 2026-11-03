// 「合理修」：用户看着界面能修的都修上，界面修不了的不修。返回本步额外动手次数（click() 已自己计数的不重复算）。
const ti = (pg, name) => pg.evaluate(n => window.__yj.S.tgt.cols.findIndex(c => c.name === n), name);
const sj = (pg, h) => pg.evaluate(n => window.__yj.S.src.headers.indexOf(n), h);
async function open(pg, click, col) { await click(`.mrow[data-i="${await ti(pg, col)}"]`); await pg.waitForTimeout(450); }
async function from(pg, h) { await pg.selectOption('.sheet select[data-in="src"]', String(await sj(pg, h))); await pg.waitForTimeout(200); return 1; }
async function mapv(pg, key, val) {
  const k = await pg.evaluate(key => [...document.querySelectorAll('.sheet .vmap .f-row')].findIndex(r => r.querySelector('.vk').firstChild.textContent === key), key);
  if (k < 0) throw new Error('no map key ' + key);
  await pg.fill(`.sheet input[data-in="map"][data-k="${k}"]`, val); await pg.waitForTimeout(100); return 1;
}
async function done(pg, click) { await click('.sheet .sh-ok'); await pg.waitForTimeout(450); }
async function pairs(pg) { return pg.evaluate(() => { const S = window.__yj.S; return null; }); }
module.exports = {
  shop_cn2shopify: async (pg, click) => {
    let n = 0;
    await open(pg, click, 'Published'); n += await from(pg, '状态');
    const vals = await pg.evaluate(() => [...document.querySelectorAll('.sheet .vmap .f-row')].map(r => [r.querySelector('.vk').firstChild.textContent, r.querySelector('input').value]));
    for (const [a, b] of vals) if (!b) n += await mapv(pg, a, ['出售中', '在售', '上架'].includes(a) ? 'TRUE' : 'FALSE');
    await done(pg, click);
    console.error('  published pairs', JSON.stringify(vals));
    return n;
  },
  shopify2shop_cn: async (pg, click) => {
    let n = 0;
    await open(pg, click, '分类'); n += await from(pg, 'Type'); await done(pg, click);
    await open(pg, click, '上架状态');
    const vals = await pg.evaluate(() => [...document.querySelectorAll('.sheet .vmap .f-row')].map(r => [r.querySelector('.vk').firstChild.textContent, r.querySelector('input').value]));
    for (const [a, b] of vals) if (!b) n += await mapv(pg, a, a === 'active' ? '上架' : '下架');
    console.error('  status pairs', JSON.stringify(vals));
    await done(pg, click);
    return n;
  },
  coa: async (pg, click) => {
    let n = 0;
    await open(pg, click, 'Type'); n += await from(pg, '类别');
    const vals = await pg.evaluate(() => [...document.querySelectorAll('.sheet .vmap .f-row')].map(r => [r.querySelector('.vk').firstChild.textContent, r.querySelector('input').value]));
    const M = { 资产: 'Asset', 负债: 'Liability', 所有者权益: 'Equity', 成本: 'Expense', 损益: 'Expense' };
    for (const [a, b] of vals) if (!b) n += await mapv(pg, a, M[a]);
    console.error('  type pairs', JSON.stringify(vals));
    await done(pg, click);
    await open(pg, click, 'Description'); n += await from(pg, '科目全名'); await done(pg, click);
    return n;
  },
};
