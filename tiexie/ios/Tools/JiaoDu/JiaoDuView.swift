import SwiftUI

// 角度算距离的界面：两个大框（半径、偏的度数），一条答案带，一张公式表。交互照网页：边打边算，记住上次填的。

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
        ToolPage(title: JiaoDuStrings.name, sub: JiaoDuStrings.sub) {
            PaperCard {
                inputRow(JiaoDuStrings.r, JiaoDuStrings.rHint, text: binding(.r), placeholder: "16", suffix: "mm", bad: out.badR, field: .r)
                Rectangle().fill(Paper.rule.opacity(0.45)).frame(height: 1).padding(.vertical, 4)
                inputRow(JiaoDuStrings.a, JiaoDuStrings.aHint, text: binding(.a), placeholder: "0.4175", suffix: "°", bad: out.badA, field: .a)
            }
            AnswerBand(label: JiaoDuStrings.band, value: out.big, unit: "mm", line: out.line, chip: touched ? nil : JiaoDuStrings.chip)
            PaperCard {
                Text(JiaoDuStrings.fTitle).font(Paper.serif(14)).foregroundStyle(Paper.inkSoft).padding(.bottom, 4)
                ForEach(Array(JiaoDuStrings.formulas.enumerated()), id: \.offset) { i, f in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(f.0).font(Paper.serif(14)).bold()
                        Text(i == 1 ? out.perDeg : f.1)
                            .font(.system(size: 21, weight: .bold, design: .rounded))
                            .foregroundStyle(Paper.indigo)
                        Text(f.2).font(Paper.serif(13)).foregroundStyle(Paper.inkSoft)
                    }
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .top) { if i > 0 { Rectangle().fill(Paper.rule.opacity(0.35)).frame(height: 1) } }
                }
            }
        }
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

    private func inputRow(_ label: String, _ hint: String, text: Binding<String>, placeholder: String, suffix: String, bad: Bool, field: Field) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(Paper.serif(16)).bold()
                Text(hint).font(Paper.serif(12)).foregroundStyle(Paper.inkSoft)
            }
            Spacer(minLength: 8)
            BigField(placeholder: placeholder, text: text, suffix: suffix, keyboard: .numbersAndPunctuation, bad: bad)
                .frame(width: 176)
                .focused($focus, equals: field)
        }
        .padding(.vertical, 8)
    }
}
