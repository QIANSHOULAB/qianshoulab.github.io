# 化缘僧 · 隐私权（后台左边 Privacy 那一页，从上到下）

框里的英文原样复制（审核员看英文）；每段下面一行是中文意思，给 Song 看的，不用贴。

## Single purpose（单一用途）

**Single purpose description**：

```
Huayuan turns the list or table on the web page you are viewing into an Excel or CSV file you can download.
```

中文意思：把你正在看的网页上的名单、表格变成能下载的 Excel 或 CSV。

## Permission justification（每个权限为什么要）

后台会照 manifest 列出下面五个框。化缘僧 0.4.1 的权限一个都删不掉：四个都在用（代码里查过 chrome.sidePanel / scripting / storage 的每处调用），网站权限本来就是「用到才问、只问一个站」。

**activeTab justification**：

```
Huayuan only works on the tab where you click its toolbar icon (or press Alt+Shift+H). activeTab gives it access to that one tab, only after your click, so it never reads other sites in the background.
```

中文：只在你点了图标的那个标签页干活，点了才有权限，别的网站碰不到。

**scripting justification**：

```
Injects Huayuan's own bundled script (no remote code) into the tab you clicked, to find the list, read its rows, highlight it, and click "Next" or scroll down when you ask it to go through every page.
```

中文：往你点的那页注入插件自带的脚本，认名单、读行、高亮、替你点「下一页」和往下滚。

**storage justification**：

```
Saves your settings (language, auto-download, page limits) and the column edits you made on each site in chrome.storage.local, on your own computer, so the same site works your way next time. Nothing is synced or sent anywhere.
```

中文：设置和每个网站改过的列存在你电脑上的浏览器里，下回照旧；不同步、不外传。

**sidePanel justification**：

```
The preview table and the controls open in Chrome's side panel, next to the page, so you can check the rows while the page stays visible.
```

中文：预览表和按钮开在侧边栏，网页不被挡住。

**Host permission justification**（manifest 里是 optional_host_permissions，装的时候不要）：

```
Optional, never requested at install. Some sites reload the whole page when Huayuan clicks "Next", and the browser may drop the activeTab access. Huayuan then shows an "Allow" button; only when you click it does it ask Chrome for access to that one site (for example https://example.com/*) so it can keep paging. Nothing is requested in the background.
```

中文：可选的，装的时候不要。有的网站点「下一页」是整页刷新，浏览器可能收回临时权限，侧栏就出一个「放行」按钮，你点了才只向那一个网站要权限，接着翻。

## Remote code（远程代码）

选 **No, I am not using remote code**（没有远程代码）。所有脚本都在 zip 里，不从网上加载代码，不用 eval。

## Data usage（数据使用）

第一组「What user data do you plan to collect from users now or in the future?」（你收集哪些用户数据）：

| 勾不勾 | 项 | 为什么 |
|---|---|---|
| ☑ 勾 | **Website content**（网站内容） | 化缘僧要读你点它那页上的名单（文字、链接、图片地址），在你电脑上做成表。Chrome 商店的用户数据说明写明「数据只在本机处理或存储，也要申报」（User Data FAQ 第 3 条：Extensions are required to disclose how they handle user data, even when data is processed or stored locally），所以照实勾这一项。读到的东西不离开你的电脑 |
| ☐ 不勾 | Personally identifiable information（身份信息） | 不读姓名、地址、邮箱这些账户信息（网页名单里要是有，算上面的「网站内容」，只在本机） |
| ☐ 不勾 | Health information（健康） | 没有 |
| ☐ 不勾 | Financial and payment information（财务、支付） | 没有 |
| ☐ 不勾 | Authentication information（密码、登录凭证） | 不碰 |
| ☐ 不勾 | Personal communications（邮件、聊天） | 没有 |
| ☐ 不勾 | Location（位置） | 没有 |
| ☐ 不勾 | Web history（浏览记录） | 不记你去过哪些网页。只按网站名记「上回改过的列」，是设置，不是浏览记录 |
| ☐ 不勾 | User activity（点击、按键、滚动监控） | 不监控你的操作；它替你点「下一页」、往下滚，是干活不是记录 |

第二组三个保证，**三个全勾**（都是实话）：

- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases（不卖、不转给第三方）
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose（不拿去干跟单一用途无关的事）
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes（不拿去评信用、放贷）

## Privacy policy（隐私政策）

**Privacy policy URL**：

```
https://qianshoulab.github.io/privacy/
```

中英两套、默认英文、右上角切换；写的是：不收集、不上传、不用 cookie 跟踪、数据只存在你浏览器里、有问题发邮件 oilsongchengmin@gmail.com，点名适用化缘僧、巡山僧、代笔僧。
