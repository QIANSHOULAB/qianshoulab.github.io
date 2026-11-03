// 导出界面文字给人逐条读：node strings040.js → strings-0.4/zh.txt、en.txt（一行一条：键<TAB>字；两份同一行是同一条）
// 顺手查两套的键对不对得上：缺一条就报错退出。带参数的字用下面的样例参数算出来。示例数据（demoData）两套各是各的，排在最后、不对行。
const fs = require('fs'), path = require('path'), vm = require('vm');
const W = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'strings.js'), 'utf8'), { window: W });
const { zh, en } = W.YJ_STR;
// 样例参数：按键名给；L 是当前这套（有的参数本身也要用这套的字）
const SAMPLE = {
  rc: () => [1234, 11], cols: () => [13], rcOut: () => [1300, 1200], mapSub: () => [13, 9, 2, 1, 1],
  unused: L => [['备注', 'Tags'].join(L.listSep)], constOf: () => ['VIP'], noteRule: () => ['损益', 'Account Code'], noteAmbig: () => ['Other'],
  badN: () => [12], doubtSub: () => [3], okDone: () => ['Email', 2], prevSub: () => [20], prevBad: () => [12], exportBtn: () => [1234],
  dockDone: () => ['contacts → CRM contacts.csv', '14:05'], dockWait: () => [2], opList: () => [', '], dAuto: L => [L.dOrders.MDY], ccByOp: () => ['Country'],
  listPhr: () => [['back to school', 'free shipping', 'gift ideas', 'new in']], fillS: () => ['Handle'], recSub: () => [13, '2026-11-03'], recFile: () => ['2026-11-03'],
  savedMsg: L => [L.exported(1234, '0.4')], recAuto: () => ['contacts → CRM'], recImported: () => [3], reading: () => ['contacts.csv'], readErr: L => ['scan.pdf', L.notTable],
  exported: () => [1234, '0.4'], secs: () => ['0.4'], sheetNote: () => [3], prof: () => ['Shopify'], colN: () => [3],
  tidyFill: () => ['Handle'], tidyGroup: () => ['Handle'], tidyFillS: () => [['Title', 'Vendor', 'Type', 'Tags', 'Body'], 5], tidyDrop: () => ['SKU', 12], tidyDropS: () => ['SKU'],
};
const out = { zh: [], en: [] }; let bad = 0;
function walk(a, b, key) {
  // 示例数据两套本来就不是一个样（中文是中文客户表、英文是英文客户表），各自导出、不对键，放在最后
  if (key === 'demoData') { for (const [v, o] of [[a, out.zh], [b, out.en]]) demo.push([v, o]); return; }
  const ta = Array.isArray(a) ? 'array' : typeof a, tb = Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb) { console.error('两套类型不一样：', key, ta, tb); bad++; return; }
  if (ta === 'object') {
    const ks = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of ks) { if (!(k in a) || !(k in b)) { console.error('缺键：', key + '.' + k, k in a ? '英文没有' : '中文没有'); bad++; continue; } walk(a[k], b[k], key ? key + '.' + k : k); }
    return;
  }
  for (const [L, v, o] of [[zh, a, out.zh], [en, b, out.en]]) {
    let t;
    if (ta === 'function') { const f = SAMPLE[key.split('.').pop()]; t = v(...(f ? f(L) : [3, 'X'])); }
    else if (ta === 'array') t = v.map(x => Array.isArray(x) ? x.join(' ') : x).join(' | ');
    else t = String(v);
    o.push(`${key}\t${String(t).replace(/<[^>]+>/g, '').replace(/\n/g, ' ')}`);
  }
}
const demo = [];
walk(zh, en, '');
const flat = v => Array.isArray(v) ? v.map(x => Array.isArray(x) ? x.join(' ') : x).join(' | ') : typeof v === 'object' ? Object.values(v).join(' | ') : String(v);
for (const [v, o] of demo) for (const k in v) o.push(`demoData.${k}\t${flat(v[k])}`);
const dir = path.join(__dirname, 'strings-0.4'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'zh.txt'), out.zh.join('\n') + '\n'); fs.writeFileSync(path.join(dir, 'en.txt'), out.en.join('\n') + '\n');
console.log(`zh ${out.zh.length} 条，en ${out.en.length} 条，键对不上 ${bad} 处`);
process.exit(bad ? 1 : 0);
