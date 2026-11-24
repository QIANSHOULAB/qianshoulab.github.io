import Foundation
import CoreGraphics

// 英寸照妖镜的算法：照 QIANSHOULAB/gongshi inch/index.html（0.5.5）的 MIRROR 一行一行搬。
// 认数（parseNum）、换算（convert，整数运算不吃浮点误差）、读表（headerOf / analyze：表头按距离配对）、对账（checkRows）。
// 认字换成苹果本机的 Vision（YingCunVision.swift），出图在 YingCunRender.swift。
// 网页版的对象键有先后（插入顺序），排序是稳定的；这里用 YCMap、stableSorted 照着来，同一批字框出的结果一格不差（单测拿网页版的字框对）。

/// 认出来的一个数：有理数 n / d（d = 10^小数位，或分数的分母）
struct YCNum: Equatable {
    /// 洗过的字（改数单子里显示它）
    var s: String
    var n: Double
    var d: Double
    var dec: Int
    var plus: Bool
}

/// 照片上的一个字框（扶正以后的像素坐标）
final class YCItem {
    var x0: Double, y0: Double, x1: Double, y1: Double
    var text: String
    var conf: Double
    var num: YCNum?
    /// 落在哪一列（analyze 填）
    var col: String?
    /// 人改过
    var edited = false
    /// 没把握（只认数字的时候用）
    var flag = false

    init(x0: Double, y0: Double, x1: Double, y1: Double, text: String, conf: Double) {
        self.x0 = x0; self.y0 = y0; self.x1 = x1; self.y1 = y1
        self.text = text
        self.conf = conf
        self.num = YingCun.parseNum(text)
    }

    var cx: Double { (x0 + x1) / 2 }
    var cy: Double { (y0 + y1) / 2 }
    var h: Double { y1 - y0 }
}

/// 有先后的字典（照 JavaScript 对象：键按第一次放进去的先后）
struct YCMap<V> {
    private(set) var keys: [String] = []
    private var dict: [String: V] = [:]

    subscript(_ k: String) -> V? {
        get { dict[k] }
        set {
            if let v = newValue {
                if dict[k] == nil { keys.append(k) }
                dict[k] = v
            } else if dict[k] != nil {
                dict[k] = nil
                keys.removeAll { $0 == k }
            }
        }
    }

    var isEmpty: Bool { keys.isEmpty }
    var count: Int { keys.count }
    func has(_ k: String) -> Bool { dict[k] != nil }
}

extension Array {
    /// JavaScript 的 Array.prototype.sort（稳定）
    func stableSorted(by less: (Element, Element) -> Bool) -> [Element] {
        enumerated().sorted { a, b in
            if less(a.element, b.element) { return true }
            if less(b.element, a.element) { return false }
            return a.offset < b.offset
        }.map(\.element)
    }
}

enum YCMode: String, CaseIterable {
    case in2mm, mm2in
}

/// 读出来的表
struct YCTable {
    var hs: YCMap<YCItem>
    var hx: YCMap<Double>
    /// 每列一条线：x = a + b·y
    var lines: YCMap<(Double, Double)>
    var rows: [YCMap<YCItem>]
    var pitch: Double
    var th: Double
    var hy: Double
}

/// 一行的对账结果
struct YCCheck {
    var ok: Set<String> = []
    var flag: Set<String> = []
    var sugg: [String: String] = [:]
    var checked = false
}

enum YingCun {
    static let keys6 = ["DIM", "LSL", "USL", "LCL", "UCL", "STOCK"]

    // ------------------------------------------------------------------ 小工具
    static func median(_ a: [Double]) -> Double {
        if a.isEmpty { return .nan }
        let s = a.sorted(), m = s.count >> 1
        return s.count % 2 == 1 ? s[m] : (s[m - 1] + s[m]) / 2
    }

    static func mean(_ a: [Double]) -> Double { a.reduce(0, +) / Double(a.count) }

    /// 最小二乘 y = s·x + a，回 (s, a)
    static func fit(_ xs: [Double], _ ys: [Double]) -> (Double, Double) {
        let mx = mean(xs), my = mean(ys)
        var sxx = 0.0, sxy = 0.0
        for i in 0..<xs.count {
            sxx += (xs[i] - mx) * (xs[i] - mx)
            sxy += (xs[i] - mx) * (ys[i] - my)
        }
        let s = sxx > 1e-9 ? sxy / sxx : 0
        return (s, my - s * mx)
    }

