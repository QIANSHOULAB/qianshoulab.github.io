import SwiftUI
import PhotosUI
import UIKit

// 铁件点钞机的界面：照 0.5.0 那台机器（Song 11-04 给的三张参考图定的长相），放在铁屑江湖里也用它自己的脸。
// 上面机身面板：四颗螺丝、六角图标、「千手院出品 / 铁件点钞机」、状态灯（待机 / 点钞中 / 完成 / 卡钞了）、绿色七段数码管。
// 中间取景器：没拍的时候演示托盘自己点数，拍了换成照片 + 圆点。底下浮着一条快门玻璃：左相册、中间紫色滚花旋钮、右设置。

enum DianChaoTool {
    static let entry = ToolEntry(id: "dianchao", name: DianChaoStrings.name, sub: DianChaoStrings.tile, symbol: "circle.grid.3x3.fill") {
        AnyView(DianChaoView())
    }
}

struct DianChaoView: View {
    @EnvironmentObject private var butler: Butler
    @EnvironmentObject private var nav: Nav
    @StateObject private var vm = DianChaoModel()
    @State private var camera = false
    @State private var album: [PhotosPickerItem] = []
    @State private var share: ShareBox?
    @State private var pop = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                face
                chips
                finder
                acts
                Text(DianChaoStrings.foot)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(DCColor.faint)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 6)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 130)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .background(NightBackground())
        .foregroundStyle(DCColor.white)
        .overlay(alignment: .bottom) { deck }
        .toolbarColorScheme(.dark, for: .navigationBar)
        .onAppear {
            vm.post = butler
            if Demo.on, vm.photo == nil, let path = UserDefaults.standard.string(forKey: "TXSample"), let img = UIImage(contentsOfFile: path) { vm.showDemo(img) }
        }
        .onDisappear { vm.leave() }
        .fullScreenCover(isPresented: $camera) {
            CameraPicker { img in
                camera = false
                if let img { vm.take(img) }
            }
            .ignoresSafeArea()
        }
        .onChange(of: album) { _, new in
            guard let it = new.first else { return }
            album = []
            Task {
                if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { vm.take(img) }
            }
        }
        .sheet(item: $share) { box in ActivitySheet(items: [box.image]) }
    }

    private var state: (String, Color, Bool) {
        if vm.refused != nil { return (DianChaoStrings.stJam, DCColor.red, false) }
        switch vm.run?.phase {
        case .waiting?, .first?: return (DianChaoStrings.stBusy, DCColor.pink, true)
        case .done?: return (DianChaoStrings.stDone, DCColor.lime, false)
        case .jam?: return (DianChaoStrings.stJam, DCColor.red, false)
        default: return (DianChaoStrings.stIdle, DCColor.lime, false)
        }
    }

    // ------------------------------------------------------------ 机身面板
    private var face: some View {
        let st = state
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                HexBadge().frame(width: 34, height: 38)
                VStack(alignment: .leading, spacing: 1) {
                    Text(DianChaoStrings.lab).font(.system(size: 11, weight: .bold)).tracking(2.2).foregroundStyle(DCColor.pink)
                    Text(DianChaoStrings.name).font(.system(size: 23, weight: .black))
                }
                Spacer(minLength: 4)
                HStack(spacing: 7) {
                    TimelineView(.periodic(from: .now, by: 0.35)) { t in
                        let blink = st.2 && !reduce && Int(t.date.timeIntervalSinceReferenceDate / 0.35) % 2 == 1
                        Circle().fill(st.1).frame(width: 8, height: 8).shadow(color: st.1, radius: 5).opacity(blink ? 0.25 : 1)
                    }
                    .frame(width: 8, height: 8)
                    Text(st.0).font(.system(size: 13.5, weight: .bold)).tracking(0.8)
                }
                .padding(.leading, 9).padding(.trailing, 11)
                .frame(height: 28)
                .background(Color(hex: 0x05031a, alpha: 0.55), in: Capsule())
                .overlay(Capsule().strokeBorder(Color.white.opacity(0.1)))
                .accessibilityElement(children: .combine)
            }
            .padding(.horizontal, 4)
            if vm.run == nil && vm.refused == nil {
                Text(DianChaoStrings.sub).font(.system(size: 14, weight: .semibold)).foregroundStyle(DCColor.muted).lineSpacing(3).padding(.horizontal, 4)
            }
            lcd
            if let r = vm.run, r.phase == .done, r.total > 0, !counting {
                HStack(spacing: 7) {
                    Image(systemName: "laurel.leading").foregroundStyle(DCColor.lime)
                    Text(DianChaoStrings.certified).font(.system(size: 13.5, weight: .heavy))
                    Image(systemName: "laurel.trailing").foregroundStyle(DCColor.lime)
                    Spacer()
                    Text(DianChaoStrings.byButler + " · " + Self.hhmm(r.sentAt)).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(DCColor.faint)
                }
                .padding(.horizontal, 4)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 16)
        .background(PanelBack())
    }

    static func hhmm(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: d)
    }

    /// 数完从 0 跑到总数的那一下还没跑完
    private var counting: Bool {
        guard let s = vm.countFrom, let r = vm.run else { return false }
        return Date().timeIntervalSince(s) < Self.countDur(r.total) && !reduce
    }

    static func countDur(_ n: Int) -> Double { min(1.9, max(0.7, Double(n) * 0.046)) }

    private var lcd: some View {
        HStack(spacing: 14) {
            TimelineView(.animation(minimumInterval: 1 / 30, paused: reduce)) { t in
                SevenSeg(lit: lit(at: t.date))
                    .scaleEffect(pop ? 1.06 : 1)
            }
            .frame(height: 74)
            .accessibilityLabel("\(vm.run?.total ?? 0) \(DianChaoStrings.unit)")
            VStack(alignment: .leading) {
                Text(DianChaoStrings.unit).font(.system(size: 22, weight: .black)).foregroundStyle(DCColor.lime).shadow(color: DCColor.lime.opacity(0.55), radius: 5)
                Spacer(minLength: 6)
                if let ed = vm.run?.editedText, vm.run?.phase == .done {
                    Text(ed).font(.system(size: 13, weight: .bold)).foregroundStyle(DCColor.pink)
                        .padding(.horizontal, 7).padding(.vertical, 4)
                        .background(DCColor.pink.opacity(0.16), in: RoundedRectangle(cornerRadius: 6))
                }
            }
            .frame(height: 74)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 14).padding(.leading, 20).padding(.trailing, 16)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(LinearGradient(colors: [Color(hex: 0x05031a), Color(hex: 0x0b0828)], startPoint: .top, endPoint: .bottom))
                .overlay(RoundedRectangle(cornerRadius: 18).fill(LinearGradient(colors: [.white.opacity(0.09), .clear], startPoint: .topLeading, endPoint: UnitPoint(x: 0.45, y: 0.6))))
                .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Color.white.opacity(0.05)))
                .shadow(color: .black.opacity(0.6), radius: 6, y: 3)
        )
        .onChange(of: vm.countFrom) { _, s in
            guard let s, let r = vm.run, !reduce else { return }
            let d = Self.countDur(r.total)
            DispatchQueue.main.asyncAfter(deadline: .now() + d) {
                guard vm.countFrom == s else { return }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.45)) { pop = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { withAnimation(.easeOut(duration: 0.2)) { pop = false } }
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
    }

    /// 数码管此刻每一位亮哪几段
    private func lit(at now: Date) -> (Int) -> String {
        guard let r = vm.run else {
            if vm.refused != nil { return SevenSeg.text("Err") }
            return SevenSeg.text("0")
        }
        switch r.phase {
        case .waiting:
            // 145：大管家边数边寄点，数字跟着跳
            if r.liveTotal > 0 { return SevenSeg.text(String(reduce ? r.liveTotal : r.liveShown(at: now))) }
            // 点钞中：每一位一段一段转圈
            if reduce { return SevenSeg.text("----") }
            let k = Int(now.timeIntervalSinceReferenceDate / 0.085)
            let loop = Array("abcdef")
            return { i in String(loop[(k + i) % 6]) }
        case .jam:
            return SevenSeg.text("Err")
        default:
            return SevenSeg.text(String(shownCount(at: now)))
        }
    }

    /// 从 0 跑上去
    private func shownCount(at now: Date) -> Int {
        guard let r = vm.run else { return 0 }
        guard let s = vm.countFrom, !reduce else { return r.total }
        let d = Self.countDur(r.total)
        let k = min(1, now.timeIntervalSince(s) / d)
        let e = 1 - pow(1 - k, 1.8)
        return Int((e * Double(r.total)).rounded())
    }

    // ------------------------------------------------------------ 好几盒时的小牌子
    @ViewBuilder private var chips: some View {
        if let r = vm.run, r.phase == .done, r.trays.count > 1 || (r.trays.count == 1 && !r.trays[0].complete) {
            FlowChips(trays: r.trays) { vm.toggle($0) }
        }
    }

    // ------------------------------------------------------------ 取景器
    private var finder: some View {
        VStack(spacing: 0) {
            Ruler(busy: vm.busy).frame(width: 170, height: 11).padding(.top, 2).padding(.bottom, 9)
            if let photo = vm.photo {
                PhotoDots(photo: photo, run: vm.run, countFrom: vm.countFrom) { y, x, hit, asp in
                    vm.tap(y: y, x: x, hitX: hit, aspect: asp)
                }
            } else {
                Button { shoot() } label: { viewfinder }
                    .buttonStyle(.plain)
                    .accessibilityLabel(DianChaoStrings.hint)
            }
            let line = statusText
            if !line.isEmpty {
                Text(line)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(isWarn ? DCColor.warn : DCColor.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8).padding(.horizontal, 4)
            }
            if vm.refused != nil && !(butler.dcPaired) {
                Button(DianChaoStrings.settingsGo) { nav.path.append(.settings) }
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Color(hex: 0x1a1060))
                    .padding(.horizontal, 14).frame(height: 40)
                    .background(DCColor.lime, in: RoundedRectangle(cornerRadius: 12))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8)
            }
        }
        .padding(10)
        .background(PanelBack(screws: false))
    }

    private var isWarn: Bool {
        if vm.refused != nil { return true }
        if case .jam? = vm.run?.phase { return true }
        return false
    }

    private var statusText: String {
        if let s = vm.refused { return s }
        guard let r = vm.run else { return "" }
        if r.phase == .waiting {
            let w = DianChaoStrings.working
            return w[(vm.ticker / 2) % w.count]
        }
        return r.statusLine
    }

    private var viewfinder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18)
                .fill(RadialGradient(colors: [Color(hex: 0x3022c9), Color(hex: 0x1b1278), Color(hex: 0x0d0838)], center: UnitPoint(x: 0.5, y: 0.46), startRadius: 0, endRadius: 260))
            DemoTray().padding(.horizontal, 22).padding(.top, 34).padding(.bottom, 6)
            Beam()
            Corners()
            HStack(spacing: 7) {
                Image(systemName: "viewfinder").font(.system(size: 14, weight: .bold)).foregroundStyle(DCColor.lime)
                Text(DianChaoStrings.hint).font(.system(size: 13, weight: .bold))
            }
            .padding(.leading, 10).padding(.trailing, 12).padding(.vertical, 6)
            .background(Color(hex: 0x05031a, alpha: 0.62), in: Capsule())
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.12)))
            .frame(maxHeight: .infinity, alignment: .top)
            .padding(.top, 12)
        }
        .aspectRatio(16 / 9.6, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    // ------------------------------------------------------------ 存图 / 重数
    private var acts: some View {
        HStack(spacing: 10) {
            Button {
                if let p = vm.photo, let r = vm.run { share = ShareBox(image: DCDraw.poster(photo: p, run: r)) }
            } label: {
                Text(DianChaoStrings.save).font(.system(size: 15.5, weight: .heavy)).frame(maxWidth: .infinity, minHeight: 52)
                    .foregroundStyle(.white)
                    .background(LinearGradient(colors: [DCColor.blue2, DCColor.blue], startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: 15))
                    .shadow(color: DCColor.blue.opacity(0.55), radius: 11, y: 8)
            }
            .disabled(!(vm.run?.phase == .done) || counting)
            .opacity(vm.run?.phase == .done ? 1 : 0.42)
            Button { vm.send() } label: {
                Text(DianChaoStrings.recount).font(.system(size: 15.5, weight: .heavy)).frame(maxWidth: .infinity, minHeight: 52)
                    .background(DCColor.glass, in: RoundedRectangle(cornerRadius: 15))
                    .overlay(RoundedRectangle(cornerRadius: 15).strokeBorder(DCColor.glassLine))
            }
            .disabled(vm.photo == nil || vm.busy)
            .opacity(vm.photo == nil || vm.busy ? 0.42 : 1)
        }
        .buttonStyle(.plain)
    }

    // ------------------------------------------------------------ 快门台
    private var deck: some View {
        HStack {
            PhotosPicker(selection: $album, maxSelectionCount: 1, matching: .images) {
                SideKey(symbol: "photo", label: DianChaoStrings.albumShort, round: false)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity)
            Button { shoot() } label: { Knob() }
                .buttonStyle(KnobPress())
                .accessibilityLabel(DianChaoStrings.hint)
                .offset(y: -18)
            Button { nav.path.append(.settings) } label: {
                SideKey(symbol: "gearshape", label: DianChaoStrings.settings, round: true)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 8)
        .frame(height: 86)
        .background(
            RoundedRectangle(cornerRadius: 30)
                .fill(LinearGradient(colors: [Color(hex: 0x2c2278, alpha: 0.74), Color(hex: 0x100b35, alpha: 0.86)], startPoint: .top, endPoint: .bottom))
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 30))
                .overlay(RoundedRectangle(cornerRadius: 30).strokeBorder(Color.white.opacity(0.14)))
                .shadow(color: Color(hex: 0x030114, alpha: 0.62), radius: 18, y: 16)
        )
        .frame(maxWidth: 408)
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    private func shoot() {
        guard !vm.busy else { return }
        if CameraPicker.available { camera = true }
    }
}

