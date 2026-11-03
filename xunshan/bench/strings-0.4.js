// 把界面文字导出成一行一条（_ops/文案规范.md「交货前自查」）：bench/strings-0.4/zh.txt、en.txt
// 来源：extension/lib/strings.js（插件 + 介绍页）和 extension/_locales/（商店名字、简介）。
// 一行：键 ⇥ 文字；英文单复数那种写成「1 时 ⇥ 多时」；换行写成 ⏎。
// 用法：node xunshan/bench/strings-0.4.js
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'extension/lib/strings.js'));
const { STR } = globalThis.QS;
const OUT = path.join(__dirname, 'strings-0.4');
fs.mkdirSync(OUT, { recursive: true });
const flat = s => String(s).replace(/\n/g, ' ⏎ ');
for (const [lang, loc] of [['zh', 'zh_CN'], ['en', 'en']]) {
  const lines = [];
  const msgs = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension/_locales', loc, 'messages.json'), 'utf8'));
  for (const [k, v] of Object.entries(msgs)) lines.push(`manifest.${k}\t${flat(v.message)}`);
  for (const [k, v] of Object.entries(STR[lang])) {
    if (k === 'htmlLang') continue;
    if (typeof v === 'function') lines.push(`${k}\t${flat(v(1))} ⇥ ${flat(v(3))}`);
    else if (Array.isArray(v)) v.forEach((x, i) => lines.push(`${k}.${i + 1}\t${Array.isArray(x) ? x.map(flat).join(' ｜ ') : flat(x)}`));
    else lines.push(`${k}\t${flat(v)}`);
  }
  fs.writeFileSync(path.join(OUT, lang + '.txt'), lines.join('\n') + '\n');
  console.log(lang, lines.length, '条');
}
