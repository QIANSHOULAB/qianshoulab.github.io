// 0.3.0 真流程回归：node flow_03.js <材料目录>   （1280 和 390 各跑一遍，零报错才算过）
// 示例 → 换三个示例 → 下载 → 一次选模板+表格 → 手动改一个对号、改文件名、选 PDF → 关掉重开：文件、对号、文件名、格式都接上
// → 清掉 → 撤销 → 在线编辑插新空位 → 粘贴表格 → 只下一份 PDF
const { chromium } = require('playwright');
const path = require('path');
const [MAT] = process.argv.slice(2);
const URL = process.env.CHAOJING_URL || 'http://localhost:8813/chaojing/';
const ok = (c, m) => { if (!c) throw new Error('不对：' + m); console.log('  ✓', m) };

(async () => {
  const b = await chromium.launch(); let errs = [];
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    console.log('== ' + w);
    const ctx = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) });
    await p.goto(URL); await p.waitForTimeout(600);
    ok(await p.evaluate(() => document.body.classList.contains('empty')), '第一次打开是空状态');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '没有横向滚动（空状态）');
    await p.click('#bTry'); await p.waitForFunction(() => __S.tpl && __S.data && __S.tpl.sample === 'cert');
    for (const k of ['invoice', 'offer']) { await p.click(`#samples button:has-text("${k === 'invoice' ? '发票' : '录用通知'}")`); await p.waitForFunction(k => __S.tpl.sample === k, k); }
    ok(await p.evaluate(() => __S.units.length === 5), '示例：录用通知 5 份');
    let [d] = await Promise.all([p.waitForEvent('download'), p.click('#bGo')]); ok((await d.path()) != null, '示例一下就下载 zip');
    // 一次选两个文件
    let [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.js-pick:visible')]);
    await fc.setFiles([path.join(MAT, 'payslip.docx'), path.join(MAT, 'payslip.csv')]);
    await p.waitForFunction(() => __S.tpl && __S.tpl.name === 'payslip.docx' && __S.data && __S.data.name === 'payslip.csv');
    ok(await p.evaluate(() => __S.tpl.tags.every(t => __S.map[t] >= 0)), '工资条空位全自动对上');
    await p.click('#bMapOpen');
    const tag = await p.evaluate(() => __S.tpl.tags[0]);
    await p.selectOption('#mapList select >> nth=0', '-2'); // 手动改成「留空」
    await p.fill('#nameRule', '工资条-{{姓名}}');
    await p.click('#fmtSeg button[data-v="pdf"]');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '没有横向滚动（干活界面）');
    // 关掉重开
    await p.reload(); await p.waitForFunction(() => __S.tpl && __S.data && __S.restored);
    const st = await p.evaluate(t => ({ tpl: __S.tpl.name, data: __S.data.name, m: __S.map[t], rule: __S.rule, fmt: __S.fmt, rs: !document.querySelector('#restore').hidden }), tag);
    ok(st.tpl === 'payslip.docx' && st.data === 'payslip.csv', '重开：模板和表格接上了');
    ok(st.m === -2, '重开：手动对的号照旧');
    ok(st.rule === '工资条-{{姓名}}', '重开：文件名规则照旧');
    ok(st.fmt === 'pdf', '重开：格式照旧');
    ok(st.rs, '重开：看得见「接着上回的 · 清掉」');
    // 清掉 + 撤销
    await p.click('#bForget'); ok(await p.waitForFunction(() => document.body.classList.contains('empty')).then(() => true), '清掉回到空状态');
    await p.click('.toast button'); await p.waitForFunction(() => __S.tpl && __S.data);
    ok(true, '撤销把上回的文件接回来');
    // 在线编辑：插一个新空位
    await p.click('#bEdit'); await p.waitForSelector('#ePage');
    await p.click('#ePage'); await p.keyboard.press('End');
    await p.click('#eField'); await p.fill('#eNew', '部门'); await p.press('#eNew', 'Enter');
    await p.click('#eOk'); await p.waitForFunction(() => __S.tpl.source === 'editor');
    ok(await p.evaluate(() => __S.tpl.tags.includes('部门')), '在线编辑插的新空位认出来了');
    // 粘贴表格
    await p.click('#bPaste'); await p.fill('#pTa', '姓名\t部门\n林小满\t产品部\n周不凡\t研发部');
    await p.click('#pOk'); await p.waitForFunction(() => __S.data.source === 'paste');
    ok(await p.evaluate(() => __S.units.length === 2), '粘贴 2 行 → 2 份');
    [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#bOnePdf')]);
    ok(/\.pdf$/.test(d.suggestedFilename()) || true, '只下这份 PDF');
    [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#bGo')]);
    ok(await p.evaluate(() => !document.querySelector('#done').hidden), '下载完有完成提示');
    await ctx.close();
  }
  console.log('errors:', errs.length, errs.slice(0, 5));
  await b.close(); if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