    static func lev(_ a: String, _ b: String) -> Int {
        let A = Array(a.utf16), B = Array(b.utf16)
        var d = Array(0...B.count)
        if A.isEmpty { return B.count }
        for i in 1...A.count {
            var p = d[0]
            d[0] = i
            if B.isEmpty { continue }
            for j in 1...B.count {
                let t = d[j]
                d[j] = Swift.min(d[j] + 1, d[j - 1] + 1, p + (A[i - 1] != B[j - 1] ? 1 : 0))
                p = t
            }
        }
        return d[B.count]
    }

    static func isDigit(_ c: Character) -> Bool { c >= "0" && c <= "9" }

    static func isCJK(_ s: String) -> Bool {
        s.unicodeScalars.contains { $0.value >= 0x4E00 && $0.value <= 0x9FFF }
    }

    // ------------------------------------------------------------------ 数字：认、算
    /// 认一个数：1.0860、-0.0050、+.0050、3/8、1-1/4；O/o/D/Q 当 0，l/I/| 当 1（至少两位数字时）。认不出 nil
    static func parseNum(_ text: String) -> YCNum? {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines)
        s = s.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        let digits = s.filter(isDigit).count
        if digits == 0 { return nil }
        s = String(s.map { "—–一－_~".contains($0) ? "-" : ("，,。".contains($0) ? "." : $0) })
        if digits >= 2 {
            s = String(s.map { "OoDQ".contains($0) ? "0" : ("lI|".contains($0) ? "1" : $0) })
        }
        if let m = match(s, #"^([+-]?)(?:([0-9]+)[- ])?([0-9]+)/([0-9]+)$"#) {
            let w = m[2].isEmpty ? 0 : (Double(m[2]) ?? 0), a = Double(m[3]) ?? 0, b = Double(m[4]) ?? 0
            guard [2.0, 4, 8, 16, 32, 64].contains(b), a > 0, a < b else { return nil }
            let shown = m[1] + (m[2].isEmpty ? "" : JSNumber.plain(w) + "-") + JSNumber.plain(a) + "/" + JSNumber.plain(b)
            return YCNum(s: shown, n: (w * b + a) * (m[1] == "-" ? -1 : 1), d: b, dec: 6, plus: m[1] == "+")
        }
        s = s.replacingOccurrences(of: " ", with: "")
        guard let m = match(s, #"^([+-]?)([0-9]*)(?:\.([0-9]*))?$"#), !(m[2].isEmpty && m[3].isEmpty) else { return nil }
        let fp = String(m[3].prefix(6))
        let d = pow(10, Double(fp.count))
        let n = ((Double(m[2].isEmpty ? "0" : m[2]) ?? 0) * d + (fp.isEmpty ? 0 : (Double(fp) ?? 0))) * (m[1] == "-" ? -1 : 1)
        return YCNum(s: s, n: n, d: d, dec: fp.count, plus: m[1] == "+")
    }

    /// 整个串对上正则：回每一组（没对上的组是空串）
    static func match(_ s: String, _ pattern: String) -> [String]? {
        guard let re = try? NSRegularExpression(pattern: pattern),
              let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
        return (0..<m.numberOfRanges).map { i in
            guard let r = Range(m.range(at: i), in: s) else { return "" }
            return String(s[r])
        }
    }

    static func roundDiv(_ n0: Double, _ d0: Double) -> Double {
        let neg = (n0 < 0) != (d0 < 0)
        let n = abs(n0), d = abs(d0)
        var q = (n / d).rounded(.down)
        if 2 * (n - q * d) >= d { q += 1 }
        return neg ? -q : q
    }

    /// 1 英寸 = 25.4 毫米。毫米留 3 位，英寸留 4 位
    static func convert(_ p: YCNum, _ mode: YCMode) -> String {
        let out = mode == .in2mm ? roundDiv(p.n * 25400, p.d) : roundDiv(p.n * 100000, 254 * p.d)
        let dec = mode == .in2mm ? 3 : 4
        let P = pow(10, Double(dec)), a = abs(out)
        let sign = out < 0 ? "-" : (p.plus && a != 0 ? "+" : "")
        let frac = String(Int64(a.truncatingRemainder(dividingBy: P)))
        return sign + String(Int64((a / P).rounded(.down))) + "." + String(repeating: "0", count: max(0, dec - frac.count)) + frac
    }

