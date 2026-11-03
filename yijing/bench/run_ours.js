// 跑我们的（0.3.0 起的流程）：node run_ours.js [case...]  需要仓库根起 http.server（YJ_URL 指过去）；先跑 gen.py --big
// YJ_TAG 管输出名（默认 030 → data/out/ours030.json；0.4.0 用 YJ_TAG=040）
// 每个场景一个干净浏览器，走真界面：第一次用 = 选目标格式 → 选文件 → （有存疑就点「都对，下载」，没有就自己下）；
// 第二次用 = 重开页面 → 选文件 → 自己套上回的对法、自己下。
// 点数 = 点击次数 + 选文件次数（点按钮 + 系统对话框里选，算 2 下；拖进来只算 1 下，这里按 2 算）
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
const URL = process.env.YJ_URL || 'http://127.0.0.1:8765/yijing/', TAG = process.env.YJ_TAG || '030';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const b = await chromium.launch();
  const res = {};
  for (const [k, c] of Object.entries(CASES)) {
    if (only.length && !only.includes(k)) continue;
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const pg = await ctx.newPage(); let errs = 0;
    pg.on('pageerror', () => errs++); pg.on('console', m => { if (m.type() === 'error') errs++; });
    const run = async (first) => {
      await pg.goto(URL);
      let clicks = 0; const click = async sel => { clicks++; await pg.click(sel); };
      if (first) { await click(`[data-act="tpl"][data-k="${c.tpl}"]`); if (c.csv) await click('[data-act="fmt"][data-f="csv"]'); }
      const T0 = Date.now(); // 机器时间从丢文件算起：读入 + 对列 + 全表扫错 + 导出（不含人点）
      const dlP = pg.waitForEvent('download', { timeout: 240000 });
      clicks += 2; await pg.setInputFiles('#fSrc', path.join(D, c.src));
      await pg.waitForFunction(n => window.__yj.S.src && window.__yj.S.src.name === n && window.__yj.S.bad != null, c.src, { timeout: 240000 });
      const readyMs = Date.now() - T0, readMs = await pg.evaluate(() => window.__lastRead.ms);
      const doubts = await pg.evaluate(() => window.__yj.doubts().map(i => window.__yj.S.tgt.cols[i].name));
      if (doubts.length) await click('[data-act="export"]');
      const dl = await dlP;
      const ext = await pg.evaluate(() => window.__yj.S.fmt);
      const f = path.join(OUT, `ours${TAG}_${first ? 1 : 2}_${k}.${ext}`); await dl.saveAs(f);
      const ex = await pg.evaluate(() => window.__lastExport);
      return { clicks, doubts, auto: ex.auto, readMs: Math.round(readMs), readyMs, exportMs: Math.round(ex.ms), machineMs: readyMs + Math.round(ex.ms), file: f, key: c.key, truth: path.join(D, c.truth) };
    };
    const r1 = await run(true); await pg.waitForTimeout(500);
    const r2 = await run(false);
    res[k] = { first: r1, second: r2, errs };
    console.error(k, JSON.stringify({ c1: r1.clicks, d1: r1.doubts, c2: r2.clicks, auto2: r2.auto, ready1: r1.readyMs, read1: r1.readMs, exp1: r1.exportMs, mach1: r1.machineMs, errs }));
    await ctx.close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, `ours${TAG}.json`), JSON.stringify(res, null, 1));
})();
