// 0.4.2「提意见」入口核对 + 改名后旧备份还能导回：
// 1) 中、英界面各点一次页脚「提意见」（空账本那屏 = 介绍页；有账的首页、房子页同一个页脚），拦下 mailto（不真开邮件、不发信），
//    核对收件人、标题、正文三行提示、最后一行「版本 · 系统 · 浏览器」；网址里不许有没编码的字（中英都不乱码）；点的地方 ≥ 44 高。
//    换几种 UA 看设备简写；中文界面里切到 EN 再点，标题正文跟着换。
// 2) 旧名字的备份文件（包租僧备份-*.json、baozu-backup-*.json，0.2.0 格式）在新版里照样导回。
// 3) 截图：中英各一张手机介绍页、一张电脑首页（能看到入口），放 shots-0.4.2/。
// 用法：LANG=C.UTF-8 node feedback-check.js http://127.0.0.1:8765/baozuseng/ <临时目录>
//（沙盒没设 LANG 时 Chromium 读不了中文文件名的文件，「包租僧备份-*.json」会导不回——是沙盒的事，不是页面的事；设上 UTF-8 就好）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.argv[2], TMP = process.argv[3] || require('os').tmpdir();
const STR = require(path.join(__dirname, '..', 'strings.js'));
const SHOTS = path.join(__dirname, 'shots-0.4.2'); fs.mkdirSync(SHOTS, { recursive: true });
const TO = 'oilsongchengmin@gmail.com', VER = '0.4.2';
const UAS = {
  iphone: ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'iOS 17 · Safari 17'],
  win: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Windows 10 · Chrome 130'],
  edge: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', 'Windows 10 · Edge 130'],
  android: ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'Android 14 · Chrome 130'],
  wechat: ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x18003231) NetType/WIFI Language/zh_CN', 'iOS 17 · WeChat 8'],
  mac: ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 'macOS 10.15 · Safari 17'],
  // Windows 11：Chromium 的 UA 跟 10 一样，要靠 userAgentData 的 platformVersion（13 起是 11）；下面用 init 脚本假装一台 Win11
  win11: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Windows 11 · Chrome 130']
};
const pinLang = l => { try { const u = JSON.parse(localStorage.getItem('baozuseng.ui') || '{}'); u.lang = l; localStorage.setItem('baozuseng.ui', JSON.stringify(u)); } catch (e) {} };
// 页面里：点「提意见」时，等页面自己的点击处理（重填 href）跑完，在最外层记下 href、拦住跳转
const trap = () => { window.__fb = []; window.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a.fb'); if (a) { window.__fb.push(a.href); e.preventDefault(); } }); };
const fails = [], seen = [];
const ok = (c, msg) => { if (!c) fails.push(msg); };
function parseMailto(href) {
  const [head, q] = href.split('?'), p = {};
  for (const kv of (q || '').split('&')) { const i = kv.indexOf('='); p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); }
  return { to: decodeURIComponent(head.replace(/^mailto:/, '')), subject: p.subject, body: p.body, raw: href };
}
function checkMail(href, lang, dev, where) {
  const L = STR[lang], m = parseMailto(href), tag = `${lang} ${where}`;
  ok(/^mailto:/.test(href), `${tag}: 不是 mailto：${href.slice(0, 40)}`);
  ok(/^[\x21-\x7e]+$/.test(href), `${tag}: 网址里有没编码的字`);
  ok(m.to === TO, `${tag}: 收件人 ${m.to}`);
  ok(m.subject === L.fbSubject(VER), `${tag}: 标题 ${m.subject}`);
  const lines = (m.body || '').split('\n');
  ok(lines[0] === L.fbBody[0] && lines[2] === L.fbBody[1] && lines[4] === L.fbBody[2] && lines[1] === '' && lines[3] === '', `${tag}: 正文提示不对 ${JSON.stringify(lines.slice(0, 5))}`);
  ok(lines[lines.length - 1] === `${VER} · ${dev}`, `${tag}: 最后一行 ${lines[lines.length - 1]}（要 ${VER} · ${dev}）`);
  seen.push({ lang, where, subject: m.subject, lastLine: lines[lines.length - 1], body: m.body, href: m.raw });
  return m;
}

