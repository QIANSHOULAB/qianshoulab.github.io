// 线上验收（工作流 zero.yml 的 live 那一步跑）：Pages 发完以后，对着真网址查四件事——
//  1. 老网址一个不少：每个工具的文件夹、别的仓库挂在下面的工具、千手院的家，全要 200；
//  2. 根目录 / 还是该是的那个：HOME_AT_ROOT = false 时必须还是千手院（不许被零肉身造物盖掉），true 时是零肉身造物首页；
//  3. 零肉身造物的页面：电脑 1280、手机 390 各开一遍，不许有控制台报错、不许横向溢出；
//  4. 千手院 /qianshou/ 两套皮都开一遍，页面上每个站内链接都要通。
// 截图放 live-shots/，传成工作流附件。有一条不过就让工作流变红。
import { chromium } from 'playwright';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { HOME_AT_ROOT } from '../home.mjs';

const BASE = process.env.LIVE_BASE || 'https://qianshoulab.github.io';
const OUT = process.env.SHOTS || 'live-shots';
mkdirSync(OUT, { recursive: true });

// 本仓库里每个工具的文件夹 + 别的仓库挂在 qianshoulab.github.io 下面的工具（luruseng、pabiao、xibiao、gongshi、qianye）
const MUST_200 = [
  '/', '/zero/', '/qianshou/', '/zahuopu/', '/zhahuopu/', '/specimens/', '/specimens/001-cinderfall-arena/', '/artifacts/', '/codex/', '/codex/web-audio-formulas/',
  '/yijing/', '/chaojing/', '/zhike/', '/saodi/', '/huayuan/', '/xunshan/', '/daibi/', '/baozuseng/', '/tiexie/', '/xiaobai/', '/privacy/',
  '/apps.json', '/qianshou/scene-a.js', '/qianshou/scene-b.js',
  '/luruseng/', '/pabiao/', '/xibiao/', '/gongshi/', '/gongshi/inch/', '/gongshi/tp/', '/qianye/',
];
const PROBE = ['/gongshi/count/'];   // 铁件点钞机网页：交接里说还在草稿分支，只报不卡
const ZERO = ['/zero/', '/zahuopu/', '/specimens/', '/specimens/001-cinderfall-arena/', '/artifacts/', '/codex/', '/codex/web-audio-formulas/'];

const lines = [];
const fail = [];
const log = (s) => { console.log(s); lines.push(s); };
const bust = (p) => p + (p.includes('?') ? '&' : '?') + 'v=' + Date.now();

async function get(path) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(BASE + bust(path), { redirect: 'follow' });
      return { status: r.status, text: await r.text() };
    } catch { await new Promise((ok) => setTimeout(ok, 2000)); }
  }
  return { status: 0, text: '' };
}

log('## 老网址');
log('| 网址 | 状态 |');
log('|---|---|');
for (const p of MUST_200) {
  const { status } = await get(p);
  log(`| ${p} | ${status} |`);
  if (status !== 200) fail.push(`${p} → ${status}`);
}
for (const p of PROBE) log(`| ${p}（只报不卡） | ${(await get(p)).status} |`);

log('\n## 根目录');
const root = await get('/');
const rootIsZero = /name="zero:build"/.test(root.text);
const rootIsTemple = /QIANSHOU LAB/.test(root.text) && !rootIsZero;
log(`- HOME_AT_ROOT = ${HOME_AT_ROOT}；根目录现在是 ${rootIsZero ? '零肉身造物首页' : rootIsTemple ? '千手院' : '认不出来'}`);
if (!HOME_AT_ROOT && !rootIsTemple) fail.push('根目录不是千手院了（HOME_AT_ROOT 是 false，不该被盖）');
if (HOME_AT_ROOT && !rootIsZero) fail.push('HOME_AT_ROOT 是 true，根目录却不是零肉身造物首页');

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
log('\n## 零肉身造物页面');
log('| 页面 | 宽 | 3D | 报错 | 横向 |');
log('|---|---|---|---|---|');
for (const w of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 800 }, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600 });
  for (const p of ZERO) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(BASE + bust(p), { waitUntil: 'networkidle' });
    await page.waitForTimeout(p === '/zero/' ? 6000 : 1500);
    const gl = await page.evaluate(() => document.documentElement.getAttribute('data-gl') || '–');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const name = (p.replace(/\//g, '_').replace(/^_|_$/g, '') || 'home') + `-${w}`;
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: p !== '/zero/' });
    log(`| ${p} | ${w} | ${gl} | ${errs.length} | ${sw > w ? `溢出 ${sw}px` : '没有'} |`);
    if (sw > w) fail.push(`${p}@${w}: 横向溢出 ${sw}px`);
    if (errs.length) fail.push(`${p}@${w}: 控制台报错 ${errs.slice(0, 2).join(' | ')}`);
    await page.close();
  }
  await ctx.close();
}

log('\n## 千手院 /qianshou/ 两套皮');
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const linkSet = new Set();
for (const skin of ['a', 'b']) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/qianshou/?${skin}&v=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => ({
    skin: document.documentElement.getAttribute('data-skin'),
    cards: document.querySelectorAll('.rail .monk').length,
    gl: !document.body.classList.contains('no-gl'),
    links: Array.from(document.querySelectorAll('a[href^="/"]')).map((a) => a.getAttribute('href')),
  }));
  info.links.forEach((l) => linkSet.add(l));
  await page.screenshot({ path: `${OUT}/qianshou-${skin}-1280.png`, fullPage: true });
  log(`- 皮 ${skin}：data-skin=${info.skin}，罗汉卡 ${info.cards} 张，3D ${info.gl ? '在画' : '没起来'}，站内链接 ${info.links.length} 个，报错 ${errs.length}`);
  if (info.skin !== skin) fail.push(`/qianshou/?${skin} 没换到 ${skin} 皮`);
  if (info.cards !== 10) fail.push(`/qianshou/?${skin} 罗汉卡 ${info.cards} 张（应该 10 张）`);
  if (errs.length) fail.push(`/qianshou/?${skin}: 报错 ${errs[0]}`);
  await page.close();
}
for (const l of linkSet) {
  const { status } = await get(l);
  log(`  - ${l} → ${status}`);
  if (status !== 200) fail.push(`/qianshou/ 上的链接 ${l} → ${status}`);
}
await browser.close();

log(fail.length ? `\n## ✗ 没过（${fail.length}）\n` + fail.map((x) => `- ${x}`).join('\n') : '\n## ✓ 全过');
writeFileSync(`${OUT}/live-check.md`, lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
process.exit(fail.length ? 1 : 0);
