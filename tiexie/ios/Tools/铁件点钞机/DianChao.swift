import Foundation
import CoreGraphics

// 铁件点钞机的算法：照 QIANSHOULAB/gongshi draft-count 分支 count/index.html（0.5.0）搬界面那头的规矩，大脑换成大管家（121 的 tx-count）。
// 拍完缩到大管家看图的尺寸（pc-butler handheld/luru.py 的 resized_size：长边 2576、28 像素一格、最多 4784 格），寄 tx-count；
// 回两封信：stage first 出数和圆点，到了就算数完（150）；stage final 是第二眼（复查），在后头悄悄跑，跟第一遍一样就什么都不动，
// 不一样才改数和点（补的点柠檬绿圈）、数码管上方写「复查改了」。90 秒没第一封就说大管家没回；复查没回来就用第一遍的数，不提示。
// 145 起第一封之前还有几封 stage partial（大管家边写边寄，带到目前的全部点）：圆点一个个亮、数字跟着跳；数只认 first / final。
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
    /// 寄出去了，第一封还没到（数码管转）
    case waiting
    /// 第一封到了就是数完了（复查还在不在后头跑看 DCRun.reviewing）
    case done
    case jam(String)
}

/// 复查改的一处：第几盒、在哪（0~1000）
struct DCMark: Equatable {
    var tray: Int
    var y: Double
    var x: Double
}

/// 复查改了什么（只记看得见的：算着的盒子里补的点、去的点）
struct DCFix: Equatable {
    var before: Int
    var after: Int
    var added: [DCMark]
    var removed: [DCMark]
    /// 改的那一刻：补的、去的从这儿起闪几下
    var at: Date
    var line: String { DianChaoStrings.fixed(before, after, add: added.count, del: removed.count) }
}

enum DianChao {
    static let tag = "tx-count"
    static let firstTimeout: TimeInterval = 90
    /// 第一封到了以后，第二眼最多再等这么久（大管家那头一遍 90 秒）；过了就照第一遍的数
    static let finalTimeout: TimeInterval = 200
    /// 复查改了：补的、去的各闪几下（一下 0.6 秒，共 4 下）
    static let flashBeat: TimeInterval = 0.6
    static let flashDur: TimeInterval = 2.4

    /// 改了以后过了 t 秒，记号亮几成。t < 0（截图用的定格）一直亮着
    static func flash(_ t: TimeInterval) -> Double {
        if t < 0 { return 1 }
        if t >= flashDur { return 0 }
        return t.truncatingRemainder(dividingBy: flashBeat) < flashBeat * 0.6 ? 1 : 0.15
    }

    /// 数码管从 0 跑到总数要多久
    static func countDur(_ n: Int) -> Double { min(1.9, max(0.7, Double(n) * 0.046)) }

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

