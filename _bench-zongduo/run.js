// 总舵首页中英两套的真流程：本地起服务，两套皮（?a ?b）× 中英 × 390 / 1280 各开一遍。
// 查：零报错、字都填上了、手机不横向滚动、按钮和切换不断行、字不截断、EN / 中文 切换记得住、不跟浏览器语言走、
// 每张卡片点得通（本仓库有的文件夹看本地 200；在别的仓库的看线上 200）。
// 顺手把中英文字导出到 strings-bi/，截图放 shots-bi/（jpg，<皮>-<语言>-<宽>-hero 首屏 / full 整页 / end 滚到底）。
// 跑法（仓库根目录）：node _bench-zongduo/run.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = __dirname;
const LIVE = 'https://qianshoulab.github.io';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end('404'); return; }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

function flat(o, pre, out) {
  for (const k of Object.keys(o)) {
    const v = o[k], key = pre ? pre + '.' + k : k;
    if (Array.isArray(v)) out.push([key, v.join(' / ')]);
    else if (v && typeof v === 'object') flat(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}

(async () => {
  const srv = await serve();
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const problems = [];
  const results = [];
  const bad = (where, what) => problems.push(where + '：' + what);

  // ---------- 1. 两套皮 × 中英 × 两种宽 ----------
  for (const skin of ['a', 'b']) {
    for (const lang of ['en', 'zh']) {
      for (const [w, h] of [[390, 844], [1280, 800]]) {
        const tag = `${skin}-${lang}-${w}`;
        // 浏览器语言故意设成跟要看的相反：页面不许跟着它切
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 2 : 1,
          isMobile: w === 390, hasTouch: w === 390, locale: lang === 'en' ? 'zh-CN' : 'en-US' });
        const page = await ctx.newPage();
        const errs = [];
        page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
        page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
        page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
        page.on('response', (r) => { if (r.status() >= 400) errs.push('http ' + r.status() + ': ' + r.url()); });

        await page.goto(`${BASE}/?${skin}`, { waitUntil: 'networkidle' });
        const first = await page.evaluate(() => document.documentElement.lang);
        if (first !== 'en') bad(tag, `第一次打开不是英文（${first}），浏览器语言 ${lang === 'en' ? 'zh-CN' : 'en-US'}`);
        if (lang === 'zh') {
          // 点「中文」，再刷新：要记住
          await page.click('.lang button[data-l="zh"]');
          await page.waitForTimeout(300);
          await page.reload({ waitUntil: 'networkidle' });
        }
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(2500);                 // 3D 画几帧

        const r = await page.evaluate(() => {
          const T = window.QS_STRINGS[window.QS.lang], vw = window.innerWidth;
          const vis = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length; };
          const empty = [...document.querySelectorAll('[data-i18n]')].filter((el) => !el.textContent.trim()).map((el) => el.getAttribute('data-i18n'));
          const lh = (el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
          const twoLines = [...document.querySelectorAll('.monk .go, .lang button, .hero-a .tag, footer a, .rules a')]
            .filter(vis).filter((el) => { const cs = getComputedStyle(el), box = el.getBoundingClientRect().height
              - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
              return el.getClientRects().length > 1 || box > lh(el) * 1.5; })
            .map((el) => el.textContent.trim());
          const clipped = [...document.querySelectorAll('.monk .name, .monk .sub, .monk .go, .tag, .gatha, .lang button, h2, h3, .sec-title, footer > *')]
            .filter(vis).filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline')
            .map((el) => el.textContent.trim().slice(0, 40));
          const outside = [...document.querySelectorAll('.lang, .tag, .gatha, .monk, h2, .rules li, footer > *')]
            .filter(vis).filter((el) => { const b = el.getBoundingClientRect(); return b.left < -0.5 || b.right > vw + 0.5; })
            .map((el) => (el.className || el.tagName) + '「' + el.textContent.trim().slice(0, 30) + '」');
          const fb = document.querySelector('footer a.fb').href, mail = document.getElementById('mail').href;
          const lang = document.querySelector('.lang').getBoundingClientRect();
          return {
            lang: document.documentElement.lang, title: document.title,
            desc: document.querySelector('meta[name="description"]').content,
            ogTitle: document.querySelector('meta[property="og:title"]').content,
            ogDesc: document.querySelector('meta[property="og:description"]').content,
            ogLocale: document.querySelector('meta[property="og:locale"]').content,
            want: { lang: T.htmlLang, title: T.docTitle, desc: T.metaDesc, ogTitle: T.ogTitle, ogDesc: T.ogDesc, ogLocale: T.ogLocale },
            stored: (() => { try { return localStorage.getItem('qianshou.lang'); } catch (e) { return 'ERR'; } })(),
            empty, twoLines, clipped, outside,
            hscroll: document.documentElement.scrollWidth - vw,
            bodyFont: getComputedStyle(document.body).fontFamily,
            nameFont: getComputedStyle(document.querySelector('.monk .name')).fontFamily,
            fbOk: fb.startsWith('mailto:oilsongchengmin@gmail.com?subject=' + encodeURIComponent(T.fbSubject)) && fb.includes('&body='),
            mailOk: mail === 'mailto:oilsongchengmin@gmail.com?subject=' + encodeURIComponent(T.mailSubject),
            fbBody: decodeURIComponent(fb.split('&body=')[1] || ''),
            toggle: { top: Math.round(lang.top), right: Math.round(vw - lang.right), w: Math.round(lang.width), h: Math.round(lang.height) },
            cards: document.querySelectorAll('a.monk').length,
            ring: getComputedStyle(document.documentElement).getPropertyValue('--ring').trim(),
            notoLoaded: [...document.fonts].some((f) => /Noto Serif SC/.test(f.family) && f.status === 'loaded'),
            canvas: (() => { const c = document.getElementById('scene'); return c.width + 'x' + c.height; })()
          };
        });
        for (const k of Object.keys(r.want)) if (r[k] !== r.want[k]) bad(tag, `${k} 不对：${r[k]}`);
        if (r.lang !== (lang === 'en' ? 'en' : 'zh-CN')) bad(tag, '语言不对 ' + r.lang);
        if (lang === 'zh' && r.stored !== 'zh') bad(tag, '选了中文没记住：' + r.stored);
        if (r.empty.length) bad(tag, '没填上的字：' + r.empty.join(', '));
        if (r.twoLines.length) bad(tag, '挤成两行：' + r.twoLines.join(' | '));
        if (r.clipped.length) bad(tag, '字被截：' + r.clipped.join(' | '));
        if (r.outside.length) bad(tag, '出了屏幕：' + r.outside.join(' | '));
        if (r.hscroll > 0) bad(tag, '横向滚动 ' + r.hscroll + 'px');
        if (!r.fbOk) bad(tag, '提意见链接不对');
        if (!r.mailOk) bad(tag, '找方丈链接不对');
        if (r.cards !== 13) bad(tag, '卡片数 ' + r.cards);
        if (errs.length) bad(tag, '报错 ' + errs.length + '：' + errs.join(' | '));

        await page.screenshot({ path: path.join(OUT, 'shots-bi', `${tag}-hero.jpg`), type: 'jpeg', quality: 80 });
        await page.screenshot({ path: path.join(OUT, 'shots-bi', `${tag}-full.jpg`), fullPage: true, type: 'jpeg', quality: 80 });
        // 整页截图在高倍屏、B 皮（背景 fixed + WebGL）下太高会截不全，再补一张滚到底的屏幕截图，确认页脚真画出来了
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(OUT, 'shots-bi', `${tag}-end.jpg`), type: 'jpeg', quality: 80 });
        const footVis = await page.evaluate(() => { const b = document.querySelector('footer').getBoundingClientRect(); return b.top < window.innerHeight && b.bottom > 0; });
        if (!footVis) bad(tag, '滚到底看不见页脚');
        results.push({ tag, errors: errs.length, hscroll: r.hscroll, toggle: r.toggle, ring: r.ring, noto: r.notoLoaded, canvas: r.canvas,
          bodyFont: r.bodyFont.split(',').slice(0, 3).join(','), fbBody: r.fbBody.replace(/\n/g, '⏎') });
        await ctx.close();
      }
    }
  }

  // ---------- 2. 切换来回切、刷新记住；?lang= 只管这一次 ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${BASE}/?a`, { waitUntil: 'networkidle' });
    const steps = [];
    const snap = async (what) => steps.push(what + ' → ' + await page.evaluate(() => document.documentElement.lang + ' / ' + document.querySelector('.sec-title').textContent + ' / ' + document.title));
    await snap('打开');
    await page.click('.lang button[data-l="zh"]'); await snap('点中文');
    await page.reload({ waitUntil: 'networkidle' }); await snap('刷新');
    await page.click('.lang button[data-l="en"]'); await snap('点 EN');
    await page.reload({ waitUntil: 'networkidle' }); await snap('刷新');
    await page.goto(`${BASE}/?a&lang=zh`, { waitUntil: 'networkidle' }); await snap('?lang=zh');
    await page.goto(`${BASE}/?a`, { waitUntil: 'networkidle' }); await snap('再开（不带参数）');
    const want = ['en', 'zh-CN', 'zh-CN', 'en', 'en', 'zh-CN', 'en'];
    steps.forEach((s, i) => { if (!s.includes('→ ' + want[i] + ' /')) bad('切换', s); });
    if (errs.length) bad('切换', errs.join(' | '));
    results.push({ tag: 'toggle', steps });
    await ctx.close();
  }

  // ---------- 3. 卡片点得通 ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?a`, { waitUntil: 'domcontentloaded' });
    const hrefs = await page.$$eval('a.monk', (as) => as.map((a) => a.getAttribute('href')));
    const links = [];
    for (const href of hrefs) {
      await page.goto(`${BASE}/?a`, { waitUntil: 'domcontentloaded' });
      const [resp] = await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click(`a.monk[href="${href}"]`)]);
      const local = resp ? resp.status() : 0;
      let live = null, liveTitle = '';
      if (local !== 200) {   // 不在本仓库（另一个仓库挂在同一个域名下）：看线上
        const p2 = await ctx.newPage();
        const r2 = await p2.goto(LIVE + href, { waitUntil: 'domcontentloaded' }).catch(() => null);
        live = r2 ? r2.status() : 0; liveTitle = await p2.title().catch(() => '');
        await p2.close();
        if (live !== 200) bad('卡片 ' + href, `本地 ${local}、线上 ${live}`);
      }
      links.push({ href, url: page.url().replace(BASE, ''), local, live, title: local === 200 ? await page.title() : liveTitle });
    }
    results.push({ tag: 'links', links });
    await ctx.close();
  }

  // ---------- 4. 导出中英文字（一行一条：key<Tab>文字） ----------
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/?a`, { waitUntil: 'domcontentloaded' });
    const S = await page.evaluate(() => window.QS_STRINGS);
    for (const l of ['en', 'zh']) {
      const rows = flat(S[l], '', []).map(([k, v]) => k + '\t' + v.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' '));
      const head = l === 'en'
        ? '# QIANSHOU LAB homepage, English copy (exported from QS_STRINGS in index.html). One per line: key<Tab>text.'
        : '# 千手院总舵首页中文（从 index.html 里的 QS_STRINGS 导出）。一行一条：key<Tab>文字。';
      fs.writeFileSync(path.join(OUT, 'strings-bi', l + '.txt'), [head, ...rows].join('\n') + '\n');
      results.push({ tag: 'strings-' + l, count: rows.length });
    }
    await page.close();
  }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(OUT, 'result-bi.json'), JSON.stringify({ problems, results }, null, 2));
  console.log(JSON.stringify(results, null, 1));
  console.log(problems.length ? '有问题 ' + problems.length + ' 处：\n' + problems.join('\n') : '全过：0 处问题');
  process.exit(problems.length ? 1 : 0);
})();
