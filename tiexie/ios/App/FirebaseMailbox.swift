import Foundation
import CryptoKit
import Network

// 备用信箱 v1（131）：平时走 Cloudflare，Cloudflare 叫不应才走谷歌 Firebase Realtime Database（REST）。
// 只换管子：信箱号、钥匙、信封、信的 id、各种 kind 一个不改；加密照旧（MailCrypto，AAD 里的信箱号和方向不变）。
// 协议写在 ../大管家接口.md 的「备用信箱」一节。配置（apiKey、databaseURL）不进仓库、不进日志、不进截图：
// 大管家经 Cloudflare 递来一封 kind2=config 的信，存钥匙串（Keychain.backupAccount）。
// 这个文件里的纯逻辑（FBConfig、FBInbox、BackupRoute）和 REST（FBAuth、FBMailbox）都用假服务器测，
// 真的流（FBStream）只管连、读行、交给 FBInbox。

// ================================================================ 配置
struct FBConfig: Codable, Equatable {
    static let typeName = "firebase-rtdb"
    var type: String
    var apiKey: String
    var databaseURL: String

    var base: String {
        var s = databaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }

    var isValid: Bool {
        guard type == FBConfig.typeName, !apiKey.isEmpty, let u = URL(string: base), u.scheme?.lowercased() == "https", u.host != nil else { return false }
        return true
    }

    /// 大管家递来的那封配置：data = {"id":"cfg-…","kind2":"config","backup":{"type","apiKey","databaseURL"}}（信封里也有一份 kind2）
    static func fromDelivery(_ data: Data) -> (id: String, config: FBConfig)? {
        guard let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              (o["kind2"] as? String) == "config", let id = o["id"] as? String,
              let b = o["backup"] as? [String: Any],
              let t = b["type"] as? String, let k = b["apiKey"] as? String, let u = b["databaseURL"] as? String else { return nil }
        let c = FBConfig(type: t, apiKey: k, databaseURL: u)
        if !c.isValid { return nil }
        return (id: id, config: c)
    }

    static func load() -> FBConfig? {
        guard let d = Keychain.read(account: Keychain.backupAccount), let c = try? JSONDecoder().decode(FBConfig.self, from: d), c.isValid else { return nil }
        return c
    }

    @discardableResult
    func save() -> Bool {
        guard let d = try? JSONEncoder().encode(self) else { return false }
        return Keychain.write(d, account: Keychain.backupAccount)
    }
}

