import Foundation

// 角度算距离的算法：照 gongshi 网页 tp/index.html v0.5.5。
// 孔心从理论位置到实际位置走的是直线（弦）：2R × sin(|Δθ| ÷ 2)。不分 X/Y（Song 11-07：加工时偏移只在旋转方向）。

enum JiaoDu {
    /// 网页 read()：只认数字，允许负号、逗号当小数点；空 → nil，认不出 → NaN
    static func read(_ raw: String) -> Double? {
        // JS：trim() 以后 replace(',', '.') 只换第一个逗号
        let s = replaceFirstComma(raw.trimmingCharacters(in: .whitespacesAndNewlines))
        if s.isEmpty { return nil }
        guard s.range(of: #"^[-+]?(\d+\.?\d*|\.\d+)$"#, options: .regularExpression) != nil else { return .nan }
        return Double(s) ?? .nan
    }

    static func replaceFirstComma(_ s: String) -> String {
        guard let r = s.range(of: ",") else { return s }
        return s.replacingCharacters(in: r, with: ".")
    }

    /// 孔心直线挪了多少毫米
    static func distance(r: Double, deg: Double) -> Double {
        2 * r * sin(abs(deg) * Double.pi / 180 / 2)
    }

    /// 这个半径上转 1° 是几毫米
    static func perDegree(r: Double) -> Double { r * Double.pi / 180 }

    struct Out: Equatable {
        /// 大字（— 或者三位小数）
        var big: String
        /// 下面那一行
        var line: String
        /// 1° ≈ ? mm
        var perDeg: String
        var badR: Bool
        var badA: Bool
    }

    /// 网页 render() 那一套：两个框里的字 → 屏幕上出的字
    static func render(r rText: String, a aText: String) -> Out {
        let r = read(rText), a = read(aText)
        let rNaN = r.map { $0.isNaN } ?? false
        let aNaN = a.map { $0.isNaN } ?? false
        let rOk = r != nil && !rNaN && r! > 0
        let badR = rNaN || (r != nil && !rNaN && r! <= 0)
        let perDeg = JiaoDuStrings.perDeg(rOk ? JSNumber.toFixed(r! * Double.pi / 180, 4) : "R × 0.01745")
        guard rOk, let a, !aNaN else {
            let why: String
            if !rOk && r != nil { why = JiaoDuStrings.badR } else if aNaN { why = JiaoDuStrings.badA } else { why = JiaoDuStrings.need }
            return Out(big: "—", line: why, perDeg: perDeg, badR: badR, badA: aNaN)
        }
        let d = distance(r: r!, deg: a)
        return Out(big: JSNumber.toFixed(d, 3),
                   line: JiaoDuStrings.result(r: JSNumber.plain(r!), a: JSNumber.plain(abs(a)), tp: JSNumber.toFixed(d * 2, 3)),
                   perDeg: perDeg, badR: badR, badA: aNaN)
    }
}
