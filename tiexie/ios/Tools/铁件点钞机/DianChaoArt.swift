import SwiftUI
import UIKit

// 点钞机的画：七段数码管、糖果圆点、托盘括角、存图那张（照片 + 圆点 + 底下一块数码管面板）。照 0.5.0 的 canvas 画法搬。

enum DCColor {
    static let night = Color(hex: 0x0b0826)
    static let night2 = Color(hex: 0x120d3c)
    static let body = Color(hex: 0x18124a)
    static let body2 = Color(hex: 0x100b35)
    static let blue = Color(hex: 0x3d2bff)
    static let blue2 = Color(hex: 0x5b47ff)
    static let violet = Color(hex: 0x7b4dff)
    static let pink = Color(hex: 0xff8ce0)
    static let red = Color(hex: 0xff4a3d)
    static let lime = Color(hex: 0xdcff5c)
    static let white = Color(hex: 0xf7f5ff)
    static let muted = Color(hex: 0xf7f5ff, alpha: 0.72)
    static let faint = Color(hex: 0xf7f5ff, alpha: 0.48)
    static let glass = Color.white.opacity(0.06)
    static let glassLine = Color.white.opacity(0.11)
    static let warn = Color(hex: 0xffcf5c)
    /// 一盒一个色
    static let trays: [UInt32] = [0xff6fd0, 0xdcff5c, 0x38d8ff, 0xffa63d, 0xb49bff]
}

// ================================================================ 七段数码管
enum Seg {
    static let sw = 7.0, sh = 3.5
    static func h(_ x1: Double, _ x2: Double, _ y: Double) -> [CGPoint] {
        [CGPoint(x: x1, y: y), CGPoint(x: x1 + sh, y: y - sh), CGPoint(x: x2 - sh, y: y - sh), CGPoint(x: x2, y: y), CGPoint(x: x2 - sh, y: y + sh), CGPoint(x: x1 + sh, y: y + sh)]
    }
    static func v(_ x: Double, _ y1: Double, _ y2: Double) -> [CGPoint] {
        [CGPoint(x: x, y: y1), CGPoint(x: x + sh, y: y1 + sh), CGPoint(x: x + sh, y: y2 - sh), CGPoint(x: x, y: y2), CGPoint(x: x - sh, y: y2 - sh), CGPoint(x: x - sh, y: y1 + sh)]
    }
    static let segs: [Character: [CGPoint]] = [
        "a": h(7, 33, 4), "b": v(36, 7, 35), "c": v(36, 39, 67), "d": h(7, 33, 70), "e": v(4, 39, 67), "f": v(4, 7, 35), "g": h(7, 33, 37),
    ]
    static let order: [Character] = ["a", "b", "c", "d", "e", "f", "g"]
    static let glyph: [Character: String] = ["0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg", "5": "acdfg", "6": "acdefg", "7": "abc",
                                             "8": "abcdefg", "9": "abcdfg", "-": "g", "E": "adefg", "r": "eg", " ": ""]
    static let digits = 4

    /// 四位，右对齐
    static func pad(_ s: String) -> [Character] {
        let c = Array(s.suffix(digits))
        return Array(repeating: " ", count: max(0, digits - c.count)) + c
    }

    static func path(_ k: Character, scale: Double, dx: Double = 0, dy: Double = 0) -> Path {
        var p = Path()
        guard let pts = segs[k] else { return p }
        p.addLines(pts.map { CGPoint(x: dx + $0.x * scale, y: dy + $0.y * scale) })
        p.closeSubpath()
        return p
    }
}

/// 一排四位数码管。on(i) 回第 i 位亮哪几段
struct SevenSeg: View {
    var lit: (Int) -> String
    var height: CGFloat = 74

    var body: some View {
        let s = Double(height) / 74
        HStack(spacing: 9 * s) {
            ForEach(0..<Seg.digits, id: \.self) { i in
                let on = lit(i)
                Canvas { ctx, _ in
                    for k in Seg.order {
                        let p = Seg.path(k, scale: s)
                        ctx.fill(p, with: .color(on.contains(k) ? DCColor.lime : DCColor.lime.opacity(0.075)))
                    }
                }
                .frame(width: 40 * s, height: height)
            }
        }
        .shadow(color: DCColor.lime.opacity(0.5), radius: 7)
        .transformEffect(CGAffineTransform(a: 1, b: 0, c: -0.105, d: 1, tx: 0.105 * height / 2, ty: 0))
    }

    static func text(_ s: String) -> (Int) -> String {
        let c = Seg.pad(s)
        return { i in Seg.glyph[c[i]] ?? "" }
    }
}

