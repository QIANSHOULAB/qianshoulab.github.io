import UIKit

// 点钞机寄给大管家的那根线：信箱、加密、配对都用 app 本体那一套（App/Butler.swift 的「工具箱的一次性的信」），
// 这里只说点钞机要什么。单测里换成假的（走真加密、假信箱、假大管家）。
// 照片只寄给自己的大管家；不进发件箱、不排队、手机上不留底。大管家不在、没配对就直说，不寄。

@MainActor
protocol DianChaoPost: AnyObject {
    var dcPaired: Bool { get }
    /// 大管家在线、信箱连着
    var dcOnline: Bool { get }
    var dcSeen: Date? { get }
    var dcApp: String { get }
    func dcSend(id: String, data: [String: Any], files: [String: Data], onReply: @escaping (Data) -> Void) async throws
    func dcForget(_ id: String)
}

extension Butler: DianChaoPost {
    var dcPaired: Bool { pairing != nil }
    var dcOnline: Bool { online && connected }
    var dcSeen: Date? { seen }
    var dcApp: String { appVersion }

    func dcSend(id: String, data: [String: Any], files: [String: Data], onReply: @escaping (Data) -> Void) async throws {
        try await sendToolLetter(id: id, data: data, files: files, onReply: onReply)
    }

    func dcForget(_ id: String) { forgetToolLetter(id) }
}

/// 响一下：数完了叮一声；复查改了叮叮两声、震一下。n 每响一次加一，界面看着它放声音、弹一下
struct DCChime: Equatable {
    enum Kind: Equatable { case done, fixed }
    var n: Int
    var kind: Kind
}

/// 一盘照片从拍到出数
@MainActor
final class DianChaoModel: ObservableObject {
    /// 缩好的照片（只在内存里）
    @Published private(set) var photo: UIImage?
    @Published private(set) var run: DCRun?
    /// 没寄出去时的那句（没配对、大管家不在、网不通）
    @Published private(set) var refused: String?
    /// 数码管从 0 跑到总数的起点
    @Published private(set) var countFrom: Date?
    @Published private(set) var chime: DCChime?
    @Published var ticker = 0

    private var jpeg: Data?
    private var clock: Task<Void, Never>?
    private var ringing: Task<Void, Never>?
    /// 数码管还在跑，那一声叮还没响
    private var dingDue = false
    weak var post: DianChaoPost?

    var busy: Bool { run?.phase == .waiting }

    // ------------------------------------------------------------ 拍好了
    func take(_ img: UIImage) {
        guard let s = Self.shrink(img) else { return }
        photo = s.0
        jpeg = s.1
        send()
    }

    /// 缩到大管家看图的尺寸，扶正，JPEG 90
    static func shrink(_ img: UIImage) -> (UIImage, Data)? {
        let w = Int((img.size.width * img.scale).rounded()), h = Int((img.size.height * img.scale).rounded())
        guard w > 0, h > 0 else { return nil }
        let (rw, rh) = DianChao.resizedSize(w, h)
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        f.opaque = true
        let out = UIGraphicsImageRenderer(size: CGSize(width: rw, height: rh), format: f).image { _ in
            img.draw(in: CGRect(x: 0, y: 0, width: rw, height: rh))
        }
        guard let d = out.jpegData(compressionQuality: 0.9) else { return nil }
        return (out, d)
    }

    // ------------------------------------------------------------ 寄
    func send() {
        guard let jpeg, let post else { return }
        if let old = run { post.dcForget(old.id) }
        refused = nil
        countFrom = nil
        hush()
        guard post.dcPaired else {
            run = nil
            refused = DianChao.notPaired()
            return
        }
        guard post.dcOnline else {
            run = nil
            refused = DianChao.away(seen: post.dcSeen)
            return
        }
        let id = UUID().uuidString
        run = DCRun(id: id, sentAt: Date())
        startClock()
        let data = DianChao.request(id: id, app: post.dcApp, at: ISOTime.string())
        Task {
            do {
                try await post.dcSend(id: id, data: data, files: [DianChao.photoName(id): jpeg]) { [weak self] d in
                    self?.got(d, id: id)
                }
            } catch {
                guard self.run?.id == id else { return }
                if self.run?.phase == .waiting { self.run?.phase = .jam(DianChaoStrings.sendFail) }
                self.run?.reviewing = false
                self.finish()
            }
        }
    }

