# 代笔僧 · 商店文字（英文，默认那套）

后台 **Store listing**（商店信息）页，顶上语言选 **English**。灰框里的字整段复制贴进去（GitHub 上灰框右上角有复制钮）。

## Title（名称）：不用填，从包里读

```text
Daibi · Form Filler
```

19 / 75 字符。来自 `extension/_locales/en/messages.json` 的 `name`（Song 拍板的英文名格式「拼音 · 一句大白话」）。

## Summary（简介）：不用填，从包里读

```text
Fills web forms from Excel or CSV, row by row: dropdowns, date pickers, uploads, Google Sheets. Your data stays in your browser.
```

128 / 132 字符。来自 `description`（就是 manifest 的 description）。

## Description（详细说明）：贴进 Description 框

```text
Fills web forms from Excel or CSV, one row at a time. You sip tea; the monk types.

Drop a spreadsheet into Daibi and it fills the form in front of you. Columns find their fields on their own. You check each row and hit Submit, or let it submit for you.

• Fills the fiddly stuff: dropdowns, radio buttons, checkboxes, date pickers, file uploads, forms inside iframes.
• Gets along with Ant Design, Element Plus, MUI, Select2 and Shadow DOM forms.
• Reads a Google Sheets link directly, using the Google login already in your browser.
• Multi-page forms and forms that never reload: it notices when a row went in and moves on.
• Teach it once. Same site next time, no matching. Same sheet again, rows already sent stay sent.

In our tests: the same 20-row sheet on 13 kinds of forms, 1,138 cells, zero wrong.

No account, no server, no tracking. Your data stays on your computer.
```

数字出处：`bench/比武报告.md`「0.2.2 复赛」起每轮复测：20 行 13 个场景（8 个自建 + 真 AntD / Element Plus / MUI / select2 / Shadow DOM）1138 格错 0，0.4.0 复赛同一沙盒再测仍是 0。

## Category（类别）

**Workflow & Planning**（在 Productivity 那组里）。没有这一项就选 Productivity → Tools。

## Language（语言）

**English**

## 图（Graphic assets）

| 后台的格子 | 拖哪个文件 |
|---|---|
| Store icon（商店图标，128×128） | `store/icon-128.png` |
| Screenshots（截图，1280×800，按顺序） | `store/shots/en/1.png` → `2.png` → `3.png` → `4.png` |
| Small promo tile（小宣传图，440×280） | `store/promo-440x280.png` |
| Marquee promo tile（大横幅） | 空着 |
| Global promo video（宣传视频） | 空着 |

截图四张说的事（都是示例表单 + 侧栏，真流程拍的）：
1. Drop in a spreadsheet. It fills the form.：两行交了，第 3 行填好等你提交
2. Columns find their fields on their own.：8 列全对上，每列对的哪个框、填的什么
3. Five rows in. You typed nothing.：5 行全交，示例表单收到 5 单
4. Errors say why. One click to retry.：第 3 行产品选项里没有，标红写原因，主按钮「Retry 1 failed」

## Additional fields（其他）

| 格子 | 填 |
|---|---|
| Official URL（官方网址） | None（不选） |
| Homepage URL（主页） | `https://qianshoulab.github.io/daibi/` |
| Support URL（支持） | `https://qianshoulab.github.io/daibi/` |
| Mature content（成人内容） | 不勾 |
