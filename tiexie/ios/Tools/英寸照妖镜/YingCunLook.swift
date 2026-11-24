import SwiftUI
import UIKit

// 英寸照妖镜的长相：照 gongshi 网页 inch/index.html 的深色工单皮（134，Song：工具就用它原来的样子，不套铁屑江湖的皮）。
// 颜色、字号、圆角、间距都抄网页的样式表；网页只有深色一套，这里也只有一套。
// 字：西文和数字用网页同款 Barlow / Barlow Condensed（OFL，文件在 Barlow/，带 YingCun- 前缀），中文落到苹方，跟网页在 iPhone 上一样。

enum YC {
    static let bg = Color(hex: 0x0e141c)
    static let surface = Color(hex: 0x172030)
    static let surface2 = Color(hex: 0x1c2738)
    static let ink = Color(hex: 0xe5eaf1)
    static let muted = Color(hex: 0x9aa7b8)
    static let faint = Color(hex: 0x5c6a7d)
    static let line = Color(hex: 0x273347)
    static let fieldLine = Color(hex: 0x3a4a60)
    static let accent = Color(hex: 0x86aee6)
    static let onAccent = Color(hex: 0x0e141c)
    static let ok = Color(hex: 0x6fd3a0)
    static let flag = Color(hex: 0xffd60a)
    static let warn = Color(hex: 0xf08a5d)
    static let prevRed = Color(hex: 0xff6b6b)

    private static let ready: Void = ToolFonts.register(["YingCun-Barlow-Medium", "YingCun-Barlow-SemiBold", "YingCun-Barlow-Bold",
                                                         "YingCun-BarlowCondensed-Bold"])

    /// 正文字（网页 --font-ui：Barlow，中文苹方）。500 / 600 / 700
    static func ui(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        _ = ready
        switch weight {
        case .bold, .heavy, .black: return ToolFonts.font("Barlow-Bold", size, weight: .bold, cjk: "PingFangSC-Semibold")
        case .semibold: return ToolFonts.font("Barlow-SemiBold", size, weight: .semibold, cjk: "PingFangSC-Semibold")
        default: return ToolFonts.font("Barlow-Medium", size, weight: .medium, cjk: "PingFangSC-Medium")
        }
    }

    /// 数字字（网页 --font-num：Barlow Condensed 700）
    static func num(_ size: CGFloat) -> Font {
        _ = ready
        return ToolFonts.font("BarlowCondensed-Bold", size, weight: .bold, cjk: "PingFangSC-Semibold", condensed: true)
    }

    /// 包里的图（镜子那几层 zhaoyao-*.webp）
    static func image(_ name: String) -> UIImage? {
        if let hit = cache.object(forKey: name as NSString) { return hit }
        guard let img = UIImage(contentsOfFile: Bundle.main.bundleURL.appendingPathComponent(name).path) else { return nil }
        cache.setObject(img, forKey: name as NSString)
        return img
    }

    private static let cache = NSCache<NSString, UIImage>()
}

/// 网页 .btn：58 高、15 圆角；primary 亮蓝实底，ghost 细框
struct YCButton<Label: View>: View {
    var primary = false
    var height: CGFloat = 52
    var action: () -> Void
    @ViewBuilder var label: () -> Label

