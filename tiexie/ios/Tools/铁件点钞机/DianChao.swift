import Foundation
import CoreGraphics

// 铁件点钞机的算法：照 QIANSHOULAB/gongshi draft-count 分支 count/index.html（0.5.0）搬界面那头的规矩，大脑换成大管家（121 的 tx-count）。
// 拍完缩到大管家看图的尺寸（pc-butler handheld/luru.py 的 resized_size：长边 2576、28 像素一格、最多 4784 格），寄 tx-count；
// 回两封信：stage first 先出数和圆点；stage final 补上第二眼（补的点柠檬绿圈）。两封都没到之前数码管一直转，90 秒没第一封就说大管家没回。
// 145 起第一封之前还有几封 stage partial（大管家边写边寄，带到目前的全部点）：圆点一个个亮、数字跟着跳；最后的数只认 first / final。
// 圆点能手改：点圆点删掉，点漏掉的件补一个；每盒「不算 / 也算上」能翻。坐标都是 0~1000（y, x），跟大管家一样。

struct DCPoint: Equatable {
    var y: Double
    var x: Double
    /// 手补的
    var man = false
    /// 第二眼补的（柠檬绿圈）
    var aud = false
}

struct DCTray: Equatable {
    /// [y0, x0, y1, x1]，0~1000
    var box: [Double]
    var complete: Bool
    var main: Bool
    /// 算不算（「不算 / 也算上」翻的就是它）
    var on: Bool
    var pts: [DCPoint]
}

enum DCPhase: Equatable {
    case idle
    /// 寄出去了，两封都还没到（数码管转）
    case waiting
    /// 第一封到了，等第二眼
    case first
    case done
    case jam(String)
}

enum DianChao {
    static let tag = "tx-count"
    static let firstTimeout: TimeInterval = 90
    /// 第一封到了以后，第二眼最多再等这么久（大管家那头一遍 90 秒）；过了就照第一遍的数
    static let finalTimeout: TimeInterval = 200

    // ------------------------------------------------------------ 缩图：照 luru.resized_size
    static let edge = 2576, tokens = 4784, patch = 28

    static func imageTokens(_ w: Int, _ h: Int) -> Int { ((w + patch - 1) / patch) * ((h + patch - 1) / patch) }

    static func fits(_ a: Int, _ b: Int) -> Bool {
        ((a + patch - 1) / patch) * patch <= edge && ((b + patch - 1) / patch) * patch <= edge && imageTokens(a, b) <= tokens
    }

    /// 大管家的大脑看图时会缩成的尺寸（Claude 文档里的 resized_size）；本来就够小的不动
    static func resizedSize(_ w: Int, _ h: Int) -> (Int, Int) {
        if fits(w, h) { return (w, h) }
        if h > w {
            let (rh, rw) = resizedSize(h, w)
            return (rw, rh)
        }
        let ar = Double(w) / Double(h)
        var lo = 1, hi = w
        while lo + 1 < hi {
            let mid = (lo + hi) / 2
            if fits(mid, max(Int((Double(mid) / ar).rounded(.toNearestOrEven)), 1)) { lo = mid } else { hi = mid }
        }
        return (lo, max(Int((Double(lo) / ar).rounded(.toNearestOrEven)), 1))
    }

    // ------------------------------------------------------------ 请求
    static func photoName(_ id: String) -> String { "点钞/\(id.prefix(8)).jpg" }

    static func request(id: String, app: String, at: String) -> [String: Any] {
        ["v": 1, "id": id, "ask": tag, "images": [photoName(id)], "at": at, "app": app]
    }

    // ------------------------------------------------------------ 回信
    struct Letter {
        var stage: String
        var ok: Bool
        var why: String
        var total: Int
        var trays: [DCTray]
        /// 第二眼：每盒补了几个、删了几个（没看成是 nil）
        var added = 0
        var removed = 0
        var audited = false
    }