    func got(_ data: Data, id: String) {
        guard var r = run, r.id == id, let L = DianChao.parse(data) else { return }
        let was = r.phase, fixed = r.fix != nil
        guard r.receive(L) else { return }
        run = r
        if case .jam = r.phase { finish(); return }
        if r.phase == .waiting { return }             // 145 partial：点边来边亮，数码管跟着跳（界面看 liveAt）
        if was == .waiting { counted(r.total) } else if !fixed && r.fix != nil { corrected() }
        if !r.reviewing { finish() }                  // 150：第一封以后还等着复查
    }

    // ------------------------------------------------------------ 响
    /// 数完了：数码管从 0 跑上去，跑到了叮一下
    private func counted(_ total: Int) {
        countFrom = Date()
        dingDue = true
        ringing = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(DianChao.countDur(total) * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.dingDue = false
            self.ring(.done)
        }
    }

    /// 复查改了：数直接换过去，叮叮两声。头一声叮还没响就先响它，隔一口气再叮叮
    private func corrected() {
        countFrom = .distantPast
        guard dingDue else { ring(.fixed); return }
        hush()
        ring(.done)
        ringing = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard !Task.isCancelled, let self else { return }
            self.ring(.fixed)
        }
    }

    private func ring(_ k: DCChime.Kind) { chime = DCChime(n: (chime?.n ?? 0) + 1, kind: k) }

    private func hush() {
        ringing?.cancel()
        ringing = nil
        dingDue = false
    }

    private func startClock() {
        clock?.cancel()
        clock = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard let self else { return }
                self.ticker += 1
                guard var r = self.run else { return }
                if r.tick(now: Date()) {
                    self.run = r                      // 复查等不来：不响、不提示
                    self.finish()
                    return
                }
                if r.settled { return }
                if case .jam = r.phase { return }
            }
        }
    }

    private func finish() {
        if let r = run { post?.dcForget(r.id) }
        clock?.cancel()
        clock = nil
    }

    // ------------------------------------------------------------ 手改
    func tap(y: Double, x: Double, hitX: Double, aspect: Double) {
        guard var r = run else { return }
        r.tap(y: y, x: x, hitX: hitX, aspect: aspect)
        run = r
    }

    func toggle(_ i: Int) {
        guard var r = run else { return }
        r.toggle(i)
        run = r
    }

    /// 截图用（-TXDemo YES -TXSample <托盘照片>）：不寄，摆一盘数好的（Tests/Fixtures/demo-tray.jpg 的十件，第二眼补了一件）。
    /// -TXStage first：第一遍刚到（9 件，已经是「完成」）；fixed：复查补了一件（记号定住不闪完）
    func showDemo(_ img: UIImage, stage: String = "") {
        guard let s = Self.shrink(img) else { return }
        photo = s.0
        let raw: [[Double]] = [[235, 330], [345, 330], [455, 330], [565, 330], [785, 330], [235, 690], [455, 690], [565, 690], [675, 690], [785, 690]]
        let pts: [DCPoint] = raw.enumerated().map { i, p in DCPoint(y: p[0], x: p[1], aud: i == 8) }
        func tray(_ p: [DCPoint]) -> DCTray { DCTray(box: [150, 120, 880, 900], complete: true, main: true, on: true, pts: p) }
        var r = DCRun(id: "demo-tray", sentAt: Date())
        if stage == "first" || stage == "fixed" {
            let one = pts.filter { !$0.aud }
            r.receive(DianChao.Letter(stage: "first", ok: true, why: "", total: one.count, trays: [tray(one)]))
            if stage == "fixed" {
                r.receive(DianChao.Letter(stage: "final", ok: true, why: "", total: pts.count, trays: [tray(pts)]))
                r.fix?.at = .distantFuture
            }
        } else {
            r.trays = [tray(DianChao.rowSorted(pts))]
            r.added = 1
            r.audited = true
            r.phase = .done
        }
        run = r
    }

    func leave() {
        finish()
        hush()
        run?.reviewing = false
        photo = nil
        jpeg = nil
    }
}
