// 收集要进宋体小字库的中文：wordmark、标语、五道门的名字和那句话、页面大标题、三套档案的中文标题、杂货铺卡片上的大字。
// 跑法（在 _zero/ 里）：node --experimental-strip-types scripts/fonts/collect-chars.mjs
// 结果写到 scripts/fonts/cjk-chars.txt，再交给 subset_cjk.py 做字库。
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { ui } from '../../src/i18n/ui.ts';
import { tools } from '../../src/data/tools.ts';

const zh = ui.zh;
const parts = [
  '零肉身造物',
  zh.home.tagline,
  ...Object.values(zh.entry).flatMap((e) => [e.name, e.line]),
  zh.specimens.h1, zh.artifacts.h1, zh.codex.h1, zh.zahuopu.h1,
  zh.nav.home, zh.specimen.card,
  ...Object.values(zh.codex.cats),
  ...tools.map((t) => t.glyph),        // 赛博杂货铺卡片上那个大字
  // v3 造物之门：七幕的幕名、「进去」、往下滑的提示、收工那句话、小月（货架上的小工具）的名字、标本签
  ...Object.values(zh.act).map((a) => a.name),
  zh.home.hint, zh.home.acts, zh.home.enter, zh.finale.motto,
  ...tools.filter((t) => t.home === 'zahuopu').map((t) => t.name.zh),
  zh.label.no, zh.label.kind, zh.label.spec,
];
const content = new URL('../../src/content/', import.meta.url).pathname;
for (const dir of readdirSync(content)) {
  for (const f of readdirSync(content + dir)) {
    if (!f.endsWith('.zh.mdx')) continue;
    const m = /^title:\s*"(.*)"\s*$/m.exec(readFileSync(content + dir + '/' + f, 'utf8'));
    if (m) parts.push(m[1]);
  }
}
// 标点也要（全角逗号、句号、冒号、破折号、引号……），拉丁字母和数字走 Cormorant
const chars = new Set();
for (const s of parts) for (const c of s) if (c.codePointAt(0) > 0x2000) chars.add(c);
const out = [...chars].sort().join('');
writeFileSync(new URL('./cjk-chars.txt', import.meta.url), out + '\n');
console.log(`${chars.size} 个字：${out}`);
