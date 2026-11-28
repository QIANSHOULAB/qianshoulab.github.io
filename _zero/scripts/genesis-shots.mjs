// 造物之门的三内核截图：Chromium 跑 11 个尺寸，WebKit、Firefox 各 4 个，七幕各一张（一共 133 张）；
// 第七幕「开天」在 1440×900、390×844 上再多拍三张（门裂开、石头升天、满天星云），连最后那句字一共四张。
// 每张顺手查五件事：控制台有没有报错、有没有横向溢出、亮着的字有没有出框、画面上亮着哪些字（words：第二到第六幕应该只有栏目名和「进去」）、
// 第七幕天上那五个名字有没有打架（v3.2：互相压、压那句话、压顶栏、出屏都算；mode = sky 挂在天上 / list 退路 B）。
// 结果写进 <输出目录>/验收.json。
// 跑法：node scripts/genesis-shots.mjs <输出目录>
//   BASE    网站根（默认线上 https://qianshoulab.github.io；工作流里预览分支时是本地起的服务）
//   ENGINES 跑哪几个内核（默认 chromium,webkit,firefox）；SIZES 只跑这几个尺寸（如 390x844,1440x900，本地调试用）
// 画面用 ?act= 定住进度、?t= 定住时钟、?tier=high 定住力气：同一个进度永远是同一个画面，截图才对得上。
// PW_MODULE：本地调试时可以指到别的 playwright（比如机器上预装的那份）
const { chromium, webkit, firefox } = await import(process.env.PW_MODULE || 'playwright');
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'genesis-shots';
const BASE = (process.env.BASE || 'https://qianshoulab.github.io').replace(/\/$/, '');
const ENGINES = (process.env.ENGINES || 'chromium,webkit,firefox').split(',');
const SIZES = {
  chromium: [[360, 780], [390, 844], [430, 932], [844, 390], [820, 1180], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440], [3440, 1440]],
  webkit: [[390, 844], [820, 1180], [1440, 900], [1920, 1080]],
  firefox: [[390, 844], [1366, 768], [1440, 900], [1920, 1080]],
};
if (process.env.SIZES) { const only = process.env.SIZES.split(','); for (const k of Object.keys(SIZES)) SIZES[k] = SIZES[k].filter(([w, h]) => only.includes(`${w}x${h}`)); }
const ACTS = [['1', 1], ['2', 1.9], ['3', 2.9], ['4', 3.95], ['5', 4.92], ['6', 5.9], ['7', 7]];
const SKY = [['7a-门裂开', 6.2], ['7b-石头升天', 6.5], ['7c-满天星云', 6.8]];   // 第七幕多拍的三张，只在下面两个尺寸拍
const SKY_SIZES = ['1440x900', '390x844'];
const COLS = ['1', '2', '3', '4', '5', '6', '7a-门裂开', '7b-石头升天', '7c-满天星云', '7'];   // 总览图里的列
const LAUNCH = {
  chromium: () => chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }),
  webkit: () => webkit.launch(),
  firefox: () => firefox.launch({ firefoxUserPrefs: { 'webgl.force-enabled': true } }),
};
mkdirSync(out, { recursive: true });
const rows = [];

