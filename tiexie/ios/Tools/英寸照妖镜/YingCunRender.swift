import UIKit

// 英寸照妖镜出图：照网页版 renderTable / renderLoose / footer 搬。
// 有表：四个角 → 透视矫正（行列拉直）→ 从「标号」裁到最右边要换的那列 → 每行原数下面插一条，原图像素往下抻 → 边贴到表格线上 → 落红字。
// 没表：照片里的纯数字全换，红字贴在右边。底下接一条「红字 = 毫米」。
// 166：管控线模式只落 LCL / UCL 两列；没表时红字不大于原数那一格，挤了就缩、换个边，缩到看不清就不写（不再一行压一行）。

/// 图上的一块红字（点它改数）
struct YCLabel {
    var x: Double, y: Double, w: Double, h: Double
    /// 第几行（没表时 -1）
    var row: Int
    var key: String?
    var item: YCItem
    var flagged: Bool
}

/// 一张算好的结果图
struct YCDrawn {
    var image: UIImage
    var labels: [YCLabel]
    var checks: [YCCheck]
    /// 一共几行、几行对上账、几个黄格
    var rows = 0, checked = 0, okRows = 0, flags = 0
    /// 166：哪种模式画的
    var pick: YCPick = .all
    /// 管控线模式没找到管控线：图是没盖红字的照片
    var missing = false
    /// 挤得写不下、没落红字的数
    var skipped = 0
}

/// RGBA 像素（扶正后的图，整张放内存里；2016 长边约 16 MB）
struct YCRaster {
    let width: Int
    let height: Int
    var px: [UInt8]

    init(width: Int, height: Int) {
        self.width = width
        self.height = height
        px = [UInt8](repeating: 255, count: width * height * 4)
    }

