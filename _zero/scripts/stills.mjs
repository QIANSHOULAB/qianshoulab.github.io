// 七幕各一张静态图（没有 WebGL 时首页用它们，照样能滑、能点）：横的 1600×1000、竖的 900×1950，场景自己截。
// 跑法：先 npm run build，把 dist 摆成线上的样子在本地起服务（首页在 /），再
//   BASE=http://127.0.0.1:4321 node scripts/stills.mjs
// 结果写到 src/assets/stills/act{1..7}-{l,p}.jpg。PW_MODULE 可以指到机器上预装的 playwright。
// ONLY=p 只重拍竖的（v3.4 只改了手机竖屏的落点，横的一个像素没动，不重拍）。
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const BASE = (process.env.BASE || 'http://127.0.0.1:4321').replace(/\/$/, '');
const ACTS = [1, 1.9, 2.9, 3.95, 4.92, 5.9, 7];
const dir = new URL('../src/assets/stills/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [tag, w, h] of [['l', 1600, 1000], ['p', 900, 1950]].filter(([t]) => !process.env.ONLY || process.env.ONLY.split(',').includes(t))) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  for (let i = 0; i < ACTS.length; i++) {
    await page.goto(`${BASE}/?act=${ACTS[i]}&t=5&tier=high&still`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__zero && window.__zero.frames() >= 4, null, { timeout: 300000 });
    const png = `${dir}act${i + 1}-${tag}.png`;
    await page.screenshot({ path: png });
    // 存成 JPEG（Pillow），比 PNG 小十倍
    execFileSync('python3', ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2], quality=80, optimize=True, progressive=True)', png, png.replace(/\.png$/, '.jpg')]);
    rmSync(png);
    console.log(tag, ACTS[i]);
  }
}
await b.close();