for (const eng of ENGINES) {
  let browser;
  try { browser = await LAUNCH[eng](); } catch (e) { rows.push({ engine: eng, fatal: String(e).slice(0, 300) }); continue; }
  for (const [w, h] of SIZES[eng]) {
    const mobile = w < 600 && eng !== 'firefox';
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    let errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 240)); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 240)));
    for (const [k, P] of [...ACTS, ...(SKY_SIZES.includes(`${w}x${h}`) ? SKY : [])]) {
      errs = [];
      const t0 = Date.now();
      let gl = '–', note = '';
      try {
        await page.goto(`${BASE}/zero/?act=${P}&t=5&tier=high`, { waitUntil: 'load', timeout: 90000 });
        await page.waitForFunction(() => document.documentElement.dataset.gl, null, { timeout: 90000 });
        gl = await page.evaluate(() => document.documentElement.dataset.gl);
        if (gl === 'yes') await page.waitForFunction(() => window.__zero && window.__zero.frames() >= 3, null, { timeout: 240000 });
        await page.waitForTimeout(P >= 6.86 ? 3400 : 900);   // 第七幕那句话慢慢亮（2.4 秒），栏目名、页脚跟在后面
      } catch (e) { note = String(e).split('\n')[0].slice(0, 200); }
      const check = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        const overflow = document.documentElement.scrollWidth > vw + 1;
        const sel = ['.hero.on .title', '.hero.on .hint', '.act.on .card > *', '.act7.on .end > *', '.act7.on .foot > *', '.hd-row', 'html[data-names] .sky .nm.ok'];
        const clipped = [];
        for (const s of sel) {
          for (const el of document.querySelectorAll(s)) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) clipped.push(`${s} ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
          }
        }
        // 画面上亮着哪些字（顶栏的 EN / 中文、SOUND 不算）：只看 .ui 那一层里看得见的字
        const words = [];
        const ui = document.querySelector('[data-ui]');
        const seen = (el) => {
          if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
          for (let e = el; e && e !== document.body; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) < 0.05) return false; }
          return true;
        };
        if (ui) {
          const tw = document.createTreeWalker(ui, NodeFilter.SHOW_TEXT);
          for (let n = tw.nextNode(); n; n = tw.nextNode()) {
            const t = n.textContent.trim();
            const el = n.parentElement;
            if (!t || !el || el.closest('.sr')) continue;
            // 一个字一个字写出来的那种：只认亮着的字
            if (el.classList.contains('ch') && parseFloat(getComputedStyle(el).opacity) < 0.5) continue;
            if (seen(el)) words.push(t);
          }
        }
        // 天上的名字：字框（去掉内边距）互相压没压、压没压那句话、顶栏
        const R = (el, px = 0, py = 0) => { const r = el.getBoundingClientRect(); return { x: r.left + px, y: r.top + py, w: r.width - 2 * px, h: r.height - 2 * py }; };
        const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        const nm = document.documentElement.hasAttribute('data-names') ? [...document.querySelectorAll('.sky .nm.ok')].map((a) => R(a, 12, 14)) : [];
        const clash = [];
        const motto = document.querySelector('.motto'), hd = document.querySelector('.hd-row');
        nm.forEach((a, i) => {
          nm.forEach((b, j) => { if (j > i && hit(a, b)) clash.push(`名字${i}压名字${j}`); });
          if (motto && hit(a, R(motto))) clash.push(`名字${i}压那句话`);
          if (hd && a.y < hd.getBoundingClientRect().bottom - 2) clash.push(`名字${i}压顶栏`);
        });
        return { overflow, clipped, words: words.join('').replace(/\s+/g, ' ').trim(), names: nm.length, clash, mode: window.__zero?.names?.().mode ?? '' };
      }).catch(() => ({ overflow: null, clipped: [], words: '', names: 0, clash: [], mode: '' }));
      const file = `${eng}-${w}x${h}-${k}.jpg`;
      await page.screenshot({ path: `${out}/${file}`, type: 'jpeg', quality: 80 }).catch((e) => { note += ' screenshot: ' + String(e).slice(0, 120); });
      rows.push({ engine: eng, size: `${w}x${h}`, act: k, col: COLS.indexOf(k), P, gl, ms: Date.now() - t0, errors: [...new Set(errs)], overflow: check.overflow, clipped: check.clipped, words: check.words, names: check.names, clash: check.clash, mode: check.mode, note, file });
      console.log(`${eng} ${w}x${h} 第${k}幕 gl=${gl} ${Date.now() - t0}ms${errs.length ? ' 报错' + errs.length : ''}${check.overflow ? ' 溢出' : ''}${check.clipped.length ? ' 出框' + check.clipped.length : ''}${check.clash?.length ? ' 名字打架 ' + check.clash.join(',') : ''}${k === '7' ? ` 天上名字 ${check.names}（${check.mode}）` : ''}${note ? ' ' + note : ''}`);
    }
    await ctx.close();
  }
  await browser.close();
}

const bad = rows.filter((r) => r.fatal || r.errors?.length || r.overflow || r.clipped?.length || r.clash?.length);
writeFileSync(`${out}/验收.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), total: rows.length, problems: bad.length, rows }, null, 1));
console.log(`一共 ${rows.length} 张，有问题的 ${bad.length} 张`);
for (const r of bad.slice(0, 30)) console.log('  ', r.engine, r.size, r.act ?? '', r.fatal || '', (r.errors || []).join(' | '), r.overflow ? '溢出' : '', (r.clipped || []).join(' ; '), (r.clash || []).join(','));
process.exit(bad.some((r) => r.fatal || r.errors?.length || r.overflow) ? 1 : 0);
