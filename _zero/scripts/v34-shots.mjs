// 零肉身造物 v3.4 交货截图：四个手机竖屏（390×844、360×780、430×932、390×664）× 第二到第七幕的展示位置，中文（Song 平时看的那份）；
// 390×844 再拍一套英文；外加 Song 11-28 14:10 那一幕改前改后各一张（390×844，第六幕刚开头 P 5.15：v3.3 太阳和巨鲸叠在左上、
// 浑天仪还在门里、门外一圈星环——右边刻度亮第六格）。每张顺手查控制台报错、横向溢出。
// 跑法：node scripts/v34-shots.mjs <输出目录>
//   BASE    网站根（默认线上）；BEFORE 改前的网站根（默认线上；none 不拍改前那张）；ENGINES 跑哪几个内核（默认 chromium,webkit）
//   PW_MODULE 本地调试指到别的 playwright
// 写 <输出目录>/shots.json；拼图：python3 scripts/v34-sheet.py <输出目录> <拼图目录>
const { chromium, webkit, firefox } = await import(process.env.PW_MODULE || 'playwright');
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'v34-shots';
const BASE = (process.env.BASE || 'https://zeroflesh.github.io').replace(/\/$/, '');
const BEFORE = (process.env.BEFORE || 'https://zeroflesh.github.io').replace(/\/$/, '');
const ENGINES = (process.env.ENGINES || 'chromium,webkit').split(',');
const PHONES = [[390, 844], [360, 780], [430, 932], [390, 664]];
const ACTS = [[2, 1.88], [3, 2.88], [4, 3.88], [5, 4.88], [6, 5.88], [7, 7]];
const SONG_P = 5.15;
const LAUNCH = {
  chromium: () => chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }),
  webkit: () => webkit.launch(),
  firefox: () => firefox.launch({ firefoxUserPrefs: { 'webgl.force-enabled': true } }),
};
mkdirSync(out, { recursive: true });
const rows = [];

async function shoot(page, site, P, lang, file) {
  const errs = [];
  const onC = (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 240)); };
  const onE = (e) => errs.push('pageerror: ' + String(e).slice(0, 240));
  page.on('console', onC);
  page.on('pageerror', onE);
  let note = '';
  try {
    await page.goto(`${site}/?act=${P}&t=5&tier=high&lang=${lang}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => document.documentElement.dataset.gl, null, { timeout: 120000 });
    if (await page.evaluate(() => document.documentElement.dataset.gl) === 'yes') {
      await page.waitForFunction(() => window.__zero && window.__zero.frames() >= 3, null, { timeout: 300000 });
      await page.waitForFunction(() => document.documentElement.dataset.dust, null, { timeout: 30000 }).catch(() => {});
    }
    await page.waitForTimeout(P >= 6.86 ? 3400 : 1400);   // 栏目名按真实时间追 0.22 秒聚好；「开天」那句话、天上的名字慢慢亮
  } catch (e) { note = String(e).split('\n')[0].slice(0, 200); }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1).catch(() => null);
  await page.screenshot({ path: `${out}/${file}.png` });
  page.off('console', onC);
  page.off('pageerror', onE);
  return { errors: errs, overflow, note };
}

for (const eng of ENGINES) {
  let browser;
  try { browser = await LAUNCH[eng](); } catch (e) { rows.push({ engine: eng, fatal: String(e).slice(0, 300) }); continue; }
  for (const [w, h] of PHONES) {
    const langs = w === 390 && h === 844 ? ['zh', 'en'] : ['zh'];
    const mobile = eng !== 'firefox';
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    for (const lang of langs) {
      for (const [k, P] of ACTS) {
        const t0 = Date.now();
        const file = `${eng}-${w}x${h}-${lang}-${k}`;
        const r = await shoot(page, BASE, P, lang, file);
        rows.push({ engine: eng, size: `${w}x${h}`, lang, act: k, P, file, ...r, ms: Date.now() - t0 });
        console.log(eng, `${w}x${h}`, lang, `第${k}幕`, `${Date.now() - t0}ms`, r.errors.length ? `报错 ${r.errors[0]}` : '', r.overflow ? '横向溢出' : '', r.note);
      }
    }
    // Song 那一幕：改后（这一版）、改前（BEFORE）
    if (w === 390 && h === 844) {
      for (const [tag, site] of [['改后', BASE], ...(BEFORE !== 'none' ? [['改前', BEFORE]] : [])]) {
        const file = `${eng}-390x844-Song那一幕-${tag}`;
        const r = await shoot(page, site, SONG_P, 'zh', file);
        rows.push({ engine: eng, size: '390x844', lang: 'zh', act: 'song', P: SONG_P, tag, site, file, ...r });
        console.log(eng, 'Song 那一幕', tag, r.errors.length ? `报错 ${r.errors[0]}` : '', r.overflow ? '横向溢出' : '', r.note);
      }
    }
    await ctx.close();
  }
  await browser.close();
}
const problems = rows.filter((r) => r.fatal || (r.errors && r.errors.length) || r.overflow || r.note);
writeFileSync(`${out}/shots.json`, JSON.stringify({ base: BASE, before: BEFORE, total: rows.length, problems: problems.length, rows }, null, 1));
console.log(`${rows.length} 张，${problems.length} 张有问题`);
process.exit(problems.length ? 1 : 0);
