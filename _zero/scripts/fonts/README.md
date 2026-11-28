# 字体（v3.3 起：全站细黑，没有宋体）

- `src/fonts/zero-display-{200,300}.woff2`：拉丁字母（wordmark、栏目名、那句话、天上五个名字、顶栏、「进去」、页脚、栏目页大标题）。**Montserrat**，SIL OFL（`LICENSE-Montserrat.txt`），只留基本拉丁、拉丁补充和几个排版标点，一个十来 KB。200 给 3D 里聚出来的大字和大标题，300 给小字。
- `src/fonts/zero-hei-sc-{200,300}.woff2`：中文，同上那些地方。**思源黑体 Noto Sans SC**，SIL OFL（`LICENSE-Noto-Sans-SC.txt`），**只留页面上用到的那两百来个字**（`cjk-chars.txt`），一个三十 KB 上下。「进去 →」的箭头也从这里出。
- `src/fonts/ibm-plex-mono-400.woff2`：栏目页里的编号、小标签。IBM Plex Mono，SIL OFL。首页不用、不预载。
- CSS 里走两个变量：`--display`（拉丁在前）、`--display-zh`（中文在前），兜底只有系统黑体（PingFang SC、Hiragino Sans GB、Noto Sans CJK SC、Source Han Sans SC、Microsoft YaHei UI、system-ui、sans-serif），没有一套宋体、衬线。老名字 `--serif`、`--serif-zh` 还在，指向同样两套（栏目页的样式不用跟着改）。

为什么是这一套（v3.3 比过三套，同一张星空、同一批字摆在一起：`_ops/零肉身造物/v3.3截图/字体三套对比.jpg`）：
- A Montserrat 200 + 思源黑体 200（用了）：最细一档也不发虚，字身宽、几何、大写的 C、G、O 是正圆，字距拉开以后像刻在天上；跟思源黑体 200 的笔画粗细对得上。
- B Jost 300：大写窄一圈、尖 A，像 Futura，摆在一起比中文重。
- C Lexend Giga 200：最宽，可小写也一样宽，页脚那行一挤就折行，小字显得机械。

## 改了标题字以后（栏目名、那句话、顶栏、页脚、栏目页大标题、三套档案的中文标题）

```
cd _zero
node --experimental-strip-types scripts/fonts/collect-chars.mjs      # 收字，写到 scripts/fonts/cjk-chars.txt
npm pack @fontsource/montserrat@5.3.0 @fontsource/noto-sans-sc@5.3.1
mkdir -p /tmp/fs && for f in fontsource-*.tgz; do mkdir -p /tmp/fs/${f%.tgz} && tar -xzf $f -C /tmp/fs/${f%.tgz}; done
python3 scripts/fonts/subset.py /tmp/fs/fontsource-montserrat-5.3.0/package /tmp/fs/fontsource-noto-sans-sc-5.3.1/package src/fonts   # 要 fonttools、brotli
```

没跑也不会坏：缺的字退到系统黑体，只是那几个字长得不一样。首页 3D 里的字（星尘字）是浏览器拿这两套字现画成距离场的，字库里没有的字也照样退到系统黑体。