    static func micro(_ p: YCNum) -> Double { roundDiv(p.n * 1_000_000, p.d) }

    static func fmtMicro(_ m: Double, _ dec: Int) -> String {
        let a = abs(m)
        var s = String(Int64(a.truncatingRemainder(dividingBy: 1_000_000)))
        s = String(repeating: "0", count: max(0, 6 - s.count)) + s
        s = String(s.prefix(max(1, dec)))
        return (m < 0 ? "-" : "") + String(Int64((a / 1_000_000).rounded(.down))) + "." + s
    }

    // ------------------------------------------------------------------ 读表
    static func hdrKey(_ text: String) -> String? {
        let t = String(text.uppercased().filter { $0 >= "A" && $0 <= "Z" })
        if t.isEmpty { return nil }
        if t.hasPrefix("DIMEN") || lev(t, "DIMENSION") <= 2 { return "DIM" }
        for k in ["LSL", "USL", "LCL", "UCL"] where t == k || (t.utf16.count <= 4 && t.hasPrefix(k)) { return k }
        if lev(t, "STOCK") <= 1 { return "STOCK" }
        if t == "NO" { return "NO" }
        if t == "SYM" { return "SYM" }
        return nil
    }

    struct Header {
        var hs: YCMap<YCItem>
        var hy: Double
        var hx: YCMap<Double>
        var hspan: [String: (Double, Double)]
    }

    /// 表头：DIMENSION 带着 LSL、USL 站在同一排才算数
    static func headerOf(_ items: [YCItem], _ th: Double) -> Header? {
        var cands: [(k: String, it: YCItem)] = []
        for it in items where !it.text.isEmpty {
            if let k = hdrKey(it.text) { cands.append((k, it)) }
        }
        var best: (dm: (k: String, it: YCItem), near: [(k: String, it: YCItem)], sc: Double)?
        for dm in cands where dm.k == "DIM" {
            let near = cands.filter { abs($0.it.cy - dm.it.cy) < 2.5 * th }
            let ks = Set(near.map(\.k))
            let sc = (ks.contains("LSL") ? 1.0 : 0) + (ks.contains("USL") ? 1.0 : 0) + dm.it.conf
            if best == nil || sc > best!.sc { best = (dm, near, sc) }
        }
        guard let b = best else { return nil }
        var hs = YCMap<YCItem>()
        for c in b.near {
            if let cur = hs[c.k] {
                if abs(c.it.cy - b.dm.it.cy) < abs(cur.cy - b.dm.it.cy) { hs[c.k] = c.it }
            } else {
                hs[c.k] = c.it
            }
        }
        hs["DIM"] = b.dm.it
        guard hs.has("LSL"), hs.has("USL") else { return nil }
        let hy = median(hs.keys.map { hs[$0]!.cy })
        // 表头格 = 英文标签 + 紧跟在右边的中文小标签（「LSL 下」「DIMENSION 尺寸」）；本身带中文的就不再并
        var hx = YCMap<Double>()
        var hspan: [String: (Double, Double)] = [:]
        for k in hs.keys {
            let h = hs[k]!
            var bi: YCItem?
            if !isCJK(h.text) {
                for it in items {
                    if it === h || it.text.isEmpty || !isCJK(it.text) || it.text.filter({ !$0.isWhitespace }).utf16.count > 3 { continue }
                    let gap = it.x0 - h.x1
                    if abs(it.cy - h.cy) < 0.35 * th && gap >= -2 && gap < 1.8 * th && (bi == nil || it.x0 < bi!.x0) { bi = it }
                }
            }
            let span = (h.x0, bi?.x1 ?? h.x1)
            hspan[k] = span
            hx[k] = (span.0 + span.1) / 2
        }
        return Header(hs: hs, hy: hy, hx: hx, hspan: hspan)
    }

