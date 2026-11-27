// 把 _zero/dist 拷到仓库根目录。只动零肉身造物名下这几样，别的（千手院 /qianshou/、每个工具的文件夹、_ops……）一概不碰。
// dist 里冒出名单外的东西就直接失败：宁可不发，也不能踩到别人的网址。
import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const repo = new URL('../../', import.meta.url).pathname;
export const OWNED = ['index.html', 'zahuopu', 'zhahuopu', 'specimens', 'artifacts', 'codex', 'zero-assets'];   // zhahuopu 只剩一张跳到 /zahuopu/ 的跳转页
const NEVER = ['qianshou', '_ops', '_zero', '.github', 'apps.json', 'README.md'];

if (process.argv.includes('--list')) { console.log(OWNED.join(' ')); process.exit(0); }
if (!existsSync(join(dist, 'index.html'))) { console.error('✗ dist 里没有 index.html，先 npm run build'); process.exit(1); }
const extra = readdirSync(dist).filter((n) => !OWNED.includes(n));
if (extra.length) { console.error(`✗ dist 里有名单外的东西：${extra.join(', ')}。要发新栏目，先把它加进 OWNED（确认不跟现有文件夹重名）`); process.exit(1); }
for (const n of OWNED) if (NEVER.includes(n)) { console.error(`✗ ${n} 不归零肉身造物管`); process.exit(1); }

for (const n of OWNED) {
  const from = join(dist, n), to = join(repo, n);
  if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  if (existsSync(from)) {
    cpSync(from, to, { recursive: true });
    const st = statSync(to);
    console.log(`  ${st.isDirectory() ? 'dir ' : 'file'}  /${n}${st.isDirectory() ? '/' : ''}`);
  }
}
console.log('✓ 发到仓库根目录了（只动了上面这几样）');
