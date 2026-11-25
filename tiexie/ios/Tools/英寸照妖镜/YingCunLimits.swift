import Foundation

// 166：管控线模式（默认）——只换控制下限 / 控制上限（LCL / UCL）两列，别的数不动。
// 网页版没有这个，是 app 加的；「全要」还是网页版那套（YingCun.analyze），一字不改。
// 先看「全要」读出的表里有没有 LCL、UCL 两列，有就直接用它（对账照旧）；
// 没有（表头没 DIMENSION / LSL / USL，或者管控线那两格只写了「下」「上」），就单找管控线的表头：
//   1) LCL、UCL 站在同一排；
//   2) 一格「CONTROL LIMIT / 控制范围」，底下分两格（字是啥都行），左下 = LCL、右下 = UCL；底下两格认不出字，就看它底下的两列数。

enum YCPick: String, CaseIterable {
    /// 只换管控线（LCL / UCL）
    case limits
    /// 全换（网页版那样）
    case all
}

extension YCItem {
    /// 抄一份（「全要」那套会抹掉不要的列，管控线这套要看没抹过的）
    func copy() -> YCItem {
        let c = YCItem(x0: x0, y0: y0, x1: x1, y1: y1, text: text, conf: conf)
        c.num = num
        return c
    }
}

extension YingCun {
    static let limitKeys: Set<String> = ["LCL", "UCL"]

    /// 「CONTROL LIMIT」「控制范围」这一格（中英文都认，Vision 认错两三个字母也算）
    static func isLimitTitle(_ text: String) -> Bool {
        let t = text.filter { !$0.isWhitespace }
        if ["控制范围", "控制限", "控制界限", "管控线", "管制界限"].contains(where: { t.contains($0) }) { return true }
        let u = String(t.uppercased().filter { $0 >= "A" && $0 <= "Z" })
        if u.utf16.count < 8 { return false }
        if u.hasPrefix("CONTROLLIM") || u.hasPrefix("CTRLLIM") { return true }
        return lev(String(u.prefix(12)), "CONTROLLIMIT") <= 2
    }

    struct LimitHeader {
        var hs: YCMap<YCItem>
        var hy: Double
        var hx: YCMap<Double>
        var hspan: [String: (Double, Double)]
        /// 表头那排的斜率（找同一行的 UCL 用）
        var slope: Double
    }

    /// 表头格 = 标签 + 紧跟在右边的中文小标签（「LCL 下」）
    static func tagSpan(_ h: YCItem, _ items: [YCItem], _ th: Double) -> (Double, Double) {
        var bi: YCItem?
        if !isCJK(h.text) {
            for it in items {
                if it === h || it.text.isEmpty || !isCJK(it.text) || it.text.filter({ !$0.isWhitespace }).utf16.count > 3 { continue }
                let gap = it.x0 - h.x1
                if abs(it.cy - h.cy) < 0.35 * th && gap >= -2 && gap < 1.8 * th && (bi == nil || it.x0 < bi!.x0) { bi = it }
            }
        }
        return (h.x0, bi?.x1 ?? h.x1)
    }

    /// 按 x 把数分成一列一列（照 analyze：隔得比 2.5 个字高远就是另一列，一列至少两个数）
    static func numColumns(_ nums: [YCItem], _ th: Double) -> [[YCItem]] {
        let s = nums.stableSorted { $0.cx < $1.cx }
        guard let first = s.first else { return [] }
        var groups: [[YCItem]] = []
        var cur = [first]
        for i in 1..<s.count {
            if s[i].cx - s[i - 1].cx > 2.5 * th { groups.append(cur); cur = [] }
            cur.append(s[i])
        }
        groups.append(cur)
        return groups.filter { $0.count >= 2 }
    }

