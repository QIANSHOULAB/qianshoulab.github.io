// 收字（v3.3 起：全站标题字换成细黑，宋体不用了）：收集要进「细黑」小字库（思源黑体 Noto Sans SC）的中文。
// 收的是走 --display / --display-zh 这两个字体变量的字：首页（wordmark、五个名字、那句话、往下滑、进去、顶栏、页脚片尾字幕）、
// 栏目页（大标题、栏目条、三套档案的中文标题、法典分类、杂货铺卡片上那个大字、档案卡）。正文用系统字，不收。
// 跑法（在 _zero/ 里）：node --experimental-strip-types scripts/fonts/collect-chars.mjs
// 结果写到 scripts/fonts/cjk-chars.txt，再交给 subset.py 做字库（拉丁字母走 Montserrat，整套基本拉丁都留，不用收）。
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { ui } from '../../src/i18n/ui.ts';
import { tools } from '../../src/data/tools.ts';

const zh = ui.zh;
const parts = [
  '零肉身造物', '中文', 'EN',
  ...Object.values(zh.entry).flatMap((e) => [e.name, e.line]),
  ...Object.values(zh.acts),
  zh.nav.home, zh.nav.label, zh.lang.label,
  zh.site.skip,                        // 「跳到正文」（按 Tab 才露出来的那个）
  zh.sound.label, zh.sound.on, zh.sound.off,
  zh.company.h, zh.company.p1, zh.company.motto, zh.company.addr,
  zh.foot.mail,
  zh.specimens.h1, zh.artifacts.h1, zh.codex.h1, zh.zahuopu.h1,
  ...Object.values(zh.codex.cats),
  zh.specimen.card, zh.zahuopu.sign, zh.zahuopu.menu,
  ...tools.map((t) => t.glyph),        // 赛博杂货铺卡片上那个大字
  '→',                                 // 「进去 →」的箭头：Montserrat 的拉丁片里没有，用思源黑体的（一样细）
];
const content = new URL('../../src/content/', import.meta.url).pathname;
for (const dir of readdirSync(content)) {
  for (const f of readdirSync(content + dir)) {
    if (!f.endsWith('.zh.mdx')) continue;
    const m = /^title:\s*"(.*)"\s*$/m.exec(readFileSync(content + dir + '/' + f, 'utf8'));
    if (m) parts.push(m[1]);
  }
}
// 只收中文和全角标点（逗号、句号、冒号、括号、引号……）；拉丁字母、数字、半角标点走 Montserrat
const chars = new Set();
for (const s of parts) for (const c of s) if (c.codePointAt(0) > 0x2000 && !/[–—‘’“”•…·]/.test(c)) chars.add(c);
const out = [...chars].sort().join('');
writeFileSync(new URL('./cjk-chars.txt', import.meta.url), out + '\n');
console.log(`${chars.size} 个字：${out}`);
