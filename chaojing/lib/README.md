# 第三方库（从 npm 拷贝；只有 xlsx 改了一处，见下）

| 文件 | 包@版本 | 许可 | 用途 |
|---|---|---|---|
| jszip.min.js | jszip@3.10.1 | MIT / GPLv3 | 打 zip；docx-preview 依赖 |
| pizzip.min.js | pizzip@3.1.8 | MIT / GPLv3 | docxtemplater 依赖 |
| docxtemplater.min.js | docxtemplater@3.60.0 | MIT | 往 .docx 里填 {{空位}} |
| docx-preview.min.js | docx-preview@0.3.5 | Apache-2.0 | .docx 在浏览器里画成 HTML（预览 + 转 PDF） |
| html2canvas.min.js | html2canvas@1.4.1 | MIT | HTML 截成图（转 PDF） |
| jspdf.umd.min.js | jspdf@2.5.2 | MIT | 拼 PDF |
| xlsx.full.min.js | xlsx@0.18.5 (SheetJS CE) | Apache-2.0 | 读 Excel，按需加载 |


## 改动

- `xlsx.full.min.js`：XML 数字实体 `&#134071;` 解码把 `String.fromCharCode` 换成 `String.fromCodePoint`（非法码位返回空串）。原版会把扩展B区生僻字（如 𠮷 U+20BB7）截成 U+0BB7「ஷ」。openpyxl 等程序导出的 xlsx 用实体写生僻字，Excel 自己存的不受影响。2026-11-03 比武时发现。
