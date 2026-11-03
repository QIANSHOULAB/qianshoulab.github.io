// 跑我们的抄经僧：node run_ours.js <材料目录> <输出目录>   （先在仓库根起 python3 -m http.server 8765）
// 每套材料：上传模板 → 上传数据 → 选「都要」→ 生成 → 存 zip；记录点击数、用时、截图。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [MAT, OUT] = process.argv.slice(2);
const URL = process.env.CHAOJING_URL || 'http://localhost:8765/chaojing/';
const exp = JSON.parse(fs.readFileSync(path.join(MAT, 'expected.json'), 'utf8'));
const only = process.env.ONLY ? process.env.ONLY.split(',') : Object.keys(exp);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const res = {};
  for (const key of only) {
    const set = exp[key]; const big = key.endsWith('500');
    const fmts = big ? ['docx', 'pdf'] : ['both'];
    for (const fmt of fmts) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
      const page = await ctx.newPage(); const errs = [];
      page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) });
      await page.goto(URL); await page.waitForLoadState('networkidle');
      let clicks = 0;
      // 上传模板：点按钮 + 文件框里选文件 = 2 下
      const [fc1] = await Promise.all([page.waitForEvent('filechooser'), page.click('#bUpTpl')]); await fc1.setFiles(path.join(MAT, set.template)); clicks += 2;
      await page.waitForTimeout(800);
      const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#bUpData')]); await fc2.setFiles(path.join(MAT, set.data)); clicks += 2;
      await page.waitForFunction(() => window.__S && window.__S.data && window.__S.data.rows.length > 0, null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      const map = await page.evaluate(() => ({ tags: __S.tpl.tags, map: __S.map, headers: __S.data.headers, rows: __S.data.rows.length, rule: __S.rule }));
      const unmatched = map.tags.filter(t => map.map[t] < 0);
      if (!big) { await page.screenshot({ path: path.join(OUT, `${key}-1280.png`), fullPage: true }); }
      await page.click(`#fmtSeg button[data-v="${fmt}"]`); clicks += 1;
      const t0 = Date.now();
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), page.click('#bGo')]); clicks += 1;
      const zipPath = path.join(OUT, `${key}-${fmt}.zip`); await dl.saveAs(zipPath);
      const wall = (Date.now() - t0) / 1000;
      const last = await page.evaluate(() => window.__lastRun);
      res[`${key}-${fmt}`] = { clicks, wall, last, unmatched, tags: map.tags.length, rows: map.rows, rule: map.rule, errs: errs.slice(0, 5) };
      console.log(key, fmt, JSON.stringify(res[`${key}-${fmt}`]));
      if (key === 'cert') { // 手机宽截图
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, `cert-390.png`), fullPage: true });
      }
      await ctx.close();
    }
  }
  fs.writeFileSync(path.join(OUT, 'ours.json'), JSON.stringify(res, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
