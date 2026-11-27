// 没有 WebGL 时用的七幕静态图：场景自己截的（?act=k&still 把进度定住、只留画面）。电脑一套 1600×1000，手机一套 900×1950。
// 用法（在 _zero/ 里，先起 scripts/serve.mjs）：node scripts/genesis-stills.mjs [服务地址]
// 写到 src/assets/genesis/still-land-k.jpg、still-port-k.jpg；改了画面以后跑一遍再构建。
import { chromium } from 'playwright';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const OUT = new URL('../src/assets/genesis/', import.meta.url).pathname;
const SHOT = [1, 2, 3, 4, 5, 6, 7];
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [tag, w, h] of [['land', 1600, 1000], ['port', 900, 1950]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  for (let k = 1; k <= 7; k++) {
    await page.goto(`${BASE}/zero/?act=${SHOT[k - 1]}&still&tier=high`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__zero && window.__zero.frames() > 3, null, { timeout: 180000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `still-${tag}-${k}.jpg`), type: 'jpeg', quality: 64 });
    console.log(tag, k);
  }
  await page.close();
}
await browser.close();