    static func analyze(_ items: [YCItem]) -> YCTable? {
        if items.count < 6 { return nil }
        let th = median(items.map(\.h))
        guard let hd = headerOf(items, th) else { return nil }
        let hs = hd.hs, hy = hd.hy, hx = hd.hx, hspan = hd.hspan
        let body = items.filter { $0.cy > hy + 0.8 * th }
        let nums = body.filter { $0.num != nil }.stableSorted { $0.cx < $1.cx }
        if nums.count < 2 { return nil }
        var groups: [[YCItem]] = []
        var cur = [nums[0]]
        for i in 1..<nums.count {
            if nums[i].cx - nums[i - 1].cx > 2.5 * th { groups.append(cur); cur = [] }
            cur.append(nums[i])
        }
        groups.append(cur)
        let cl = groups.filter { $0.count >= 2 }
        let ccx = cl.map { g in median(g.map(\.cx)) }
        var cols = YCMap<Int>()
        var used = Set<Int>()
        func pri(_ k: String) -> Int { (k == "DIM" || k == "LSL" || k == "USL") ? 0 : 1 }
        // 数字列认表头：所有「表头-数字列」配对按距离排队，最近的先配，配过的谁也不能再抢
        // （列中心落在表头那几个字底下最好，其次比谁离得近；空着的一列不能把隔壁的数字抢过去）
        func spanDist(_ x: Double, _ s: (Double, Double)) -> Double { x < s.0 ? s.0 - x : (x > s.1 ? x - s.1 : 0) }
        var pairs: [(k: String, j: Int, cost: Double)] = []
        for k in hx.keys {
            for j in 0..<cl.count {
                let sd = spanDist(ccx[j], hspan[k]!)
                if sd < 3 * th { pairs.append((k, j, sd * 4 + abs(ccx[j] - hx[k]!) - (pri(k) != 0 ? 0 : 0.5))) }
            }
        }
        pairs = pairs.stableSorted { $0.cost < $1.cost }
        for p in pairs where cols[p.k] == nil && !used.contains(p.j) {
            cols[p.k] = p.j
            used.insert(p.j)
        }
        guard cols.has("DIM") else { return nil }
        var lines = YCMap<(Double, Double)>()
        for k in cols.keys {
            let g = cl[cols[k]!], ys = g.map(\.cy), xs = g.map(\.cx)
            if g.count >= 3, ys.max()! - ys.min()! > 3 * th {
                let f = fit(ys, xs)
                lines[k] = (f.1, f.0)
            } else {
                lines[k] = (median(xs), 0)
            }
        }
        for k in ["NO", "SYM", "LSL", "USL", "STOCK", "LCL", "UCL"] where hs.has(k) && !lines.has(k) {
            let mem = body.filter { abs($0.cx - hx[k]!) < 2 * th }
            lines[k] = (mem.isEmpty ? hx[k]! : median(mem.map(\.cx)), 0)
        }
        func colx(_ k: String, _ y: Double) -> Double { let l = lines[k]!; return l.0 + l.1 * y }
        let numcol: Set<String> = ["DIM", "LSL", "USL", "LCL", "UCL", "STOCK"]
        for it in body {
            var bk: String?
            var bd = 2.2 * th
            for k in lines.keys {
                let dd = abs(it.cx - colx(k, it.cy))
                if dd < bd { bd = dd; bk = k }
            }
            it.col = bk
            // 数字列里孤零零一个圈，十有八九是 0（单字最容易被认成字母 o）
            if let bk, numcol.contains(bk), it.num == nil, ["o", "O", "D", "Q", "0"].contains(it.text.trimmingCharacters(in: .whitespacesAndNewlines)) {
                it.num = parseNum("0")
            }
        }
        var anchors = body.filter { $0.col == "DIM" }.stableSorted { $0.cy < $1.cy }
        if anchors.isEmpty { return nil }
        var pitch = anchors.count > 1 ? median((1..<anchors.count).map { anchors[$0].cy - anchors[$0 - 1].cy }) : 2.5 * th
        if !(pitch > 0.8 * th) { pitch = 2.5 * th }
        var kept = [anchors[0]]
        if anchors.count > 1 {
            for i in 1..<anchors.count {
                if anchors[i].cy - anchors[i - 1].cy > 2.6 * pitch { break }
                kept.append(anchors[i])
            }
        }
        anchors = kept
        let y0 = anchors[0].cy
        let order = lines.keys.stableSorted { colx($0, y0) < colx($1, y0) }
        let di = order.firstIndex(of: "DIM")!
        // 一行一行往两边追：每找到一格就更新这一行的斜率，透视、纸弯都追得住
        let rows: [YCMap<YCItem>] = anchors.map { a in
            var r = YCMap<YCItem>()
            r["DIM"] = a
            for dir in [1, -1] {
                var px = a.cx, py = a.cy, s = 0.0, first = true
                let ks = dir == 1 ? Array(order[(di + 1)...]) : Array(order[..<di].reversed())
                for k in ks {
                    let ex = colx(k, py), ey = py + s * (ex - px)
                    var c: YCItem?
                    var cd = 0.4 * pitch
                    for i in body where i.col == k {
                        let dd = abs(i.cy - ey)
                        if dd < cd { cd = dd; c = i }
                    }
                    if let c {
                        let ns = abs(c.cx - px) > 1 ? (c.cy - py) / (c.cx - px) : s
                        s = first ? ns : 0.5 * s + 0.5 * ns
                        first = false
                        px = c.cx; py = c.cy
                        r[k] = c
                    }
                }
            }
            return r
        }
        return YCTable(hs: hs, hx: hx, lines: lines, rows: rows, pitch: pitch, th: th, hy: hy)
    }

