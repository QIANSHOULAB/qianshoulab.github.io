import SwiftUI

// 首页（照网站 home()）：标题 + 印章，四栏，四周双边的版框里左边目录、右边封面，点封面翻开。
// 布阵图那一栏目录里是大标题；进了大标题（SetView）目录里是图纸。

struct RootView: View {
    @EnvironmentObject var nav: Nav
    @EnvironmentObject var store: Store

    var body: some View {
        NavigationStack(path: $nav.path) {
            ShelfView(setId: nil)
                .navigationDestination(for: Route.self) { r in
                    switch r {
                    case .set(let id): ShelfView(setId: id)
                    case .book(let id): BookView(id: id)
                    case .toolbox: ToolboxView()
                    case .tool(let id): ToolHost(id: id)
                    case .settings: SettingsView()
                    }
                }
        }
        .tint(Paper.ink)
        .sheet(item: $nav.editing) { t in
            EditView(target: t)
                .environmentObject(store)
                .environmentObject(nav)
        }
    }
}

/// 页头：毛笔大字 + 印章 + 副标题，背后两个淡淡的招式小人；右上角工具箱、设置两个小图标
struct SiteHeader: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    @EnvironmentObject var updater: Updater

    var body: some View {
        ZStack(alignment: .topLeading) {
            InkFigure(name: "leap").frame(width: 68, height: 54).offset(x: 0, y: 8)
            HStack {
                Spacer()
                InkFigure(name: "kick").frame(width: 150, height: 118)
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .center, spacing: 14) {
                    Text(store.data.site.name)
                        .font(Paper.brush(46, relativeTo: .largeTitle))
                        .tracking(2.5)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Seal(text: String(store.data.site.name.prefix(4)))
                }
                if !store.data.site.sub.isEmpty {
                    Text(store.data.site.sub).font(Paper.serif(15, relativeTo: .subheadline)).foregroundStyle(Paper.inkSoft)
                }
            }
            .padding(.top, 2)
            HStack(spacing: 4) {
                Spacer()
                Button { nav.path.append(.toolbox) } label: {
                    Image(systemName: "wrench.and.screwdriver").font(.system(size: 18, weight: .regular))
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("工具箱")
                Button { nav.path.append(.settings) } label: {
                    Image(systemName: "gearshape").font(.system(size: 18, weight: .regular))
                        .frame(width: 44, height: 44)
                        .overlay(alignment: .topTrailing) {
                            if updater.available != nil {
                                Circle().fill(Paper.seal).frame(width: 8, height: 8).offset(x: -8, y: 9)
                            }
                        }
                }
                .accessibilityLabel(updater.available != nil ? "设置，有新版" : "设置")
            }
            .foregroundStyle(Paper.inkSoft)
            .offset(y: -10)
        }
        .padding(.horizontal, 2)
        .padding(.bottom, 18)
    }
}

/// 标题下一排四个等宽：宝典｜刀法｜布阵图｜兵器谱
struct Lanes: View {
    @EnvironmentObject var nav: Nav
    var current: Category

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Category.allCases) { c in
                Button {
                    nav.cat = c
                    if !nav.path.isEmpty { nav.path = [] }
                } label: {
                    Text(c.label)
                        .font(Paper.brush(22, relativeTo: .title3))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .foregroundStyle(c == current ? Paper.seal : Paper.ink)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .padding(.bottom, 4)
                        .overlay(alignment: .bottom) {
                            if c == current {
                                Rectangle().fill(Paper.seal).frame(width: 34, height: 3).padding(.bottom, 2)
                            }
                        }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(c == current ? .isSelected : [])
            }
        }
        .padding(.horizontal, 2)
        .padding(.top, 4)
        .padding(.bottom, 16)
    }
}

