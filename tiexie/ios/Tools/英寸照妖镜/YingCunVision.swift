import UIKit
import Vision

// 英寸照妖镜认字：网页版用 PaddleOCR（下 30 MB 模型），这里换成苹果本机的 Vision（VNRecognizeTextRequest，照片不出手机）。
// 1) 缩到长边 2016（网页版的工作尺寸）；
// 2) 扶正：四个方向（0/90/180/270）各用 fast 认一遍，认出字最多、最有把握的那个方向是正的；再看字行歪了几度，转平；
// 3) accurate 认全图；一行字按大空隙拆成一个个字框（网页版的字框也是一格一个）；
// 4) 交给 YingCun：只留要的几列 → 读表 → 对账。透视交给出图那步的四角矫正（跟网页版一样）。
// 166：扶正多试一组「只差不到 15°」的角度（整张单子横拍、字小的时候，投影法会被拐到 45°，照片反被转歪）；
//      没抹过的字框另存一份给管控线模式；两种表头都没找到、原图又比 2016 大，就用原图大小再认一遍。

enum YCKind: String {
    case table, loose, none
}

/// 一张照片读完的结果
final class YCJob {
    var up: YCRaster
    var items: [YCItem]
    var table: YCTable?
    var kind: YCKind
    /// 没抹过的字框（管控线模式用）
    var raw: [YCItem]
    /// 管控线模式的表（LCL / UCL 两列）；nil = 没找到管控线
    var limits: YCTable?
    /// 逆时针转了几度才扶正
    var angle: Double
    var unit: String?
    /// 扶正每一步量了多少（单测、排查用，不进日志）
    var notes: [String] = []

    init(up: YCRaster, items: [YCItem], raw: [YCItem]? = nil, angle: Double) {
        self.up = up
        self.items = items
        self.raw = raw ?? items.map { $0.copy() }
        self.angle = angle
        let A = YingCun.analyze(items)
        if let A, A.rows.contains(where: { r in ["DIM", "LSL", "USL"].contains { r[$0]?.num != nil } }) {
            kind = .table
            table = A
        } else if items.contains(where: { $0.num != nil }) {
            kind = .loose
        } else {
            kind = .none
        }
        unit = YingCun.unitHint(items)
        limits = YingCun.limitsTable(full: table, raw: self.raw)
    }

    /// 两种表头哪个都没找到
    var noHeader: Bool { table == nil && limits == nil }
}

enum YCStep {
    case orient, read, check, draw
}

enum YCError: Error {
    case badImage
}

enum YingCunVision {
    static let work: CGFloat = 2016
    /// Vision 的字框比 PaddleOCR 的紧；照网页版的字框高（约 1.45 倍字号）撑一下，后面那些「几倍字高」的门槛才对得上
    static var boxGrow: Double = 1.3

