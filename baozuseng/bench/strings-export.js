// 把 strings.js 的中英两套文字导成 strings-0.4/zh.txt、en.txt（一行一条：键 + Tab + 文字，两份键的顺序一样，方便对着看）。
// 动态的字用示例值跑一遍；单复数、正负不同说法的都跑两种。再从 strings.js 生成两份 manifest，检查 index.html 里写死的默认英文 <html lang> / <title> / description / manifest 跟 strings.js 一致。
// 有 e2e 结果（results/result-baozuseng-0.4.2-<lang>.json，没有就用 0.4.0 的）就把真流程复制出来的全屋账单也附在末尾。
// 用法：node strings-export.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const STR = require(path.join(ROOT, 'strings.js'));
const OUT = path.join(__dirname, 'strings-0.4');
fs.mkdirSync(OUT, { recursive: true });

// 每个函数的示例参数（按语言取月份、名字），返回参数组的数组
const S = {
  'fm.m': L => [['2026-08']], 'fm.mL': L => [['2026-08']], 'fm.md': L => [['2026-09-20']], 'fm.mdL': L => [['2026-11-05']], 'fm.y': L => [[2026]], 'fm.col': L => [[8]],
  net: L => [[1], [-1]], monthNet: L => [[L.fm.m('2026-08'), 1], [L.fm.m('2026-08'), -1]], yearNet: L => [[2026, 1], [2026, -1]],
  inOut: L => [['$3,948.03', '$2,913.30']], paidOf: L => [['$3,000.00', '$3,948.03']],
  missElec: L => [[1], [2]], owedAll: L => [['$200.00']], nHouses: L => [[1], [2]], opened: L => [[L.fm.m('2026-10')]], nTenants: L => [[1], [6]],
  chipOwe: L => [['$200.00']], chipLeft: L => [[2]], notOpenYet: L => [[L.fm.mL('2026-10')]], goto: L => [[L.fm.m('2026-10')]], elecOf: L => [[L.fm.m('2026-08')]],
  paidN: L => [[4, 6]], allPaidS: L => [[3]], allPaidDone: L => [[5]], elecHintPrev: L => [['$268.30']], elecAllMine: L => [['$268.30']], elecIncAll: L => [['$268.30']],
  heads: L => [[5, false, '$53.66'], [3, true, '$55.20'], [1, false, '$250.00'], [1, true, '$250.00']], incN: L => [[1]],
  sharersPay: L => [[4, '$214.64'], [1, '$100.00']], youEat: L => [[L.youSelf + ' + ' + L.incN(1), '$67.06']],
  dayPart: L => [[L.demo.t.t5[0], 18, '$19.11']], copiedBills: L => [[5]],
  rowRent: L => [['900.00']], rowElec: L => [['53.66']], rowDays: L => [[18, 30]], owe: L => [['$200.00']], prevOwe: L => [['$200.00']],
  chipIn: L => [[L.fm.md('2026-09-20')]], chipOut: L => [[L.fm.md('2026-09-18')]], paidAria: L => [[L.demo.t.t1[0], L.stPaid]],
  goneOwe: L => [['$200.00', L.demo.t.t5[0]]], roomSum: L => [[1, '$400.00'], [2, '$800.00']], roomN: L => [[L.rooms[1], 2]],
  nMonths: L => [[1], [4]], chartAria: L => [[2026]], noBook: L => [[L.fm.m('2026-12')]],
  lastBk: L => [[L.fm.mdL('2026-11-05')]], staleBk: L => [[45]], bkDone: L => [[2]], bkSwapped: L => [[1]], settledT: L => [[L.fm.m('2026-08')]], bkFile: L => [['2026-11-05']],
  foot: L => [['0.4.2']], fbSubject: L => [['0.4.2']], a2hsIOS: L => [['[⬆]']],
  billsHead: L => [[L.fm.m('2026-08'), L.demo.e1, L.demo.u1]],
  billsElec: L => [['$268.30', 5, false, '$53.66', false], ['$165.60', 3, true, '$55.20', true]],
  billsLine: L => [[L.demo.t.t1[0], '$953.66', L.bpRent('$900.00') + ' + ' + L.bpElec('$53.66')]],
  bpRent: L => [['$900.00']], bpElec: L => [['$53.66']], bpDays: L => [[18]], bpPrev: L => [['$200.00']],
  billInc: L => [[L.demo.t.t2[0], L.fm.m('2026-08'), '$650.00', '']], billTbd: L => [[L.demo.t.t1[0], L.fm.m('2026-08'), '$900.00', '']],
  billBoth: L => [[L.demo.t.t5[0], L.fm.m('2026-09'), '$312.00', '$19.11', L.billDays(18, '$520.00')]],
  billDays: L => [[18, '$520.00']], billPrev: L => [['$200.00', '$1,153.66']], billTotal: L => [['$953.66']],
  fOwe: L => [[L.thisM], [L.fm.m('2026-10')]], prevOweLine: L => [['$200.00', L.fm.m('2026-10')]],
  delNote: L => [[true]], delOnly: L => [[L.fm.m('2026-10')]], deletedN: L => [[L.demo.t.t5[0]]], startsOn: L => [[L.fm.mdL('2026-12-01')]],
  bulkSeen: L => [[5]], bulkBad: L => [[1], [2]], bulkGo: L => [[1], [5]], bulkDone: L => [[5]], delExpOnly: L => [[L.thisM]]
};
const clean = v => String(v).replace(/&#10;/g, ' ⏎ ').replace(/\n/g, ' ⏎ ').replace(/\u00a0/g, ' ');
function lines(L, lang) {
  const out = [], missing = [];
  const walk = (o, pre) => {
    for (const [k, v] of Object.entries(o)) {
      const key = pre + k;
      if (typeof v === 'function') {
        const f = S[key];
        if (!f) { missing.push(key); continue; }
        f(L).forEach((args, i, all) => { const r = v(...args); if (r != null) out.push([key + (all.length > 1 ? '#' + (i + 1) : ''), clean(r)]); });
      } else if (Array.isArray(v)) v.forEach((x, i) => out.push([key + '.' + i, clean(Array.isArray(x) ? x[0] + (x[1] ? (lang === 'zh' ? '（每月）' : ' (monthly)') : '') : x)]));
      else if (v && typeof v === 'object') walk(v, key + '.');
      else out.push([key, clean(v)]);
    }
  };
  walk(L, '');
  if (missing.length) throw new Error(lang + ' 缺示例参数: ' + missing.join(', '));
  // 真流程里复制出来的全屋账单（整条消息，一行一条）
  const r = ['0.4.2', '0.4.0'].map(v => path.join(__dirname, 'results', `result-baozuseng-${v}-${lang}.json`)).find(f => fs.existsSync(f)) || '';
  if (fs.existsSync(r)) {
    const bt = JSON.parse(fs.readFileSync(r, 'utf8')).billTexts || {};
    for (const k of ['2026-09A', '2026-10A', '2026-11B']) if (bt[k]) bt[k].split('\n').forEach((l, i) => out.push([`sample.bills.${k}.${i + 1}`, l]));
  }
  return out;
}
const head = { zh: '# 二房东算账 0.4.2 中文界面文字（strings.js 导出；0.4.2 前叫包租僧）。一行一条：键<Tab>文字；#2 是同一句的另一种情形（单复数、正负）。', en: '# Rent Splitter 0.4.2 English UI copy (exported from strings.js; called Baozu before 0.4.2). One per line: key<Tab>text; #2 = same string, other case (plural, sign).' };
const counts = {};
for (const lang of ['zh', 'en']) {
  const ls = lines(STR[lang], lang);
  counts[lang] = ls.length;
  fs.writeFileSync(path.join(OUT, lang + '.txt'), head[lang] + '\n' + ls.map(([k, v]) => k + '\t' + v).join('\n') + '\n');
}
const zk = lines(STR.zh, 'zh').map(x => x[0]).filter(k => !k.startsWith('sample.')), ek = lines(STR.en, 'en').map(x => x[0]).filter(k => !k.startsWith('sample.'));
if (zk.join() !== ek.join()) throw new Error('中英两份键对不上');

// manifest：两份都从 strings.js 来
const icons = [
  { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
];
for (const lang of ['zh', 'en']) {
  const L = STR[lang];
  const m = { name: L.appFull, short_name: L.app, description: L.desc, lang: L.lang, start_url: './', scope: './', display: 'standalone', background_color: '#f5f5f7', theme_color: '#f5f5f7', icons };
  fs.writeFileSync(path.join(ROOT, L.manifest), JSON.stringify(m, null, 2) + '\n');
}
// index.html 里写死的默认语言（英文；没跑脚本前、爬虫看到的）要跟 strings.js 一样
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const D = STR.en;
const want = [`<html lang="${D.lang}">`, `<title>${D.appFull}</title>`, `<meta name="description" content="${D.desc}">`, `<meta name="apple-mobile-web-app-title" content="${D.app}">`, `<link rel="manifest" href="${D.manifest}">`];
const bad = want.filter(w => !html.includes(w));
if (bad.length) throw new Error('index.html 写死的默认英文跟 strings.js 不一致：' + bad.join(' | '));
console.log(JSON.stringify({ lines: counts, keys: zk.length, out: OUT }));
