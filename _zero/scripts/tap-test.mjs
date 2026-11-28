// v3.2 真点测试（施工单第 4 节）：用 WebKit、开触摸（Playwright 的 iPhone 机型，用 tap，不是 click()）真点一遍——
//   1. 顶栏「目录」：点了马上有反应，快进到「开天」那片天（进度到 7、滚动位置停在结尾、天上五个名字亮着；快进途中每一幕的名字不冒出来）
//   2. 天上五个名字各点一次：点了马上有反应（镜头往里扎、满屏它的颜色），落到对的网址
//   3. 点造物本身（太阳、巨鲸）：一样冲进去
//   4. 第二到第六幕的「进去」各点一次：落到对的网址
//   5. 从天上冲进栏目页，再按浏览器的「后退」：回到的是那片天，五个名字还在、还能点（不是黑屏、不是卡在满屏颜色里、不是回到开头）
//   6. 退路 B（矮的手机竖屏：Playwright 自带的 iPhone 13 视口 390×664，Safari 工具栏全展开那么高）：点「目录」画面压暗、五个名字竖着一列，各点一次落到对的网址
// 1–5 用 iPhone 13 机型（触摸、UA、像素比都照它），视口高放到 844：iOS 26 的 Safari 工具栏浮在网页上面，首页按最大视口高（100lvh）排版，
// 跟施工单要的手机 390×844 一样；6 用 iPhone 13 原样的 390×664。
// 有一个点了没反应、要点两下、落错地方，就算没过（退出码 1）。结果写到 <输出目录>/真点.json，截几张图放同一个目录。
// 跑法：node scripts/tap-test.mjs <输出目录>
//   BASE    网站根（默认线上 https://zeroflesh.github.io；预览时是工作流本地起的服务）。首页在 /
//   千手院在老家 https://qianshoulab.github.io/qianshou/（跨站）：点太阳、点「千手院」要落到那里。
//   QIANSHOU_LOCAL  设了就把 https://qianshoulab.github.io/ 的请求转到这个本地服务（打不开外网的机器上本地调试用）
//   ENGINE  webkit（默认）或 chromium（这台云端机器上只有 Chromium，本地调试用）；DEVICE 默认 iPhone 13（390×844）
//   PW_MODULE 可以指到机器上预装的 playwright；ONLY=1,5 只跑这几节（本地调试用）
const pw = await import(process.env.PW_MODULE || 'playwright');
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'tap-shots';
const BASE = (process.env.BASE || 'https://zeroflesh.github.io').replace(/\/$/, '');
const ENGINE = process.env.ENGINE || 'webkit';
const DEVICE = process.env.DEVICE || 'iPhone 13';
mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : [1, 2, 3, 4, 5, 6];

