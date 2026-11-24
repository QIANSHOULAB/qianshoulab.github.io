import SwiftUI

// 工时榨汁机的界面：开始、结束两个大框（边打边加冒号），「现在」一按填上，次日结束一拨；
// 答案带出实际换型分钟数；休息表就地改：改起止、改名字、加一段、删一段、恢复默认，存在这台手机上。
// 134 起长相照网页 index.html（深色工单皮，样子在 GongShiLook.swift）。网页顶上切三个工具的标签和 EN/中文 不搬：app 里从工具箱进出，只要中文。

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
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(GongShiStrings.name).font(GS.ui(22, bold: true)).foregroundStyle(GS.ink)
                    Text(GongShiStrings.sub).font(GS.ui(15)).foregroundStyle(GS.muted).lineSpacing(4)
                }
                GSCard(padding: EdgeInsets(top: 2, leading: 14, bottom: 14, trailing: 14)) {
                    timeRow(GongShiStrings.start, text: timeBinding(start: true), field: .start, placeholder: "830",
                            bad: GongShi.parse(shownStart, final: focus != .start) == .bad) {
                        setNow(start: true)
                    }
                    timeRow(GongShiStrings.end, text: timeBinding(start: false), field: .end, placeholder: "1321",
                            bad: GongShi.parse(shownEnd, final: focus != .end) == .bad) {
                        setNow(start: false)
                    }
                    Toggle(isOn: Binding(get: { shownNext }, set: { v in touch(); next = v })) {
                        Text(GongShiStrings.nextDay).font(GS.ui(16, bold: true)).foregroundStyle(GS.ink)
                    }
                    .toggleStyle(GSSwitch())
                    .padding(.top, 14)
                }
                band(shown)
                ledger(shown.result, days: shownNext ? 1 : 0)
                Text(GongShiStrings.foot(on: GongShi.fmt(rules.on), off: GongShi.fmt(rules.off))
                     + (GongShi.isDefault(rules) ? "" : " · " + GongShiStrings.footCustom))
                    .font(GS.ui(12.5)).foregroundStyle(GS.muted)
                    .padding(.horizontal, 2)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(GS.bg.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .toolChrome(tint: GS.accent, dark: true)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("好了") { focus = nil }
            }
        }
        .onChange(of: focus) { old, _ in blurred(old) }
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

    /// 网页 .row：50 宽的字 | 时间框 | 亮蓝「现在」，底下一条细线
    private func timeRow(_ label: String, text: Binding<String>, field: Field, placeholder: String, bad: Bool, now: @escaping () -> Void) -> some View {
        HStack(spacing: 10) {
            Text(label).font(GS.ui(16, bold: true)).foregroundStyle(GS.ink).frame(width: 50, alignment: .leading)
            GSTimeField(placeholder: placeholder, text: text, bad: bad, focused: focus == field)
                .focused($focus, equals: field)
            Button(action: now) {
                Text(GongShiStrings.now).font(GS.ui(15, bold: true)).foregroundStyle(GS.onAccent)
                    .padding(.horizontal, 14)
                    .frame(minWidth: 64, minHeight: 54)
                    .background(GS.accent, in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(GSPress())
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { GS.line.frame(height: 1) }
    }

    /// 网页 .band：深蓝答案带，大数字 80；结束比开始早时底下一个白底「改成次日」
    private func band(_ shown: GongShi.Shown) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(GongShiStrings.band).font(GS.ui(14, bold: true))
                Spacer()
                if !touched {
                    Text(GongShiStrings.chip).font(GS.ui(12, bold: true)).foregroundStyle(GS.bandMuted)
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .overlay(Capsule().strokeBorder(GS.bandMuted, lineWidth: 1))
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(shown.big).font(GS.num(80, heavy: true)).monospacedDigit().tracking(0.8)
                    .lineLimit(1).minimumScaleFactor(0.5)
                Text(GongShiStrings.unit).font(GS.ui(16, bold: true)).foregroundStyle(GS.bandMuted)
            }
            .padding(.top, 4)
            Text(shown.line).font(GS.ui(15)).foregroundStyle(GS.bandMuted).padding(.top, 8)
            if shown.showFix {
                Button { touch(); next = true } label: {
                    Text(GongShiStrings.fix).font(GS.ui(15, bold: true)).foregroundStyle(GS.band)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(GS.bandInk, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(GSPress())
                .padding(.top, 10)
            }
        }
        .foregroundStyle(GS.bandInk)
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 16, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(GS.band, in: RoundedRectangle(cornerRadius: 12))
    }

    // ------------------------------------------------------------ 休息表（网页 .ledger）
    @ViewBuilder
    private func ledger(_ res: GongShi.Result?, days: Int) -> some View {
        GSCard(padding: EdgeInsets(top: 12, leading: 14, bottom: 4, trailing: 14)) {
            HStack(alignment: .firstTextBaseline) {
                Text(GongShiStrings.breaks)
                Spacer()
                Text(GongShiStrings.deducted).opacity(draft == nil ? 1 : 0)
            }
            .font(GS.ui(13, bold: true)).foregroundStyle(GS.muted)
            .padding(.bottom, 4)
            if draft != nil {
                editor
            } else {
                let items = ledgerItems(res, days: days)
                if items.isEmpty {
                    ledgerRow("—", GongShiStrings.noBreaks, 0)
                }
                ForEach(Array(items.enumerated()), id: \.offset) { _, it in
                    ledgerRow(it.0, it.1, it.2)
                }
                GSGhost(title: GongShiStrings.edit) { openEditor() }
                    .padding(.vertical, 10)
                    .overlay(alignment: .top) { GS.line.frame(height: 1) }
            }
        }
    }

    private func ledgerItems(_ res: GongShi.Result?, days: Int) -> [(String, String, Int)] {
        var out: [(String, String, Int)] = []
        for (i, b) in rules.breaks.enumerated() {
            let span = GongShi.fmt(b.s) + "–" + GongShi.fmt(b.e)
            let name = b.name.isEmpty ? GongShiStrings.breakName : b.name
            let cut = res.map { i < $0.breaks.count ? $0.breaks[i] : 0 } ?? 0
            out.append((span, name, cut))
        }
        if days > 0 {
            out.append((GongShi.fmt(rules.off) + "–" + GongShi.fmt(rules.on), GongShiStrings.overnight, res?.night ?? 0))
        }
        return out
    }

    /// 一行：起止（数字 18）| 名字（14 灰）| 扣的分钟（金色 20；不扣的灰「—」）
    private func ledgerRow(_ t: String, _ n: String, _ v: Int) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(t).font(GS.num(18)).monospacedDigit().foregroundStyle(v > 0 ? GS.ink : GS.muted)
            Text(n).font(GS.ui(14)).foregroundStyle(GS.muted).lineLimit(1)
            Spacer(minLength: 0)
            Text(v > 0 ? "−\(v)" : "—")
                .font(v > 0 ? GS.num(20) : GS.ui(20))
                .monospacedDigit()
                .foregroundStyle(v > 0 ? GS.deduct : GS.faint)
        }
        .padding(.vertical, 9)
        .overlay(alignment: .top) { GS.line.frame(height: 1) }
    }

    @ViewBuilder
    private var editor: some View {
        if let d = draft {
            ForEach(Array(d.rows.enumerated()), id: \.element.id) { i, _ in
                HStack(spacing: 6) {
                    GSTimeField(placeholder: "开始", text: Binding(get: { row(i)?.s ?? "" }, set: { v in setRow(i) { $0.s = GongShi.mask(v) } }),
                                small: true, focused: focus == .rowS(i))
                        .frame(width: 68)
                        .focused($focus, equals: .rowS(i))
                        .accessibilityLabel("第 \(i + 1) 段开始")
                    Text("–").font(GS.ui(15)).foregroundStyle(GS.muted)
                    GSTimeField(placeholder: "结束", text: Binding(get: { row(i)?.e ?? "" }, set: { v in setRow(i) { $0.e = GongShi.mask(v) } }),
                                small: true, focused: focus == .rowE(i))
                        .frame(width: 68)
                        .focused($focus, equals: .rowE(i))
                        .accessibilityLabel("第 \(i + 1) 段结束")
                    TextField("", text: Binding(get: { row(i)?.name ?? "" },
                                                set: { v in setRow(i) { $0.name = String(v.prefix(GongShiStrings.nameMax)) } }),
                              prompt: Text(GongShiStrings.breakName).foregroundColor(GS.faint))
                        .font(GS.ui(15, bold: true))
                        .foregroundStyle(GS.ink)
                        .padding(.horizontal, 8)
                        .frame(height: 40)
                        .background(GS.surface, in: RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(GS.fieldLine, lineWidth: 1))
                        .overlay(RoundedRectangle(cornerRadius: 7).stroke(GS.accent, lineWidth: 2).padding(-2).opacity(focus == .rowName(i) ? 1 : 0))
                        .focused($focus, equals: .rowName(i))
                        .accessibilityLabel("第 \(i + 1) 段叫什么")
                    Button {
                        draft?.rows.remove(at: i)
                        applyDraft()
                    } label: {
                        Text("×").font(GS.ui(24)).foregroundStyle(GS.muted).frame(width: 34, height: 40).contentShape(Rectangle())
                    }
                    .buttonStyle(GSPress())
                    .accessibilityLabel("删掉第 \(i + 1) 段")
                }
                .padding(.vertical, 8)
                .overlay(alignment: .top) { GS.line.frame(height: 1) }
            }
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    shiftField(GongShiStrings.clockIn, Binding(get: { draft?.on ?? "" }, set: { draft?.on = GongShi.mask($0); applyDraft(live: true) }), "815", .on)
                    shiftField(GongShiStrings.clockOut, Binding(get: { draft?.off ?? "" }, set: { draft?.off = GongShi.mask($0); applyDraft(live: true) }), "2030", .off)
                }
                HStack(spacing: 8) {
                    GSGhost(title: GongShiStrings.add) {
                        guard (draft?.rows.count ?? 0) < GongShi.maxBreaks else { return }
                        draft?.rows.append(DraftRow(s: "", e: "", name: ""))
                        focus = .rowS((draft?.rows.count ?? 1) - 1)
                    }
                    .disabled(d.rows.count >= GongShi.maxBreaks)
                    .opacity(d.rows.count >= GongShi.maxBreaks ? 0.45 : 1)
                    GSGhost(title: GongShiStrings.reset) {
                        draft = Draft.from(.defaults)
                        applyDraft()
                    }
                    Button { closeEditor() } label: {
                        Text(GongShiStrings.done).font(GS.ui(15, bold: true)).foregroundStyle(GS.onAccent)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(GS.accent, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(GSPress())
                }
                Text(d.note).font(GS.ui(12.5)).foregroundStyle(d.bad ? GS.warn : GS.muted)
            }
            .padding(.vertical, 12)
            .overlay(alignment: .top) { GS.line.frame(height: 1) }
        }
    }

    /// 网页 .shift：「上班」+ 小时间框
    private func shiftField(_ label: String, _ b: Binding<String>, _ ph: String, _ f: Field) -> some View {
        HStack(spacing: 8) {
            Text(label).font(GS.ui(15, bold: true)).foregroundStyle(GS.ink)
            GSTimeField(placeholder: ph, text: b, small: true, focused: focus == f)
                .focused($focus, equals: f)
        }
        .frame(maxWidth: .infinity)
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
