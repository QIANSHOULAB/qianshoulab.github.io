// v3.2 交货截图（施工单「算做完」那几张）：三内核 × 1440×900、390×844，每个尺寸七张——
//   首屏（只有门、wordmark、顶栏三样）｜快进半路｜天上五个名字｜鼠标悬停（手机：键盘焦点）在一个名字上｜从天上冲进去半路｜后退回到天上｜开场 0 秒（拿去跟纯黑并排）
// 每张顺手记：画面上亮着哪些字、控制台报错、天上名字有没有互相压 / 压那句话 / 压顶栏 / 出屏。结果写进 <输出目录>/v32.json。
// 跑法：node scripts/v32-shots.mjs <输出目录>
//   BASE 网站根（默认线上）；ENGINES 默认 chromium,webkit,firefox；SIZES 默认 1440x900,390x844；PW_MODULE 可以指到别的 playwright
// 拼图、跟纯黑并排的对比图：python3 scripts/v32-sheet.py <输出目录> <拼图目录>
const pw = await import(process.env.PW_MODULE || 'playwright');
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'v32-shots';
const BASE = (process.env.BASE || 'https://zeroflesh.github.io').replace(/\/$/, '');
const ENGINES = (process.env.ENGINES || 'chromium,webkit,firefox').split(',');
const SIZES = (process.env.SIZES || '1440x900,390x844').split(',').map((s) => s.split('x').map(Number));
const LAUNCH = {
  chromium: () => pw.chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }),
  webkit: () => pw.webkit.launch(),
  firefox: () => pw.firefox.launch({ firefoxUserPrefs: { 'webgl.force-enabled': true } }),
};
mkdirSync(out, { recursive: true });
const rows = [];
const path = (u) => new URL(u).pathname;

async function ready(page, names = false) {
  await page.waitForFunction(() => document.documentElement.dataset.gl, null, { timeout: 90000 });
  const gl = await page.evaluate(() => document.documentElement.dataset.gl);
  if (gl === 'yes') await page.waitForFunction(() => window.__zero && window.__zero.frames() >= 3, null, { timeout: 240000 });
  if (gl === 'yes' && names) await page.waitForFunction(() => document.querySelectorAll('.nm.ok').length === 5, null, { timeout: 60000 }).catch(() => {});
  return gl;
}
/** 画面上亮着的字（顶栏三样单算）、天上名字有没有打架 */
const inspect = (page) => page.evaluate(() => {
  const seen = (el) => {
    if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    for (let e = el; e && e !== document.body; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) < 0.05) return false; }
    return true;
  };
  const words = [];
  const ui = document.querySelector('[data-ui]');
  if (ui) {
    const tw = document.createTreeWalker(ui, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = n.textContent.trim(), el = n.parentElement;
      if (!t || !el || el.closest('.sr')) continue;
      if (el.classList.contains('ch') && parseFloat(getComputedStyle(el).opacity) < 0.5) continue;
      if (seen(el)) words.push(t);
    }
  }
  const head = [...document.querySelectorAll('.hd-row button')].filter((b) => seen(b) && b.getBoundingClientRect().width).map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // 天上的名字：字框（去掉内边距）互相压没压、压没压那句话、顶栏，出没出屏
  const vw = innerWidth, vh = innerHeight;
  const R = (el, px = 0, py = 0) => { const r = el.getBoundingClientRect(); return { x: r.left + px, y: r.top + py, w: r.width - 2 * px, h: r.height - 2 * py }; };
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const diving = document.documentElement.hasAttribute('data-diving');   // 正在往里扎：整层字都淡掉了，不算
  const nm = diving ? [] : [...document.querySelectorAll('.nm.ok')].filter((a) => parseFloat(getComputedStyle(a).opacity) > 0.5).map((a) => R(a, 12, 14));
  const clash = [];
  const motto = document.querySelector('.motto'), hd = document.querySelector('.hd-row');
  nm.forEach((a, i) => {
    nm.forEach((b, j) => { if (j > i && hit(a, b)) clash.push(`名字${i}压名字${j}`); });
    if (motto && hit(a, R(motto))) clash.push(`名字${i}压那句话`);
    if (hd && a.y < hd.getBoundingClientRect().bottom - 2) clash.push(`名字${i}压顶栏`);
    if (a.x < 0 || a.y < 0 || a.x + a.w > vw || a.y + a.h > vh) clash.push(`名字${i}出屏`);
  });
  return { words: words.join(' ').replace(/\s+/g, ' ').trim(), head, names: nm.length, clash, P: window.__zero?.P?.() ?? null, gl: document.documentElement.dataset.gl };
}).catch((e) => ({ err: String(e).slice(0, 120) }));

