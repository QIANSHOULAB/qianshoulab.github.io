import Foundation
import CryptoKit

// 铁屑江湖 ⇄ 大管家：信箱、信封、加密、收发全照一叶笺（qianye ios/docs/大管家接口.md 的 v2、v3，
// 代码照 YiyeKit/Mailbox.swift 抄）。用自己的信箱号，跟一叶笺各走各的。接口全文见 ../大管家接口.md。

// ================================================================ 配对
struct TXPairing: Codable, Equatable {
    var v: Int
    var relay: String
    /// 信箱号：16 字节随机，32 个小写十六进制字
    var box: String
    /// 钥匙：32 字节随机，base64url（不带 =）
    var key: String
    var host: String?
    var app: String?
    var at: String?

    static let version = 2
    static let appName = "tiexie"
    static let defaultRelay = "https://luruseng-relay.lunzigeju.workers.dev"

    init(v: Int = TXPairing.version, relay: String = TXPairing.defaultRelay, box: String, key: String,
         host: String? = "电脑", app: String? = TXPairing.appName, at: String? = nil) {
        self.v = v; self.relay = relay; self.box = box; self.key = key; self.host = host; self.app = app; self.at = at
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        v = try c.decodeIfPresent(Int.self, forKey: .v) ?? TXPairing.version
        relay = try c.decodeIfPresent(String.self, forKey: .relay) ?? TXPairing.defaultRelay
        box = try c.decode(String.self, forKey: .box)
        key = try c.decode(String.self, forKey: .key)
        host = try c.decodeIfPresent(String.self, forKey: .host)
        app = try c.decodeIfPresent(String.self, forKey: .app)
        at = try c.decodeIfPresent(String.self, forKey: .at)
    }

    /// 新配一对（测试、假大管家用；真的由大管家生成）
    static func generate(host: String = "电脑", app: String = TXPairing.appName) -> TXPairing {
        let box = (0..<16).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
        let key = Data((0..<32).map { _ in UInt8.random(in: 0...255) })
        return TXPairing(box: box, key: Base64URL.encode(key), host: host, app: app, at: ISOTime.string())
    }

    var keyData: Data? {
        guard let d = Base64URL.decode(key), d.count == 32 else { return nil }
        return d
    }

    var relayURL: URL? {
        guard let u = URL(string: relay), let s = u.scheme?.lowercased(), s == "https" || s == "http", u.host != nil else { return nil }
        return u
    }

    var isValid: Bool {
        v == TXPairing.version && app == TXPairing.appName && box.count == 32
            && box.allSatisfy({ "0123456789abcdef".contains($0) }) && keyData != nil && relayURL != nil
    }

    /// 信箱号只露前 6 位（日志、界面）
    var boxShort: String { String(box.prefix(6)) }

    /// 认三种写法：`tiexie:<码>`、`tiexie://pair?c=<码>`、那行 JSON 原样。<码> 是那行 JSON 的 base64url（不带 =）。
    /// 一叶笺的配对码（没有 app 或 app 不是 tiexie）不认。
    static func parse(_ text: String) -> TXPairing? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.hasPrefix("{") { return decodeJSON(Data(t.utf8)) }
        if t.lowercased().hasPrefix("tiexie://"), let u = URLComponents(string: t),
           let c = u.queryItems?.first(where: { $0.name == "c" })?.value {
            return fromCode(c)
        }
        if t.lowercased().hasPrefix("tiexie:") {
            return fromCode(String(t.dropFirst("tiexie:".count)))
        }
        return nil
    }

    private static func fromCode(_ c: String) -> TXPairing? {
        guard let d = Base64URL.decode(c.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
        return decodeJSON(d)
    }

    private static func decodeJSON(_ d: Data) -> TXPairing? {
        guard let p = try? JSONDecoder().decode(TXPairing.self, from: d), p.isValid else { return nil }
        return p
    }

    /// 压成一行的 JSON
    var json: String {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        guard let d = try? e.encode(self) else { return "" }
        return String(decoding: d, as: UTF8.self)
    }

    /// 发给 Song 的那种：tiexie:<base64url>
    var code: String { "tiexie:" + Base64URL.encode(Data(json.utf8)) }
}

