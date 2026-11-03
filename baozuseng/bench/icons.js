// 从 ../icon.svg（跟总舵首页卡片同一个图形、同一个粉）出主屏图标 PNG。用法：node icons.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf8');
// 方形满版（iOS、安卓自己切圆角）：同一个渐变铺满，图形不动
const square = svg.replace('rx="15"', 'rx="0"');
// maskable：图形缩到安全区（中间 80%）里
const maskable = square.replace(/(<rect[^>]*\/>)([\s\S]*)<\/svg>/, '$1<g transform="translate(6.4 6.4) scale(.8)">$2</g></svg>');
const jobs = [['icon-192.png', 192, svg, true], ['icon-512.png', 512, svg, true], ['apple-touch-icon.png', 180, square, false], ['icon-maskable-512.png', 512, maskable, false]];
(async () => {
  const b = await chromium.launch();
  for (const [name, size, src, transparent] of jobs) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: path.join(DIR, name), omitBackground: transparent });
    await p.close();
  }
  await b.close();
  console.log('ok', jobs.map(j => j[0]).join(' '));
})();
