// 本地起一个跟线上一样排的服务：零肉身造物名下那几样（/zero/、/zahuopu/、/specimens/……、/zero-assets/）从 _zero/dist 出，
// 别的（/、/qianshou/、每个工具的文件夹）从仓库根目录出。不用先跑 publish.mjs，不动仓库里的任何文件。
// 用法：node scripts/serve.mjs [端口]      （在 _zero/ 里跑；默认 4321）
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.argv[2] || process.env.PORT || 4321);
const dist = new URL('../dist/', import.meta.url).pathname;
const repo = new URL('../../', import.meta.url).pathname;
const OWNED = ['zero', 'zahuopu', 'zhahuopu', 'specimens', 'artifacts', 'codex', 'zero-assets'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.zip': 'application/zip', '.exe': 'application/octet-stream',
};

function resolve(urlPath) {
  const p = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const seg = p.split('/').filter(Boolean);
  if (seg[0] === 'zero') return join(dist, 'index.html');
  const base = OWNED.includes(seg[0]) ? dist : repo;
  if (!OWNED.includes(seg[0]) && (seg[0] === '_zero' || seg[0] === '.git')) return null;
  let f = join(base, ...seg);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  return existsSync(f) ? f : null;
}

createServer((req, res) => {
  const url = req.url || '/';
  // 跟 GitHub Pages 一样：文件夹不带斜杠就补上
  const bare = url.split('?')[0];
  if (!bare.endsWith('/') && !extname(bare)) {
    const f = resolve(bare + '/');
    if (f) { res.writeHead(301, { Location: bare + '/' + (url.includes('?') ? url.slice(url.indexOf('?')) : '') }); res.end(); return; }
  }
  const f = resolve(url);
  if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`零肉身造物本地服务：http://127.0.0.1:${PORT}/zero/`));