private struct ShareBox: Identifiable {
    let id = UUID()
    let image: UIImage
}

/// 系统分享面板（能存相册）
private struct ActivitySheet: UIViewControllerRepresentable {
    var items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// ================================================================ 照片 + 圆点
private struct PhotoDots: View {
    var photo: UIImage
    var run: DCRun?
    var countFrom: Date?
    var onTap: (Double, Double, Double, Double) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        let busy = run?.phase == .waiting
        GeometryReader { g in
            let W = g.size.width, H = g.size.height
            ZStack {
                Image(uiImage: photo).resizable()
                    .saturation(busy ? 0.5 : 1)
                    .brightness(busy ? -0.3 : 0)
                    .animation(.easeOut(duration: 0.3), value: busy)
                if let r = run, !r.trays.isEmpty, r.phase != .waiting || r.liveTotal > 0 {
                    TimelineView(.animation(minimumInterval: 1 / 30, paused: reduce || (countFrom == nil && r.phase != .waiting))) { t in
                        Canvas { ctx, size in
                            let n = self.upto(r, at: t.date)
                            ctx.withCGContext { cg in DCDraw.dots(cg, trays: r.trays, W: Double(size.width), H: Double(size.height), upto: n) }
                        }
                    }
                    .allowsHitTesting(false)
                }
                if busy { Scan() }
            }
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { p in
                guard let r = run, r.phase == .done else { return }
                let R = DianChao.radius(r.trays, w: Double(W), h: Double(H))
                let hit = max(R * 1.8, 22) * 1000 / Double(W)
                onTap(Double(p.y) * 1000 / Double(H), Double(p.x) * 1000 / Double(W), hit, Double(H) / Double(W))
            }
        }
        .aspectRatio(photo.size.width / max(1, photo.size.height), contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .accessibilityLabel(DianChaoStrings.fixHint)
    }

