import SwiftUI
import PhotosUI
import UIKit

// 英寸照妖镜的界面：宣纸页上，标题、两种模式，中间一块墨色镜龛里挂网页版那面照妖镜（八卦镜框、藤蔓，镜面就是快门），
// 下面是结果图：红字写在原图上，点红字改数，能两指放大、能横过来看，能存图。
// 镜子的几层（藤蔓后层带镜光、外圈法阵、八卦镜框、藤蔓前层）是网页版自己画出来截的透明图（zhaoyao-*.webp），镜面这里画。

enum YingCunTool {
    static let entry = ToolEntry(id: "zhaoyao", name: YingCunStrings.name, sub: YingCunStrings.tile, symbol: "camera.metering.center.weighted") {
        AnyView(YingCunView())
    }
}

@MainActor
final class YingCunModel: ObservableObject {
    @Published var job: YCJob?
    @Published var drawn: YCDrawn?
    @Published var busy = false
    @Published var step: YCStep?
    @Published var error: String?
    @Published var editing: YCLabel?

    func run(_ img: UIImage, mode: YCMode) {
        guard !busy else { return }
        busy = true
        error = nil
        step = .orient
        Task {
            do {
                let job = try await YingCunVision.read(img) { [weak self] s in self?.step = s }
                self.step = .draw
                self.job = job
                await redraw(mode)
            } catch {
                self.job = nil
                self.drawn = nil
                self.error = (error as? YCError) == .badImage ? YingCunStrings.badImage : YingCunStrings.fail
            }
            self.step = nil
            self.busy = false
        }
    }

    func redraw(_ mode: YCMode) async {
        guard let job else { drawn = nil; return }
        let d = await Task.detached(priority: .userInitiated) { YingCunRender.draw(job, mode) }.value
        drawn = d
    }

    /// 点红字改了原数
    func commit(_ L: YCLabel, _ p: YCNum, text: String, mode: YCMode) {
        L.item.num = p
        L.item.text = text
        L.item.edited = true
        L.item.conf = 1
        editing = nil
        Task { await redraw(mode) }
    }

    /// 结果那一句
    func summary(mode: YCMode) -> (String, Bool) {
        guard let job, let d = drawn else { return (YingCunStrings.none, false) }
        let red = YingCunStrings.redIs(mode == .in2mm ? YingCunStrings.mm : YingCunStrings.inches)
        if job.kind == .table {
            if d.flags > 0 { return (red + " · " + YingCunStrings.flags(d.flags), true) }
            if d.checked > 0 { return (red + " · " + YingCunStrings.checked(d.okRows), false) }
            return (red + " · " + YingCunStrings.tapToFix, false)
        }
        var t = YingCunStrings.loose + " · " + red
        if d.flags > 0 { t += " · " + YingCunStrings.looseFlags }
        return (t, d.flags > 0)
    }
}

struct YingCunView: View {
    @AppStorage("tiexie.zhaoyao.mode") private var modeRaw = YCMode.in2mm.rawValue
    @StateObject private var vm = YingCunModel()
    @State private var camera = false
    @State private var album: [PhotosPickerItem] = []
    @State private var zoom: CGFloat = 1
    @State private var pinch: CGFloat = 1
    @State private var sideways = false
    @State private var flash = 0