    var body: some View {
        Button(action: action) {
            label()
                .font(YC.ui(16, .bold))
                .foregroundStyle(primary ? YC.onAccent : YC.ink)
                .frame(maxWidth: .infinity, minHeight: height)
                .background(primary ? YC.accent : Color.clear, in: RoundedRectangle(cornerRadius: 15))
                .overlay(RoundedRectangle(cornerRadius: 15).strokeBorder(primary ? Color.clear : YC.fieldLine, lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(YCPress())
    }
}

/// 网页按钮按下去缩一点（.97），松手弹回；不能按的时候淡到 .45
struct YCPress: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(enabled ? 1 : 0.45)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// 网页 .spore：镜子四周 24 颗萤火，慢慢往上飘；照妖的时候停住
struct YCSpores: View {
    var side: CGFloat
    var paused: Bool

    private struct Spore {
        var x: CGFloat, y: CGFloat, dur: Double, delay: Double, kind: Int
    }

    /// 网页用 rng(1959) 撒的；这里同样撒在半径 27%–46% 的圈上，不往镜子底下的字那边去
    private static let spores: [Spore] = {
        var s: UInt64 = 1959
        func r() -> Double {
            s = s &* 6364136223846793005 &+ 1442695040888963407
            return Double(s >> 11) / Double(1 << 53)
        }
        return (0..<24).map { i in
            var a = r() * .pi * 2
            if sin(a) > 0.55 { a = -a }
            let rr = 27 + r() * 19
            // 网页 :nth-child(3n+1) 走 drift-b，(3n+2) 走 drift-c（小一号），其余 drift-a
            let kind = i % 3 == 0 ? 1 : (i % 3 == 1 ? 2 : 0)
            return Spore(x: 0.5 + cos(a) * rr / 100, y: 0.5 + sin(a) * rr / 100, dur: 6 + r() * 5, delay: r() * 10, kind: kind)
        }
    }()

    var body: some View {
        TimelineView(.animation(paused: paused)) { tl in
            Canvas { ctx, size in
                let now = tl.date.timeIntervalSinceReferenceDate
                for s in Self.spores {
                    let t = ((now + s.delay).truncatingRemainder(dividingBy: s.dur)) / s.dur
                    let (dx, dy, sc, op) = Self.frame(kind: s.kind, t: t)
                    guard op > 0.01 else { continue }
                    let c = CGPoint(x: s.x * size.width + dx, y: s.y * size.height + dy)
                    let core = (s.kind == 2 ? 1.0 : 1.5) * sc
                    let glow = Path(ellipseIn: CGRect(x: c.x - 6, y: c.y - 6, width: 12, height: 12))
                    // 网页：本身 hsl(214 100% 88%)，外面一圈 hsla(214 100% 72% / .85) 的光
                    ctx.fill(glow, with: .radialGradient(Gradient(colors: [Color(hex: 0x70aeff, alpha: 0.85 * op), Color(hex: 0x70aeff, alpha: 0)]),
                                                         center: c, startRadius: core, endRadius: 6))
                    ctx.fill(Path(ellipseIn: CGRect(x: c.x - core, y: c.y - core, width: core * 2, height: core * 2)),
                             with: .color(Color(hex: 0xc2dcff, alpha: op)))
                }
            }
        }
        .frame(width: side, height: side)
        .allowsHitTesting(false)
    }

    /// 网页 drift-a / drift-b / drift-c 三种飘法：位移、缩放、透明度
    private static func frame(kind: Int, t: Double) -> (CGFloat, CGFloat, CGFloat, Double) {
        func lerp(_ a: Double, _ b: Double, _ u: Double) -> Double { a + (b - a) * u }
        func keys(_ k: [(Double, Double)], _ t: Double) -> Double {
            for i in 1..<k.count where t <= k[i].0 {
                return lerp(k[i - 1].1, k[i].1, (t - k[i - 1].0) / (k[i].0 - k[i - 1].0))
            }
            return k.last!.1
        }
        let e = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2   // ease-in-out
        switch kind {
        case 1:   // drift-b（nth-child 3n+1）
            return (CGFloat(-18 * e), CGFloat(-38 * e), CGFloat(lerp(0.6, 1.1, e)), keys([(0, 0), (0.3, 0.8), (0.7, 0.6), (1, 0)], t))
        case 2:   // drift-c（3n+2，小一号）
            return (CGFloat(6 * e), CGFloat(-58 * e), 1, keys([(0, 0), (0.35, 1), (0.65, 0.7), (1, 0)], t))
        default:  // drift-a
            return (CGFloat(14 * e), CGFloat(-46 * e), CGFloat(lerp(0.5, 1, e)), keys([(0, 0), (0.25, 0.95), (0.75, 0.5), (1, 0)], t))
        }
    }
}