    /// 圆点一排一排亮：跟数码管一起从 0 跑到总数
    private func upto(_ r: DCRun, at now: Date) -> Int {
        if r.phase == .waiting { return reduce ? .max : r.liveShown(at: now) }      // 145 partial：新来的一个个亮
        guard let s = countFrom, !reduce else { return .max }
        let d = min(1.9, max(0.7, Double(r.total) * 0.046))
        let k = min(1, now.timeIntervalSince(s) / d)
        if k >= 1 { return .max }
        return Int(((1 - pow(1 - k, 1.8)) * Double(r.total)).rounded())
    }
}

// ================================================================ 小零件
private struct NightBackground: View {
    var body: some View {
        GeometryReader { g in
            ZStack {
                LinearGradient(colors: [DCColor.night2, DCColor.night], startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [Color(hex: 0x4836ff, alpha: 0.62), .clear], center: UnitPoint(x: 0.5, y: -0.04), startRadius: 0, endRadius: g.size.width * 0.75)
                RadialGradient(colors: [Color(hex: 0xff8ce0, alpha: 0.2), .clear], center: UnitPoint(x: -0.06, y: 0.72), startRadius: 0, endRadius: g.size.width * 0.6)
                RadialGradient(colors: [Color(hex: 0x7b4dff, alpha: 0.3), .clear], center: UnitPoint(x: 1.06, y: 0.46), startRadius: 0, endRadius: g.size.width * 0.65)
            }
        }
        .ignoresSafeArea()
    }
}

/// 机身面板：渐变、亮边、四颗十字螺丝
private struct PanelBack: View {
    var screws = true
    var body: some View {
        RoundedRectangle(cornerRadius: 26)
            .fill(LinearGradient(stops: [.init(color: Color(hex: 0x221a63), location: 0), .init(color: DCColor.body, location: 0.46), .init(color: DCColor.body2, location: 1)],
                                 startPoint: .top, endPoint: .bottom))
            .overlay(RoundedRectangle(cornerRadius: 26).strokeBorder(Color.white.opacity(0.1)))
            .shadow(color: Color(hex: 0x030114, alpha: 0.55), radius: 20, y: 18)
            .overlay {
                if screws {
                    GeometryReader { g in
                        ForEach(0..<4, id: \.self) { i in
                            Screw().position(x: i % 2 == 0 ? 13.5 : g.size.width - 13.5, y: i < 2 ? 13.5 : g.size.height - 13.5)
                        }
                    }
                }
            }
    }
}

private struct Screw: View {
    var body: some View {
        ZStack {
            Circle().fill(RadialGradient(colors: [Color(hex: 0xa49dd6), Color(hex: 0x4a4386)], center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: 6))
            Rectangle().fill(Color(hex: 0x0a0628, alpha: 0.75)).frame(width: 6, height: 1.4).rotationEffect(.degrees(45))
            Rectangle().fill(Color(hex: 0x0a0628, alpha: 0.75)).frame(width: 6, height: 1.4).rotationEffect(.degrees(-45))
        }
        .frame(width: 9, height: 9)
    }
}

/// 六角图标：粉紫蓝渐变，里面九颗点三颗绿
private struct HexBadge: View {
    var body: some View {
        Canvas { ctx, size in
            let k = min(size.width / 30, size.height / 34)
            ctx.scaleBy(x: k, y: k)
            var hex = Path()
            hex.addLines([CGPoint(x: 15, y: 3), CGPoint(x: 27, y: 9.8), CGPoint(x: 27, y: 24.2), CGPoint(x: 15, y: 31), CGPoint(x: 3, y: 24.2), CGPoint(x: 3, y: 9.8)])
            hex.closeSubpath()
            ctx.fill(hex, with: .linearGradient(Gradient(colors: [Color(hex: 0xff9ae6), Color(hex: 0x8b5cff), Color(hex: 0x3d2bff)]), startPoint: .zero, endPoint: CGPoint(x: 30, y: 34)))
            ctx.stroke(hex, with: .color(.white.opacity(0.55)), lineWidth: 1.2)
            let lime: Set<Int> = [2, 4, 6]
            for r in 0..<3 {
                for c in 0..<3 {
                    let i = r * 3 + c
                    ctx.fill(Path(ellipseIn: CGRect(x: 10 + Double(c) * 5 - 1.9, y: 13.5 + Double(r) * 5 - 1.9, width: 3.8, height: 3.8)), with: .color(lime.contains(i) ? DCColor.lime : .white))
                }
            }
        }
        .shadow(color: Color(hex: 0xff6ed2, alpha: 0.45), radius: 5, y: 4)
    }
}

/// 取景器上面那把尺子，点钞中指针左右晃
private struct Ruler: View {
    var busy: Bool
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !busy || reduce)) { t in
            Canvas { ctx, size in
                let W = Double(size.width), Hh = Double(size.height)
                var x = 0.0
                while x < W {
                    let fade = min(1, min(x / (W * 0.22), (W - x) / (W * 0.22)))
                    ctx.fill(Path(CGRect(x: x, y: 0, width: 2, height: Hh)), with: .color(DCColor.white.opacity(0.5 * max(0, fade))))
                    x += 10
                }
                var nx = W / 2
                if busy && !reduce {
                    let ph = t.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2.2) / 2.2
                    let tri = ph < 0.5 ? ph * 2 : 2 - ph * 2
                    let ease = 0.5 - 0.5 * cos(tri * .pi)
                    nx += -58 + 116 * ease
                }
                ctx.fill(Path(roundedRect: CGRect(x: nx - 1.5, y: -3, width: 3, height: Hh + 6), cornerRadius: 1.5), with: .color(DCColor.lime))
            }
        }
    }
}