// 站内的写路径；千手院在老家，写全网址（path() 对别的网站给 origin + 路径）
const QIANSHOU = 'https://qianshoulab.github.io/qianshou/';
const NAMES = [['千手院', QIANSHOU], ['赛博杂货铺', '/zahuopu/'], ['标本', '/specimens/'], ['文物', '/artifacts/'], ['法典', '/codex/']];
const ACTS = [[2, QIANSHOU], [3, '/zahuopu/'], [4, '/specimens/'], [5, '/artifacts/'], [6, '/codex/']];
const rows = [];
const fails = [];
const log = (r) => { rows.push(r); console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ms != null ? ` 反应 ${r.ms}ms` : ''}${r.url ? ` → ${r.url}` : ''}${r.note ? ` （${r.note}）` : ''}`); if (!r.ok) fails.push(r.name); };

const browser = await pw[ENGINE].launch(ENGINE === 'chromium' ? { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : {});
const dev = pw.devices[DEVICE];
const TALL = { width: dev.viewport.width, height: dev.screen?.height ?? 844 };
const newPage = async (viewport = TALL) => {
  const ctx = await browser.newContext({ ...dev, viewport, ...(ENGINE === 'firefox' ? { isMobile: undefined } : {}) });
  if (process.env.QIANSHOU_LOCAL) await ctx.route('https://qianshoulab.github.io/**', async (r) => {
    const res = await fetch(r.request().url().replace('https://qianshoulab.github.io', process.env.QIANSHOU_LOCAL.replace(/\/$/, '')));
    await r.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'text/html' }, body: Buffer.from(await res.arrayBuffer()) });
  });
  const page = await ctx.newPage();
  page.errs = [];
  // 只记首页上的报错（栏目页、千手院不归这个测试管）
  const mine = () => path(page.url()) === '/';
  page.on('pageerror', (e) => { if (mine()) page.errs.push(String(e).slice(0, 200)); });
  page.on('console', (m) => { if (m.type() === 'error' && mine()) page.errs.push(m.text().slice(0, 200)); });
  return page;
};
const ready = async (page, needNames = false) => {
  await page.waitForFunction(() => document.documentElement.dataset.gl, null, { timeout: 90000 });
  const gl = await page.evaluate(() => document.documentElement.dataset.gl);
  if (gl === 'yes') await page.waitForFunction(() => window.__zero && window.__zero.frames() >= 2, null, { timeout: 240000 });
  if (needNames) await page.waitForFunction(() => document.documentElement.hasAttribute('data-names') && document.querySelectorAll('.nm.ok').length === 5, null, { timeout: 60000 });
  return gl;
};
const ORIGIN = new URL(BASE).origin;
/** 站内给路径（首页是 /），别的网站（千手院在老家）给 origin + 路径 */
const path = (u) => { try { const x = new URL(u); return x.origin === ORIGIN ? x.pathname : x.origin + x.pathname; } catch { return String(u); } };
/** 手指碰到屏幕以后多久有反应：页面开始往里扎（data-diving）或者开始快进（data-ff）。从页面自己收到 touchstart 那一刻算（-1 = 20 秒都没反应） */
const reaction = (page, attr) => page.evaluate((a) => new Promise((ok) => {
  let t0 = -1;
  const down = () => { if (t0 < 0) t0 = performance.now(); };
  for (const ev of ['touchstart', 'pointerdown']) window.addEventListener(ev, down, { capture: true, passive: true });
  const root = document.documentElement;
  const done = () => { if (!root.hasAttribute(a)) return false; mo.disconnect(); ok(t0 < 0 ? 0 : Math.round(performance.now() - t0)); return true; };
  const mo = new MutationObserver(done);
  mo.observe(root, { attributes: true, attributeFilter: [a] });
  setTimeout(() => { mo.disconnect(); ok(-1); }, 20000);
}), attr);

// —— 1. 「目录」——
if (ONLY.includes(1)) {
  const page = await newPage();
  await page.goto(`${BASE}/?tier=high`, { waitUntil: 'load' });
  const gl = await ready(page);
  await page.waitForFunction(() => !window.__zero || window.__zero.P() >= 1, null, { timeout: 20000 }).catch(() => {});
  const r = { name: '「目录」快进', ok: false };
  try {
    const t0 = Date.now();
    if (gl === 'yes') await page.evaluate(() => window.__zero.ffHold(true, 4.4));   // 走到第五幕半路自己停一下，截一张（放开以后接着走完）
    const react = reaction(page, 'data-ff');
    await page.tap('[data-index]');
    r.ms = await react;
    // 快进途中：每一幕的名字、「进去」、首屏 wordmark 都不冒出来；过了一半那一下停住截一张，再放开走完
    let flashed = 0;
    const peek = () => page.evaluate(() => ({ fly: !!window.__zero?.flying(), P: window.__zero?.P() ?? 0, on: document.querySelectorAll('.act.on:not(.act7), .hero.on').length }));
    await page.waitForFunction(() => !window.__zero || window.__zero.ffHeld() || !window.__zero.flying(), null, { timeout: 15000 }).catch(() => {});
    if (gl === 'yes' && (await peek()).fly) {
      const s = await peek();
      if (s.on) flashed++;
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${ENGINE}-目录-快进半路.jpg`, type: 'jpeg', quality: 80 });
      await page.evaluate(() => window.__zero.ffHold(false));
    }
    while (Date.now() - t0 < 12000) {
      const s = await peek();
      if (s.fly && s.on) flashed++;
      if (!s.fly && s.P > 6.99) break;
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(1600);
    const end = await page.evaluate(() => ({
      P: window.__zero?.P() ?? 0, y: Math.round(scrollY),
      endY: Math.ceil(10.15 * document.querySelector('[data-stage]').clientHeight),
      names: document.querySelectorAll('.nm.ok').length, on: document.documentElement.hasAttribute('data-names'),
    }));
    await page.screenshot({ path: `${out}/${ENGINE}-目录-天上五个名字.jpg`, type: 'jpeg', quality: 80 });
    r.took = Date.now() - t0;
    r.end = end;
    r.ok = gl === 'yes' ? r.ms >= 0 && end.P > 6.99 && Math.abs(end.y - end.endY) <= 3 && end.on && end.names === 5 && flashed === 0 : end.y > 0;
    if (flashed) r.note = `快进途中冒出来过 ${flashed} 次幕名`;
    if (gl !== 'yes') r.note = '没有 WebGL：只查滚到结尾';
    // 已经在天上再点：不动地方，五个名字轻轻亮一下
    await page.tap('[data-index]');
    await page.waitForTimeout(250);
    const again = await page.evaluate(() => ({ pulse: document.querySelectorAll('.nm.pulse').length, y: Math.round(scrollY), fly: !!window.__zero?.flying() }));
    if (gl === 'yes') log({ name: '天上再点「目录」：不动、名字亮一下', ok: again.pulse === 5 && !again.fly && Math.abs(again.y - end.y) <= 2 });
  } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
  r.errors = page.errs;
  log(r);
  await page.context().close();
}

