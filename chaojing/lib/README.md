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

字体里没有的字（扩展A/B 区生僻字如 䶮 𠮷）：画成小图贴上，文字层照样写这个字（能选能搜）。

0.2.0 删掉了 html2canvas、jspdf：PDF 改成自己写（`index.html` 里 `pdfWorker`），不再截图。
