import SwiftUI
import UIKit

// 每页都能改（Song：「我能手动改，因为这个本来就是我专属做的」）：
// 改标题、改正文；换封面（拍照或相册）；布阵图的图纸能加详细图、删、拖着排顺序；能扔（问一句再扔）。
// 点「存」先存本地（存了就丢不了），再进发件箱寄给大管家。

struct EditView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    @Environment(\.dismiss) private var dismiss
    var target: EditTarget

    @State private var loaded = false
    @State private var itemId = ""
    @State private var isSet = false
    @State private var isNew = false
    @State private var cat: Category = .baodian
    @State private var setId: String?
    @State private var title = ""
    @State private var bodyText = ""
    @State private var img = ""
    @State private var plates: [String] = []
    @State private var askDelete = false

    private var isPlates: Bool { !isSet && cat == .buzhen }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(isSet ? "大标题" : "书名", text: $title)
                        .font(Paper.brush(24, relativeTo: .title2))
                } header: { head("标题") }

                if !isSet && !isPlates {
                    Section {
                        TextEditor(text: $bodyText)
                            .font(Paper.serif(16))
                            .frame(minHeight: 320)
                            .scrollContentBackground(.hidden)
                    } header: { head("正文") } footer: {
                        Text("代码行、行尾括号注释、【小标题】、「第X式」、冒号前加粗、空行分段，都自动排。")
                            .font(Paper.serif(12)).foregroundStyle(Paper.inkSoft)
                    }
                }

                Section {
                    HStack(alignment: .top, spacing: 14) {
                        CoverView(title: title.isEmpty ? "无名" : title, img: img).frame(width: 96)
                        VStack(spacing: 10) {
                            PhotoButtons { imgs in
                                if let first = imgs.first, let p = store.addImage(first, itemId: itemId, maxSide: 1000) { img = p }
                            }
                            if !img.isEmpty {
                                InkButton(title: "去掉封面") { img = "" }
                            }
                        }
                    }
                    .padding(.vertical, 6)
                } header: { head("封面") }

                if isPlates {
                    Section {
                        ForEach(plates, id: \.self) { p in
                            HStack(spacing: 12) {
                                if let ui = store.image(p) {
                                    Image(uiImage: ui).resizable().scaledToFill().frame(width: 112, height: 84).clipped()
                                } else {
                                    Rectangle().fill(Paper.wash).frame(width: 112, height: 84)
                                }
                                Text("第 \((plates.firstIndex(of: p) ?? 0) + 1) 张").font(Paper.serif(15))
                            }
                        }
                        .onMove { from, to in plates.move(fromOffsets: from, toOffset: to) }
                        .onDelete { plates.remove(atOffsets: $0) }
                        PhotoButtons(multiple: true, cameraTitle: "拍一张", albumTitle: "从相册加") { imgs in
                            for i in imgs {
                                if let p = store.addImage(i, itemId: itemId, maxSide: 1600), !plates.contains(p) { plates.append(p) }
                            }
                        }
                        .padding(.vertical, 6)
                    } header: { head("详细图") } footer: {
                        Text("按住右边三道杠拖着排顺序，左滑删。").font(Paper.serif(12)).foregroundStyle(Paper.inkSoft)
                    }
                }

                if !isNew {
                    Section {
                        Button(role: .destructive) { askDelete = true } label: {
                            Text(isSet ? "扔掉这个大标题" : "扔掉这本").font(Paper.serif(16)).frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .environment(\.editMode, .constant(isPlates ? .active : .inactive))
            .scrollContentBackground(.hidden)
            .background(PaperBackground(showFigures: false))
            .foregroundStyle(Paper.ink)
            .navigationTitle(navTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("存") { save() }.disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .confirmationDialog(deleteQuestion, isPresented: $askDelete, titleVisibility: .visible) {
                Button("扔", role: .destructive) { remove() }
                Button("不扔了", role: .cancel) {}
            }
        }
        .tint(Paper.ink)
        .onAppear(perform: load)
    }

    private func head(_ s: String) -> some View {
        Text(s).font(Paper.serif(13)).foregroundStyle(Paper.inkSoft)
    }

    private var navTitle: String {
        if isNew { return isSet ? "新开一个大标题" : (cat == .buzhen ? "新开一张图纸" : "新开一本") }
        return isSet ? "改大标题" : "改《\(title)》"
    }

    private var deleteQuestion: String {
        if isSet {
            let n = store.data.books.filter { $0.setId == itemId }.count
            return n > 0 ? "扔掉「\(title)」？下面 \(n) 张图纸一起扔。" : "扔掉「\(title)」？"
        }
        return "扔掉《\(title)》？"
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        switch target {
        case .book(let id):
            guard let b = store.data.book(id) else { return }
            itemId = b.id; cat = b.cat; setId = b.setId; title = b.title; bodyText = b.body; img = b.img; plates = b.plates
        case .set(let id):
            guard let s = store.data.set(id) else { return }
            isSet = true; itemId = s.id; title = s.title; img = s.img; cat = .buzhen
        case .newBook(let c, let sid):
            isNew = true; cat = c; setId = sid; itemId = NewID.make(c.rawValue)
        case .newSet:
            isNew = true; isSet = true; cat = .buzhen; itemId = NewID.make("set")
        }
    }

    private func save() {
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if isSet {
            store.saveSet(SetItem(id: itemId, title: t, img: img, modified: ""))
            if isNew { nav.selected[Category.buzhen.rawValue] = itemId }
        } else {
            var b = store.data.book(itemId) ?? Book(id: itemId, title: t, category: cat.rawValue, setId: setId, modified: "")
            b.title = t
            b.img = img
            if isPlates { b.plates = plates } else { b.body = bodyText }
            store.saveBook(b)
            if isNew { nav.selected[setId.map { "set:" + $0 } ?? cat.rawValue] = itemId }
        }
        dismiss()
    }

    private func remove() {
        if isSet {
            store.deleteSet(itemId)
            nav.path.removeAll { r in
                if case .set(let i) = r, i == itemId { return true }
                if case .book(let i) = r, store.data.book(i) == nil { return true }
                return false
            }
        } else {
            store.deleteBook(itemId)
            nav.path.removeAll { $0 == .book(itemId) }
        }
        dismiss()
    }
}
