import Foundation

// 发件箱：改的东西先存本地（存了就丢不了：杀进程、断网、没配对都不丢），再寄给大管家。
// 同一条只寄最新一版；寄出 2 分钟没回信，下次连上再寄（同一个请求 id，大管家按 id 只办一次）。
// 这里只有纯逻辑（好测）；寄信的是 Butler.swift，存盘的是 Store.swift。

struct Pending: Codable, Equatable, Identifiable {
    enum Op: String, Codable { case put, del }

    /// book:<id> / set:<id>
    var key: String
    /// book / set
    var what: String
    var op: Op
    var itemId: String
    /// 这一版的 modified（扔掉的：扔的时间）
    var modified: String
    /// 请求 id（新 UUID），也是信的 id
    var req: String
    var sentAt: Date?
    var tries: Int = 0
    /// 大管家上次说没办成的原话
    var why: String?

    var id: String { key }
}

/// 存在手机上的全部家当：一个文件、一次写完（state.json）
struct SavedState: Codable, Equatable {
    var data: TXData
    var holds = Merge.Holds()
    var outbox: [Pending] = []
    /// 网上（GitHub）已经有的图：寄的时候这些不用带
    var online: Set<String> = []
    /// 上次从网上拉到秘籍的时间
    var pulledAt: Date?

    static let resendAfter: TimeInterval = 120

    init(data: TXData) {
        self.data = data
        self.online = data.allImages
    }

    // ------------------------------------------------------------ 进发件箱
    mutating func enqueuePut(what: String, id: String, modified: String) {
        let key = what == "set" ? ItemKey.set(id) : ItemKey.book(id)
        outbox.removeAll { $0.key == key }
        outbox.append(Pending(key: key, what: what, op: .put, itemId: id, modified: modified, req: UUID().uuidString))
        holds.pending[key] = modified
        holds.deleted[key] = nil
    }

    mutating func enqueueDel(what: String, id: String, at: String) {
        let key = what == "set" ? ItemKey.set(id) : ItemKey.book(id)
        outbox.removeAll { $0.key == key }
        outbox.append(Pending(key: key, what: what, op: .del, itemId: id, modified: at, req: UUID().uuidString))
        holds.pending[key] = at
        holds.deleted[key] = at
        holds.shipped[key] = nil
    }

    /// 本地扔掉、不单独寄的（大标题扔了，下面的图纸大管家跟着删）：记一笔，网上缓存的旧版别再长回来
    mutating func forgetQuietly(what: String, id: String, at: String) {
        let key = what == "set" ? ItemKey.set(id) : ItemKey.book(id)
        outbox.removeAll { $0.key == key }
        holds.pending[key] = nil
        holds.shipped[key] = nil
        holds.deleted[key] = at
    }

    // ------------------------------------------------------------ 寄
    /// 该寄的：没寄过的，和寄出去 2 分钟还没回信的
    func due(now: Date = Date()) -> [Pending] {
        outbox.filter { p in
            guard let s = p.sentAt else { return true }
            return now.timeIntervalSince(s) >= SavedState.resendAfter
        }
    }

    mutating func markSent(req: String, at: Date = Date()) {
        if let i = outbox.firstIndex(where: { $0.req == req }) {
            outbox[i].sentAt = at
            outbox[i].tries += 1
        }
    }

    // ------------------------------------------------------------ 回信
    /// 大管家回了：ok 只在推上 GitHub 以后才回；stale = 大管家那边更新，没换（当寄到了，下次拉网上那份）。
    /// 回 true 表示这封是在等的（认得）。
    @discardableResult
    mutating func handleResult(re: String, ok: Bool, stale: Bool, why: String?) -> Bool {
        guard let i = outbox.firstIndex(where: { $0.req == re }) else { return false }
        let p = outbox[i]
        if ok {
            outbox.remove(at: i)
            holds.pending[p.key] = nil
            if p.op == .put {
                if stale {
                    holds.shipped[p.key] = nil
                } else {
                    holds.shipped[p.key] = p.modified
                    // 这一条的图网上有了
                    if p.what == "book", let b = data.book(p.itemId) { online.formUnion(b.images) }
                    if p.what == "set", let s = data.set(p.itemId) { online.formUnion(s.images) }
                }
            }
            return true
        }
        outbox[i].why = why
        return true
    }

    /// 寄的时候要带的图：这一条用到的、网上还没有的
    func filesToSend(for p: Pending) -> [String] {
        guard p.op == .put else { return [] }
        let imgs: [String]
        if p.what == "set" { imgs = data.set(p.itemId)?.images ?? [] } else { imgs = data.book(p.itemId)?.images ?? [] }
        return imgs.filter { !online.contains($0) && ImagePath.isSafe($0) }
    }

    // ------------------------------------------------------------ 拉网上那份
    mutating func pulled(_ remote: TXData, at: Date = Date()) {
        let r = Merge.merge(local: data, remote: remote, holds: holds)
        data = r.data
        holds = r.holds
        online.formUnion(remote.allImages)
        pulledAt = at
    }
}

/// 请求（kind=request 的 data），手机 → 大管家
enum TXAsk {
    static func hello(id: String, app: String, at: String = ISOTime.string()) -> [String: Any] {
        ["v": 1, "id": id, "ask": "tx-hello", "at": at, "app": app]
    }

    static func put(_ p: Pending, state: SavedState, app: String, at: String = ISOTime.string()) -> [String: Any]? {
        let enc = JSONEncoder()
        let item: Data?
        if p.what == "set" {
            item = state.data.set(p.itemId).flatMap { try? enc.encode($0) }
        } else {
            item = state.data.book(p.itemId).flatMap { try? enc.encode($0) }
        }
        guard let d = item, let obj = try? JSONSerialization.jsonObject(with: d) else { return nil }
        return ["v": 1, "id": p.req, "ask": "tx-put", "what": p.what, "item": obj, "at": at, "app": app]
    }

    static func del(_ p: Pending, app: String, at: String = ISOTime.string()) -> [String: Any] {
        ["v": 1, "id": p.req, "ask": "tx-del", "what": p.what, "item": p.itemId, "modified": p.modified, "at": at, "app": app]
    }
}

/// 回信（kind=result 的 data）
struct TXResult: Decodable, Equatable {
    var re: String?
    var id: String?
    var ok: Bool
    var host: String?
    var commit: String?
    var stale: Bool?
    var why: String?
    var error: String?

    /// 回的是哪个请求
    var request: String? { re ?? id }
}
