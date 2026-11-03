// 截图：node shots.js <openrefine项目id>
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(), D = path.join(__dirname, 'data'), S = path.join(__dirname, 'shots');
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
    await pg.goto('http://127.0.0.1:8765/yijing/');
    await pg.setInputFiles('#fSrc', path.join(D, 'crm_src.csv'));
    await pg.waitForFunction(() => window.__yj.S.bad != null && window.__yj.S.src.name === 'crm_src.csv');
    await pg.waitForTimeout(3000);
    await pg.screenshot({ path: path.join(S, `ours_${w}.png`) });
    await pg.click('.mrow[data-i="4"]'); await pg.waitForTimeout(700);
    await pg.screenshot({ path: path.join(S, `ours_${w}_col.png`) });
    const o = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
    await o.goto(`http://127.0.0.1:3333/project?project=${process.argv[2]}`); await o.waitForTimeout(4000);
    await o.screenshot({ path: path.join(S, `openrefine_${w}.png`) });
    if (w > 500) {
      await o.goto('http://127.0.0.1:3333/'); await o.waitForTimeout(2500);
      await o.screenshot({ path: path.join(S, `openrefine_${w}_home.png`) });
    }
  }
  await b.close();
})();
