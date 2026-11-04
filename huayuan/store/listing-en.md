# 化缘僧 · 英文商店页（Store listing → English）

每一格前面写的是后台那个框的英文名。三个 ``` 框里的字原样复制，框外的是给 Song 看的说明。

## 名称、简介（不用填，后台从 zip 里读）

- **Title**（名称）：`Huayuan · List Grabber` —— 22 / 75 字符
- **Summary**（简介）：`Any list or table on a web page, into Excel or CSV. Pages through, scrolls to the end, names the columns. Data stays local.` —— 123 / 132 字符

来自 `extension/_locales/en/messages.json` 的 extName / extDesc，后台显示成灰的、改不了；要改得改插件、加版本号、重新打包。

## Product details（商品详情）

**Description**（详细说明）：

```
Huayuan turns the list or table on the page you're looking at into an Excel or CSV file. Pages behind a login work too: it reads the page you're already signed into.

• Finds the list on its own. Tables, cards, product grids. Wrong block? Hit Switch.
• Pages through and scrolls down. It finds "Next" and "Load more" by itself and scrolls infinite feeds to the very end.
• Names the columns. Headlines become Name, struck-out prices become Original price, and anything it isn't sure about gets flagged yellow. On our own 6-page test set: 1,724 rows, 0 errors, 48 of 48 columns named right.
• Downloads itself. Hit Start, go get a coffee. The sheet is waiting in Downloads.
• Remembers your edits. Same site next time, the columns you renamed, removed and reordered are already done.

Your data stays on your computer. No uploads, no account. We couldn't peek if we tried.
```

**Category**（类别）：`Tools`（工具；新版后台在 Productivity 那一组下面）

**Language**（语言）：`English`

## Graphic assets（图）

| 后台的框 | 拖哪个文件 |
|---|---|
| Store icon（商店图标，128×128） | `icon-128.png` |
| Screenshots（截图，1280×800，按这个顺序） | `screenshots-en/1-table.png`、`2-cards-dark.png`、`3-scroll.png`、`4-second.png` |
| Small promo tile（小宣传图，440×280） | `promo-440x280.png` |
| Marquee promo tile（大横幅 1400×560） | 不填（可选） |
| YouTube video（视频） | 不填（可选） |

截图上的大字：
1. Any web list, straight into Excel.（客户名单一打开就认出来、找到「下一页」）
2. Turns the pages. Downloads the sheet.（卡片翻 4 页 48 条，化完自己下好，深色模式）
3. Infinite scroll, finitely handled.（无限滚动，不点开始自己滚到底，120 件）
4. Same site again? Your edits are already done.（同一网站第二回，上回的改名、删列、顺序自己办好）

## Additional fields（其他）

- **Official URL**（官方网址）：不选，保持 None（要先在 Google Search Console 验证网站，不值当）
- **Homepage URL**（主页）：`https://qianshoulab.github.io/huayuan/`
- **Support URL**（支持）：`https://qianshoulab.github.io/huayuan/`（页脚有「Feedback」，点了是一封填好的信）
- **Mature content**（成人内容）：关着
