// 构建完先自检一遍「零肉身」：产物里不许有图片、音频、字体、3D 网格文件，
// 页面和样式里也不许引外面的图、字体、音频。查出来就让构建失败，脏东西上不了线。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const BAD_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|heic|mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|mp4|webm|mov|mid|midi|woff2?|ttf|otf|eot|glb|gltf|fbx|obj|stl|usdz?|ply|dae|3ds|blend|vrm)$/i;
const problems = [];
const sizes = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    const rel = relative(dist, p);
    sizes.push([rel, st.size]);
    if (BAD_EXT.test(name)) problems.push(`${rel}: 产物里不该有这种文件`);
    const ext = extname(name);
    if (!['.html', '.css', '.js', '.mjs'].includes(ext)) continue;
    const text = readFileSync(p, 'utf8');
    if (ext === '.html') {
      for (const tag of ['<img', '<audio', '<video', '<source', '<picture', '<iframe', '<object', '<embed']) {
        if (text.toLowerCase().includes(tag)) problems.push(`${rel}: 有 ${tag}>`);
      }
      if (/fonts\.(googleapis|gstatic)\.com/.test(text)) problems.push(`${rel}: 引了 Google Fonts`);
    }
    // 样式里的 url(...)：只看 .css 和页面里的 <style>、style=""（脚本里那句检疫用的 'url(' 不算）
    const css = ext === '.css' ? text
      : ext === '.html' ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') + [...text.matchAll(/style="([^"]*)"/gi)].map((m) => m[1]).join('\n')
      : '';
    if (/@font-face/i.test(css)) problems.push(`${rel}: 有 @font-face`);
    for (const m of css.matchAll(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g)) {
      if (!m[2].startsWith('data:') && !m[2].startsWith('#')) problems.push(`${rel}: url(${m[2]})`);
    }
    for (const m of text.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
      if (BAD_EXT.test(m[0].replace(/[?#].*$/, ''))) problems.push(`${rel}: 引了外面的资源 ${m[0]}`);
    }
  }
}
walk(dist);
const total = sizes.reduce((s, [, n]) => s + n, 0);
const pages = sizes.filter(([f]) => f.endsWith('.html'));
console.log(`零肉身自检：${sizes.length} 个文件，共 ${(total / 1024).toFixed(1)} KB（${pages.length} 个页面）`);
for (const [f, n] of sizes.sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${(n / 1024).toFixed(1).padStart(7)} KB  ${f}`);
if (problems.length) {
  console.error('\n✗ 查出肉身：\n' + problems.map((x) => '  - ' + x).join('\n'));
  process.exit(1);
}
console.log('✓ IMG 0 · AUDIO 0 · FONT 0 · 3D-MESH 0');
