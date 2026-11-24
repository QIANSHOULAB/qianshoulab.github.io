import Foundation
import SwiftUI

// 寄给大管家：app 在前台、配过对就连信箱（ws?as=phone），退到后台就断。
// 连上先收攒着的回信，再把发件箱里该寄的寄出去；每 30 秒看一眼有没有 2 分钟没回信要重寄的。
// 钥匙、配对码不进日志；日志里信箱号最多写前 6 位。

@MainActor
final class Butler: ObservableObject {
    @Published private(set) var pairing: TXPairing?
    /// 信箱说大管家在不在
    @Published private(set) var online = false
    @Published private(set) var seen: Date?
    /// 刚配上、大管家回了招呼
    @Published private(set) var greeted = false
    @Published var pairMessage: String?
    /// 大管家递来过备用信箱的配置（设置里「备用通道：有」）
    @Published private(set) var backupHave = false
    /// 现在信走的是备用通道（设置里一行小字，不弹提示）
    @Published private(set) var backupActive = false

    let store: Store
    let appVersion: String
    private var client: MailClient?
    private var socket: MailSocket?
    private var ticker: Task<Void, Never>?
    private var sending = false
    private var helloReq: String?
    private var helloSent = false
    private var active = false
    // 131 备用信箱（谷歌 Firebase）：平时不连，进了备用模式才开流、写「在」
    private var route = BackupRoute()
    private var fbCfg: FBConfig?
    private var fb: FBMailbox?
    private var fbStream: FBStream?
    private var seenLetters = SeenLetters()
    private var lastSeenMark = Date.distantPast
    private lazy var net = RouteNetProbe()

    init(store: Store) {
        self.store = store
        self.appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        if !store.demo, let d = Keychain.read(), let s = String(data: d, encoding: .utf8) {
            pairing = TXPairing.parse(s)
        }
        if !store.demo {
            fbCfg = FBConfig.load()
            setupFB()
        }
        store.onChange = { [weak self] in
            Task { @MainActor in await self?.flush() }
        }
    }

    // ------------------------------------------------------------ 配对
    /// 粘贴进来的、链接带来的配对码。不认的（一叶笺的、坏的）回 false
    @discardableResult
    func pair(_ text: String) -> Bool {
        guard let p = TXPairing.parse(text) else {
            pairMessage = "这不是铁屑江湖的配对码"
            return false
        }
        guard Keychain.write(Data(p.json.utf8)) else {
            pairMessage = "钥匙串存不进去"
            return false
        }
        stop()
        pairing = p
        setupFB()
        greeted = false
        pairMessage = "配上了，等大管家回个话"
        helloReq = UUID().uuidString
        start()
        return true
    }

    func unpair() {
        stop()
        Keychain.delete()
        pairing = nil
        fb = nil  // 备用信箱的配置不是哪个信箱的，留着；重新配对再用
        greeted = false
        online = false
        pairMessage = nil
    }

