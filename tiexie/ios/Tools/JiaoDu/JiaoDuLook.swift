import SwiftUI

// 角度算距离的长相：照 gongshi 网页 tp/index.html 的深色工单皮（134，Song：工具就用它原来的样子，不套铁屑江湖的皮）。
// 颜色、字号、圆角、间距都抄网页的样式表；网页只有深色一套，这里也只有一套。
// 字：西文和数字用网页同款 Barlow / Barlow Condensed（OFL，文件在 Barlow/，带 JiaoDu- 前缀），中文落到苹方，跟网页在 iPhone 上一样。

enum JD {
    static let bg = Color(hex: 0x0e141c)
    static let surface = Color(hex: 0x172030)
    static let ink = Color(hex: 0xe5eaf1)
    static let muted = Color(hex: 0x9aa7b8)
    static let faint = Color(hex: 0x5c6a7d)
    static let line = Color(hex: 0x273347)
    static let fieldLine = Color(hex: 0x3a4a60)
    static let accent = Color(hex: 0x86aee6)
    static let band = Color(hex: 0x1f3556)
    static let bandInk = Color(hex: 0xf2f5f9)
    static let bandMuted = Color(hex: 0xa9bbd3)
    static let warn = Color(hex: 0xf08a5d)
    static let gold = Color(hex: 0xe0b25a)

    private static let ready: Void = ToolFonts.register(["JiaoDu-Barlow-Medium", "JiaoDu-Barlow-Bold",
                                                         "JiaoDu-BarlowCondensed-Bold", "JiaoDu-BarlowCondensed-ExtraBold"])

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

/// 网页的 .card / .formulas / .math：深一档的底、1px 细线、12 圆角
struct JDCard<Content: View>: View {
    var padding = EdgeInsets(top: 2, leading: 14, bottom: 2, trailing: 14)
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content() }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(JD.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(JD.line, lineWidth: 1))
    }
}

/// 网页 .num：54 高的数字框，右边挂单位；打字时一圈 2px 亮蓝，认不出时边框变橙
struct JDField: View {
    var placeholder: String
    @Binding var text: String
    var suffix: String
    var bad: Bool
    var focused: Bool

    var body: some View {
        ZStack(alignment: .trailing) {
            TextField("", text: $text, prompt: Text(placeholder).foregroundColor(JD.faint))
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.trailing)
                .font(JD.num(30))
                .monospacedDigit()
                .foregroundStyle(JD.ink)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .padding(.leading, 10)
                .padding(.trailing, 46)
            Text(suffix).font(JD.ui(15, bold: true)).foregroundStyle(JD.muted).padding(.trailing, 12).allowsHitTesting(false)
        }
        .frame(height: 54)
        .background(JD.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(bad ? JD.warn : JD.fieldLine, lineWidth: 1))
        .overlay(RoundedRectangle(cornerRadius: 9).stroke(bad ? JD.warn : JD.accent, lineWidth: 2).padding(-2).opacity(focused ? 1 : 0))
    }
}
