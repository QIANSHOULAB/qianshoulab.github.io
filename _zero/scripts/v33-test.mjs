// v3.3 验收（施工单「测」）：停手以后自己走到展示位置。
//   手机（390×844，开触摸；WebKit 用 Playwright 的 iPhone 13 机型）：
//     1. 第三幕展示位置往前轻滑不到半屏、停手 → 1.5 秒内落到第四幕展示位置，P 误差 ≤ 0.01
//     2. 滑到两幕之间（这一段的 60%）停手 → 落到展示位置，不停在 60%
//     3. 自己走的途中手指按下 → 马上停，接着跟手
//     4. 一口气猛滑过三幕 → 落在往前最近的那一幕，不来回晃
//     5. 点每个刻度、点「目录」：最后 P 都等于展示位置（≤ 0.01）；走到一半把视口高从 844 改成 750 再改回来，照样准
//     6. 点「进去」以后连滑、连点：照样进栏目页；后退回来就在展示位置
//   电脑（1440×900）：
//     7. 滚轮一格往下 → 走到下一幕；连着滚三格 → 只走一幕，不连跳
//     8. 触控板惯性（连续、又小又递减的 wheel 事件）：惯性没完不接管，完了再走
//     9. 键盘：↓、PageUp、End、Home
//    10. 点「进去」以后连滚滚轮：照样进栏目页；后退回来就在展示位置
//   另外：录一段「滑一下、停手、自己走完」（Chromium 才录，录像在 <输出目录>/录屏/）；量自己走的那一段每秒多少帧（软件渲染的机器上只说明能跑）。
// 「真滑」：Chromium 用 CDP 发真的触摸事件（浏览器自己滚、自己带惯性）；WebKit 的 Playwright 只能 tap，滑的时候在页面里发触摸事件、跟着手指滚页面，
//   松手以后再按递减的速度滚一段当惯性（施工单说的「WebKit 开触摸用 tap 和真滑」里能做到的那一半，报告里写明）。Firefox 只测滚轮、键盘（工作流机器上没有 WebGL，走静态图）。
// 跑法：node scripts/v33-test.mjs <输出目录>   ENGINE=webkit|chromium|firefox  BASE=网站根  ONLY=1,2,7  PW_MODULE=别的 playwright
const pw = await import(process.env.PW_MODULE || 'playwright');
import { mkdirSync, writeFileSync, readdirSync, renameSync } from 'node:fs';