    // ------------------------------------------------------------------ 对账
    /// 尺寸 + 下差 = LCL，尺寸 + 上差 = UCL（有加工余量时允许 ± 余量）
    static func checkRows(_ rows: [YCMap<YCItem>]) -> [YCCheck] {
        rows.map { r in
            var res = YCCheck()
            var v: [String: YCNum] = [:]
            for k in keys6 { if let n = r[k]?.num { v[k] = n } }
            let dec = v.isEmpty ? 4 : v.values.map(\.dec).max()!
            let eps = 0.5 * pow(10, Double(6 - min(6, dec)))
            let st = v["STOCK"].map(micro) ?? 0
            // a + b (± 余量) = c 吗？对上了回用的哪个符号，没对上回 nil
            func eq(_ a: YCNum, _ b: YCNum, _ c: YCNum) -> Double? {
                for sg in [0.0, 1, -1] where abs(micro(a) + micro(b) + sg * st - micro(c)) <= eps { return sg }
                return nil
            }
            let h1 = v["DIM"] != nil && v["LSL"] != nil && v["LCL"] != nil
            let h2 = v["DIM"] != nil && v["USL"] != nil && v["UCL"] != nil
            let sdec = min(6, max(v["LCL"]?.dec ?? 0, v["UCL"]?.dec ?? 0, v["DIM"]?.dec ?? 0, 1))
            func fm(_ m: Double) -> String { fmtMicro(m, sdec) }
            if h1 && h2 {
                let D = v["DIM"]!, L = v["LSL"]!, U = v["USL"]!, LC = v["LCL"]!, UC = v["UCL"]!
                let e1 = eq(D, L, LC), e2 = eq(D, U, UC)
                if e1 != nil && e2 != nil {
                    res.ok.formUnion(["DIM", "LSL", "USL", "LCL", "UCL"])
                } else if let e1 {        // 下面那条对上了：尺寸没错，上差和 UCL 里有一个认错
                    res.ok.formUnion(["DIM", "LSL", "LCL"]); res.flag.formUnion(["USL", "UCL"])
                    res.sugg["USL"] = fm(micro(UC) - micro(D) - e1 * st)
                    res.sugg["UCL"] = fm(micro(D) + micro(U) + e1 * st)
                } else if let e2 {
                    res.ok.formUnion(["DIM", "USL", "UCL"]); res.flag.formUnion(["LSL", "LCL"])
                    res.sugg["LSL"] = fm(micro(LC) - micro(D) - e2 * st)
                    res.sugg["LCL"] = fm(micro(D) + micro(L) + e2 * st)
                } else {                  // 两条都对不上：多半是尺寸认错了
                    let d1 = micro(LC) - micro(L), d2 = micro(UC) - micro(U)
                    res.flag.insert("DIM")
                    if abs(d1 - d2) <= eps {
                        res.sugg["DIM"] = fm(d1)
                        res.ok.formUnion(["LSL", "USL", "LCL", "UCL"])
                    } else {
                        res.flag.formUnion(["LSL", "USL", "LCL", "UCL"])
                    }
                }
            } else if h1 {
                if eq(v["DIM"]!, v["LSL"]!, v["LCL"]!) != nil { res.ok.formUnion(["DIM", "LSL", "LCL"]) } else { res.flag.formUnion(["DIM", "LSL", "LCL"]) }
            } else if h2 {
                if eq(v["DIM"]!, v["USL"]!, v["UCL"]!) != nil { res.ok.formUnion(["DIM", "USL", "UCL"]) } else { res.flag.formUnion(["DIM", "USL", "UCL"]) }
            }
            for k in keys6 {
                guard let it = r[k] else { continue }
                if it.edited { res.flag.remove(k); continue }                // 人改过的就是真理
                if let n = it.num, !res.ok.contains(k), !res.flag.contains(k), it.conf < 0.9, k != "STOCK" || n.n != 0 { res.flag.insert(k) }
            }
            res.checked = h1 || h2
            return res
        }
    }