/// 演示托盘上来回扫的那道绿光
private struct Beam: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduce)) { t in
            GeometryReader { g in
                let ph = t.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3.4) / 3.4
                let y = Double(g.size.height) * (0.24 + 0.66 * (0.5 - 0.5 * cos(ph * .pi)))
                let op = ph < 0.1 ? ph / 0.1 * 0.85 : (ph > 0.8 ? (1 - ph) / 0.2 * 0.85 : 0.85)
                Capsule().fill(DCColor.lime).frame(width: g.size.width * 0.88, height: 2)
                    .shadow(color: DCColor.lime.opacity(0.55), radius: 7)
                    .position(x: g.size.width / 2, y: y)
                    .opacity(reduce ? 0 : op)
            }
        }
        .allowsHitTesting(false)
    }
}

/// 取景器四个角
private struct Corners: View {
    var body: some View {
        GeometryReader { g in
            let w = Double(g.size.width), h = Double(g.size.height)
            Path { p in
                for (x, y, sx, sy) in [(12.0, 12.0, 1.0, 1.0), (w - 12, 12, -1, 1), (12, h - 12, 1, -1), (w - 12, h - 12, -1, -1)] {
                    p.move(to: CGPoint(x: x, y: y + sy * 20))
                    p.addLine(to: CGPoint(x: x, y: y))
                    p.addLine(to: CGPoint(x: x + sx * 20, y: y))
                }
            }
            .stroke(DCColor.lime, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            .shadow(color: DCColor.lime.opacity(0.6), radius: 4)
        }
        .allowsHitTesting(false)
    }
}

/// 点钞中：照片上一道粉光往下扫
private struct Scan: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduce)) { t in
            GeometryReader { g in
                let ph = t.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.8) / 1.8
                let e = 0.5 - 0.5 * cos(ph * .pi)
                let gh = Double(g.size.height)
                let bh = gh * 0.24
                LinearGradient(stops: [.init(color: DCColor.pink.opacity(0), location: 0), .init(color: DCColor.pink.opacity(0.3), location: 0.72), .init(color: .white.opacity(0.85), location: 1)],
                               startPoint: .top, endPoint: .bottom)
                    .frame(height: bh)
                    .position(x: g.size.width / 2, y: -bh / 2 + (gh + bh) * e)
            }
        }
        .allowsHitTesting(false)
    }
}