(async () => {
  const browser = await chromium.launch();
  const clickFb = async (page) => {
    const a = page.locator('footer.foot a.fb');
    ok(await a.count() === 1, '页脚没有「提意见」');
    const box = await a.boundingBox(); ok(box && box.height >= 44 && box.width >= 44, `「提意见」点的地方太小 ${box && Math.round(box.width) + '×' + Math.round(box.height)}`);
    await a.scrollIntoViewIfNeeded(); await a.click();
    const hrefs = await page.evaluate(() => window.__fb.slice());
    ok(page.url().startsWith(BASE), '点完页面跳走了');
    return hrefs[hrefs.length - 1];
  };
  const restore = { };
  for (const lang of ['zh', 'en']) {
    const L = STR[lang];
    // 手机：介绍页（空账本）→ 点提意见；再导回一份旧名字的备份 → 首页、房子页的页脚也点一次
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: UAS.iphone[0], hasTouch: true, locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
    await ctx.addInitScript(pinLang, lang); await ctx.addInitScript(trap);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE); await page.waitForSelector('.empty');
    ok((await page.textContent('.empty h1')).trim() === L.app, `${lang}: 介绍页大标题不是 ${L.app}`);
    ok(await page.title() === L.appFull, `${lang}: 网页标题 ${await page.title()}`);
    ok((await page.textContent('footer.foot')).includes(L.foot(VER)), `${lang}: 页脚版本行不对`);
    checkMail(await clickFb(page), lang, UAS.iphone[1], '介绍页（手机）');
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `${lang}-intro-390.png`), fullPage: true });
    // 旧名字备份：中文那遍用「包租僧备份-」，英文那遍用「baozu-backup-」
    const old = path.join(TMP, lang === 'zh' ? '包租僧备份-2026-11-03.json' : 'baozu-backup-2026-11-03.json');
    fs.copyFileSync(path.join(__dirname, 'sample-backup.json'), old);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.empty [data-act=bk-load]').click()]);
    await fc.setFiles(old);
    const got = await page.waitForSelector('.hero', { timeout: 4000 }).then(() => true, () => false);
    const n = got ? await page.locator('a.row[href^="#h-"]').count() : 0;
    restore[lang] = { file: path.basename(old), ok: got && n > 0, houses: n };
    ok(got && n > 0, `${lang}: 旧名字备份 ${path.basename(old)} 导不回`);
    checkMail(await clickFb(page), lang, UAS.iphone[1], '首页（手机）');
    // 新存的备份用新名字
    { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.locator('[data-act=bk-save]').click({ timeout: 8000 })]);
      const today = await page.evaluate(() => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); });
      restore[lang].newFile = dl.suggestedFilename(); ok(dl.suggestedFilename() === L.bkFile(today), `${lang}: 新备份文件名 ${dl.suggestedFilename()}`); }
    await page.locator('a.row[href^="#h-"]').first().click(); await page.waitForSelector('#elecIn');
    checkMail(await clickFb(page), lang, UAS.iphone[1], '房子页（手机）');
    ok(!errs.length, `${lang}: 页面报错 ${errs.join(' | ')}`);
    await ctx.close();

    // 电脑：示例账本首页，截图 + 点一次
    const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: UAS.win[0], locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
    await c2.addInitScript(pinLang, lang); await c2.addInitScript(trap);
    const p2 = await c2.newPage();
    await p2.goto(BASE); await p2.waitForSelector('.empty');
    await p2.locator('[data-act=load-demo]').click(); await p2.waitForSelector('.hero');
    checkMail(await clickFb(p2), lang, UAS.win[1], '首页（电脑）');
    await p2.mouse.move(0, 0); await p2.evaluate(() => window.scrollTo(0, 0)); await p2.waitForTimeout(150);
    await p2.screenshot({ path: path.join(SHOTS, `${lang}-home-1280.png`), fullPage: true });
    await c2.close();
  }
  // 中文界面切到 EN 再点：标题、正文跟着换
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UAS.android[0], hasTouch: true, locale: 'zh-CN' });
    await ctx.addInitScript(pinLang, 'zh'); await ctx.addInitScript(trap);
    const page = await ctx.newPage(); await page.goto(BASE); await page.waitForSelector('.empty');
    checkMail(await clickFb(page), 'zh', UAS.android[1], '切换前');
    await page.locator('[data-act=lang][data-l=en]').click(); await page.waitForSelector('html[lang=en]');
    checkMail(await clickFb(page), 'en', UAS.android[1], '切到 EN 后');
    await ctx.close();
  }
  // 别的设备简写
  // （Playwright 换 UA 时 userAgentData 也照 UA 编：Windows 给 10.0、macOS 给 10_15_7，所以上面 Windows 是 10、Mac 是 10.15）
  for (const k of ['edge', 'wechat', 'mac', 'win11']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UAS[k][0], locale: 'en-US' });
    await ctx.addInitScript(trap);
    if (k === 'win11') await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => ({ platform: 'Windows', getHighEntropyValues: () => Promise.resolve({ platformVersion: '15.0.0' }) }) }); });
    const page = await ctx.newPage(); await page.goto(BASE); await page.waitForSelector('.empty');
    checkMail(await clickFb(page), 'en', UAS[k][1], 'UA ' + k);
    await ctx.close();
  }
  await browser.close();
  const out = { ver: VER, clicks: seen.length, fails, restore, samples: seen.filter(s => /介绍页|切到/.test(s.where)).map(s => ({ lang: s.lang, where: s.where, subject: s.subject, lastLine: s.lastLine })), devices: seen.map(s => s.lastLine).filter((v, i, a) => a.indexOf(v) === i), mail: seen.slice(0, 1).concat(seen.filter(s => s.where === '介绍页（手机）' && s.lang === 'en')).map(s => ({ lang: s.lang, href: s.href, body: s.body })) };
  fs.writeFileSync(path.join(__dirname, 'results', 'feedback-0.4.2.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