    static func limitHeaderOf(_ items: [YCItem], _ th: Double) -> LimitHeader? {
        let live = items.filter { !$0.text.isEmpty }
        // 1) LCL、UCL 站在同一排
        let Ls = live.filter { hdrKey($0.text) == "LCL" }, Us = live.filter { hdrKey($0.text) == "UCL" }
        var best: (l: YCItem, u: YCItem, sc: Double)?
        for l in Ls {
            for u in Us where u.cx > l.cx && abs(u.cy - l.cy) < 0.8 * th && u.cx - l.cx < 25 * th {
                let sc = l.conf + u.conf - (u.cx - l.cx) / (100 * th)
                if best == nil || sc > best!.sc { best = (l, u, sc) }
            }
        }
        if let b = best {
            var hs = YCMap<YCItem>(), hx = YCMap<Double>()
            var hspan: [String: (Double, Double)] = [:]
            for (k, h) in [("LCL", b.l), ("UCL", b.u)] {
                hs[k] = h
                let s = tagSpan(h, live, th)
                hspan[k] = s
                hx[k] = (s.0 + s.1) / 2
            }
            let sl = (b.u.cy - b.l.cy) / max(1, b.u.cx - b.l.cx)
            return LimitHeader(hs: hs, hy: (b.l.cy + b.u.cy) / 2, hx: hx, hspan: hspan, slope: sl)
        }
        // 2) CONTROL LIMIT / 控制范围，底下分两格
        let titles = live.filter { isLimitTitle($0.text) }.stableSorted { $0.conf > $1.conf }
        for t in titles {
            // 同一排挨着的几块（「CONTROL LIMIT」「控制范围」常被拆开）并成一格
            var x0 = t.x0, x1 = t.x1
            for it in live where it !== t && it.num == nil && abs(it.cy - t.cy) < 0.6 * th && (isLimitTitle(it.text) || isCJK(it.text)) {
                if it.x0 - x1 < 1.8 * th && it.x1 > x0 - 1.8 * th {
                    x0 = min(x0, it.x0); x1 = max(x1, it.x1)
                }
            }
            let mid = (x0 + x1) / 2, half = max((x1 - x0) / 2, 2 * th)
            // 底下那排：标题正下方 0.6~3.2 个字高，不是数
            let subs = live.filter { $0 !== t && $0.num == nil && $0.cy > t.cy + 0.6 * th && $0.cy < t.cy + 3.2 * th
                && $0.cx > mid - half - 1.5 * th && $0.cx < mid + half + 1.5 * th }.stableSorted { $0.cx < $1.cx }
            var hs = YCMap<YCItem>(), hx = YCMap<Double>()
            var hspan: [String: (Double, Double)] = [:]
            var hy: Double
            if subs.count >= 2, let l = subs.first, let u = subs.last, u.cx - l.cx > 1.5 * th {
                hs["LCL"] = l; hs["UCL"] = u
                for (k, h) in [("LCL", l), ("UCL", u)] {
                    let s = tagSpan(h, live, th)
                    hspan[k] = s
                    hx[k] = (s.0 + s.1) / 2
                }
                hy = (l.cy + u.cy) / 2
            } else {
                // 底下两格认不出：看标题底下的两列数
                let below = live.filter { $0.num != nil && $0.cy > t.cy + 1.2 * th }
                let cols = numColumns(below, th).map { (c: median($0.map(\.cx)), g: $0) }
                    .filter { $0.c > x0 - th && $0.c < x1 + th }
                    .stableSorted { abs($0.c - mid) < abs($1.c - mid) }
                guard cols.count >= 2 else { continue }
                let two = Array(cols.prefix(2)).stableSorted { $0.c < $1.c }
                hs["LCL"] = t; hs["UCL"] = t
                for (k, c) in [("LCL", two[0].c), ("UCL", two[1].c)] {
                    hspan[k] = (c - 0.5 * th, c + 0.5 * th)
                    hx[k] = c
                }
                hy = t.cy + 0.6 * th
            }
            return LimitHeader(hs: hs, hy: hy, hx: hx, hspan: hspan, slope: 0)
        }
        return nil
    }

