// 0.2.1 真流程：node e2e021.js（YJ_URL 指向本地服务）。390 / 1280 × 浅色 / 深色各跑一遍，控制台报错数必须是 0；截图进 shots/
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const URL = process.env.YJ_URL || 'http://127.0.0.1:8765/yijing/', D = path.join(__dirname, 'data'), SH = path.join(__dirname, 'shots');
(async () => {
  const b = await chromium.launch(); let errs = 0; const log = [];
  for (const [w, h] of [[390, 844], [1280, 900]]) for (const cs of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1, colorScheme: cs, acceptDownloads: true });
    const pg = await ctx.newPage(), tag = `${w}${cs === 'dark' ? 'd' : ''}`;
    pg.on('console', m => { if (m.type() === 'error') { errs++; log.push(tag + ' console ' + m.text()); } });
    pg.on('pageerror', e => { errs++; log.push(tag + ' pageerror ' + e.message); });
    await pg.goto(URL); await pg.waitForTimeout(800);
    const step = async (name, fn) => { await fn(); const sx = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth); if (sx) { errs++; log.push(tag + ' 横向滚动 ' + name); } };
    const tpl = async k => { await pg.click('[data-act="pick-tgt"]'); await pg.waitForTimeout(400); await pg.click(`[data-act="tpl"][data-k="${k}"]`); await pg.waitForFunction(() => window.__yj.S.bad != null); await pg.waitForTimeout(300); };
    const drop = async f => { await pg.setInputFiles('#fSrc', path.join(D, f)); await pg.waitForFunction(n => window.__yj.S.src && window.__yj.S.src.name === n && window.__yj.S.bad != null, f); await pg.waitForTimeout(300); };
    // 1 打乱的 Shopify → 网店中文
    await step('shuf', async () => { await drop('shopify_shuf_src.csv'); await tpl('shop_cn'); });
    const t1 = await pg.textContent('#tidy'); if (!t1.includes('排回一起')) { errs++; log.push(tag + ' 没认出打乱的分组'); }
    await pg.evaluate(() => document.querySelector('#tidy').scrollIntoView({ block: 'start' })); await pg.waitForTimeout(300);
    if (cs === 'light' || w > 500) await pg.screenshot({ path: path.join(SH, `ours021_${tag}_group.png`) });
    // 关掉再开：行数变化
    const n0 = await pg.evaluate(() => window.__yj.S.rows.length);
    await pg.click('[data-act="tidy"][data-k="fill"]'); await pg.waitForTimeout(300);
    await pg.click('[data-act="tidy"][data-k="fill"]'); await pg.waitForTimeout(300);
    if (n0 !== await pg.evaluate(() => window.__yj.S.rows.length)) { errs++; log.push(tag + ' 开关来回后行数变了'); }
    // 2 英文空格标签 → Shopify，点开 Tags 列
    await step('tags', async () => { await drop('shop_en_src.csv'); await tpl('shopify'); });
    const ti = await pg.evaluate(() => window.__yj.S.tgt.cols.findIndex(c => c.name === 'Tags'));
    await pg.click(`.mrow[data-i="${ti}"]`); await pg.waitForTimeout(600);
    await pg.evaluate(() => { const s = document.querySelector('[data-act="lspace"]'); s && s.scrollIntoView({ block: 'center' }); }); await pg.waitForTimeout(200);
    await pg.screenshot({ path: path.join(SH, `ours021_${tag}_tags.png`) });
    const out1 = await pg.evaluate(i => window.__yj.outRow(window.__yj.S.rows[0])[i], ti);
    await pg.click('[data-act="lspace"]'); await pg.waitForTimeout(300);
    const out2 = await pg.evaluate(i => window.__yj.outRow(window.__yj.S.rows[0])[i], ti);
    await pg.click('[data-act="lspace"]'); await pg.waitForTimeout(300);
    const out3 = await pg.evaluate(i => window.__yj.outRow(window.__yj.S.rows[0])[i], ti);
    log.push(`${tag} Tags 第一行：${out1} ｜关：${out2} ｜再开：${out3}`);
    if (out1 !== 'back to school, free shipping' || out2 !== 'back to school free shipping' || out3 !== out1) { errs++; log.push(tag + ' 空格开关不对'); }
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    // 3 存配方，重丢文件自动套
    await pg.click('[data-act="save-rec"]'); await pg.waitForTimeout(400); await pg.fill('#recName', '英文网店'); await pg.click('[data-act="rec-save"]'); await pg.waitForTimeout(400);
    await drop('crm_src.csv'); await drop('shop_en_src.csv'); await pg.waitForTimeout(400);
    if (await pg.evaluate(() => window.__yj.S.tgt.id) !== 'shopify') { errs++; log.push(tag + ' 配方没自动套'); }
    // 4 三种格式导出
    for (const f of ['csv', 'xlsx', 'json']) {
      await pg.click(`[data-act="fmt"][data-f="${f}"]`);
      const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('[data-act="export"]')]);
      const p = await dl.path(); if (!p || fs.statSync(p).size < 1000) { errs++; log.push(tag + ' 导出 ' + f + ' 太小'); }
      await pg.waitForTimeout(300);
    }
    await pg.evaluate(() => scrollTo(0, 0)); await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(SH, `ours021_${tag}_top.png`) });
    await ctx.close();
  }
  await b.close();
  console.log(log.join('\n')); console.log('报错', errs);
  process.exit(errs ? 1 : 0);
})();
