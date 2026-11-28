// 搬家用（11-28，老家 _ops/零肉身造物/搬家施工单.md 第 2 节）：在老家 QIANSHOULAB/qianshoulab.github.io 的工作区里，
// 把零肉身造物以前发在那边的页面（根目录 index.html、zero/、zahuopu/、zhahuopu/、specimens/、artifacts/、codex/ 里每一个 index.html）
// 换成跳到新家 https://zeroflesh.github.io 同一个位置的跳转页：/zero/ 跳到新家的 /，/zhahuopu/（老名字）直接跳到 /zahuopu/，
// 别的路径不变；带上 ? 后面的参数和 # 后面的锚点（location.replace），没开 JS 的走 meta refresh（包在 noscript 里：开着 JS 时
// 不让它跟 location.replace 抢，抢赢了 ? 和 # 就丢了）；墨蓝底，不闪白。
// 这几个文件夹里除了 index.html 别的东西一概删掉（老家只留跳转页）。/zero-assets/ 不归它管：新家上线、验过以后另外删。
// 跑法：node _zero/scripts/old-redirects.mjs <老家仓库根目录>          只列出要写哪些页：加 --dry
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const NEW = 'https://zeroflesh.github.io';
const INK = '#05070E';   // 这个世界的暗（src/scene/tune.ts 的 INK.sky）
const DIRS = ['zero', 'zahuopu', 'zhahuopu', 'specimens', 'artifacts', 'codex'];
const root = process.argv[2];
const dry = process.argv.includes('--dry');
if (!root || !existsSync(join(root, '_ops'))) { console.error('✗ 给老家仓库根目录（里面要有 _ops/）'); process.exit(1); }

/** 老路径 → 新家网址 */
const target = (path) => NEW + (path === '/zero/' ? '/' : path === '/zhahuopu/' ? '/zahuopu/' : path);

const page = (to) => `<!doctype html>
<html lang="zh-CN" style="background:${INK}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="${INK}">
<title>零肉身造物搬家了 · Zero-Flesh Creation has moved</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${to}">
<script>location.replace(${JSON.stringify(to)} + location.search + location.hash);</script>
<noscript><meta http-equiv="refresh" content="0; url=${to}"></noscript>
<style>html,body{margin:0;background:${INK};color:#8c8c8c;font:14px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}a{color:#fff}p{padding:24px}</style>
</head>
<body><p>零肉身造物搬到了 <a href="${to}">${to.replace('https://', '')}</a> · Zero-Flesh Creation now lives at <a href="${to}">${to.replace('https://', '')}</a></p></body>
</html>
`;

const pages = ['/'];
const others = [];
const walk = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n === 'index.html') pages.push('/' + relative(root, dir) + '/');
    else others.push(p);
  }
};
for (const d of DIRS) if (existsSync(join(root, d))) walk(join(root, d));

for (const p of pages) {
  const file = join(root, p, 'index.html');
  console.log(`  ${p} → ${target(p)}`);
  if (!dry) writeFileSync(file, page(target(p)));
}
for (const f of others) {
  console.log(`  删 /${relative(root, f)}`);
  if (!dry) rmSync(f);
}
console.log(`✓ ${dry ? '（只列）' : ''}跳转页 ${pages.length} 张${others.length ? `，删了 ${others.length} 个别的文件` : ''}`);