    static func parse(_ data: Data) -> Letter? {
        guard let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        let ok = o["ok"] as? Bool ?? false
        let stage = o["stage"] as? String ?? (ok ? "final" : "final")
        var L = Letter(stage: stage, ok: ok, why: o["why"] as? String ?? "", total: (o["total"] as? NSNumber)?.intValue ?? 0, trays: [])
        for t in o["trays"] as? [[String: Any]] ?? [] {
            let box = (t["box"] as? [NSNumber] ?? []).map(\.doubleValue)
            guard box.count == 4 else { continue }
            let pts: [DCPoint] = (t["pts"] as? [[NSNumber]] ?? []).compactMap { p in p.count >= 2 ? DCPoint(y: p[0].doubleValue, x: p[1].doubleValue) : nil }
            var tray = DCTray(box: box, complete: t["complete"] as? Bool ?? false, main: t["main"] as? Bool ?? false,
                              on: t["counted"] as? Bool ?? true, pts: pts)
            if let a = t["audit"] as? [String: Any] {
                L.audited = true
                let added = (a["added"] as? [[NSNumber]] ?? []).compactMap { $0.count >= 2 ? ($0[0].doubleValue, $0[1].doubleValue) : nil }
                L.added += added.count
                L.removed += (a["removed"] as? [Any] ?? []).count
                for (y, x) in added {
                    if let i = tray.pts.firstIndex(where: { abs($0.y - y) < 0.5 && abs($0.x - x) < 0.5 }) { tray.pts[i].aud = true }
                }
            }
            L.trays.append(tray)
        }
        return L
    }

    static func total(_ trays: [DCTray]) -> Int { trays.reduce(0) { $0 + ($1.on ? $1.pts.count : 0) } }

    /// 一排一排数（动画按这个顺序亮）：照网页版 rowSort
    static func rowSorted(_ pts: [DCPoint]) -> [DCPoint] {
        pts.enumerated().sorted { a, b in
            let ra = (a.element.y / 40).rounded(.toNearestOrAwayFromZero), rb = (b.element.y / 40).rounded(.toNearestOrAwayFromZero)
            if ra != rb { return ra < rb }
            if a.element.x != b.element.x { return a.element.x < b.element.x }
            return a.offset < b.offset
        }.map(\.element)
    }

    /// 圆点半径（像素）：照网页版 radius()，相邻件距离的中位数 × 0.24，夹在图宽的 1/150 ~ 1/55
    static func radius(_ trays: [DCTray], w: Double, h: Double) -> Double {
        var P: [(Double, Double)] = []
        for t in trays where t.on { for p in t.pts { P.append((p.x * w / 1000, p.y * h / 1000)) } }
        if P.count < 2 { return max(8, w / 80) }
        var nn: [Double] = []
        for (i, a) in P.enumerated() {
            var m = Double.infinity
            for (j, b) in P.enumerated() where i != j { m = min(m, hypot(a.0 - b.0, a.1 - b.1)) }
            nn.append(m)
        }
        nn.sort()
        let med = nn[nn.count / 2]
        return max(w / 150, min(w / 55, med * 0.24))
    }

    // ------------------------------------------------------------ 说人话
    static func notPaired() -> String { DianChaoStrings.notPaired }

    static func away(seen: Date?, now: Date = Date()) -> String {
        guard let s = seen else { return DianChaoStrings.awayNever }
        let f = DateFormatter()
        f.dateFormat = Calendar.current.isDate(s, inSameDayAs: now) ? "HH:mm" : "M-d HH:mm"
        return DianChaoStrings.away(f.string(from: s))
    }
}

/// 一次点钞：寄出去以后收信、等、超时、手改。纯逻辑（界面和单测都用它）
struct DCRun: Equatable {
    var id: String
    var sentAt: Date
    var phase: DCPhase = .waiting
    var trays: [DCTray] = []
    var add = 0
    var del = 0
    var added = 0
    var removed = 0
    var audited = false
    var firstAt: Date?
    var why = ""
    /// 145 边数边出点：大管家边写边寄来的点（stage partial）到了几个；0 = 还没有
    var liveTotal = 0
    /// 上一封 partial 时已经亮着的点数（新来的从这儿往上一个个亮）
    var liveFrom = 0
    var liveAt: Date?

    init(id: String, sentAt: Date) {
        self.id = id
        self.sentAt = sentAt
    }

    var total: Int { DianChao.total(trays) }

    /// 145：边数边出点时此刻亮着几个（新来的 0.6 秒里一个个亮上去）
    func liveShown(at now: Date) -> Int {
        guard liveTotal > 0 else { return 0 }
        guard let a = liveAt else { return liveTotal }
        let k = min(1, max(0, now.timeIntervalSince(a) / 0.6))
        return liveFrom + Int((Double(liveTotal - liveFrom) * k).rounded())
    }
    var settled: Bool { phase == .done }

