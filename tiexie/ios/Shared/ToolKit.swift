import SwiftUI

// 工具箱的接口：每个工具自己一个文件夹（Tools/<工具>/），对外只交一个 ToolEntry，登记在 Tools/Registry.swift 一行。
// 工具之间互不引用；共用的东西（宣纸底、拍照选图、数字格式、下面这几个大号控件）都在 Shared/。

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

/// 工具页的外壳：宣纸底、毛笔大标题、两行副标题
struct ToolPage<Content: View>: View {
    var title: String
    var sub: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(Paper.brush(38, relativeTo: .largeTitle))
                    Text(sub).font(Paper.serif(15, relativeTo: .subheadline)).foregroundStyle(Paper.inkSoft)
                }
                content()
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .paperPage(figures: false)
    }
}

/// 一块双线框的卡片
struct PaperCard<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content() }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .doubleFrame()
    }
}

/// 大号数字框：车间里戴着手套也点得准
struct BigField: View {
    var placeholder: String
    @Binding var text: String
    var suffix: String = ""
    var keyboard: UIKeyboardType = .decimalPad
    var bad = false
    var size: CGFloat = 30

    var body: some View {
        HStack(spacing: 6) {
            TextField(placeholder, text: $text)
                .keyboardType(keyboard)
                .multilineTextAlignment(.trailing)
                .font(.system(size: size, weight: .bold, design: .rounded).monospacedDigit())
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !suffix.isEmpty {
                Text(suffix).font(.system(size: 16, weight: .bold)).foregroundStyle(Paper.inkSoft)
            }
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 58)
        .background(Paper.field, in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(bad ? Paper.seal : Paper.rule, lineWidth: 1.5))
    }
}

/// 照直写的按钮：墨框，至少 52 高
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

/// 结果那一条：大数字 + 单位 + 一行说明
struct AnswerBand: View {
    var label: String
    var value: String
    var unit: String
    var line: String
    var chip: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(Paper.serif(15, relativeTo: .subheadline)).bold()
                Spacer()
                if let chip {
                    Text(chip).font(.system(size: 12, weight: .bold)).padding(.horizontal, 9).padding(.vertical, 3)
                        .overlay(Capsule().strokeBorder(Paper.paperHi.opacity(0.7)))
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(value)
                    .font(.system(size: 72, weight: .heavy, design: .rounded).monospacedDigit())
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                Text(unit).font(.system(size: 17, weight: .bold)).opacity(0.75)
            }
            if !line.isEmpty {
                Text(line).font(Paper.serif(15, relativeTo: .subheadline)).opacity(0.85)
            }
        }
        .foregroundStyle(Paper.paperHi)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Paper.indigo, in: RoundedRectangle(cornerRadius: 6))
        .accessibilityElement(children: .combine)
    }
}
