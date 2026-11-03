# 第三方库（从 npm 拷贝；只有 xlsx 改了一处，见下）

| 文件 | 包@版本 | 许可 | 用途 |
|---|---|---|---|
| jszip.min.js | jszip@3.10.1 | MIT / GPLv3 | 打 zip；docx-preview 依赖 |
| pizzip.min.js | pizzip@3.1.8 | MIT / GPLv3 | docxtemplater 依赖 |
| docxtemplater.min.js | docxtemplater@3.60.0 | MIT | 往 .docx 里填 {{空位}} |
| docx-preview.min.js | docx-preview@0.3.5 | Apache-2.0 | .docx 在浏览器里画成 HTML（预览 + PDF 排版） |
| xlsx.full.min.js | xlsx@0.18.5 (SheetJS CE) | Apache-2.0 | 读 Excel，按需加载 |


## 改动

- `xlsx.full.min.js`：XML 数字实体 `&#134071;` 解码把 `String.fromCharCode` 换成 `String.fromCodePoint`（非法码位返回空串）。原版会把扩展B区生僻字（如 𠮷 U+20BB7）截成 U+0BB7「ஷ」。openpyxl 等程序导出的 xlsx 用实体写生僻字，Excel 自己存的不受影响。2026-11-03 比武时发现。

## 字体（`../fonts/`，0.2.0 起）

| 文件 | 来源 | 许可 | 用途 |
|---|---|---|---|
| fonts/400/*.woff、fonts/700/*.woff | @fontsource/noto-sans-sc@5.3.1（Noto Sans SC 常规/粗体，按 Google Fonts 的切法切成 102 块） | SIL OFL 1.1，见 `fonts/OFL.txt` | PDF 里的字：只搬这批文档用得上的块，浏览器缓存（Cache Storage `chaojing-font-1`） |
| fonts/index.json | 自己用 fontTools 从各块 cmap 生成 | — | 哪个字在哪一块（13655 字；同一个字在多块里时优先 chinese-simplified） |
| fonts/serif/400、700/*.woff + index.json | @fontsource/noto-serif-sc@5.3.1（Noto Serif SC，102 块，13686 字） | SIL OFL 1.1，见 `fonts/serif/OFL.txt` | 宋体、仿宋、明朝、Times 这类字体名（0.2.1 起） |
| fonts/kai/400、700/*.woff + index.json | lxgw-wenkai-webfont@1.7.0（霞鹜文楷 常规/粗体，97 块，13786 字；woff2 用 fontTools 转 woff，删 AAT/GSUB/GPOS 表） | SIL OFL 1.1，见 `fonts/kai/OFL.txt` | 楷体（0.2.1 起） |
| fonts/latin/400、700/{latin,latin-ext}.woff + index.json | @fontsource/noto-sans@5.3.0（Noto Sans 常规/粗体，latin、latin-ext 两块） | SIL OFL 1.1，见 `fonts/latin/OFL.txt` | PDF 里的西文（0.4.1 起）：黑体那套里的拉丁字母、数字走它；弯引号、破折号、省略号这类标点只在没有中文的段落里走它 |
| fonts/latin-serif/400、700/{latin,latin-ext}.woff + index.json | @fontsource/noto-serif@5.3.0（Noto Serif 常规/粗体，latin、latin-ext 两块） | SIL OFL 1.1，见 `fonts/latin-serif/OFL.txt` | 同上，配宋体、楷体那两套（0.4.1 起） |

`fonts/make_index.py` 生成各套的 index.json（对黑体重跑结果和原文件逐字节一致）。

字体里没有的字（扩展A/B 区生僻字如 䶮 𠮷）：画成小图贴上，文字层照样写这个字（能选能搜）。

0.2.0 删掉了 html2canvas、jspdf：PDF 改成自己写（`index.html` 里 `pdfWorker`），不再截图。