    private var mode: YCMode { YCMode(rawValue: modeRaw) ?? .in2mm }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(YingCunStrings.name).font(Paper.brush(38, relativeTo: .largeTitle))
                        Text(YingCunStrings.sub).font(Paper.serif(15, relativeTo: .subheadline)).foregroundStyle(Paper.inkSoft)
                    }
                    modePicker
                    ZhaoYaoShrine(busy: vm.busy, flash: flash) { shoot() }
                    HStack(spacing: 10) {
                        PhotosPicker(selection: $album, maxSelectionCount: 1, matching: .images) {
                            Text(YingCunStrings.album)
                                .font(Paper.serif(17, relativeTo: .body))
                                .frame(maxWidth: .infinity, minHeight: 52)
                                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Paper.ink, lineWidth: 1.5))
                        }
                        .buttonStyle(.plain)
                        .disabled(vm.busy)
                        if vm.drawn != nil {
                            InkButton(title: YingCunStrings.again) { shoot() }.disabled(vm.busy)
                        }
                    }
                    statusLine
                    if vm.job != nil || vm.drawn != nil {
                        result.id("result")
                    } else if !vm.busy && vm.error == nil {
                        PaperCard {
                            Text(YingCunStrings.hintTitle).font(Paper.serif(16)).bold()
                            Text(YingCunStrings.hintText).font(Paper.serif(14)).foregroundStyle(Paper.inkSoft).padding(.top, 2)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 40)
            }
            .onChange(of: vm.drawn != nil) { _, has in
                if has { withAnimation { proxy.scrollTo("result", anchor: .top) } }
            }
        }
        .paperPage(figures: false)
        .fullScreenCover(isPresented: $camera) {
            CameraPicker { img in
                camera = false
                if let img { start(img) }
            }
            .ignoresSafeArea()
        }
        .fullScreenCover(isPresented: $sideways) {
            if let d = vm.drawn { SidewaysViewer(image: d.image) { sideways = false } }
        }
        .sheet(item: Binding(get: { vm.editing.map(EditBox.init) }, set: { if $0 == nil { vm.editing = nil } })) { box in
            YingCunEdit(label: box.label, job: vm.job, drawn: vm.drawn, mode: mode) { p, text in
                vm.commit(box.label, p, text: text, mode: mode)
            } cancel: {
                vm.editing = nil
            }
            .presentationDetents([.medium, .large])
        }
        .onChange(of: album) { _, new in
            guard let it = new.first else { return }
            album = []
            Task {
                if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { start(img) }
            }
        }
        .onChange(of: modeRaw) { _, _ in
            Task { await vm.redraw(mode) }
        }
    }

    private func shoot() {
        guard !vm.busy else { return }
        flash += 1
        if CameraPicker.available { camera = true }
    }

    private func start(_ img: UIImage) {
        zoom = 1
        vm.run(img, mode: mode)
    }

    // ------------------------------------------------------------ 两种模式
    private var modePicker: some View {
        HStack(spacing: 0) {
            ForEach(YCMode.allCases, id: \.self) { m in
                let on = m == mode
                Button {
                    modeRaw = m.rawValue
                } label: {
                    Text(m == .in2mm ? YingCunStrings.in2mm : YingCunStrings.mm2in)
                        .font(Paper.serif(16, relativeTo: .body))
                        .bold(on)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .foregroundStyle(on ? Paper.paperHi : Paper.ink)
                        .background(on ? Paper.indigo : Color.clear, in: RoundedRectangle(cornerRadius: 5))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Paper.field, in: RoundedRectangle(cornerRadius: 7))
        .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Paper.rule, lineWidth: 1.2))
    }

    // ------------------------------------------------------------ 状态
    @ViewBuilder private var statusLine: some View {
        if let s = vm.step {
            let t = Self.stepText(s), p = Self.stepPct(s)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(t).font(Paper.serif(15))
                    Spacer()
                    Text("\(Int(p * 100))%").font(.system(size: 14, weight: .bold).monospacedDigit()).foregroundStyle(Paper.inkSoft)
                }
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Paper.wash)
                        Capsule().fill(Paper.indigo).frame(width: g.size.width * p)
                    }
                }
                .frame(height: 6)
                .animation(.easeOut(duration: 0.4), value: p)
            }
        } else if let e = vm.error {
            Text(e).font(Paper.serif(15)).foregroundStyle(Paper.seal)
        }
    }

    static func stepText(_ s: YCStep) -> String {
        switch s {
        case .orient: return YingCunStrings.stepOrient
        case .read: return YingCunStrings.stepRead
        case .check: return YingCunStrings.stepCheck
        case .draw: return YingCunStrings.stepDraw
        }
    }

    static func stepPct(_ s: YCStep) -> Double {
        switch s {
        case .orient: return 0.15
        case .read: return 0.45
        case .check: return 0.85
        case .draw: return 0.95
        }
    }

    // ------------------------------------------------------------ 结果
    @ViewBuilder private var result: some View {
        let sum = vm.summary(mode: mode)
        let line = sum.0, flagged = sum.1
        VStack(alignment: .leading, spacing: 10) {
            Text(line)
                .font(Paper.serif(15, relativeTo: .subheadline)).bold()
                .padding(.horizontal, 12).padding(.vertical, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(flagged ? Color(hex: 0xffd60a, alpha: 0.35) : Paper.wash, in: RoundedRectangle(cornerRadius: 6))
            if let job = vm.job, let u = job.unit, u != (mode == .in2mm ? "in" : "mm") {
                HStack {
                    Text(YingCunStrings.unitWrong(u == "in" ? YingCunStrings.inches : YingCunStrings.mm)).font(Paper.serif(15))
                    Spacer()
                    Button(YingCunStrings.unitFix) { modeRaw = (mode == .in2mm ? YCMode.mm2in : YCMode.in2mm).rawValue }
                        .font(Paper.serif(15)).bold()
                }
                .padding(10)
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Paper.seal.opacity(0.6)))
            }
            if let d = vm.drawn {
                picture(d)
                if d.image.size.width > 1200 {
                    Text(YingCunStrings.turn).font(Paper.serif(13)).foregroundStyle(Paper.inkSoft)
                }
                HStack(spacing: 10) {
                    ShareLink(item: Image(uiImage: d.image), preview: SharePreview(YingCunStrings.fileName, image: Image(uiImage: d.image))) {
                        Text(YingCunStrings.save)
                            .font(Paper.serif(17, relativeTo: .body))
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .foregroundStyle(Paper.paperHi)
                            .background(Paper.ink, in: RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                    InkButton(title: YingCunStrings.sideways) { sideways = true }
                }
            }
        }
    }

    /// 结果图：宽度跟屏，两指放大以后能上下左右拖；点红字改数
    private func picture(_ d: YCDrawn) -> some View {
        GeometryReader { g in
            let baseW = g.size.width
            let k = zoom * pinch
            let w = baseW * k
            let scale = w / max(1, d.image.size.width)
            ScrollView([.horizontal, .vertical], showsIndicators: k > 1) {
                Image(uiImage: d.image)
                    .resizable()
                    .interpolation(.high)
                    .frame(width: w, height: d.image.size.height * scale)
                    .contentShape(Rectangle())
                    .onTapGesture(coordinateSpace: .local) { p in
                        tap(d, x: p.x / scale, y: p.y / scale, pad: 10 / scale)
                    }
            }
            .scrollDisabled(k <= 1)
            .simultaneousGesture(
                MagnifyGesture()
                    .onChanged { v in pinch = v.magnification }
                    .onEnded { v in
                        zoom = min(4, max(1, zoom * v.magnification))
                        pinch = 1
                    }
            )
        }
        .aspectRatio(d.image.size.width / max(1, d.image.size.height), contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Paper.rule, lineWidth: 1))
        .accessibilityLabel("换算结果：原图数字旁边的红字是换算后的值")
    }

    private func tap(_ d: YCDrawn, x: Double, y: Double, pad: Double) {
        var hit: YCLabel?
        var hd = Double.infinity
        for L in d.labels {
            if x < L.x - pad || x > L.x + L.w + pad || y < L.y - pad || y > L.y + L.h + pad { continue }
            let dd = abs(x - (L.x + L.w / 2)) + abs(y - (L.y + L.h / 2))
            if dd < hd { hd = dd; hit = L }
        }
        if let hit { vm.editing = hit }
    }
}

