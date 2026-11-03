// 图标：用 Chromium 把 app/assets/icon.svg 按各个尺寸画成 PNG（小尺寸单独画，比缩放清楚），
// 再由 icons.py 拼成 exe 用的 icon.ico。用法：node icons.js <icon.svg> <输出目录> 16 32 ...
const { chromium } = require('playwright');
const fs = require('fs');
const [svgPath, outDir, ...sizes] = process.argv.slice(2);
(async () => {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const s of sizes.map(Number)) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
    await p.screenshot({ path: `${outDir}/icon-${s}.png`, omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } });
  }
  await b.close();
})();
