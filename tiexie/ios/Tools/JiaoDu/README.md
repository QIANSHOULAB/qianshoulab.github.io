# 角度算距离

填孔位分布圆半径 R 和 CMM 报告上 PA 偏的度数，算孔心挪了几毫米。

- 公式：弦长 2R × sin(|Δθ| ÷ 2)。孔心走的是直线（弦），不分 X/Y（Song 11-07 退回过分 X/Y 的版本：加工时偏移只在旋转方向）。
- 顺带给出：半径没偏时 TP ≈ 2 × 挪的距离；这个半径上 1° 是几毫米（R × π ÷ 180）。
- 数字格式跟网页的 JavaScript `toFixed` 一模一样（`Shared/NumberFormat.swift`）。
- 搬自：QIANSHOULAB/gongshi `tp/index.html` v0.5.5（字在 `strings.js` 的 zh.tp）。
- 单测：`Tests/JiaoDuTests.swift`，十组输入，网页、app 出的字一个不差。
- 长相（134 起）：照网页版 `tp/index.html` 的深色工单皮，颜色、字号、圆角、间距都抄它的样式表，网页只有深色一套，这里也只有一套；不套铁屑江湖的宣纸。网页底下那张「原理，说人话版」（图 + 六条）也搬了，图照网页的 SVG 坐标在 `Canvas` 里画。网页顶上切三个工具的标签、EN/中文不搬（app 里从工具箱进出、只要中文）。
- 字：西文和数字用网页同款 Barlow / Barlow Condensed（SIL OFL 1.1，`Barlow/`，许可在 `Barlow/JiaoDu-Barlow-OFL.txt`；文件名带 `JiaoDu-` 前缀），中文落到苹方。字没装上就退回系统字。
- 文件：`JiaoDu.swift` 算法，`JiaoDuStrings.swift` 字，`JiaoDuView.swift` 界面，`JiaoDuLook.swift` 长相（颜色、字、卡片、数字框）。
- 版本：0.1.0（铁屑江湖 0.1.0 起）；0.3.1 换回网页版长相。
