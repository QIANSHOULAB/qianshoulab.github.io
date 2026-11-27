# 零肉身造物（Zero-Flesh Creation）· 源码

首页（造物之门）：https://qianshoulab.github.io/zero/ 。根目录 / 现在还是千手院；换不换只看 `home.mjs` 里 `HOME_AT_ROOT` 那一行。
栏目：/zahuopu/（赛博杂货铺；/zhahuopu/ 是头一版打错字的网址，留了跳转）、/specimens/（标本）、/artifacts/（文物）、/codex/（法典）。
千手院在 /qianshou/，那页是手写的单文件，不归这里管。

## 第三版「造物之门」长什么样（Song 11-27 提、11-28 回「Ab」定的；规划书在 `_ops/零肉身造物/造物之门规划书.md`）
- 黑水尽头立一道门，门里是光。往下滑，门里一样一样往外生东西。滑的人就是造物主：手指动，世界才往下造；手指停，创世暂停；往回滑，世界倒回去。
- 七幕：Ⅰ 启光（白，开场自己放 10 秒）、Ⅱ 燃日（01 千手院，琥珀金：太阳 + 一千道火舌）、Ⅲ 布环（02 赛博杂货铺，品红：一道环，环上的小月就是货架上的小工具，名字能点）、
  Ⅳ 赋生（03 标本，冷青：巨鲸从门里游出来，绕门一周，升天钉成星座）、Ⅴ 铸器（04 文物，暗红：红点坍缩、顿帧、炸开、浑天仪）、
  Ⅵ 立法（05 法典，靛紫：轨道把万物系住绕门运转，水上光格网，星空）、Ⅶ 收工（门全开，五色合白，全家福剪影，那句话）。
- 每幕：先打出一行代码（法先到）→ 光换成这一幕的颜色 → 门上属于这个栏目的那一撮石头离开，留下一个彩色的窗 → 造出来、点活 → 最后才写名字。
- 底子是黑，颜色只在光里，一幕一种当家；光最亮的芯子发白，外圈带色。
- 声音默认关（右上角 SOUND: OFF，记住选择）。开了以后：随幕变化的低长音（每造一样加一个音，第六幕五个音成和弦）、石门闷响、第五幕炸开、点「进去」那一口气。全是 Web Audio 当场合成。
- 没有 WebGL：七幕各一张场景自己截的静态图（`src/assets/genesis/`，电脑一套、手机一套），字和链接照样能滑、能点。减少动效：每幕直接摆到位。没开 JavaScript：一张图 + 七段字和链接。

## 文件
- `home.mjs`：首页放哪（换根目录的开关）。
- `src/genesis/config.ts`：**所有能调的数**——七幕的颜色、每幕滑多长、镜头离门多远、地平线多高、门开多大、每幕要看得见多大一块天、三档力气、每样东西多少块。
- `src/genesis/timeline.ts`：进度 P（0..7）= 平滑后滚动位置的纯函数；镜头距离、视角、地平线、门的角度都是 P 的函数。
- `src/genesis/scene.ts`：three.js 场景、先画倒影再画正片、三档力气（量帧时间自动升降）、点「进去」时的镜头。
- `src/genesis/creations/`：日（sun）、环和小月（ring）、巨鲸（whale）、浑天仪和炸开（forge）、轨道格网星空和全家福（law）。每样东西怎么走在这里算。
- `src/genesis/glsl/`：着色器。`world.ts` 天和水、`stone.ts` 石块（门和造物共用）、`fx.ts` 门缝的光、点、细线、光晕，其余各是一样造物。
- `src/home/genesis-page.ts`：首页的手（滚动、开场、每幕的字、刻度、铭文、进去、标本签、静态图兜底）；`src/home/sound.ts`：四样声音。
- `src/pages/index.astro`：首页骨架（10.5 屏高的滚动容器，画布固定铺满，七个 section）。
- `src/components/core/`：`Header.astro`、`Footer.astro`（Song 那句公司的话 + 宇宙地址，一字不改）、`T.astro`（一段字出中英两份）、`Ink.astro`（一个字一个字写出来）。
- `src/i18n/ui.ts`：所有给人看的字（en 门面、zh 第二语言）。改中文标题字以后照 `scripts/fonts/README.md` 补宋体小字库。
- `src/data/tools.ts`：工具分拣（千手院 / 赛博杂货铺）；第三幕的小月从这里的 `shop` 读，有几样工具就有几颗。
- `scripts/publish.mjs`：把 dist 拷到仓库根目录名下那几样。`scripts/live-check.mjs`：线上验收。
- `scripts/serve.mjs`：本地起一个跟线上一样排的服务。`scripts/genesis-shots.mjs`：三内核 × 尺寸 × 七幕截图，自动查溢出、报错、字出框。`scripts/genesis-stills.mjs`：重出七幕静态图。

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
node scripts/serve.mjs     # http://127.0.0.1:4321/zero/ （不用拷，不动仓库里的文件）
```
平时不用本地拷：推上去工作流会做。`publish.mjs` 发现 dist 里有名单外的东西会直接停，不会踩到别人的网址。
推别的分支（比如 `zero-v3`）只跑 preview：构建、本地起服务、三个内核截图，拼图提交回分支的 `_ops/零肉身造物/预览/`；不发版。

调试用的网址参数（只影响自己这一次）：`?act=3.5` 把进度定在 3.5（截图靠它）；`?still` 只留画面；`?tier=high|mid|low` 定死档位；`?lang=zh` 中文。
