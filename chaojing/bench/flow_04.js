// 0.4.0 真流程回归（中英两套）：node flow_04.js <材料目录>
// 英文、中文两种界面 × 1280、390 两个宽度，各从头跑一遍，零报错才算过。
// 规矩（Song 11-03 22:19）：默认英文，不跟浏览器语言走；右上角 EN / 中文 切换，选过就记住。
// 所以英文那遍故意用中文浏览器（zh-CN）开，看它还是英文；中文那遍用英文浏览器开，点右上角「中文」。
// 比 flow_03 多查：<html lang>、<title>、简介跟着当前语言，示例是这门语言的，英文界面没漏中文，
// 按钮没被撑破也没挤成两行，没有横向滚动；切换以后记住、示例跟着换、用户自己的文件不动。
const { chromium } = require('playwright');
const path = require('path');
const [MAT] = process.argv.slice(2);
const URL = process.env.CHAOJING_URL || 'http://localhost:8813/chaojing/';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ✗', m); } else console.log('  ✓', m) };

// 看得见的按钮 / 链接：字有没有溢出、有没有折成两行
const BTN_CHECK = () => {
  const bad = [];
  for (const el of document.querySelectorAll('button, a, .seg button, label')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
    const txt = el.textContent.trim(); if (!txt || el.closest('.page') || el.closest('#mapList select')) continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') bad.push('溢出:' + txt);
    // 只量字（图标不算）：哪一段字的顶比第一段字的底还低，就是折到第二行了
    const rects = []; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) { if (!n.nodeValue.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); rects.push(...[...rg.getClientRects()].filter(x => x.width > 1)); }
    rects.sort((a, b) => a.top - b.top);
    const wrapped = rects.length > 1 && rects.some(x => x.top >= rects[0].bottom - 2);
    const isBtn = el.tagName === 'BUTTON' && !el.closest('.samples-line') && !el.closest('footer');
    if (isBtn && wrapped) bad.push('两行:' + txt);
    if (isBtn && r.right > innerWidth + 1 && !el.closest('.toolbar')) bad.push('出界:' + txt); // 编辑器工具栏本来就横着滑
  }
  return bad;
};
const CJK = /[㐀-鿿＀-￯　-〿]/;

