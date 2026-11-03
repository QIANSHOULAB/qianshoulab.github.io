// 从 extension/icons/icon.svg（跟总舵首页卡片同一个图形同一个颜色）出插件要的 16/32/48/128 PNG。
// 用法：node xunshan/bench/icons.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DIR = path.resolve(__dirname, '../extension/icons');
(async () => {
  const svg = fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf8');
  const b = await chromium.launch();
  for (const n of [16, 32, 48, 128]) {
    const p = await b.newPage({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${n}" height="${n}" `)}</body></html>`);
    await p.screenshot({ path: path.join(DIR, n + '.png'), omitBackground: true });
    await p.close();
  }
  await b.close();
  console.log('icons ok');
})();
