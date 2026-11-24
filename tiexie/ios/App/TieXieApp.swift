import SwiftUI
import Network
import CoreText

// 铁屑江湖 iPhone 版（施工单 120）。住在 LiveContainer 里，离线看秘籍，每页能改，改的经信箱交给大管家推上 GitHub。

@main
struct TieXieApp: App {
    @StateObject private var store: Store
    @StateObject private var butler: Butler
    @StateObject private var updater = Updater()
    @StateObject private var nav: Nav
    @Environment(\.scenePhase) private var phase
    private let net = NetWatch()

    init() {
        let demo = Demo.on
        let s = Store(demo: demo)
        _store = StateObject(wrappedValue: s)
        _butler = StateObject(wrappedValue: Butler(store: s))
        _nav = StateObject(wrappedValue: Nav(demo: demo))
        Fonts.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(butler)
                .environmentObject(updater)
                .environmentObject(nav)
                .onOpenURL { url in
                    // tiexie://pair?c=<码>
                    if url.scheme == "tiexie", url.host == "pair" {
                        butler.pair(url.absoluteString)
                        nav.path = [.settings]
                    }
                }
                .onAppear {
                    net.onBack = {
                        Task { @MainActor in
                            await store.pull(force: true)
                            await butler.flush()
                        }
                    }
                    net.start()
                    guard !Demo.on, !Demo.testing else { return }
                    butler.start()
                    Task {
                        await store.pull()
                        await updater.check()
                    }
                }
        }
        .onChange(of: phase) { _, p in
            guard !Demo.on, !Demo.testing else { return }
            switch p {
            case .active:
                butler.start()
                Task {
                    await store.pull()
                    await updater.check()
                }
            case .background:
                butler.stop()
            default:
                break
            }
        }
    }
}

/// 联网了就拉一遍、寄一遍
final class NetWatch: @unchecked Sendable {
    private let monitor = NWPathMonitor()
    private var wasUp = true
    var onBack: (() -> Void)?

    func start() {
        guard !Demo.on, !Demo.testing else { return }
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let up = path.status == .satisfied
            if up && !self.wasUp { self.onBack?() }
            self.wasUp = up
        }
        monitor.start(queue: DispatchQueue(label: "lab.qianshou.tiexie.net"))
    }
}

enum Fonts {
    /// UIAppFonts 已经登记了；这里再保险一次（字没进包也不崩，退回系统字）
    static func register() {
        for name in ["MaShanZheng-Regular", "NotoSerifSC"] {
            guard let u = Bundle.main.url(forResource: name, withExtension: "ttf") else { continue }
            CTFontManagerRegisterFontsForURL(u as CFURL, .process, nil)
        }
    }
}

/// 截图、单测用：-TXDemo YES -TXScreen <界面>
enum Demo {
    static var on: Bool { UserDefaults.standard.bool(forKey: "TXDemo") }
    static var screen: String { UserDefaults.standard.string(forKey: "TXScreen") ?? "" }
    static var testing: Bool { ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil }
}