    /// 只读管控线那两列：每行一个 LCL、一个 UCL（能找到几个算几个）
    static func analyzeLimits(_ items: [YCItem]) -> YCTable? {
        if items.count < 4 { return nil }
        let th = median(items.map(\.h))
        guard th.isFinite, th > 0, let hd = limitHeaderOf(items, th) else { return nil }
        let body = items.filter { !$0.text.isEmpty && $0.cy > hd.hy + 0.8 * th }
        let cl = numColumns(body.filter { $0.num != nil }, th)
        if cl.isEmpty { return nil }
        let ccx = cl.map { g in median(g.map(\.cx)) }
        func spanDist(_ x: Double, _ s: (Double, Double)) -> Double { x < s.0 ? s.0 - x : (x > s.1 ? x - s.1 : 0) }
        var pairs: [(k: String, j: Int, cost: Double)] = []
        for k in hd.hx.keys {
            for j in 0..<cl.count {
                let sd = spanDist(ccx[j], hd.hspan[k]!)
                if sd < 3 * th { pairs.append((k, j, sd * 4 + abs(ccx[j] - hd.hx[k]!))) }
            }
        }
        var cols = YCMap<Int>()
        var used = Set<Int>()
        for p in pairs.stableSorted(by: { $0.cost < $1.cost }) where cols[p.k] == nil && !used.contains(p.j) {
            cols[p.k] = p.j
            used.insert(p.j)
        }
        guard let jl = cols["LCL"], let ju = cols["UCL"], ccx[jl] < ccx[ju] else { return nil }
        var lines = YCMap<(Double, Double)>()
        for k in ["LCL", "UCL"] {
            let g = cl[cols[k]!], ys = g.map(\.cy), xs = g.map(\.cx)
            if g.count >= 3, ys.max()! - ys.min()! > 3 * th {
                let f = fit(ys, xs)
                lines[k] = (f.1, f.0)
            } else {
                lines[k] = (median(xs), 0)
            }
        }
        func colx(_ k: String, _ y: Double) -> Double { let l = lines[k]!; return l.0 + l.1 * y }
        // 落在哪列：离那条线近、又不过两列中间（旁边的余量、实测值列不算）
        let reach = min(2.2 * th, 0.45 * abs(ccx[ju] - ccx[jl]))
        for it in body {
            var bk: String?
            var bd = reach
            for k in lines.keys {
                let dd = abs(it.cx - colx(k, it.cy))
                if dd < bd { bd = dd; bk = k }
            }
            it.col = bk
        }
        var anchors = body.filter { $0.col == "LCL" && $0.num != nil }.stableSorted { $0.cy < $1.cy }
        if anchors.isEmpty { return nil }
        var pitch = anchors.count > 1 ? median((1..<anchors.count).map { anchors[$0].cy - anchors[$0 - 1].cy }) : 2.5 * th
        if !(pitch > 0.8 * th) { pitch = 2.5 * th }
        var kept = [anchors[0]]
        for i in 1..<anchors.count {
            if anchors[i].cy - anchors[i - 1].cy > 2.6 * pitch { break }
            kept.append(anchors[i])
        }
        anchors = kept
        var s = hd.slope
        let rows: [YCMap<YCItem>] = anchors.map { a in
            var r = YCMap<YCItem>()
            r["LCL"] = a
            let ex = colx("UCL", a.cy), ey = a.cy + s * (ex - a.cx)
            var c: YCItem?
            var cd = 0.4 * pitch
            for i in body where i.col == "UCL" && i.num != nil {
                let dd = abs(i.cy - ey)
                if dd < cd { cd = dd; c = i }
            }
            if let c {
                r["UCL"] = c
                if abs(c.cx - a.cx) > 1 { s = 0.5 * s + 0.5 * (c.cy - a.cy) / (c.cx - a.cx) }
            }
            return r
        }
        return YCTable(hs: hd.hs, hx: hd.hx, lines: lines, rows: rows, pitch: pitch, th: th, hy: hd.hy)
    }

    /// 这张表的 LCL、UCL 一共读出几格
    static func limitCells(_ A: YCTable?) -> Int {
        guard let A else { return 0 }
        return A.rows.reduce(0) { n, r in n + (r["LCL"]?.num != nil ? 1 : 0) + (r["UCL"]?.num != nil ? 1 : 0) }
    }

    /// 管控线模式用哪张表：「全要」读出的表（对账照旧）和单找管控线的表，谁的 LCL、UCL 格多用谁，一样多用「全要」那张
    static func limitsTable(full: YCTable?, raw: [YCItem]) -> YCTable? {
        let solo = analyzeLimits(raw)
        let a = limitCells(full), b = limitCells(solo)
        if a > 0, a >= b, let full, full.lines.has("LCL"), full.lines.has("UCL") { return full }
        return b > 0 ? solo : nil
    }
}