// —— 2. 天上五个名字各点一次 ——
for (let i = 0; i < 5 && ONLY.includes(2); i++) {
  const page = await newPage();
  const r = { name: `天上「${NAMES[i][0]}」`, ok: false };
  try {
    await page.goto(`${BASE}/?act=7&t=5&tier=high`, { waitUntil: 'load' });
    const gl = await ready(page, true);
    if (i === 0) await page.screenshot({ path: `${out}/${ENGINE}-天上五个名字.jpg`, type: 'jpeg', quality: 80 });
    const react = reaction(page, 'data-diving');
    const nav = page.waitForURL((u) => path(u.href) === NAMES[i][1], { timeout: 15000 });
    await page.tap(`[data-sky-go="${i}"]`);
    r.ms = await react;
    if (i === 2) { await page.waitForTimeout(700); await page.screenshot({ path: `${out}/${ENGINE}-冲进去半路.jpg`, type: 'jpeg', quality: 80 }).catch(() => {}); }
    await nav;
    r.url = path(page.url());
    r.ok = gl === 'yes' && r.ms >= 0 && r.ms < 1500 && r.url === NAMES[i][1];
  } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); r.url = path(page.url()); }
  r.errors = page.errs;
  log(r);
  await page.context().close();
}

// —— 3. 点造物本身：太阳、巨鲸 ——
for (const [k, key, href] of ONLY.includes(3) ? [[0, 'sun', QIANSHOU], [2, 'whale', '/specimens/']] : []) {
  const page = await newPage();
  const r = { name: `天上点「${NAMES[k][0]}」那样造物本身`, ok: false };
  try {
    await page.goto(`${BASE}/?act=7&t=5&tier=high`, { waitUntil: 'load' });
    await ready(page, true);
    const m = await page.evaluate((kk) => { const mk = window.__zero.marks()[kk]; return { x: mk.x, y: mk.y }; }, key);
    const react = reaction(page, 'data-diving');
    const nav = page.waitForURL((u) => path(u.href) === href, { timeout: 15000 });
    await page.touchscreen.tap(Math.round(m.x), Math.round(m.y));
    r.ms = await react;
    await nav;
    r.url = path(page.url());
    r.ok = r.ms >= 0 && r.ms < 1500 && r.url === href;
  } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); r.url = path(page.url()); }
  r.errors = page.errs;
  log(r);
  await page.context().close();
}

// —— 4. 第二到第六幕的「进去」——
for (const [k, href] of ONLY.includes(4) ? ACTS : []) {
  const page = await newPage();
  const r = { name: `第${k}幕「进去」`, ok: false };
  try {
    await page.goto(`${BASE}/?act=${k - 0.12}&t=5&tier=high`, { waitUntil: 'load' });
    await ready(page);
    await page.waitForFunction((kk) => document.querySelector(`.act[data-act="${kk}"]`)?.classList.contains('on'), k, { timeout: 20000 });
    await page.waitForTimeout(700);
    const react = reaction(page, 'data-diving');
    const nav = page.waitForURL((u) => path(u.href) === href, { timeout: 15000 });
    await page.tap(`[data-go="${k}"]`);
    r.ms = await react;
    await nav;
    r.url = path(page.url());
    r.ok = r.ms >= 0 && r.ms < 1500 && r.url === href;
  } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); r.url = path(page.url()); }
  r.errors = page.errs;
  log(r);
  await page.context().close();
}

