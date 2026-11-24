import Foundation

// 工时榨汁机的算法：照 gongshi 网页 index.html v0.5.5 的 CO 那段，一行一行搬。
// 填开始、结束时间 → 实际换型时间：扣掉跟这段时间重叠的休息；跨天跳过下班到次日上班；几段叠在一起同一分钟只扣一次。

struct BreakSpan: Codable, Equatable {
    var s: Int
    var e: Int
    var name: String
}

struct ShiftRules: Codable, Equatable {
    var on: Int
    var off: Int
    var breaks: [BreakSpan]

    /// 默认就是车间那套：10:00–10:10、11:30–12:10、15:00–15:10、18:00–18:30；08:15 上班、20:30 下班
    static let defaults = ShiftRules(on: 495, off: 1230, breaks: [
        BreakSpan(s: 600, e: 610, name: "休息"),
        BreakSpan(s: 690, e: 730, name: "午饭"),
        BreakSpan(s: 900, e: 910, name: "休息"),
        BreakSpan(s: 1080, e: 1110, name: "晚饭"),
    ])
}

enum GongShi {
    static let day = 1440
    static let maxBreaks = 12

    private static func isMin(_ v: Int) -> Bool { v >= 0 && v < day }

    /// 只认对的规则：时间都在一天之内，结束比开始晚，下班比上班晚
    static func valid(_ r: ShiftRules) -> Bool {
        isMin(r.on) && isMin(r.off) && r.off > r.on && r.breaks.count <= maxBreaks
            && r.breaks.allSatisfy { isMin($0.s) && isMin($0.e) && $0.e > $0.s && $0.name.count <= 12 }
    }

    static func sorted(_ r: ShiftRules) -> ShiftRules {
        var x = r
        // JS 的 sort 是稳定的；Swift 的 sort 不保证，带上原来的位置
        x.breaks = r.breaks.enumerated().sorted { a, b in
            if a.element.s != b.element.s { return a.element.s < b.element.s }
            if a.element.e != b.element.e { return a.element.e < b.element.e }
            return a.offset < b.offset
        }.map(\.element)
        return x
    }

    static func isDefault(_ r: ShiftRules) -> Bool { sorted(r) == sorted(.defaults) }

    static func fmt(_ m: Int) -> String { String(format: "%02d:%02d", m / 60, m % 60) }

    /// 边打边改：只留数字，小时后面自动加冒号。0/1/2 开头是两位小时，3–9 开头是一位
    static func mask(_ raw: String) -> String {
        let d = raw.filter { $0.isASCII && $0.isNumber }
        guard let first = d.first else { return "" }
        let hl = first >= "3" ? 1 : 2
        if d.count <= hl { return d }
        let a = d.prefix(hl), b = d.dropFirst(hl).prefix(2)
        return a + ":" + b
    }

    enum Parsed: Equatable {
        /// 空着，或者还在打
        case empty
        case bad
        case minutes(Int)
    }

