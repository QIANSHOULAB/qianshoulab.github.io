import SwiftUI
import UIKit

// 宣纸底：颜色、字、纸纹都照网站 tiexie/index.html 的样式表。只做亮色一套（网站就一套），不跟系统暗色走。
// 工具箱里的工具也用这里的东西，所以放 Shared。

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xff) / 255,
                  green: Double((hex >> 8) & 0xff) / 255,
                  blue: Double(hex & 0xff) / 255,
                  opacity: alpha)
    }
}

enum Paper {
    static let paper = Color(hex: 0xebe2cc)
    static let paperHi = Color(hex: 0xf4eddd)
    static let ink = Color(hex: 0x1e1b17)
    static let inkSoft = Color(hex: 0x5d5346)
    static let rule = Color(hex: 0x7d6d55)
    static let indigo = Color(hex: 0x25314b)
    static let label = Color(hex: 0xf1e9d6)
    static let seal = Color(hex: 0xb3352b)
    static let wash = Color(hex: 0x1e1b17, alpha: 0.065)
    static let field = Color(hex: 0xfffcf4, alpha: 0.65)

    /// 毛笔字（Ma Shan Zheng），跟着系统字号走
    static func brush(_ size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom("Ma Shan Zheng", size: size, relativeTo: style)
    }

    /// 正文（Noto Serif SC），跟着系统字号走
    static func serif(_ size: CGFloat = 16, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom("Noto Serif SC", size: size, relativeTo: style)
    }

    static func mono(_ size: CGFloat = 14) -> Font {
        .system(size: size, design: .monospaced)
    }

    /// 包里的背景小人、招式图（ink/*.webp、wulin-ink.webp）
    static func bundled(_ path: String) -> UIImage? {
        if let hit = cache.object(forKey: path as NSString) { return hit }
        let url = Bundle.main.bundleURL.appendingPathComponent(path)
        guard let img = UIImage(contentsOfFile: url.path) else { return nil }
        cache.setObject(img, forKey: path as NSString)
        return img
    }

    private static let cache = NSCache<NSString, UIImage>()

    /// 纸纹：一小块随机颗粒，平铺
    static let grain: UIImage = {
        let n = 160
        var rng = SystemRandomNumberGenerator()
        let r = UIGraphicsImageRenderer(size: CGSize(width: n, height: n), format: {
            let f = UIGraphicsImageRendererFormat()
            f.scale = 1
            f.opaque = false
            return f
        }())
        return r.image { ctx in
            let c = ctx.cgContext
            for _ in 0..<(n * n / 3) {
                let x = Int.random(in: 0..<n, using: &rng), y = Int.random(in: 0..<n, using: &rng)
                let a = CGFloat.random(in: 0.02...0.09, using: &rng)
                c.setFillColor(UIColor(red: 0.32, green: 0.26, blue: 0.17, alpha: a).cgColor)
                c.fill(CGRect(x: x, y: y, width: 1, height: 1))
            }
        }
    }()
}

/// 整页的宣纸底：纸色 + 纸纹 + 中间亮一点、四角暗一点 + 淡淡的一张武林群像
struct PaperBackground: View {
    var showFigures: Bool = true

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Paper.paper
                Image(uiImage: Paper.grain)
                    .resizable(resizingMode: .tile)
                RadialGradient(colors: [Color(hex: 0xfff9e8, alpha: 0.6), .clear], center: UnitPoint(x: 0.5, y: 0.35),
                               startRadius: 0, endRadius: max(geo.size.width, geo.size.height) * 0.62)
                RadialGradient(colors: [.clear, Color(hex: 0x5c4626, alpha: 0.15)], center: .center,
                               startRadius: max(geo.size.width, geo.size.height) * 0.3,
                               endRadius: max(geo.size.width, geo.size.height) * 0.6)
                if showFigures, let img = Paper.bundled("wulin-ink.webp") {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFit()
                        .frame(width: geo.size.width)
                        .position(x: geo.size.width / 2, y: geo.size.height * 0.38)
                        .opacity(0.15)
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

/// 四周双边的版框
struct DoubleFrame: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color(hex: 0xfffaee, alpha: 0.3))
            .overlay(
                ZStack {
                    Rectangle().strokeBorder(Paper.rule, lineWidth: 3)
                    Rectangle().inset(by: 6).strokeBorder(Paper.rule, lineWidth: 1)
                }
                .allowsHitTesting(false)
            )
    }
}

extension View {
    func doubleFrame() -> some View { modifier(DoubleFrame()) }

    /// 宣纸页：底 + 墨色字
    func paperPage(figures: Bool = true) -> some View {
        self
            .foregroundStyle(Paper.ink)
            .tint(Paper.ink)
            .background(PaperBackground(showFigures: figures))
    }
}

/// 印章：两字一列，从右往左读
struct Seal: View {
    var text: String
    var side: CGFloat = 46
    var fontSize: CGFloat = 17
    var rotate: Double = -4

    var body: some View {
        let letters = Array(text)
        let cols = stride(from: 0, to: letters.count, by: 2).map { Array(letters[$0..<min($0 + 2, letters.count)]) }
        HStack(spacing: 2) {
            ForEach(Array(cols.enumerated().reversed()), id: \.offset) { _, col in
                VStack(spacing: 0) {
                    ForEach(Array(col.enumerated()), id: \.offset) { _, ch in
                        Text(String(ch)).font(.custom("Ma Shan Zheng", size: fontSize)).lineLimit(1)
                    }
                }
            }
        }
        .foregroundStyle(Paper.paperHi)
        .frame(width: side, height: side)
        .background(
            RoundedRectangle(cornerRadius: side * 0.09)
                .fill(Paper.seal)
                .overlay(RoundedRectangle(cornerRadius: side * 0.09).inset(by: 1).stroke(Paper.paperHi.opacity(0.5), lineWidth: 2))
        )
        .rotationEffect(.degrees(rotate))
        .opacity(0.93)
        .accessibilityHidden(true)
    }
}

/// 背景里的招式小人（ink/*.webp），淡淡一层
struct InkFigure: View {
    var name: String
    var opacity: Double = 0.1
    var flip = false

    var body: some View {
        if let img = Paper.bundled("ink/\(name).webp") {
            Image(uiImage: img)
                .resizable()
                .scaledToFit()
                .scaleEffect(x: flip ? -1 : 1, y: 1)
                .opacity(opacity)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}
