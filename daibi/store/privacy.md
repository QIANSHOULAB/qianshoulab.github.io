# 代笔僧 · 隐私权（Privacy 页）

后台左边 **Privacy**（隐私权）页，从上到下照填。框里一律贴英文（审核员读英文）；每段下面一行是中文意思，给自己看。
对的是 0.4.1 的 `extension/manifest.json`：4 个权限 + 自家示例表单一个网站权限 + 按网站现要的网站权限。装的时候浏览器只提示一条「读取和更改你在 qianshoulab.github.io 上的数据」（Chromium 实测）。

## Single purpose description（单一用途）

```text
Fills web forms with rows from a spreadsheet the user provides (Excel, CSV or a Google Sheets link), one row at a time, on websites the user chooses.
```

把用户自己给的表格一行一行填进用户选的网页表单。

## Permission justification（每个权限为什么要）

后台每个权限一个框，名字对上就贴。

**sidePanel**

```text
The whole interface lives in Chrome's side panel, opened by clicking the toolbar icon, so the user sees the spreadsheet rows and the web form side by side while filling.
```

界面就是侧栏，点工具栏图标打开，表格和网页并排。

**storage**

```text
Stores the user's spreadsheet rows and their fill status, the column-to-field matches for each site, settings and the chosen UI language locally in chrome.storage.local. Attachments the user adds stay in the extension's own IndexedDB. Nothing is sent to any server.
```

表格、每行状态、每个网站的字段对应、设置、语言，全存在本机；附件在本机 IndexedDB。

**scripting**

```text
Injects the form filler into the current tab only when the user asks Daibi to match fields or fill a row. With allFrames it also reaches forms embedded in iframes, but only on sites the user has allowed. It reads field labels and options, types the row's values in, and notices when the user submits so it can fill the next row; it clicks Submit itself only if the user turned on Auto-submit. Right before an automatic submit it briefly catches the page's alert() so the site's validation message can be shown next to that row.
```

用户让它对字段、填一行时才往当前页（和授权过网站的 iframe）注入；读框、填值、看用户交了没；只有开了「自动提交」才替人点提交；提交前那几秒把网页弹框的话接住写到那一行。

**activeTab**

```text
Clicking the toolbar icon opens the side panel for the current tab. activeTab lets Daibi read that tab's address and look at its form fields once, before the user has granted access to the site.
```

点图标时看一眼当前页的网址和表单，还没给网站权限也能先认。

**Host permission（网站权限）**

`host_permissions`：`https://qianshoulab.github.io/*`；`optional_host_permissions`：`http://*/*`、`https://*/*`。后台只有一个框，整段贴：

```text
https://qianshoulab.github.io/* is our own sample form (https://qianshoulab.github.io/daibi/demo/). "Try a sample" opens it and fills it right away, so first-time users can see Daibi work without granting anything.
http://*/* and https://*/* are optional and requested at runtime, one site at a time (for example https://example.com/*), the first time the user fills a form on that site; also the site of an embedded iframe form if there is one, and docs.google.com / *.googleusercontent.com only when the user pastes a Google Sheets link. Access to a site is needed so filling keeps working across page loads, multi-page forms and iframes. No other site is granted at install.
```

自家示例表单直接带着，「用示例试试」不用授权；别的网站按网站现要（表单在 iframe 里就连 iframe 的网站一起要；贴 Google 表格链接时才要 Google 那两个）。

## Remote code（远程代码）

选 **No, I am not using Remote code**（没用远程代码）。要是有说明框，贴：

```text
All JavaScript is packaged in the extension. Spreadsheets (CSV, XLSX) are parsed locally by code in the package, with no third-party library; page content is never evaluated as code.
```

## Data usage（数据使用）

「What user data do you plan to collect…」那一排勾：

| 勾不勾 | 项 | 为什么 |
|---|---|---|
| 勾 | **Personally identifiable information**（个人身份信息） | 用户丢进来的表里常有姓名、电话、邮箱；只存在本机，只填进用户选的表单 |
| 勾 | **Website content**（网站内容） | 要读表单的标签、选项才能对字段 |
| 不勾 | 其余七项（Health information、Financial and payment information、Authentication information、Personal communications、Location、Web history、User activity） | 不碰 |

这几格问的是插件「碰」了哪些数据（商店页上写作 handles），不是传没传出去。照实勾这两项，传给我们或第三方的是零。

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
1. Click the Daibi toolbar icon. The side panel opens.
2. Click "Try a sample". Daibi loads a 5-row sample sheet, opens our practice form (https://qianshoulab.github.io/daibi/demo/), matches the columns to the fields and fills row 1. No permission prompt: this one site is in host_permissions.
3. Look at the form and click its Submit button. Daibi fills row 2 by itself. Repeat; the panel marks each row Done. Submitted orders only stay on that page.
4. Optional: turn on "Auto-submit" and Daibi clicks Submit for each row.
5. On any other site, the first fill asks once for access to that site (optional host permission).
6. No account or login is needed. The UI language switch (EN / 中文) is in the top-right corner of the panel; English is the default.
```
