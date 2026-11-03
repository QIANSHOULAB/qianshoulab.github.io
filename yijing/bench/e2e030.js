// 0.3.0 真流程 + 交货截图：node e2e030.js（YJ_URL 指向本地服务；先跑 gen.py --big）
// 390 / 1280 × 浅色 / 深色各一遍，控制台报错必须 0、不许横向滚动。截图进 shots-0.3/：<宽><浅l/深d>_<空状态 empty / 干活中 busy / 结果 result / 出错 error>.png，共 16 张
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const URL = process.env.YJ_URL || 'http://127.0.0.1:8765/yijing/', D = path.join(__dirname, 'data'), SH = path.join(__dirname, 'shots-0.3');
fs.mkdirSync(SH, { recursive: true });
(async () => {
  const b = await chromium.launch(); let errs = 0; const log = [];
  for (const [w, h] of [[390, 844], [1280, 900]]) for (const cs of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: cs, acceptDownloads: true });
    const pg = await ctx.newPage(), tag = `${w}${cs === 'dark' ? 'd' : 'l'}`;
    const bad = m => { errs++; log.push(tag + ' ' + m); };
    pg.on('console', m => { if (m.type() === 'error') bad('console ' + m.text()); });
    pg.on('pageerror', e => bad('pageerror ' + e.message));
    let dls = 0; pg.on('download', () => dls++);
    const hs = async n => { if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) bad('横向滚动 ' + n); };
    const shot = async n => { await pg.waitForTimeout(450); await hs(n); await pg.screenshot({ path: path.join(SH, `${tag}_${n}.png`) }); };
    const ready = n => pg.waitForFunction(n => window.__yj.S.src && window.__yj.S.src.name === n && window.__yj.S.bad != null, n, { timeout: 60000 });
    await pg.goto(URL); await pg.waitForTimeout(500);
    // 1 空状态
    if (await pg.evaluate(() => !!document.querySelector('[data-act="demo"]')) !== true) bad('空状态没有「用示例试试」');
    await shot('empty');
    // 2 出错：丢了个 PDF，错就写在丢文件那块
    await pg.setInputFiles('#fSrc', { name: '合同扫描件.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') });
    await pg.waitForSelector('.dropc .err'); await shot('error');
    // 3 用示例试试：一点就有结果，不自动下载
    await pg.click('[data-act="demo"]'); await pg.waitForFunction(() => window.__yj.S.bad != null);
    await pg.waitForTimeout(300); if (dls) bad('示例自己下载了');
    // 4 干活中：读大文件时的样子（读得太快截不到，按真实状态渲染一帧）
    await pg.evaluate(() => { window.__yj.S.busy = '客户全量导出.csv'; window.__yj.render(); scrollTo(0, 0); });
    await shot('busy');
    await pg.evaluate(() => { window.__yj.S.busy = null; window.__yj.render(); });
    // 5 第一次用：选目标 → 丢文件 → 3 处存疑（结果截图）→ 逐个点「对」，最后一下出文件
    await pg.click('[data-act="pick-tgt"]'); await pg.waitForTimeout(400); await pg.click('.sheet [data-act="tpl"][data-k="shopify"]'); await pg.waitForTimeout(500);
    await pg.setInputFiles('#fSrc', path.join(D, 'shop_cn_src.csv')); await ready('shop_cn_src.csv');
    await pg.evaluate(() => scrollTo(0, 0)); await shot('result');
    const nd = await pg.evaluate(() => window.__yj.doubts().length); if (nd !== 3) bad('存疑数不是 3：' + nd);
    // 撤销一次「对」
    await pg.click('#doubt [data-act="ok"]'); await pg.waitForTimeout(250); await pg.click('#toast [data-act="toast"]'); await pg.waitForTimeout(250);
    if (await pg.evaluate(() => window.__yj.doubts().length) !== 3) bad('「对」撤销不了');
    const d0 = dls;
    for (let i = 0; i < 3; i++) { await pg.click('#doubt [data-act="ok"]'); await pg.waitForTimeout(300); }
    await pg.waitForTimeout(800); if (dls !== d0 + 1) bad('最后一处点「对」没出文件');
    // 6 第二次用：重开，丢同样的表，直接出文件；「重新对」能撤
    await pg.reload(); await pg.waitForTimeout(500);
    if (await pg.evaluate(() => (window.__yj.S.tgt || {}).id) !== 'shopify') bad('没记住上回的目标');
    const d1 = dls; await pg.setInputFiles('#fSrc', path.join(D, 'shop_cn_src.csv')); await ready('shop_cn_src.csv'); await pg.waitForTimeout(1200);
    if (dls !== d1 + 1) bad('第二次没自动出文件');
    if (!(await pg.textContent('#toast')).includes('上回')) bad('第二次没说套了上回的对法');
    await pg.click('#toast [data-act="toast"]'); await pg.waitForTimeout(400);
    if (await pg.evaluate(() => window.__yj.S.recipe) !== null || await pg.evaluate(() => window.__yj.doubts().length) !== 3) bad('「重新对」没撤回去');
    // 7 打乱的 Shopify → 网店中文：没存疑，换目标那一下直接出；顺手整理开关来回
    await pg.setInputFiles('#fSrc', path.join(D, 'shopify_shuf_src.csv')); await ready('shopify_shuf_src.csv'); await pg.waitForTimeout(1000);
    const d2 = dls; await pg.click('[data-act="pick-tgt"]'); await pg.waitForTimeout(400); await pg.click('.sheet [data-act="tpl"][data-k="shop_cn"]');
    await pg.waitForFunction(() => window.__yj.S.bad != null); await pg.waitForTimeout(1200);
    if (dls !== d2 + 1) bad('没存疑却没直接出文件');
    if (!(await pg.textContent('#tidy')).includes('排回一起')) bad('没认出打乱的分组');
    const n0 = await pg.evaluate(() => window.__yj.S.rows.length);
    await pg.click('[data-act="tidy"][data-k="fill"]'); await pg.waitForTimeout(300); await pg.click('[data-act="tidy"][data-k="fill"]'); await pg.waitForTimeout(300);
    if (n0 !== await pg.evaluate(() => window.__yj.S.rows.length)) bad('开关来回后行数变了');
    // 8 英文空格标签：列弹层「按空格拆」三态
    await pg.setInputFiles('#fSrc', path.join(D, 'shop_en_src.csv')); await ready('shop_en_src.csv');
    await pg.click('[data-act="pick-tgt"]'); await pg.waitForTimeout(400); await pg.click('.sheet [data-act="tpl"][data-k="shopify"]'); await pg.waitForFunction(() => window.__yj.S.bad != null);
    const ti = await pg.evaluate(() => window.__yj.S.tgt.cols.findIndex(c => c.name === 'Tags'));
    await pg.click(`#maps .mrow[data-i="${ti}"]`); await pg.waitForTimeout(600);
    const o = async () => pg.evaluate(i => window.__yj.outRow(window.__yj.S.rows[0])[i], ti);
    const out1 = await o(); await pg.click('[data-act="lspace"]'); await pg.waitForTimeout(250); const out2 = await o(); await pg.click('[data-act="lspace"]'); await pg.waitForTimeout(250); const out3 = await o();
    if (out1 !== 'back to school, free shipping' || out2 !== 'back to school free shipping' || out3 !== out1) bad(`空格开关不对 ${out1}|${out2}|${out3}`);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    // 9 两个文件一起丢：行少的当目标模板
    const tplCsv = Buffer.from('Customer ID,First Name,Last Name,Email,Phone\n');
    await pg.setInputFiles('#fSrc', [{ name: 'crm_src.csv', mimeType: 'text/csv', buffer: fs.readFileSync(path.join(D, 'crm_src.csv')) }, { name: '新系统导入模板.csv', mimeType: 'text/csv', buffer: tplCsv }]);
    await ready('crm_src.csv'); await pg.waitForTimeout(300);
    const tn = await pg.evaluate(() => window.__yj.S.tgt.name + '|' + window.__yj.S.tgt.cols.length);
    if (tn !== '新系统导入模板|5') bad('两个文件没分对：' + tn);
    // 10 三种格式都能下
    for (const f of ['csv', 'xlsx', 'json']) {
      await pg.click(`[data-act="fmt"][data-f="${f}"]`);
      const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('[data-act="export"]')]);
      const p = await dl.path(); if (!p || fs.statSync(p).size < 1000) bad('导出 ' + f + ' 太小');
      await pg.waitForTimeout(400);
    }
    // 11 配方单子：自动记下来的在里面
    await pg.click('[data-act="recipes"]'); await pg.waitForTimeout(500);
    const nr = await pg.$$eval('.sheet [data-act="rec-apply"]', x => x.length); if (nr < 2) bad('配方单子里只有 ' + nr + ' 个');
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    log.push(`${tag} 走完，下载 ${dls} 次，配方 ${nr} 个`);
    await ctx.close();
  }
  await b.close();
  console.log(log.join('\n')); console.log('报错', errs);
  process.exit(errs ? 1 : 0);
})();
