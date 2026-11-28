// 把 _zero/dist 拷到仓库根目录（新家 zeroflesh/zeroflesh.github.io，11-28 从 qianshoulab.github.io 搬来）。
// 首页 dist/index.html 就是根目录 /index.html；栏目页、跳转页、zero-assets 整个文件夹拷过去。/zero/ 在新家不要了。
// 只动 OWNED 那几样：源码 _zero/、截图 _shots/、工作流、CLAUDE.md 这些一概不碰。
// dist 里冒出名单外的东西就直接失败：要发新栏目，先把它加进 DIRS（确认不跟现有文件夹重名）。
import { copyFileSync, cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const repo = new URL('../../', import.meta.url).pathname;

// 整个归构建管的文件夹：发之前整个删掉再整个拷（zhahuopu 只剩一张跳到 /zahuopu/ 的跳转页）
const DIRS = ['zahuopu', 'zhahuopu', 'specimens', 'artifacts', 'codex', 'zero-assets'];
// 工作流 git add 的名单
export const OWNED = [...DIRS, 'index.html'];
const NEVER = ['_zero', '_shots', '.github', 'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'README.md', '_config.yml', '.gitignore'];

if (process.argv.includes('--list')) { console.log(OWNED.join(' ')); process.exit(0); }

if (!existsSync(join(dist, 'index.html'))) { console.error('✗ dist 里没有 index.html，先 npm run build'); process.exit(1); }
const extra = readdirSync(dist).filter((n) => n !== 'index.html' && !DIRS.includes(n));
if (extra.length) { console.error(`✗ dist 里有名单外的东西：${extra.join(', ')}。要发新栏目，先把它加进 DIRS（确认不跟现有文件夹重名）`); process.exit(1); }
for (const n of OWNED) if (NEVER.includes(n)) { console.error(`✗ ${n} 不归构建管`); process.exit(1); }

// 拷到哪：默认仓库根目录；`node scripts/publish.mjs --to <目录>` 拷到别处（本地、工作流预览摆一个跟线上一样的站）
const ti = process.argv.indexOf('--to');
const root = ti > 0 ? process.argv[ti + 1] : repo;

for (const n of DIRS) {
  const to = join(root, n);
  if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  const from = join(dist, n);
  if (existsSync(from)) {
    cpSync(from, to, { recursive: true });
    const st = statSync(to);
    console.log(`  ${st.isDirectory() ? 'dir ' : 'file'}  /${n}${st.isDirectory() ? '/' : ''}`);
  }
}
copyFileSync(join(dist, 'index.html'), join(root, 'index.html'));
console.log('  file  /index.html  ← 首页');
console.log(`✓ 发好了（${root}，只动了上面这几样）`);