// ================================================================ 圆点
enum DCDraw {
    static func color(_ i: Int) -> UIColor {
        let h = DCColor.trays[i % DCColor.trays.count]
        return UIColor(red: CGFloat((h >> 16) & 0xff) / 255, green: CGFloat((h >> 8) & 0xff) / 255, blue: CGFloat(h & 0xff) / 255, alpha: 1)
    }

    static func shade(_ c: UIColor) -> UIColor {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return UIColor(red: r * 0.58, green: g * 0.58, blue: b * 0.58, alpha: 1)
    }

    /// 托盘括角（算的盒子）、压暗（不算的盒子），再画前 upto 颗圆点。W、H 是画布大小
    static func dots(_ g: CGContext, trays: [DCTray], W: Double, H: Double, upto: Int = .max) {
        let R = DianChao.radius(trays, w: W, h: H)
        for (i, t) in trays.enumerated() {
            let x = t.box[1] * W / 1000, y = t.box[0] * H / 1000, w = (t.box[3] - t.box[1]) * W / 1000, h = (t.box[2] - t.box[0]) * H / 1000
            if !t.on {
                g.setFillColor(UIColor(red: 8 / 255, green: 5 / 255, blue: 32 / 255, alpha: 0.68).cgColor)
                g.fill(CGRect(x: x, y: y, width: w, height: h))
                continue
            }
            g.setStrokeColor(color(i).cgColor)
            g.setLineWidth(max(3, W / 280))
            g.setLineCap(.round)
            let L = min(w, h) * 0.12
            for (cx, cy, sx, sy) in [(x, y, 1.0, 1.0), (x + w, y, -1, 1), (x, y + h, 1, -1), (x + w, y + h, -1, -1)] {
                g.move(to: CGPoint(x: cx, y: cy + sy * L))
                g.addLine(to: CGPoint(x: cx, y: cy))
                g.addLine(to: CGPoint(x: cx + sx * L, y: cy))
                g.strokePath()
            }
        }
        var n = 0
        for (i, t) in trays.enumerated() where t.on {
            for p in t.pts {
                if n >= upto { return }
                dot(g, x: p.x * W / 1000, y: p.y * H / 1000, r: R, col: color(i), man: p.man, aud: p.aud)
                n += 1
            }
        }
    }

