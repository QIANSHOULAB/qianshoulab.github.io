// 化缘僧图标：跟总舵首页卡片同一个图形（金色圆角方块 + 两道名单 + 一只钵），出插件要的 16/32/48/128 PNG。
// 16 像素太小，两道线并成一道、笔画加粗，不然糊成一团。
// 用法：node huayuan/bench/icons.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const big = fs.readFileSync(path.join(ROOT, 'img/icon.svg'), 'utf8');
const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F5C451"/><stop offset="1" stop-color="#D99A0B"/></linearGradient></defs>
<rect width="64" height="64" rx="15" fill="url(#g)"/>
<path d="M18 18h28" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>
<path d="M9 30h46a23 23 0 0 1-46 0z" fill="#fff"/>
</svg>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const s of [16, 32, 48, 128]) {
    const svg = s <= 16 ? small : big;
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" style="display:block" `)}</body></html>`);
    await p.screenshot({ path: path.join(ROOT, 'extension/icons', s + '.png'), omitBackground: true });
  }
  await b.close();
  console.log('icons ok');
})();
