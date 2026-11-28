// v3.3 交货截图（施工单「测」里的字那几条）：
//   - 每个展示位置（首屏 1、第二到第六幕 k − 0.12、「开天」7）390×844、1440×900 各一张，中英各一套；
//   - 半路各一张：第三幕名字聚到一半（2.70）、「开天」那句话聚到一半（6.80）；
//   - 「开天」那句话水里有倒影：最后那张下半截量一下亮度（倒影那块比旁边亮）；
//   - 脚本查每个元素算出来的字体：全首页没有宋体（Chromium 还用 CDP 问一遍真正画出来用的是哪套字）。
// 每张顺手记：画面上的字在哪（3D 那份在屏幕上的框）、聚到哪了、控制台报错。结果写进 <输出目录>/v33.json。
// 跑法：node scripts/v33-shots.mjs <输出目录>   BASE（默认线上）  ENGINES（默认 chromium,webkit）  SIZES（默认 390x844,1440x900）  LANGS（默认 en,zh）
const pw = await import(process.env.PW_MODULE || 'playwright');
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'v33-shots';
const BASE = (process.env.BASE || 'https://qianshoulab.github.io').replace(/\/$/, '');
const ENGINES = (process.env.ENGINES || 'chromium,webkit').split(',');
const SIZES = (process.env.SIZES || '390x844,1440x900').split(',').map((s) => s.split('x').map(Number));
const LANGS = (process.env.LANGS || 'en,zh').split(',');
const RESTS = [['1-首屏', 1], ['2-千手院', 1.88], ['3-赛博杂货铺', 2.88], ['4-标本', 3.88], ['5-文物', 4.88], ['6-法典', 5.88], ['7-开天', 7]];
const HALF = [['半路-第三幕名字聚到一半', 2.70], ['半路-开天那句话聚到一半', 6.80]];
const SONG = /cormorant|serif sc|songti|stsong|simsun|nsimsun|宋|\bming\b|mincho|georgia|times|(^|,)\s*"?serif"?\s*(,|$)/i;
const LAUNCH = {
  chromium: () => pw.chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }),
  webkit: () => pw.webkit.launch(),
  firefox: () => pw.firefox.launch({ firefoxUserPrefs: { 'webgl.force-enabled': true } }),
};
mkdirSync(out, { recursive: true });
const rows = [];
const fontRows = [];

