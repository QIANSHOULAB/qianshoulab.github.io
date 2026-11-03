// 步骤账：node steps030.js  （OLD_URL 指 0.2.1，YJ_URL 指 0.3.0）
// 同一个活（网店中文商品表 → Shopify，有 3 处存疑），第一次用、第二次用各走一遍，逐步记下人动的每一下，结果到手（下载）为止。
const { chromium } = require('playwright'); const path = require('path');
const D = path.join(__dirname, 'data'), F = path.join(D, 'shop_cn_src.csv');
const OLD = process.env.OLD_URL, NEW = process.env.YJ_URL || 'http://127.0.0.1:8765/yijing/';
(async () => {
  const b = await chromium.launch(), out = {};
  for (const [ver, url] of [['0.2.1', OLD], ['0.3.0', NEW]]) {
    if (!url) continue;
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const pg = await ctx.newPage(); let errs = 0; pg.on('pageerror', () => errs++);
    for (const use of ['第一次', '第二次']) {
      const L = []; let got = false; pg.removeAllListeners('download'); pg.on('download', () => { got = true; });
      let had = false; const mark = () => { const r = got && !had ? ' → 文件到手' : ''; had = got; return r; };
      const step = async (what, fn) => { if (fn) await fn(); await pg.waitForTimeout(350); L.push(what + mark()); };
      await pg.goto(url); await pg.waitForTimeout(500);
      if (ver === '0.2.1') {
        await step('点「换文件」', () => pg.click('[data-act="pick-src"]').catch(() => {}));
        await step('系统对话框里选文件', () => pg.setInputFiles('#fSrc', F));
        if (use === '第一次' || await pg.evaluate(() => window.__yj.S.tgt.id) !== 'shopify') {
          await step('点「换格式」', () => pg.click('[data-act="pick-tgt"]'));
          await step('点「Shopify 商品」', () => pg.click('[data-act="tpl"][data-k="shopify"]'));
        }
        const q = await pg.evaluate(() => window.__yj.S.maps.filter(m => m.conf === 'guess').length);
        if (q) L.push(`看 ${q} 处存疑（不用点）`);
        await step('点「导出」', () => pg.click('[data-act="export"]'));
        if (use === '第一次') {
          await step('点「存配方」', () => pg.click('[data-act="save-rec"]'));
          await step('配方名字（默认就行，不用点）');
          await step('点「存」', () => pg.click('[data-act="rec-save"]'));
        }
      } else {
        if (!await pg.evaluate(() => window.__yj.S.tgt)) await step('点「Shopify 商品」', () => pg.click('[data-act="tpl"][data-k="shopify"]'));
        await step('点「选文件」（拖进来就省这一下）', () => pg.click('[data-act="pick-src"]').catch(() => {}));
        await step('系统对话框里选文件', () => pg.setInputFiles('#fSrc', F));
        await pg.waitForTimeout(600);
        const d = await pg.evaluate(() => window.__yj.doubts().map(i => window.__yj.S.tgt.cols[i].name));
        L[L.length - 1] += mark();
        for (const n of d) await step(`看「${n}」，点「对」`, () => pg.click('#doubt [data-act="ok"]'));
      }
      await pg.waitForTimeout(500);
      out[`${ver} ${use}`] = { steps: L, got };
      console.log(`\n${ver} ${use}用：${L.filter(s => !s.includes('不用点')).length} 下，文件${got ? '到手' : '没到手'}`); L.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    }
    if (errs) console.log('页面报错', errs);
    await ctx.close();
  }
  await b.close();
})();
