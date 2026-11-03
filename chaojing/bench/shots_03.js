// 交货截图（设计规范最后一节）：node shots_03.js <材料目录> <输出目录>
// 手机 390、电脑 1280 × 浅色、深色 × 空状态、干活中、结果、出错 = 16 张；外加主屏图标 apple-touch-icon.png。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [MAT, OUT] = process.argv.slice(2);
const URL = process.env.CHAOJING_URL || 'http://localhost:8813/chaojing/';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [w, h] of [[390, 844], [1280, 900]]) for (const scheme of ['light', 'dark']) {
    const tag = `${w}-${scheme}`;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2, acceptDownloads: true, isMobile: w < 500, hasTouch: w < 500 });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(tag + ' ' + e)); p.on('console', m => { if (m.type() === 'error') errs.push(tag + ' ' + m.text()) });
    await p.goto(URL); await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, `${tag}-1-空状态.png`) });
    // 出错：丢一个坏掉的 .docx
    const [f0] = await Promise.all([p.waitForEvent('filechooser'), p.click('.js-pick:visible')]); await f0.setFiles({ name: '坏掉的合同.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a zip') }); // 中文名走本地路径时 Playwright 不触发 change，用内存文件
    await p.waitForFunction(() => __S.err, null, { timeout: 5000 }).catch(async () => console.log(tag, 'no err', await p.evaluate(() => [__S.tpl && __S.tpl.name, document.body.className])));
    await p.waitForTimeout(300); await p.evaluate(() => document.querySelector('#err0').scrollIntoView({ block: 'center' }));
    await p.screenshot({ path: path.join(OUT, `${tag}-4-出错.png`) });
    // 干活中：500 行发票出 PDF
    const [f1] = await Promise.all([p.waitForEvent('filechooser'), p.click('.js-pick:visible')]);
    await f1.setFiles([path.join(MAT, 'invoice.docx'), path.join(MAT, 'invoice_500.xlsx')]);
    await p.waitForFunction(() => __S.data && __S.data.rows.length === 500 && __S.tpl); await p.waitForTimeout(1500);
    await p.click('#fmtSeg button[data-v="pdf"]'); await p.waitForTimeout(400);
    if (w > 900) await p.evaluate(() => scrollTo(0, 0));
    const dl = p.waitForEvent('download', { timeout: 120000 });
    await p.click('#bGo');
    await p.waitForFunction(() => { const t = document.querySelector('#progT').textContent; const m = t.match(/已抄 (\d+)/); return m && +m[1] > 120 }, null, { timeout: 60000 });
    await p.screenshot({ path: path.join(OUT, `${tag}-2-干活中.png`) });
    await dl; await p.waitForTimeout(700); if (w > 900) await p.evaluate(() => document.querySelector('#done').scrollIntoView({ block: 'end' }));
    await p.screenshot({ path: path.join(OUT, `${tag}-3-结果.png`) });
    await ctx.close();
  }
  // 主屏图标：iOS 自己切圆角，这里给满版方图
  const ctx = await b.newContext({ viewport: { width: 180, height: 180 } }); const p = await ctx.newPage();
  const svg = fs.readFileSync(path.join(__dirname, '..', 'icon.svg'), 'utf8').replace('rx="15"', 'rx="0"');
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', '<svg width="180" height="180" ')}</body></html>`);
  await p.screenshot({ path: path.join(__dirname, '..', 'apple-touch-icon.png'), clip: { x: 0, y: 0, width: 180, height: 180 } });
  await b.close();
  console.log('errors:', errs.length, errs.slice(0, 5));
})().catch(e => { console.error(e); process.exit(1); });
