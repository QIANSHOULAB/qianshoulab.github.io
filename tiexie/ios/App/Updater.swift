import Foundation
import UIKit

// 查新版：打开时看千手院总源 https://qianshoulab.github.io/apps.json，有新版就在设置图标上点个小红点。
// 点了更新：先把发件箱寄一遍，再切回 LiveContainer 本体（livecontainer://livecontainer-launch?bundle-name=ui），
// 在本体 Sources → 千手院 → 铁屑江湖 → Install 换包。
// 不能直接开 livecontainer://install：LiveContainer 里正跑着 app（就是我们自己）时，那个链接只弹
// “Please restart LiveContainer to install apps.”、不装（LiveContainer 3.8.14 TweakLoader/UIKit+GuestHooks.m 的 install 分支）。

struct AppUpdate: Equatable {
    var version: String
    var url: String
}

@MainActor
final class Updater: ObservableObject {
    static let source = URL(string: "https://qianshoulab.github.io/apps.json")!
    static let bundleID = "lab.qianshou.tiexie"

    @Published private(set) var available: AppUpdate?
    let current: String
    private var checked = Date.distantPast

    init() {
        current = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    func check() async {
        guard Date().timeIntervalSince(checked) > 600 else { return }
        checked = Date()
        var req = URLRequest(url: Updater.source, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        guard let (d, r) = try? await URLSession.shared.data(for: req), (r as? HTTPURLResponse)?.statusCode == 200 else { return }
        available = Updater.newer(in: d, than: current)
    }

    /// 源里这个 app 最新的一版比手上的新，就给出来
    nonisolated static func newer(in source: Data, than current: String) -> AppUpdate? {
        guard let obj = try? JSONSerialization.jsonObject(with: source) as? [String: Any],
              let apps = obj["apps"] as? [[String: Any]],
              let app = apps.first(where: { $0["bundleIdentifier"] as? String == bundleID }),
              let versions = app["versions"] as? [[String: Any]], let top = versions.first,
              let v = top["version"] as? String, let url = top["downloadURL"] as? String else { return nil }
        return compare(v, current) > 0 ? AppUpdate(version: v, url: url) : nil
    }

    nonisolated static func compare(_ a: String, _ b: String) -> Int {
        let x = a.split(separator: ".").map { Int($0) ?? 0 }, y = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(x.count, y.count) {
            let p = i < x.count ? x[i] : 0, q = i < y.count ? y[i] : 0
            if p != q { return p < q ? -1 : 1 }
        }
        return 0
    }

    /// 切回 LiveContainer 本体主屏（会先问一句 “switch to LiveContainer?”）
    nonisolated static let homeURL = URL(string: "livecontainer://livecontainer-launch?bundle-name=ui")!
}