    /// 几点几分 → 一天里的第几分钟。final = 打完了（离开了框）
    static func parse(_ raw: String, final: Bool) -> Parsed {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return .empty }
        let seps = CharacterSet(charactersIn: ":.：。,， \t\n\r")
        let h: Int, m: Int
        if s.unicodeScalars.contains(where: { seps.contains($0) }) {
            // JS 的 split(/[…]+/) 把连着的分隔符当一个
            let merged = mergeSplit(s, seps)
            if merged.count != 2 { return .bad }
            let a = merged[0], b = merged[1]
            if b.isEmpty { return final ? .bad : .empty }
            guard a.range(of: #"^\d{1,2}$"#, options: .regularExpression) != nil,
                  b.range(of: #"^\d{1,2}$"#, options: .regularExpression) != nil else { return .bad }
            if b.count == 1 { return final ? .bad : .empty }
            h = Int(a)!; m = Int(b)!
        } else {
            guard s.range(of: #"^\d{1,4}$"#, options: .regularExpression) != nil else { return .bad }
            if s.count <= 2 {
                if !final { return .empty }
                h = Int(s)!; m = 0
            } else if s.count == 3 {
                h = Int(String(s.prefix(1)))!; m = Int(String(s.dropFirst(1)))!
            } else {
                h = Int(String(s.prefix(2)))!; m = Int(String(s.dropFirst(2)))!
            }
        }
        if h > 23 || m > 59 { return .bad }
        return .minutes(h * 60 + m)
    }

    /// JS 的 s.split(/[:.：。,，\s]+/)
    private static func mergeSplit(_ s: String, _ seps: CharacterSet) -> [String] {
        var out: [String] = []
        var cur = ""
        var inSep = false
        for ch in s {
            let isSep = ch.unicodeScalars.allSatisfy { seps.contains($0) }
            if isSep {
                if !inSep { out.append(cur); cur = "" }
                inSep = true
            } else {
                cur.append(ch)
                inSep = false
            }
        }
        out.append(cur)
        return out
    }

    struct Result: Equatable {
        var gross: Int
        /// 每段休息各扣了几分钟（跟 rules.breaks 一一对应）
        var breaks: [Int]
        /// 跨天跳过的下班时间
        var night: Int
        var net: Int
    }

    /// S、E：一天里的第几分钟；days：跨了几个半夜（0 = 当天）。结束比开始早回 nil
    static func compute(_ S: Int, _ E: Int, days: Int, rules r: ShiftRules) -> Result? {
        let end = E + days * day
        if end < S { return nil }
        let gross = end - S
        var taken: [(Int, Int)] = []
        func take(_ a0: Int, _ b0: Int) -> Int {
            let a = max(a0, S), b = min(b0, end)
            if b <= a { return 0 }
            var pieces: [(Int, Int)] = [(a, b)]
            for (x, y) in taken {
                var i = pieces.count - 1
                while i >= 0 {
                    let (p, q) = pieces[i]
                    if !(y <= p || x >= q) {
                        let parts = [(p, min(q, x)), (max(p, y), q)].filter { $0.1 > $0.0 }
                        pieces.replaceSubrange(i...i, with: parts)
                    }
                    i -= 1
                }
            }
            var t = 0
            for (p, q) in pieces { t += q - p; taken.append((p, q)) }
            return t
        }
        let br = r.breaks.map { b -> Int in
            var t = 0
            for d in 0...days { t += take(b.s + d * day, b.e + d * day) }
            return t
        }
        var night = 0
        for d in 0..<days { night += take(r.off + d * day, r.on + (d + 1) * day) }
        return Result(gross: gross, breaks: br, night: night, net: gross - night - br.reduce(0, +))
    }

    static func dur(_ m: Int) -> String {
        if m < 60 { return "\(m) 分" }
        let h = m / 60, r = m % 60
        return r > 0 ? "\(h) 小时 \(r) 分" : "\(h) 小时"
    }

    /// 网页 render() 出的两行字：大数字、下面那句
    struct Shown: Equatable {
        var big: String
        var line: String
        var showFix: Bool
        var result: Result?
    }

    static func render(start: String, end: String, nextDay: Bool, startFinal: Bool = true, endFinal: Bool = true, rules: ShiftRules) -> Shown {
        let S = parse(start, final: startFinal), E = parse(end, final: endFinal)
        let days = nextDay ? 1 : 0
        if S == .bad || E == .bad {
            return Shown(big: "—", line: S == .bad ? GongShiStrings.badStart : GongShiStrings.badEnd, showFix: false, result: nil)
        }
        guard case .minutes(let s) = S, case .minutes(let e) = E else {
            let line = (S == .empty && E == .empty) ? GongShiStrings.needBoth : (S == .empty ? GongShiStrings.needStart : GongShiStrings.needEnd)
            return Shown(big: "—", line: line, showFix: false, result: nil)
        }
        guard let res = compute(s, e, days: days, rules: rules) else {
            return Shown(big: "—", line: GongShiStrings.endBeforeStart, showFix: true, result: nil)
        }
        return Shown(big: String(res.net), line: GongShiStrings.summary(net: dur(res.net), gross: res.gross, cut: res.gross - res.net), showFix: false, result: res)
    }
}
