import SwiftUI
import PhotosUI
import UIKit

// 英寸照妖镜的界面：照网页 inch/index.html（134 起长相也照网页：深色工单皮，样子在 YingCunLook.swift）。
// 一条竖栏：标题 → 两种模式 → 照妖镜（八卦镜框、藤蔓、萤火，镜面就是快门，直接放在页面上）→ 进度 → 提示 → 相册 → 结果图。
// 结果图：红字写在原图上，点红字改数，能两指放大、能横过来看，能存图。
// 镜子的几层（藤蔓后层带镜光、外圈法阵、八卦镜框、藤蔓前层）是网页版自己画出来截的透明图（zhaoyao-*.webp），镜面、萤火这里画。
// 网页顶上切三个工具的标签和 EN/中文 不搬：app 里从工具箱进出，只要中文。

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
    /// 照过一次以后「对着检查表拍」那句就不出了（网页也是）
    @State private var ran = false

    private var mode: YCMode { YCMode(rawValue: modeRaw) ?? .in2mm }

    var body: some View {
        GeometryReader { outer in
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 14) {
                        header.zIndex(2)
                        modePicker.zIndex(2)
                        ZhaoYaoMirror(width: outer.size.width, busy: vm.busy, flash: flash) { shoot() }
                            .padding(.horizontal, -16)
                            .zIndex(1)
                        statusCard.zIndex(2)
                        if !ran {
                            hint.zIndex(2)
                        }
                        albumButton.zIndex(2)
                        if vm.job != nil || vm.drawn != nil {
                            result.id("result").zIndex(2)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 32)
                }
                .onChange(of: vm.drawn != nil) { _, has in
                    if has { withAnimation { proxy.scrollTo("result", anchor: .top) } }
                }
            }
        }
        .background(YC.bg.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .toolChrome(tint: YC.accent, dark: true)
        .onAppear {
            // 截图用：-TXDemo YES -TXSample <检查表照片>，进来就照一张
            if Demo.on, vm.job == nil, !vm.busy, let path = UserDefaults.standard.string(forKey: "TXSample"), let img = UIImage(contentsOfFile: path) { start(img) }
        }
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
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(20)
            .presentationBackground(YC.surface2)
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
        ran = true
        vm.run(img, mode: mode)
    }

    // ------------------------------------------------------------ 标题（网页 .head：居中，30 号，字距拉开一点）
    private var header: some View {
        VStack(spacing: 6) {
            Text(YingCunStrings.name).font(YC.ui(30, .bold)).tracking(1.8).foregroundStyle(YC.ink)
            Text(YingCunStrings.sub).font(YC.ui(15)).foregroundStyle(YC.muted).multilineTextAlignment(.center).lineSpacing(5)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 2)
    }

    // ------------------------------------------------------------ 两种模式（网页 .seg：亮蓝滑块左右滑）
    private var modePicker: some View {
        GeometryReader { g in
            let half = (g.size.width - 6) / 2
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 10).fill(YC.accent)
                    .shadow(color: .black.opacity(0.35), radius: 1.5, y: 1)
                    .frame(width: half)
                    .offset(x: mode == .in2mm ? 0 : half)
                    .animation(.timingCurve(0.3, 0.7, 0.2, 1, duration: 0.24), value: modeRaw)
                HStack(spacing: 0) {
                    ForEach(YCMode.allCases, id: \.self) { m in
                        let on = m == mode
                        Button {
                            modeRaw = m.rawValue
                        } label: {
                            Text(m == .in2mm ? YingCunStrings.in2mm : YingCunStrings.mm2in)
                                .font(YC.ui(16, .bold)).tracking(0.16)
                                .foregroundStyle(on ? YC.onAccent : YC.muted)
                                .animation(.easeOut(duration: 0.2), value: on)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
            }
            .padding(3)
        }
        .frame(height: 58)
        .background(YC.surface, in: RoundedRectangle(cornerRadius: 13))
        .overlay(RoundedRectangle(cornerRadius: 13).strokeBorder(YC.line, lineWidth: 1))
    }

    // ------------------------------------------------------------ 进度（网页 .status：一张小卡，字 + 百分比 + 一根细条；失败时橙边、没有条）
    @ViewBuilder private var statusCard: some View {
        if let s = vm.step {
            let p = Self.stepPct(s)
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(Self.stepText(s)).font(YC.ui(15, .semibold)).foregroundStyle(YC.ink)
                    Spacer()
                    Text("\(Int(p * 100))%").font(YC.num(17)).monospacedDigit().foregroundStyle(YC.accent)
                }
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(YC.line)
                        Capsule().fill(YC.accent).frame(width: g.size.width * p)
                    }
                }
                .frame(height: 4)
                .padding(.top, 10)
                .animation(.easeOut(duration: 0.3), value: p)
            }
            .padding(EdgeInsets(top: 13, leading: 14, bottom: 14, trailing: 14))
            .background(YC.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(YC.line, lineWidth: 1))
        } else if let e = vm.error {
            Text(e).font(YC.ui(15, .semibold)).foregroundStyle(YC.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(EdgeInsets(top: 13, leading: 14, bottom: 14, trailing: 14))
                .background(YC.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(YC.warn, lineWidth: 1))
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

    // ------------------------------------------------------------ 提示 + 相册（网页 .hint、.album）
    private var hint: some View {
        VStack(spacing: 2) {
            Text(YingCunStrings.hintTitle).font(YC.ui(17, .bold)).tracking(0.68).foregroundStyle(YC.ink)
            Text(YingCunStrings.hintText).font(YC.ui(13.5)).foregroundStyle(YC.muted)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }

    private var albumButton: some View {
        PhotosPicker(selection: $album, maxSelectionCount: 1, matching: .images) {
            HStack(spacing: 10) {
                Image(systemName: "photo").font(.system(size: 19, weight: .medium))
                Text(YingCunStrings.album).font(YC.ui(16, .bold))
            }
            .foregroundStyle(YC.ink)
            .frame(maxWidth: 300, minHeight: 52)
            .background(YC.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(YC.fieldLine, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(YCPress())
        .disabled(vm.busy)
        .frame(maxWidth: .infinity)
    }

    // ------------------------------------------------------------ 结果（网页 .result）
    @ViewBuilder private var result: some View {
        let sum = vm.summary(mode: mode)
        let line = sum.0, flagged = sum.1
        let none = vm.job == nil || vm.drawn == nil
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 9) {
                Circle().fill(none ? YC.warn : (flagged ? YC.flag : YC.ok)).frame(width: 9, height: 9).padding(.top, 6)
                Text(line).font(YC.ui(15, .bold)).foregroundStyle(YC.ink).lineSpacing(3)
            }
            if let job = vm.job, let u = job.unit, u != (mode == .in2mm ? "in" : "mm") {
                HStack(spacing: 12) {
                    Text(YingCunStrings.unitWrong(u == "in" ? YingCunStrings.inches : YingCunStrings.mm)).font(YC.ui(14)).foregroundStyle(YC.ink)
                    Spacer(minLength: 0)
                    Button { modeRaw = (mode == .in2mm ? YCMode.mm2in : YCMode.in2mm).rawValue } label: {
                        Text(YingCunStrings.unitFix).font(YC.ui(14, .bold)).foregroundStyle(YC.onAccent)
                            .padding(.horizontal, 14).frame(minHeight: 36)
                            .background(YC.warn, in: RoundedRectangle(cornerRadius: 9))
                    }
                    .buttonStyle(YCPress())
                }
                .padding(EdgeInsets(top: 11, leading: 14, bottom: 11, trailing: 12))
                .background(YC.warn.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(YC.warn.opacity(0.45), lineWidth: 1))
            }
            if let d = vm.drawn {
                picture(d)
                if d.image.size.width > 1200 {
                    Text(YingCunStrings.turn).font(YC.ui(13)).foregroundStyle(YC.muted)
                        .multilineTextAlignment(.center).frame(maxWidth: .infinity)
                }
                HStack(spacing: 10) {
                    ShareLink(item: Image(uiImage: d.image), preview: SharePreview(YingCunStrings.fileName, image: Image(uiImage: d.image))) {
                        Text(YingCunStrings.save).font(YC.ui(16, .bold)).foregroundStyle(YC.onAccent)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(YC.accent, in: RoundedRectangle(cornerRadius: 15))
                    }
                    .buttonStyle(YCPress())
                    YCButton(action: { shoot() }) { Text(YingCunStrings.again) }
                        .disabled(vm.busy)
                }
                YCButton(action: { sideways = true }) { Text(YingCunStrings.sideways) }
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
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(YC.line, lineWidth: 1))
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

// ================================================================ 照妖镜（网页 .hero）
/// 照妖镜直接放在页面上（网页就是这样，藤蔓的蓝光在深底上才亮）：整屏宽，高 = 镜子 + 56；藤蔓往上下伸出去，压在标题、按钮底下。
/// 镜面一按就开相机；外圈法阵慢慢转，照妖时转快、镜面扫光、萤火停住
struct ZhaoYaoMirror: View {
    var width: CGFloat
    var busy: Bool
    var flash: Int
    var action: () -> Void

    @State private var grown = false
    @State private var burst = false
    @State private var clock = SpinClock()
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        let D = min(width * 0.68, 300)
        ZStack {
            layer("zhaoyao-back", side: D * 2)
                .scaleEffect(grown || reduce ? 1 : 0.62)
                .opacity(grown || reduce ? 1 : 0)
            if !reduce {
                YCSpores(side: D * 2, paused: busy)
            }
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
        .frame(width: width, height: D + 56)
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
        if let img = YC.image(name + ".webp") {
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
                    .font(YC.ui(18, .bold)).tracking(2.16)
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
            .animation(.timingCurve(0.3, 0.7, 0.2, 1, duration: 0.18), value: configuration.isPressed)
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
        .background(YC.bg)
        .ignoresSafeArea()
        .overlay(alignment: .topTrailing) {
            Button(action: close) {
                Text(YingCunStrings.close).font(YC.ui(16, .bold)).foregroundStyle(YC.ink)
                    .padding(.horizontal, 16).frame(minHeight: 44)
                    .background(YC.surface, in: Capsule())
                    .overlay(Capsule().strokeBorder(YC.fieldLine, lineWidth: 1))
            }
            .buttonStyle(YCPress())
            .padding(16)
        }
        .environment(\.colorScheme, .dark)
    }
}

// ================================================================ 改数（网页底部弹出的 .sheet）
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
        let bad = p == nil && !text.trimmingCharacters(in: .whitespaces).isEmpty
        let unit = mode == .in2mm ? YingCunStrings.mm : YingCunStrings.inches
        VStack(alignment: .leading, spacing: 0) {
            Text(YingCunStrings.edTitle).font(YC.ui(18, .bold)).foregroundStyle(YC.ink)
            Text(meta).font(YC.ui(13.5)).foregroundStyle(YC.muted).padding(.top, 2).padding(.bottom, 12)
            HStack(spacing: 8) {
                Button {
                    let v = text.trimmingCharacters(in: .whitespaces)
                    if v.hasPrefix("-") { text = String(v.dropFirst()) } else if v.hasPrefix("+") { text = "-" + String(v.dropFirst()) } else { text = "-" + v }
                } label: {
                    Text("±").font(YC.num(26)).foregroundStyle(YC.ink).frame(width: 54, height: 58)
                        .background(YC.surface, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(YC.fieldLine, lineWidth: 1))
                }
                .buttonStyle(YCPress())
                .accessibilityLabel(YingCunStrings.signLabel)
                TextField("", text: $text)
                    .keyboardType(.numbersAndPunctuation)
                    .font(YC.num(34)).monospacedDigit().tracking(0.68)
                    .foregroundStyle(YC.ink)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding(.horizontal, 14)
                    .frame(height: 58)
                    .background(YC.surface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(bad ? YC.warn : YC.fieldLine, lineWidth: 1))
                    .overlay(RoundedRectangle(cornerRadius: 13).stroke(bad ? YC.warn : YC.accent, lineWidth: 2).padding(-2).opacity(focused ? 1 : 0))
                    .focused($focused)
                    .accessibilityLabel(YingCunStrings.numLabel)
                    .onSubmit { if let p { done(p, text.trimmingCharacters(in: .whitespaces)) } }
            }
            Group {
                if let p {
                    (Text("= ") + Text(YingCun.convert(p, mode) + " ").font(YC.num(22)).foregroundColor(YC.prevRed) + Text(unit))
                } else {
                    Text(YingCunStrings.numHint)
                }
            }
            .font(YC.ui(15)).foregroundStyle(YC.muted)
            .padding(.top, 10).padding(.horizontal, 2)
            if let s = suggestion {
                HStack(spacing: 10) {
                    (Text(label.key == "LCL" || label.key == "UCL" ? YingCunStrings.sugCalc : YingCunStrings.sugBack)
                     + Text(s).font(YC.num(20)).foregroundColor(YC.flag))
                        .font(YC.ui(14)).foregroundStyle(YC.ink)
                    Spacer(minLength: 0)
                    Button { text = s } label: {
                        Text(YingCunStrings.sugUse).font(YC.ui(14, .bold)).foregroundStyle(Color(hex: 0x1a1500))
                            .padding(.horizontal, 14).frame(minHeight: 36)
                            .background(YC.flag, in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(YCPress())
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(YC.flag.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(YC.flag.opacity(0.4), lineWidth: 1))
                .padding(.top, 12)
            }
            HStack(spacing: 10) {
                YCButton(action: cancel) { Text(YingCunStrings.cancel) }
                YCButton(primary: true, action: {
                    if let p { done(p, text.trimmingCharacters(in: .whitespaces)) }
                }) { Text(YingCunStrings.ok) }
                .disabled(p == nil)
            }
            .padding(.top, 16)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.top, 20)
        .padding(.bottom, 18)
        .environment(\.colorScheme, .dark)
        .tint(YC.accent)
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