enum Base64URL {
    static func encode(_ d: Data) -> String {
        d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    static func decode(_ s: String) -> Data? {
        var t = s.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while t.count % 4 != 0 { t += "=" }
        return Data(base64Encoded: t)
    }
}

// ================================================================ 信
enum MailKind: String, Codable {
    case request, result, delivery
}

/// 一封信（加密前）：{v:2, kind, id, at, data, files}。data 是 JSON 对象原样，files 是跟着信走的文件（路径 → 内容，base64）
struct MailEnvelope {
    static let version = 2
    var kind: MailKind
    var id: String
    var at: String
    /// data 那个对象，JSON 原样
    var data: Data
    var files: [String: Data]

    func encoded() throws -> Data {
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw MailError.badLetter("data 不是对象") }
        var env: [String: Any] = ["v": MailEnvelope.version, "kind": kind.rawValue, "id": id, "at": at, "data": obj]
        if !files.isEmpty {
            env["files"] = files.mapValues { $0.base64EncodedString() }
        }
        return try JSONSerialization.data(withJSONObject: env, options: [.sortedKeys, .withoutEscapingSlashes])
    }

    static func decode(_ raw: Data) throws -> MailEnvelope {
        guard let obj = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] else { throw MailError.badLetter("拆开了不是一封信") }
        guard (obj["v"] as? Int) == version else { throw MailError.badLetter("接口版本不对") }
        guard let k = (obj["kind"] as? String).flatMap(MailKind.init(rawValue:)), let id = obj["id"] as? String else {
            throw MailError.badLetter("信封缺字段")
        }
        let dataObj = obj["data"] as? [String: Any] ?? [:]
        let data = try JSONSerialization.data(withJSONObject: dataObj)
        var files: [String: Data] = [:]
        if let f = obj["files"] as? [String: String] {
            for (p, b) in f { if let d = Data(base64Encoded: b) { files[p] = d } }
        }
        return MailEnvelope(kind: k, id: id, at: obj["at"] as? String ?? "", data: data, files: files)
    }
}

enum MailError: Error, Equatable, LocalizedError {
    case badPairing
    case crypto
    case gone
    case tooBig(Int)
    case http(Int, String)
    case badLetter(String)

    var errorDescription: String? {
        switch self {
        case .badPairing: return "配对不对"
        case .crypto: return "拆不开：钥匙对不上，或者信坏了"
        case .gone: return "信箱里已经没有这封了"
        case .tooBig(let n): return "信太大了：\(n) 字节"
        case .http(let c, let s): return "信箱回了 \(c)：\(s)"
        case .badLetter(let s): return s
        }
    }

    var isPermanent: Bool {
        switch self {
        case .crypto, .badLetter, .gone: return true
        default: return false
        }
    }
}

// ================================================================ 加密：AES-256-GCM
/// 寄出去的字节 = nonce(12) ‖ 密文 ‖ tag(16)；附加数据「yiye-dgj/2/<信箱号>/<收信的一方>」（跟一叶笺一字不差）
enum MailCrypto {
    static func aad(box: String, to: String) -> Data { Data("yiye-dgj/2/\(box)/\(to)".utf8) }

    static func seal(_ plain: Data, key: Data, box: String, to: String) throws -> Data {
        let sealed = try AES.GCM.seal(plain, using: SymmetricKey(data: key), nonce: AES.GCM.Nonce(), authenticating: aad(box: box, to: to))
        guard let out = sealed.combined else { throw MailError.crypto }
        return out
    }

    static func open(_ data: Data, key: Data, box: String, to: String) throws -> Data {
        do {
            let sb = try AES.GCM.SealedBox(combined: data)
            return try AES.GCM.open(sb, using: SymmetricKey(data: key), authenticating: aad(box: box, to: to))
        } catch {
            throw MailError.crypto
        }
    }
}

// ================================================================ 信箱推过来的
struct MailItem: Codable, Equatable {
    var seq: Int
    var mid: String
    var to: String
    var at: Double
    var size: Int
    var data: String?
}

enum MailPush: Equatable {
    case hello(items: [MailItem], pc: Bool, pcSeen: Date?)
    case msg(MailItem)
    case gone(seq: Int)
    case pc(on: Bool, seen: Date?)
    case state(pc: Bool, pcSeen: Date?)
    case pong
    case other(String)

