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
    @Published var ticker = 0

    private var jpeg: Data?
    private var clock: Task<Void, Never>?
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
                self.run?.phase = .jam(DianChaoStrings.sendFail)
                self.finish()
            }
        }
    }

    func got(_ data: Data, id: String) {
        guard var r = run, r.id == id, let L = DianChao.parse(data) else { return }
        let before = r.phase
        if r.receive(L) {
            run = r
            if case .jam = r.phase { finish(); return }
            if before == .waiting || r.phase == .done { countFrom = Date() }
            if r.phase == .done { finish() }
        }
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
                    self.run = r
                    if r.phase == .done { self.countFrom = Date() }
                    self.finish()
                    return
                }
                if r.phase == .done { return }
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

    func leave() {
        finish()
        photo = nil
        jpeg = nil
    }
}