(async () => {
  const b = await chromium.launch(); let errs = [];
  for (const L of ['zh', 'en']) for (const [w, h] of [[1280, 900], [390, 844]]) {
    const O = L === 'zh' ? 'en' : 'zh', locale = L === 'zh' ? 'en-US' : 'zh-CN'; // 浏览器语言故意跟界面反着
    console.log(`== ${L} 界面（浏览器 ${locale}）${w}`);
    const ctx = await b.newContext({ viewport: { width: w, height: h }, locale, acceptDownloads: true, isMobile: w < 500, hasTouch: w < 500 });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${locale} ${w} ` + e)); p.on('console', m => { if (m.type() === 'error') errs.push(`${locale} ${w} ` + m.text()) });
    await p.goto(URL); await p.waitForTimeout(600);
    ok(await p.evaluate(() => document.documentElement.lang === 'en' && document.querySelector('#langSeg [aria-pressed="true"]').dataset.l === 'en'), `第一次打开是英文（浏览器语言 ${locale}，不跟它走）`);
    if (L === 'zh') { await p.click('#langSeg button[data-l="zh"]'); await p.waitForFunction(() => document.documentElement.lang === 'zh-CN'); }
    const S = await p.evaluate(L => ({ s: CJ_STRINGS[L], lang: document.documentElement.lang, title: document.title, desc: document.querySelector('meta[name=description]').content, hero: document.querySelector('.hero h1').textContent, text: document.body.innerText }), L);
    ok(S.lang === (L === 'zh' ? 'zh-CN' : 'en'), `<html lang> = ${S.lang}`);
    ok(S.title === S.s.docTitle && S.desc === S.s.metaDesc, `<title>、简介是${L === 'zh' ? '中文' : '英文'}：${S.title}`);
    ok(S.hero === S.s.heroT, '首屏大标题：' + S.hero);
    if (L === 'en') ok(!CJK.test(S.text.replace('中文', '')), '英文空状态没有漏中文（右上角「中文」切换钮除外）');
    ok(await p.evaluate(() => document.body.classList.contains('empty')), '第一次打开是空状态');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '没有横向滚动（空状态）');
    let bad = await p.evaluate(BTN_CHECK); ok(!bad.length, '空状态按钮没撑破、没折行 ' + bad.join(' '));
    // 示例
    await p.click('#bTry'); await p.waitForFunction(() => __S.tpl && __S.data && __S.tpl.sample === 'cert');
    const ex = await p.evaluate(() => ({ tpl: __S.tpl.name, rule: __S.rule, h: __S.data.headers, tags: __S.tpl.tags, map: __S.tpl.tags.every(t => __S.map[t] >= 0) }));
    ok(ex.tpl === S.s.examples.cert.file + '.docx' && ex.rule === S.s.examples.cert.rule, `示例证书是这门语言的：${ex.tpl} / 文件名 ${ex.rule}`);
    ok(ex.map, '示例空位全对上：' + ex.tags.join(','));
    if (L === 'en') ok(!CJK.test(await p.evaluate(() => document.body.innerText.replace('中文', ''))), '英文示例界面没有漏中文');
    bad = await p.evaluate(BTN_CHECK); ok(!bad.length, '干活界面按钮没撑破、没折行 ' + bad.join(' '));
    await p.click('#samples button[data-k="invoice"]'); await p.waitForFunction(() => __S.tpl.sample === 'invoice');
    ok(await p.evaluate(() => __S.units.length === 4 && !!__S.group), '示例发票：8 行并成 4 张');
    await p.click('#samples button[data-k="offer"]'); await p.waitForFunction(() => __S.tpl.sample === 'offer');
    ok(await p.evaluate(() => __S.units.length === 5), '示例录用：5 份');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '没有横向滚动（示例）');
    let [d] = await Promise.all([p.waitForEvent('download'), p.click('#bGo')]); ok((await d.path()) != null, '示例一下就下载 zip');
    await p.waitForFunction(() => !document.querySelector('#done').hidden);
    ok(await p.evaluate(L => document.querySelector('#doneT').textContent.replace(/\d+\.\d/, 'X') === CJ_STRINGS[L].doneMsg(5, 'X'), L), '完成提示：' + await p.evaluate(() => document.querySelector('#doneT').textContent));
    // 语言切换：示例跟着换
    await p.click(`#langSeg button[data-l="${O}"]`); await p.waitForFunction(O => document.documentElement.lang.startsWith(O), O);
    const sw = await p.evaluate(O => ({ tpl: __S.tpl.name, want: CJ_STRINGS[O].examples.offer.file + '.docx', title: document.title, want2: CJ_STRINGS[O].docTitle, stored: localStorage.getItem('chaojing.lang') }), O);
    ok(sw.tpl === sw.want && sw.title === sw.want2 && sw.stored === O, `右上角切到 ${O}：示例换成 ${sw.tpl}，标题 ${sw.title}，记住了`);
    bad = await p.evaluate(BTN_CHECK); ok(!bad.length, '切过去以后按钮没撑破、没折行 ' + bad.join(' '));
    await p.click(`#langSeg button[data-l="${L}"]`); await p.waitForFunction(L => document.documentElement.lang.startsWith(L), L);
    // 一次选两个文件（用户自己的中文模板和表格）
    let [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.js-pick:visible')]);
    await fc.setFiles([path.join(MAT, 'payslip.docx'), path.join(MAT, 'payslip.csv')]);
    await p.waitForFunction(() => __S.tpl && __S.tpl.name === 'payslip.docx' && __S.data && __S.data.name === 'payslip.csv');
    ok(await p.evaluate(() => __S.tpl.tags.every(t => __S.map[t] >= 0)), '工资条空位全自动对上');
    await p.click('#bMapOpen');
    const tag = await p.evaluate(() => __S.tpl.tags[0]);
    await p.selectOption('#mapList select >> nth=0', '-2');
    const rule = L === 'zh' ? '工资条-{{姓名}}' : 'Payslip - {{姓名}}';
    await p.fill('#nameRule', rule);
    await p.click('#fmtSeg button[data-v="pdf"]');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '没有横向滚动（干活界面）');
    bad = await p.evaluate(BTN_CHECK); ok(!bad.length, '对号展开后按钮没撑破、没折行 ' + bad.join(' '));
    // 关掉重开
    await p.reload(); await p.waitForFunction(() => __S.tpl && __S.data && __S.restored);
    const st = await p.evaluate(t => ({ tpl: __S.tpl.name, data: __S.data.name, m: __S.map[t], rule: __S.rule, fmt: __S.fmt, rs: !document.querySelector('#restore').hidden, rt: document.querySelector('#restoreT').textContent, lang: document.documentElement.lang }), tag);
    ok(st.tpl === 'payslip.docx' && st.data === 'payslip.csv', '重开：模板和表格接上了');
    ok(st.m === -2 && st.rule === rule && st.fmt === 'pdf', '重开：对号、文件名、格式照旧');
    ok(st.rs, '重开：看得见「' + st.rt + '」');
    ok(st.lang.startsWith(L), '重开：语言还是 ' + st.lang);
    // 清掉 + 撤销
    await p.click('#bForget'); await p.waitForFunction(() => document.body.classList.contains('empty'));
    await p.click('.toast button'); await p.waitForFunction(() => __S.tpl && __S.data);
    ok(true, '清掉回到空状态，撤销接回来');
    // 在线编辑插新空位
    const nf = L === 'zh' ? '部门' : 'Dept';
    await p.click('#bEdit'); await p.waitForSelector('#ePage');
    bad = await p.evaluate(BTN_CHECK); ok(!bad.length, '在线编辑按钮没撑破、没折行 ' + bad.join(' '));
    await p.click('#ePage'); await p.keyboard.press('End');
    await p.click('#eField'); await p.fill('#eNew', nf); await p.press('#eNew', 'Enter');
    await p.click('#eOk'); await p.waitForFunction(() => __S.tpl.source === 'editor');
    ok(await p.evaluate(nf => __S.tpl.tags.includes(nf), nf), '在线编辑插的新空位认出来了');
    // 粘贴表格
    await p.click('#bPaste');
    ok(await p.evaluate(L => document.querySelector('#pTa').placeholder === CJ_STRINGS[L].pastePh, L), '粘贴框的示意是这门语言的');
    await p.fill('#pTa', L === 'zh' ? '姓名\t部门\n林小满\t产品部\n周不凡\t研发部' : 'Name\tDept\nAva Chen\tProduct\nLeo Park\tEngineering');
    await p.click('#pOk'); await p.waitForFunction(() => __S.data.source === 'paste');
    ok(await p.evaluate(() => __S.units.length === 2), '粘贴 2 行 → 2 份');
    // 换语言：用户自己的模板和表格一个字不动
    const before = await p.evaluate(() => JSON.stringify([__S.tpl.name, __S.tpl.html, __S.data.headers, __S.data.rows]));
    await p.click(`#langSeg button[data-l="${O}"]`); await p.waitForFunction(O => document.documentElement.lang.startsWith(O), O);
    ok(await p.evaluate(b => JSON.stringify([__S.tpl.name, __S.tpl.html, __S.data.headers, __S.data.rows]) === b, before), '换语言：自己的模板和表格原样');
    await p.click(`#langSeg button[data-l="${L}"]`); await p.waitForFunction(L => document.documentElement.lang.startsWith(L), L);
    [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#bOnePdf')]);
    ok((await d.path()) != null, '只下这份 PDF');
    [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#bGo')]);
    ok(await p.evaluate(() => !document.querySelector('#done').hidden), '下载完有完成提示');
    await ctx.close();
  }
  console.log('errors:', errs.length, errs.slice(0, 5), 'fails:', fails);
  await b.close(); if (errs.length || fails) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
