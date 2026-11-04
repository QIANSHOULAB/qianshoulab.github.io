# 巡山僧 · 商店文字（英文，默认那套）

后台 **Store listing**（商店信息）页，顶上语言选 **English**。灰框里的字整段复制贴进去（GitHub 上灰框右上角有复制钮）。

## Title（名称）：不用填，从包里读

```text
Xunshan · Price Watch – Drop & Restock Alerts
```

45 / 75 字符。来自 `extension/_locales/en/messages.json` 的 `extName`。

## Summary（简介）：不用填，从包里读

```text
Watches pages for price drops, restocks and new posts, and pings you the moment something moves. Your list stays in your browser.
```

129 / 132 字符。来自 `extDesc`（就是 manifest 的 description）。

## Description（详细说明）：贴进 Description 框

```text
Stares at the page so you don't have to: price drops, restocks, new posts.

Open a product page and click Xunshan. It finds the price and the stock status on its own; one more click and it's watching. Price drops or the item is back? You get a notification.

• Good news only. It speaks up when a price drops or crosses your line. Price goes back up? Silence.
• Any part of any page. Pick an area yourself, or watch a whole page for new posts. Ticking clocks and view counters don't count.
• No surprise tabs. Script-heavy pages and pages behind your login are read in an invisible frame, using the login already in your browser.
• Receipts. Every change comes with a before and after snapshot.
• Paste a list. Drop in a pile of links and set one "below" price for all of them.

On our test shop it caught 20 of 20 changes with zero false alarms.

No account, no server, no tracking. Your data stays on your computer.
```

数字出处：`bench/比武报告.md`「0.4.0 复查」，测试店剧本 20 次该叫的叫了 20 次，漏 0，误报 0。

## Category（类别）

**Shopping**（在 Lifestyle 那组里）。没有这一项就选 Productivity → Tools。

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

截图四张说的事：
1. One click. Watching.：商品页上点巡山僧，认出价格，点一下就盯上
2. It calls. With receipts.：总览里的变化记录，1,099 → 899，前后两张截图
3. Pick any part of a page.：认不出的自己框一块（订单状态）
4. A whole list, one paste.：一次贴一串网址，低于 100 就叫

## Additional fields（其他）

| 格子 | 填 |
|---|---|
| Official URL（官方网址） | None（不选） |
| Homepage URL（主页） | `https://qianshoulab.github.io/xunshan/` |
| Support URL（支持） | `https://qianshoulab.github.io/xunshan/` |
| Mature content（成人内容） | 不勾 |
