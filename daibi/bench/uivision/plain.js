// UI.Vision 的做法：照第一行写好每一步，再把值换成 CSV 的列；一行出错跳过接着下一行（try/catch）。
const rows = uiv.csv.read('t20.csv').slice(1);
const p = uiv.page;
for (const r of rows) {
  try {
    uiv.goto('http://127.0.0.1:19900/');
    p.fill('id=f1', r[0]);
    p.fill('id=f2', r[1]);
    p.fill('id=f3', r[2]);
    p.fill('id=f4', r[3]);
    p.selectOption('id=f5', r[4]);
    p.fill('id=f6', r[5]);
    p.selectOption('id=f7', r[6]);
    p.fill('id=f8', r[7]);
    p.fill('id=f9', r[8]);
    p.click('css=button[type=submit]');
    uiv.sleep('0.5s');
  } catch (e) { uiv.log('row error: ' + r[0] + ' ' + e.message); }
}