    /// 收到一封回信。回 true：这一封有用（界面要刷新）
    @discardableResult
    mutating func receive(_ L: DianChao.Letter) -> Bool {
        switch phase {
        case .done, .jam, .idle:
            return false
        default:
            break
        }
        // 145：边数边出点。只在第一封之前收；乱序、重复来的（点没比现在多）不要；最后的数只认 first / final
        if L.stage == "partial" {
            guard phase == .waiting, L.ok, L.total > liveTotal else { return false }
            liveFrom = liveTotal
            liveTotal = L.total
            liveAt = Date()
            trays = L.trays.map { var t = $0; t.pts = DianChao.rowSorted(t.pts); return t }
            return true
        }
        if !L.ok {
            phase = .jam(L.why.isEmpty ? DianChaoStrings.jamDefault : L.why)
            return true
        }
        if L.stage == "first" {
            guard phase == .waiting else { return false }
            trays = L.trays.map { var t = $0; t.pts = DianChao.rowSorted(t.pts); return t }
            phase = .first
            firstAt = Date()
            return true
        }
        trays = L.trays.map { var t = $0; t.pts = DianChao.rowSorted(t.pts); return t }
        added = L.added
        removed = L.removed
        audited = L.audited
        add = 0
        del = 0
        phase = .done
        return true
    }

    /// 时间到了没：90 秒没第一封 → 卡钞；第一封到了第二眼迟迟不来 → 照第一遍的数
    @discardableResult
    mutating func tick(now: Date) -> Bool {
        if phase == .waiting && now.timeIntervalSince(sentAt) >= DianChao.firstTimeout {
            phase = .jam(DianChaoStrings.noReply)
            return true
        }
        if phase == .first, let f = firstAt, now.timeIntervalSince(f) >= DianChao.finalTimeout {
            phase = .done
            return true
        }
        return false
    }

    /// 点照片：点到圆点就删，点到空处就补一个（落在算的盒子里，不在盒子里就给主盒）。x、y 是 0~1000；hit 是「点中」的半径（0~1000 的 x 方向单位）
    mutating func tap(y: Double, x: Double, hitX: Double, aspect: Double) {
        guard phase == .done, !trays.isEmpty else { return }
        var best: (Int, Int)?
        var bd = Double.infinity
        for (ti, t) in trays.enumerated() where t.on {
            for (pi, p) in t.pts.enumerated() {
                let d = hypot(p.x - x, (p.y - y) * aspect)
                if d < hitX && d < bd { bd = d; best = (ti, pi) }
            }
        }
        if let (ti, pi) = best {
            let p = trays[ti].pts.remove(at: pi)
            if p.man { add -= 1 } else { del += 1 }
            return
        }
        let inside = trays.indices.filter { i in
            let t = trays[i]
            return t.on && y >= t.box[0] && y <= t.box[2] && x >= t.box[1] && x <= t.box[3]
        }
        guard let ti = inside.first ?? trays.firstIndex(where: { $0.main }) ?? trays.firstIndex(where: { $0.on }) else { return }
        trays[ti].pts.append(DCPoint(y: y, x: x, man: true))
        add += 1
    }

    mutating func toggle(_ i: Int) {
        guard trays.indices.contains(i) else { return }
        trays[i].on.toggle()
    }

    /// 「手改 +2 −1」
    var editedText: String? {
        if add == 0 && del == 0 { return nil }
        var s = ""
        if add != 0 { s += (add > 0 ? "+" : "") + "\(add)" }
        if add != 0 && del != 0 { s += " " }
        if del != 0 { s += "−\(del)" }
        return DianChaoStrings.edited(s)
    }

    /// 状态行
    var statusLine: String {
        switch phase {
        case .idle: return ""
        case .waiting: return ""
        case .first: return DianChaoStrings.auditing
        case .jam(let w): return w
        case .done:
            if total == 0 && trays.allSatisfy({ $0.pts.isEmpty }) { return DianChaoStrings.none }
            var bits: [String] = []
            if added > 0 { bits.append(DianChaoStrings.auditAdd(added)) }
            if removed > 0 { bits.append(DianChaoStrings.auditDel(removed)) }
            return (bits.isEmpty ? "" : bits.joined(separator: "，") + "。") + DianChaoStrings.fixHint
        }
    }
}
