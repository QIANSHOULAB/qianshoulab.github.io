import SwiftUI

// 工时榨汁机的界面：开始、结束两个大框（边打边加冒号），「现在」一按填上，次日结束一拨；
// 答案带出实际换型分钟数；休息表就地改：改起止、改名字、加一段、删一段、恢复默认，存在这台手机上。

enum GongShiTool {
    static let entry = ToolEntry(id: "gongshi", name: GongShiStrings.name, sub: GongShiStrings.tile, symbol: "timer") {
        AnyView(GongShiView())
    }
}

/// 休息表存在 app 里（UserDefaults），默认那套不存
enum GongShiRulesStore {
    static let key = "tiexie.gongshi.rules"

    static func load() -> ShiftRules {
        guard let d = UserDefaults.standard.data(forKey: key), let r = try? JSONDecoder().decode(ShiftRules.self, from: d), GongShi.valid(r) else {
            return .defaults
        }
        return GongShi.sorted(r)
    }

    static func save(_ r: ShiftRules) {
        if GongShi.isDefault(r) {
            UserDefaults.standard.removeObject(forKey: key)
        } else if let d = try? JSONEncoder().encode(r) {
            UserDefaults.standard.set(d, forKey: key)
        }
    }
}

struct GongShiView: View {
    @AppStorage("tiexie.gongshi.start") private var start = ""
    @AppStorage("tiexie.gongshi.end") private var end = ""
    @AppStorage("tiexie.gongshi.next") private var next = false
    @AppStorage("tiexie.gongshi.touched") private var touched = false
    @State private var rules = GongShiRulesStore.load()
    @State private var draft: Draft?
    @FocusState private var focus: Field?

    enum Field: Hashable { case start, end, on, off, rowS(Int), rowE(Int), rowName(Int) }

    struct DraftRow: Identifiable, Equatable {
        let id = UUID()
        var s: String
        var e: String
        var name: String
    }

    struct Draft: Equatable {
        var on: String
        var off: String
        var rows: [DraftRow]
        var note = GongShiStrings.noteOk
        var bad = false
    }

