import SwiftUI
import UIKit

// 封面：有图用图；没图用代码画一本靛蓝线装书（照网站 .book 那套：题签、四眼订线、印章）。

struct DrawnBook: View {
    var title: String
    var sealText: String = "铁屑"

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            let chars = Array(title)
            let n = CGFloat(max(4, chars.count))
            let fs = min(w * 0.10, w * 0.76 / n)
            ZStack(alignment: .topLeading) {
                // 布面
                Paper.indigo
                Image(uiImage: DrawnBook.cloth).resizable(resizingMode: .tile).opacity(0.9)
                LinearGradient(stops: [.init(color: .white.opacity(0.06), location: 0), .init(color: .clear, location: 0.4),
                                       .init(color: .black.opacity(0.2), location: 1)],
                               startPoint: .leading, endPoint: .trailing)
                RadialGradient(colors: [.white.opacity(0.08), .clear], center: UnitPoint(x: 0.18, y: 0.1), startRadius: 0, endRadius: w * 0.7)
                RadialGradient(colors: [.black.opacity(0.3), .clear], center: UnitPoint(x: 0.92, y: 1), startRadius: 0, endRadius: w * 0.7)
                // 题签
                ZStack {
                    Paper.label
                    Image(uiImage: Paper.grain).resizable(resizingMode: .tile)
                    Rectangle().inset(by: w * 0.02).stroke(Paper.ink.opacity(0.4), lineWidth: 1)
                    VStack(spacing: 0) {
                        ForEach(Array(chars.enumerated()), id: \.offset) { _, c in
                            Text(String(c)).font(.custom("Ma Shan Zheng", size: fs)).foregroundStyle(Paper.ink)
                                .frame(height: fs * 1.06)
                        }
                    }
                    .padding(.vertical, w * 0.03)
                }
                .frame(width: w * 0.21, height: h * 0.64)
                .shadow(color: .black.opacity(0.25), radius: 1, y: 1)
                .offset(x: w * 0.11, y: h * 0.07)
                // 订线
                ZStack(alignment: .topLeading) {
                    LinearGradient(colors: [.black.opacity(0.14), .white.opacity(0.03)], startPoint: .leading, endPoint: .trailing)
                    Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1)
                    let bw = w * 0.11
                    Rectangle().fill(Color(hex: 0xe4d8bc, alpha: 0.72)).frame(width: 1.5, height: h * 0.82)
                        .offset(x: bw * 0.38, y: h * 0.09)
                    ForEach([0.09, 0.36, 0.64, 0.91], id: \.self) { t in
                        ZStack(alignment: .leading) {
                            Rectangle().fill(Color(hex: 0xe4d8bc, alpha: 0.78)).frame(width: bw * 0.62, height: 1.5)
                            Circle().fill(Color(hex: 0x0c0f18, alpha: 0.9)).frame(width: 5, height: 5)
                                .overlay(Circle().stroke(Color(hex: 0xe4d8bc, alpha: 0.5), lineWidth: 1))
                                .offset(x: -2)
                        }
                        .offset(x: bw * 0.38, y: h * t)
                    }
                }
                .frame(width: w * 0.11, height: h)
                .offset(x: w * 0.89)
                // 印章
                Seal(text: sealText, side: w * 0.13, fontSize: w * 0.054, rotate: 0)
                    .offset(x: w * 0.15, y: h * 0.75)
            }
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 3, bottomLeadingRadius: 3, bottomTrailingRadius: 5, topTrailingRadius: 5))
        }
        .aspectRatio(3 / 4, contentMode: .fit)
        .shadow(color: Color(hex: 0x30220e, alpha: 0.45), radius: 13, x: 0, y: 12)
        .accessibilityLabel("《\(title)》书皮")
    }

    /// 布纹
    static let cloth: UIImage = {
        let n = 120
        var rng = SystemRandomNumberGenerator()
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        f.opaque = false
        return UIGraphicsImageRenderer(size: CGSize(width: n, height: n), format: f).image { ctx in
            for _ in 0..<(n * n / 3) {
                let x = Int.random(in: 0..<n, using: &rng), y = Int.random(in: 0..<n, using: &rng)
                ctx.cgContext.setFillColor(UIColor(red: 0.86, green: 0.87, blue: 0.92, alpha: CGFloat.random(in: 0.03...0.12, using: &rng)).cgColor)
                ctx.cgContext.fill(CGRect(x: x, y: y, width: 1, height: 1))
            }
        }
    }()
}

/// 封面：有图用图（本地、包里、没有就去网上拉），没图画书
struct CoverView: View {
    @EnvironmentObject var store: Store
    var title: String
    var img: String

    var body: some View {
        let _ = store.imageTick
        if !img.isEmpty, let ui = store.image(img) {
            Color.clear
                .aspectRatio(3 / 4, contentMode: .fit)
                .overlay(Image(uiImage: ui).resizable().scaledToFill())
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .shadow(color: Color(hex: 0x30220e, alpha: 0.45), radius: 13, x: 0, y: 12)
                .accessibilityLabel("《\(title)》封面")
        } else {
            DrawnBook(title: title, sealText: String(store.data.site.name.prefix(2)))
        }
    }
}

/// 左右按比例分（目录 37%，封面那边 63%），高度取两边高的
struct Split: Layout {
    var ratio: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? 360
        var h: CGFloat = 0
        for (i, s) in subviews.enumerated() {
            let sw = i == 0 ? w * ratio : w * (1 - ratio)
            h = max(h, s.sizeThatFits(ProposedViewSize(width: sw, height: nil)).height)
        }
        return CGSize(width: w, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let w = bounds.width
        for (i, s) in subviews.enumerated() {
            let x = i == 0 ? bounds.minX : bounds.minX + w * ratio
            let sw = i == 0 ? w * ratio : w * (1 - ratio)
            s.place(at: CGPoint(x: x, y: bounds.minY), proposal: ProposedViewSize(width: sw, height: bounds.height))
        }
    }
}
