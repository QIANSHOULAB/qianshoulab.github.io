/* 代笔僧端到端测试：真把插件装进 Chromium，在本地测试站上把 20 行表从头填到尾。
 * 跑法（Linux 无显示器）：xvfb-run -a node daibi/test/e2e.js
 * 说明：侧栏在测试里以普通标签页打开（panel.html?tab=<目标标签页 id>），
 *       并给测试副本的 manifest 加了 127.0.0.1 的 host 权限，省掉授权弹窗（真用户点「对字段」时浏览器会问一次）。
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'daibi-shots');
const PORT = 18700;
const SITE = n => `http://127.0.0.1:${PORT + n}`;
const DATA = f => path.join(__dirname, 'data', f);
fs.mkdirSync(OUT, { recursive: true });

const expected = JSON.parse(fs.readFileSync(DATA('expected.json'), 'utf8'));
const problems = [];
const check = (ok, msg) => { if (!ok) { problems.push(msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'site.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
  await sleep(500);

  // 测试副本：加 127.0.0.1 的 host 权限
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-ext-'));
  fs.cpSync(path.join(ROOT, 'extension'), ext, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  mf.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'daibi-prof-'));
  const ctx = await chromium.launchPersistentContext(prof, {
    headless: false, viewport: { width: 980, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const errors = [];
  const watch = (p, name) => {
    p.on('pageerror', e => errors.push(`${name} pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  };

  const web = ctx.pages()[0] || await ctx.newPage();
  watch(web, 'web');
  await web.goto(SITE(0) + '/order');
  const panel = await ctx.newPage();
  watch(panel, 'panel');
  await panel.setViewportSize({ width: 380, height: 900 });
  await panel.goto(`chrome-extension://${extId}/panel.html`);
  const tabId = await panel.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1/*' }))[0].id);
  await panel.goto(`chrome-extension://${extId}/panel.html?tab=${tabId}`);
  await panel.waitForSelector('#btnMain');
  await panel.screenshot({ path: path.join(OUT, '00-empty.png') });

  const st = () => panel.evaluate(() => window.__daibi.S().st.map(x => x.s));
  const stm = () => panel.evaluate(() => window.__daibi.S().st);
  const binds = () => panel.evaluate(() => { const d = window.__daibi; return d.maps()[d.tab.origin] || null; });
  const mainText = () => panel.textContent('#btnMain');
  const waitFor = async (fn, ms, label) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } check(false, '超时：' + label); return false; };
  const reset = () => fetch(SITE(0) + '/api/reset', { method: 'POST' });
  const getLog = async () => (await fetch(SITE(0) + '/api/log')).json();
  const put = f => panel.setInputFiles('#file', { name: f, mimeType: 'application/octet-stream', buffer: fs.readFileSync(DATA(f)) });
  const setAuto = async on => { const c = await panel.isChecked('#set-auto'); if (c !== on) await panel.click('label.qs-set'); };

  /* ===== 1. 订单站：xlsx，自动对字段 + 点选一个 + 手动模式 ===== */
  console.log('\n[1] 订单录入：读 xlsx，对字段，手动模式');
  await put('订单20行.xlsx');
  await waitFor(async () => (await panel.textContent('#tMeta')).includes('20 行'), 5000, '读表');
  check((await panel.textContent('#tMeta')).trim() === '20 行 · 14 列', '读出 20 行 14 列（跳过「说明」页）');
  await waitFor(async () => !!(await binds()), 4000, '自动对字段');
  let b = (await binds()).b;
  console.log('    自动对上：', Object.entries(b).map(([h, x]) => `${h}→${x.label}(${x.conf} ${x.score})`).join('，'));
  const want = { 客户名: '#cust', 手机: 'input[name="c2"]', 邮箱: 'input[name="email"]', 公司: 'input[name="field_7"]', 产品: '#ver', 数量: '#qty', 配送方式: 'input[type=radio][name="ship"]', 渠道: 'input[type=checkbox][name="src"]', 交付日期: '#due', 备注: '#memo' };
  for (const [h, sel] of Object.entries(want)) check(b[h] && b[h].sel === sel, `「${h}」自动对上 ${sel}`);
  check(!b['开发票'], '「开发票」没把握，留给人点选');
  await panel.screenshot({ path: path.join(OUT, '01-matched.png') });

  // 点选：点「开发票」的点选，再点网页上的「需要发票」
  await panel.click('.frow[data-h="开发票"] [data-act=pick]');
  await sleep(300);
  await web.screenshot({ path: path.join(OUT, '02-picking-web.png') });
  await web.click('text=需要发票');
  await waitFor(async () => { const x = (await binds()).b['开发票']; return x && x.conf === 'manual'; }, 3000, '点选绑定');
  b = (await binds()).b;
  check(b['开发票'] && /name="inv"/.test(b['开发票'].sel) && b['开发票'].kind === 'checkbox', '点选绑上「需要发票」复选框');

  check((await mainText()) === '填第 1 行', '主按钮：填第 1 行');
  await reset();
  await panel.click('#btnMain');
  await waitFor(async () => (await st())[0] === 'filled', 4000, '第 1 行填好');
  const vals = await web.evaluate(() => ({
    c: cust.value, p: document.querySelector('[name=c2]').value, e: document.querySelector('[name=email]').value, co: document.querySelector('[name=field_7]').value,
    v: ver.value, q: qty.value, s: (document.querySelector('[name=ship]:checked') || {}).value, inv: document.querySelector('[name=inv]').checked,
    src: [...document.querySelectorAll('[name=src]:checked')].map(x => x.value).join(','), due: due.value, memo: memo.value
  }));
  console.log('    第 1 行写进网页：', JSON.stringify(vals));
  check(vals.c === '样例客户01' && vals.p === '13800000001' && vals.v === 'pro' && vals.q === '2' && vals.s === 'pickup' && vals.inv === true && vals.src === 'wechat' && vals.due === '2026-11-01', '第 1 行各类字段值都对');
  await web.screenshot({ path: path.join(OUT, '03-filled-web.png') });
  await sleep(3500);
  await panel.screenshot({ path: path.join(OUT, '03-filled-panel.png') });
  check((await getLog()).length === 0, '手动模式：没替人点提交');
  // 用户自己点提交
  await web.click('button:has-text("保存订单")');
  await waitFor(async () => (await st())[1] === 'filled', 5000, '提交后自动填第 2 行');
  const s1 = await st();
  check(s1[0] === 'done' && s1[1] === 'filled', '第 1 行标完成，第 2 行已自动填好等提交');
  check((await web.inputValue('#cust')) === '样例客户02', '网页上已是第 2 行的数据');

  /* ===== 2. 自动提交：20 行从头到尾 ===== */
  console.log('\n[2] 订单录入：自动提交，20 行计时');
  await put('订单20行.xlsx'); // 重新放表：状态清零，对应自动套上
  await waitFor(async () => (await panel.textContent('#fieldNote')).includes('上次的对应'), 3000, '套用上次对应');
  check(true, '同一网站再打开：上次的字段对应自动套上');
  await reset();
  await web.goto(SITE(0) + '/order');
  await setAuto(true);
  await waitFor(async () => (await mainText()) === '连填 20 行', 2000, '主按钮变「连填 20 行」');
  const t0 = Date.now();
  await panel.click('#btnMain');
  await waitFor(async () => (await st()).every(s => s === 'done'), 90000, '20 行全部完成');
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`    20 行用时 ${secs} 秒`);
  let lg = (await getLog()).filter(x => x.site === 'order');
  check(lg.length === 20, `服务器收到 20 单（实收 ${lg.length}）`);
  const PROD = { 标准版: 'std', 专业版: 'pro', 旗舰版: 'max' }, SHIP = { 快递: 'express', 自提: 'pickup', 同城: 'local' }, SRC = { 官网: 'web', 微信: 'wechat', 展会: 'expo', 朋友介绍: 'friend' };
  let bad = 0;
  lg.forEach((e, i) => {
    const r = expected[i], f = e.f;
    const src = [].concat(f.src || []).join(',');
    const wantSrc = r[8] ? r[8].split(/[、，]/).map(x => SRC[x]).sort((a, b) => ['web', 'wechat', 'expo', 'friend'].indexOf(a) - ['web', 'wechat', 'expo', 'friend'].indexOf(b)).join(',') : '';
    const ok = f.c1 === r[0] && f.c2 === r[1] && f.email === r[2] && f.field_7 === r[3] && f.product === PROD[r[4]] && f.qty === r[5] && f.ship === SHIP[r[6]] &&
      (f.inv === '1') === (r[7] === '是') && src === wantSrc && f.due === r[9] && (f.memo || '') === r[10];
    if (!ok) { bad++; console.log('    不对：', i + 1, JSON.stringify(f), JSON.stringify(r)); }
  });
  check(bad === 0, `20 单逐字段核对全对（错 ${bad}）`);
  await panel.screenshot({ path: path.join(OUT, '04-alldone.png') });
  await web.screenshot({ path: path.join(OUT, '04-web.png') });
  const orderSecs = secs;

  /* ===== 3. 两页向导 + 成功页（GBK CSV） ===== */
  console.log('\n[3] 报名向导：GBK CSV，两页 + 成功页');
  await reset();
  await web.goto(SITE(1) + '/wizard/1');
  await put('订单20行-GBK.csv');
  await waitFor(async () => (await panel.textContent('#tMeta')).includes('20 行'), 4000, '读 GBK CSV');
  check((await panel.evaluate(() => window.__daibi.S().table.headers[0])) === '客户名', 'GBK 编码 CSV 读出来不乱码：' + (await panel.evaluate(() => window.__daibi.S().table.headers.slice(0, 3).join('|'))));
  await waitFor(async () => !!(await binds()), 4000, '向导第 1 页对字段');
  b = (await binds()).b;
  check(b['客户名'] && b['客户名'].sel === '#n' && b['邮箱'] && b['邮箱'].sel === '#m' && b['性别'] && /sex/.test(b['性别'].sel), '第 1 页：客户名→姓名、邮箱、性别 对上');
  const t1 = Date.now();
  await panel.click('#btnMain');
  await waitFor(async () => (await st()).every(s => s === 'done'), 120000, '向导 20 行全部完成');
  const wizSecs = ((Date.now() - t1) / 1000).toFixed(1);
  lg = (await getLog()).filter(x => x.site === 'wizard');
  bad = 0;
  lg.forEach((e, i) => {
    const r = expected[i], f = e.f;
    const ok = f.name === r[0] && f.mail === r[2] && f.sex === (r[11] === '男' ? 'M' : 'F') && f.city === r[12] && f.bd === r[13] && (f.msg || '') === r[10];
    if (!ok) { bad++; console.log('    不对：', i + 1, JSON.stringify(f)); }
  });
  check(lg.length === 20 && bad === 0, `向导 20 份报名全对（收到 ${lg.length}，错 ${bad}），用时 ${wizSecs} 秒`);
  b = (await binds()).b;
  check(b['城市'] && b['生日'], '第 2 页的城市、生日在跑的时候自动补上对应');

  /* ===== 4. Ajax 不跳页表单 ===== */
  console.log('\n[4] Ajax 表单：不跳页，值只认 input 事件');
  await reset();
  await web.goto(SITE(2) + '/');
  await put('订单20行.xlsx');
  await waitFor(async () => !!(await binds()), 4000, 'Ajax 页对字段');
  const t2 = Date.now();
  await panel.click('#btnMain');
  await waitFor(async () => (await st()).every(s => s === 'done'), 120000, 'Ajax 20 行完成');
  lg = (await getLog()).filter(x => x.site === 'ajax');
  bad = lg.filter((e, i) => e.f.name !== expected[i][0] || e.f.phone !== expected[i][1] || e.f.company !== expected[i][3] || e.f.product !== expected[i][4]).length;
  check(lg.length === 20 && bad === 0, `Ajax 20 条全对（收到 ${lg.length}，错 ${bad}），用时 ${((Date.now() - t2) / 1000).toFixed(1)} 秒`);

  /* ===== 5. 验证码：停下等人 ===== */
  console.log('\n[5] 验证码');
  await reset();
  await web.goto(SITE(3) + '/');
  await put('订单20行.xlsx');
  await waitFor(async () => !!(await binds()), 4000, '验证码页对字段');
  await panel.click('#btnMain');
  await waitFor(async () => (await stm())[0].s === 'filled', 5000, '第 1 行填好');
  await sleep(1500);
  check((await getLog()).length === 0 && (await stm())[0].m === '卡在验证码', '遇到验证码：填好不提交，标「卡在验证码」');
  await panel.screenshot({ path: path.join(OUT, '05-captcha.png') });
  await web.check('#robot');
  await web.click('button:has-text("提交")');
  await waitFor(async () => (await st())[0] === 'done', 5000, '人过完验证码点提交 → 第 1 行完成');
  await waitFor(async () => (await stm())[1].s === 'filled', 5000, '接着填第 2 行又停在验证码');
  check((await getLog()).length === 1, '只交了人亲手点的那一单');
  await panel.click('#btnMain'); // 暂停
  await setAuto(false);

  /* ===== 6. 出错的行 ===== */
  console.log('\n[6] 坏数据：出错单列，能重试');
  await reset();
  await web.goto(SITE(0) + '/order');
  await put('坏一行.csv');
  await waitFor(async () => (await panel.textContent('#tMeta')).includes('3 行'), 3000, '读坏表');
  await setAuto(true);
  await panel.click('#btnMain');
  await waitFor(async () => (await st()).every(s => s !== 'todo' && s !== 'filled'), 30000, '坏表跑完');
  const sm = await stm();
  check(sm[0].s === 'done' && sm[1].s === 'error' && sm[2].s === 'done', '第 2 行出错，1、3 行照常完成');
  check(/企业版/.test(sm[1].m || ''), '出错原因写明：' + sm[1].m);
  check((await getLog()).length === 2, '坏行没提交');
  await panel.click('#seg button[data-f=error]');
  check((await panel.$$('.ri')).length === 1, '「出错」筛选只列出 1 行');
  await panel.screenshot({ path: path.join(OUT, '06-error.png') });
  check((await panel.isVisible('#btnRetry')) && (await panel.textContent('#btnRetry')).includes('1'), '有「重试出错的 1 行」按钮');
  await panel.click('#btnRetry');
  await waitFor(async () => (await st())[1] === 'error', 15000, '重试后仍标出错');
  check(true, '重试能跑（数据没改仍出错）');

  /* ===== 7. 重开侧栏：表格、状态、对应都还在 ===== */
  console.log('\n[7] 重开侧栏');
  await panel.reload();
  await panel.waitForSelector('#tMeta');
  await sleep(500);
  check((await panel.textContent('#tMeta')).includes('3 行') && (await st())[1] === 'error', '重开后表格和状态都在');

  // 截图：连填进行中 → 暂停（顺便测暂停）
  await web.goto(SITE(0) + '/order');
  await put('订单20行.xlsx');
  await sleep(600);
  await setAuto(true);
  await panel.click('#btnMain');
  await waitFor(async () => (await st()).filter(s => s === 'done').length >= 12, 30000, '跑到第 12 行');
  await panel.screenshot({ path: path.join(OUT, 'hero-panel.png') });
  await panel.click('#btnMain');
  await sleep(1500);
  const nDone = (await st()).filter(s => s === 'done').length;
  await sleep(1500);
  check((await st()).filter(s => s === 'done').length === nDone && (await mainText()).startsWith('连填'), '暂停后不再往下填');
  await web.screenshot({ path: path.join(OUT, 'hero-web.png') });

  // 截图：深色
  await setAuto(false);
  await web.goto(SITE(0) + '/order');
  await put('订单20行.xlsx');
  await sleep(800);
  await panel.click('#btnMain'); await sleep(800);
  await panel.emulateMedia({ colorScheme: 'dark' });
  await panel.screenshot({ path: path.join(OUT, '07-dark.png') });
  await panel.emulateMedia({ colorScheme: 'light' });
  await panel.screenshot({ path: path.join(OUT, '07-light.png') });
  await web.screenshot({ path: path.join(OUT, '07-web.png') });

  console.log('\n报错：', errors.length ? errors : '无');
  check(errors.length === 0, '全程控制台零报错');
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ orderSecs, wizSecs, problems, errors }, null, 2));
  await ctx.close(); server.kill();
  console.log(problems.length ? `\n${problems.length} 项没过` : '\n全部通过');
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