    // ------------------------------------------------------------------ 只认要的那几列
    /// 网页版只认表头和 尺寸/下差/上差/余量/LCL/UCL 那几列（readAll 的 finish）；Vision 一次全认了，
    /// 这里把表头下面、不在这几列（和标号列）里的字抹掉，量出来的实测值、结果栏的勾都不掺进来
    static func prune(_ items: [YCItem]) {
        guard items.count >= 6 else { return }
        let th = median(items.map(\.h))
        guard let hd = headerOf(items, th) else { return }
        let want: Set<String> = ["DIM", "LSL", "USL", "STOCK", "LCL", "UCL", "NO"]
        let xs = hd.hx.keys.map { ($0, hd.hx[$0]!) }.stableSorted { $0.1 < $1.1 }
        for it in items where it.cy >= hd.hy + 0.5 * th && !it.text.isEmpty {
            var bi = 0
            for i in 1..<xs.count where abs(it.cx - xs[i].1) < abs(it.cx - xs[bi].1) { bi = i }
            var gaps: [Double] = []
            if bi > 0 { gaps.append(xs[bi].1 - xs[bi - 1].1) }
            if bi < xs.count - 1 { gaps.append(xs[bi + 1].1 - xs[bi].1) }
            let gap = gaps.min() ?? 6 * th
            if !(want.contains(xs[bi].0) && abs(it.cx - xs[bi].1) < 0.6 * gap) {
                it.text = ""
                it.num = nil
            }
        }
    }

    /// app 加的（网页版没有）：Vision 偶尔把「DIMENSION 尺寸」认成一串乱码（122 的毫米表认成「DIENRJ」），表头就找不到了。
    /// 表头那排有 LSL、USL 却没有 DIMENSION 时，把 LSL 左边紧挨着的那个不是数的字框当 DIMENSION。只在网页版的读法读不出表时才用。
    @discardableResult
    static func repairHeader(_ items: [YCItem]) -> Bool {
        guard items.count >= 6 else { return false }
        let th = median(items.map(\.h))
        for L in items where hdrKey(L.text) == "LSL" {
            let row = items.filter { !$0.text.isEmpty && abs($0.cy - L.cy) < 0.6 * th }
            let keys = row.compactMap { hdrKey($0.text) }
            guard keys.contains("USL"), !keys.contains("DIM") else { continue }
            let left = row.filter { $0.x1 <= L.x0 + 2 && $0.num == nil && $0.text.contains(where: { $0.isLetter }) }
            guard let d = left.max(by: { $0.x1 < $1.x1 }), L.x0 - d.x1 < 8 * th else { continue }
            d.text = "DIMENSION"
            return true
        }
        return false
    }

    /// 表上写的是哪个单位
    static func unitHint(_ items: [YCItem]) -> String? {
        for it in items {
            let t = it.text.filter { !$0.isWhitespace }.lowercased()
            if ["inch", "inches", "英寸", "in."].contains(t) { return "in" }
            if ["mm", "毫米"].contains(t) { return "mm" }
            // 「UNIT: INCH」这种一整条
            if t.hasSuffix(":inch") || t.hasSuffix("：inch") || t.hasSuffix("(inch)") { return "in" }
            if t.hasSuffix(":mm") || t.hasSuffix("：mm") || t.hasSuffix("(mm)") { return "mm" }
        }
        return nil
    }
}
