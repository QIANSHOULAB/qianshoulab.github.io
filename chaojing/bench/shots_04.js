// 0.4.0 中英截图（文案规范「交货前自查」）：node shots_04.js <输出目录>
// 英文、中文 × 手机 390、电脑 1280 × 空状态、结果（用示例证书一下下载完）= 8 张，浅色。默认英文；中文那套点右上角「中文」。
// 加 EXTRA=1 再多拍几张给自己看：英文发票示例、英文出错、英文在线编辑、英文深色结果。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [OUT] = process.argv.slice(2);
const URL = process.env.CHAOJING_URL || 'http://localhost:8813/chaojing/';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const L of ['zh', 'en']) for (const [w, h] of [[390, 844], [1280, 900]]) {
    const tag = `${L}-${w}`;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: 'light', deviceScaleFactor: 2, acceptDownloads: true, isMobile: w < 500, hasTouch: w < 500 });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(tag + ' ' + e)); p.on('console', m => { if (m.type() === 'error') errs.push(tag + ' ' + m.text()) });
    await p.goto(URL); await p.waitForTimeout(800);
    if (L === 'zh') { await p.click('#langSeg button[data-l="zh"]'); await p.waitForTimeout(300); }
    await p.screenshot({ path: path.join(OUT, `${tag}-1-empty.png`) });
    await p.click('#bTry'); await p.waitForFunction(() => __S.tpl && __S.data); await p.waitForTimeout(1200);
    await Promise.all([p.waitForEvent('download'), p.click('#bGo')]);
    await p.waitForFunction(() => !document.querySelector('#done').hidden); await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(OUT, `${tag}-2-result.png`) });
    if (process.env.EXTRA && L === 'en') {
      await p.click('#samples button[data-k="invoice"]'); await p.waitForTimeout(1500);
      await p.screenshot({ path: path.join(OUT, `x-${tag}-invoice.png`), fullPage: true });
      await p.click('#bEdit'); await p.waitForSelector('#ePage'); await p.waitForTimeout(500);
      await p.screenshot({ path: path.join(OUT, `x-${tag}-editor.png`) });
      await p.click('#eX');
      await p.click('#bForget').catch(() => {});
      await p.evaluate(() => { __S.tpl = null; __S.data = null; });
      await p.goto(URL); await p.evaluate(() => { indexedDB.deleteDatabase('chaojing'); }); await p.goto(URL); await p.waitForTimeout(500);
      const [f0] = await Promise.all([p.waitForEvent('filechooser'), p.click('.js-pick:visible')]);
      await f0.setFiles({ name: 'broken-contract.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a zip') });
      await p.waitForTimeout(400); await p.evaluate(() => document.querySelector('#err0').scrollIntoView({ block: 'center' }));
      await p.screenshot({ path: path.join(OUT, `x-${tag}-error.png`) });
    }
    await ctx.close();
  }
  if (process.env.EXTRA) for (const w of [390, 1280]) {
    const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, colorScheme: 'dark', deviceScaleFactor: 2, acceptDownloads: true, isMobile: w < 500, hasTouch: w < 500 });
    const p = await ctx.newPage(); await p.goto(URL); await p.waitForTimeout(600);
    await p.click('#bTry'); await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, `x-en-${w}-dark.png`) });
    await ctx.close();
  }
  await b.close();
  console.log('errors:', errs.length, errs.slice(0, 5));
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
