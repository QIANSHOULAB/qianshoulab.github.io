# 角度算距离

填孔位分布圆半径 R 和 CMM 报告上 PA 偏的度数，算孔心挪了几毫米。

- 公式：弦长 2R × sin(|Δθ| ÷ 2)。孔心走的是直线（弦），不分 X/Y（Song 11-07 退回过分 X/Y 的版本：加工时偏移只在旋转方向）。
- 顺带给出：半径没偏时 TP ≈ 2 × 挪的距离；这个半径上 1° 是几毫米（R × π ÷ 180）。
- 数字格式跟网页的 JavaScript `toFixed` 一模一样（`Shared/NumberFormat.swift`）。
- 搬自：QIANSHOULAB/gongshi `tp/index.html` v0.5.5（字在 `strings.js` 的 zh.tp）。
- 单测：`Tests/JiaoDuTests.swift`，十组输入，网页、app 出的字一个不差。
- 文件：`JiaoDu.swift` 算法，`JiaoDuStrings.swift` 字，`JiaoDuView.swift` 界面。
- 版本：0.1.0（铁屑江湖 0.1.0 起）。
