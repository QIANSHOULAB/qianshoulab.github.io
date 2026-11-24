import SwiftUI

// 角度算距离的界面：照网页 tp/index.html（134 起长相也照网页：深色工单皮，样子在 JiaoDuLook.swift）。
// 两个大框（半径、偏的度数），一条答案带，一张公式表，底下「原理，说人话版」。交互照网页：边打边算，记住上次填的。
// 网页顶上切三个工具的标签和 EN/中文 不搬：app 里从工具箱进出，只要中文。

enum JiaoDuTool {
    static let entry = ToolEntry(id: "jiaodu", name: JiaoDuStrings.name, sub: JiaoDuStrings.tile, symbol: "scope") {
        AnyView(JiaoDuView())
    }
}

struct JiaoDuView: View {
    @AppStorage("tiexie.jiaodu.r") private var r = ""
    @AppStorage("tiexie.jiaodu.a") private var a = ""
    @AppStorage("tiexie.jiaodu.touched") private var touched = false
    @FocusState private var focus: Field?

    enum Field { case r, a }

    var body: some View {
        let out = JiaoDu.render(r: shownR, a: shownA)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(JiaoDuStrings.name).font(JD.ui(22, bold: true)).foregroundStyle(JD.ink)
                    Text(JiaoDuStrings.sub).font(JD.ui(15)).foregroundStyle(JD.muted).lineSpacing(4)
                }
                JDCard {
                    inputRow(JiaoDuStrings.r, JiaoDuStrings.rHint, text: binding(.r), placeholder: "16", suffix: "mm", bad: out.badR, field: .r)
                    JD.line.frame(height: 1)
                    inputRow(JiaoDuStrings.a, JiaoDuStrings.aHint, text: binding(.a), placeholder: "0.4175", suffix: "°", bad: out.badA, field: .a)
                }
                band(out)
                formulas(out)
                math
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(JD.bg.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .toolChrome(tint: JD.accent, dark: true)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button(focus == .r ? "下一个" : "好了") { focus = focus == .r ? .a : nil }
            }
        }
    }

    // 第一次打开填个例子（16、0.4175），一改就算自己的
    private var shownR: String { touched ? r : "16" }
    private var shownA: String { touched ? a : "0.4175" }

    private func binding(_ f: Field) -> Binding<String> {
        Binding(
            get: { f == .r ? shownR : shownA },
            set: { v in
                if !touched { r = shownR; a = shownA; touched = true }
                if f == .r { r = v } else { a = v }
            }
        )
    }

    /// 网页 .row：左边字（16 粗 + 12.5 灰的提示），右边 172 宽的数字框
    private func inputRow(_ label: String, _ hint: String, text: Binding<String>, placeholder: String, suffix: String, bad: Bool, field: Field) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(JD.ui(16, bold: true)).foregroundStyle(JD.ink)
                Text(hint).font(JD.ui(12.5)).foregroundStyle(JD.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            JDField(placeholder: placeholder, text: text, suffix: suffix, bad: bad, focused: focus == field)
                .frame(width: 172)
                .focused($focus, equals: field)
                .onSubmit { focus = field == .r ? .a : nil }
        }
        .padding(.vertical, 12)
    }

    /// 网页 .band：深蓝答案带，大数字 76
    private func band(_ out: JiaoDu.Out) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(JiaoDuStrings.band).font(JD.ui(14, bold: true))
                Spacer()
                if !touched {
                    Text(JiaoDuStrings.chip).font(JD.ui(12, bold: true)).foregroundStyle(JD.bandMuted)
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .overlay(Capsule().strokeBorder(JD.bandMuted, lineWidth: 1))
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(out.big).font(JD.num(76, heavy: true)).monospacedDigit().tracking(0.76)
                    .lineLimit(1).minimumScaleFactor(0.5)
                Text("mm").font(JD.ui(16, bold: true)).foregroundStyle(JD.bandMuted)
            }
            .padding(.top, 4)
            lineText(out.line).font(JD.ui(15)).foregroundStyle(JD.bandMuted).padding(.top, 8)
        }
        .foregroundStyle(JD.bandInk)
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 16, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(JD.band, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    /// 网页那句结果里 TP 的数是 <b>：亮一档、加粗
    private func lineText(_ s: String) -> Text {
        guard let rg = s.range(of: "TP 约 ", options: .backwards) else { return Text(s) }
        let head = Text(s[..<rg.upperBound])
        let tp = Text(s[rg.upperBound...]).font(JD.ui(15, bold: true)).foregroundColor(JD.bandInk)
        return Text("\(head)\(tp)")
    }

    /// 网页 .formulas
    private func formulas(_ out: JiaoDu.Out) -> some View {
        JDCard(padding: EdgeInsets(top: 12, leading: 14, bottom: 4, trailing: 14)) {
            Text(JiaoDuStrings.fTitle).font(JD.ui(14, bold: true)).foregroundStyle(JD.muted).padding(.bottom, 4)
            ForEach(Array(JiaoDuStrings.formulas.enumerated()), id: \.offset) { i, f in
                VStack(alignment: .leading, spacing: 0) {
                    Text(f.0).font(JD.ui(14, bold: true)).foregroundStyle(JD.ink)
                    Text(i == 1 ? out.perDeg : f.1).font(JD.num(21)).tracking(0.21).foregroundStyle(JD.accent).padding(.top, 3)
                    Text(f.2).font(JD.ui(13)).foregroundStyle(JD.muted).lineSpacing(3).padding(.top, 2)
                }
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { if i > 0 { JD.line.frame(height: 1) } }
            }
        }
    }

    /// 网页 .math：一张图 + 六条
    private var math: some View {
        JDCard(padding: EdgeInsets(top: 12, leading: 14, bottom: 6, trailing: 14)) {
            Text(JiaoDuStrings.mTitle).font(JD.ui(14, bold: true)).foregroundStyle(JD.muted).padding(.bottom, 8)
            JiaoDuDiagram()
                .accessibilityLabel(JiaoDuStrings.diagCap)
            Text(JiaoDuStrings.diagCap).font(JD.ui(12.5)).foregroundStyle(JD.muted)
                .multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(.bottom, 4)
            ForEach(Array(JiaoDuStrings.math.enumerated()), id: \.offset) { i, m in
                VStack(alignment: .leading, spacing: 3) {
                    Text(m.0).font(JD.ui(14, bold: true)).foregroundStyle(JD.ink)
                    Text(m.1).font(JD.ui(14)).foregroundStyle(JD.muted).lineSpacing(6)
                }
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { if i > 0 { JD.line.frame(height: 1) } }
            }
        }
    }
}

