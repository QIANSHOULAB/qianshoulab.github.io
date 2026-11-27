// 造物之门的验收截图：三个内核 × 一组尺寸 × 七幕（用 ?act=k 把进度定住再拍），每张都自动查三件事——
//   1. 有没有横向溢出；2. 控制台有没有报错；3. 字有没有被挡住或出框（出了屏幕、压进手机最底下 90 像素、两段字叠在一起）。
// 用法（在 _zero/ 里）：
//   node scripts/genesis-shots.mjs --base http://127.0.0.1:4321 --out ../preview-shots              （三内核全套：Chromium 11 个尺寸，WebKit、Firefox 各 4 个）
//   node scripts/genesis-shots.mjs --engines chromium --sizes 1440x900,390x844 --dpr 2 --out <夹子>   （交货那 14 张）
// 有一条没过，退出码就是 1（工作流变红）。WebKit 在没有显卡的机器上起不来 3D 的话，查的是静态图兜底和版式，照样算数。
import { chromium, webkit, firefox } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']] : a), []));
const BASE = args.base || process.env.LIVE_BASE || 'http://127.0.0.1:4321';
const OUT = args.out || 'preview-shots';
const DPR = Number(args.dpr || 1);
const ACTS = (args.acts || '1,2,3,4,5,6,7').split(',').map(Number);
const ALL = ['360x780', '390x844', '430x932', '844x390', '820x1180', '1280x720', '1366x768', '1440x900', '1920x1080', '2560x1440', '3440x1440'];
const FOUR = ['390x844', '820x1180', '1366x768', '1440x900'];
const ENGINES = (args.engines || 'chromium,webkit,firefox').split(',');
const LANGS = (args.langs || 'en').split(',');
const TIER = args.tier || '';
mkdirSync(OUT, { recursive: true });

const launchers = { chromium, webkit, firefox };
const report = { base: BASE, when: new Date().toISOString(), shots: [], fail: [] };
const NUM = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ'];

for (const name of ENGINES) {
  const sizes = args.sizes ? args.sizes.split(',') : name === 'chromium' ? ALL : FOUR;
  let browser;
  try {
    browser = await launchers[name].launch(name === 'chromium' ? { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : {});
  } catch (e) {
    report.fail.push(`${name}: 起不来（${String(e).slice(0, 120)}）`);
    continue;
  }
  for (const size of sizes) {
    const [w, h] = size.split('x').map(Number);
    const phone = Math.min(w, h) < 600;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: DPR, isMobile: phone && name !== 'firefox', hasTouch: phone });
    for (const lang of LANGS) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
      for (const k of ACTS) {
        errors.length = 0;
        const q = new URLSearchParams({ act: String(k), lang });
        if (TIER) q.set('tier', TIER);
        await page.goto(`${BASE}/zero/?${q}`, { waitUntil: 'load', timeout: 90000 });
        // 等画面出来（有 3D 等它画几帧；没有 3D 等静态图）
        await page.waitForFunction(() => window.__zero && (window.__zero.frames() > 2 || window.__zero.gl() === 'no'), null, { timeout: 120000 }).catch(() => errors.push('画面没出来（120 秒）'));
        if (await page.evaluate(() => window.__zero && window.__zero.gl() === 'no')) await page.waitForTimeout(600);
        await page.waitForTimeout(250);
        const info = await page.evaluate(({ phone }) => {
          const vw = window.innerWidth, vh = window.innerHeight;
          const visible = (el) => {
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') return false;
            let o = 1;
            for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
              const s = getComputedStyle(e);
              if (s.display === 'none' || s.visibility === 'hidden') return false;
              o *= parseFloat(s.opacity || '1');
            }
            const r = el.getBoundingClientRect();
            return o > 0.5 && r.width > 0 && r.height > 0;
          };
          // 要看的字：每幕的名字、那句话、「进去」、代码；首屏的 wordmark、一句话、五条铭文；收工那几行；顶栏两个开关
          const sel = ['.act-in .code', '.act-tag', '.sec', '.act-line', '.act-go', '.wm-a', '.title .tag', '.entry .nm', '.fin .code', '.motto', '.fin-more .ft-co', '.fin-nav a', '.fin-mail a', '.toggle', '.snd', '.moon', '.spec'];
          const boxes = [];
          for (const s of sel) for (const el of document.querySelectorAll(s)) {
            if (!visible(el)) continue;
            // 只量真有字的那一份（中英两份只亮一份）
            const r = el.getBoundingClientRect();
            boxes.push({ s, x: r.left, y: r.top, w: r.width, h: r.height, el });
          }
          const issues = [];
          for (const b of boxes) {
            if (b.x < -1 || b.y < -1 || b.x + b.w > vw + 1 || b.y + b.h > vh + 1) issues.push(`出框：${b.s}（${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}）`);
            if (phone && vh > vw && (b.s === '.act-go' || b.s === '.motto' || b.s === '.sec') && b.y + b.h > vh - 90) issues.push(`压进底下 90 像素：${b.s}`);
          }
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (ox > 2 && oy > 2) issues.push(`叠在一起：${a.s} × ${b.s}`);
          }
          return { overflow: document.documentElement.scrollWidth - vw, gl: window.__zero?.gl(), tier: window.__zero?.tier(), p: window.__zero?.p(), issues, n: boxes.length };
        }, { phone });
        const file = `${name}-${w}x${h}${lang !== 'en' ? '-' + lang : ''}-act${k}.jpg`;
        await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 78 });
        const errs = errors.filter((e) => !/GPU stall|GL_CLOSE_PATH|Performance/.test(e));
        const shot = { engine: name, size, lang, act: k, file, gl: info.gl, tier: info.tier, overflow: info.overflow, errors: errs, issues: info.issues, texts: info.n };
        report.shots.push(shot);
        const tag = `${name} ${size} ${lang} ${NUM[k - 1]}`;
        if (info.overflow > 0) report.fail.push(`${tag}：横向溢出 ${info.overflow}px`);
        if (errs.length) report.fail.push(`${tag}：控制台报错 ${errs[0]}`);
        for (const i of info.issues) report.fail.push(`${tag}：${i}`);
        console.log(`${tag}  gl=${info.gl} tier=${info.tier} 溢出=${info.overflow} 报错=${errs.length} 字=${info.n} ${info.issues.length ? '✗ ' + info.issues.join('；') : '✓'}`);
      }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}

const lines = [`# 造物之门截图验收（${report.when}）`, '', `对着 ${BASE}；${report.shots.length} 张。`, ''];
lines.push('| 内核 | 尺寸 | 幕 | 3D | 溢出 | 报错 | 字 |', '|---|---|---|---|---|---|---|');
for (const s of report.shots) lines.push(`| ${s.engine} | ${s.size}${s.lang !== 'en' ? ' ' + s.lang : ''} | ${NUM[s.act - 1]} | ${s.gl}${s.tier ? '/' + s.tier : ''} | ${s.overflow > 0 ? s.overflow + 'px' : '0'} | ${s.errors.length} | ${s.issues.length ? '✗ ' + s.issues.join('；') : '✓'} |`);
lines.push('', report.fail.length ? `## ✗ 没过（${report.fail.length}）\n` + report.fail.map((x) => `- ${x}`).join('\n') : '## ✓ 全过');
writeFileSync(join(OUT, '验收.json'), JSON.stringify(report, null, 2));
writeFileSync(join(OUT, '验收.md'), lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
console.log(report.fail.length ? `✗ 没过 ${report.fail.length} 条` : '✓ 全过');
process.exit(report.fail.length ? 1 : 0);