    // ------------------------------------------------------------------ 图
    /// 扶正 EXIF 方向、缩到长边 maxSide 以内
    static func upright(_ img: UIImage, maxSide: CGFloat) -> CGImage? {
        let w = img.size.width, h = img.size.height
        guard w > 0, h > 0 else { return nil }
        let k = min(1, maxSide / max(w, h))
        let size = CGSize(width: (w * k).rounded(), height: (h * k).rounded())
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        f.opaque = true
        return UIGraphicsImageRenderer(size: size, format: f).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            img.draw(in: CGRect(origin: .zero, size: size))
        }.cgImage
    }

    /// 逆时针转 deg 度（看上去），画布撑大，空角补白
    static func rotate(_ src: CGImage, deg: Double, maxSide: CGFloat? = nil) -> CGImage? {
        let a = deg * .pi / 180
        let w = Double(src.width), h = Double(src.height)
        let k = maxSide.map { min(1, Double($0) / max(w, h)) } ?? 1
        let sw = w * k, sh = h * k
        let nw = Int((sh * abs(sin(a)) + sw * abs(cos(a))).rounded()), nh = Int((sh * abs(cos(a)) + sw * abs(sin(a))).rounded())
        guard nw > 0, nh > 0, let ctx = CGContext(data: nil, width: nw, height: nh, bitsPerComponent: 8, bytesPerRow: 0,
                                                   space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.setFillColor(UIColor.white.cgColor)
        ctx.fill(CGRect(x: 0, y: 0, width: nw, height: nh))
        ctx.interpolationQuality = .high
        // CG 的 y 朝上：rotate(by: 正) 看上去是逆时针
        ctx.translateBy(x: Double(nw) / 2, y: Double(nh) / 2)
        ctx.rotate(by: a)
        ctx.draw(src, in: CGRect(x: -sw / 2, y: -sh / 2, width: sw, height: sh))
        return ctx.makeImage()
    }

    // ------------------------------------------------------------------ 认字
    struct Line {
        var text: String
        var conf: Double
        /// 像素坐标（y 朝下）
        var box: CGRect
        /// 字行方向（弧度，y 朝下，往右下斜是正）
        var tilt: Double?
        var obs: VNRecognizedTextObservation
        var cand: VNRecognizedText
    }

    static func recognize(_ img: CGImage, accurate: Bool, minHeight: Float = 0.006) throws -> [Line] {
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = accurate ? .accurate : .fast
        req.usesLanguageCorrection = false
        if accurate { req.recognitionLanguages = ["en-US", "zh-Hans"] }
        req.minimumTextHeight = minHeight
        #if targetEnvironment(simulator)
        req.usesCPUOnly = true
        #endif
        let handler = VNImageRequestHandler(cgImage: img, orientation: .up, options: [:])
        try handler.perform([req])
        let W = Double(img.width), H = Double(img.height)
        return (req.results ?? []).compactMap { obs in
            guard let c = obs.topCandidates(1).first else { return nil }
            let bb = obs.boundingBox
            let box = CGRect(x: bb.minX * W, y: (1 - bb.maxY) * H, width: bb.width * W, height: bb.height * H)
            let dx = Double(obs.topRight.x - obs.topLeft.x) * W, dy = -Double(obs.topRight.y - obs.topLeft.y) * H
            let tilt: Double? = hypot(dx, dy) > 1 ? atan2(dy, dx) : nil
            return Line(text: c.string, conf: Double(c.confidence), box: box, tilt: tilt, obs: obs, cand: c)
        }
    }

    /// 这个方向认得有多像：有把握的字母数字越多越像
    static func score(_ lines: [Line]) -> Double {
        lines.reduce(0) { s, l in s + l.conf * Double(l.text.filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.count) }
    }

    /// 字行歪了几度（弧度，y 朝下）：先看 Vision 给的字框四角，四角是正的（老版本只给正框）就看左右相邻字框的高低差
    static func skew(_ lines: [Line]) -> Double {
        let p = skewParts(lines)
        if let q = p.quad, abs(q) > 0.3 * .pi / 180 { return q }
        return p.nb ?? 0
    }

    /// 两种量法各自的结果（弧度）：quad = Vision 字框四角，nb = 左右相邻字框的高低差
    static func skewParts(_ lines: [Line]) -> (quad: Double?, nb: Double?) {
        var quad: Double?
        var ws: [(Double, Double)] = []
        for l in lines where l.box.width > 2.5 * l.box.height { if let t = l.tilt, abs(t) < 0.6 { ws.append((t, Double(l.box.width))) } }
        if ws.count >= 3 {
            let s = ws.sorted { $0.0 < $1.0 }
            let total = s.reduce(0) { $0 + $1.1 }
            var acc = 0.0
            for (t, w) in s {
                acc += w
                if acc >= total / 2 { quad = t; break }
            }
        }
        // 相邻字框：每个字框找右边最近、高低差不到一个字高（再放宽一点给歪着的）的那个，斜率取中位数
        let hs = lines.map { Double($0.box.height) }
        let h = YingCun.median(hs)
        guard h.isFinite, h > 0 else { return (quad, nil) }
        var slopes: [Double] = []
        for a in lines {
            var best: (dx: Double, dy: Double)?
            for b in lines {
                let dx = Double(b.box.midX - a.box.midX), dy = Double(b.box.midY - a.box.midY)
                if dx <= h || dx > 12 * h || abs(dy) > 0.7 * h + 0.25 * dx { continue }
                if best == nil || dx < best!.dx { best = (dx, dy) }
            }
            if let best { slopes.append(best.dy / best.dx) }
        }
        return (quad, slopes.count >= 3 ? atan(YingCun.median(slopes)) : nil)
    }

    static func deg(_ r: Double?) -> String { r.map { String(format: "%.1f", $0 * 180 / .pi) } ?? "-" }

    /// 一行字按大空隙拆开（空隙比 0.9 个字高宽就拆），每段一个字框
    static func items(_ lines: [Line]) -> [YCItem] {
        var out: [YCItem] = []
        for l in lines {
            let s = l.text
            var tokens: [(Range<String.Index>, CGRect)] = []
            var i = s.startIndex
            while i < s.endIndex {
                while i < s.endIndex, s[i].isWhitespace { i = s.index(after: i) }
                if i >= s.endIndex { break }
                var j = i
                while j < s.endIndex, !s[j].isWhitespace { j = s.index(after: j) }
                let r = i..<j
                if let bb = try? l.cand.boundingBox(for: r)?.boundingBox {
                    tokens.append((r, CGRect(x: bb.minX, y: 1 - bb.maxY, width: bb.width, height: bb.height)))
                }
                i = j
            }
            // 字框按整张图的像素算（l.box 是像素，bb 是 0~1）
            let W = l.box.width > 0 ? Double(l.box.maxX) / Double(max(1e-9, l.obs.boundingBox.maxX)) : 0
            let H = l.box.height > 0 ? Double(l.box.height) / Double(max(1e-9, l.obs.boundingBox.height)) : 0
            var groups: [(String.Index, String.Index, CGRect, [(Range<String.Index>, CGRect)])] = []
            if tokens.count <= 1 || W <= 0 || H <= 0 {
                // 166：Vision 给不出每个词的框时，整行一个框；里面夹着数、整串又不是一个数，就按字数把词摊开
                let whole = s.trimmingCharacters(in: .whitespaces)
                let words = wordRanges(s)
                if words.count >= 2, YingCun.parseNum(whole) == nil, words.contains(where: { YingCun.parseNum(String(s[$0])) != nil }) {
                    let n = Double(s.count)
                    for r in words {
                        let a = Double(s.distance(from: s.startIndex, to: r.lowerBound)) / n, b = Double(s.distance(from: s.startIndex, to: r.upperBound)) / n
                        let box = CGRect(x: l.box.minX + l.box.width * a, y: l.box.minY, width: l.box.width * (b - a), height: l.box.height)
                        out.append(item(box, String(s[r]), l.conf))
                    }
                } else {
                    out.append(item(l.box, whole, l.conf))
                }
                continue
            }
            for (r, nb) in tokens {
                let px = CGRect(x: nb.minX * W, y: nb.minY * H, width: nb.width * W, height: nb.height * H)
                if let last = groups.last, Double(px.minX - last.2.maxX) < 0.9 * Double(l.box.height) {
                    groups[groups.count - 1] = (last.0, r.upperBound, last.2.union(px), last.3 + [(r, px)])
                } else {
                    groups.append((r.lowerBound, r.upperBound, px, [(r, px)]))
                }
            }
            for g in groups {
                let text = String(s[g.0..<g.1])
                // 166：挨得近被并成一块的（「0.6457 BG」这种：数跟隔壁的字粘在一起），整块又不是一个数，就一个词一个框拆开
                if g.3.count >= 2, YingCun.parseNum(text) == nil, g.3.contains(where: { YingCun.parseNum(String(s[$0.0])) != nil }) {
                    for (r, px) in g.3 { out.append(item(px, String(s[r]), l.conf)) }
                } else {
                    out.append(item(g.2, text, l.conf))
                }
            }
        }
        return out
    }

    /// 一行字里每个词（不含空白）的位置
    static func wordRanges(_ s: String) -> [Range<String.Index>] {
        var out: [Range<String.Index>] = []
        var i = s.startIndex
        while i < s.endIndex {
            while i < s.endIndex, s[i].isWhitespace { i = s.index(after: i) }
            if i >= s.endIndex { break }
            var j = i
            while j < s.endIndex, !s[j].isWhitespace { j = s.index(after: j) }
            out.append(i..<j)
            i = j
        }
        return out
    }

    static func item(_ r: CGRect, _ text: String, _ conf: Double) -> YCItem {
        let cy = Double(r.midY), h = Double(r.height) * boxGrow
        return YCItem(x0: Double(r.minX), y0: cy - h / 2, x1: Double(r.maxX), y1: cy + h / 2, text: text, conf: conf)
    }

    // ------------------------------------------------------------------ 一张照片从头到尾
    // ------------------------------------------------------------------ 量歪了几度：投影法
    /// 把纸转平要逆时针转几度（-45°~45°，只管跟横竖差多少，正着倒着交给 Vision 挑）：
    /// 缩到长边 800，比周围暗一截的像素算墨（阴影不算），试一圈角度，哪个角度下墨的横向投影最尖（表格线、字行最平）就是它
    static func profileSkew(_ src: CGImage, range: Double = 45) -> Double {
        let k = min(1, 800 / Double(max(src.width, src.height)))
        let w = max(1, Int((Double(src.width) * k).rounded())), h = max(1, Int((Double(src.height) * k).rounded()))
        var g = [UInt8](repeating: 255, count: w * h)
        let ok: Bool = g.withUnsafeMutableBytes { b in
            guard let ctx = CGContext(data: b.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            ctx.interpolationQuality = .medium
            ctx.draw(src, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard ok else { return 0 }
        // 积分图算 25×25 的局部平均
        let W1 = w + 1
        var ii = [Double](repeating: 0, count: (h + 1) * W1)
        for y in 0..<h {
            var row = 0.0
            for x in 0..<w {
                row += Double(g[y * w + x])
                ii[(y + 1) * W1 + x + 1] = ii[y * W1 + x + 1] + row
            }
        }
        let r = 12
        var xs: [Double] = [], ys: [Double] = []
        for y in 0..<h {
            let y0 = max(0, y - r), y1 = min(h, y + r + 1)
            for x in 0..<w {
                let x0 = max(0, x - r), x1 = min(w, x + r + 1)
                let s = ii[y1 * W1 + x1] - ii[y0 * W1 + x1] - ii[y1 * W1 + x0] + ii[y0 * W1 + x0]
                let mean = s / Double((y1 - y0) * (x1 - x0))
                if Double(g[y * w + x]) < mean - 25 {
                    xs.append(Double(x) - Double(w) / 2)
                    ys.append(Double(y) - Double(h) / 2)
                }
            }
        }
        if xs.count < 200 { return 0 }
        if xs.count > 40000 {
            let step = xs.count / 40000 + 1
            xs = stride(from: 0, to: xs.count, by: step).map { xs[$0] }
            ys = stride(from: 0, to: ys.count, by: step).map { ys[$0] }
        }
        let n = Double(w + h) * 2 + 4
        var hist = [Double](repeating: 0, count: Int(n) + 2)
        func score(_ deg: Double) -> Double {
            let a = deg * .pi / 180, sa = sin(a), ca = cos(a)
            for i in 0..<hist.count { hist[i] = 0 }
            for i in 0..<xs.count {
                let yp = -xs[i] * sa + ys[i] * ca + n / 2
                let bi = Int(yp)
                if bi >= 0 && bi < hist.count { hist[bi] += 1 }
            }
            return hist.reduce(0) { $0 + $1 * $1 }
        }
        var best = (s: -1.0, d: 0.0)
        var d = -range
        while d < range {
            let s = score(d)
            if s > best.s { best = (s, d) }
            d += 0.5
        }
        let d0 = best.d
        d = d0 - 0.5
        while d <= d0 + 0.501 {
            let s = score(d)
            if s > best.s { best = (s, d) }
            d += 0.1
        }
        return best.d
    }

    // ------------------------------------------------------------------ 一张照片从头到尾
    /// hires：nil = 自动（读不出表头、原图又大，就用原图大小再认一遍）；true = 直接用原图大小认（单测用）
    static func read(_ img: UIImage, hires: Bool? = nil, onStep: @escaping (YCStep) -> Void = { _ in }) async throws -> YCJob {
        try await Task.detached(priority: .userInitiated) {
            await MainActor.run { onStep(.orient) }
            guard let src = YingCunVision.upright(img, maxSide: YingCunVision.work) else { throw YCError.badImage }
            var notes: [String] = []
            // 1) 转平（投影法）。整张单子、字小的时候投影法会被拐到 ±45°（166：Song 横拍的整张单子被转成了斜的），
            //    所以再在 ±15° 里找一个；两组角度各转四个方向，让 Vision 看一眼（小图、fast），认出字最多、最有把握的是正的
            let a = YingCunVision.profileSkew(src)
            let a2 = YingCunVision.profileSkew(src, range: 15)
            var bases = [a]
            if abs(a2 - a) > 3 { bases.append(a2) }
            var best: (deg: Double, score: Double)?
            var scores: [String] = []
            for base in bases {
                for q in 0..<4 {
                    let deg = base + Double(q) * 90
                    guard let r = YingCunVision.rotate(src, deg: deg, maxSide: 1024) else { continue }
                    let lines = (try? YingCunVision.recognize(r, accurate: false)) ?? []
                    let s = YingCunVision.score(lines)
                    scores.append(String(format: "%.0f", s))
                    if best == nil || s > best!.score { best = (deg, s) }
                }
            }
            let deg = best?.deg ?? a
            notes.append(String(format: "平%.1f", a) + (bases.count > 1 ? String(format: "/%.1f", a2) : "") + " 向" + scores.joined(separator: "/")
                         + String(format: " 取%.1f", deg))
            await MainActor.run { onStep(.read) }
            let side = Double(max(img.size.width, img.size.height))
            var job: YCJob
            if hires == true {
                job = try YingCunVision.readAt(img, maxSide: 4032, deg: deg, notes: &notes)
            } else {
                guard let up = YingCunVision.rotate(src, deg: deg) else { throw YCError.badImage }
                job = try YingCunVision.readUp(up, angle: deg, minHeight: 0.006, notes: &notes)
                // 2) 两种表头都没找到、原图比 2016 大一截：整张单子字太小，用原图大小（最大 4032）再认一遍
                if hires == nil, job.noHeader, side > Double(YingCunVision.work) * 1.3 {
                    var n2: [String] = []
                    if let j2 = try? YingCunVision.readAt(img, maxSide: 4032, deg: deg, notes: &n2), !j2.noHeader {
                        notes.append("原图大小重认")
                        notes += n2
                        job = j2
                    } else {
                        notes.append("原图大小重认也没表头")
                    }
                }
            }
            await MainActor.run { onStep(.check) }
            job.notes = notes
            return job
        }.value
    }

    /// 用原图大小（最大 maxSide）转 deg 度认一遍
    static func readAt(_ img: UIImage, maxSide: CGFloat, deg: Double, notes: inout [String]) throws -> YCJob {
        guard let big = upright(img, maxSide: maxSide), let up = rotate(big, deg: deg) else { throw YCError.badImage }
        // 字框门槛按像素不变（2016 上 0.006 ≈ 12 像素高），大图上放低一点，小字也收
        let k = Double(work) / Double(max(big.width, big.height))
        return try readUp(up, angle: deg, minHeight: Float(max(0.002, 0.006 * k * 0.8)), notes: &notes)
    }

    /// 扶正好的图：认字 → 字框 → 修表头 → 只留要的列 → 读表
    static func readUp(_ up: CGImage, angle: Double, minHeight: Float, notes: inout [String]) throws -> YCJob {
        let lines = try recognize(up, accurate: true, minHeight: minHeight)
        let p2 = skewParts(lines)
        notes.append("余歪 框\(YingCunVision.deg(p2.quad)) 邻\(YingCunVision.deg(p2.nb)) 行\(lines.count) 宽\(up.width)")
        let found = items(lines)
        let split = YingCun.splitHeaderWords(found)
        if split > 0 { notes.append("表头拆了\(split)个") }
        if YingCun.headerOf(found, YingCun.median(found.map(\.h))) == nil, YingCun.repairHeader(found) {
            notes.append("表头补了 DIMENSION")
        }
        let raw = found.map { $0.copy() }
        YingCun.prune(found)
        guard let raster = YCRaster(up) else { throw YCError.badImage }
        return YCJob(up: raster, items: found, raw: raw, angle: angle)
    }
}