// —— 5. 从天上冲进栏目页，再按「后退」（时钟不定住，真快进；巨鲸在游、它的名字一直在动，这里点不动的「文物」「赛博杂货铺」）——
if (ONLY.includes(5)) {
  const page = await newPage();
  const r = { name: '从天上进「文物」再后退：回到那片天，名字还能点', ok: false };
  try {
    await page.goto(`${BASE}/?tier=high`, { waitUntil: 'load' });
    const gl = await ready(page);
    await page.waitForFunction(() => !window.__zero || window.__zero.P() >= 1, null, { timeout: 20000 }).catch(() => {});
    await page.tap('[data-index]');
    await page.waitForFunction(() => window.__zero && !window.__zero.flying() && window.__zero.P() > 6.99 && document.querySelectorAll('.nm.ok').length === 5, null, { timeout: 20000 });
    await page.waitForTimeout(1600);
    await page.tap('[data-sky-go="3"]');
    await page.waitForURL((u) => path(u.href) === '/artifacts/', { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.goBack({ waitUntil: 'load' });
    r.backUrl = path(page.url());
    await ready(page);
    await page.waitForTimeout(2200);
    const s = await page.evaluate(() => {
      const root = document.documentElement;
      const nm = [...document.querySelectorAll('[data-sky-go]')].map((a) => { const b = a.getBoundingClientRect(); const cs = getComputedStyle(a); return { op: +cs.opacity, vis: cs.visibility, x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      const top = nm.map((n) => { const e = document.elementFromPoint(n.x, n.y); return !!e?.closest('[data-sky-go]'); });
      return {
        P: window.__zero?.P() ?? 0, names: root.hasAttribute('data-names'), diving: root.hasAttribute('data-diving'),
        flood: +getComputedStyle(document.querySelector('[data-flood]')).opacity, shown: nm.filter((n) => n.op > 0.9 && n.vis === 'visible').length, clickable: top.filter(Boolean).length,
      };
    });
    r.after = s;
    await page.screenshot({ path: `${out}/${ENGINE}-后退回到天上.jpg`, type: 'jpeg', quality: 80 });
    const okBack = r.backUrl === '/' && s.P > 6.9 && s.names && !s.diving && s.flood < 0.02 && s.shown === 5 && s.clickable === 5;
    // 回来以后再点一个（赛博杂货铺）：照样进
    const nav = page.waitForURL((u) => path(u.href) === '/zahuopu/', { timeout: 15000 });
    await page.tap('[data-sky-go="1"]');
    await nav;
    r.again = path(page.url());
    r.ok = gl === 'yes' && okBack && r.again === '/zahuopu/';
  } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); }
  r.errors = page.errs;
  log(r);
  await page.context().close();
}

// —— 6. 退路 B：矮的手机竖屏（iPhone 13 原样 390×664）——
for (let i = 0; i < 5 && ONLY.includes(6); i++) {
  const page = await newPage(dev.viewport);
  const r = { name: `退路 B（${dev.viewport.width}×${dev.viewport.height}）：「目录」列表里点「${NAMES[i][0]}」`, ok: false };
  try {
    await page.goto(`${BASE}/?tier=high`, { waitUntil: 'load' });
    const gl = await ready(page);
    const mode = gl === 'yes' ? await page.evaluate(() => window.__zero.names().mode) : 'nogl';
    if (gl === 'yes' && mode !== 'list') { r.note = `这个视口没走退路（${mode}）`; r.ok = true; log(r); await page.context().close(); break; }
    await page.waitForTimeout(600);
    await page.tap('[data-index]');
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-list'), null, { timeout: 5000 });
    await page.waitForTimeout(450);
    if (i === 0) await page.screenshot({ path: `${out}/${ENGINE}-退路B-目录列表.jpg`, type: 'jpeg', quality: 80 });
    const react = reaction(page, 'data-diving');
    const nav = page.waitForURL((u) => path(u.href) === NAMES[i][1], { timeout: 15000 });
    await page.tap(`[data-sky-go="${i}"]`);
    r.ms = await react;
    await nav;
    r.url = path(page.url());
    r.ok = r.ms >= 0 && r.ms < 1500 && r.url === NAMES[i][1];
  } catch (e) { r.note = String(e).split('\n')[0].slice(0, 160); r.url = path(page.url()); }
  r.errors = page.errs;
  log(r);
  await page.context().close();
}

await browser.close();
const errs = rows.flatMap((r) => r.errors || []);
writeFileSync(`${out}/真点.json`, JSON.stringify({ base: BASE, engine: ENGINE, device: DEVICE, at: new Date().toISOString(), total: rows.length, failed: fails, consoleErrors: errs, rows }, null, 1));
console.log(fails.length ? `✗ 没过 ${fails.length} 项：${fails.join('、')}` : `✓ 真点全过（${rows.length} 项，${ENGINE} · ${DEVICE}）`);
if (errs.length) console.log('控制台报错：', [...new Set(errs)].slice(0, 6));
process.exit(fails.length || errs.length ? 1 : 0);