private struct SideKey: View {
    var symbol: String
    var label: String
    var round: Bool
    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: symbol).font(.system(size: 20, weight: .semibold))
                .frame(width: 48, height: 48)
                .background(LinearGradient(colors: [Color(hex: 0x2a2170), Color(hex: 0x1a1350)], startPoint: .top, endPoint: .bottom),
                            in: RoundedRectangle(cornerRadius: round ? 24 : 15))
                .overlay(RoundedRectangle(cornerRadius: round ? 24 : 15).strokeBorder(Color.white.opacity(0.1)))
                .shadow(color: Color(hex: 0x030114, alpha: 0.5), radius: 7, y: 6)
            Text(label).font(.system(size: 12, weight: .bold)).foregroundStyle(DCColor.muted)
        }
        .foregroundStyle(DCColor.white)
        .frame(minWidth: 72)
    }
}

/// 紫色滚花旋钮：一圈滚花慢慢转，中间一颗「拍」
private struct Knob: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        ZStack {
            Circle().fill(RadialGradient(colors: [Color(hex: 0x0f0a3a), Color(hex: 0x06041c)], center: UnitPoint(x: 0.5, y: 0.38), startRadius: 0, endRadius: 53))
                .shadow(color: .black.opacity(0.7), radius: 6, y: 4)
            TimelineView(.animation(minimumInterval: 1 / 20, paused: reduce)) { t in
                Circle()
                    .fill(AngularGradient(stops: Self.ridges, center: .center))
                    .rotationEffect(.degrees(t.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 48) / 48 * 360))
            }
            .padding(8)
            .shadow(color: Color(hex: 0x7b4dff, alpha: 0.45), radius: 15)
            Circle().fill(RadialGradient(colors: [.white.opacity(0.5), .white.opacity(0)], center: UnitPoint(x: 0.33, y: 0.25), startRadius: 0, endRadius: 45)).padding(8)
            Circle()
                .fill(RadialGradient(stops: [.init(color: Color(hex: 0xcdb8ff), location: 0), .init(color: Color(hex: 0x8a5dff), location: 0.4), .init(color: Color(hex: 0x5226d8), location: 1)],
                                     center: UnitPoint(x: 0.42, y: 0.3), startRadius: 0, endRadius: 40))
                .padding(23)
                .shadow(color: Color(hex: 0x0a0032, alpha: 0.5), radius: 3, y: 2)
            Text(DianChaoStrings.cap).font(.system(size: 31, weight: .black)).foregroundStyle(.white).shadow(color: Color(hex: 0x280a8c, alpha: 0.65), radius: 0, y: 2)
        }
        .frame(width: 106, height: 106)
    }

    /// 滚花：每 10° 一道亮棱
    static let ridges: [Gradient.Stop] = {
        var s: [Gradient.Stop] = []
        for i in 0..<36 {
            let a = Double(i) / 36
            s.append(.init(color: Color(hex: 0x5427df), location: a))
            s.append(.init(color: Color(hex: 0x5427df), location: a + 5.0 / 360))
            s.append(.init(color: Color(hex: 0xa581ff), location: a + 5.01 / 360))
            s.append(.init(color: Color(hex: 0xa581ff), location: a + 6.4 / 360))
            s.append(.init(color: Color(hex: 0x6b3df1), location: a + 6.41 / 360))
            s.append(.init(color: Color(hex: 0x6b3df1), location: a + 9.99 / 360))
        }
        return s
    }()
}