    var body: some View {
        let shown = GongShi.render(start: shownStart, end: shownEnd, nextDay: shownNext,
                                   startFinal: focus != .start, endFinal: focus != .end, rules: rules)
        ToolPage(title: GongShiStrings.name, sub: GongShiStrings.sub) {
            PaperCard {
                timeRow(GongShiStrings.start, text: timeBinding(start: true), field: .start, placeholder: "830") {
                    setNow(start: true)
                }
                divider
                timeRow(GongShiStrings.end, text: timeBinding(start: false), field: .end, placeholder: "1321") {
                    setNow(start: false)
                }
                divider
                Toggle(isOn: Binding(get: { shownNext }, set: { v in touch(); next = v })) {
                    Text(GongShiStrings.nextDay).font(Paper.serif(16))
                }
                .tint(Paper.indigo)
                .frame(minHeight: 52)
            }
            VStack(alignment: .leading, spacing: 10) {
                AnswerBand(label: GongShiStrings.band, value: shown.big, unit: GongShiStrings.unit, line: shown.line,
                           chip: touched ? nil : GongShiStrings.chip)
                if shown.showFix {
                    InkButton(title: GongShiStrings.fix, solid: true) { touch(); next = true }
                }
            }
            ledger(shown.result, days: shownNext ? 1 : 0)
            Text(GongShiStrings.foot(on: GongShi.fmt(rules.on), off: GongShi.fmt(rules.off))
                 + (GongShi.isDefault(rules) ? "" : " · " + GongShiStrings.footCustom))
                .font(Paper.serif(12)).foregroundStyle(Paper.inkSoft)
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("好了") { focus = nil }
            }
        }
        .onChange(of: focus) { old, _ in blurred(old) }
    }

    private var divider: some View {
        Rectangle().fill(Paper.rule.opacity(0.45)).frame(height: 1).padding(.vertical, 4)
    }

    // 第一次打开填个例子（08:30 → 13:21），一动就算自己的
    private var shownStart: String { touched ? start : "08:30" }
    private var shownEnd: String { touched ? end : "13:21" }
    private var shownNext: Bool { touched ? next : false }

    private func touch() {
        guard !touched else { return }
        start = shownStart; end = shownEnd; next = shownNext
        touched = true
    }

    private func timeBinding(start isStart: Bool) -> Binding<String> {
        Binding(
            get: { isStart ? shownStart : shownEnd },
            set: { v in
                touch()
                let m = GongShi.mask(v)
                if isStart { start = m } else { end = m }
            }
        )
    }

    private func setNow(start isStart: Bool) {
        touch()
        let c = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let t = GongShi.fmt((c.hour ?? 0) * 60 + (c.minute ?? 0))
        if isStart {
            start = t
            end = ""   // 新开一单：把上一单的结束清掉
            next = false
        } else {
            end = t
        }
    }

    /// 离开一个框：认得出的时间写成 08:30 这样；休息表的框离开时再核一遍
    private func blurred(_ f: Field?) {
        guard let f else { return }
        func tidy(_ s: String) -> String {
            if case .minutes(let m) = GongShi.parse(s, final: true) { return GongShi.fmt(m) }
            return s
        }
        switch f {
        case .start: if touched { start = tidy(start) }
        case .end: if touched { end = tidy(end) }
        case .on: draft?.on = tidy(draft?.on ?? ""); applyDraft()
        case .off: draft?.off = tidy(draft?.off ?? ""); applyDraft()
        case .rowS(let i): if let d = draft, i < d.rows.count { draft?.rows[i].s = tidy(d.rows[i].s) }; applyDraft()
        case .rowE(let i): if let d = draft, i < d.rows.count { draft?.rows[i].e = tidy(d.rows[i].e) }; applyDraft()
        case .rowName: applyDraft()
        }
    }

    private func timeRow(_ label: String, text: Binding<String>, field: Field, placeholder: String, now: @escaping () -> Void) -> some View {
        HStack(spacing: 10) {
            Text(label).font(Paper.serif(17)).bold().frame(width: 44, alignment: .leading)
            BigField(placeholder: placeholder, text: text, keyboard: .numberPad, size: 32)
                .focused($focus, equals: field)
            Button(action: now) {
                Text(GongShiStrings.now).font(Paper.serif(16))
                    .frame(minWidth: 64, minHeight: 58)
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Paper.ink, lineWidth: 1.5))
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 6)
    }

    // ------------------------------------------------------------ 休息表
    @ViewBuilder
    private func ledger(_ res: GongShi.Result?, days: Int) -> some View {
        PaperCard {
            HStack {
                Text(GongShiStrings.breaks).font(Paper.brush(22, relativeTo: .title3))
                Spacer()
                Text(GongShiStrings.deducted).font(Paper.serif(13)).foregroundStyle(Paper.inkSoft)
            }
            .padding(.bottom, 6)
            if draft != nil {
                editor
            } else {
                let items: [(String, String, Int)] = rules.breaks.enumerated().map { i, b in
                    ("\(GongShi.fmt(b.s))–\(GongShi.fmt(b.e))", b.name.isEmpty ? GongShiStrings.breakName : b.name, res?.breaks[i] ?? 0)
                } + (days > 0 ? [("\(GongShi.fmt(rules.off))–\(GongShi.fmt(rules.on))", GongShiStrings.overnight, res?.night ?? 0)] : [])
                if items.isEmpty {
                    ledgerRow("—", GongShiStrings.noBreaks, 0)
                }
                ForEach(Array(items.enumerated()), id: \.offset) { _, it in
                    ledgerRow(it.0, it.1, it.2)
                }
                InkButton(title: GongShiStrings.edit) { openEditor() }
                    .padding(.top, 10)
            }
        }
    }

    private func ledgerRow(_ t: String, _ n: String, _ v: Int) -> some View {
        HStack {
            Text(t).font(.system(size: 18, weight: .semibold, design: .rounded).monospacedDigit()).frame(width: 120, alignment: .leading)
            Text(n).font(Paper.serif(15))
            Spacer()
            Text(v > 0 ? "−\(v)" : "—").font(.system(size: 18, weight: .bold, design: .rounded).monospacedDigit())
        }
        .opacity(v > 0 ? 1 : 0.5)
        .frame(minHeight: 40)
    }

    @ViewBuilder
    private var editor: some View {
        if let d = draft {
            HStack(spacing: 10) {
                Text(GongShiStrings.clockIn).font(Paper.serif(15))
                smallTime(Binding(get: { draft?.on ?? "" }, set: { draft?.on = GongShi.mask($0); applyDraft(live: true) }), "815", .on)
                Text(GongShiStrings.clockOut).font(Paper.serif(15))
                smallTime(Binding(get: { draft?.off ?? "" }, set: { draft?.off = GongShi.mask($0); applyDraft(live: true) }), "2030", .off)
            }
            .padding(.bottom, 8)
            ForEach(Array(d.rows.enumerated()), id: \.element.id) { i, _ in
                HStack(spacing: 6) {
                    smallTime(Binding(get: { row(i)?.s ?? "" }, set: { v in setRow(i) { $0.s = GongShi.mask(v) } }), "开始", .rowS(i))
                    Text("–")
                    smallTime(Binding(get: { row(i)?.e ?? "" }, set: { v in setRow(i) { $0.e = GongShi.mask(v) } }), "结束", .rowE(i))
                    TextField(GongShiStrings.breakName, text: Binding(get: { row(i)?.name ?? "" },
                                                                    set: { v in setRow(i) { $0.name = String(v.prefix(GongShiStrings.nameMax)) } }))
                        .font(Paper.serif(15))
                        .padding(.horizontal, 8)
                        .frame(minHeight: 48)
                        .background(Paper.field, in: RoundedRectangle(cornerRadius: 6))
                        .focused($focus, equals: .rowName(i))
                    Button {
                        draft?.rows.remove(at: i)
                        applyDraft()
                    } label: {
                        Image(systemName: "xmark").font(.system(size: 16, weight: .bold)).frame(width: 44, height: 48)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("删掉第 \(i + 1) 段")
                }
            }
            HStack(spacing: 10) {
                InkButton(title: GongShiStrings.add) {
                    guard (draft?.rows.count ?? 0) < GongShi.maxBreaks else { return }
                    draft?.rows.append(DraftRow(s: "", e: "", name: ""))
                    focus = .rowS((draft?.rows.count ?? 1) - 1)
                }
                InkButton(title: GongShiStrings.reset) {
                    draft = Draft.from(.defaults)
                    applyDraft()
                }
                InkButton(title: GongShiStrings.done, solid: true) { closeEditor() }
            }
            .padding(.top, 10)
            Text(d.note).font(Paper.serif(13)).foregroundStyle(d.bad ? Paper.seal : Paper.inkSoft).padding(.top, 6)
        }
    }

    private func smallTime(_ b: Binding<String>, _ ph: String, _ f: Field) -> some View {
        TextField(ph, text: b)
            .keyboardType(.numberPad)
            .multilineTextAlignment(.center)
            .font(.system(size: 18, weight: .semibold, design: .rounded).monospacedDigit())
            .frame(width: 72, height: 48)
            .background(Paper.field, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Paper.rule, lineWidth: 1))
            .focused($focus, equals: f)
    }

    private func row(_ i: Int) -> DraftRow? {
        guard let d = draft, i < d.rows.count else { return nil }
        return d.rows[i]
    }

    private func setRow(_ i: Int, _ f: (inout DraftRow) -> Void) {
        guard var d = draft, i < d.rows.count else { return }
        f(&d.rows[i])
        draft = d
        applyDraft(live: true)
    }

    private func openEditor() { draft = Draft.from(rules) }

    private func closeEditor() {
        draft?.rows.removeAll { $0.s.trimmingCharacters(in: .whitespaces).isEmpty && $0.e.trimmingCharacters(in: .whitespaces).isEmpty }
        if applyDraft() { draft = nil; focus = nil }
    }

    /// 框里的字 → 规则。对的马上用上、存进手机；不对的说一声，结果先按上一次对的算。live = 正在打字（还没打完的不报错）
    @discardableResult
    private func applyDraft(live: Bool = false) -> Bool {
        guard var d = draft else { return true }
        let r = GongShiDraft.read(on: d.on, off: d.off, rows: d.rows.map { ($0.s, $0.e, $0.name) })
        if let rule = r.rule {
            rules = GongShi.sorted(rule)
            GongShiRulesStore.save(rules)
            d.note = GongShiStrings.noteOk
            d.bad = false
            draft = d
            return true
        }
        if !live, let why = r.why {
            d.note = GongShiStrings.noteBad(why)
            d.bad = true
            draft = d
        }
        return false
    }
}