    private struct Wire: Decodable {
        var t: String
        var items: [MailItem]?
        var item: MailItem?
        var pc: Bool?
        var pcSeen: Double?
        var seq: Int?
        var on: Bool?
        var seen: Double?
    }

    static func parse(_ text: String) -> MailPush {
        if text == "pong" { return .pong }
        guard let w = try? JSONDecoder().decode(Wire.self, from: Data(text.utf8)) else { return .other(String(text.prefix(60))) }
        func date(_ ms: Double?) -> Date? { ms.map { Date(timeIntervalSince1970: $0 / 1000) } }
        switch w.t {
        case "hello": return .hello(items: w.items ?? [], pc: w.pc ?? false, pcSeen: date(w.pcSeen))
        case "msg": if let it = w.item { return .msg(it) }
        case "gone": if let s = w.seq { return .gone(seq: s) }
        case "pc": return .pc(on: w.on ?? false, seen: date(w.seen))
        case "state": return .state(pc: w.pc ?? false, pcSeen: date(w.pcSeen))
        default: break
        }
        return .other(w.t)
    }
}

// ================================================================ 收发
protocol MailHTTP {
    func send(_ req: URLRequest) async throws -> (Data, Int)
}

struct URLSessionHTTP: MailHTTP {
    func send(_ req: URLRequest) async throws -> (Data, Int) {
        let (d, r) = try await URLSession.shared.data(for: req)
        return (d, (r as? HTTPURLResponse)?.statusCode ?? 0)
    }
}

struct MailSent: Equatable {
    var seq: Int
    var again: Bool
    var pc: Bool
}

/// 一头（手机 role=phone；测试里的假大管家 role=pc）对着信箱寄信、取信、ack
final class MailClient {
    static let maxLetter = 24_000_000
    let pairing: TXPairing
    let role: String
    let http: MailHTTP
    let keyBytes: Data

    init?(pairing: TXPairing, role: String = "phone", http: MailHTTP = URLSessionHTTP()) {
        guard pairing.isValid, let k = pairing.keyData, role == "phone" || role == "pc" else { return nil }
        self.pairing = pairing; self.role = role; self.http = http; self.keyBytes = k
    }

    var peer: String { role == "phone" ? "pc" : "phone" }

    var base: String {
        var s = pairing.relay
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }

    func url(_ tail: String) throws -> URL {
        guard let u = URL(string: "\(base)/dgj/\(pairing.box)/\(tail)") else { throw MailError.badPairing }
        return u
    }

    var socketURL: URL? {
        var s = base
        if s.hasPrefix("https://") { s = "wss://" + String(s.dropFirst(8)) } else if s.hasPrefix("http://") { s = "ws://" + String(s.dropFirst(7)) }
        return URL(string: "\(s)/dgj/\(pairing.box)/ws?as=\(role)")
    }

    func seal(_ env: MailEnvelope, to: String) throws -> Data {
        try MailCrypto.seal(env.encoded(), key: keyBytes, box: pairing.box, to: to)
    }

    func open(_ data: Data) throws -> MailEnvelope {
        try MailEnvelope.decode(MailCrypto.open(data, key: keyBytes, box: pairing.box, to: role))
    }

