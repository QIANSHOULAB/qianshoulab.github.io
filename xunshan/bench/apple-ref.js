// 截两张 apple.com 当长相参照（设计规范最后一节）。沙盒走代理。
// 用法：node xunshan/bench/apple-ref.js → bench/shots-0.3/ref-*.png
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const b = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  for (const [u, w, name] of [['https://www.apple.com/macos/', 1280, 'ref-apple-macos-1280.png'], ['https://www.apple.com/iphone/', 390, 'ref-apple-iphone-390.png']]) {
    try {
      const p = await b.newPage({ viewport: { width: w, height: w === 390 ? 844 : 800 }, deviceScaleFactor: w === 390 ? 2 : 1, ignoreHTTPSErrors: false });
      await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.waitForTimeout(3000);
      await p.screenshot({ path: path.join(__dirname, 'shots-0.3', name) });
      console.log('ok', name);
      await p.close();
    } catch (e) { console.log('fail', name, e.message.split('\n')[0]); }
  }
  await b.close();
})();