private struct EditBox: Identifiable {
    let label: YCLabel
    var id: ObjectIdentifier { ObjectIdentifier(label.item) }
}

// ================================================================ 镜龛
/// 墨色镜龛里那面照妖镜：镜面一按就开相机；外圈法阵慢慢转，照妖时转快、镜面扫光
struct ZhaoYaoShrine: View {
    var busy: Bool
    var flash: Int
    var action: () -> Void

    @State private var grown = false
    @State private var burst = false
    @State private var clock = SpinClock()
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        GeometryReader { g in
            let D = min(g.size.width * 0.68, 300)
            let cx = g.size.width / 2, cy = g.size.height / 2
            ZStack {
                layer("zhaoyao-back", side: D * 2)
                    .scaleEffect(grown || reduce ? 1 : 0.62)
                    .opacity(grown || reduce ? 1 : 0)
                TimelineView(.animation(paused: reduce)) { t in
                    layer("zhaoyao-spin", side: D * 1.02)
                        .rotationEffect(.degrees(clock.angle(at: t.date, busy: busy)))
                }
                layer("zhaoyao-rim", side: D * 1.02)
                Button(action: action) { face(D * 0.6286) }
                    .buttonStyle(MirrorPress())
                    .accessibilityLabel(YingCunStrings.faceIdle)
                Circle()
                    .stroke(Color(hex: 0xa8c8ff, alpha: 0.9), lineWidth: 2)
                    .shadow(color: Color(hex: 0x6fa3ff, alpha: 0.6), radius: 14)
                    .frame(width: D, height: D)
                    .scaleEffect(burst ? 1.75 : 0.62)
                    .opacity(burst ? 0 : (flash > 0 ? 0.95 : 0))
                    .allowsHitTesting(false)
                layer("zhaoyao-front", side: D * 2)
                    .scaleEffect(grown || reduce ? 1 : 0.62)
                    .opacity(grown || reduce ? 1 : 0)
                    .allowsHitTesting(false)
            }
            .position(x: cx, y: cy)
        }
        .frame(height: 340)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(LinearGradient(colors: [Color(hex: 0x16202e), Color(hex: 0x0e141c)], startPoint: .top, endPoint: .bottom))
        )
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Paper.rule, lineWidth: 2))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .onAppear {
            withAnimation(.timingCurve(0.2, 0.7, 0.2, 1, duration: 2.2)) { grown = true }
        }
        .onChange(of: flash) { _, _ in
            burst = false
            clock.kick()
            withAnimation(.timingCurve(0.2, 0.7, 0.3, 1, duration: 0.85)) { burst = true }
        }
    }

    @ViewBuilder private func layer(_ name: String, side: CGFloat) -> some View {
        if let img = Paper.bundled(name + ".webp") {
            Image(uiImage: img).resizable().interpolation(.high).frame(width: side, height: side).allowsHitTesting(false)
        }
    }

    private func face(_ d: CGFloat) -> some View {
        ZStack {
            Circle().fill(RadialGradient(colors: [Color(hue: 214 / 360, saturation: 0.62, brightness: 0.96),
                                                   Color(hue: 214 / 360, saturation: 0.45, brightness: 0.92),
                                                   Color(hue: 215 / 360, saturation: 0.42, brightness: 0.82),
                                                   Color(hue: 216 / 360, saturation: 0.55, brightness: 0.72)],
                                          center: UnitPoint(x: 0.5, y: 0.46), startRadius: 0, endRadius: d * 0.5))
            Circle().fill(RadialGradient(colors: [Color.white.opacity(0.62), Color.white.opacity(0)],
                                         center: UnitPoint(x: 0.34, y: 0.24), startRadius: 0, endRadius: d * 0.42))
            if busy {
                TimelineView(.animation(paused: reduce)) { t in
                    Circle()
                        .fill(AngularGradient(stops: [.init(color: .white.opacity(0), location: 0),
                                                      .init(color: .white.opacity(0), location: 250 / 360),
                                                      .init(color: .white.opacity(0.75), location: 345 / 360),
                                                      .init(color: .white.opacity(0), location: 1)], center: .center))
                        .rotationEffect(.degrees(t.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.1) / 1.1 * 360))
                        .opacity(0.9)
                }
            }
            VStack(spacing: 4) {
                Image(systemName: "camera").font(.system(size: 30, weight: .regular)).opacity(0.88)
                Text(busy ? YingCunStrings.faceBusy : YingCunStrings.faceIdle)
                    .font(.system(size: 18, weight: .bold)).tracking(2)
            }
            .foregroundStyle(Color(hex: 0x0b1626))
        }
        .frame(width: d, height: d)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color.white.opacity(0.4), lineWidth: 1.5))
        .shadow(color: Color(hue: 214 / 360, saturation: 0.95, brightness: 0.95).opacity(0.45), radius: 23)
        .brightness(busy ? 0.04 : 0)
    }
}