for (const eng of ENGINES) {
  let browser;
  try { browser = await LAUNCH[eng](); } catch (e) { rows.push({ engine: eng, fatal: String(e).slice(0, 300) }); continue; }
  for (const [w, h] of SIZES) {
    const mobile = w < 600;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(mobile && eng !== 'firefox' ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    let errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 200)));
    for (const lang of LANGS) {
      for (const [name, P] of [...RESTS, ...HALF]) {
        if (name.startsWith('半路') && lang !== 'en' && eng !== 'chromium') continue;
        errs = [];
        let note = '', gl = '–';
        try {
          await page.goto(`${BASE}/zero/?act=${P}&t=5&tier=high&lang=${lang}`, { waitUntil: 'load', timeout: 90000 });
          await page.waitForFunction(() => document.documentElement.dataset.gl, null, { timeout: 90000 });
          gl = await page.evaluate(() => document.documentElement.dataset.gl);
          if (gl === 'yes') {
            await page.waitForFunction(() => window.__zero && window.__zero.frames() >= 3, null, { timeout: 240000 });
            await page.waitForFunction(() => document.documentElement.dataset.dust, null, { timeout: 240000 }).catch(() => { note += ' 星尘字没搭起来'; });
          }
          await page.waitForTimeout(P >= 6.9 ? 3600 : 1600);
        } catch (e) { note = String(e).split('\n')[0].slice(0, 200); }
        const meta = await page.evaluate(() => {
          const z = window.__zero;
          const d = z?.dust?.() ?? null;
          return { P: z?.P?.() ?? null, dust: d ? { on: d.on, f: d.f, boxes: d.boxes, rt: d.rt } : null, mode: z?.names?.().mode ?? '', go: [...document.querySelectorAll('.act.on .go')].map((a) => { const r = a.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }) };
        }).catch(() => ({}));
        const file = `${eng}-${w}x${h}-${lang}-${name}.png`;
        await page.screenshot({ path: `${out}/${file}` }).catch(() => {});
        // 「开天」：水里那句话的倒影——那句话正下方、地平线下面那一块，比左右两边亮
        let refl = null;
        if (P === 7 && gl === 'yes') {
          refl = await page.evaluate(async () => {
            const c = document.querySelector('canvas.gl');
            const b = window.__zero.dust().boxes.motto;
            if (!c || !b) return null;
            return { motto: b };
          }).catch(() => null);
        }
        rows.push({ engine: eng, size: `${w}x${h}`, lang, shot: name, P, gl, file, errors: [...new Set(errs)], note: note.trim(), ...meta, refl });
        console.log(`${eng} ${w}x${h} ${lang} ${name} gl=${gl}${meta?.dust?.on ? ' 星尘字✓' : ''}${errs.length ? ' 报错' + errs.length : ''}${note ? ' ' + note : ''}`);
      }
    }
    // —— 字体：全首页每个有字的元素，算出来的字体里没有宋体 ——
    for (const lang of LANGS) {
      try {
        await page.goto(`${BASE}/zero/?act=7&t=5&tier=high&lang=${lang}`, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(2500);
        const r = await page.evaluate((src) => {
          const SONG = new RegExp(src, 'i');
          const bad = [], fams = new Set();
          let n = 0;
          for (const el of document.querySelectorAll('body *')) {
            if (!el.childNodes.length || ![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
            const f = getComputedStyle(el).fontFamily;
            n++;
            fams.add(f.split(',')[0].trim());
            if (SONG.test(f)) bad.push({ el: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''), f: f.slice(0, 120) });
          }
          return { n, bad, first: [...fams] };
        }, SONG.source);
        let used = null;
        if (eng === 'chromium') {
          // 真正画出来用的是哪套字（CDP：每个有字的节点用到的平台字体）
          const cdp = await ctx.newCDPSession(page);
          await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
          const doc = await cdp.send('DOM.getDocument', { depth: -1 });
          const ids = [];
          const walk = (nd) => { if (nd.nodeType === 1 && (nd.children || []).some((c) => c.nodeType === 3 && c.nodeValue.trim())) ids.push(nd.nodeId); (nd.children || []).forEach(walk); };
          walk(doc.root);
          const fonts = new Map();
          for (const id of ids.slice(0, 400)) {
            try { const f = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: id }); for (const x of f.fonts) fonts.set(x.familyName, (fonts.get(x.familyName) || 0) + x.glyphCount); } catch { /* 不画的节点 */ }
          }
          used = Object.fromEntries(fonts);
        }
        fontRows.push({ engine: eng, size: `${w}x${h}`, lang, elements: r.n, song: r.bad, families: r.first, rendered: used });
        console.log(`字体 ${eng} ${w}x${h} ${lang}：${r.n} 个有字的元素，宋体 ${r.bad.length} 个${used ? '；画出来用的：' + Object.keys(used).join('、') : ''}`);
      } catch (e) { fontRows.push({ engine: eng, size: `${w}x${h}`, lang, error: String(e).slice(0, 160) }); }
    }
    await ctx.close();
  }
  await browser.close();
}
const bad = rows.filter((r) => r.fatal || r.errors?.length);
const song = fontRows.filter((r) => r.song?.length || (r.rendered && Object.keys(r.rendered).some((f) => new RegExp(SONG.source, 'i').test(f))));
writeFileSync(`${out}/v33.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), total: rows.length, problems: bad.length, songFound: song.length, fonts: fontRows, rows }, null, 1));
console.log(`一共 ${rows.length} 张，有报错的 ${bad.length} 张；查字体 ${fontRows.length} 回，有宋体的 ${song.length} 回`);
process.exit(bad.some((r) => r.fatal || r.errors?.length) || song.length ? 1 : 0);
