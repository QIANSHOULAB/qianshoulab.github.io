/* 把代笔僧的全部界面文字导出成两份清单，一行一条，给人逐条读（_ops/文案规范.md「交货前自查」）：
 *   bench/strings-0.4/en.txt、zh.txt   格式：key<Tab>字
 * 来源：extension/lib/i18n.js（通用几条）+ extension/strings.js（侧栏 panel / 介绍页 site.* / 示例表单 form.*）+ extension/_locales（商店名字、描述）。
 * HTML 标签去掉只留字；{n} 这类占位原样留着。
 * 跑法：node daibi/bench/strings04.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const EXT = path.resolve(__dirname, '../extension');
const OUT = path.join(__dirname, 'strings-0.4'); fs.mkdirSync(OUT, { recursive: true });

const box = { globalThis: null }; box.globalThis = box;
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(EXT, 'lib/i18n.js'), 'utf8'), box);
// 偷看字典：i18n.js 不往外给整本，挂一个 add 的钩子把每次注册都记下来
const dict = { en: {}, zh: {} };
const add0 = box.QSLib.i18n.add;
box.QSLib.i18n.add = (l, d) => { Object.assign(dict[l], d); add0(l, d); };
vm.runInContext(fs.readFileSync(path.join(EXT, 'strings.js'), 'utf8'), box);
// 通用几条（common.*）在 i18n.js 里面：按 key 问出来
const common = ['common.lab', 'common.contact', 'common.email', 'common.home', 'common.homeUrl', 'common.lang', 'common.colN', 'common.pasted'];
const plain = s => String(s).replace(/<small>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s*\n\s*/g, ' / ');
for (const l of ['en', 'zh']) {
  const lines = [];
  const loc = JSON.parse(fs.readFileSync(path.join(EXT, '_locales', l === 'en' ? 'en' : 'zh_CN', 'messages.json'), 'utf8'));
  for (const [k, v] of Object.entries(loc)) lines.push(`manifest.${k}\t${v.message}`);
  box.QSLib.i18n.setLang(l);
  for (const k of common) lines.push(`${k}\t${box.QSLib.i18n.t(k)}`);
  for (const [k, v] of Object.entries(dict[l])) lines.push(`${k}\t${plain(v)}`);
  fs.writeFileSync(path.join(OUT, l + '.txt'), lines.join('\n') + '\n');
  console.log(l, lines.length, '条');
}
const miss = Object.keys(dict.en).filter(k => !(k in dict.zh)).concat(Object.keys(dict.zh).filter(k => !(k in dict.en)));
console.log(miss.length ? '只有一种语言有的 key：' + miss.join(', ') : '两套 key 一样多');
