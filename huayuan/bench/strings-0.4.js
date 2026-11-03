// 化缘僧 0.4.0 · 文字清单：从 extension/lib/strings.js（唯一的字库）
//   1) 对一遍中英两套的键（侧栏、商店、介绍页、示例数据），缺一条就报错；
//   2) 写 extension/_locales/en、zh_CN 的 messages.json（manifest 的 name / description 等跟浏览器语言走，这是浏览器自己的规矩）；
//   3) 导出 bench/strings-0.4/zh.txt、en.txt，一行一条：键<Tab>字。
// 用法：node huayuan/bench/strings-0.4.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const ctx = { globalThis: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'extension/lib/strings.js'), 'utf8'), ctx);
const Q = ctx.globalThis.QSStrings;

const problems = [];
const same = (name, a, b) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  for (const k of ka) if (!(k in b)) problems.push(`${name}: zh 缺 ${k}`);
  for (const k of kb) if (!(k in a)) problems.push(`${name}: en 缺 ${k}`);
};
same('侧栏', Q.packs.en, Q.packs.zh);
same('商店', Q.store.en, Q.store.zh);
same('介绍页', Q.site.en, Q.site.zh);
same('示例数据', Q.demoData.en, Q.demoData.zh);
for (const [, key] of Q.hintWords) if (!(key in Q.packs.en) || !(key in Q.packs.zh)) problems.push('列名键缺：' + key);

// 商店的长度限制（Chrome：name ≤ 75、short_name 建议 ≤ 12、description ≤ 132）
for (const l of ['en', 'zh']) {
  const s = Q.store[l];
  if ([...s.extName].length > 75) problems.push(`${l} extName 超 75`);
  if ([...s.extShort].length > 12) problems.push(`${l} extShort 超 12`);
  if ([...s.extDesc].length > 132) problems.push(`${l} extDesc 超 132：${[...s.extDesc].length}`);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

// _locales
const LOC = { en: 'en', zh: 'zh_CN' };
for (const [l, dir] of Object.entries(LOC)) {
  const msgs = {};
  for (const [k, v] of Object.entries(Q.store[l])) msgs[k] = { message: v };
  const d = path.join(ROOT, 'extension/_locales', dir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'messages.json'), JSON.stringify(msgs, null, 2) + '\n');
}

// 文字清单
const OUT = path.join(__dirname, 'strings-0.4');
fs.mkdirSync(OUT, { recursive: true });
const flat = (v) => (Array.isArray(v) ? v.join(' / ') : String(v)).replace(/\n/g, ' ');
for (const l of ['zh', 'en']) {
  const lines = [`# 化缘僧 0.4.0 ${l === 'zh' ? '中文' : '英文'}文字（从 extension/lib/strings.js 导出）。一行一条：键<Tab>字。{n} 是填进去的数，{n:row|rows} 按数挑单复数。`];
  const sec = (title, obj, skip = []) => {
    lines.push('', `## ${title}`);
    for (const [k, v] of Object.entries(obj)) if (!skip.includes(k)) lines.push(`${k}\t${flat(v)}`);
  };
  sec('插件侧栏', Q.packs[l], ['htmlLang', 'demoUrl']);
  sec('插件商店 / 扩展页（_locales）', Q.store[l]);
  sec('介绍页 huayuan/index.html', Q.site[l], ['htmlLang']);
  sec('侧栏示例表的假数据', Q.demoData[l]);
  fs.writeFileSync(path.join(OUT, l + '.txt'), lines.join('\n') + '\n');
  console.log(l, lines.filter((x) => x.includes('\t')).length, '条 →', path.join(OUT, l + '.txt'));
}
