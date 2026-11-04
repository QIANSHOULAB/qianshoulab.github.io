// 0.4.2 提意见入口：node fb042.js（YJ_URL 指向本地服务）
// 中文、英文各开一遍（英文那遍浏览器语言故意给 zh-CN，中文那遍点右上角「中文」），三屏（空状态、选目标、干活）页脚都有「提意见」；
// 点它：在 window 的捕获阶段拦下 mailto 导航（不真去开邮件程序），核对收件人、标题、正文（三行提示 + 最后一行「版本 · 系统 · 浏览器」）。
// 另外拿一组 UA 喂 fbDevice()，看系统、浏览器的简写对不对。截图：shots-fb/<zh|en>_<390|1280>.png。
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const URL = process.env.YJ_URL || 'http://127.0.0.1:8765/yijing/', SH = path.join(__dirname, 'shots-fb');
fs.mkdirSync(SH, { recursive: true });
const VER = '0.4.2', TO = 'oilsongchengmin@gmail.com';
const EXP = {
  zh: { subject: `[千手院反馈] 译经僧 ${VER}`, lines: ['哪里不好用：', '', '想要什么：', '', '别的：', '', '', '——'], text: '提意见', locale: 'en-US' },
  en: { subject: `[QIANSHOU feedback] Yijing · Data Mover ${VER}`, lines: ['What’s not working:', '', 'What you want:', '', 'Anything else:', '', '', '—'], text: 'Feedback', locale: 'zh-CN' },
};
const UAS = [
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', { platformVersion: '15.0.0' }, 'Windows 11 · Chrome 130'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', { platformVersion: '10.0.0' }, 'Windows 10 · Edge 130'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0', null, 'Windows · Firefox 131'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', null, 'macOS · Safari 17.5'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', { platformVersion: '14.5.0' }, 'macOS 14 · Chrome 130'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', null, 'iOS 17.5 · Safari 17.5'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x18003231) NetType/WIFI Language/zh_CN', null, 'iOS 18 · WeChat 8.0'],
  ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', { platformVersion: '14.0.0' }, 'Android 14 · Chrome 130'],
];
const INTERCEPT = () => {
  window.__mailto = [];
  window.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="mailto:"]'); if (a) { window.__mailto.push(a.href); e.preventDefault(); } }, true);
};
function parse(href) {
  const [addr, q] = href.slice('mailto:'.length).split('?'), o = { to: decodeURIComponent(addr) };
  for (const kv of q.split('&')) { const i = kv.indexOf('='); o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); }
  return o;
}
(async () => {
  const br = await chromium.launch(); let bad = 0; const res = [];
  const fail = (...a) => { bad++; console.log('  ✗', ...a); };
  for (const L of ['en', 'zh']) for (const w of [1280, 390]) {
    const E = EXP[L];
    const ctx = await br.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 2, locale: E.locale });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.addInitScript(INTERCEPT);
    await page.goto(URL); await page.waitForSelector('footer .fb');
    if (L === 'zh') { await page.click('#navLang [data-l="zh"]'); await page.reload(); await page.waitForSelector('footer .fb'); }
    const check = async (where) => {
      const a = page.locator('footer a.fb');
      if (await a.count() !== 1) return fail(L, w, where, '页脚没有「提意见」');
      if ((await a.innerText()).trim() !== E.text) fail(L, w, where, '按钮字不对', await a.innerText());
      await a.scrollIntoViewIfNeeded();
      const box = await a.boundingBox();
      await page.evaluate(() => { window.__mailto = []; });
      await a.click();
      const got = await page.evaluate(() => window.__mailto);
      if (got.length !== 1) return fail(L, w, where, '点了没拦到 mailto', got.length);
      const m = parse(got[0]), lines = m.body.split('\r\n'), last = lines.pop();
      if (m.to !== TO) fail(L, w, where, '收件人', m.to);
      if (m.subject !== E.subject) fail(L, w, where, '标题', m.subject);
      if (JSON.stringify(lines) !== JSON.stringify(E.lines)) fail(L, w, where, '正文提示', JSON.stringify(lines));
      if (!new RegExp(`^${VER.replace(/\./g, '\\.')} · \\S.* · \\S.* \\d`).test(last)) fail(L, w, where, '正文最后一行', last);
      res.push({ lang: L, w, where, subject: m.subject, last, hitH: box && Math.round(box.height) });
      console.log(`  ${L} ${w} ${where}: ${m.subject} | ${last}`);
    };
    await check('empty');
    await page.screenshot({ path: path.join(SH, `${L}_${w}.png`) });
    await page.evaluate(() => window.__yj.demo()); await page.waitForSelector('.ends');
    await page.waitForTimeout(400);
    await check(await page.evaluate(() => document.body.dataset.view));
    await page.click('[data-act="tpl"]'); await page.waitForSelector('#maps'); await page.waitForTimeout(400);
    await check(await page.evaluate(() => document.body.dataset.view));
    if (errs.length) fail(L, w, '控制台报错', errs.join(' | '));
    await ctx.close();
  }
  // UA → 简写
  const ctx = await br.newContext(); const page = await ctx.newPage(); await page.goto(URL + '?lang=en'); await page.waitForSelector('footer .fb');
  for (const [ua, hi, want] of UAS) {
    const got = await page.evaluate(([ua, hi]) => { Object.defineProperty(navigator, 'userAgent', { get: () => ua, configurable: true }); fbHi = hi; return fbDevice(); }, [ua, hi]);
    if (got !== want) fail('UA', want, '得到', got); else console.log('  UA', got);
  }
  await ctx.close(); await br.close();
  fs.writeFileSync(path.join(__dirname, '结果fb042.json'), JSON.stringify({ bad, res }, null, 1));
  console.log(bad ? `✗ ${bad} 处不对` : '✓ 全对');
  process.exit(bad ? 1 : 0);
})();
