// 黑碑首页的验收截图（对着线上 https://qianshoulab.github.io/zero/ 跑）：
//   电脑 1440×900、手机 390×844，各拍：黎明 0 / 5 / 10 秒、五撮各出一次碑、进门半路、声音开关；量 10 秒帧数；收控制台报错。
// 用法：node scripts/monolith-shots.mjs [输出文件夹]   （默认 ../_ops/零肉身造物/黑碑截图）
// 截图是给人看的：deviceScaleFactor 2、JPEG。黎明按页面里的进度（window.__zero.p()）掐点，不靠猜时间。
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.LIVE_BASE || 'https://qianshoulab.github.io';
const OUT = process.argv[2] || new URL('../../_ops/零肉身造物/黑碑截图/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const NAMES = ['01千手院', '02赛博杂货铺', '03标本', '04文物', '05法典'];
const result = { base: BASE, when: new Date().toISOString(), views: {} };

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const v of [{ w: 1440, h: 900, phone: false }, { w: 390, h: 844, phone: true }]) {
  const tag = String(v.w);
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2, isMobile: v.phone, hasTouch: v.phone });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = (name) => page.screenshot({ path: join(OUT, `${tag}-${name}.jpg`), type: 'jpeg', quality: 86 });
  const p = () => page.evaluate(() => (window.__zero ? window.__zero.p() : -1));

  // 先真走一遍黎明（新会话，没看过）：页面自己的钟走 3 秒，进度应该在 0.3 上下；天亮以后量 10 秒帧数
  await page.goto(`${BASE}/zero/?v=${Date.now()}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__zero && window.__zero.frames() > 0, null, { timeout: 90000 });
  const gl = await page.evaluate(() => document.documentElement.dataset.gl);
  await page.waitForTimeout(3000);
  const p3 = await p();
  await page.waitForFunction(() => window.__zero.p() >= 1, null, { timeout: 30000 });
  const f0 = await page.evaluate(() => window.__zero.frames());
  const t0 = Date.now();
  await page.waitForTimeout(10000);
  const f1 = await page.evaluate(() => window.__zero.frames());
  const fps = ((f1 - f0) / ((Date.now() - t0) / 1000)).toFixed(1);

  // 黎明 0 / 5 / 10 秒：用 ?dawn= 把进度定格（没 GPU 的机器上一帧要好几百毫秒，掐表截不准）
  for (const [d, name] of [[0, '黎明-0s'], [0.5, '黎明-5s'], [1, '黎明-10s']]) {
    await page.goto(`${BASE}/zero/?dawn=${d}&v=${Date.now()}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__zero && window.__zero.frames() > 2, null, { timeout: 90000 });
    await shot(name);
  }

  // 五撮各出一次
  for (let k = 0; k < 5; k++) {
    const sel = `.entry[data-k="${k}"]`;
    if (v.phone) await page.tap(sel); else await page.hover(sel);
    await page.waitForTimeout(1800);
    await shot(`出碑-${NAMES[k]}`);
  }

  // 声音开关
  await page.click('[data-sound-toggle]');
  await page.waitForTimeout(300);
  const sound = await page.evaluate(() => document.querySelector('[data-sound-toggle]').innerText.trim());
  await shot('声音开');
  await page.click('[data-sound-toggle]');

  // 进门半路：镜头停在 55% 的地方拍（没 GPU 的机器太慢，掐表拍到的是一片白）
  await page.evaluate(() => window.__zero.hold(2, 0.55));
  await page.waitForTimeout(2600);
  await page.evaluate(async () => { const f = window.__zero.frames(); while (window.__zero.frames() < f + 2) await new Promise((r) => setTimeout(r, 50)); });
  await shot('进门-半路');
  // 再真点一次，看它真的冲进光里、跳到 /specimens/（手机上第一下出碑、第二下进门）
  await page.goto(`${BASE}/zero/?dawn=1&v=${Date.now()}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__zero && window.__zero.frames() > 1, null, { timeout: 90000 });
  const sel = '.entry[data-k="2"]';
  if (v.phone) { await page.tap(sel); await page.waitForTimeout(800); await page.tap(sel, { noWaitAfter: true }); }
  else { await page.hover(sel); await page.waitForTimeout(800); await page.click(sel, { noWaitAfter: true }); }
  await page.waitForURL('**/specimens/**', { timeout: 20000 }).catch(() => {});
  const landed = page.url();

  result.views[tag] = { gl, dawnAt3s: +p3.toFixed(3), fps10s: +fps, sound, landed, errors };
  console.log(tag, JSON.stringify(result.views[tag]));
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, '验收.json'), JSON.stringify(result, null, 2));
