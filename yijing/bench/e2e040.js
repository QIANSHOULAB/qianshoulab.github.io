// 0.4.0 真流程（中英两套）+ 交货截图：node e2e040.js（YJ_URL 指向本地服务；先跑 gen.py）
// 中文、英文各一遍 × 手机 390、电脑 1280：控制台报错必须 0、不许横向滚动、按钮不许被字撑破或挤成两行、界面字不许被切掉。
// 语言规矩（Song 11-03 22:19）：默认英文，右上角 EN / 中文 切换，选过就记住，不看浏览器语言。所以故意反着给浏览器语言：英文那遍用 zh-CN 浏览器、中文那遍用 en-US 浏览器。
// 截图进 shots-0.4/：<zh|en>_<宽>_<空状态 empty / 结果 result>.png 共 8 张；另加手机上两张弹层 <zh|en>_390_<sheet|rule>.png 给人看英文控件。
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const URL = process.env.YJ_URL || 'http://127.0.0.1:8765/yijing/', D = path.join(__dirname, 'data'), SH = path.join(__dirname, 'shots-0.4');
fs.mkdirSync(SH, { recursive: true });
const LOC = {
  zh: { locale: 'en-US', lang: 'zh-CN', title: '译经僧 · 凡表皆可转，万物皆可通', err: '读不动', recAuto: '上回', regroup: '排回一起', demo: '旧 CRM 客户表.csv', other: 'en', otherL: 'en', otherDemo: 'old-crm-contacts.csv', home: '千手院' },
  en: { locale: 'zh-CN', lang: 'en', title: 'Yijing · Data Mover — data migration, minus the suffering', err: 'Can’t read', recAuto: 'last time', regroup: 'Regroup', demo: 'old-crm-contacts.csv', other: 'zh-CN', otherL: 'zh', otherDemo: '旧 CRM 客户表.csv', home: 'Qianshou Lab' },
};
// 页面里量：按钮的字一个文字节点只许占一行、不许溢出按钮；带省略号的界面字不许被切（数据格子、模板列名预览这种故意省略的不算）
const MEASURE = () => {
  const out = { wrap: [], over: [], cut: [], dataCut: 0 };
  const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && el.closest('[hidden]') === null; };
  const lines = node => { const rg = document.createRange(); rg.selectNodeContents(node); return new Set([...rg.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top / 4))).size; };
  for (const el of document.querySelectorAll('button, .btn, a.nav-back, [role="button"]')) {
    if (!vis(el) || el.matches('.mrow, .dz')) continue;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    // 列表行（模板单子、配方单子）本来就是两行的行，不算按钮；只量真按钮
    if (!el.matches('.li-row, .list .li')) for (let t; (t = tw.nextNode());) { if (t.textContent.trim() && lines(t) > 1) out.wrap.push(t.textContent.trim()); }
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.over.push(el.textContent.trim());
    const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect();
    if (r.right > innerWidth + 1) out.over.push('出屏 ' + el.textContent.trim());
  }
  const DATA = 'td, th, .li-main small, .m-x, .dock-f, .pv .a, .pv .b, .vk, .end-s, option, .m-t span, .end.src .end-t';
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || !el.childNodes.length) continue;
    const cs = getComputedStyle(el);
    const ell = cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
    const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1;
    if (!ell && !clamp) continue;
    if (el.matches(DATA)) out.dataCut++; else out.cut.push((el.className || el.tagName) + ': ' + el.textContent.trim().slice(0, 60));
  }
  return out;
};
(async () => {
  const b = await chromium.launch(); let errs = 0; const log = [];
  for (const L of ['zh', 'en']) for (const [w, h] of [[390, 844], [1280, 900]]) {
    const X = LOC[L];
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: X.locale, acceptDownloads: true });
    const pg = await ctx.newPage(), tag = `${L}_${w}`;
    const bad = m => { errs++; log.push(tag + ' ✗ ' + m); };
    pg.on('console', m => { if (m.type() === 'error') bad('console ' + m.text()); });
    pg.on('pageerror', e => bad('pageerror ' + e.message));
    let dls = 0; pg.on('download', () => dls++);
    let cuts = 0;
    const look = async n => {
      if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) bad('横向滚动 ' + n);
      const m = await pg.evaluate(MEASURE); cuts += m.dataCut;
      m.wrap.forEach(t => bad(`${n} 按钮挤成两行「${t}」`)); m.over.forEach(t => bad(`${n} 按钮被撑破「${t}」`)); m.cut.forEach(t => bad(`${n} 字被切「${t}」`));
    };
    const shot = async n => { await pg.waitForTimeout(450); await look(n); await pg.screenshot({ path: path.join(SH, `${tag}_${n}.png`) }); };
    const ready = n => pg.waitForFunction(n => window.__yj.S.src && window.__yj.S.src.name === n && window.__yj.S.bad != null, n, { timeout: 60000 });
    const pickTpl = async k => { await pg.click('[data-act="pick-tgt"]'); await pg.waitForTimeout(400); await look('模板单子'); await pg.click(`.sheet [data-act="tpl"][data-k="${k}"]`); await pg.waitForTimeout(400); };
    const openCol = async name => { const i = await pg.evaluate(n => window.__yj.S.tgt.cols.findIndex(c => c.name === n), name); await pg.click(`#maps .mrow[data-i="${i}"]`); await pg.waitForTimeout(600); return i; };
    await pg.goto(URL); await pg.waitForTimeout(500);
    // 0 第一次打开一律英文（不看浏览器语言）；中文那遍点右上角「中文」，重开还是中文。<html lang>、<title>、meta description、顶栏跟着当前语言
    const headOf = () => pg.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, desc: document.querySelector('meta[name="description"]').content, home: document.querySelector('#navBack').textContent.trim(), on: (document.querySelector('#navLang [aria-pressed="true"]') || {}).textContent }));
    let head = await headOf();
    if (head.lang !== 'en' || head.on !== 'EN') bad('第一次打开不是英文：' + JSON.stringify(head));
    if (L === 'zh') { await pg.click('#navLang [data-l="zh"]'); await pg.waitForTimeout(300); await pg.reload(); await pg.waitForTimeout(500); head = await headOf(); }
    if (head.lang !== X.lang || head.title !== X.title || head.home !== X.home) bad('语言不对：' + JSON.stringify(head));
    if (L === 'en' && /[一-鿿]/.test(head.desc)) bad('英文 meta description 里有中文');
    // 1 空状态
    if (!await pg.evaluate(() => !!document.querySelector('[data-act="demo"]'))) bad('空状态没有「用示例试试」');
    await shot('empty');
    // 2 出错：丢了个 PDF，错就写在丢文件那块
    await pg.setInputFiles('#fSrc', { name: '合同扫描件.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') });
    await pg.waitForSelector('.dropc .err'); if (!(await pg.textContent('.dropc .err')).includes(X.err)) bad('出错那句不是这门语言'); await look('出错');
    // 3 用示例试试：这门语言的示例，一点就有结果，不自动下载（结果截图）
    await pg.click('[data-act="demo"]'); await pg.waitForFunction(() => window.__yj.S.bad != null);
    await pg.waitForTimeout(300); if (dls) bad('示例自己下载了');
    if (await pg.evaluate(() => window.__yj.S.src.name) !== X.demo) bad('示例不是这门语言的');
    const dd = await pg.evaluate(() => window.__yj.doubts().length); if (dd !== 3) bad('示例存疑数不是 3：' + dd);
    await pg.evaluate(() => scrollTo(0, 0)); await shot('result');
    // 4 干活中：读大文件时的样子（读得太快看不到，按真实状态渲染一帧量一下）
    await pg.evaluate(() => { window.__yj.S.busy = 'customers-full-export.csv'; window.__yj.render(); scrollTo(0, 0); });
    await pg.waitForTimeout(200); await look('干活中');
    await pg.evaluate(() => { window.__yj.S.busy = null; window.__yj.render(); });
    // 5 第一次用：选目标 → 丢文件 → 3 处存疑 → 撤销一次「对」→ 逐个点「对」，最后一下出文件
    await pickTpl('shopify');
    await pg.setInputFiles('#fSrc', path.join(D, 'shop_cn_src.csv')); await ready('shop_cn_src.csv');
    const nd = await pg.evaluate(() => window.__yj.doubts().length); if (nd !== 3) bad('存疑数不是 3：' + nd);
    await pg.click('#doubt [data-act="ok"]'); await pg.waitForTimeout(250); await look('点了「对」的吐司'); await pg.click('#toast [data-act="toast"]'); await pg.waitForTimeout(250);
    if (await pg.evaluate(() => window.__yj.doubts().length) !== 3) bad('「对」撤销不了');
    const d0 = dls;
    for (let i = 0; i < 3; i++) { await pg.click('#doubt [data-act="ok"]'); await pg.waitForTimeout(300); }
    await pg.waitForTimeout(800); if (dls !== d0 + 1) bad('最后一处点「对」没出文件');
    await look('下好了');
    // 6 第二次用：重开，丢同样的表，直接出文件；吐司说套了上回的对法；「重新对」能撤
    await pg.reload(); await pg.waitForTimeout(500);
    if (await pg.evaluate(() => (window.__yj.S.tgt || {}).id) !== 'shopify') bad('没记住上回的目标');
    const d1 = dls; await pg.setInputFiles('#fSrc', path.join(D, 'shop_cn_src.csv')); await ready('shop_cn_src.csv'); await pg.waitForTimeout(1200);
    if (dls !== d1 + 1) bad('第二次没自动出文件');
    if (!(await pg.textContent('#toast')).includes(X.recAuto)) bad('第二次没说套了上回的对法');
    await look('套了上回的吐司');
    await pg.click('#toast [data-act="toast"]'); await pg.waitForTimeout(400);
    if (await pg.evaluate(() => window.__yj.S.recipe) !== null || await pg.evaluate(() => window.__yj.doubts().length) !== 3) bad('「重新对」没撤回去');
    // 7 打乱的 Shopify → 网店中文：没存疑，换目标那一下直接出；顺手整理开关来回
    await pg.setInputFiles('#fSrc', path.join(D, 'shopify_shuf_src.csv')); await ready('shopify_shuf_src.csv'); await pg.waitForTimeout(1000);
    const d2 = dls; await pickTpl('shop_cn');
    await pg.waitForFunction(() => window.__yj.S.bad != null); await pg.waitForTimeout(1200);
    if (dls !== d2 + 1) bad('没存疑却没直接出文件');
    if (!(await pg.textContent('#tidy')).includes(X.regroup)) bad('没认出打乱的分组');
    await look('顺手整理');
    const n0 = await pg.evaluate(() => window.__yj.S.rows.length);
    await pg.click('[data-act="tidy"][data-k="fill"]'); await pg.waitForTimeout(300); await pg.click('[data-act="tidy"][data-k="fill"]'); await pg.waitForTimeout(300);
    if (n0 !== await pg.evaluate(() => window.__yj.S.rows.length)) bad('开关来回后行数变了');
    // 8 英文空格标签：列弹层「按空格拆」三态
    await pg.setInputFiles('#fSrc', path.join(D, 'shop_en_src.csv')); await ready('shop_en_src.csv');
    await pickTpl('shopify'); await pg.waitForFunction(() => window.__yj.S.bad != null);
    const ti = await openCol('Tags'); await look('弹层 多值');
    const o = async () => pg.evaluate(i => window.__yj.outRow(window.__yj.S.rows[0])[i], ti);
    const out1 = await o(); await pg.click('[data-act="lspace"]'); await pg.waitForTimeout(250); const out2 = await o(); await pg.click('[data-act="lspace"]'); await pg.waitForTimeout(250); const out3 = await o();
    if (out1 !== 'back to school, free shipping' || out2 !== 'back to school free shipping' || out3 !== out1) bad(`空格开关不对 ${out1}|${out2}|${out3}`);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    // 9 弹层里的控件：电话（选列、填码、开关、写法）、日期、选项换值
    await pg.setInputFiles('#fSrc', path.join(D, 'crm_src.csv')); await ready('crm_src.csv');
    await pickTpl('crm'); await pg.waitForFunction(() => window.__yj.S.bad != null);
    await openCol('Phone'); if (w === 390) await shot('sheet'); else await look('弹层 电话');
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    for (const c of ['Created Date', 'Gender', 'First Name']) { await openCol(c); await look('弹层 ' + c); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400); }
    // 10 按条件换值：会计科目「损益」按科目代码分收入 / 费用
    await pg.setInputFiles('#fSrc', path.join(D, 'coa_src_gbk.csv')); await ready('coa_src_gbk.csv');
    await pickTpl('coa_en'); await pg.waitForFunction(() => window.__yj.S.bad != null);
    await openCol('Type'); await pg.evaluate(() => { const r = document.querySelector('.sheet .f-row.rule'); if (r) r.scrollIntoView({ block: 'center' }); });
    if (!await pg.evaluate(() => !!document.querySelector('.sheet .f-row.rule'))) bad('「损益」没出按条件那行');
    if (w === 390) await shot('rule'); else await look('弹层 按条件');
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    // 11 两个文件一起丢：行少的当目标模板
    const tplCsv = Buffer.from('Customer ID,First Name,Last Name,Email,Phone\n');
    await pg.setInputFiles('#fSrc', [{ name: 'crm_src.csv', mimeType: 'text/csv', buffer: fs.readFileSync(path.join(D, 'crm_src.csv')) }, { name: '新系统导入模板.csv', mimeType: 'text/csv', buffer: tplCsv }]);
    await ready('crm_src.csv'); await pg.waitForTimeout(300);
    const tn = await pg.evaluate(() => window.__yj.S.tgt.name + '|' + window.__yj.S.tgt.cols.length);
    if (tn !== '新系统导入模板|5') bad('两个文件没分对：' + tn);
    // 12 三种格式都能下
    for (const f of ['csv', 'xlsx', 'json']) {
      await pg.click(`[data-act="fmt"][data-f="${f}"]`);
      const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('[data-act="export"]')]);
      const p = await dl.path(); if (!p || fs.statSync(p).size < 1000) bad('导出 ' + f + ' 太小');
      await pg.waitForTimeout(400);
    }
    // 13 配方单子：自动记下来的在里面
    await pg.click('[data-act="recipes"]'); await pg.waitForTimeout(500); await look('配方单子');
    const nr = await pg.$$eval('.sheet [data-act="rec-apply"]', x => x.length); if (nr < 2) bad('配方单子里只有 ' + nr + ' 个');
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    // 14 右上角切语言：示例跟着换、<html lang> 跟着换；重开还记得；切回来
    await pg.goto(URL); await pg.waitForTimeout(400); await pg.click('[data-act="demo"]'); await pg.waitForFunction(() => window.__yj.S.bad != null);
    await pg.click(`#navLang [data-l="${X.otherL}"]`); await pg.waitForFunction(() => window.__yj.S.bad != null); await pg.waitForTimeout(300);
    let st = await pg.evaluate(() => [document.documentElement.lang, window.__yj.S.src.name]);
    if (st[0] !== X.other || st[1] !== X.otherDemo) bad('切语言没切过去：' + st);
    await look('切过去以后');
    await pg.reload(); await pg.waitForTimeout(400);
    if (await pg.evaluate(() => document.documentElement.lang) !== X.other) bad('重开没记住切过的语言');
    await pg.click(`#navLang [data-l="${L}"]`); await pg.waitForTimeout(300);
    st = await pg.evaluate(() => [document.documentElement.lang, document.title]);
    if (st[0] !== X.lang || st[1] !== X.title) bad('切回来不对：' + st);
    log.push(`${tag} 走完，下载 ${dls} 次，配方 ${nr} 个，故意省略的数据格 ${cuts} 处`);
    await ctx.close();
  }
  await b.close();
  console.log(log.join('\n')); console.log('报错', errs);
  process.exit(errs ? 1 : 0);
})();