private struct KnobPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed ? 0.95 : 1).animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// 好几盒时的小牌子：第 N 盒 · M 件，「不算 / 也算上」
private struct FlowChips: View {
    var trays: [DCTray]
    var toggle: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(trays.enumerated()), id: \.offset) { i, t in
                HStack(spacing: 8) {
                    Circle().fill(Color(uiColor: DCDraw.color(i))).frame(width: 14, height: 14).opacity(t.on ? 1 : 0.4)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(DianChaoStrings.trayN(i + 1) + " · " + (t.on ? DianChaoStrings.trayPcs(t.pts.count) : DianChaoStrings.cut))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(t.on ? DCColor.white : DCColor.faint)
                        if t.on && !t.complete {
                            Text(DianChaoStrings.cutMain).font(.system(size: 13, weight: .bold)).foregroundStyle(DCColor.warn)
                        }
                    }
                    Spacer()
                    if trays.count > 1 {
                        Button(t.on ? DianChaoStrings.exclude : DianChaoStrings.include) { toggle(i) }
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundStyle(DCColor.blue)
                            .padding(.horizontal, 11).frame(height: 30)
                            .background(DCColor.white, in: RoundedRectangle(cornerRadius: 9))
                            .buttonStyle(.plain)
                    }
                }
                .padding(.leading, 10).padding(.trailing, 6).padding(.vertical, 5)
                .frame(minHeight: 40)
                .background(DCColor.glass, in: RoundedRectangle(cornerRadius: 13))
                .overlay(RoundedRectangle(cornerRadius: 13).strokeBorder(t.on && !t.complete ? DCColor.warn.opacity(0.5) : DCColor.glassLine))
            }
        }
    }
}