    init?(_ img: CGImage) {
        let w = img.width, h = img.height
        var buf = [UInt8](repeating: 0, count: w * h * 4)
        let ok: Bool = buf.withUnsafeMutableBytes { b in
            guard let ctx = CGContext(data: b.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.setFillColor(UIColor.white.cgColor)
            ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
            ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        if !ok { return nil }
        width = w
        height = h
        px = buf
    }

    func cgImage() -> CGImage? {
        let data = Data(px) as CFData
        guard let prov = CGDataProvider(data: data) else { return nil }
        return CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                       space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                       provider: prov, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}

enum YingCunRender {
    static let red = UIColor(red: 0xd7 / 255, green: 0x00, blue: 0x15 / 255, alpha: 1)
    static let flagFill = UIColor(red: 1, green: 0xd6 / 255, blue: 0x0a / 255, alpha: 1)

    static func font(_ size: Double, _ w: UIFont.Weight = .bold) -> UIFont { UIFont.systemFont(ofSize: CGFloat(max(1, size)), weight: w) }

    static func width(_ s: String, _ f: UIFont) -> Double { Double((s as NSString).size(withAttributes: [.font: f]).width) }

    /// 照 canvas 的 fillText（textBaseline = alphabetic）：x 是左边，base 是基线
    static func drawText(_ s: String, x: Double, base: Double, font f: UIFont, color: UIColor, stroke: (UIColor, Double)? = nil) {
        let p = CGPoint(x: x, y: base - Double(f.ascender))
        if let (sc, lw) = stroke {
            let attrs: [NSAttributedString.Key: Any] = [.font: f, .strokeColor: sc, .strokeWidth: lw / Double(f.pointSize) * 100]
            (s as NSString).draw(at: p, withAttributes: attrs)
        }
        (s as NSString).draw(at: p, withAttributes: [.font: f, .foregroundColor: color])
    }

    // ------------------------------------------------------------------ 透视
    static func homography(_ src: [(Double, Double)], _ dst: [(Double, Double)]) -> [Double]? {
        var A: [[Double]] = []
        var b: [Double] = []
        for i in 0..<4 {
            let (x, y) = src[i]
            let (u, v) = dst[i]
            A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
            A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
        }
        for c in 0..<8 {
            var p = c
            if c + 1 < 8 { for r in (c + 1)..<8 where abs(A[r][c]) > abs(A[p][c]) { p = r } }
            if abs(A[p][c]) < 1e-12 { return nil }
            A.swapAt(c, p); b.swapAt(c, p)
            for r in 0..<8 where r != c {
                let f = A[r][c] / A[c][c]
                for k in c..<8 { A[r][k] -= f * A[c][k] }
                b[r] -= f * b[c]
            }
        }
        return (0..<8).map { b[$0] / A[$0][$0] } + [1]
    }

    static func inv3(_ m: [Double]) -> [Double]? {
        let a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8]
        let A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
        let D = a * A + b * B + c * C
        if abs(D) < 1e-12 { return nil }
        let r0 = [A / D, -(b * i - c * h) / D, (b * f - c * e) / D]
        let r1 = [B / D, (a * i - c * g) / D, -(a * f - c * d) / D]
        let r2 = [C / D, -(a * h - b * g) / D, (a * e - b * d) / D]
        return r0 + r1 + r2
    }

    static func applyH(_ H: [Double], _ x: Double, _ y: Double) -> (Double, Double) {
        let w = H[6] * x + H[7] * y + H[8]
        return ((H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w)
    }

    // ------------------------------------------------------------------ 底下那条
    static func footer(_ img: UIImage, glyph: Double, mode: YCMode) -> UIImage {
        let W = Double(img.size.width), Hh = Double(img.size.height)
        let F = max(30, (1.9 * glyph).rounded())
        return render(W, Hh + F) {
            img.draw(at: .zero)
            UIColor(red: 0x0e / 255, green: 0x14 / 255, blue: 0x1c / 255, alpha: 1).setFill()
            UIRectFill(CGRect(x: 0, y: Hh, width: W, height: F))
            let fs = (F * 0.44).rounded(), y = Hh + F / 2
            let f = font(fs)
            let redWord = YingCunStrings.imgRed
            // canvas 的 textBaseline = middle：字身中线落在 y
            let mid = y + Double(f.ascender + f.descender) / 2
            drawText(redWord, x: fs * 0.7, base: mid, font: f, color: UIColor(red: 1, green: 0x5a / 255, blue: 0x5f / 255, alpha: 1))
            let w1 = width(redWord, f)
            let unit = mode == .in2mm ? YingCunStrings.mm : YingCunStrings.inches
            drawText(" = " + unit, x: fs * 0.7 + w1, base: mid, font: f, color: UIColor(red: 0xe5 / 255, green: 0xea / 255, blue: 0xf1 / 255, alpha: 1))
            let f2 = font((fs * 0.9).rounded(), .semibold)
            let brand = YingCunStrings.imgBrand
            drawText(brand, x: W - fs * 0.7 - width(brand, f2), base: y + Double(f2.ascender + f2.descender) / 2, font: f2,
                     color: UIColor(red: 0x9a / 255, green: 0xa7 / 255, blue: 0xb8 / 255, alpha: 1))
        }
    }

    static func render(_ w: Double, _ h: Double, _ draw: () -> Void) -> UIImage {
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        f.opaque = true
        let size = CGSize(width: max(1, w.rounded()), height: max(1, h.rounded()))
        return UIGraphicsImageRenderer(size: size, format: f).image { _ in draw() }
    }

    static func roundRect(_ x: Double, _ y: Double, _ w: Double, _ h: Double, _ r: Double, _ color: UIColor) {
        let rr = min(r, w / 2, h / 2)
        color.setFill()
        UIBezierPath(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: CGFloat(max(0, rr))).fill()
    }

    // ------------------------------------------------------------------ 有表
    /// keys：落红字的列（全要 = 六列；管控线 = LCL、UCL）
    static func renderTable(_ up: YCRaster, _ A: YCTable, _ chk: [YCCheck], _ mode: YCMode,
                            keys: Set<String> = Set(YingCun.keys6)) -> (UIImage, [YCLabel]) {
        let rows = A.rows, lines = A.lines, th = A.th, glyph = 0.59 * th
        func colx(_ k: String, _ y: Double) -> Double { let l = lines[k]!; return l.0 + l.1 * y }
        // 1) 四个角 → 透视矫正（行列拉直）
        var H: [Double]? = nil
        let full = rows.filter { $0.count >= 3 }
        let left = ["NO", "SYM", "DIM", "LCL"].first { lines.has($0) }
        let right = ["UCL", "LCL", "STOCK", "USL"].first { lines.has($0) }
        if full.count >= 2, let left, let right, left != right {
            func rowfit(_ r: YCMap<YCItem>) -> (Double, Double) {
                let ms = r.keys.map { r[$0]! }
                let f = YingCun.fit(ms.map(\.cx), ms.map(\.cy))
                return (f.1, f.0)
            }
            func colfit(_ k: String) -> (Double, Double) {
                let ms = rows.compactMap { $0[k] }
                if ms.count >= 3 {
                    let f = YingCun.fit(ms.map(\.cy), ms.map(\.cx))
                    return (f.1, f.0)
                }
                return lines[k]!
            }
            func inter(_ rw: (Double, Double), _ cl: (Double, Double)) -> (Double, Double) {
                let y = (rw.0 + rw.1 * cl.0) / (1 - rw.1 * cl.1)
                return (cl.0 + cl.1 * y, y)
            }
            let top = rowfit(full[0]), bot = rowfit(full[full.count - 1]), L = colfit(left), R = colfit(right)
            let TL = inter(top, L), TR = inter(top, R), BL = inter(bot, L), BR = inter(bot, R)
            let xL = (TL.0 + BL.0) / 2, xR = (TR.0 + BR.0) / 2, yT = (TL.1 + TR.1) / 2, yB = (BL.1 + BR.1) / 2
            if xR - xL > 4 * th && yB - yT > 2 * th {
                H = homography([TL, TR, BL, BR], [(xL, yT), (xR, yT), (xL, yB), (xR, yB)])
                if let h = H {
                    let corners = [TL, TR, BL, BR]
                    let blowsUp = corners.contains { p in
                        let q = applyH(h, p.0, p.1)
                        return !q.0.isFinite || !q.1.isFinite
                    }
                    if inv3(h) == nil || blowsUp { H = nil }
                }
            }
        }
        let identity: [Double] = [1, 0, 0, 0, 1, 0, 0, 0, 1]
        let HH = H ?? identity
        let Hi = inv3(HH) ?? identity
        func mp(_ it: YCItem) -> (Double, Double) { applyH(HH, it.cx, it.cy) }
        // 2) 矫正后的列位置、行位置
        var colX: [String: Double] = [:]
        for k in lines.keys {
            let xs = rows.compactMap { $0[k] }.map { mp($0).0 }
            colX[k] = xs.isEmpty ? applyH(HH, colx(k, A.hy), A.hy).0 : YingCun.median(xs)
        }
        let rowY: [Double] = rows.map { r in YingCun.mean(r.keys.map { mp(r[$0]!).1 }) }
        let hdrY0 = A.hs.keys.map { k -> Double in let h = A.hs[k]!; return applyH(HH, h.cx, h.y0).1 }.min() ?? 0
        let pitch = rowY.count > 1 ? YingCun.median((1..<rowY.count).map { rowY[$0] - rowY[$0 - 1] }) : A.pitch
        let order = lines.keys.stableSorted { colX[$0]! < colX[$1]! }
        func nb(_ k: String, _ d: Int) -> String? {
            guard let i0 = order.firstIndex(of: k) else { return nil }
            let i = i0 + d
            return i >= 0 && i < order.count ? order[i] : nil
        }
        // 从标号一直裁到最右边要换的那列（有控制范围就到 UCL，没有就到上差）
        // 管控线模式单找的表只有 LCL、UCL 两列：从 LCL 裁到 UCL
        let lk = ["NO", "SYM", "DIM"].first { colX[$0] != nil } ?? order.first!
        let rk = ["UCL", "LCL", "USL"].first { colX[$0] != nil } ?? order.last!
        let n1 = nb(lk, 1), n2 = nb(rk, 1), p2 = nb(rk, -1)
        let gapL: Double = n1.map { colX[$0]! - colX[lk]! } ?? 3 * th
        let gapPrev: Double = p2.map { colX[rk]! - colX[$0]! } ?? 3 * th
        let gapR: Double = n2.map { colX[$0]! - colX[rk]! } ?? max(3 * th, gapPrev)
        let x0 = colX[lk]! - 0.62 * gapL, x1 = colX[rk]! + 0.5 * gapR
        let rightEdge = colX[rk]!
        func show(_ r: YCMap<YCItem>) -> [String] {
            ["DIM", "LSL", "USL", "STOCK", "LCL", "UCL"].filter { k in
                guard keys.contains(k), let it = r[k], let n = it.num, let cx = colX[k] else { return false }
                return cx <= rightEdge + 1 && (k != "STOCK" || n.n != 0)
            }
        }
        let mL = 0.35 * gapL, mR = 0.3 * gapR, X0 = x0 - mL, X1 = x1 + mR
        let yTop = hdrY0 - 0.9 * th, yBot = rowY[rowY.count - 1] + 0.75 * pitch
        // 3) 每行原数字下面插一条，原图像素往下抻
        let cap = 1.45 * glyph, fs0 = cap / 0.72, S = Int((cap * 1.55).rounded())
        var cuts: [(v: Double, k: Int?)] = []
        for (k, r) in rows.enumerated() where !show(r).isEmpty {
            cuts.append((rowY[k] + 0.5 * glyph + 0.3 * max(0, 0.5 * pitch - 0.5 * glyph), k))
        }
        cuts.append((yBot, nil))
        var vm: [Double] = []
        var stripAt: [Int: Int] = [:]
        var v = yTop
        for c in cuts {
            let n = max(0, Int((c.v - v).rounded()))
            for i in 0..<n { vm.append(v + Double(i)) }
            v += Double(n)
            if let k = c.k {
                stripAt[k] = vm.count
                for _ in 0..<S { vm.append(v) }
            }
        }
        if vm.isEmpty { vm = [yTop] }
        let Wm = max(8, Int((X1 - X0).rounded())), Hm = vm.count
        var warp = YCRaster(width: Wm, height: Hm)
        let sw = up.width, sh = up.height
        let swd = Double(sw), shd = Double(sh)
        up.px.withUnsafeBufferPointer { sd in
            warp.px.withUnsafeMutableBufferPointer { od in
                for y in 0..<Hm {
                    let V = vm[y]
                    for x in 0..<Wm {
                        let U = X0 + Double(x)
                        let w = Hi[6] * U + Hi[7] * V + Hi[8]
                        var fx = (Hi[0] * U + Hi[1] * V + Hi[2]) / w
                        var fy = (Hi[3] * U + Hi[4] * V + Hi[5]) / w
                        if !(fx > 0) { fx = 0 } else if fx > swd - 1.001 { fx = swd - 1.001 }
                        if !(fy > 0) { fy = 0 } else if fy > shd - 1.001 { fy = shd - 1.001 }
                        let ix = Int(fx), iy = Int(fy)
                        let ax = fx - Double(ix), ay = fy - Double(iy)
                        let i00 = (iy * sw + ix) * 4, i01 = i00 + sw * 4, o = (y * Wm + x) * 4
                        for c in 0..<3 {
                            let a0 = Double(sd[i00 + c]), a1 = Double(sd[i00 + 4 + c])
                            let b0 = Double(sd[i01 + c]), b1 = Double(sd[i01 + 4 + c])
                            let p = a0 + (a1 - a0) * ax, q = b0 + (b1 - b0) * ax
                            od[o + c] = UInt8(max(0, min(255, (p + (q - p) * ay).rounded())))
                        }
                        od[o + 3] = 255
                    }
                }
            }
        }
        // 4) 边贴到表格线上
        let od = warp.px
        func ink(_ o: Int) -> Double { 765 - Double(od[o]) - Double(od[o + 1]) - Double(od[o + 2]) }
        func dark(_ xa: Int, _ xb: Int, _ ya: Int, _ yb: Int, _ vertical: Bool) -> Int {
            var prof: [Double] = []
            if vertical {
                if xa <= xb {
                    for x in xa...xb {
                        var s = 0.0, y = ya
                        while y < yb { s += ink((y * Wm + x) * 4); y += 2 }
                        prof.append(s)
                    }
                }
            } else if ya <= yb {
                for y in ya...yb {
                    var s = 0.0, x = xa
                    while x < xb { s += ink((y * Wm + x) * 4); x += 2 }
                    prof.append(s)
                }
            }
            if prof.isEmpty { return -1 }
            var bi = 0
            for i in 0..<prof.count where prof[i] > prof[bi] { bi = i }
            let md = YingCun.median(prof)
            return prof[bi] > md * 1.6 + 1 ? bi : -1
        }
        let firstRowOut = max(0, Int((rowY[0] - yTop).rounded()))
        var cL = Int(mL.rounded()), cR = Wm - Int(mR.rounded()), cT = 0, cB = Hm
        var p = dark(0, min(Wm - 1, Int((mL + 0.25 * gapL).rounded())), firstRowOut, Hm, true)
        if p >= 0 { cL = max(0, p - 3) }
        let ra = max(0, Int((Double(Wm) - 2 * mR).rounded())), rb = Wm - 1
        p = dark(ra, rb, firstRowOut, Hm, true)
        if p >= 0 { cR = min(Wm, ra + p + 4) }
        let tb = max(1, Int((hdrY0 - yTop + 0.15 * th).rounded()))
        p = dark(cL, cR, 0, min(Hm - 1, tb), false)
        if p >= 0 { cT = max(0, p - 3) }
        let ba = max(0, Hm - Int((0.55 * pitch).rounded()))
        p = dark(cL, cR, ba, Hm - 1, false)
        if p >= 0 { cB = min(Hm, ba + p + 4) }
        let outW = max(8, cR - cL), outH = max(8, cB - cT)
        let warpImg = warp.cgImage()?.cropping(to: CGRect(x: cL, y: cT, width: outW, height: outH))
        // 5) 落红字
        var labels: [YCLabel] = []
        func colW(_ k: String) -> Double {
            var ds: [Double] = []
            if let a = nb(k, -1) { ds.append(colX[k]! - colX[a]!) }
            if let b = nb(k, 1) { ds.append(colX[b]! - colX[k]!) }
            return ds.min() ?? 4 * th
        }
        let img = render(Double(outW), Double(outH)) {
            if let warpImg { UIImage(cgImage: warpImg).draw(in: CGRect(x: 0, y: 0, width: outW, height: outH)) }
            for (k, r) in rows.enumerated() {
                guard let sa = stripAt[k] else { continue }
                for key in show(r) {
                    let it = r[key]!
                    let txt = YingCun.convert(it.num!, mode)
                    let flagged = chk[k].flag.contains(key)
                    var fs = fs0
                    var f = font(fs)
                    var tw = width(txt, f)
                    let maxW = 0.9 * colW(key)
                    if tw > maxW {
                        fs *= maxW / tw
                        f = font(fs)
                        tw = width(txt, f)
                    }
                    let u = mp(it).0 - X0 - Double(cL)
                    let top = Double(sa - cT)
                    let base = top + Double(S) / 2 + 0.36 * fs
                    let pad = 0.35 * fs
                    if flagged {
                        roundRect(u - tw / 2 - pad, top + 1, tw + 2 * pad, Double(S) - 2, 0.3 * fs, flagFill)
                        drawText(txt, x: u - tw / 2, base: base, font: f, color: red)
                    } else {
                        drawText(txt, x: u - tw / 2, base: base, font: f, color: red, stroke: (UIColor(white: 1, alpha: 0.92), max(3, fs * 0.16)))
                    }
                    labels.append(YCLabel(x: u - tw / 2 - pad, y: top, w: tw + 2 * pad, h: Double(S), row: k, key: key, item: it, flagged: flagged))
                }
            }
        }
        return (footer(img, glyph: glyph, mode: mode), labels)
    }

    // ------------------------------------------------------------------ 没表
    /// 红字放哪儿：每个数的红字框不高过原数那一格、不宽过它 1.6 倍（至少 3.5 个字宽）；先试右边，再下、左、上；
    /// 跟别的字、别的红字撞了就缩一档再试；缩到原字一半（最少 7 像素）还放不下就不写。回 (每个数的框和字高, 没写的个数)
    static func placeLoose(_ nums: [YCItem], obstacles: [CGRect], bounds: CGRect, mode: YCMode,
                           measure: (String, Double) -> Double) -> ([(YCItem, CGRect, Double)], Int) {
        var taken = obstacles
        var out: [(YCItem, CGRect, Double)] = []
        var skipped = 0
        let order = nums.stableSorted { a, b in abs(a.cy - b.cy) > 0.5 * min(a.h, b.h) ? a.cy < b.cy : a.cx < b.cx }
        for it in order {
            let txt = YingCun.convert(it.num!, mode)
            let glyph = 0.59 * it.h
            let own = CGRect(x: it.x0, y: it.y0, width: it.x1 - it.x0, height: it.h)
            // 红字框高 = cap × (1 + 2 × 0.3 / 0.72) ≈ 1.83 cap：不高过原数那一格
            let capMax = min(0.92 * glyph, it.h / 1.84)
            let capMin = max(0.5 * glyph, 7)
            let maxW = max(1.6 * Double(own.width), 3.5 * glyph)
            var placed: (CGRect, Double)?
            var cap = capMax
            while placed == nil && cap >= capMin - 0.01 {
                var c = cap
                var tw = measure(txt, c / 0.72)
                if tw + 0.6 * c / 0.72 > maxW {          // 太宽：按宽缩
                    let k = maxW / (tw + 0.6 * c / 0.72)
                    c *= k
                    tw *= k
                }
                if c >= capMin - 0.01 {
                    let pc = 0.3 * c / 0.72, g = 0.15 * c / 0.72
                    let w = tw + 2 * pc, h = c + 2 * pc
                    let cands = [CGRect(x: own.maxX + g, y: it.cy - h / 2, width: w, height: h),
                                 CGRect(x: it.cx - w / 2, y: own.maxY + g, width: w, height: h),
                                 CGRect(x: own.minX - g - w, y: it.cy - h / 2, width: w, height: h),
                                 CGRect(x: it.cx - w / 2, y: own.minY - g - h, width: w, height: h)]
                    if let r = cands.first(where: { r in bounds.contains(r) && !taken.contains { $0.intersects(r) } }) {
                        placed = (r, c)
                    }
                }
                cap *= 0.85
            }
            if let (r, c) = placed {
                taken.append(r)
                out.append((it, r, c))
            } else {
                skipped += 1
            }
        }
        return (out, skipped)
    }

    static func renderLoose(_ up: YCRaster, _ items: [YCItem], _ mode: YCMode) -> (UIImage, [YCLabel], Int) {
        let nums = items.filter { $0.num != nil }
        let th = YingCun.median(items.map(\.h))
        var x0 = items.map(\.x0).min() ?? 0, y0 = items.map(\.y0).min() ?? 0
        var x1 = items.map(\.x1).max() ?? Double(up.width), y1 = items.map(\.y1).max() ?? Double(up.height)
        x0 = max(0, (x0 - 1.5 * th).rounded(.down))
        y0 = max(0, (y0 - 1.5 * th).rounded(.down))
        x1 = min(Double(up.width), (x1 + 4 * th).rounded(.up))
        y1 = min(Double(up.height), (y1 + 1.5 * th).rounded(.up))
        let W = x1 - x0, Hh = y1 - y0
        let crop = up.cgImage()?.cropping(to: CGRect(x: x0, y: y0, width: W, height: Hh))
        // 别的字（数和字都算，自己那一格也算）都是障碍；字框当初撑大过（boxGrow），这里收回原来的高
        let obstacles = items.filter { !$0.text.isEmpty }.map { i -> CGRect in
            let h = i.h / YingCunVision.boxGrow
            return CGRect(x: i.x0, y: i.cy - h / 2, width: i.x1 - i.x0, height: h)
        }
        let (spots, skipped) = placeLoose(nums, obstacles: obstacles, bounds: CGRect(x: x0, y: y0, width: W, height: Hh), mode: mode) { t, fs in
            width(t, font(fs))
        }
        var labels: [YCLabel] = []
        let img = render(W, Hh) {
            if let crop { UIImage(cgImage: crop).draw(in: CGRect(x: 0, y: 0, width: W, height: Hh)) }
            for (it, r, cap) in spots {
                let fs = cap / 0.72, pad = 0.3 * fs
                let txt = YingCun.convert(it.num!, mode)
                let lx = Double(r.minX) - x0, ly = Double(r.minY) - y0
                let bg = it.flag ? UIColor(red: 1, green: 0xd6 / 255, blue: 0x0a / 255, alpha: 0.95) : UIColor(white: 1, alpha: 0.88)
                roundRect(lx, ly, Double(r.width), Double(r.height), 0.3 * fs, bg)
                drawText(txt, x: lx + pad, base: ly + pad + cap, font: font(fs), color: red)
                labels.append(YCLabel(x: lx, y: ly, w: Double(r.width), h: Double(r.height), row: -1, key: nil, item: it, flagged: it.flag))
            }
        }
        return (footer(img, glyph: 0.59 * th, mode: mode), labels, skipped)
    }

    /// 没盖红字的照片（管控线模式没找到管控线时给他看）：缩到长边 1600
    static func plain(_ up: YCRaster) -> UIImage {
        guard let cg = up.cgImage() else { return UIImage() }
        let k = min(1, 1600 / Double(max(up.width, up.height)))
        let w = Double(up.width) * k, h = Double(up.height) * k
        return render(w, h) { UIImage(cgImage: cg).draw(in: CGRect(x: 0, y: 0, width: w, height: h)) }
    }

    // ------------------------------------------------------------------ 出图
    static func draw(_ job: YCJob, _ mode: YCMode, _ pick: YCPick = .all) -> YCDrawn? {
        if job.kind == .none && job.limits == nil { return nil }
        if pick == .limits {
            // 管控线：只换 LCL、UCL；对账照旧跑，黄格、倒推只留这两列的
            guard let A = job.limits else {
                var d = YCDrawn(image: plain(job.up), labels: [], checks: [])
                d.pick = .limits
                d.missing = true
                return d
            }
            var chk = YingCun.checkRows(A.rows)
            for i in chk.indices {
                chk[i].flag.formIntersection(YingCun.limitKeys)
                chk[i].sugg = chk[i].sugg.filter { YingCun.limitKeys.contains($0.key) }
            }
            let (img, labels) = renderTable(job.up, A, chk, mode, keys: YingCun.limitKeys)
            var d = YCDrawn(image: img, labels: labels, checks: chk)
            d.pick = .limits
            d.rows = A.rows.count
            d.checked = chk.filter { $0.checked }.count
            d.okRows = chk.filter { $0.checked && $0.flag.isEmpty }.count
            d.flags = chk.reduce(0) { $0 + $1.flag.count }
            return d
        }
        switch job.kind {
        case .table:
            guard let A = job.table else { return nil }
            let chk = YingCun.checkRows(A.rows)
            let (img, labels) = renderTable(job.up, A, chk, mode)
            var d = YCDrawn(image: img, labels: labels, checks: chk)
            d.rows = A.rows.count
            d.checked = chk.filter { $0.checked }.count
            d.okRows = chk.filter { $0.checked && $0.flag.isEmpty }.count
            d.flags = chk.reduce(0) { $0 + $1.flag.count }
            return d
        case .loose:
            for i in job.items { i.flag = i.num != nil && !i.edited && i.conf < 0.9 }
            let (img, labels, skipped) = renderLoose(job.up, job.items, mode)
            var d = YCDrawn(image: img, labels: labels, checks: [])
            d.flags = job.items.filter { $0.flag }.count
            d.skipped = skipped
            return d
        case .none:
            return nil
        }
    }
}
