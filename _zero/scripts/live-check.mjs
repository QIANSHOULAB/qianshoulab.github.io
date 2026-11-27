// 线上验收（工作流 zero.yml 的 live 那一步跑）：Pages 发完以后，对着真网址查三件事——
//  1. 老网址一个不少：每个工具的文件夹、别的仓库挂在下面的工具、千手院新家，全要 200；
//  2. 零肉身造物的页面：电脑 1280、手机 390 各开一遍，图片 / 音频 / 字体请求必须是 0，页脚检疫仪必须是干净的；
//  3. 千手院 /qianshou/ 两套皮都开一遍，页面上每个站内链接都要通。
// 截图放 live-shots/，传成工作流附件。有一条不过就让工作流变红。
import { chromium } from 'playwright';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.LIVE_BASE || 'https://qianshoulab.github.io';
const OUT = process.env.SHOTS || 'live-shots';
mkdirSync(OUT, { recursive: true });

// 本仓库里每个工具的文件夹 + 别的仓库挂在 qianshoulab.github.io 下面的工具（luruseng、pabiao、xibiao、gongshi、qianye）
const MUST_200 = [
  '/', '/qianshou/', '/zahuopu/', '/zhahuopu/', '/specimens/', '/specimens/001-cinderfall-arena/', '/artifacts/', '/codex/', '/codex/web-audio-formulas/',
  '/yijing/', '/chaojing/', '/zhike/', '/saodi/', '/huayuan/', '/xunshan/', '/daibi/', '/baozuseng/', '/tiexie/', '/xiaobai/', '/privacy/',
  '/apps.json', '/qianshou/scene-a.js', '/qianshou/scene-b.js',
  '/luruseng/', '/pabiao/', '/xibiao/', '/gongshi/', '/gongshi/inch/', '/gongshi/tp/', '/qianye/',
];
const PROBE = ['/gongshi/count/'];   // 铁件点钞机网页：交接里说还在草稿分支，只报不卡
const ZERO = ['/', '/zahuopu/', '/specimens/', '/specimens/001-cinderfall-arena/', '/artifacts/', '/codex/', '/codex/web-audio-formulas/'];

const lines = [];
const fail = [];
const log = (s) => { console.log(s); lines.push(s); };

async function status(path) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(BASE + path + (path.includes('?') ? '&' : '?') + 'v=' + Date.now(), { redirect: 'follow' });
      return r.status;
    } catch (e) { await new Promise((ok) => setTimeout(ok, 2000)); }
  }
  return 0;
}

log('## 老网址');
log('| 网址 | 状态 |');
log('|---|---|');
for (const p of MUST_200) {
  const s = await status(p);
  log(`| ${p} | ${s} |`);
  if (s !== 200) fail.push(`${p} → ${s}`);
}
for (const p of PROBE) log(`| ${p}（只报不卡） | ${await status(p)} |`);

const browser = await chromium.launch();
log('\n## 零肉身造物页面：请求和纯洁度');
log('| 页面 | 宽 | 图片 | 音频/视频 | 字体 | 页脚检疫 | 报错 |');
log('|---|---|---|---|---|---|---|');
for (const w of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 800 }, deviceScaleFactor: w < 600 ? 3 : 2, isMobile: w < 600, hasTouch: w < 600 });
  for (const p of ZERO) {
    const page = await ctx.newPage();
    const reqs = [], errs = [];
    page.on('request', (q) => { if (!q.url().startsWith('data:')) reqs.push(q.resourceType()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(BASE + p + '?v=' + Date.now(), { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const purity = await page.evaluate(() => window.__purity || null);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const n = (t) => reqs.filter((x) => x === t).length;
    const name = (p.replace(/\//g, '_').replace(/^_|_$/g, '') || 'home') + `-${w}`;
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const ok = purity && purity.img === 0 && purity.audio === 0 && purity.font === 0 && purity.mesh === 0;
    log(`| ${p} | ${w} | ${n('image')} | ${n('media')} | ${n('font')} | ${purity ? `IMG ${purity.img} · AUDIO ${purity.audio} · FONT ${purity.font} · DOM ${purity.dom} · ${purity.kb}` : '没读到'} | ${errs.length} |`);
    if (n('image') || n('media') || n('font')) fail.push(`${p}@${w}: 有图片/音频/字体请求`);
    if (!ok) fail.push(`${p}@${w}: 页脚检疫不干净`);
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
  const s = await status(l);
  log(`  - ${l} → ${s}`);
  if (s !== 200) fail.push(`/qianshou/ 上的链接 ${l} → ${s}`);
}
await browser.close();

log(fail.length ? `\n## ✗ 没过（${fail.length}）\n` + fail.map((x) => `- ${x}`).join('\n') : '\n## ✓ 全过');
writeFileSync(`${OUT}/live-check.md`, lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
process.exit(fail.length ? 1 : 0);