/// 外圈法阵转的速度：平时每秒 5°，照妖时 70°，一按先甩到 260° 再慢下来（照网页版）
final class SpinClock {
    private var ang = 0.0
    private var speed = 5.0
    private var last: Date?

    func angle(at now: Date, busy: Bool) -> Double {
        let target = busy ? 70.0 : 5.0
        let dt = last.map { min(0.05, now.timeIntervalSince($0)) } ?? 0
        last = now
        speed += (target - speed) * min(1, dt * 1.8)
        ang = (ang + speed * dt).truncatingRemainder(dividingBy: 360)
        return ang
    }

    func kick() { speed = 260 }
}

private struct MirrorPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .animation(.easeOut(duration: 0.18), value: configuration.isPressed)
    }
}

// ================================================================ 横过来看
/// 结果图转 90° 铺满屏（app 只竖屏，这样字大一倍多），两指放大
private struct SidewaysViewer: View {
    var image: UIImage
    var close: () -> Void
    @State private var zoom: CGFloat = 1
    @State private var pinch: CGFloat = 1

    var body: some View {
        GeometryReader { g in
            let longSide = g.size.height, shortSide = g.size.width
            let k = min(longSide / max(1, image.size.width), shortSide / max(1, image.size.height)) * zoom * pinch
            let w = image.size.width * k, h = image.size.height * k
            ScrollView([.horizontal, .vertical]) {
                Image(uiImage: image)
                    .resizable()
                    .interpolation(.high)
                    .frame(width: w, height: h)
                    .rotationEffect(.degrees(90))
                    .frame(width: max(h, shortSide), height: max(w, longSide))
            }
            .simultaneousGesture(
                MagnifyGesture()
                    .onChanged { v in pinch = v.magnification }
                    .onEnded { v in zoom = min(4, max(1, zoom * v.magnification)); pinch = 1 }
            )
        }
        .background(Color.black)
        .ignoresSafeArea()
        .overlay(alignment: .topTrailing) {
            Button(YingCunStrings.close, action: close)
                .font(.system(size: 17, weight: .bold))
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(.ultraThinMaterial, in: Capsule())
                .padding(16)
        }
    }
}

