# 零肉身造物（Zero-Flesh Creation）· 源码

网址：https://qianshoulab.github.io/ （首页 / 观测台）、/zahuopu/（赛博杂货铺；/zhahuopu/ 是头一版打错字的网址，留了跳转）、/specimens/、/artifacts/、/codex/。
千手院在 /qianshou/，那页是手写的单文件，不归这里管。

## 规矩（策划书第一原则）
- 不引外部图片、字体、图标库、音频。画面全是 Canvas / CSS 现算现画，声音全是 Web Audio 当场合成，字只用系统字。
- 页脚的纯洁度检疫仪是真数：PerformanceObserver 收每个请求 + 扫 DOM。谁塞了一张图，页脚当场变琥珀色。
- `npm run build` 最后一步 `scripts/check-purity.mjs` 自检产物：有图片、音频、字体、3D 网格文件，或者样式里引了外面的 url()，构建直接失败。

## 写一篇新样本（写完推上去就上线）
1. 在 `src/content/specimens/` 放两份：`002-名字.en.mdx`、`002-名字.zh.mdx`（英文重写，不是翻译）。
2. 头上照 `001-cinderfall-arena.zh.mdx` 那样写：id、lang、slug、title、date、species、scale、liveUrl、sourceUrl、sourceLabel、modelStack、summary。
3. 两份的 id、date、链接、modelStack 必须一样，不一样构建报错。
4. 推到 main：工作流 `.github/workflows/zero.yml` 自己构建、自检、把产物提交到根目录，GitHub Pages 发出去，再对着真网址验一遍。

自研造物放 `src/content/artifacts/`（status: wip 就是「还在炉子里」），造物法则放 `src/content/codex/`。

## 改字
界面上的字全在 `src/i18n/ui.ts`（en 门面、zh 第二语言）。工具分拣（千手院 / 赛博杂货铺）在 `src/data/tools.ts`。

## 本地
```
cd _zero
npm ci
npm run build          # 出到 _zero/dist，带零肉身自检
node scripts/publish.mjs   # 拷到仓库根目录（只动 index.html、zahuopu、zhahuopu、specimens、artifacts、codex、zero-assets）
```
平时不用本地拷：推上去工作流会做。`publish.mjs` 发现 dist 里有名单外的东西会直接停，不会踩到别人的网址。

## 文件
- `src/components/core/`：`Header.astro`（顶栏，[肉身 | 无头]、声音、EN / 中文）、`PurityFooter.astro`（检疫仪）、`HeroCanvas.ts`（首页取景框）
- `src/components/labs/`：`wire.ts`（线框引擎）、`emblems.ts`（门牌、菜单小物种）、`AudioSynthLab.ts` + `SynthBench.astro`（Codex-01 声学公式测试板）
- `src/utils/`：`site.ts`（语言、无头模式、检疫仪）、`microSfx.ts`（微交互音效）、`archive.ts`（中英配对、时间流）
- `src/layouts/`：`BaseLayout.astro`、`SpecimenLayout.astro`（自动渲染档案卡）
- `scripts/`：`check-purity.mjs`、`publish.mjs`、`live-check.mjs`（线上验收）
