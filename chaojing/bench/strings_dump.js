// 中英文字清单（文案规范「交货前自查」）：node strings_dump.js <输出目录>  → zh.txt、en.txt，一行一条：「键<Tab>字」
// 带参数的句子用几组典型参数各出一行；示例模板（证书、发票、录用）的字也列出来（HTML 去掉标签，一段一行）。
const fs = require('fs'), path = require('path');
const [OUT] = process.argv.slice(2);
global.window = {}; require(path.join(__dirname, '..', 'strings.js'));
const STR = window.CJ_STRINGS;
const ARGS = {
  zh: {
    go: [[8, 'docx'], [8, 'pdf'], [8, 'both'], [1, 'pdf']], tplSubTags: [[5]], dataSub: [[8, 6]], moreRows: [[200]],
    mapAllOk: [[5]], mapBad: [[2]], blankTag: [['手机']], unused: [['手机、备注']], rowOf: [[1, 8]], progress: [[120, 500, '3.1']],
    doneMsg: [[500, '7.2']], stopped: [[120]], date: [[Date.UTC(2026, 10, 3, 4)]], errTplSyntax: [['{{姓名']], errWhat: [['报价单.pdf']],
    errGen: [['字体没搬过来，网断了？']], noHeaderCol: [[3]], fileN: [[7]], zipName: [['结业证书', 8]], grouped: [['发票号', 8, 4]], groupOff: [['发票号']], ver: [['0.4.2']], fbSubject: [['0.4.2']],
  },
  en: {
    go: [[8, 'docx'], [8, 'pdf'], [8, 'both'], [1, 'pdf'], [1, 'docx']], tplSubTags: [[5], [1]], dataSub: [[8, 6], [1, 1]], moreRows: [[200]],
    mapAllOk: [[5], [1]], mapBad: [[2]], blankTag: [['Phone']], unused: [['Phone, Notes']], rowOf: [[1, 8]], progress: [[120, 500, '3.1']],
    doneMsg: [[500, '7.2'], [1, '0.4']], stopped: [[120]], date: [[Date.UTC(2026, 10, 3, 4)]], errTplSyntax: [['{{Name']], errWhat: [['quote.pdf']],
    errGen: [["Couldn't fetch the fonts. Offline?"]], noHeaderCol: [[3]], fileN: [[7]], zipName: [['Certificate', 8], ['Certificate', 1]], grouped: [['Invoice No', 8, 4]], groupOff: [['Invoice No']], ver: [['0.4.2']], fbSubject: [['0.4.2']],
  },
};
const one = s => String(s).replace(/\t/g, ' ⇥ ').replace(/\n/g, ' ⏎ ');
const strip = html => html.replace(/<\/(p|h\d|tr)>/g, '\n').replace(/<\/t[dh]>/g, ' | ').replace(/<br>/g, ' / ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').split('\n').map(x => x.replace(/\s*\|\s*$/, '').trim()).filter(x => x && x !== '/');
fs.mkdirSync(OUT, { recursive: true });
for (const L of ['zh', 'en']) {
  const t = STR[L], out = [];
  for (const [k, v] of Object.entries(t)) {
    if (k === 'examples') continue;
    if (typeof v === 'function') { for (const a of ARGS[L][k] || [[]]) { const r = v(...a); out.push(`${k}\t${Array.isArray(r) ? r.join(' ') : one(r)}`) } }
    else if (Array.isArray(v)) out.push(`${k}\t${v.join(' ')}`);
    else if (typeof v === 'object') for (const [k2, v2] of Object.entries(v)) out.push(`${k}.${k2}\t${one(v2)}`);
    else out.push(`${k}\t${one(v)}`);
  }
  for (const [k, e] of Object.entries(t.examples)) {
    out.push(`examples.${k}.file\t${e.file}.docx`, `examples.${k}.data\t${e.data}`, `examples.${k}.rule\t${e.rule}`);
    strip(e.html).forEach((x, i) => out.push(`examples.${k}.text${i + 1}\t${x}`));
    out.push(`examples.${k}.headers\t${e.headers.join(' | ')}`);
    e.rows.forEach((r, i) => out.push(`examples.${k}.row${i + 1}\t${r.join(' | ')}`));
  }
  fs.writeFileSync(path.join(OUT, `${L}.txt`), out.join('\n') + '\n');
  console.log(L, out.length, 'lines');
}
