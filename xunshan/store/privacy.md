# 巡山僧 · 隐私权（Privacy 页）

后台左边 **Privacy**（隐私权）页，从上到下照填。框里一律贴英文（审核员读英文）；每段下面一行是中文意思，给自己看。
对的是 0.4.1 的 `extension/manifest.json`：7 个权限 + 按网站现要的网站权限。装的时候浏览器只提示一条「显示通知」（Chromium 实测）。

## Single purpose description（单一用途）

```text
Watches web pages (or a part of a page) that the user chose, re-checks them on a schedule, and shows a notification when the content changes or meets the user's condition (price below/above a number, a word appears/disappears).
```

盯住用户自己选的网页或网页里的一块，定时去看，变了、到了用户设的条件，弹通知。

## Permission justification（每个权限为什么要）

后台每个权限一个框，名字对上就贴。

**storage**

```text
Stores the user's watchlist, the history of detected changes, small snapshots, settings and the chosen UI language locally in chrome.storage.local. Nothing is sent to any server.
```

盯梢清单、变化记录、小截图、设置、语言，全存在本机。

**alarms**

```text
Wakes the extension every 30 seconds (as a fallback to a precise in-worker timer) to re-check watches whose interval (1 minute to 1 day, chosen by the user) has elapsed. Without it, checks stop when Chrome puts the service worker to sleep.
```

30 秒醒一次当保底，到点的去看；没有它，后台一睡就不看了。

**notifications**

```text
Shows a system notification when a watched page changes or meets the user's condition, and when a watch keeps failing (for example, the page now requires a login). Notifying the user is the point of the extension.
```

变了、到线了弹通知；连着几回看不成也说一声。

**activeTab**

```text
When the user clicks the toolbar button, reads the current tab's URL and title and looks at the page once (in the user's own browser) to find the price / stock block, so the user can start watching it with one click. Nothing leaves the browser.
```

点工具栏图标时看一眼当前页，认出价格、库存那块。

**scripting**

```text
Injects the price / stock finder into the current tab only when the user opens the popup, and the element picker only when the user clicks "Pick an area". Also registers a small content script that only acts inside the extension's own hidden frame (see offscreen) to read the chosen part of a script-rendered page; on any other page it exits immediately.
```

开弹窗时往当前页注入认价格的脚本、点「自己框一块」时注入框选；另注册一个只在插件自己的隐藏小窗里干活的脚本。

**offscreen**

```text
Uses an offscreen document to (1) parse fetched HTML with DOMParser, (2) load script-rendered pages the user chose to watch in a hidden sandboxed iframe, so no tabs ever pop up in the user's window, and (3) draw a small local snapshot of the watched part when it changes (stored only in chrome.storage.local, shown in the change history).
```

离屏页里解析抓回来的网页、在看不见的小窗里读脚本页、拍变化前后的小截图。

**declarativeNetRequestWithHostAccess**

```text
Some sites send X-Frame-Options / CSP frame-ancestors headers, which stop the hidden iframe above from loading. A session rule removes those two response headers only for sub-frame requests that (a) are initiated by this extension itself (initiatorDomains = the extension's id, tabIds = TAB_ID_NONE) and (b) go to hosts the user has added to the watchlist. Normal browsing is never affected. The rule is rebuilt from the watchlist every time it changes.
```

会话规则只对插件自己发起、只对盯梢里的网站去掉那两个响应头，正常上网不受影响。

**Host permission（网站权限，optional_host_permissions `http://*/*`、`https://*/*`）**

```text
Requested at runtime, one site at a time (https://example.com/*), the first time the user watches something on that site. Needed to fetch the page on schedule with the user's own login cookies and to read it. No host permission is granted at install.
```

用户第一次盯某个网站时按那个网站现要，装的时候一个都不要。

## Remote code（远程代码）

选 **No, I am not using Remote code**（没用远程代码）。要是有说明框，贴：

```text
All JavaScript is packaged in the extension. Fetched pages are only parsed as data (DOMParser) or loaded in a sandboxed hidden iframe; the extension never evaluates page content as code.
```

## Data usage（数据使用）

「What user data do you plan to collect…」那一排勾：

| 勾不勾 | 项 | 为什么 |
|---|---|---|
| 勾 | **Website content**（网站内容） | 要读用户选的那页才知道变没变；读到的那一小块和小截图只存在本机 |
| 不勾 | 其余八项（Personally identifiable information、Health information、Financial and payment information、Authentication information、Personal communications、Location、Web history、User activity） | 不碰。盯梢清单是用户自己加的网址，不是浏览记录 |

这几格问的是插件「碰」了哪些数据（商店页上写作 handles），不是传没传出去。我们照实勾 Website content，传出去的是零。

底下三句声明全勾：
- I do not sell or transfer user data to third parties, outside of the approved use cases（不卖、不给第三方）
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose（不用在单一用途以外）
- I do not use or transfer user data to determine creditworthiness or for lending purposes（不拿去评信用、放贷）

## Privacy policy URL（隐私政策网址）

```text
https://qianshoulab.github.io/privacy/
```

## 给审核员的测试说明（Test instructions 页的 Additional instructions 框）

用户名、密码两格空着，这段贴进说明框：

```text
1. Open any product page that shows a price.
2. Click the Xunshan toolbar icon. The popup finds the price (and the stock status, if there is one) by itself.
3. Click the price row. The browser asks once for permission to access that site; allow it. The row now says "Watching · Any drop".
4. Optional: right under that row, click "Below", type a number above the current price and press Enter.
5. Right-click the icon > Options to open the overview. "Check now" re-checks immediately; the change history and snapshots appear below.
6. No account or login is needed. In an empty popup, "Try a demo" adds a sample watch that already has a price drop.
7. The UI language switch (EN / 中文) is in the top-right corner; English is the default.
```
