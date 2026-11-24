import SwiftUI

// 导航照网站：首页标题下四栏 宝典｜刀法｜布阵图｜兵器谱；点书翻开、布阵图大标题 → 图纸 → 详细图。
// 打开回到上次看的那页（Song 在机床边反复看探头那几页）；第一次打开在宝典。

enum Route: Hashable, Codable {
    case set(String)
    case book(String)
    case toolbox
    case tool(String)
    case settings
}

@MainActor
final class Nav: ObservableObject {
    @Published var cat: Category { didSet { remember() } }
    @Published var path: [Route] { didSet { remember() } }
    /// 每一栏（和每个大标题里）上次点的那一条
    @Published var selected: [String: String] { didSet { remember() } }
    /// 正在改的：.book(id) / .set(id)；新开的条目还没进库时在 draft 里
    @Published var editing: EditTarget?

    private let demo: Bool
    private static let key = "tiexie.nav.v1"

    struct Saved: Codable {
        var cat: Category
        var path: [Route]
        var selected: [String: String]
    }

    init(demo: Bool) {
        self.demo = demo
        if demo {
            cat = .baodian
            path = []
            selected = [:]
            Nav.applyDemo(self)
            return
        }
        if let d = UserDefaults.standard.data(forKey: Nav.key), let s = try? JSONDecoder().decode(Saved.self, from: d) {
            cat = s.cat
            path = s.path
            selected = s.selected
        } else {
            cat = .baodian
            path = []
            selected = [:]
        }
    }

    private func remember() {
        guard !demo else { return }
        if let d = try? JSONEncoder().encode(Saved(cat: cat, path: path, selected: selected)) {
            UserDefaults.standard.set(d, forKey: Nav.key)
        }
    }

    /// 截图用的几个界面
    private static func applyDemo(_ n: Nav) {
        switch Demo.screen {
        case "book": n.path = [.book("vm10")]
        case "vm12": n.path = [.book("vm12")]
        case "buzhen": n.cat = .buzhen
        case "daofa": n.cat = .daofa
        case "edit":
            n.path = [.book("vm10")]
            n.editing = .book("vm10")
        case "toolbox": n.path = [.toolbox]
        case "jiaodu": n.path = [.toolbox, .tool("jiaodu")]
        case "gongshi": n.path = [.toolbox, .tool("gongshi")]
        case "settings": n.path = [.settings]
        default:
            // 工具箱里的工具：-TXScreen tool-<工具 id>（122 起，加工具不用再改这里）
            if Demo.screen.hasPrefix("tool-") { n.path = [.toolbox, .tool(String(Demo.screen.dropFirst(5)))] }
        }
    }
}

enum EditTarget: Identifiable, Equatable {
    case book(String)
    case set(String)
    /// 新开一本（栏目，或者布阵图某个大标题下的图纸）
    case newBook(Category, setId: String?)
    case newSet

    var id: String {
        switch self {
        case .book(let i): return "b:" + i
        case .set(let i): return "s:" + i
        case .newBook(let c, let s): return "nb:\(c.rawValue):\(s ?? "")"
        case .newSet: return "ns"
        }
    }
}
