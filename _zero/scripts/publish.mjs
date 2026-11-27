// 把 _zero/dist 拷到仓库根目录下零肉身造物名下那几样。别的（千手院 /qianshou/、根目录 index.html、每个工具的文件夹、_ops……）一概不碰。
// 首页 dist/index.html 发到 /zero/index.html。根目录 / 要不要也换成首页，只看 ../home.mjs 里 HOME_AT_ROOT 那一行（默认 false：不碰根目录）。
// dist 里冒出名单外的东西就直接失败：宁可不发，也不能踩到别人的网址。
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_AT_ROOT } from '../home.mjs';

const dist = new URL('../dist/', import.meta.url).pathname;
const repo = new URL('../../', import.meta.url).pathname;

// 整个归零肉身造物管的文件夹：发之前整个删掉再整个拷（zero 里只放首页那一个 index.html）
const DIRS = ['zero', 'zahuopu', 'zhahuopu', 'specimens', 'artifacts', 'codex', 'zero-assets'];   // zhahuopu 只剩一张跳到 /zahuopu/ 的跳转页
// 工作流 git add 的名单：根目录 index.html 只在 HOME_AT_ROOT = true 时才进来
export const OWNED = HOME_AT_ROOT ? [...DIRS, 'index.html'] : DIRS;
const NEVER = ['qianshou', '_ops', '_zero', '.github', 'apps.json', 'README.md'];

if (process.argv.includes('--list')) { console.log(OWNED.join(' ')); process.exit(0); }
if (process.argv.includes('--root')) { console.log(HOME_AT_ROOT ? 'yes' : 'no'); process.exit(0); }

if (!existsSync(join(dist, 'index.html'))) { console.error('✗ dist 里没有 index.html，先 npm run build'); process.exit(1); }
if (existsSync(join(dist, 'zero'))) { console.error('✗ dist 里不该有 zero/：/zero/ 由 dist/index.html 拷过去'); process.exit(1); }
const extra = readdirSync(dist).filter((n) => n !== 'index.html' && !DIRS.includes(n));
if (extra.length) { console.error(`✗ dist 里有名单外的东西：${extra.join(', ')}。要发新栏目，先把它加进 DIRS（确认不跟现有文件夹重名）`); process.exit(1); }
for (const n of OWNED) if (NEVER.includes(n)) { console.error(`✗ ${n} 不归零肉身造物管`); process.exit(1); }

for (const n of DIRS) {
  const to = join(repo, n);
  if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  if (n === 'zero') {
    mkdirSync(to, { recursive: true });
    copyFileSync(join(dist, 'index.html'), join(to, 'index.html'));
    console.log('  file  /zero/index.html  ← 首页');
    continue;
  }
  const from = join(dist, n);
  if (existsSync(from)) {
    cpSync(from, to, { recursive: true });
    const st = statSync(to);
    console.log(`  ${st.isDirectory() ? 'dir ' : 'file'}  /${n}${st.isDirectory() ? '/' : ''}`);
  }
}
if (HOME_AT_ROOT) {
  copyFileSync(join(dist, 'index.html'), join(repo, 'index.html'));
  console.log('  file  /index.html  ← 首页（HOME_AT_ROOT = true）');
} else {
  console.log('  根目录 /index.html 没动（HOME_AT_ROOT = false，那里还是千手院）');
}
console.log('✓ 发好了（只动了上面这几样）');