    /// 糖果球：白边（手补的深色边、第二眼补的柠檬绿边）、高光、底下一点影子
    static func dot(_ g: CGContext, x: Double, y: Double, r: Double, col: UIColor, man: Bool, aud: Bool) {
        let shadowR = r + max(2, r * 0.2)
        g.setFillColor(UIColor(red: 5 / 255, green: 3 / 255, blue: 26 / 255, alpha: 0.35).cgColor)
        g.fillEllipse(in: CGRect(x: x - shadowR, y: y + r * 0.12 - shadowR, width: 2 * shadowR, height: 2 * shadowR))
        let ringR = r + max(2, r * 0.17)
        let ring: UIColor = man ? UIColor(red: 0x12 / 255, green: 0x0d / 255, blue: 0x3c / 255, alpha: 1)
            : (aud ? UIColor(red: 0xdc / 255, green: 1, blue: 0x5c / 255, alpha: 1) : UIColor(red: 0xf7 / 255, green: 0xf5 / 255, blue: 1, alpha: 1))
        g.setFillColor(ring.cgColor)
        g.fillEllipse(in: CGRect(x: x - ringR, y: y - ringR, width: 2 * ringR, height: 2 * ringR))
        g.saveGState()
        g.addEllipse(in: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r))
        g.clip()
        let cs = CGColorSpaceCreateDeviceRGB()
        if let grad = CGGradient(colorsSpace: cs, colors: [UIColor.white.cgColor, col.cgColor, shade(col).cgColor] as CFArray, locations: [0, 0.32, 1]) {
            g.drawRadialGradient(grad, startCenter: CGPoint(x: x - r * 0.35, y: y - r * 0.42), startRadius: r * 0.08,
                                 endCenter: CGPoint(x: x, y: y), endRadius: r, options: [.drawsAfterEndLocation])
        }
        g.restoreGState()
    }

    // ------------------------------------------------------------ 存图
    /// 照片 + 圆点，底下接一块数码管面板：数、单位、手改、铭牌、时间、大管家数的
    static func poster(photo: UIImage, run: DCRun, at: Date = Date()) -> UIImage {
        let W = Double(photo.size.width), H = Double(photo.size.height)
        let B = (W * 0.3).rounded(), pad = (W * 0.04).rounded()
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        f.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: W, height: H + B), format: f).image { r in
            let g = r.cgContext
            photo.draw(in: CGRect(x: 0, y: 0, width: W, height: H))
            dots(g, trays: run.trays, W: W, H: H)
            let cs = CGColorSpaceCreateDeviceRGB()
            if let grad = CGGradient(colorsSpace: cs, colors: [UIColor(red: 0x22 / 255, green: 0x1a / 255, blue: 0x63 / 255, alpha: 1).cgColor,
                                                               UIColor(red: 0x10 / 255, green: 0x0b / 255, blue: 0x35 / 255, alpha: 1).cgColor] as CFArray, locations: [0, 1]) {
                g.saveGState()
                g.clip(to: CGRect(x: 0, y: H, width: W, height: B))
                g.drawLinearGradient(grad, start: CGPoint(x: 0, y: H), end: CGPoint(x: 0, y: H + B), options: [])
                g.restoreGState()
            }
            let lx = pad, ly = H + pad, lw = W * 0.62, lh = B - pad * 2
            UIColor(red: 5 / 255, green: 3 / 255, blue: 26 / 255, alpha: 1).setFill()
            UIBezierPath(roundedRect: CGRect(x: lx, y: ly, width: lw, height: lh), cornerRadius: lh * 0.18).fill()
            // 数码管
            let dh = lh * 0.72, s = dh / 74, gap = 9 * s
            let chars = Seg.pad(String(run.total))
            g.saveGState()
            g.translateBy(x: lx + lh * 0.22, y: ly + (lh - dh) / 2)
            g.concatenate(CGAffineTransform(a: 1, b: 0, c: -0.105, d: 1, tx: 0, ty: 0))
            for (i, ch) in chars.enumerated() {
                let on = Seg.glyph[ch] ?? ""
                for k in Seg.order {
                    guard let pts = Seg.segs[k] else { continue }
                    let ox = Double(i) * (40 * s + gap)
                    g.beginPath()
                    for (j, p) in pts.enumerated() {
                        let q = CGPoint(x: ox + p.x * s, y: p.y * s)
                        if j == 0 { g.move(to: q) } else { g.addLine(to: q) }
                    }
                    g.closePath()
                    if on.contains(k) {
                        g.setShadow(offset: .zero, blur: dh * 0.12, color: UIColor(red: 0xdc / 255, green: 1, blue: 0x5c / 255, alpha: 0.75).cgColor)
                        g.setFillColor(UIColor(red: 0xdc / 255, green: 1, blue: 0x5c / 255, alpha: 1).cgColor)
                    } else {
                        g.setShadow(offset: .zero, blur: 0, color: nil)
                        g.setFillColor(UIColor(red: 0xdc / 255, green: 1, blue: 0x5c / 255, alpha: 0.08).cgColor)
                    }
                    g.fillPath()
                }
            }
            g.restoreGState()
            let dw = Double(Seg.digits) * (40 * s + gap)
            let fz = (lh * 0.2).rounded()
            let tx = lx + lh * 0.22 + dw + fz * 0.3
            let lime = UIColor(red: 0xdc / 255, green: 1, blue: 0x5c / 255, alpha: 1)
            (DianChaoStrings.unit as NSString).draw(at: CGPoint(x: tx, y: ly + lh * 0.16), withAttributes: [.font: UIFont.systemFont(ofSize: fz, weight: .black), .foregroundColor: lime])
            if let ed = run.editedText {
                (ed as NSString).draw(at: CGPoint(x: tx, y: ly + lh * 0.66), withAttributes: [.font: UIFont.systemFont(ofSize: (fz * 0.7).rounded(), weight: .bold),
                                                                                             .foregroundColor: UIColor(red: 1, green: 0x8c / 255, blue: 0xe0 / 255, alpha: 1)])
            }
            let df = DateFormatter()
            df.dateFormat = "yyyy-MM-dd HH:mm"
            let rx = W - pad
            func right(_ s: String, _ y: Double, _ font: UIFont, _ c: UIColor) {
                let a: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: c]
                let w = (s as NSString).size(withAttributes: a).width
                (s as NSString).draw(at: CGPoint(x: rx - w, y: y), withAttributes: a)
            }
            right(DianChaoStrings.imgBrand, ly + lh * 0.1, UIFont.systemFont(ofSize: (fz * 0.95).rounded(), weight: .heavy), UIColor(red: 0xf7 / 255, green: 0xf5 / 255, blue: 1, alpha: 1))
            let soft = UIColor(red: 0xf7 / 255, green: 0xf5 / 255, blue: 1, alpha: 0.7)
            right(df.string(from: at), ly + lh * 0.44, UIFont.monospacedDigitSystemFont(ofSize: (fz * 0.78).rounded(), weight: .semibold), soft)
            right(run.byAI ? DianChaoStrings.byAI : DianChaoStrings.byButler, ly + lh * 0.68, UIFont.systemFont(ofSize: (fz * 0.72).rounded(), weight: .semibold), soft)
        }
    }
}