const out = process.argv[2] || 'v33-test';
const BASE = (process.env.BASE || 'https://qianshoulab.github.io').replace(/\/$/, '');
const ENGINE = process.env.ENGINE || 'webkit';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TIER = process.env.TIER || 'low';
// 量手感（停手 200 毫秒、惯性）的时候画面分辨率压得很低：没有显卡的机器上一帧要几百毫秒，帧慢了「停手」的判定就量不准（真机不受影响）
const LOWRES = process.env.LOWRES ?? '0.3';
mkdirSync(out, { recursive: true });
const REST = [1, 1.88, 2.88, 3.88, 4.88, 5.88, 7];
const rows = [], fails = [];
const log = (r) => { rows.push(r); console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.note ? ` （${r.note}）` : ''}`); if (!r.ok) fails.push(r.name); };
const browser = await pw[ENGINE].launch(ENGINE === 'chromium' ? { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : ENGINE === 'firefox' ? { firefoxUserPrefs: { 'webgl.force-enabled': true } } : {});
const dev = pw.devices['iPhone 13'];
const PHONE = { width: 390, height: 844 };

async function newPage(kind, extra = {}) {
  const opts = kind === 'phone'
    ? (ENGINE === 'webkit' ? { ...dev, viewport: PHONE } : { viewport: PHONE, deviceScaleFactor: 1, isMobile: ENGINE !== 'firefox', hasTouch: ENGINE !== 'firefox' })
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
  const ctx = await browser.newContext({ ...opts, ...extra });
  const page = await ctx.newPage();
  page.errs = [];
  const mine = () => { try { return new URL(page.url()).pathname === '/zero/'; } catch { return false; } };
  page.on('pageerror', (e) => { if (mine()) page.errs.push(String(e).slice(0, 200)); });
  page.on('console', (m) => { if (m.type() === 'error' && mine()) page.errs.push(m.text().slice(0, 200)); });
  page.cdp = ENGINE === 'chromium' ? await ctx.newCDPSession(page) : null;
  return page;
}
async function open(page, q = '', dpr = LOWRES) {
  await page.goto(`${BASE}/zero/?tier=${TIER}${dpr ? `&dpr=${dpr}` : ''}${q}`, { waitUntil: 'load' });
  return ready(page);
}
async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.gl, null, { timeout: 90000 });
  const gl = await page.evaluate(() => document.documentElement.dataset.gl);
  await page.waitForFunction(() => window.__zero, null, { timeout: 120000 });
  if (gl === 'yes') {
    await page.waitForFunction(() => window.__zero.frames() >= 3, null, { timeout: 240000 });
    await page.waitForFunction(() => document.documentElement.dataset.dust, null, { timeout: 240000 }).catch(() => {});
  }
  // 记下最后一下「不是自己走出来的」滚动（手指、惯性）：停手 = 手指离开、惯性也停了，从那一刻起算
  await page.evaluate(() => {
    if (window.__lastUserScroll != null) return;
    window.__lastUserScroll = 0;
    addEventListener('scroll', () => { if (!window.__zero?.gliding?.().on) window.__lastUserScroll = performance.now(); }, { passive: true });
  });
  return gl;
}
const st = (page) => page.evaluate(() => { const z = window.__zero; const g = z.glide(); return { P: +z.P().toFixed(4), y: scrollY, gliding: z.gliding().on, to: z.gliding().to, gesture: !!g.gesture, rested: g.rested, u: g.u }; });
const idle = (page, ms = 15000) => page.waitForFunction(() => { const z = window.__zero; return !z.gliding().on && !z.glide().gesture; }, null, { timeout: ms, polling: 40 });
async function settleAt(page, P) {
  await page.evaluate((p) => window.__zero.to(p, 'tick'), P);
  await page.waitForTimeout(120);
  await idle(page, 20000);
  return st(page);
}
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;

// —— 手指滑：Chromium 发真的触摸（CDP）；别的内核在页面里发触摸事件、跟着手指滚，松手后按递减的速度滚一段当惯性 ——
async function swipe(page, dy, o = {}) {
  const ms = o.ms ?? 260, hold = o.hold ?? 0, v0 = o.v0 ?? 0;
  if (page.cdp && !o.emu) {
    const x = 195, y0 = dy > 0 ? 760 : 120;
    const steps = Math.max(4, Math.round(ms / 20));
    const T = (type, y) => page.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await T('touchStart', y0);
    for (let i = 1; i <= steps; i++) { await T('touchMove', y0 - (dy * i) / steps); await page.waitForTimeout(ms / steps); }
    if (hold) await page.waitForTimeout(hold);
    const t = await page.evaluate(() => performance.now());
    await T('touchEnd', y0 - dy);
    return t;
  }
  return page.evaluate(async ({ dy, ms, hold, v0 }) => {
    const ev = (type) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      const t = [{ clientX: 195, clientY: 400, identifier: 1 }];
      Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : t });
      Object.defineProperty(e, 'changedTouches', { value: t });
      return e;
    };
    const sleep = (m) => new Promise((r) => setTimeout(r, m));
    document.body.dispatchEvent(ev('touchstart'));
    const steps = Math.max(4, Math.round(ms / 20));
    for (let i = 1; i <= steps; i++) { window.scrollBy(0, dy / steps); document.body.dispatchEvent(ev('touchmove')); await sleep(ms / steps); }
    if (hold) await sleep(hold);
    const t = performance.now();
    document.body.dispatchEvent(ev('touchend'));
    let v = v0;
    while (Math.abs(v) > 0.6) { window.scrollBy(0, v); v *= 0.93; await sleep(16); }
    return t;
  }, { dy, ms, hold, v0 });
}
const fingerDown = (page) => page.cdp
  ? page.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 420, id: 1 }] })
  : page.evaluate(() => { const e = new Event('touchstart', { bubbles: true }); Object.defineProperty(e, 'touches', { value: [{ clientX: 195, clientY: 420 }] }); document.body.dispatchEvent(e); });
async function fingerMove(page, dy) {
  if (page.cdp) { for (let i = 1; i <= 6; i++) { await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 420 - (dy * i) / 6, id: 1 }] }); await page.waitForTimeout(30); } return; }
  await page.evaluate(async (dy) => { for (let i = 1; i <= 6; i++) { window.scrollBy(0, dy / 6); const e = new Event('touchmove', { bubbles: true }); Object.defineProperty(e, 'touches', { value: [{ clientX: 195, clientY: 400 }] }); document.body.dispatchEvent(e); await new Promise((r) => setTimeout(r, 30)); } }, dy);
}
const fingerUp = (page) => page.cdp
  ? page.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  : page.evaluate(() => { const e = new Event('touchend', { bubbles: true }); Object.defineProperty(e, 'touches', { value: [] }); document.body.dispatchEvent(e); });
const landedAt = (page, target, ms = 15000) => page.evaluate(async ({ target, ms }) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const z = window.__zero, g = z.glide();
    if (!z.gliding().on && !g.gesture && g.rested != null) return { t: performance.now(), P: z.P(), rested: g.rested };
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { t: -1, P: window.__zero.P(), rested: null };
}, { target, ms });

const touchy = ENGINE !== 'firefox';
let gl = 'yes';

// ———————— 手机 ————————
if (touchy && ONLY.some((n) => n <= 6)) {
  const page = await newPage('phone');
  gl = await open(page);
  const vh = await page.evaluate(() => document.querySelector('[data-stage]').clientHeight);
  // 1. 轻滑
  if (ONLY.includes(1)) {
    const r = { name: '手机：第三幕展示位置往前轻滑不到半屏、停手 → 1.5 秒内落到第四幕展示位置', ok: false };
    try {
      const s0 = await settleAt(page, 2.88);
      const tRel = await swipe(page, vh * 0.32, { ms: 240, v0: 6 });
      const L = await landedAt(page, 3.88);
      const tEnd = Math.max(tRel, await page.evaluate(() => window.__lastUserScroll || 0));
      r.took = L.t > 0 ? Math.round(L.t - tEnd) : null;          // 停手（惯性也停了）以后多久落定：单子的 1.5 秒按这个算
      r.fromRelease = L.t > 0 ? Math.round(L.t - tRel) : null;   // 松手以后多久（含惯性那一段）
      r.P = L.P; r.from = s0.P;
      r.ok = near(L.P, 3.88) && L.t > 0 && r.took <= 1500;
      r.note = `${s0.P} → ${(+L.P).toFixed(4)}，惯性停了以后 ${r.took} 毫秒落定（松手后 ${r.fromRelease} 毫秒，含惯性 ${Math.round(tEnd - tRel)} 毫秒）`;
    } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
    log(r);
  }
  // 2. 两幕之间（这一段的 60%）停手
  if (ONLY.includes(2)) {
    const r = { name: '手机：滑到两幕之间（这一段的 60%）停手 → 落到展示位置，不停在 60%', ok: false };
    try {
      await settleAt(page, 3.88);
      // 第四幕展示位置（3.88）→ 第五段 60%（4.6）：往前拖 0.72 × 1.5 屏，按住不动 0.4 秒再松手
      const dy = (4.6 - 3.88) * 1.5 * vh;
      await swipe(page, dy, { ms: 500, hold: 400 });
      const mid = await st(page);
      const L = await landedAt(page, 4.88);
      r.released = mid.P; r.P = L.P;
      r.ok = REST.some((p) => near(L.P, p)) && !near(L.P, mid.P, 0.05);
      r.note = `松手时 ${mid.P}，落在 ${(+L.P).toFixed(4)}`;
    } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
    log(r);
  }
  // 3. 自己走的途中手指按下
  if (ONLY.includes(3)) {
    const r = { name: '手机：自己走的途中手指按下 → 马上停，接着跟手', ok: false };
    try {
      await settleAt(page, 2.88);
      await page.evaluate(() => window.__zero.to(5.88, 'tick'));
      await page.waitForFunction(() => window.__zero.P() > 3.4, null, { timeout: 15000, polling: 20 });
      await fingerDown(page);
      const a = await st(page);
      await page.waitForTimeout(350);
      const b = await st(page);
      await fingerMove(page, 90);
      await page.waitForTimeout(150);
      const c = await st(page);
      await fingerUp(page);
      const L = await landedAt(page, 0);
      r.down = a; r.after350 = b; r.moved = c; r.landed = L.P;
      r.ok = !a.gliding && Math.abs(b.P - a.P) <= 0.006 && c.P > b.P + 0.01 && REST.some((p) => near(L.P, p));
      r.note = `按下那一刻 ${a.P}（还在走：${a.gliding}），按住 0.35 秒后 ${b.P}，手指一推 ${c.P}，松手落在 ${(+L.P).toFixed(4)}`;
    } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
    log(r);
  }
  // 4. 一口气猛滑过三幕
  if (ONLY.includes(4)) {
    const r = { name: '手机：一口气猛滑过三幕 → 落在往前最近的那一幕，不来回晃', ok: false };
    try {
      await settleAt(page, 1.88);
      await page.evaluate(() => { window.__trk = []; const z = window.__zero; const loop = () => { window.__trk.push([performance.now(), z.P(), z.gliding().on ? 1 : 0]); if (window.__trk.length < 4000) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
      // 一根手指推不出三幕那么长：在页面里发触摸事件、跟着滚、松手后带一段惯性（各内核一样）
      const tRel = await swipe(page, vh * 4.3, { ms: 480, v0: 40, emu: true });
      const L = await landedAt(page, 0);
      const track = await page.evaluate(() => window.__trk);
      // 松手以后（惯性、自己走）P 只增不减（容 0.004 的抖）；落在「往前最近」那一个：不小于松手以后到过的最远处
      let back = 0, max = -1;
      for (const [t, p] of track) { if (p < 0) continue; if (t < tRel) { max = Math.max(max, p); continue; } if (p < max - 0.004) back++; max = Math.max(max, p); }
      const startGlide = track.find(([t, , g]) => t > tRel && g)?.[1] ?? null;
      const passedActs = REST.filter((p) => p > 1.88 + 0.01 && p <= (startGlide ?? max)).length;
      r.P = L.P; r.max = max; r.back = back; r.glideFrom = startGlide; r.passed = passedActs;
      r.ok = back === 0 && passedActs >= 3 && near(L.P, REST.find((p) => p >= (startGlide ?? max) - 0.0005) ?? 7);
      r.note = `松手后惯性停在 ${startGlide?.toFixed(3)}（滑过 ${passedActs} 个展示位置），落在 ${(+L.P).toFixed(4)}，往回走了 ${back} 帧`;
    } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
    log(r);
  }
  // 5. 刻度、「目录」、视口高中途改变
  if (ONLY.includes(5)) {
    const r = { name: '手机：点每个刻度、点「目录」都落在展示位置（≤ 0.01）；走到一半视口高 844 → 750 → 844 照样准', ok: false, each: [] };
    try {
      for (const k of [3, 7, 2, 6, 1, 5, 4]) {
        await page.tap(`[data-tick="${k}"]`);
        await page.waitForTimeout(150);
        await idle(page, 20000);
        const s = await st(page);
        r.each.push({ k, P: s.P, ok: near(s.P, REST[k - 1]) });
      }
      await page.tap('[data-index]');
      await page.waitForTimeout(150);
      await idle(page, 20000);
      const si = await st(page);
      r.each.push({ k: '目录', P: si.P, ok: near(si.P, 7) });
      await settleAt(page, 1.88);
      await page.tap('[data-tick="6"]');
      await page.waitForTimeout(500);
      await page.setViewportSize({ width: 390, height: 750 });
      await page.waitForTimeout(500);
      await page.setViewportSize({ width: 390, height: 844 });
      await idle(page, 20000);
      await page.waitForTimeout(400);
      const sv = await page.evaluate(() => ({ P: window.__zero.P(), y: scrollY, h: document.querySelector('[data-stage]').clientHeight, want: window.__zero.glide().u }));
      r.each.push({ k: '6（中途改视口）', P: +sv.P.toFixed(4), ok: near(sv.P, 5.88) });
      r.ok = r.each.every((x) => x.ok);
      r.note = r.each.map((x) => `${x.k}→${x.P}`).join('、');
    } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
    log(r);
  }
  // 6. 「进去」以后连滑、连点
  if (ONLY.includes(6)) {
    const r = { name: '手机：点「进去」以后连滑、连点 → 照样进栏目页；后退回来就在展示位置', ok: false };
    try {
      await settleAt(page, 3.88);
      await page.waitForFunction(() => document.querySelector('.act[data-act="4"]')?.classList.contains('on'), null, { timeout: 20000 });
      const nav = page.waitForURL((u) => new URL(u.href).pathname === '/specimens/', { timeout: 25000 });
      nav.catch(() => {});
      await page.tap('[data-go="4"]', { timeout: 15000 });
      const p0 = await page.evaluate(() => window.__zero.P());
      let moved = 0;
      for (let i = 0; i < 4; i++) {
        // 已经跳到栏目页的话，发触摸的那一下可能永远等不到回音（CDP 没有超时）：最多等 3 秒就往下走
        await Promise.race([swipe(page, (i % 2 ? -1 : 1) * vh * 0.4, { ms: 120 }), page.waitForTimeout(3000)]).catch(() => {});
        await page.tap('[data-tick="2"]', { timeout: 2000 }).catch(() => {});
        const p = await page.evaluate(() => window.__zero?.P?.() ?? null).catch(() => null);
        if (p != null && Math.abs(p - p0) > 0.002) moved++;
      }
      await nav;
      await page.waitForTimeout(800);
      await page.goBack({ waitUntil: 'load' });
      await ready(page).catch(() => {});
      await page.waitForTimeout(1500);
      const s = await page.evaluate(() => ({ P: window.__zero.P(), diving: document.documentElement.hasAttribute('data-diving'), flood: +getComputedStyle(document.querySelector('[data-flood]')).opacity, path: location.pathname }));
      r.back = s; r.moved = moved;
      r.ok = s.path === '/zero/' && near(s.P, 3.88) && !s.diving && s.flood < 0.02 && moved === 0;
      r.note = `进去途中进度动了 ${moved} 回；后退回来 P = ${s.P.toFixed(4)}、满屏颜色 ${s.flood}`;
    } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
    log(r);
  }
  page.errs.length && rows.push({ name: '手机页控制台', errors: [...new Set(page.errs)] });
  await page.context().close();
}

// ———————— 电脑 ————————
if (ONLY.some((n) => n >= 7)) {
  const page = await newPage('desk');
  const g2 = await open(page);
  if (!touchy) gl = g2;
  await page.mouse.move(720, 450);
  if (ONLY.includes(7)) {
    const r = { name: '电脑：滚轮一格往下 → 走到下一幕；连着滚三格 → 只走一幕，不连跳', ok: false };
    try {
      await settleAt(page, 2.88);
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(300);
      await idle(page, 20000);
      const a = await st(page);
      await page.mouse.wheel(0, 100); await page.waitForTimeout(60); await page.mouse.wheel(0, 100); await page.waitForTimeout(60); await page.mouse.wheel(0, 100);
      await page.waitForTimeout(300);
      await idle(page, 20000);
      const b = await st(page);
      r.one = a.P; r.three = b.P;
      r.ok = near(a.P, 3.88) && near(b.P, 4.88);
      r.note = `一格：2.88 → ${a.P}；连着三格：${a.P} → ${b.P}`;
    } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
    log(r);
  }
  if (ONLY.includes(8)) {
    const r = { name: '电脑：触控板惯性（连续小 delta 的 wheel）没完不接管，完了再走', ok: false };
    try {
      await settleAt(page, 3.88);
      // 真的触控板：手指一推，接着一串约 16 毫秒一个、越来越小的 wheel（Playwright 的 mouse.wheel 一下要等一帧来回，排不成 16 毫秒一串）——
      // 在页面里按真实的节奏发 wheel 事件、按 delta 滚（跟浏览器自己滚是一回事），看自己走有没有在惯性没完的时候接管
      const res = await page.evaluate(async () => {
        const seq = [24, 36, 34, 31, 28, 25, 22, 19, 17, 15, 13, 11, 9.5, 8, 6.5, 5.5, 4.5, 3.6, 2.8, 2.2, 1.6, 1.2, 1, 1, 1, 0.8, 0.6];
        const z = window.__zero;
        let took = 0, maxGap = 0, last = performance.now();
        for (const d of seq) {
          window.dispatchEvent(new WheelEvent('wheel', { deltaY: d, deltaMode: 0, bubbles: true }));
          window.scrollBy(0, d);
          if (z.gliding().on) took++;
          await new Promise((res) => setTimeout(res, 16));
          const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t;
        }
        return { took, maxGap: Math.round(maxGap), endGliding: z.gliding().on };
      });
      await page.waitForTimeout(300);
      await idle(page, 20000);
      const s = await st(page);
      r.takeoverDuring = res.took; r.maxGap = res.maxGap;
      r.ok = res.took === 0 && !res.endGliding && near(s.P, 4.88);
      r.note = `惯性那一串里接管了 ${res.took} 次（两下之间最长隔 ${res.maxGap} 毫秒）；完了以后落在 ${s.P}`;
    } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
    log(r);
  }
  if (ONLY.includes(9)) {
    const r = { name: '电脑：键盘 ↓ / PageUp / End / Home 都走到展示位置', ok: false, each: [] };
    try {
      await settleAt(page, 1.88);
      for (const [key, want] of [['ArrowDown', 2.88], [' ', 3.88], ['PageUp', 2.88], ['End', 7], ['ArrowUp', 5.88], ['Home', 1]]) {
        await page.keyboard.press(key === ' ' ? 'Space' : key);
        await page.waitForTimeout(200);
        await idle(page, 20000);
        const s = await st(page);
        r.each.push({ key, P: s.P, ok: near(s.P, want) });
      }
      r.ok = r.each.every((x) => x.ok);
      r.note = r.each.map((x) => `${x.key === ' ' ? '空格' : x.key}→${x.P}`).join('、');
    } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
    log(r);
  }
  if (ONLY.includes(10)) {
    const r = { name: '电脑：点「进去」以后连滚滚轮 → 照样进栏目页；后退回来就在展示位置', ok: false };
    try {
      await settleAt(page, 4.88);
      if (g2 === 'yes') await page.waitForFunction(() => document.querySelector('.act[data-act="5"]')?.classList.contains('on'), null, { timeout: 20000 });
      const nav = page.waitForURL((u) => new URL(u.href).pathname === '/artifacts/', { timeout: 25000 });
      nav.catch(() => {});
      await page.click('[data-go="5"]', { timeout: 15000 });
      const p0 = await page.evaluate(() => window.__zero.P());
      let moved = 0;
      for (let i = 0; i < 10; i++) {
        await Promise.race([page.mouse.wheel(0, i % 2 ? -120 : 240), page.waitForTimeout(3000)]).catch(() => {});
        await page.waitForTimeout(60);
        const p = await page.evaluate(() => window.__zero?.P?.() ?? null).catch(() => null);
        if (p != null && Math.abs(p - p0) > 0.002) moved++;
      }
      await nav;
      await page.waitForTimeout(800);
      await page.goBack({ waitUntil: 'load' });
      await ready(page).catch(() => {});
      await page.waitForTimeout(1500);
      const s = await page.evaluate(() => ({ P: window.__zero.P(), diving: document.documentElement.hasAttribute('data-diving'), flood: +getComputedStyle(document.querySelector('[data-flood]')).opacity, path: location.pathname }));
      r.back = s; r.moved = moved;
      r.ok = s.path === '/zero/' && near(s.P, 4.88) && !s.diving && s.flood < 0.02 && moved === 0;
      r.note = `进去途中进度动了 ${moved} 回；后退回来 P = ${s.P.toFixed(4)}`;
    } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
    log(r);
  }
  page.errs.length && rows.push({ name: '电脑页控制台', errors: [...new Set(page.errs)] });
  await page.context().close();
}

// ———————— 录屏（Chromium）：滑一下、停手、自己走完 ————————
if (ENGINE === 'chromium' && !process.env.NOVIDEO) {
  const dir = `${out}/录屏`;
  mkdirSync(dir, { recursive: true });
  for (const [kind, name] of [['phone', '390x844'], ['desk', '1440x900']]) {
    const page = await newPage(kind, { recordVideo: { dir, size: kind === 'phone' ? PHONE : { width: 960, height: 600 } } });
    try {
      await open(page, '', '0.6');   // 录屏：分辨率别压太低（看得清字），帧数照这台机器的实际
      await settleAt(page, 2.88);
      await page.waitForTimeout(1200);
      if (kind === 'phone') await swipe(page, 0.3 * 844, { ms: 260 });
      else { await page.mouse.move(720, 450); await page.mouse.wheel(0, 100); }
      await page.waitForTimeout(300);
      await idle(page, 20000);
      await page.waitForTimeout(1500);
      // 再推一下进「开天」：给足约 2 秒
      await settleAt(page, 5.88);
      await page.waitForTimeout(800);
      if (kind === 'phone') await swipe(page, 0.25 * 844, { ms: 240 });
      else await page.mouse.wheel(0, 100);
      await page.waitForTimeout(300);
      await idle(page, 20000);
      await page.waitForTimeout(3000);
    } catch (e) { rows.push({ name: `录屏 ${name}`, note: String(e).slice(0, 160) }); }
    const v = page.video();
    await page.context().close();
    if (v) { try { renameSync(await v.path(), `${dir}/滑一下停手自己走完-${name}.webm`); } catch { /* 留原名 */ } }
  }
}

// ———————— 帧数：自己走的那一段（聚字的那几秒）每秒多少帧 ————————
if (!process.env.NOFPS && gl === 'yes') {
  const page = await newPage(ENGINE === 'chromium' ? 'desk' : 'phone');
  try {
    await page.goto(`${BASE}/zero/${ENGINE === 'chromium' ? '?tier=low' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__zero && window.__zero.frames() >= 3 && document.documentElement.dataset.dust, null, { timeout: 240000 });
    await settleAt(page, 1.88);
    const f = await page.evaluate(async () => {
      const z = window.__zero;
      z.to(2.88, 'tick');
      const t0 = performance.now(); let n = 0; const dts = []; let last = t0;
      while (z.gliding().on && performance.now() - t0 < 15000) { await new Promise((r) => requestAnimationFrame(r)); const t = performance.now(); dts.push(t - last); last = t; n++; }
      const ms = performance.now() - t0;
      dts.sort((a, b) => a - b);
      return { frames: n, ms: Math.round(ms), fps: +(n / (ms / 1000)).toFixed(1), p50: Math.round(dts[Math.floor(dts.length / 2)] ?? 0), p95: Math.round(dts[Math.floor(dts.length * 0.95)] ?? 0), tier: z.tier(), dpr: z.dpr(), textDpr: z.textDpr?.() ?? null, cost: z.cost() };
    });
    rows.push({ name: `帧数（${ENGINE}，第二幕 → 第三幕自己走、栏目名聚出来的那 ${f.ms} 毫秒）`, ...f });
    console.log(`帧数：${ENGINE} ${f.fps} 帧/秒（中位 ${f.p50} 毫秒一帧，95% ${f.p95} 毫秒；档位 ${f.tier}，画面 ${f.dpr} 倍、字 ${f.textDpr} 倍）`);
  } catch (e) { rows.push({ name: '帧数', note: String(e).slice(0, 160) }); }
  await page.context().close();
}

await browser.close();
const errs = rows.flatMap((r) => r.errors || []);
writeFileSync(`${out}/v33-${ENGINE}.json`, JSON.stringify({ base: BASE, engine: ENGINE, gl, at: new Date().toISOString(), total: rows.filter((r) => 'ok' in r).length, failed: fails, consoleErrors: errs, rows }, null, 1));
console.log(fails.length ? `✗ 没过 ${fails.length} 项：${fails.join('；')}` : `✓ 全过（${rows.filter((r) => 'ok' in r).length} 项，${ENGINE}${gl === 'yes' ? '' : '，没有 WebGL'}）`);
if (errs.length) console.log('控制台报错：', [...new Set(errs)].slice(0, 6));
void readdirSync;
process.exit(fails.length || errs.length ? 1 : 0);