/// 一栏（setId == nil）或者一个布阵图大标题（setId 有值）
struct ShelfView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    var setId: String?

    private struct Row: Identifiable { var id: String; var title: String; var img: String }

    var body: some View {
        let data = store.data
        let openSet = setId.flatMap { data.set($0) }
        let cat: Category = setId != nil ? .buzhen : nav.cat
        let groupShelf = cat == .buzhen && setId == nil
        let shelfKey = setId.map { "set:" + $0 } ?? cat.rawValue
        let rows: [Row] = groupShelf
            ? data.sets.map { Row(id: $0.id, title: $0.title, img: $0.img) }
            : data.books.filter { setId != nil ? $0.setId == setId : $0.category == cat.rawValue }
                .map { Row(id: $0.id, title: $0.title, img: $0.img) }
        let current = rows.first { $0.id == nav.selected[shelfKey] } ?? rows.first

        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SiteHeader()
                Lanes(current: cat)
                if let s = openSet {
                    HStack(spacing: 8) {
                        Text(s.title).font(Paper.brush(34, relativeTo: .largeTitle)).lineLimit(2)
                        Spacer()
                    }
                    .padding(.bottom, 10)
                }
                Split(ratio: 0.37) {
                    toc(rows: rows, current: current, shelfKey: shelfKey, cat: cat, groupShelf: groupShelf)
                    stage(current: current, groupShelf: groupShelf, cat: cat)
                }
                .padding(6)
                .doubleFrame()
                ZStack(alignment: .topLeading) {
                    InkFigure(name: "dash").frame(width: 210).offset(x: 0, y: 0)
                    InkFigure(name: "palm").frame(width: 120).offset(x: 100, y: 70)
                    HStack { Spacer(); InkFigure(name: "thrust", flip: true).frame(width: 200) }.offset(y: 130)
                }
                .frame(maxWidth: .infinity, minHeight: 220, alignment: .topLeading)
                .clipped()
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .paperPage()
        .toolbar(setId == nil ? .hidden : .visible, for: .navigationBar)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            if let s = openSet {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("改") { nav.editing = .set(s.id) }.font(Paper.serif(17))
                }
            }
        }
    }

    @ViewBuilder
    private func toc(rows: [Row], current: Row?, shelfKey: String, cat: Category, groupShelf: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(rows) { r in
                let on = r.id == current?.id
                Button {
                    nav.selected[shelfKey] = r.id
                } label: {
                    HStack(spacing: 8) {
                        Circle().strokeBorder(on ? Paper.seal : .clear, lineWidth: 1.5).frame(width: 8, height: 8)
                        Text(r.title)
                            .font(Paper.brush(19, relativeTo: .body))
                            .foregroundStyle(on ? Paper.ink : Paper.inkSoft)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 13)
                    .padding(.horizontal, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(on ? Paper.indigo.opacity(0.06) : .clear)
                    .overlay(alignment: .bottom) { Rectangle().fill(Paper.rule.opacity(0.45)).frame(height: 1) }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
            if rows.isEmpty {
                Text("尚未收录").font(Paper.serif(14)).foregroundStyle(Paper.inkSoft).padding(.horizontal, 10).padding(.vertical, 14)
            }
            Button {
                if groupShelf { nav.editing = .newSet } else { nav.editing = .newBook(cat, setId: setId) }
            } label: {
                Text(groupShelf ? "＋ 新开一个大标题" : (setId != nil ? "＋ 新开一张图纸" : "＋ 新开一本"))
                    .font(Paper.serif(15, relativeTo: .subheadline))
                    .foregroundStyle(Paper.inkSoft)
                    .padding(.vertical, 13)
                    .padding(.horizontal, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .bottom) {
                        Line().stroke(Paper.rule.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [4, 3])).frame(height: 1)
                    }
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .overlay(alignment: .trailing) { Rectangle().fill(Paper.rule).frame(width: 1) }
    }

    @ViewBuilder
    private func stage(current: Row?, groupShelf: Bool, cat: Category) -> some View {
        VStack(spacing: 10) {
            if let c = current {
                Button {
                    nav.path.append(groupShelf ? .set(c.id) : .book(c.id))
                } label: {
                    CoverView(title: c.title, img: c.img).frame(maxWidth: 300)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(groupShelf ? "进入\(c.title)" : "翻开《\(c.title)》")
                Text(groupShelf ? c.title : "《\(c.title)》")
                    .font(Paper.brush(22, relativeTo: .title3))
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
                Text(groupShelf ? "进入" : (cat == .buzhen ? "点图查看" : "点书翻开"))
                    .font(Paper.serif(13, relativeTo: .footnote))
                    .foregroundStyle(Paper.inkSoft)
                    .padding(.top, -6)
            } else {
                Text("尚未收录").font(Paper.serif(13)).foregroundStyle(Paper.inkSoft)
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 18)
        .padding(.bottom, 14)
        .frame(maxWidth: .infinity)
    }
}

struct Line: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}
