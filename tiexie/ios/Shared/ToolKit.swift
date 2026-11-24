import SwiftUI
import UIKit
import CoreText

// 工具箱的接口：每个工具自己一个文件夹（Tools/<工具>/），对外只交一个 ToolEntry，登记在 Tools/Registry.swift 一行。
// 工具之间互不引用。134 起每个工具穿自己的皮（照它网页版的长相，写在它自己的文件夹里）；这里只留不管长相的家什：
// 接口、工具自带字体怎么装、顶上那条跟着工具换色。宣纸的东西在 Shared/Theme.swift，铁屑江湖自己的页面用。

struct ToolEntry: Identifiable {
    /// 英文小写，存设置、截图都用它
    let id: String
    let name: String
    /// 工具箱格子里的一句副标题
    let sub: String
    /// SF Symbols 的名字
    let symbol: String
    let make: () -> AnyView
}

/// 工具自己带的字体（放在工具文件夹里，文件名带工具前缀，免得几个工具带同一套字时包里撞名）。
/// 同一款字几个工具都注册也没事：第二次注册报「已有」，字照样能用。
enum ToolFonts {
    nonisolated(unsafe) private static var done = Set<String>()
    private static let lock = NSLock()

    /// files：不带 .ttf 的文件名
    static func register(_ files: [String]) {
        lock.lock()
        defer { lock.unlock() }
        for f in files where !done.contains(f) {
            done.insert(f)
            if let u = Bundle.main.url(forResource: f, withExtension: "ttf") {
                CTFontManagerRegisterFontsForURL(u as CFURL, .process, nil)
            }
        }
    }

    /// 西文、数字用 ps 那款字，中文落到 cjk（苹方），跟网页在 iPhone 上的样子一样。字没装上就退回系统字。
    static func font(_ ps: String, _ size: CGFloat, weight: Font.Weight, cjk: String, condensed: Bool = false) -> Font {
        guard UIFont(name: ps, size: size) != nil else {
            let f = Font.system(size: size, weight: weight)
            return condensed ? f.width(.condensed) : f
        }
        let d = UIFontDescriptor(fontAttributes: [.name: ps, .cascadeList: [UIFontDescriptor(fontAttributes: [.name: cjk])]])
        return Font(UIFont(descriptor: d, size: size) as CTFont)
    }
}

extension View {
    /// 工具页顶上那条：返回键用工具自己的颜色，状态栏深浅跟着工具的底色。退出工具换回铁屑江湖的墨色。
    func toolChrome(tint: Color, dark: Bool) -> some View {
        self
            .tint(tint)
            .toolbarColorScheme(dark ? .dark : .light, for: .navigationBar)
            .background(NavBarTint(color: UIColor(tint)).frame(width: 0, height: 0).accessibilityHidden(true))
    }
}

/// 导航栏的颜色是整个导航栈共用的（铁屑江湖给的是墨色）：工具页出现时换成工具的颜色，走的时候换回去
private struct NavBarTint: UIViewControllerRepresentable {
    var color: UIColor

    func makeUIViewController(context: Context) -> Holder { Holder(color: color) }

    func updateUIViewController(_ vc: Holder, context: Context) {
        vc.color = color
        vc.apply()
    }

    final class Holder: UIViewController {
        var color: UIColor
        private var saved: UIColor?
        private weak var bar: UINavigationBar?

        init(color: UIColor) {
            self.color = color
            super.init(nibName: nil, bundle: nil)
        }

        required init?(coder: NSCoder) { nil }

        override func loadView() {
            view = UIView(frame: .zero)
            view.isUserInteractionEnabled = false
        }

        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            apply()
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            apply()
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            if let bar, let saved { bar.tintColor = saved }
            saved = nil
        }

        func apply() {
            guard let nav = navigationController else { return }
            if saved == nil { saved = nav.navigationBar.tintColor }
            bar = nav.navigationBar
            nav.navigationBar.tintColor = color
        }
    }
}

/// 照直写的按钮：墨框，至少 52 高（铁屑江湖自己的页面用：改秘籍、拍封面）
struct InkButton: View {
    var title: String
    var solid = false
    var danger = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Paper.serif(17, relativeTo: .body))
                .frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(solid ? Paper.paperHi : (danger ? Paper.seal : Paper.ink))
                .background(solid ? Paper.ink : Color.clear, in: RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(danger ? Paper.seal : Paper.ink, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }
}