// ================================================================ 匿名登录
/// 匿名登录：idToken 1 小时，提前 5 分钟换；换不成就重新匿名登录。refreshToken 存钥匙串，idToken、refreshToken、apiKey 不进日志。
actor FBAuth {
    let config: FBConfig
    private let http: MailHTTP
    private let now: () -> Date
    private let saveRefresh: (String) -> Void
    private var idToken: String?
    private var expiresAt = Date.distantPast
    private var refreshToken: String?

    init(config: FBConfig, http: MailHTTP = URLSessionHTTP(), now: @escaping () -> Date = { Date() },
         loadRefresh: () -> String? = { Keychain.read(account: Keychain.backupAuthAccount).flatMap { String(data: $0, encoding: .utf8) } },
         saveRefresh: @escaping (String) -> Void = { _ = Keychain.write(Data($0.utf8), account: Keychain.backupAuthAccount) }) {
        self.config = config; self.http = http; self.now = now; self.saveRefresh = saveRefresh
        self.refreshToken = loadRefresh()
    }

    func token(force: Bool = false) async throws -> String {
        if !force, let t = idToken, now() < expiresAt.addingTimeInterval(-300) { return t }
        if let r = refreshToken, try await refresh(r), let t = idToken { return t }
        try await signUp()
        guard let t = idToken else { throw MailError.http(0, "登录没拿到令牌") }
        return t
    }

    /// 令牌不行了（401、被撤销）：下次重新换
    func invalidate() { idToken = nil; expiresAt = .distantPast }

    private func take(_ d: Data, idKey: String, refreshKey: String, expiresKey: String) -> Bool {
        guard let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let t = o[idKey] as? String, let r = o[refreshKey] as? String else { return false }
        let secs: Double = (o[expiresKey] as? String).flatMap { Double($0) } ?? (o[expiresKey] as? Double) ?? 3600
        idToken = t
        expiresAt = now().addingTimeInterval(secs)
        if r != refreshToken {
            refreshToken = r
            saveRefresh(r)
        }
        return true
    }

    private func refresh(_ r: String) async throws -> Bool {
        guard let u = URL(string: "https://securetoken.googleapis.com/v1/token?key=\(config.apiKey)") else { return false }
        var req = URLRequest(url: u, timeoutInterval: 20)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var ok = CharacterSet.alphanumerics
        ok.insert(charactersIn: "-._~")
        let enc = r.addingPercentEncoding(withAllowedCharacters: ok) ?? r
        req.httpBody = Data("grant_type=refresh_token&refresh_token=\(enc)".utf8)
        let (d, code) = try await http.send(req)
        guard code == 200 else { return false }
        return take(d, idKey: "id_token", refreshKey: "refresh_token", expiresKey: "expires_in")
    }

    private func signUp() async throws {
        guard let u = URL(string: "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=\(config.apiKey)") else { throw MailError.badPairing }
        var req = URLRequest(url: u, timeoutInterval: 20)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data(#"{"returnSecureToken":true}"#.utf8)
        let (d, code) = try await http.send(req)
        guard code == 200 else { throw MailError.http(code, "匿名登录没成") }
        guard take(d, idKey: "idToken", refreshKey: "refreshToken", expiresKey: "expiresIn") else { throw MailError.http(code, "登录回的不对") }
    }
}

// ================================================================ 一封到齐的信
struct FBLetter: Equatable {
    var mid: String
    var sealed: Data
}

/// 流里的事件往本地一棵树里放；某封信 meta 和所有片都到了（片数、字节数对得上）就是一封到齐的信
struct FBInbox {
    private var root: [String: Any] = [:]
    private var delivered: Set<String> = []

    enum Step: Equatable {
        case none
        case letters([FBLetter])
        /// cancel、auth_revoked：令牌不行了，换令牌重连
        case reconnect
    }

    mutating func handle(event: String, data: String) -> Step {
        switch event {
        case "put", "patch":
            guard let o = (try? JSONSerialization.jsonObject(with: Data(data.utf8))) as? [String: Any], let path = o["path"] as? String else { return .none }
            let value = o["data"]
            let parts = path.split(separator: "/").map(String.init)
            var touched: [String] = []
            if event == "put" {
                touched = put(parts, value)
            } else if let kv = value as? [String: Any] {
                for (k, v) in kv { touched += put(parts + k.split(separator: "/").map(String.init), v) }
            }
            let out = complete(Set(touched))
            return out.isEmpty ? .none : .letters(out)
        case "cancel", "auth_revoked":
            return .reconnect
        default:
            return .none
        }
    }

    /// 一次都没问过的信箱就是空的：重连以后第一个 put "/" 会把没删的信再给一遍
    mutating func reset() {
        root = [:]
        delivered = []
    }

    private static func norm(_ v: Any?) -> Any? {
        guard let v, !(v is NSNull) else { return nil }
        if let a = v as? [Any] {
            var d: [String: Any] = [:]
            for (i, e) in a.enumerated() { if let n = norm(e) { d[String(i)] = n } }
            return d.isEmpty ? nil : d
        }
        if let m = v as? [String: Any] {
            var d: [String: Any] = [:]
            for (k, e) in m { if let n = norm(e) { d[k] = n } }
            return d.isEmpty ? nil : d
        }
        return v
    }

    private static func set(_ node: inout [String: Any], _ path: ArraySlice<String>, _ v: Any?) {
        guard let k = path.first else { return }
        if path.count == 1 {
            if let v { node[k] = v } else { node.removeValue(forKey: k) }
            return
        }
        var child = (node[k] as? [String: Any]) ?? [:]
        set(&child, path.dropFirst(), v)
        if child.isEmpty { node.removeValue(forKey: k) } else { node[k] = child }
    }

    /// 返回动过的信的 mid
    private mutating func put(_ path: [String], _ value: Any?) -> [String] {
        let v = FBInbox.norm(value)
        if path.isEmpty {
            let gone = Set(root.keys)
            root = (v as? [String: Any]) ?? [:]
            delivered.formIntersection(root.keys)
            return Array(gone.union(root.keys))
        }
        FBInbox.set(&root, path[...], v)
        if root[path[0]] == nil { delivered.remove(path[0]) }
        return [path[0]]
    }

    private mutating func complete(_ mids: Set<String>) -> [FBLetter] {
        var out: [FBLetter] = []
        for mid in mids.sorted() where !delivered.contains(mid) {
            guard let e = root[mid] as? [String: Any], let meta = e["meta"] as? [String: Any],
                  let n = (meta["n"] as? NSNumber)?.intValue, let size = (meta["size"] as? NSNumber)?.intValue, n > 0,
                  let p = e["p"] as? [String: Any] else { continue }
            var b64 = ""
            var ok = true
            for i in 0..<n {
                guard let s = p[String(i)] as? String else { ok = false; break }
                b64 += s
            }
            guard ok, let d = Data(base64Encoded: b64), d.count == size else { continue }
            delivered.insert(mid)
            out.append(FBLetter(mid: mid, sealed: d))
        }
        return out
    }
}

/// 流的一行一行：event: put / data: {…}。AsyncBytes.lines 会吞掉空行，所以不等空行，data 一来就办
struct SSELines {
    private var event = ""

    mutating func feed(_ line: String) -> (event: String, data: String)? {
        if line.hasPrefix("event:") {
            event = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
            return nil
        }
        if line.hasPrefix("data:") {
            let d = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            defer { event = "" }
            return (event, d)
        }
        return nil
    }
}

// ================================================================ REST
/// 对着 /boxes/<信箱号>/ 寄信、删信、报「在」。手机寄 to_pc，听 to_phone。
final class FBMailbox {
    static let chunk = 1_000_000
    /// 一封最大 10 MB（超了这条管子不收，走 Cloudflare）
    static let maxRaw = 10_000_000
    let config: FBConfig
    let box: String
    let auth: FBAuth
    let http: MailHTTP

    init(config: FBConfig, box: String, auth: FBAuth, http: MailHTTP = URLSessionHTTP()) {
        self.config = config; self.box = box; self.auth = auth; self.http = http
    }

    static func dir(to: String) -> String { to == "pc" ? "to_pc" : "to_phone" }

    func url(_ path: String, token: String, query: String = "") -> URL? {
        URL(string: "\(config.base)/boxes/\(box)/\(path).json?auth=\(token)\(query)")
    }

    /// 令牌不行（401）换一个再试一次
    func call(_ method: String, _ path: String, body: Data? = nil, timeout: TimeInterval = 30) async throws -> (Data, Int) {
        for attempt in 0..<2 {
            let tok = try await auth.token(force: attempt == 1)
            guard let u = url(path, token: tok) else { throw MailError.badPairing }
            var req = URLRequest(url: u, timeoutInterval: timeout)
            req.httpMethod = method
            if let body {
                req.httpBody = body
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }
            let (d, code) = try await http.send(req)
            if code == 401 && attempt == 0 { await auth.invalidate(); continue }
            return (d, code)
        }
        return (Data(), 401)
    }

    private func expectOK(_ r: (Data, Int)) throws {
        guard r.1 == 200 else { throw MailError.http(r.1, "备用信箱回了 \(r.1)") }
    }

    /// 一封信：密文 base64、每片 ≤ 1 000 000 字，依次写 p/0 … p/n-1，最后写 meta（有 meta 才算到齐）
    func putLetter(mid: String, sealed: Data, to: String) async throws {
        guard sealed.count <= FBMailbox.maxRaw else { throw MailError.tooBig(sealed.count) }
        let m = try MailClient.safeID(mid)
        let bytes = Array(sealed.base64EncodedString().utf8)
        let n = max(1, (bytes.count + FBMailbox.chunk - 1) / FBMailbox.chunk)
        let dir = FBMailbox.dir(to: to)
        for i in 0..<n {
            let lo = i * FBMailbox.chunk
            let hi = min(bytes.count, lo + FBMailbox.chunk)
            let piece = String(decoding: bytes[lo..<hi], as: UTF8.self)
            try expectOK(try await call("PUT", "\(dir)/\(m)/p/\(i)", body: Data("\"\(piece)\"".utf8), timeout: 60))
        }
        let meta = "{\"at\":{\".sv\":\"timestamp\"},\"n\":\(n),\"size\":\(sealed.count)}"
        try expectOK(try await call("PUT", "\(dir)/\(m)/meta", body: Data(meta.utf8)))
    }

    /// 办完删整封，这就是 ack
    func deleteLetter(mid: String, dir: String = "to_phone") async throws {
        let m = try MailClient.safeID(mid)
        try expectOK(try await call("DELETE", "\(dir)/\(m)", timeout: 15))
    }

    /// 备用模式下每 60 秒报一次「手机在」
    func markSeen() async throws {
        try expectOK(try await call("PUT", "seen/phone", body: Data(#"{".sv":"timestamp"}"#.utf8), timeout: 15))
    }

    func streamRequest(token: String, dir: String = "to_phone") -> URLRequest? {
        guard let u = url(dir, token: token) else { return nil }
        var r = URLRequest(url: u, timeoutInterval: 75)
        r.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        return r
    }
}

// ================================================================ 听（流，不轮询）
/// GET to_phone.json 的 text/event-stream：断了按 2、5、10、30、60、60… 秒退避重连；75 秒没有任何东西（keep-alive 30 秒一个）算断；
/// 50 分钟主动重连一次（令牌 1 小时）。流只读，不写东西。
final class FBStream: @unchecked Sendable {
    static let waits: [Double] = [2, 5, 10, 30, 60]
    private let mailbox: FBMailbox
    private let onLetter: (FBLetter) -> Void
    private let onState: (Bool) -> Void
    private var task: Task<Void, Never>?
    private let lock = NSLock()

    init(mailbox: FBMailbox, onLetter: @escaping (FBLetter) -> Void, onState: @escaping (Bool) -> Void) {
        self.mailbox = mailbox; self.onLetter = onLetter; self.onState = onState
    }

    func start() {
        lock.lock()
        defer { lock.unlock() }
        guard task == nil else { return }
        task = Task { [weak self] in await self?.loop() }
    }

    func stop() {
        lock.lock()
        let t = task
        task = nil
        lock.unlock()
        t?.cancel()
    }

    private func loop() async {
        var attempt = 0
        while !Task.isCancelled {
            do {
                try await runOnce()
                attempt = 0
            } catch {
                onState(false)
            }
            if Task.isCancelled { break }
            let w = FBStream.waits[min(attempt, FBStream.waits.count - 1)]
            attempt += 1
            try? await Task.sleep(nanoseconds: UInt64(w * 1_000_000_000))
        }
        onState(false)
    }

    private func runOnce() async throws {
        let tok = try await mailbox.auth.token()
        guard let req = mailbox.streamRequest(token: tok) else { throw MailError.badPairing }
        let (bytes, resp) = try await URLSession.shared.bytes(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else {
            if code == 401 || code == 403 { await mailbox.auth.invalidate() }
            throw MailError.http(code, "备用信箱的流回了 \(code)")
        }
        var inbox = FBInbox()
        var sse = SSELines()
        let until = Date().addingTimeInterval(50 * 60)
        for try await line in bytes.lines {
            if let (ev, data) = sse.feed(line) {
                switch inbox.handle(event: ev, data: data) {
                case .letters(let ls):
                    for l in ls { onLetter(l) }
                case .reconnect:
                    await mailbox.auth.invalidate()
                    return
                case .none:
                    break
                }
                if ev == "put" { onState(true) }
            }
            if Date() > until { return }
        }
    }
}

// ================================================================ 什么时候换管子
/// 寄：Cloudflare 连不上、回 5xx / 4xx（413 除外）/ 429 / 1101，或者网在、WebSocket 却断了超过 60 秒 → 进备用模式（信走 Firebase、两条都听、每 60 秒报「在」）。
/// 回去：Cloudflare 连续好 5 分钟（WebSocket 一直连着、这期间没寄失败过）。纯逻辑，时间由外面给。
struct BackupRoute: Equatable {
    var downAfter: TimeInterval = 60
    var returnAfter: TimeInterval = 300
    private(set) var backup = false
    private var socketDownSince: Date?
    private var goodSince: Date?

    /// 这个错该不该换管子
    static func shouldFailover(_ e: Error) -> Bool {
        if e is URLError { return true }
        if let m = e as? MailError, case .http(let c, _) = m {
            return c >= 500 || c == 429 || (c >= 400 && c < 500 && c != 413)
        }
        return false
    }

    mutating func socketDown(_ now: Date) {
        if socketDownSince == nil { socketDownSince = now }
        goodSince = nil
    }

    mutating func socketUp(_ now: Date) {
        socketDownSince = nil
        if goodSince == nil { goodSince = now }
    }

    mutating func sendFailed(_ now: Date) {
        backup = true
        goodSince = nil
    }

    /// 返回有没有换了
    @discardableResult
    mutating func tick(_ now: Date, netOK: Bool = true) -> Bool {
        let was = backup
        if !backup, netOK, let d = socketDownSince, now.timeIntervalSince(d) >= downAfter { backup = true }
        if backup, socketDownSince == nil, let g = goodSince, now.timeIntervalSince(g) >= returnAfter { backup = false }
        return was != backup
    }
}

/// 有没有网（只看系统说通不通，不发包）：「网在、WebSocket 却断了」才算 Cloudflare 的事
final class RouteNetProbe: @unchecked Sendable {
    private let monitor = NWPathMonitor()
    private let q = DispatchQueue(label: "lab.qianshou.tiexie.netwatch")
    private var up = true

    var ok: Bool { q.sync { up } }

    init() {
        monitor.pathUpdateHandler = { [weak self] p in
            self?.up = p.status == .satisfied
        }
        monitor.start(queue: q)
    }

    deinit { monitor.cancel() }
}

/// 两条路都来的同一封只办一次（按 id + 内容去重；first / final 同一个 id 内容不同，不会被吞）
struct SeenLetters {
    private var order: [String] = []
    private var set: Set<String> = []
    var limit = 500

    static func key(_ env: MailEnvelope) -> String {
        let h = SHA256.hash(data: env.data)
        return env.id + "|" + h.prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    /// 第一次见返回 true
    mutating func first(_ k: String) -> Bool {
        if set.contains(k) { return false }
        set.insert(k)
        order.append(k)
        if order.count > limit {
            set.remove(order.removeFirst())
        }
        return true
    }
}
