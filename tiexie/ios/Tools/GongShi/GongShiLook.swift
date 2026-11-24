import SwiftUI

// 工时榨汁机的长相：照 gongshi 网页 index.html 的深色工单皮（134，Song：工具就用它原来的样子，不套铁屑江湖的皮）。
// 颜色、字号、圆角、间距都抄网页的样式表；网页只有深色一套，这里也只有一套。
// 字：西文和数字用网页同款 Barlow / Barlow Condensed（OFL，文件在 Barlow/，带 GongShi- 前缀），中文落到苹方，跟网页在 iPhone 上一样。

enum GS {
    static let bg = Color(hex: 0x0e141c)
    static let surface = Color(hex: 0x172030)
    static let ink = Color(hex: 0xe5eaf1)
    static let muted = Color(hex: 0x9aa7b8)
    static let faint = Color(hex: 0x5c6a7d)
    static let line = Color(hex: 0x273347)
    static let fieldLine = Color(hex: 0x3a4a60)
    static let accent = Color(hex: 0x86aee6)
    static let onAccent = Color(hex: 0x0e141c)
    static let band = Color(hex: 0x1f3556)
    static let bandInk = Color(hex: 0xf2f5f9)
    static let bandMuted = Color(hex: 0xa9bbd3)
    static let deduct = Color(hex: 0xe0b25a)
    static let warn = Color(hex: 0xf08a5d)
    static let knob = Color(hex: 0xe5eaf1)

    private static let ready: Void = ToolFonts.register(["GongShi-Barlow-Medium", "GongShi-Barlow-Bold",
                                                         "GongShi-BarlowCondensed-Bold", "GongShi-BarlowCondensed-ExtraBold"])

    /// 正文字（网页 --font-ui：Barlow，中文苹方）。bold = 700，不然 500
    static func ui(_ size: CGFloat, bold: Bool = false) -> Font {
        _ = ready
        return bold ? ToolFonts.font("Barlow-Bold", size, weight: .bold, cjk: "PingFangSC-Semibold")
                    : ToolFonts.font("Barlow-Medium", size, weight: .medium, cjk: "PingFangSC-Medium")
    }

    /// 数字字（网页 --font-num：Barlow Condensed）。heavy = 800，不然 700
    static func num(_ size: CGFloat, heavy: Bool = false) -> Font {
        _ = ready
        return ToolFonts.font(heavy ? "BarlowCondensed-ExtraBold" : "BarlowCondensed-Bold", size,
                              weight: heavy ? .heavy : .bold, cjk: "PingFangSC-Semibold", condensed: true)
    }
}

/// 网页的 .card / .ledger：深一档的底、1px 细线、12 圆角
struct GSCard<Content: View>: View {
    var padding: EdgeInsets
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content() }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(GS.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(GS.line, lineWidth: 1))
    }
}

/// 网页 .time：时间框。大的 54 高 34 号字、靠左；小的（.time.sm）40 高 21 号字、居中
struct GSTimeField: View {
    var placeholder: String
    @Binding var text: String
    var small = false
    var bad = false
    var focused = false

    var body: some View {
        TextField("", text: $text, prompt: Text(placeholder).foregroundColor(GS.faint))
            .keyboardType(.numberPad)
            .multilineTextAlignment(small ? .center : .leading)
            .font(GS.num(small ? 21 : 34))
            .monospacedDigit()
            .tracking(small ? 0.42 : 0.68)
            .foregroundStyle(GS.ink)
            .autocorrectionDisabled()
            .padding(.horizontal, small ? 2 : 12)
            .frame(height: small ? 40 : 54)
            .background(GS.surface, in: RoundedRectangle(cornerRadius: small ? 6 : 8))
            .overlay(RoundedRectangle(cornerRadius: small ? 6 : 8).strokeBorder(bad ? GS.warn : GS.fieldLine, lineWidth: 1))
            .overlay(RoundedRectangle(cornerRadius: (small ? 6 : 8) + 1).stroke(bad ? GS.warn : GS.accent, lineWidth: 2).padding(-2).opacity(focused ? 1 : 0))
    }
}

/// 网页按下去往下沉 1px
struct GSPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.offset(y: configuration.isPressed ? 1 : 0)
    }
}

/// 网页 .ghost：透明底、细框、40 高
struct GSGhost: View {
    var title: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(GS.ui(15, bold: true)).foregroundStyle(GS.ink).lineLimit(1).minimumScaleFactor(0.8)
                .padding(.horizontal, 6)
                .frame(maxWidth: .infinity, minHeight: 40)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(GS.fieldLine, lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(GSPress())
    }
}

/// 网页的开关：50 × 30 的槽，24 的白钮，开了槽变亮蓝
struct GSSwitch: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: 12) {
                configuration.label
                Spacer(minLength: 0)
                ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                    Capsule().fill(configuration.isOn ? GS.accent : GS.fieldLine).frame(width: 50, height: 30)
                    Circle().fill(GS.knob).frame(width: 24, height: 24).shadow(color: .black.opacity(0.25), radius: 1, y: 1).padding(3)
                }
                .animation(.easeOut(duration: 0.15), value: configuration.isOn)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isToggle)
        .accessibilityValue(configuration.isOn ? "开" : "关")
    }
}
