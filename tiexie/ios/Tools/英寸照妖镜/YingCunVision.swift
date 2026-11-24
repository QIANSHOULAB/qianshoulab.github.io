import UIKit
import Vision

// 英寸照妖镜认字：网页版用 PaddleOCR（下 30 MB 模型），这里换成苹果本机的 Vision（VNRecognizeTextRequest，照片不出手机）。
// 1) 缩到长边 2016（网页版的工作尺寸）；
// 2) 扶正：四个方向（0/90/180/270）各用 fast 认一遍，认出字最多、最有把握的那个方向是正的；再看字行歪了几度，转平；
// 3) accurate 认全图；一行字按大空隙拆成一个个字框（网页版的字框也是一格一个）；
// 4) 交给 YingCun：只留要的几列 → 读表 → 对账。透视交给出图那步的四角矫正（跟网页版一样）。

enum YCKind: String {
    case table, loose, none
}

/// 一张照片读完的结果
final class YCJob {
    var up: YCRaster
    var items: [YCItem]
    var table: YCTable?
    var kind: YCKind
    /// 逆时针转了几度才扶正
    var angle: Double
    var unit: String?
    /// 扶正每一步量了多少（单测、排查用，不进日志）
    var notes: [String] = []

    init(up: YCRaster, items: [YCItem], angle: Double) {
        self.up = up
        self.items = items
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
    }
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

    static func recognize(_ img: CGImage, accurate: Bool) throws -> [Line] {
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = accurate ? .accurate : .fast
        req.usesLanguageCorrection = false
        if accurate { req.recognitionLanguages = ["en-US", "zh-Hans"] }
        req.minimumTextHeight = 0.006
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
            var groups: [(String.Index, String.Index, CGRect)] = []
            if tokens.count <= 1 || W <= 0 || H <= 0 {
                out.append(item(l.box, s.trimmingCharacters(in: .whitespaces), l.conf))
                continue
            }
            for (r, nb) in tokens {
                let px = CGRect(x: nb.minX * W, y: nb.minY * H, width: nb.width * W, height: nb.height * H)
                if let last = groups.last, Double(px.minX - last.2.maxX) < 0.9 * Double(l.box.height) {
                    groups[groups.count - 1] = (last.0, r.upperBound, last.2.union(px))
                } else {
                    groups.append((r.lowerBound, r.upperBound, px))
                }
            }
            for g in groups {
                out.append(item(g.2, String(s[g.0..<g.1]), l.conf))
            }
        }
        return out
    }

    static func item(_ r: CGRect, _ text: String, _ conf: Double) -> YCItem {
        let cy = Double(r.midY), h = Double(r.height) * boxGrow
        return YCItem(x0: Double(r.minX), y0: cy - h / 2, x1: Double(r.maxX), y1: cy + h / 2, text: text, conf: conf)
    }

    // ------------------------------------------------------------------ 一张照片从头到尾
    static func read(_ img: UIImage, onStep: @escaping (YCStep) -> Void = { _ in }) async throws -> YCJob {
        try await Task.detached(priority: .userInitiated) {
            await MainActor.run { onStep(.orient) }
            guard let src = YingCunVision.upright(img, maxSide: YingCunVision.work) else { throw YCError.badImage }
            // 四个方向各看一眼（小图、fast）
            var best: (q: Int, score: Double, lines: [Line])?
            var notes: [String] = []
            var scores: [String] = []
            for q in 0..<4 {
                guard let r = YingCunVision.rotate(src, deg: Double(q) * 90, maxSide: 1024) else { continue }
                let lines = (try? YingCunVision.recognize(r, accurate: false)) ?? []
                let s = YingCunVision.score(lines)
                scores.append(String(format: "%.0f", s))
                if best == nil || s > best!.score { best = (q, s, lines) }
            }
            let q = best?.q ?? 0
            let p1 = YingCunVision.skewParts(best?.lines ?? [])
            notes.append("向" + scores.joined(separator: "/") + " 歪1 框\(YingCunVision.deg(p1.quad)) 邻\(YingCunVision.deg(p1.nb))")
            var deg = Double(q) * 90 + (best.map { YingCunVision.skew($0.lines) } ?? 0) * 180 / .pi
            guard var up = YingCunVision.rotate(src, deg: deg) else { throw YCError.badImage }
            await MainActor.run { onStep(.read) }
            var lines = try YingCunVision.recognize(up, accurate: true)
            // 还歪着一度以上（小图看不准）：照大图的字行再转一次
            let p2 = YingCunVision.skewParts(lines)
            notes.append("歪2 框\(YingCunVision.deg(p2.quad)) 邻\(YingCunVision.deg(p2.nb))")
            let more = YingCunVision.skew(lines) * 180 / .pi
            if abs(more) > 1, let again = YingCunVision.rotate(src, deg: deg + more) {
                deg += more
                up = again
                lines = try YingCunVision.recognize(up, accurate: true)
            }
            await MainActor.run { onStep(.check) }
            let found = YingCunVision.items(lines)
            YingCun.prune(found)
            guard let raster = YCRaster(up) else { throw YCError.badImage }
            let job = YCJob(up: raster, items: found, angle: deg)
            job.notes = notes
            return job
        }.value
    }
}
