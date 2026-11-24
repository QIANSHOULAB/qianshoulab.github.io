import Foundation

// 秘籍：跟网站 tiexie/data.json 同一个格式（接口见 ../大管家接口.md「data.json」）。app、大管家、网页三家都认这一份。

enum Category: String, Codable, CaseIterable, Identifiable {
    case baodian, daofa, buzhen, bingqi
    var id: String { rawValue }
    var label: String {
        switch self {
        case .baodian: return "宝典"
        case .daofa: return "刀法"
        case .buzhen: return "布阵图"
        case .bingqi: return "兵器谱"
        }
    }
}

struct Site: Codable, Equatable {
    var name: String
    var sub: String
}

struct Book: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var category: String
    var setId: String?
    var img: String
    var body: String
    var plates: [String]
    var modified: String

    enum CodingKeys: String, CodingKey { case id, title, category, setId, img, body, plates, modified }

    init(id: String, title: String, category: String, setId: String? = nil, img: String = "", body: String = "", plates: [String] = [], modified: String) {
        self.id = id; self.title = title; self.category = category; self.setId = setId
        self.img = img; self.body = body; self.plates = plates; self.modified = modified
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        category = try c.decodeIfPresent(String.self, forKey: .category) ?? Category.baodian.rawValue
        setId = try c.decodeIfPresent(String.self, forKey: .setId)
        img = try c.decodeIfPresent(String.self, forKey: .img) ?? ""
        body = try c.decodeIfPresent(String.self, forKey: .body) ?? ""
        plates = try c.decodeIfPresent([String].self, forKey: .plates) ?? []
        modified = try c.decodeIfPresent(String.self, forKey: .modified) ?? ""
    }

    // 键的先后照 data.json；setId 没有时写 null（跟网站那份一样）
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(title, forKey: .title)
        try c.encode(category, forKey: .category)
        if let setId { try c.encode(setId, forKey: .setId) } else { try c.encodeNil(forKey: .setId) }
        try c.encode(img, forKey: .img)
        try c.encode(body, forKey: .body)
        try c.encode(plates, forKey: .plates)
        try c.encode(modified, forKey: .modified)
    }

    var cat: Category { Category(rawValue: category) ?? .baodian }
    /// 这一本用到的图（封面 + 详细图）
    var images: [String] { ([img] + plates).filter { !$0.isEmpty } }
}

struct SetItem: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var img: String
    var modified: String

    init(id: String, title: String, img: String = "", modified: String) {
        self.id = id; self.title = title; self.img = img; self.modified = modified
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        img = try c.decodeIfPresent(String.self, forKey: .img) ?? ""
        modified = try c.decodeIfPresent(String.self, forKey: .modified) ?? ""
    }

    var images: [String] { img.isEmpty ? [] : [img] }
}

struct TXData: Codable, Equatable {
    var v: Int
    var site: Site
    var books: [Book]
    var sets: [SetItem]

    static let empty = TXData(v: 1, site: Site(name: "铁屑江湖", sub: "机床边的武林"), books: [], sets: [])

    init(v: Int = 1, site: Site, books: [Book], sets: [SetItem]) {
        self.v = v; self.site = site; self.books = books; self.sets = sets
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        v = try c.decodeIfPresent(Int.self, forKey: .v) ?? 1
        site = try c.decodeIfPresent(Site.self, forKey: .site) ?? TXData.empty.site
        books = try c.decodeIfPresent([Book].self, forKey: .books) ?? []
        sets = try c.decodeIfPresent([SetItem].self, forKey: .sets) ?? []
    }

    static func decode(_ d: Data) -> TXData? { try? JSONDecoder().decode(TXData.self, from: d) }

    /// 包里带的那份（编译时网站上的 data.json）
    static var bundled: TXData {
        guard let u = Bundle.main.url(forResource: "data", withExtension: "json"), let d = try? Data(contentsOf: u),
              let t = decode(d) else { return .empty }
        return t
    }

    func book(_ id: String) -> Book? { books.first { $0.id == id } }
    func set(_ id: String) -> SetItem? { sets.first { $0.id == id } }

    /// 所有用到的图
    var allImages: Set<String> {
        var s = Set<String>()
        for b in books { s.formUnion(b.images) }
        for x in sets { s.formUnion(x.images) }
        return s
    }
}

/// 条目的「钥匙」：book:<id> 或 set:<id>
enum ItemKey {
    static func book(_ id: String) -> String { "book:\(id)" }
    static func set(_ id: String) -> String { "set:\(id)" }
}

enum ISOTime {
    static let tz = TimeZone(secondsFromGMT: 8 * 3600)!

    /// 2026-11-24T17:00:00+08:00
    static func string(_ d: Date = Date()) -> String {
        let f = ISO8601DateFormatter()
        f.timeZone = tz
        f.formatOptions = [.withInternetDateTime]
        return f.string(from: d)
    }

