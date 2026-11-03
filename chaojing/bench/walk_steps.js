// 步骤账：node walk_steps.js <old|new> <材料目录> <输出目录>
// 照真人走一遍主流程：第一次打开 → 丢模板 + 表格 → 看预览 → 选 PDF → 拿到 zip；
// 关掉再开（同一个浏览器，留着本地存储）当「第二次用」：丢这个月的新表 → 看预览 → 拿到 zip。
// 每一下动作记一行（下 = 点一下 / 选一次文件 / 拖一次）。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [VER, MAT, OUT] = process.argv.slice(2);
const URL = process.env.CHAOJING_URL || (VER === 'old' ? 'http://localhost:8791/chaojing/' : 'http://localhost:8813/chaojing/');
fs.mkdirSync(OUT, { recursive: true });
const tpl = path.join(MAT, 'notice.docx'), data = path.join(MAT, 'notice.xlsx');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const log = []; const errs = [];
  const step = (run, what, n = 1) => log.push({ run, what, n });
  async function open(page) { await page.goto(URL); await page.waitForLoadState('networkidle'); await page.waitForTimeout(600); }
  async function ready(page) { await page.waitForFunction(() => window.__S && __S.data && __S.data.name.includes('notice') && __S.tpl && __S.tpl.name.includes('notice'), null, { timeout: 30000 }); await page.waitForTimeout(1500); }
  async function state(page) { return page.evaluate(() => ({ fmt: __S.fmt, rule: __S.rule, tpl: __S.tpl && __S.tpl.name, data: __S.data && __S.data.name, units: __S.units && __S.units.length, unmatched: __S.tpl ? __S.tpl.tags.filter(t => __S.map[t] < 0) : [] })); }
  async function dl(page, sel, name) { const t0 = Date.now(); const [d] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click(sel)]); await d.saveAs(path.join(OUT, name)); return (Date.now() - t0) / 1000; }

  for (const run of [1, 2]) {
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) });
    await open(page);
    const s0 = await state(page); step(run, `打开（开机就有：模板 ${s0.tpl || '无'} / 表格 ${s0.data || '无'} / 格式 ${s0.fmt}）`, 0);
    if (VER === 'old') {
      const [a] = await Promise.all([page.waitForEvent('filechooser'), page.click('#bUpTpl')]); step(run, '点「上传 Word」');
      await a.setFiles(tpl); step(run, '在文件框里选 notice.docx'); await page.waitForTimeout(800);
      const [b] = await Promise.all([page.waitForEvent('filechooser'), page.click('#bUpData')]); step(run, '点「上传 Excel / CSV」');
      await b.setFiles(data); step(run, '在文件框里选 notice.xlsx'); await ready(page);
    } else {
      const s = await state(page);
      if (run === 1 || !s.tpl || !s.tpl.includes('notice')) {
        const [a] = await Promise.all([page.waitForEvent('filechooser'), page.click('.js-pick:visible')]); step(run, '点「选文件」');
        await a.setFiles([tpl, data]); step(run, '在文件框里一次选 notice.docx + notice.xlsx');
      } else {
        const [a] = await Promise.all([page.waitForEvent('filechooser'), page.click('.js-pick:visible')]); step(run, '点「选文件」');
        await a.setFiles([data]); step(run, '只选这个月的 notice.xlsx（模板上回的还在）');
      }
      await ready(page);
    }
    const s1 = await state(page); step(run, `看对号入座：${s1.unmatched.length ? s1.unmatched.length + ' 个没对上' : '全自动对上'}；预览翻到第 2 份看一眼`, 0);
    await page.click('#bNext'); step(run, '点「下一份」看一眼（核对）'); await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `${VER}-run${run}-ready.png`) });
    const s2 = await state(page);
    if (s2.fmt !== 'pdf') { await page.click('#fmtSeg button[data-v="pdf"]'); step(run, `点「PDF」（格式原来是 ${s2.fmt}）`); }
    else step(run, '格式已是 PDF（记住了上回的）', 0);
    const sec = await dl(page, '#bGo', `${VER}-run${run}.zip`);
    step(run, `点「${(await page.textContent('#bGo')).trim()}」→ zip 到手（${sec.toFixed(1)} 秒）`);
    const s3 = await state(page); step(run, `收尾：格式 ${s3.fmt}，文件名规则 ${s3.rule}`, 0);
    await page.close();
  }
  const total = r => log.filter(x => x.run === r).reduce((a, x) => a + x.n, 0);
  fs.writeFileSync(path.join(OUT, `${VER}-steps.json`), JSON.stringify({ log, first: total(1), second: total(2), errs }, null, 1));
  for (const r of [1, 2]) { console.log(`== ${VER} 第${r}次用：${total(r)} 下`); log.filter(x => x.run === r).forEach(x => console.log(`  [${x.n}] ${x.what}`)); }
  console.log('errors:', errs.length, errs.slice(0, 5));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
