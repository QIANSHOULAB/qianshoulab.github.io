// 线上验收（工作流 zero.yml 的 live 那一步跑，Chromium）：Pages 发完以后，对着真网址查——
//  1. 新家 https://zeroflesh.github.io ：首页在 /，四个栏目页、子页、/zhahuopu/ 全 200；/zero/ 在新家不要了（不许 200）；
//     首页的 canonical、og:url 是新网址；
//  2. 新家的页面：电脑 1280、手机 390 各开一遍，不许有控制台报错、不许横向溢出；
//  3. 千手院那一下：首页点「目录」飞到天上，点「千手院」，落到老家 https://qianshoulab.github.io/qianshou/ ；按「后退」回到新家那片天；
//  4. 老家 https://qianshoulab.github.io ：千手院 /qianshou/、每个工具的文件夹、别的仓库挂在下面的工具照旧 200、不跳；
//     千手院两套皮各开一遍，站内链接都通；
//  5. 老网址怎么跳：老家根目录 /、/zero/、四个栏目页和子页、/zhahuopu/ 各开一次，都要落到新家对应的页（带着 ? 和 #）。
//     老家还没换成跳转页（老家根目录还是零肉身造物首页，搬家头一步）时这一节只记不卡；换了以后一条不对就红。
// 截图、结果放 SHOTS（默认 live-shots/），传成工作流附件。有一条不过就让工作流变红。
// 跑法：node scripts/live-check.mjs   PW_MODULE（别的 playwright）
//   ROUTE=https://zeroflesh.github.io=http://127.0.0.1:4321,https://qianshoulab.github.io=http://127.0.0.1:4322
//         打不开外网的机器上本地调试：网址照真的写，请求（浏览器和脚本自己的 fetch）转到本地摆的两个站。
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';

const ZERO = 'https://zeroflesh.github.io';
const OLD = 'https://qianshoulab.github.io';
const TEMPLE = `${OLD}/qianshou/`;   // 太阳、「千手院」指的地方（新家 src/data/sites.ts 的 QIANSHOU）
const ROUTES = (process.env.ROUTE || '').split(',').filter(Boolean).map((x) => { const i = x.indexOf('=', 8); return [x.slice(0, i).replace(/\/$/, ''), x.slice(i + 1).replace(/\/$/, '')]; });
const local = (u) => { for (const [a, b] of ROUTES) if (u.startsWith(a)) return b + u.slice(a.length); return u; };
const newCtx = async (opts) => {
  const ctx = await browser.newContext(opts);
  for (const [a] of ROUTES) await ctx.route(a + '/**', async (r) => {
    const res = await fetch(local(r.request().url()), { redirect: 'manual' });
    const headers = {}; for (const k of ['content-type', 'location']) { const v = res.headers.get(k); if (v) headers[k] = v; }
    await r.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
  });
  return ctx;
};
const OUT = process.env.SHOTS || 'live-shots';
mkdirSync(OUT, { recursive: true });

// 新家的页面（首页在 /）
const PAGES = ['/', '/zahuopu/', '/specimens/', '/specimens/001-cinderfall-arena/', '/artifacts/', '/codex/', '/codex/web-audio-formulas/'];
// 老家留着的：千手院、本仓库每个工具的文件夹、别的仓库挂在 qianshoulab.github.io 下面的工具（luruseng、pabiao、xibiao、gongshi、qianye）
const OLD_STAY = [
  '/qianshou/', '/qianshou/scene-a.js', '/qianshou/scene-b.js', '/apps.json',
  '/yijing/', '/chaojing/', '/zhike/', '/saodi/', '/huayuan/', '/xunshan/', '/daibi/', '/baozuseng/', '/tiexie/', '/xiaobai/', '/privacy/',
  '/luruseng/', '/pabiao/', '/xibiao/', '/gongshi/', '/gongshi/inch/', '/gongshi/tp/', '/qianye/',
];
const PROBE = ['/gongshi/count/'];   // 铁件点钞机网页：交接里说还在草稿分支，只报不卡
// 老网址 → 新家哪一页（/zero/ 跳到新家的 /；/zhahuopu/ 是老名字，新家再跳一次到 /zahuopu/）
const MOVED = [
  ['/', '/'], ['/zero/', '/'], ['/zahuopu/', '/zahuopu/'], ['/zhahuopu/', '/zahuopu/'],
  ['/specimens/', '/specimens/'], ['/specimens/001-cinderfall-arena/', '/specimens/001-cinderfall-arena/'],
  ['/artifacts/', '/artifacts/'], ['/codex/', '/codex/'], ['/codex/web-audio-formulas/', '/codex/web-audio-formulas/'],
  ['/zero/?lang=zh#sky', '/?lang=zh#sky'], ['/specimens/001-cinderfall-arena/?lang=zh#top', '/specimens/001-cinderfall-arena/?lang=zh#top'],
];