    static func safeID(_ id: String) throws -> String {
        guard (6...64).contains(id.count), id.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }) else {
            throw MailError.badLetter("信的 id 不对")
        }
        return id
    }

    func send(_ env: MailEnvelope, timeout: TimeInterval = 30) async throws -> MailSent {
        let body = try seal(env, to: peer)
        guard body.count <= MailClient.maxLetter else { throw MailError.tooBig(body.count) }
        let mid = try MailClient.safeID(env.id)
        var req = URLRequest(url: try url("msg?to=\(peer)&mid=\(mid)"), timeoutInterval: timeout)
        req.httpMethod = "PUT"
        req.httpBody = body
        req.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        let (d, code) = try await http.send(req)
        guard code == 200 else { throw MailError.http(code, String(decoding: d.prefix(200), as: UTF8.self)) }
        struct R: Decodable { var seq: Int; var again: Bool?; var pc: Bool? }
        guard let r = try? JSONDecoder().decode(R.self, from: d) else { throw MailError.http(code, "回的不是 JSON") }
        return MailSent(seq: r.seq, again: r.again ?? false, pc: r.pc ?? false)
    }

    func receive(_ item: MailItem, timeout: TimeInterval = 30) async throws -> MailEnvelope {
        if let b = item.data, let d = Data(base64Encoded: b) { return try open(d) }
        let (d, code) = try await http.send(URLRequest(url: try url("msg/\(item.seq)"), timeoutInterval: timeout))
        if code == 404 { throw MailError.gone }
        guard code == 200 else { throw MailError.http(code, String(decoding: d.prefix(200), as: UTF8.self)) }
        return try open(d)
    }

    func ack(_ seq: Int, timeout: TimeInterval = 15) async throws {
        var req = URLRequest(url: try url("msg/\(seq)"), timeoutInterval: timeout)
        req.httpMethod = "DELETE"
        let (d, code) = try await http.send(req)
        guard code == 200 || code == 404 else { throw MailError.http(code, String(decoding: d.prefix(200), as: UTF8.self)) }
    }
}

// ================================================================ 长连接
/// 连着信箱的那根 WebSocket（照 YiyeKit 的 MailSocket）：断了自己重连（等 2、5、10、30、60 秒），每 30 秒发一句 {"t":"state"} 保活。
final class MailSocket: @unchecked Sendable {
    let url: URL
    var keepAlive = #"{"t":"state"}"#
    var keepAliveEvery: TimeInterval = 30
    private let q = DispatchQueue(label: "lab.qianshou.tiexie.mailsocket")
    private let onPush: (MailPush) -> Void
    private let onDown: (String) -> Void
    private var task: URLSessionWebSocketTask?
    private var timer: DispatchSourceTimer?
    private var running = false
    private var attempt = 0
    private var gen = 0

    init(url: URL, onPush: @escaping (MailPush) -> Void, onDown: @escaping (String) -> Void) {
        self.url = url; self.onPush = onPush; self.onDown = onDown
    }

    func start() {
        q.async {
            guard !self.running else { return }
            self.running = true
            self.attempt = 0
            self.connect()
        }
    }

    func stop() {
        q.async {
            self.running = false
            self.gen += 1
            self.timer?.cancel()
            self.timer = nil
            self.task?.cancel(with: .goingAway, reason: nil)
            self.task = nil
        }
    }

    private func connect() {
        gen += 1
        let g = gen
        let t = URLSession.shared.webSocketTask(with: url)
        task = t
        t.resume()
        receive(t, g)
        startTimer(g)
    }

    private func receive(_ t: URLSessionWebSocketTask, _ g: Int) {
        t.receive { [weak self] result in
            guard let self else { return }
            self.q.async {
                guard g == self.gen, self.running else { return }
                switch result {
                case .success(let m):
                    self.attempt = 0
                    switch m {
                    case .string(let s): self.onPush(MailPush.parse(s))
                    case .data(let d): self.onPush(MailPush.parse(String(decoding: d, as: UTF8.self)))
                    @unknown default: break
                    }
                    self.receive(t, g)
                case .failure(let e):
                    self.drop(t, e.localizedDescription)
                }
            }
        }
    }

    private func drop(_ t: URLSessionWebSocketTask, _ why: String) {
        t.cancel(with: .goingAway, reason: nil)
        timer?.cancel()
        timer = nil
        task = nil
        onDown(why)
        let waits: [Double] = [2, 5, 10, 30, 60]
        let w = waits[min(attempt, waits.count - 1)]
        attempt += 1
        gen += 1
        let g = gen
        q.asyncAfter(deadline: .now() + w) { [weak self] in
            guard let self, self.running, self.gen == g else { return }
            self.connect()
        }
    }

    private func startTimer(_ g: Int) {
        timer?.cancel()
        let tm = DispatchSource.makeTimerSource(queue: q)
        tm.schedule(deadline: .now() + keepAliveEvery, repeating: keepAliveEvery)
        tm.setEventHandler { [weak self] in
            guard let self, self.gen == g, let t = self.task else { return }
            t.send(.string(self.keepAlive)) { _ in }
        }
        tm.resume()
        timer = tm
    }
}
