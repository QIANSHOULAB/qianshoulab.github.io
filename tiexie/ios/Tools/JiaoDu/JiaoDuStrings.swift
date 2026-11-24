// 角度算距离的字（照 gongshi strings.js 的 zh.tp，App 里只要中文）
enum JiaoDuStrings {
    static let name = "角度算距离"
    static let sub = "报告说只歪了零点几度，听着不多。\n换成毫米，当场露馅。"
    static let tile = "填半径和偏的度数，算孔心挪了几毫米"
    static let r = "分布圆半径"
    static let rHint = "工件中心到孔中心"
    static let a = "角度偏了"
    static let aHint = "CMM 报告 PA 那行的 DEV"
    static let band = "孔心挪了"
    static let chip = "例子"
    static let need = "填半径和角度。"
    static let badR = "半径得是正数。"
    static let badA = "角度认不出来，只填数字，比如 0.4175、-1.3762。"
    static func result(r: String, a: String, tp: String) -> String { "R\(r) 上偏 \(a)° · 半径没偏的话，TP 约 \(tp)" }
    static func perDeg(_ v: String) -> String { "1° ≈ \(v) mm" }
    static let fTitle = "公式"
    static let formulas: [(String, String, String)] = [
        ("孔心直线挪的距离", "2R × sin(度数 ÷ 2)", "孔心走的是直线，不是圆弧。只偏零点几度时，跟 R × 度数 × π ÷ 180 差不到 0.001 毫米（π ÷ 180 是把度换成弧度）。"),
        ("这个半径上转 1°", "", "偷懒算法：度数 × 这个数。"),
        ("总偏移（从 TP 来）", "TP ÷ 2", "报告上的 TP 是公差圆的直径，除以 2 才是孔心实际跑了多远。"),
        ("半径偏没偏", "√((TP ÷ 2)² − 直线偏移²)", "TP ÷ 2 跟上面算的差不多，半径就没偏；差出来的那截，就是孔往里或往外跑的量。"),
    ]
    // 134：网页底下那张「原理，说人话版」（图 + 六条），照网页搬过来
    static let mTitle = "原理，说人话版"
    static let diagChord = "直线"
    static let diagArc = "圆弧"
    static let diagCap = "O 工件中心 · A 理论孔位 · B 实测孔位（角度放大了好多倍画的）"
    static let math: [(String, String)] = [
        ("为什么是三角形", "孔绕着工件中心转了个角。中心 O、理论孔位 A、实测孔位 B 连起来，是两条腰都等于 R 的等腰三角形，顶上那个角就是偏的度数。"),
        ("孔心走的是直线", "从 A 到 B 走的是三角形底边，不是圆弧：底边 = 2R × sin(度数 ÷ 2)。角度小的时候它跟圆弧一样长，圆弧 = R × 弧度。"),
        ("度怎么变弧度", "转一圈是 360°，也是 2π 弧度，所以 1° = π ÷ 180 ≈ 0.01745。"),
        ("TP 为什么除以 2", "TP 是公差圆的直径，孔心实际跑的距离是半径，所以除以 2。"),
        ("半径偏没偏，勾股定理说了算", "孔心只能沿圆周跑（角度偏）或者沿半径跑（半径偏），这两个方向互相垂直：(TP ÷ 2)² = 直线偏移² + 半径偏移²。算出的直线偏移 ≈ TP ÷ 2，半径偏移就是 0。"),
        ("落到机床的 X、Y", "AB 是斜边，X、Y 是两条直角边：dX = R × (cos 实测角 − cos 理论角)，dY = R × (sin 实测角 − sin 理论角)。孔在 X 轴上，偏移几乎全给 Y；孔在 Y 轴上，几乎全给 X。"),
    ]
}