// ================================================================ 取景器里的演示托盘
/// 两列六排，十块板子，圆点一颗颗亮（照 0.5.0 的 SVG）
struct DemoTray: View {
    static let filled: [(Int, Int)] = [(0, 0), (0, 1), (0, 2), (0, 3), (0, 5), (1, 0), (1, 2), (1, 3), (1, 4), (1, 5)]
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduce)) { t in
            Canvas { ctx, size in
                let k = size.width / 320
                ctx.translateBy(x: size.width / 2, y: size.height / 2)
                ctx.rotate(by: .degrees(-6))
                ctx.scaleBy(x: k, y: k)
                ctx.translateBy(x: -160, y: -100)
                ctx.fill(Path(roundedRect: CGRect(x: 34, y: 14, width: 252, height: 172), cornerRadius: 18), with: .color(Color(hex: 0x0c0736)))
                ctx.stroke(Path(roundedRect: CGRect(x: 34, y: 14, width: 252, height: 172), cornerRadius: 18), with: .color(.white.opacity(0.12)), lineWidth: 1.2)
                ctx.fill(Path(roundedRect: CGRect(x: 157, y: 24, width: 6, height: 152), cornerRadius: 3), with: .color(Color(hex: 0x160f4c)))
                for r in 0..<6 {
                    for c in 0..<2 {
                        ctx.fill(Path(roundedRect: CGRect(x: c == 1 ? 172 : 50, y: 31 + Double(r) * 24, width: 98, height: 15), cornerRadius: 7.5), with: .color(Color(hex: 0x06041d)))
                    }
                }
                for (c, r) in Self.filled {
                    let x = c == 1 ? 172.0 : 50.0, y = 31 + Double(r) * 24
                    ctx.fill(Path(roundedRect: CGRect(x: x + 4, y: y + 2.5, width: 90, height: 10), cornerRadius: 5),
                             with: .linearGradient(Gradient(colors: [.white, Color(hex: 0xb9b3dc)]), startPoint: CGPoint(x: x, y: y + 2.5), endPoint: CGPoint(x: x, y: y + 12.5)))
                    ctx.fill(Path(ellipseIn: CGRect(x: x + 10, y: y + 5.5, width: 4, height: 4)), with: .color(Color(hex: 0x0c0736)))
                    ctx.fill(Path(ellipseIn: CGRect(x: x + 84, y: y + 5.5, width: 4, height: 4)), with: .color(Color(hex: 0x0c0736)))
                }
                // 0.7 秒后一颗颗亮（0.21 秒一颗），亮完停 2.6 秒再来
                let cycle = 0.7 + 0.21 * Double(Self.filled.count) + 2.6
                let e = reduce ? cycle : t.date.timeIntervalSince(start).truncatingRemainder(dividingBy: cycle)
                for (i, (c, r)) in Self.filled.enumerated() {
                    let on = e - 0.7 - 0.21 * Double(i)
                    if on < 0 { continue }
                    let sc = min(1, on / 0.28)
                    let pop = sc < 1 ? sc * (1 + 0.25 * sin(sc * .pi)) : 1
                    let cx = (c == 1 ? 172.0 : 50.0) + 49, cy = 31 + Double(r) * 24 + 7.5, rr = 7 * pop
                    ctx.fill(Path(ellipseIn: CGRect(x: cx - rr - 1.8, y: cy - rr - 1.8, width: 2 * rr + 3.6, height: 2 * rr + 3.6)), with: .color(.white))
                    ctx.fill(Path(ellipseIn: CGRect(x: cx - rr, y: cy - rr, width: 2 * rr, height: 2 * rr)),
                             with: .radialGradient(Gradient(stops: [.init(color: .white, location: 0), .init(color: Color(hex: 0xff6fd0), location: 0.34), .init(color: Color(hex: 0x8f3a78), location: 1)]),
                                                   center: CGPoint(x: cx - rr * 0.28, y: cy - rr * 0.4), startRadius: 0, endRadius: rr * 1.6))
                }
            }
        }
    }
}
