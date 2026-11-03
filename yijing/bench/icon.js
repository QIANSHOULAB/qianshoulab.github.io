// 出主屏图标：node icon.js → ../apple-touch-icon.png（180×180，满版，iOS 自己切圆角；图形同 ../icon.svg、总舵首页卡片）
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'icon.svg'), 'utf8').replace('rx="15"', 'rx="0"');
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 180, height: 180 } });
  await pg.setContent(`<html><body style="margin:0">${svg.replace('<svg ', '<svg width="180" height="180" ')}</body></html>`);
  await pg.screenshot({ path: path.join(__dirname, '..', 'apple-touch-icon.png'), clip: { x: 0, y: 0, width: 180, height: 180 } });
  await b.close();
})();