extension GongShiView.Draft {
    static func from(_ r: ShiftRules) -> GongShiView.Draft {
        GongShiView.Draft(on: GongShi.fmt(r.on), off: GongShi.fmt(r.off),
                          rows: r.breaks.map { GongShiView.DraftRow(s: GongShi.fmt($0.s), e: GongShi.fmt($0.e), name: $0.name) })
    }
}

/// 休息表的框 → 规则（照网页 readDraft：空行不算，第一个毛病报出来）
enum GongShiDraft {
    static func read(on: String, off: String, rows: [(String, String, String)]) -> (rule: ShiftRules?, why: String?) {
        var why: String?
        func note(_ s: String) { if why == nil { why = s } }
        guard case .minutes(let o) = GongShi.parse(on, final: true) else { return (nil, GongShiStrings.badOn) }
        guard case .minutes(let f) = GongShi.parse(off, final: true) else { return (nil, GongShiStrings.badOff) }
        if f <= o { note(GongShiStrings.offBeforeOn) }
        var breaks: [BreakSpan] = []
        for (s, e, name) in rows {
            if s.trimmingCharacters(in: .whitespaces).isEmpty && e.trimmingCharacters(in: .whitespaces).isEmpty { continue }
            guard case .minutes(let a) = GongShi.parse(s, final: true) else { note(GongShiStrings.badRowStart); continue }
            guard case .minutes(let b) = GongShi.parse(e, final: true) else { note(GongShiStrings.badRowEnd); continue }
            if b <= a { note(GongShiStrings.rowBackwards); continue }
            let n = name.trimmingCharacters(in: .whitespaces)
            breaks.append(BreakSpan(s: a, e: b, name: n.isEmpty ? GongShiStrings.breakName : n))
        }
        if breaks.count > GongShi.maxBreaks { note(GongShiStrings.tooMany(GongShi.maxBreaks)) }
        if let why { return (nil, why) }
        let r = ShiftRules(on: o, off: f, breaks: breaks)
        return GongShi.valid(r) ? (r, nil) : (nil, GongShiStrings.offBeforeOn)
    }
}
