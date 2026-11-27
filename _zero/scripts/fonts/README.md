# 字体

- `src/fonts/cormorant-garamond-{400,500}.woff2`：wordmark、标题、铭文（拉丁字母）。Cormorant Garamond，SIL OFL，从 @fontsource 拷的 latin 子集。
- `src/fonts/ibm-plex-mono-400.woff2`：编号、小标签、SOUND: OFF。IBM Plex Mono，SIL OFL。
- `src/fonts/zero-serif-sc-500.woff2`：中文标题字（思源宋体 Noto Serif SC 500，SIL OFL），**只留页面上用到的那百来个字**，所以只有 20 KB 上下。

## 改了中文标题字以后（wordmark、标语、五道门的名字和那句话、页面大标题、三套档案的中文标题）

```
cd _zero
node --experimental-strip-types scripts/fonts/collect-chars.mjs      # 收字，写到 scripts/fonts/cjk-chars.txt
npm pack @fontsource/noto-serif-sc@5.3.1 && mkdir -p /tmp/nsc && tar -xzf fontsource-noto-serif-sc-5.3.1.tgz -C /tmp/nsc
python3 scripts/fonts/subset_cjk.py /tmp/nsc/package 500 src/fonts/zero-serif-sc-500.woff2   # 要 fonttools、brotli
```

没跑也不会坏：缺的字会退到系统宋体（Songti SC / Noto Serif CJK / 宋体），只是那几个字长得不一样。