    /// 168：API 那条路拼好的一封 → 跟信里来的一样的 Data（交给 got）
    static func data(_ body: [String: Any]) -> Data {
        (try? JSONSerialization.data(withJSONObject: body)) ?? Data()
    }

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
        /// 151：大管家说 final 跟 first 一样（件数一样、点没加没减），旧大管家不带这一项
        var same: Bool? = nil
        /// 第二眼清单：跟 first 比补了哪些点、去了哪些点（各盒的合在一起）
        var addedPts: [DCPoint] = []
        var removedPts: [DCPoint] = []
    }

    static func parse(_ data: Data) -> Letter? {
        guard let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        let ok = o["ok"] as? Bool ?? false
        let stage = o["stage"] as? String ?? (ok ? "final" : "final")
        var L = Letter(stage: stage, ok: ok, why: o["why"] as? String ?? "", total: (o["total"] as? NSNumber)?.intValue ?? 0, trays: [])
        L.same = o["same"] as? Bool
        for t in o["trays"] as? [[String: Any]] ?? [] {
            let box = (t["box"] as? [NSNumber] ?? []).map(\.doubleValue)
            guard box.count == 4 else { continue }
            let pts: [DCPoint] = (t["pts"] as? [[NSNumber]] ?? []).compactMap { p in p.count >= 2 ? DCPoint(y: p[0].doubleValue, x: p[1].doubleValue) : nil }
            var tray = DCTray(box: box, complete: t["complete"] as? Bool ?? false, main: t["main"] as? Bool ?? false,
                              on: t["counted"] as? Bool ?? true, pts: pts)
            if let a = t["audit"] as? [String: Any] {
                L.audited = true
                let added = (a["added"] as? [[NSNumber]] ?? []).compactMap { $0.count >= 2 ? ($0[0].doubleValue, $0[1].doubleValue) : nil }
                let gone: [DCPoint] = (a["removed"] as? [[NSNumber]] ?? []).compactMap { q in q.count >= 2 ? DCPoint(y: q[0].doubleValue, x: q[1].doubleValue) : nil }
                L.added += added.count
                L.removed += (a["removed"] as? [Any] ?? []).count
                L.addedPts += added.map { DCPoint(y: $0.0, x: $0.1) }
                L.removedPts += gone
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

    // ------------------------------------------------------------ 复查
    static func same(_ a: DCPoint, _ b: DCPoint) -> Bool { abs(a.y - b.y) < 0.5 && abs(a.x - b.x) < 0.5 }

    /// 两个点多近算指着同一件（0~1000）：第一遍相邻件距离中位数的一半，至少 12
    static func sameNear(_ trays: [DCTray]) -> Double {
        let P: [DCPoint] = trays.flatMap(\.pts)
        if P.count < 2 { return 25 }
        var nn: [Double] = []
        for (i, a) in P.enumerated() {
            var m = Double.infinity
            for (j, b) in P.enumerated() where i != j { m = min(m, hypot(a.x - b.x, a.y - b.y)) }
            nn.append(m)
        }
        nn.sort()
        return max(12, nn[nn.count / 2] * 0.5)
    }

    /// 两份点按位置一一配对（先配最近的，差不到 near 算同一件）。回没配上的：gone = a 有 b 没有，new = b 有 a 没有
    static func diff(_ a: [DCPoint], _ b: [DCPoint], near: Double) -> (gone: [DCPoint], new: [DCPoint]) {
        var pairs: [(d: Double, i: Int, j: Int)] = []
        for (i, p) in a.enumerated() {
            for (j, q) in b.enumerated() {
                let d = hypot(p.x - q.x, p.y - q.y)
                if d < near { pairs.append((d: d, i: i, j: j)) }
            }
        }
        pairs.sort { $0.d < $1.d }
        var usedA = Set<Int>(), usedB = Set<Int>()
        for pair in pairs where !usedA.contains(pair.i) && !usedB.contains(pair.j) {
            usedA.insert(pair.i)
            usedB.insert(pair.j)
        }
        return (a.indices.filter { !usedA.contains($0) }.map { a[$0] }, b.indices.filter { !usedB.contains($0) }.map { b[$0] })
    }

    /// 复查比第一遍改了哪些（算着的盒子里的点）。大管家说一样（same）就是没改；信里带清单就照清单（盒子顺序、坐标变了都不怕）；
    /// 没有清单就按位置配。回 gone = 第一遍有、复查去掉的，new = 复查补上的
    static func changes(_ L: Letter, first: [DCTray]) -> (gone: [DCPoint], new: [DCPoint]) {
        if L.same == true { return ([], []) }
        if !L.removedPts.isEmpty || !L.addedPts.isEmpty { return (L.removedPts, L.addedPts) }
        if L.same == nil && L.trays.isEmpty { return ([], []) }       // 空信、又没说改了：当没回来
        let a: [DCPoint] = first.filter(\.on).flatMap(\.pts)
        let b: [DCPoint] = L.trays.filter(\.on).flatMap(\.pts)
        return diff(a, b, near: sameNear(first))
    }

    /// 两个框（[y0, x0, y1, x1]）叠着多少
    static func overlap(_ a: [Double], _ b: [Double]) -> Double {
        max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    }

    /// 改了：换成复查的盘子。手改和「不算 / 也算上」照样留着：手上删掉的不长回来，手上补过的那件不再补一颗。
    /// 回新盘子和看得见的改动（算着的盒子里补的、去的）。now 是手上这份（盒子顺序跟 first 一样）。
    static func merge(_ now: [DCTray], first: [DCTray], final: [DCTray], gone: [DCPoint], new: [DCPoint])
        -> (trays: [DCTray], added: [DCMark], removed: [DCMark]) {
        let near = sameNear(first)
        var out = final
        for i in out.indices {
            for j in out[i].pts.indices {
                let p = out[i].pts[j]
                out[i].pts[j].aud = new.contains { same($0, p) }
            }
        }
        // 翻过「不算 / 也算上」的盒子：给叠得最多的那个新盒子照样翻
        for (i, t) in now.enumerated() where i < first.count && t.on != first[i].on {
            guard let k = out.indices.max(by: { overlap(out[$0].box, t.box) < overlap(out[$1].box, t.box) }),
                  overlap(out[k].box, t.box) > 0 else { continue }
            out[k].on = t.on
        }
        // 手删过的
        let kept: [DCPoint] = now.flatMap { t in t.pts.filter { !$0.man } }
        for p in first.flatMap(\.pts) where !kept.contains(where: { same($0, p) }) {
            var best: (Int, Int)?
            var bd = near
            for (k, t) in out.enumerated() {
                for (j, q) in t.pts.enumerated() {
                    let d = hypot(p.x - q.x, p.y - q.y)
                    if d < bd { bd = d; best = (k, j) }
                }
            }
            if let (k, j) = best { out[k].pts.remove(at: j) }
        }
        // 手补的：复查也补了这件就用手上那颗，不然照样放回盒子里
        for m in now.flatMap({ t in t.pts.filter(\.man) }) {
            var best: (Int, Int)?
            var bd = near
            for (k, t) in out.enumerated() {
                for (j, q) in t.pts.enumerated() where q.aud && !q.man {
                    let d = hypot(m.x - q.x, m.y - q.y)
                    if d < bd { bd = d; best = (k, j) }
                }
            }
            if let (k, j) = best {
                out[k].pts[j] = m
                continue
            }
            var home: Int? = out.firstIndex(where: { (t: DCTray) -> Bool in
                m.y >= t.box[0] && m.y <= t.box[2] && m.x >= t.box[1] && m.x <= t.box[3]
            })
            if home == nil { home = out.firstIndex(where: { $0.main }) }
            if let k = home ?? out.indices.first { out[k].pts.append(m) }
        }
        for i in out.indices { out[i].pts = rowSorted(out[i].pts) }
        var added: [DCMark] = []
        for (k, t) in out.enumerated() where t.on {
            for q in t.pts where q.aud && !q.man { added.append(DCMark(tray: k, y: q.y, x: q.x)) }
        }
        var removed: [DCMark] = []
        let left: [DCPoint] = out.filter(\.on).flatMap(\.pts)
        for p in gone where !left.contains(where: { same($0, p) }) {
            guard let i = now.firstIndex(where: { t in t.on && t.pts.contains(where: { same($0, p) }) }) else { continue }
            removed.append(DCMark(tray: i, y: p.y, x: p.x))
        }
        return (out, added, removed)
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
    /// 150：第一封到了、数完了，复查还在后头跑（界面上不说）
    var reviewing = false
    /// 150：第一遍原样（复查回来拿它比）
    var firstTrays: [DCTray] = []
    /// 150：复查改了什么；nil = 没改（或还没回来）
    var fix: DCFix?
    /// 145 边数边出点：大管家边写边寄来的点（stage partial）到了几个；0 = 还没有
    var liveTotal = 0
    /// 上一封 partial 时已经亮着的点数（新来的从这儿往上一个个亮）
    var liveFrom = 0
    var liveAt: Date?
    /// 168：这一盘是 Claude API 直接数的（存图、数码管下面那行写「Claude 数的」）；false = 大管家数的
    var byAI = false

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
    /// 数完了、复查也收场了：不用再等信
    var settled: Bool { phase == .done && !reviewing }

    /// 收到一封回信。回 true：这一封有用（界面要刷新）
    @discardableResult
    mutating func receive(_ L: DianChao.Letter, now: Date = Date()) -> Bool {
        switch phase {
        case .done:
            return reviewing ? recheck(L, now: now) : false
        case .jam, .idle:
            return false
        case .waiting:
            break
        }
        // 145：边数边出点。只在第一封之前收；乱序、重复来的（点没比现在多）不要；数只认 first / final
        if L.stage == "partial" {
            guard L.ok, L.total > liveTotal else { return false }
            liveFrom = liveTotal
            liveTotal = L.total
            liveAt = now
            trays = L.trays.map { var t = $0; t.pts = DianChao.rowSorted(t.pts); return t }
            return true
        }
        if !L.ok {
            phase = .jam(L.why.isEmpty ? DianChaoStrings.jamDefault : L.why)
            return true
        }
        trays = L.trays.map { var t = $0; t.pts = DianChao.rowSorted(t.pts); return t }
        add = 0
        del = 0
        phase = .done
        firstAt = now
        if L.stage == "first" {
            // 150：第一遍数完就算数完，复查在后头
            firstTrays = trays
            reviewing = true
        } else {
            // 第一封没收到、直接来了 final
            added = L.added
            removed = L.removed
            audited = L.audited
        }
        return true
    }

    /// 150：数完以后复查回来了。一样就什么都不动；不一样改数和点、记下改了哪几处；复查出错就用第一遍的数，不提示
    private mutating func recheck(_ L: DianChao.Letter, now: Date) -> Bool {
        guard L.stage == "final" else { return false }        // 迟到的 partial、重复的 first 不要
        reviewing = false
        guard L.ok else { return true }
        audited = L.audited
        let c = DianChao.changes(L, first: firstTrays)
        if c.gone.isEmpty && c.new.isEmpty { return true }    // 一样：手上的点原地不动
        let before = total
        let r = DianChao.merge(trays, first: firstTrays, final: L.trays, gone: c.gone, new: c.new)
        trays = r.trays
        if !r.added.isEmpty || !r.removed.isEmpty {
            added = r.added.count
            removed = r.removed.count
            fix = DCFix(before: before, after: total, added: r.added, removed: r.removed, at: now)
        }
        return true
    }

    /// 时间到了没：90 秒没第一封 → 卡钞；复查迟迟不来 → 不等了，照第一遍的数
    @discardableResult
    mutating func tick(now: Date) -> Bool {
        if phase == .waiting && now.timeIntervalSince(sentAt) >= DianChao.firstTimeout {
            phase = .jam(DianChaoStrings.noReply)
            return true
        }
        if phase == .done, reviewing, let f = firstAt, now.timeIntervalSince(f) >= DianChao.finalTimeout {
            reviewing = false
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
