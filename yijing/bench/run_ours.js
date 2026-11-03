// 跑我们的：node run_ours.js [case...]  需要仓库根起 http.server 8765；先跑 gen.py --big
// 每一步都走真界面（点按钮、选文件），点数 = 点击次数 + 选文件次数 + 下拉选择次数 + 输入框次数
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const D = path.join(__dirname, 'data'), OUT = path.join(D, 'out');
const CASES = {
  crm: { src: 'crm_src.csv', tpl: 'crm', key: 'Customer ID', truth: 'truth_crm.csv' },
  crm_gbk: { src: 'crm_src_gbk.csv', tpl: 'crm', key: 'Customer ID', truth: 'truth_crm.csv' },
  shop_cn2shopify: { src: 'shop_cn_src.csv', tpl: 'shopify', key: 'Variant SKU', truth: 'truth_shop_cn2shopify.csv' },
  shopify2shop_cn: { src: 'shopify_src.csv', tpl: 'shop_cn', key: '商品编码', truth: 'truth_shopify2shop_cn.csv', csv: true },
  coa: { src: 'coa_src_gbk.csv', tpl: 'coa_en', key: 'Code', truth: 'truth_coa.csv' },
  shopify_shuf2shop_cn: { src: 'shopify_shuf_src.csv', tpl: 'shop_cn', key: '商品编码', truth: 'truth_shopify2shop_cn.csv', csv: true },
  shop_en2shopify: { src: 'shop_en_src.csv', tpl: 'shopify', key: 'Variant SKU', truth: 'truth_shop_en2shopify.csv' },
  shop_en12shopify: { src: 'shop_en1_src.csv', tpl: 'shopify', key: 'Variant SKU', truth: 'truth_shop_en12shopify.csv' },
  crm_100k: { src: 'crm_100k.csv', tpl: 'crm', key: 'Customer ID', truth: 'truth_crm_100k.csv' },
};
const FIX = require('./fixes_ours.js');
(async () => {
  const only = process.argv.slice(2).filter(a => !a.startsWith('--')), phase = process.argv.includes('--fix') ? 'fix' : 'raw';
  const b = await chromium.launch();
  const res = {};
  for (const [k, c] of Object.entries(CASES)) {
    if (only.length && !only.includes(k)) continue;
    const pg = await b.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await pg.goto(process.env.YJ_URL || 'http://127.0.0.1:8765/yijing/');
    let clicks = 0;
    const click = async sel => { clicks++; await pg.click(sel); };
    const T0 = Date.now();
    // 1 选来源：点按钮 + 在系统对话框里选文件
    clicks += 2; await pg.setInputFiles('#fSrc', path.join(D, c.src));
    await pg.waitForFunction(n => window.__lastRead && window.__yj.S.src && window.__yj.S.src.name === n, c.src, { timeout: 120000 });
    const readMs = await pg.evaluate(() => window.__lastRead.ms);
    // 2 选目标模板
    if (c.tpl !== 'crm') { await click('[data-act="pick-tgt"]'); await pg.waitForTimeout(400); await click(`[data-act="tpl"][data-k="${c.tpl}"]`); }
    await pg.waitForFunction(() => window.__yj.S.bad != null, null, { timeout: 120000 });
    const readyMs = Date.now() - T0;
    // 3 修（--fix）
    if (phase === "fix" && FIX[k]) { const x = await FIX[k](pg, click); clicks += x; }
    if (c.csv) await click('[data-act="fmt"][data-f="csv"]');
    const flagged = await pg.evaluate(() => window.__yj.S.badTotal);
    // 4 导出
    const t1 = Date.now();
    const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 180000 }), click('[data-act="export"]')]);
    const ext = await pg.evaluate(() => window.__yj.S.fmt);
    const f = path.join(OUT, `ours_${phase}_${k}.${ext}`); await dl.saveAs(f);
    const exportMs = await pg.evaluate(() => window.__lastExport.ms);
    res[k] = { clicks, readMs: Math.round(readMs), readyMs, exportMs: Math.round(exportMs), totalMs: Date.now() - T0, flagged, file: f, key: c.key, truth: path.join(D, c.truth) };
    console.error(k, JSON.stringify(res[k]));
    await pg.close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, `ours_${phase}.json`), JSON.stringify(res, null, 1));
})();
