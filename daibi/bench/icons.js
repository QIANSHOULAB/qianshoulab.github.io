// 照总舵首页代笔僧卡片的图标（墨色渐变底 + 白纸三行 + 白笔）出插件和网页用的 PNG
const { chromium } = require('playwright');
const D = require('path').resolve(__dirname, '..'); // 跑法：node daibi/bench/icons.js
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7B8494"/><stop offset="1" stop-color="#3A4150"/></linearGradient></defs>
<rect width="64" height="64" rx="15" fill="url(#g)"/>
<rect x="13" y="15" width="26" height="34" rx="4" fill="#fff"/>
<path d="M18.5 24h15M18.5 31h15M18.5 38h9" stroke="#3A4150" stroke-width="3" stroke-linecap="round"/>
<path d="M51 21l-14 18-4 6 6.5-3L53.5 24z" fill="#fff"/></svg>`;
// 16px：少一行、线加粗，不糊
const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7B8494"/><stop offset="1" stop-color="#3A4150"/></linearGradient></defs>
<rect width="64" height="64" rx="14" fill="url(#g)"/>
<rect x="11" y="13" width="28" height="38" rx="4" fill="#fff"/>
<path d="M17.5 25h15M17.5 37h10" stroke="#3A4150" stroke-width="5" stroke-linecap="round"/>
<path d="M53 19l-15 19-4.5 7 7-3.5L56 22.5z" fill="#fff"/></svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (svg, size, pad, out) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;padding:${pad}px;box-sizing:border-box">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
    await p.screenshot({ path: out, omitBackground: true });
  };
  await shot(small, 16, 0, D + '/extension/icons/icon-16.png');
  await shot(full, 32, 0, D + '/extension/icons/icon-32.png');
  await shot(full, 48, 2, D + '/extension/icons/icon-48.png');
  await shot(full, 128, 8, D + '/extension/icons/icon-128.png');
  await shot(full, 256, 0, D + '/img/icon.png');
  require('fs').writeFileSync(D + '/img/icon.svg', full);
  await b.close();
})();
