# 代笔僧 · 商店文字（中文，第二套）

后台 **Store listing**（商店信息）页，顶上语言下拉换成 **Chinese (China)**（中文（中国））再填这一套。灰框里的字整段复制贴进去。

## Title（名称）：不用填，从包里读

```text
代笔僧 · 自动填表
```

10 / 75 字符。来自 `extension/_locales/zh_CN/messages.json` 的 `name`（Song 在代笔僧会话里定的 1A）。

## Summary（简介）：不用填，从包里读

```text
把 Excel / CSV 一行一行填进网页表单：表头自动对上输入框，下拉、单选、复选、日期、上传文件都会填；也能直接读 Google 表格，填完标状态。数据只存在你的浏览器里。
```

89 / 132 字符。来自 `description`。

## Description（详细说明）：贴进 Description 框

```text
把 Excel / CSV 一行一行填进网页表单。施主喝茶，贫僧代笔。

表格丢给代笔僧，表头自己对上输入框；每行填好你看一眼、点提交，嫌慢就让它自己交。

· 难填的也填：下拉、单选、复选、日历、上传文件、iframe 里的表单。
· 认得常见组件库：Ant Design、Element Plus、MUI、Select2、Shadow DOM。
· Google 表格贴链接就读，用你浏览器里现成的 Google 登录。
· 多页表单、不跳页的表单：交上了它自己知道，接着填下一行。
· 教一次就会：同一个网站下回不用再对字段；同一张表再放进来，交过的行不会再交。

实测：同一张 20 行的表，在 13 种表单上填，1138 格，一格不错。

不用注册，没有服务器，不跟踪。数据只在你的电脑里。
```

数字出处：`bench/比武报告.md`「0.2.2 复赛」起每轮复测，0.4.0 复赛同一沙盒仍是 1138 格错 0。

## Category（类别）、Language（语言）

类别跟英文那套一样（Workflow & Planning），语言就是这一页选的 Chinese (China)。

## 图（Graphic assets）

| 后台的格子 | 拖哪个文件 |
|---|---|
| Screenshots（截图，按顺序） | `store/shots/zh/1.png` → `2.png` → `3.png` → `4.png` |
| Store icon、Small promo tile | 这一页要是也要，就拖跟英文那套同样的 `store/icon-128.png`、`store/promo-440x280.png` |

截图四张的大字：Excel 丢进来，网页表单它来填。／表头自己对上输入框。／五行交完，你一个字没打。／出错写明原因，一下重试。