// ================================================================ 改数
private struct YingCunEdit: View {
    var label: YCLabel
    var job: YCJob?
    var drawn: YCDrawn?
    var mode: YCMode
    var done: (YCNum, String) -> Void
    var cancel: () -> Void

    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        let p = YingCun.parseNum(text)
        let unit = mode == .in2mm ? YingCunStrings.mm : YingCunStrings.inches
        VStack(alignment: .leading, spacing: 14) {
            Text(YingCunStrings.edTitle).font(Paper.brush(28, relativeTo: .title))
            Text(meta).font(Paper.serif(14)).foregroundStyle(Paper.inkSoft)
            HStack(spacing: 10) {
                Button {
                    let v = text.trimmingCharacters(in: .whitespaces)
                    if v.hasPrefix("-") { text = String(v.dropFirst()) } else if v.hasPrefix("+") { text = "-" + String(v.dropFirst()) } else { text = "-" + v }
                } label: {
                    Text("±").font(.system(size: 26, weight: .bold)).frame(width: 58, height: 58)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Paper.ink, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(YingCunStrings.signLabel)
                BigField(placeholder: YingCunStrings.numLabel, text: $text, keyboard: .numbersAndPunctuation, bad: p == nil && !text.trimmingCharacters(in: .whitespaces).isEmpty)
                    .focused($focused)
                    .onSubmit { if let p { done(p, text.trimmingCharacters(in: .whitespaces)) } }
            }
            if let p {
                (Text("= ") + Text(YingCun.convert(p, mode)).bold().foregroundColor(YingCunColors.red) + Text(" " + unit))
                    .font(.system(size: 22, weight: .semibold).monospacedDigit())
            } else {
                Text(YingCunStrings.numHint).font(Paper.serif(14)).foregroundStyle(Paper.inkSoft)
            }
            if let s = suggestion {
                HStack {
                    (Text(label.key == "LCL" || label.key == "UCL" ? YingCunStrings.sugCalc : YingCunStrings.sugBack) + Text(s).bold())
                        .font(Paper.serif(15))
                    Spacer()
                    Button(YingCunStrings.sugUse) { text = s }.font(Paper.serif(15)).bold()
                }
                .padding(10)
                .background(Color(hex: 0xffd60a, alpha: 0.3), in: RoundedRectangle(cornerRadius: 6))
            }
            HStack(spacing: 10) {
                InkButton(title: YingCunStrings.cancel, action: cancel)
                InkButton(title: YingCunStrings.ok, solid: true) {
                    if let p { done(p, text.trimmingCharacters(in: .whitespaces)) }
                }
                .disabled(p == nil)
                .opacity(p == nil ? 0.45 : 1)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .paperPage(figures: false)
        .onAppear {
            text = label.item.num?.s ?? label.item.text
            focused = true
        }
    }

    private var meta: String {
        var s = ""
        if label.row >= 0, let A = job?.table, label.row < A.rows.count, let no = A.rows[label.row]["NO"], !no.text.isEmpty {
            s += YingCunStrings.edRow(no.text) + " · "
        }
        s += label.key.flatMap { YingCunStrings.names[$0] } ?? YingCunStrings.edLoose
        return s + " · " + YingCunStrings.edReadAs(label.item.text)
    }

    private var suggestion: String? {
        guard label.row >= 0, let k = label.key, let d = drawn, label.row < d.checks.count else { return nil }
        return d.checks[label.row].sugg[k]
    }
}

enum YingCunColors {
    static let red = Color(hex: 0xd70015)
}