    static func date(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s)
    }

    /// a 比 b 新？认不出来的当最老
    static func newer(_ a: String, than b: String) -> Bool {
        (date(a) ?? .distantPast) > (date(b) ?? .distantPast)
    }
}

enum NewID {
    /// 小写字母、数字、横杠，40 字以内，网址 # 后面能用：bd-7f3a2c
    static func make(_ cat: String) -> String {
        let prefix: String
        switch cat {
        case "baodian": prefix = "bd"
        case "daofa": prefix = "df"
        case "buzhen": prefix = "bz"
        case "bingqi": prefix = "bq"
        case "set": prefix = "s"
        default: prefix = "tx"
        }
        let hex = (0..<3).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
        return "\(prefix)-\(hex)"
    }

    static func isValid(_ id: String) -> Bool {
        (1...40).contains(id.count) && id.allSatisfy { ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "-" }
    }
}

/// 图的路径只认 img/<名字>.jpg 这种（网上来的、信里来的都是数据，不能往别处写）
enum ImagePath {
    static func isSafe(_ p: String) -> Bool {
        guard p.hasPrefix("img/"), p.count <= 120 else { return false }
        let name = p.dropFirst(4)
        guard !name.isEmpty, !name.hasPrefix(".") else { return false }
        let ok = name.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" || $0 == ".") }
        let ext = name.split(separator: ".").last.map { $0.lowercased() } ?? ""
        return ok && ["jpg", "jpeg", "png", "webp"].contains(ext)
    }
}

// ================================================================ 合并
/// 手机拉网上的 data.json 时怎么合（接口「合并」那节）：
/// - 同一个 id，modified 新的赢；
/// - 本地有没寄到的改动，留本地的（pending）；
/// - 寄到了、大管家推上 GitHub 了、网上还是旧的（Pages 有约 10 分钟缓存）：也留本地的，等网上追上来（shipped）；
/// - 网上没有、本地也没有待寄改动的，就是别处删了，本地跟着删。
enum Merge {
    struct Holds: Codable, Equatable {
        /// 还没寄到的：钥匙 → 这一版的 modified（扔掉的也在这，值是扔的时间）
        var pending: [String: String] = [:]
        /// 寄到了、网上还没追上的：钥匙 → 这一版的 modified
        var shipped: [String: String] = [:]
        /// 扔掉的（寄没寄到都算），网上那份 modified 不比扔的时间新就别再长回来
        var deleted: [String: String] = [:]
    }

    struct Result: Equatable {
        var data: TXData
        var holds: Holds
    }

    static func merge(local: TXData, remote: TXData, holds: Holds) -> Result {
        var h = holds
        var seen = Set<String>()
        let books = mergeList(local.books, remote.books, key: { ItemKey.book($0.id) }, modified: { $0.modified }, holds: &h, seen: &seen)
        let sets = mergeList(local.sets, remote.sets, key: { ItemKey.set($0.id) }, modified: { $0.modified }, holds: &h, seen: &seen)
        // 扔掉的、网上也没有了：这条记录用不着了（还没寄到的除外）
        for k in Array(h.deleted.keys) where !seen.contains(k) && h.pending[k] == nil {
            h.deleted[k] = nil
            h.shipped[k] = nil
        }
        return Result(data: TXData(v: 1, site: remote.site, books: books, sets: sets), holds: h)
    }

    private static func mergeList<T>(_ local: [T], _ remote: [T], key: (T) -> String, modified: (T) -> String, holds h: inout Holds, seen: inout Set<String>) -> [T] {
        var localBy: [String: T] = [:]
        for x in local { localBy[key(x)] = x }
        var out: [T] = []
        // 网上那份的先后为准
        for r in remote {
            let k = key(r)
            seen.insert(k)
            let l = localBy[k]
            if h.pending[k] != nil {
                // 没寄到的：本地说了算（本地扔了就不要）
                if let l { out.append(l) }
                continue
            }
            if let del = h.deleted[k] {
                if ISOTime.newer(modified(r), than: del) {
                    // 扔了以后别处又改过：网上那份赢
                    h.deleted[k] = nil
                    h.shipped[k] = nil
                    out.append(r)
                }
                continue
            }
            if let s = h.shipped[k] {
                if let l, !ISOTime.newer(modified(r), than: s) && modified(r) != s {
                    out.append(l)  // 网上还是旧的
                    continue
                }
                h.shipped[k] = nil  // 网上追上了（或者更新）
            }
            if let l, ISOTime.newer(modified(l), than: modified(r)) {
                out.append(l)
            } else {
                out.append(r)
            }
        }
        // 网上没有的
        for l in local {
            let k = key(l)
            if seen.contains(k) { continue }
            if h.pending[k] != nil || h.shipped[k] != nil {
                out.append(l)  // 新开的，还没上网
            }
            // 否则：别处删了，跟着删
        }
        return out
    }
}
