import Foundation
import SwiftUI
import UIKit
import CryptoKit

// 手机上的秘籍：一份 state.json（秘籍 + 发件箱 + 合并用的记号）、一个 img/ 文件夹。
// 底子是编译时打进包的 data.json 和 img/；打开、回到前台、联网时拉 https://qianshoulab.github.io/tiexie/data.json 合进来。

@MainActor
final class Store: ObservableObject {
    static let site = URL(string: "https://qianshoulab.github.io/tiexie/")!

    @Published private(set) var state: SavedState
    @Published private(set) var lastPullError: String?
    /// 每拉回一张图就加一，界面借它刷新封面
    @Published private(set) var imageTick = 0

    let demo: Bool
    private let folder: URL
    private var pulling = false
    private var lastPull = Date.distantPast
    private var downloading = Set<String>()

    /// 改了东西（进了发件箱）就叫一声，Butler 听到就寄
    var onChange: (() -> Void)?

    nonisolated static var dir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("tiexie", isDirectory: true)
        try? FileManager.default.createDirectory(at: base.appendingPathComponent("img", isDirectory: true), withIntermediateDirectories: true)
        return base
    }

    init(demo: Bool = false, folder: URL? = nil) {
        let f = folder ?? Store.dir
        self.demo = demo
        self.folder = f
        try? FileManager.default.createDirectory(at: f.appendingPathComponent("img", isDirectory: true), withIntermediateDirectories: true)
        if !demo, let d = try? Data(contentsOf: f.appendingPathComponent("state.json")),
           let s = try? JSONDecoder().decode(SavedState.self, from: d) {
            state = s
            // 包里新带的图也算网上有的
            state.online.formUnion(TXData.bundled.allImages)
        } else {
            state = SavedState(data: TXData.bundled)
        }
    }

    var data: TXData { state.data }

    // ------------------------------------------------------------ 存盘
    /// 一次写完（先写临时文件再换名）：杀进程也不会写坏
    private func save() {
        guard !demo else { return }
        let enc = JSONEncoder()
        enc.outputFormatting = [.withoutEscapingSlashes]
        guard let d = try? enc.encode(state) else { return }
        try? d.write(to: folder.appendingPathComponent("state.json"), options: .atomic)
    }

    private func commit(_ change: (inout SavedState) -> Void) {
        change(&state)
        save()
        onChange?()
    }

    /// 发件箱、回信这些也走这里存
    func update(_ change: (inout SavedState) -> Void) {
        change(&state)
        save()
    }

    // ------------------------------------------------------------ 改
    func saveBook(_ b: Book) {
        var b = b
        b.modified = ISOTime.string()
        commit { s in
            if let i = s.data.books.firstIndex(where: { $0.id == b.id }) { s.data.books[i] = b } else { s.data.books.append(b) }
            s.enqueuePut(what: "book", id: b.id, modified: b.modified)
        }
    }

    func saveSet(_ x: SetItem) {
        var x = x
        x.modified = ISOTime.string()
        commit { s in
            if let i = s.data.sets.firstIndex(where: { $0.id == x.id }) { s.data.sets[i] = x } else { s.data.sets.append(x) }
            s.enqueuePut(what: "set", id: x.id, modified: x.modified)
        }
    }

    func deleteBook(_ id: String) {
        let at = ISOTime.string()
        commit { s in
            s.data.books.removeAll { $0.id == id }
            s.enqueueDel(what: "book", id: id, at: at)
        }
    }

    /// 扔大标题：下面的图纸一起扔（大管家那头也是连着删）
    func deleteSet(_ id: String) {
        let at = ISOTime.string()
        commit { s in
            let kids = s.data.books.filter { $0.setId == id }.map(\.id)
            s.data.books.removeAll { $0.setId == id }
            s.data.sets.removeAll { $0.id == id }
            for k in kids { s.forgetQuietly(what: "book", id: k, at: at) }
            s.enqueueDel(what: "set", id: id, at: at)
        }
    }

    // ------------------------------------------------------------ 图
    func imageURL(_ path: String) -> URL? {
        guard ImagePath.isSafe(path) else { return nil }
        let local = folder.appendingPathComponent(path)
        if FileManager.default.fileExists(atPath: local.path) { return local }
        let b = Bundle.main.bundleURL.appendingPathComponent(path)
        if FileManager.default.fileExists(atPath: b.path) { return b }
        return nil
    }

    private let cache = NSCache<NSString, UIImage>()

    func image(_ path: String) -> UIImage? {
        if path.isEmpty { return nil }
        if let hit = cache.object(forKey: path as NSString) { return hit }
        guard let u = imageURL(path) else {
            fetchImage(path)
            return nil
        }
        guard let img = UIImage(contentsOfFile: u.path) else { return nil }
        cache.setObject(img, forKey: path as NSString)
        return img
    }

    func imageData(_ path: String) -> Data? {
        imageURL(path).flatMap { try? Data(contentsOf: $0) }
    }

    /// 拍的、挑的图：缩好（封面长边 1000，详细图 1600），起名 img/<条目 id>-<SHA-256 前 8 位>.jpg，存本地
    func addImage(_ img: UIImage, itemId: String, maxSide: CGFloat) -> String? {
        guard let jpg = ImageShrink.jpeg(img, maxSide: maxSide) else { return nil }
        let h = SHA256.hash(data: jpg).map { String(format: "%02x", $0) }.joined().prefix(8)
        let path = "img/\(itemId)-\(h).jpg"
        do {
            try jpg.write(to: folder.appendingPathComponent(path), options: .atomic)
        } catch {
            return nil
        }
        return path
    }

    private func fetchImage(_ path: String) {
        guard !demo, ImagePath.isSafe(path), !downloading.contains(path) else { return }
        downloading.insert(path)
        let url = Store.site.appendingPathComponent(path)
        let dest = folder.appendingPathComponent(path)
        Task {
            defer { downloading.remove(path) }
            guard let (d, r) = try? await URLSession.shared.data(from: url), (r as? HTTPURLResponse)?.statusCode == 200,
                  UIImage(data: d) != nil else { return }
            try? d.write(to: dest, options: .atomic)
            imageTick += 1
        }
    }

    // ------------------------------------------------------------ 拉网上那份
    /// 打开、回到前台、联网时拉。20 秒内拉过就不拉（force 除外）。
    func pull(force: Bool = false) async {
        guard !demo, !pulling else { return }
        if !force && Date().timeIntervalSince(lastPull) < 20 { return }
        pulling = true
        defer { pulling = false }
        lastPull = Date()
        // 带个时间戳，绕过 Pages 那层缓存；就算拿到旧的，合并规则也不让旧的盖掉新的
        var c = URLComponents(url: Store.site.appendingPathComponent("data.json"), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "t", value: String(Int(Date().timeIntervalSince1970)))]
        var req = URLRequest(url: c.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        do {
            let (d, r) = try await URLSession.shared.data(for: req)
            guard (r as? HTTPURLResponse)?.statusCode == 200, let remote = TXData.decode(d) else {
                lastPullError = "网上那份没读懂"
                return
            }
            update { $0.pulled(remote) }
            lastPullError = nil
            // 缺的图拉回来
            for p in data.allImages where imageURL(p) == nil { fetchImage(p) }
        } catch {
            lastPullError = "断网，看的是手机里那份"
        }
    }
}