const lines = [];
const fail = [];
const res = { zero: ZERO, old: OLD, at: new Date().toISOString(), pages: [], render: [], temple: null, stay: [], moved: [], oldSwitched: null, fails: fail };
const log = (s) => { console.log(s); lines.push(s); };
const bust = (p) => { const [a, h = ''] = p.split('#'); return a + (a.includes('?') ? '&' : '?') + 'v=' + Date.now() + (h ? '#' + h : ''); };

async function get(url, redirect = 'follow') {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(local(url), { redirect });
      return { status: r.status, url: r.url, text: await r.text() };
    } catch { await new Promise((ok) => setTimeout(ok, 2000)); }
  }
  return { status: 0, url, text: '' };
}
const attr = (html, re) => (re.exec(html) || [])[1] || '';

// —— 1. 新家 ——
log(`## 新家 ${ZERO}`);
log('| 网址 | 状态 | 备注 |');
log('|---|---|---|');
for (const p of [...PAGES, '/zhahuopu/']) {
  const r = await get(ZERO + bust(p));
  let note = '';
  if (p === '/') {
    const canon = attr(r.text, /<link rel="canonical" href="([^"]*)"/);
    const og = attr(r.text, /<meta property="og:url" content="([^"]*)"/);
    const build = attr(r.text, /<meta name="zero:build" content="([^"]*)"/);
    note = `canonical ${canon}，og:url ${og}，构建 ${build.slice(0, 7)}`;
    if (canon !== ZERO + '/' || og !== ZERO + '/') fail.push(`新家首页 canonical / og:url 不是 ${ZERO}/（${canon} / ${og}）`);
    if (!build) fail.push('新家首页不是零肉身造物首页（没有 zero:build）');
  }
  log(`| ${p} | ${r.status} | ${note} |`);
  res.pages.push({ path: p, status: r.status, note });
  if (r.status !== 200) fail.push(`新家 ${p} → ${r.status}`);
}
{
  const r = await get(ZERO + '/zero/?v=' + Date.now());
  log(`| /zero/（新家不要了） | ${r.status} | ${r.status === 404 ? '没有，对' : '还在'} |`);
  res.pages.push({ path: '/zero/', status: r.status });
  if (r.status === 200) fail.push('新家 /zero/ 还在（单子：/zero/ 在新家不要了）');
}

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// —— 2. 新家的页面：报错、横向溢出 ——
log('\n## 新家的页面（1280、390）');
log('| 页面 | 宽 | 3D | 报错 | 横向 |');
log('|---|---|---|---|---|');
for (const w of [1280, 390]) {
  const ctx = await newCtx({ viewport: { width: w, height: w < 600 ? 844 : 800 }, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600 });
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(ZERO + bust(p), { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(p === '/' ? 6000 : 1500);
    const gl = await page.evaluate(() => document.documentElement.getAttribute('data-gl') || '–');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const name = (p.replace(/\//g, '_').replace(/^_|_$/g, '') || 'home') + `-${w}`;
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: p !== '/' });
    log(`| ${p} | ${w} | ${gl} | ${errs.length} | ${sw > w ? `溢出 ${sw}px` : '没有'} |`);
    res.render.push({ path: p, w, gl, errs: errs.slice(0, 3), scrollWidth: sw });
    if (sw > w) fail.push(`${p}@${w}: 横向溢出 ${sw}px`);
    if (errs.length) fail.push(`${p}@${w}: 控制台报错 ${errs.slice(0, 2).join(' | ')}`);
    await page.close();
  }
  await ctx.close();
}

// —— 3. 千手院那一下：首页点「目录」飞到天上 → 点天上的「千手院」→ 老家千手院 → 后退回到新家那片天 ——
log('\n## 千手院那一下（首页点「目录」到天上，点「千手院」，再按后退）');
{
  const ctx = await newCtx({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const r = { ok: false };
  try {
    await page.goto(`${ZERO}/?tier=low&dpr=0.5`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => document.documentElement.dataset.gl, null, { timeout: 90000 });
    r.gl = await page.evaluate(() => document.documentElement.dataset.gl);
    let sel = '[data-end-go="0"]';   // 没有 3D：页尾那一排名字
    if (r.gl === 'yes') {
      await page.waitForFunction(() => window.__zero && window.__zero.frames() >= 2, null, { timeout: 240000 });
      await page.click('[data-index]');
      await page.waitForFunction(() => window.__zero.P() > 6.99 && document.querySelectorAll('.nm.ok').length === 5, null, { timeout: 120000 });
      sel = '[data-sky-go="0"]';
    } else {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    }
    r.href = await page.getAttribute(sel, 'href');
    await Promise.all([page.waitForURL((u) => u.href.startsWith(TEMPLE), { timeout: 60000 }), page.click(sel, { force: true })]);
    r.landed = page.url();
    await page.waitForLoadState('load');
    r.templeCards = await page.evaluate(() => document.querySelectorAll('.rail .monk').length).catch(() => -1);
    await page.goBack({ waitUntil: 'load', timeout: 60000 });
    r.back = page.url();
    if (r.gl === 'yes') {
      await page.waitForFunction(() => window.__zero && window.__zero.frames() >= 2 && window.__zero.P() > 6.9, null, { timeout: 120000 }).catch(() => {});
      r.backP = await page.evaluate(() => (window.__zero ? Math.round(window.__zero.P() * 1000) / 1000 : null));
      r.backNames = await page.evaluate(() => document.querySelectorAll('.nm.ok').length);
    }
    const u = new URL(r.back);
    const okBack = u.origin === ZERO && u.pathname === '/' && (r.gl !== 'yes' || r.backP > 6.9);
    r.ok = r.href === TEMPLE && r.landed.startsWith(TEMPLE) && okBack;
  } catch (e) { r.note = String(e).split('\n')[0].slice(0, 200); }
  log(`- 链接 ${r.href}；落到 ${r.landed}（罗汉卡 ${r.templeCards}）；后退回到 ${r.back}${r.gl === 'yes' ? `，进度 ${r.backP}、天上名字 ${r.backNames} 个` : '（没有 3D）'}${r.note ? `；${r.note}` : ''} → ${r.ok ? '✓' : '✗'}`);
  res.temple = r;
  if (!r.ok) fail.push('天上点「千手院」没落到老家千手院，或者后退没回到新家那片天');
  await ctx.close();
}

// —— 4. 老家留着的：照旧 200、不跳 ——
log(`\n## 老家 ${OLD} 留着的（照旧 200、不跳）`);
log('| 网址 | 状态 | 跳没跳 |');
log('|---|---|---|');
for (const p of OLD_STAY) {
  const r = await get(OLD + bust(p), 'manual');
  const refresh = /http-equiv="refresh"/i.test(r.text) && /zeroflesh\.github\.io/.test(r.text);
  log(`| ${p} | ${r.status} | ${refresh ? '跳了' : '没跳'} |`);
  res.stay.push({ path: p, status: r.status, refresh });
  if (r.status !== 200) fail.push(`老家 ${p} → ${r.status}`);
  if (refresh) fail.push(`老家 ${p} 不该跳，却是一张跳到新家的页`);
}
for (const p of PROBE) log(`| ${p}（只报不卡） | ${(await get(OLD + bust(p), 'manual')).status} | |`);
{
  const ctx = await newCtx({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const linkSet = new Set();
  for (const skin of ['a', 'b']) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(`${OLD}/qianshou/?${skin}&v=${Date.now()}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => ({
      url: location.href,
      skin: document.documentElement.getAttribute('data-skin'),
      cards: document.querySelectorAll('.rail .monk').length,
      gl: !document.body.classList.contains('no-gl'),
      links: Array.from(document.querySelectorAll('a[href^="/"]')).map((a) => a.getAttribute('href')),
    }));
    info.links.forEach((l) => linkSet.add(l));
    await page.screenshot({ path: `${OUT}/qianshou-${skin}-1280.png`, fullPage: true });
    log(`- 千手院皮 ${skin}：还在 ${new URL(info.url).origin + new URL(info.url).pathname}，data-skin=${info.skin}，罗汉卡 ${info.cards} 张，3D ${info.gl ? '在画' : '没起来'}，站内链接 ${info.links.length} 个，报错 ${errs.length}`);
    if (!info.url.startsWith(`${OLD}/qianshou/`)) fail.push(`老家 /qianshou/?${skin} 跳走了（${info.url}）`);
    if (info.skin !== skin) fail.push(`/qianshou/?${skin} 没换到 ${skin} 皮`);
    if (info.cards !== 10) fail.push(`/qianshou/?${skin} 罗汉卡 ${info.cards} 张（应该 10 张）`);
    if (errs.length) fail.push(`/qianshou/?${skin}: 报错 ${errs[0]}`);
    await page.close();
  }
  for (const l of linkSet) {
    const { status } = await get(OLD + bust(l));
    log(`  - ${l} → ${status}`);
    if (status !== 200) fail.push(`/qianshou/ 上的链接 ${l} → ${status}`);
  }
  await ctx.close();
}

// —— 5. 老网址怎么跳 ——
log(`\n## 老网址 → 新家`);
const oldRoot = await get(OLD + '/?v=' + Date.now());
res.oldSwitched = !/name="zero:build"/.test(oldRoot.text);
if (!res.oldSwitched) log('- 老家根目录还是零肉身造物首页：还没换成跳转页（搬家头一步）。下面只记不卡。');
log('| 老网址 | 落到 | 对不对 |');
log('|---|---|---|');
{
  const ctx = await newCtx({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  for (const [from, to] of MOVED) {
    const page = await ctx.newPage();
    let landed = '';
    try {
      await page.goto(OLD + from, { waitUntil: 'load', timeout: 60000 });
      await page.waitForURL((u) => u.href.startsWith(ZERO), { timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('load').catch(() => {});
      landed = page.url();
    } catch (e) { landed = '打不开：' + String(e).split('\n')[0].slice(0, 120); }
    const want = ZERO + to;
    const ok = landed === want;
    log(`| ${from} | ${landed} | ${ok ? '✓' : `✗（应该 ${want}）`} |`);
    res.moved.push({ from, to: want, landed, ok });
    if (!ok && res.oldSwitched) fail.push(`老网址 ${from} 落到 ${landed}（应该 ${want}）`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();

log(fail.length ? `\n## ✗ 没过（${fail.length}）\n` + fail.map((x) => `- ${x}`).join('\n') : '\n## ✓ 全过');
writeFileSync(`${OUT}/live-check.md`, lines.join('\n'));
writeFileSync(`${OUT}/live-check.json`, JSON.stringify(res, null, 1));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
process.exit(fail.length ? 1 : 0);
