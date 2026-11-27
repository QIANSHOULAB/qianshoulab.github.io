# 零肉身造物（Zero-Flesh Creation）· 源码

首页（黑碑）：https://qianshoulab.github.io/zero/ 。根目录 / 现在还是千手院；换不换只看 `home.mjs` 里 `HOME_AT_ROOT` 那一行。
栏目：/zahuopu/（赛博杂货铺；/zhahuopu/ 是头一版打错字的网址，留了跳转）、/specimens/（标本）、/artifacts/（文物）、/codex/（法典）。
千手院在 /qianshou/，那页是手写的单文件，不归这里管。

## 第二版长什么样（Song 11-27 定的）
- 只有黑、白、灰；简单几何，做工要拿得出手。对标 Igloo Inc（方块拼成的主体、等宽小字带细引线）。
- 首页：一望无际的黑水，地平线正中一块 1:4:9 的碑，324 块黑石（InstancedMesh）砌成。开场几乎全黑，10 秒里光从碑后面慢慢升起来（天从黑变成白灰、碑成剪影带一圈细亮边、碑缝透光、光芒从边上散开、水上一条光路铺到脚下），然后极轻地呼吸。同一次会话再来、或者点一下 / 滑一下 / 按个键，1.5 秒快进到天亮；系统设了「减少动效」就直接给天亮的样子。
- 全集和子集：碑是全集，下半截五撮砖是五个子集（01 千手院、02 赛博杂货铺、03 标本、04 文物、05 法典）。平时看不出来；指到铭文或者那撮砖，那撮就沉沉地从碑里出来，背后的光从新开的口子里涌出来，缝发亮，铭文一个字一个字写出来。点了（回车、手机上第二下）镜头贴着水面冲进那道光，白光吞屏，然后跳转。
- 声音默认关，右上角 SOUND: OFF，记住开没开。开了只有三样：随天亮升起的低长音、出碑时一声石头闷响、进门时一口气涌上来的光声。全是 Web Audio 当场合成。
- 没有 WebGL：换成一张天亮时的静态图（`src/assets/still-*.jpg`，自己的场景截的）+ 文字链接。

## 文件
- `home.mjs`：首页放哪（换根目录的开关）。
- `src/scene/`：画面。`layout.ts`（碑的尺寸、砖、五撮的位置）、`glsl.ts`（天、水、倒影、碑、光、浮尘的着色器）、`monolith.ts`（three.js 场景、黎明、出碑的弹簧、进门的镜头）。
- `src/home/`：首页的手。`home.ts`（铭文、引线、一个字一个字写、点了进门、静态图后备）、`sound.ts`（三样声音）。
- `src/components/core/`：`Header.astro`（左 EN / 中文，右声音；子页面中间小 wordmark + 五道门那一行）、`Footer.astro`（Song 那句公司的话 + 宇宙地址，一字不改）、`T.astro`（一段字出中英两份）。
- `src/i18n/ui.ts`：所有给人看的字（en 门面、zh 第二语言）。改中文标题字以后照 `scripts/fonts/README.md` 补宋体小字库。
- `src/data/tools.ts`：工具分拣（千手院 / 赛博杂货铺）。
- `src/content/`：三套档案（标本、文物、法典），每篇一份英文、一份中文。
- `scripts/publish.mjs`：把 dist 拷到仓库根目录名下那几样（dist/index.html → zero/index.html）。`scripts/live-check.mjs`：线上验收。

## 写一篇新标本（写完推上去就上线）
1. 在 `src/content/specimens/` 放两份：`002-名字.en.mdx`、`002-名字.zh.mdx`（英文重写，不是翻译）。
2. 头上照 `001-cinderfall-arena.zh.mdx` 那样写：id、lang、slug、title、date、species、scale、liveUrl、sourceUrl、sourceLabel、modelStack、summary。
3. 两份的 id、date、链接、modelStack 必须一样，不一样构建报错。
4. 推到 main：工作流 `.github/workflows/zero.yml` 自己构建、把产物提交到根目录（不碰根目录 index.html），GitHub Pages 发出去，再对着真网址验一遍。

## 本地
```
cd _zero
npm ci
npm run build              # 出到 _zero/dist
node scripts/publish.mjs   # 拷到仓库根目录（只动 zero、zahuopu、zhahuopu、specimens、artifacts、codex、zero-assets）
```
平时不用本地拷：推上去工作流会做。`publish.mjs` 发现 dist 里有名单外的东西会直接停，不会踩到别人的网址。

调试用的网址参数（只影响自己这一次）：`?dawn=0.5` 把黎明定在一半；`?still` 只留画面（截静态图用）；`?hq` 不自动降分辨率；`?lang=zh` 中文。
