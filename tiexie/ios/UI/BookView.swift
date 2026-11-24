import SwiftUI
import UIKit

// 一本秘籍（照网站 bookPage()）：《书名》，四周双边的版框里是自动排好的正文；布阵图是一张张详细图，点了全屏、双指放大。

struct BookView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    var id: String
    @State private var zoom: ZoomItem?

    struct ZoomItem: Identifiable { var id: String { path }; var path: String }

    var body: some View {
        let book = store.data.book(id)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let b = book {
                    Text("《\(b.title)》")
                        .font(Paper.brush(34, relativeTo: .largeTitle))
                        .fixedSize(horizontal: false, vertical: true)
                    VStack(alignment: .leading, spacing: 0) {
                        if b.cat == .buzhen {
                            plates(b)
                        } else {
                            TypesetView(text: b.body)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 22)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .doubleFrame()
                } else {
                    Text("这本已经不在了。").font(Paper.serif()).foregroundStyle(Paper.inkSoft).padding(.top, 40)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 56)
        }
        .paperPage()
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            if book != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("改") { nav.editing = .book(id) }
                }
            }
        }
        .fullScreenCover(item: $zoom) { z in
            ZoomView(image: store.image(z.path)) { zoom = nil }
        }
    }

    @ViewBuilder
    private func plates(_ b: Book) -> some View {
        if b.plates.isEmpty {
            Text("还没有图纸。").font(Paper.serif(13, relativeTo: .footnote)).foregroundStyle(Paper.inkSoft)
        } else {
            VStack(spacing: 12) {
                let _ = store.imageTick
                ForEach(Array(b.plates.enumerated()), id: \.offset) { i, p in
                    Button { zoom = ZoomItem(path: p) } label: {
                        if let ui = store.image(p) {
                            Image(uiImage: ui).resizable().scaledToFit().frame(maxWidth: .infinity)
                        } else {
                            Rectangle().fill(Paper.wash).aspectRatio(4 / 3, contentMode: .fit)
                                .overlay(Text("图还在路上").font(Paper.serif(13)).foregroundStyle(Paper.inkSoft))
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("全屏查看第 \(i + 1) 张")
                }
            }
        }
    }
}

/// 正文：照 Typeset 排出来的块画
struct TypesetView: View {
    var text: String

    var body: some View {
        let blocks = Typeset.blocks(text)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { i, b in
                switch b {
                case .heading(let s):
                    Text(s)
                        .font(Paper.brush(23, relativeTo: .title3))
                        .padding(.top, i == 0 ? 0 : 22)
                        .padding(.bottom, 6)
                        .fixedSize(horizontal: false, vertical: true)
                case .para(let lead, let t):
                    Group {
                        if let lead {
                            Text(lead).font(Paper.serif(16).weight(.bold)) + Text(t).font(Paper.serif(16))
                        } else {
                            Text(t).font(Paper.serif(16))
                        }
                    }
                    .lineSpacing(5)
                    .padding(.bottom, 6)
                    .fixedSize(horizontal: false, vertical: true)
                case .code(let lines):
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(lines.enumerated()), id: \.offset) { _, l in
                            VStack(alignment: .leading, spacing: 1) {
                                Text(l.code).font(Paper.mono(14)).textSelection(.enabled)
                                    .fixedSize(horizontal: false, vertical: true)
                                if !l.note.isEmpty {
                                    Text(l.note).font(Paper.serif(13, relativeTo: .footnote)).foregroundStyle(Paper.inkSoft)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Paper.wash, in: RoundedRectangle(cornerRadius: 3))
                    .padding(.top, 6)
                    .padding(.bottom, 4)
                case .gap:
                    Color.clear.frame(height: 10)
                }
            }
        }
    }
}

/// 全屏看图：双指放大（1～5 倍）、拖动、双击放大 / 还原
struct ZoomView: View {
    var image: UIImage?
    var close: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color(hex: 0x120e0a, alpha: 0.94).ignoresSafeArea()
            if let image {
                ZoomScroll(image: image).ignoresSafeArea()
            }
            Button(action: close) {
                Text("关闭").font(Paper.serif(16))
                    .foregroundStyle(Paper.paperHi)
                    .padding(.horizontal, 14)
                    .frame(minWidth: 44, minHeight: 44)
                    .background(Color(hex: 0x14100c, alpha: 0.55), in: RoundedRectangle(cornerRadius: 4))
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(Paper.paperHi.opacity(0.75)))
            }
            .padding(10)
        }
    }
}

struct ZoomScroll: UIViewRepresentable {
    var image: UIImage

    /// 没放大时图片铺满整屏（按比例）
    final class Scroll: UIScrollView {
        var imageView: UIImageView?
        override func layoutSubviews() {
            super.layoutSubviews()
            if zoomScale == 1, let iv = imageView, iv.frame != bounds { iv.frame = bounds }
        }
    }

    func makeUIView(context: Context) -> UIScrollView {
        let s = Scroll()
        s.minimumZoomScale = 1
        s.maximumZoomScale = 5
        s.bouncesZoom = true
        s.showsVerticalScrollIndicator = false
        s.showsHorizontalScrollIndicator = false
        s.backgroundColor = .clear
        s.delegate = context.coordinator
        let iv = UIImageView(image: image)
        iv.contentMode = .scaleAspectFit
        iv.isUserInteractionEnabled = true
        s.addSubview(iv)
        s.imageView = iv
        context.coordinator.imageView = iv
        let dbl = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.double(_:)))
        dbl.numberOfTapsRequired = 2
        s.addGestureRecognizer(dbl)
        return s
    }

    func updateUIView(_ s: UIScrollView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        var imageView: UIImageView?

        func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

        @objc func double(_ g: UITapGestureRecognizer) {
            guard let s = g.view as? UIScrollView else { return }
            if s.zoomScale > 1 {
                s.setZoomScale(1, animated: true)
            } else {
                let p = g.location(in: imageView)
                let w = s.bounds.width / 2.5, h = s.bounds.height / 2.5
                s.zoom(to: CGRect(x: p.x - w / 2, y: p.y - h / 2, width: w, height: h), animated: true)
            }
        }
    }
}