    // ------------------------------------------------------------ 连
    func start() {
        active = true
        guard !store.demo, let p = pairing, client == nil, let c = MailClient(pairing: p), let url = c.socketURL else { return }
        client = c
        let s = MailSocket(url: url, onPush: { [weak self] push in
            Task { @MainActor in self?.handle(push) }
        }, onDown: { [weak self] _ in
            Task { @MainActor in
                self?.online = false
                self?.route.socketDown(Date())
            }
        })
        socket = s
        helloSent = false
        route.socketDown(Date())
        if fb == nil { setupFB() }
        s.start()
        ticker?.cancel()
        // 每 10 秒看一眼走哪条管子，每 30 秒看一眼有没有该寄的
        ticker = Task { [weak self] in
            var n = 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                n += 1
                await self?.tickRoute()
                if n % 3 == 0 { await self?.flush() }
            }
        }
    }

    func stop() {
        active = false
        socket?.stop()
        socket = nil
        client = nil
        ticker?.cancel()
        ticker = nil
        stopFBStream()
        route = BackupRoute()
        backupActive = false
    }

    // ------------------------------------------------------------ 备用信箱（131）
    private func setupFB() {
        stopFBStream()
        fb = nil
        backupHave = fbCfg != nil
        guard let cfg = fbCfg, let p = pairing else { return }
        fb = FBMailbox(config: cfg, box: p.box, auth: FBAuth(config: cfg))
        routeChanged()
    }

    /// 备用模式：信走 Firebase、两条都听、每 60 秒报「在」；回去：只走 Cloudflare
    private func routeChanged() {
        let on = route.backup && fb != nil && active
        if on != backupActive { backupActive = on }
        if on { startFBStream() } else { stopFBStream() }
    }

    private func startFBStream() {
        guard fbStream == nil, let m = fb else { return }
        let s = FBStream(mailbox: m, onLetter: { [weak self] l in
            Task { @MainActor in await self?.receiveBackup(l) }
        }, onState: { _ in })
        fbStream = s
        s.start()
    }

    private func stopFBStream() {
        fbStream?.stop()
        fbStream = nil
    }

    private func tickRoute() async {
        guard fb != nil, active else { return }
        let was = backupActive
        route.tick(Date(), netOK: net.ok)
        routeChanged()
        guard backupActive else { return }
        if Date().timeIntervalSince(lastSeenMark) >= 60 {
            lastSeenMark = Date()
            try? await fb?.markSeen()
        }
        if !was { await flush() }
    }

    /// 寄一封：平时 Cloudflare；备用模式走 Firebase（Firebase 也不通再试 Cloudflare）；Cloudflare 叫不应这一封改走 Firebase
    private func deliver(_ env: MailEnvelope, via c: MailClient, timeout: TimeInterval = 30) async throws {
        if backupActive, let m = fb {
            do {
                try await m.putLetter(mid: env.id, sealed: try c.seal(env, to: c.peer), to: c.peer)
                return
            } catch {
                // 备用管子也不通：再试 Cloudflare
            }
        }
        do {
            _ = try await c.send(env, timeout: timeout)
        } catch {
            guard let m = fb, BackupRoute.shouldFailover(error) else { throw error }
            route.sendFailed(Date())
            routeChanged()
            try await m.putLetter(mid: env.id, sealed: try c.seal(env, to: c.peer), to: c.peer)
        }
    }

    /// Firebase 那头来的信：办了再删整封（ack）
    private func receiveBackup(_ l: FBLetter) async {
        guard let c = client, let m = fb else { return }
        do {
            let env = try c.open(l.sealed)
            await process(env)
            try? await m.deleteLetter(mid: l.mid)
        } catch let e as MailError where e.isPermanent {
            try? await m.deleteLetter(mid: l.mid)
        } catch {
            // 网不通：下次连上流会再给一遍
        }
    }

    /// 大管家递来的备用信箱配置：存钥匙串，回「收到」。配置只走 Cloudflare 递，不进日志
    private func handleDelivery(_ env: MailEnvelope) async {
        guard !store.demo, let got = FBConfig.fromDelivery(env.data), got.config.save() else { return }
        if fbCfg != got.config {
            fbCfg = got.config
            setupFB()
        }
        guard let c = client else { return }
        let id = UUID().uuidString
        let ok = MailEnvelope(kind: .request, id: id, at: ISOTime.string(), data: json(["id": id, "ask": "fb-config-ok", "of": got.id]), files: [:])
        try? await deliver(ok, via: c)
    }

    private func handle(_ push: MailPush) {
        route.socketUp(Date())
        switch push {
        case .hello(let items, let pc, let pcSeen):
            online = pc
            seen = pcSeen ?? seen
            Task {
                for it in items where it.to == "phone" { await receive(it) }
                await flush()
            }
        case .msg(let it):
            guard it.to == "phone" else { return }
            Task { await receive(it) }
        case .pc(let on, let s), .state(let on, let s):
            let was = online
            online = on
            if let s { seen = s }
            if on && !was { Task { await flush() } }
        default:
            break
        }
    }

    private func receive(_ it: MailItem) async {
        guard let c = client else { return }
        do {
            let env = try await c.receive(it)
            await process(env)
            try? await c.ack(it.seq)
        } catch let e as MailError where e.isPermanent {
            try? await c.ack(it.seq)
        } catch {
            // 网不通：下次连上再拿
        }
    }

    /// 一封拆开的信怎么办（两条管子来的都走这里；同一封两条路都来了只办一次）
    private func process(_ env: MailEnvelope) async {
        guard seenLetters.first(SeenLetters.key(env)) else { return }
        if env.kind == .delivery {
            await handleDelivery(env)
            return
        }
        // 工具箱寄的一次性的信（122 点钞机）：回信交给等着的工具，不进发件箱
        if env.kind == .result, let re = Butler.replyTo(env.data), let waiter = toolWaiters[re] {
            waiter(env.data)
            return
        }
        if env.kind == .result, let r = try? JSONDecoder().decode(TXResult.self, from: env.data) {
            let re = r.request ?? env.id
            if re == helloReq {
                greeted = r.ok
                pairMessage = r.ok ? "配上了，大管家回话了" : "大管家没认：\(r.why ?? r.error ?? "")"
                helloReq = nil
            } else {
                store.update { $0.handleResult(re: re, ok: r.ok, stale: r.stale ?? false, why: r.why ?? r.error) }
            }
        }
    }

    /// 把该寄的寄出去（没配对、没连上就先攒着）
    func flush() async {
        guard active, let c = client, !sending else { return }
        sending = true
        defer { sending = false }
        if let h = helloReq, !helloSent {
            helloSent = true
            let env = MailEnvelope(kind: .request, id: h, at: ISOTime.string(), data: json(TXAsk.hello(id: h, app: appVersion)), files: [:])
            try? await deliver(env, via: c)
        }
        for p in store.state.due() {
            let ask: [String: Any]? = p.op == .put ? TXAsk.put(p, state: store.state, app: appVersion) : TXAsk.del(p, app: appVersion)
            guard let obj = ask else {
                // 本地已经没有这一条（又被扔了）：等扔的那封
                continue
            }
            var files: [String: Data] = [:]
            for f in store.state.filesToSend(for: p) {
                if let d = store.imageData(f) { files[f] = d }
            }
            let env = MailEnvelope(kind: .request, id: p.req, at: ISOTime.string(), data: json(obj), files: files)
            do {
                try await deliver(env, via: c)
                store.update { $0.markSent(req: p.req) }
            } catch {
                break  // 网不通：下回再寄
            }
        }
    }

    // ------------------------------------------------------------ 工具箱的一次性的信（122 起）
    // 工具寄一封、等回信（可以好几封，比如点钞机的 first、final），回信按请求 id 交回去。
    // 不进发件箱、不重寄、不存盘：大管家不在就不寄（工具自己说一句），照片不在手机上留底。
    private var toolWaiters: [String: (Data) -> Void] = [:]

    /// 连着信箱（配过对、app 在前台）
    var connected: Bool { client != nil }

    func sendToolLetter(id: String, data: [String: Any], files: [String: Data], onReply: @escaping (Data) -> Void) async throws {
        guard let c = client else { throw MailError.badPairing }
        toolWaiters[id] = onReply
        let env = MailEnvelope(kind: .request, id: id, at: ISOTime.string(), data: json(data), files: files)
        do {
            try await deliver(env, via: c, timeout: 60)
        } catch {
            toolWaiters[id] = nil
            throw error
        }
    }

    func forgetToolLetter(_ id: String) {
        toolWaiters[id] = nil
    }

    /// 回信回的是哪个请求（data 里的 re，没有就 id）
    nonisolated static func replyTo(_ data: Data) -> String? {
        guard let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return (o["re"] as? String) ?? (o["id"] as? String)
    }

    private func json(_ obj: [String: Any]) -> Data {
        (try? JSONSerialization.data(withJSONObject: obj, options: [.withoutEscapingSlashes])) ?? Data("{}".utf8)
    }

    /// 设置里那一行小字
    var statusLine: String {
        let n = store.state.outbox.count
        if n == 0 { return "都存到 GitHub 了" }
        if pairing == nil { return "\(n) 处还没送到大管家（还没配对）" }
        if online { return "\(n) 处还没送到大管家（大管家在线，正在送）" }
        if let s = seen {
            let f = DateFormatter()
            f.dateFormat = Calendar.current.isDateInToday(s) ? "HH:mm" : "M-d HH:mm"
            return "\(n) 处还没送到大管家（上次在线 \(f.string(from: s))）"
        }
        return "\(n) 处还没送到大管家"
    }
}