/// 网页 .math 里那张 SVG（viewBox 300 × 190）：O 工件中心，A 理论孔位，B 实测孔位，直线是弦、虚线是圆弧
struct JiaoDuDiagram: View {
    var body: some View {
        Canvas { ctx, size in
            let k = size.width / 300
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * k, y: y * k) }
            let O = p(30, 170), A = p(255, 122.2), B = p(220.7, 41.4)
            func arc(_ r: CGFloat, from a0: CGFloat, to a1: CGFloat) -> Path {
                var path = Path()
                for i in 0...40 {
                    let t = a0 + (a1 - a0) * CGFloat(i) / 40
                    let q = CGPoint(x: O.x + cos(t) * r * k, y: O.y + sin(t) * r * k)
                    if i == 0 { path.move(to: q) } else { path.addLine(to: q) }
                }
                return path
            }
            let aA = atan2(122.2 - 170, 255 - 30), aB = atan2(41.4 - 170, 220.7 - 30)
            var legs = Path()
            legs.move(to: O); legs.addLine(to: A)
            legs.move(to: O); legs.addLine(to: B)
            ctx.stroke(legs, with: .color(JD.faint), lineWidth: 1.5 * k)
            ctx.stroke(arc(230, from: aA, to: aB), with: .color(JD.muted), style: StrokeStyle(lineWidth: 1.5 * k, dash: [4 * k, 4 * k]))
            var chord = Path()
            chord.move(to: A); chord.addLine(to: B)
            ctx.stroke(chord, with: .color(JD.accent), style: StrokeStyle(lineWidth: 2.5 * k, lineCap: .round))
            ctx.stroke(arc(40, from: aA, to: aB), with: .color(JD.gold), lineWidth: 1.5 * k)
            func dot(_ c: CGPoint, _ r: CGFloat) -> Path { Path(ellipseIn: CGRect(x: c.x - r * k, y: c.y - r * k, width: 2 * r * k, height: 2 * r * k)) }
            ctx.fill(dot(O, 3.5), with: .color(JD.ink))
            ctx.fill(dot(A, 5), with: .color(JD.bg))
            ctx.stroke(dot(A, 5), with: .color(JD.ink), lineWidth: 1.5 * k)
            ctx.fill(dot(B, 5), with: .color(JD.accent))
            // SVG 的字是按基线摆的：13px 字，基线往上大约 3.5 是字的底
            func label(_ s: String, _ x: CGFloat, _ y: CGFloat, _ color: Color, end: Bool = false) {
                let t = Text(s).font(JD.ui(13 * k, bold: true)).foregroundColor(color)
                ctx.draw(t, at: p(x, y + 3.5), anchor: end ? .bottomTrailing : .bottomLeading)
            }
            label("O", 16, 186, JD.ink)
            label("A", 264, 128, JD.ink)
            label("B", 228, 34, JD.ink)
            label("R", 138, 162, JD.muted)
            label("R", 122, 104, JD.muted)
            label("Δθ", 78, 152, JD.gold)
            label(JiaoDuStrings.diagChord, 227, 94, JD.accent, end: true)
            label(JiaoDuStrings.diagArc, 252, 74, JD.muted)
        }
        .aspectRatio(300.0 / 190.0, contentMode: .fit)
        .padding(.bottom, 4)
    }
}
