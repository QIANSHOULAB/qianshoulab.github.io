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

    let store: Store
    let appVersion: String
    private var client: MailClient?
    private var socket: MailSocket?
    private var ticker: Task<Void, Never>?
    private var sending = false
    private var helloReq: String?
    private var helloSent = false
    private var active = false

    init(store: Store) {
        self.store = store
        self.appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        if !store.demo, let d = Keychain.read(), let s = String(data: d, encoding: .utf8) {
            pairing = TXPairing.parse(s)
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
            Task { @MainActor in self?.online = false }
        })
        socket = s
        helloSent = false
        s.start()
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                await self?.flush()
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
    }

    private func handle(_ push: MailPush) {
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
            try? await c.ack(it.seq)
        } catch let e as MailError where e.isPermanent {
            try? await c.ack(it.seq)
        } catch {
            // 网不通：下次连上再拿
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
            _ = try? await c.send(env)
        }
        for p in store.state.due() {
            guard let obj = p.op == .put ? TXAsk.put(p, state: store.state, app: appVersion) : TXAsk.del(p, app: appVersion) else {
                // 本地已经没有这一条（又被扔了）：等扔的那封
                continue
            }
            var files: [String: Data] = [:]
            for f in store.state.filesToSend(for: p) {
                if let d = store.imageData(f) { files[f] = d }
            }
            let env = MailEnvelope(kind: .request, id: p.req, at: ISOTime.string(), data: json(obj), files: files)
            do {
                _ = try await c.send(env)
                store.update { $0.markSent(req: p.req) }
            } catch {
                break  // 网不通：下回再寄
            }
        }
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