for (const eng of ENGINES) {
  let browser;
  try { browser = await LAUNCH[eng](); } catch (e) { rows.push({ engine: eng, fatal: String(e).slice(0, 300) }); continue; }
  for (const [w, h] of SIZES) {
    const mobile = w < 600;
    const ctxOpts = { viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(mobile && eng !== 'firefox' ? { isMobile: true, hasTouch: true } : {}) };
    const shot = async (page, name, info = {}) => {
      const file = `${eng}-${w}x${h}-v32-${name}.${name === '开场0秒' ? 'png' : 'jpg'}`;
      const meta = await inspect(page);
      await page.screenshot({ path: `${out}/${file}`, ...(file.endsWith('.jpg') ? { type: 'jpeg', quality: 82 } : {}) }).catch(() => {});
      rows.push({ engine: eng, size: `${w}x${h}`, shot: name, file, errors: [...new Set(page.errs)], ...meta, ...info });
      console.log(`${eng} ${w}x${h} ${name} gl=${meta.gl} P=${meta.P?.toFixed?.(2)}${meta.clash?.length ? ' 打架 ' + meta.clash.join(',') : ''}${page.errs.length ? ' 报错 ' + page.errs.length : ''}`);
      page.errs = [];
    };
    const open = async (q, names = false) => {
      const ctx = await browser.newContext(ctxOpts);
      const page = await ctx.newPage();
      page.errs = [];
      page.on('pageerror', (e) => { if (path(page.url()) === '/') page.errs.push(String(e).slice(0, 200)); });
      page.on('console', (m) => { if (m.type() === 'error' && path(page.url()) === '/') page.errs.push(m.text().slice(0, 200)); });
      await page.goto(`${BASE}/${q}`, { waitUntil: 'load', timeout: 90000 });
      const gl = await ready(page, names);
      return { page, gl, close: () => ctx.close() };
    };
    const press = (page, sel) => (mobile && eng !== 'firefox' ? page.tap(sel) : page.click(sel));
    try {
      // 1. 首屏
      { const { page, close } = await open('?act=1&t=5&tier=high'); await page.waitForTimeout(1200); await shot(page, '首屏'); await close(); }
      // 2. 快进半路（真快进，进度过了一半那一下截）
      {
        const { page, gl, close } = await open('?tier=high');
        await page.waitForTimeout(800);
        // 快进走到进度 4.4（第五幕，过了一半）那一下自己停住再拍（截图那几百毫秒里滚动位置还在变，停住拍才是那一刻真正的样子），拍完放开走完
        if (gl === 'yes') await page.evaluate(() => window.__zero.ffHold(true, 4.4));
        await press(page, '[data-index]');
        if (gl === 'yes') {
          await page.waitForFunction(() => window.__zero.ffHeld() || !window.__zero.flying(), null, { timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(900);
        }
        await shot(page, '快进半路', { flying: await page.evaluate(() => !!window.__zero?.flying?.()) });
        if (gl === 'yes') await page.evaluate(() => window.__zero.ffHold(false));
        await close();
      }
      // 3. 天上五个名字
      { const { page, close } = await open('?act=7&t=5&tier=high', true); await page.waitForTimeout(1800); await shot(page, '天上五个名字'); await close(); }
      // 4. 指着一个名字（电脑：鼠标悬停在「千手院」上；手机：键盘焦点停在「千手院」上）
      {
        const { page, gl, close } = await open('?act=7&t=5&tier=high', true);
        await page.waitForTimeout(1800);
        if (gl === 'yes') {
          if (mobile) { await page.focus('[data-sky-go="0"]'); } else { await page.hover('[data-sky-go="0"]'); }
        } else if (mobile) await page.focus('[data-end-go="0"]'); else await page.hover('[data-end-go="0"]');
        await page.waitForTimeout(900);
        await shot(page, mobile ? '焦点在千手院' : '悬停在千手院');
        await close();
      }
      // 5. 从天上冲进去半路（冲进巨鲸，镜头停在 55%）
      {
        const { page, gl, close } = await open('?act=7&t=5&tier=high', true);
        await page.waitForTimeout(1200);
        if (gl === 'yes') { await page.evaluate(() => window.__zero.hold(9, 0.55)); await page.waitForTimeout(2600); }
        await shot(page, '冲进去半路');
        await close();
      }
      // 6. 从天上冲进「文物」，再按后退
      {
        const { page, gl, close } = await open('?tier=high');
        await page.waitForTimeout(800);
        await press(page, '[data-index]');
        if (gl === 'yes') await page.waitForFunction(() => !window.__zero.flying() && window.__zero.P() > 6.99 && document.querySelectorAll('.nm.ok').length === 5, null, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1800);
        const sel = gl === 'yes' ? '[data-sky-go="3"]' : '[data-end-go="3"]';
        await Promise.all([page.waitForURL((u) => path(u.href) === '/artifacts/', { timeout: 20000 }), press(page, sel)]).catch(() => {});
        await page.waitForTimeout(1200);
        await page.goBack({ waitUntil: 'load' }).catch(() => {});
        await ready(page, true).catch(() => {});
        await page.waitForTimeout(2400);
        await shot(page, '后退回到天上', { backUrl: path(page.url()) });
        await close();
      }
      // 7. 开场 0 秒（无损图，拿去跟纯黑并排）
      { const { page, close } = await open('?act=0&t=5&tier=high'); await page.waitForTimeout(1000); await shot(page, '开场0秒'); await close(); }
    } catch (e) {
      rows.push({ engine: eng, size: `${w}x${h}`, fatal: String(e).split('\n')[0].slice(0, 240) });
      console.log(eng, w, h, 'fatal', String(e).split('\n')[0]);
    }
  }
  await browser.close();
}
const bad = rows.filter((r) => r.fatal || r.errors?.length || r.clash?.length);
writeFileSync(`${out}/v32.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), total: rows.length, problems: bad.length, rows }, null, 1));
console.log(`一共 ${rows.length} 张，有问题的 ${bad.length} 张`);
for (const r of bad) console.log('  ', r.engine, r.size, r.shot ?? '', r.fatal || '', (r.errors || []).join(' | '), (r.clash || []).join(','));
process.exit(bad.some((r) => r.fatal || r.errors?.length || r.clash?.length) ? 1 : 0);
