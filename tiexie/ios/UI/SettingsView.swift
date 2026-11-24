import SwiftUI

// 设置：配大管家（粘贴配对码）、送没送到那一行小字、版本和更新。不要横幅、不要大提示条。

struct SettingsView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var butler: Butler
    @EnvironmentObject var updater: Updater
    @Environment(\.openURL) private var openURL
    @State private var askUnpair = false
    @State private var updating = false

    var body: some View {
        Form {
            Section {
                if let p = butler.pairing {
                    row("配好了", "\(p.host ?? "电脑") · 信箱 \(p.boxShort)…")
                    if butler.online {
                        row("大管家", "在线")
                    }
                }
                PasteButton(payloadType: String.self) { strings in
                    guard let s = strings.first else { return }
                    Task { @MainActor in butler.pair(s) }
                }
                .tint(Paper.ink)
                .labelStyle(.titleAndIcon)
                if let m = butler.pairMessage {
                    Text(m).font(Paper.serif(13)).foregroundStyle(Paper.inkSoft)
                }
                if butler.pairing != nil {
                    Button("解除配对", role: .destructive) { askUnpair = true }
                }
            } header: { head("大管家") } footer: {
                Text(butler.pairing == nil ? "配对码大管家经 Telegram 发你，复制了点上面那个按钮。" : "改的东西大管家推上 GitHub，网页跟着变。")
                    .font(Paper.serif(12)).foregroundStyle(Paper.inkSoft)
            }

            Section {
                Text(butler.statusLine).font(Paper.serif(15))
                if let e = store.lastPullError {
                    Text(e).font(Paper.serif(13)).foregroundStyle(Paper.inkSoft)
                }
            } header: { head("送到没有") }

            Section {
                row("铁屑江湖", updater.current)
                if let u = updater.available {
                    Button {
                        updating = true
                        Task {
                            await butler.flush()
                            if let url = Updater.installURL(u.url) { openURL(url) }
                            updating = false
                        }
                    } label: {
                        HStack {
                            Circle().fill(Paper.seal).frame(width: 8, height: 8)
                            Text("有新版 \(u.version)，点一下更新").font(Paper.serif(16))
                            Spacer()
                            if updating { ProgressView() }
                        }
                    }
                    .disabled(updating)
                }
            } header: { head("版本") }
        }
        .scrollContentBackground(.hidden)
        .background(PaperBackground(showFigures: false))
        .foregroundStyle(Paper.ink)
        .navigationTitle("设置")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .confirmationDialog("解除配对？改的东西会攒在手机里，配上了再寄。", isPresented: $askUnpair, titleVisibility: .visible) {
            Button("解除", role: .destructive) { butler.unpair() }
            Button("不了", role: .cancel) {}
        }
    }

    private func head(_ s: String) -> some View {
        Text(s).font(Paper.serif(13)).foregroundStyle(Paper.inkSoft)
    }

    private func row(_ a: String, _ b: String) -> some View {
        HStack {
            Text(a).font(Paper.serif(16))
            Spacer()
            Text(b).font(Paper.serif(15)).foregroundStyle(Paper.inkSoft)
        }
    }
}

// 工具箱：铁屑江湖自己的工具箱（不是便签里那个）。一格一个工具，名单在 Tools/Registry.swift。
struct ToolboxView: View {
    @EnvironmentObject var nav: Nav

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("工具箱").font(Paper.brush(38, relativeTo: .largeTitle))
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(ToolRegistry.all) { t in
                        Button { nav.path.append(.tool(t.id)) } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Image(systemName: t.symbol).font(.system(size: 28, weight: .regular)).foregroundStyle(Paper.seal)
                                Text(t.name).font(Paper.brush(24, relativeTo: .title2))
                                Text(t.sub).font(Paper.serif(12, relativeTo: .caption)).foregroundStyle(Paper.inkSoft)
                                    .lineLimit(3).multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
                            .doubleFrame()
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
        .paperPage()
        .toolbarBackground(.hidden, for: .navigationBar)
    }
}

struct ToolHost: View {
    var id: String

    var body: some View {
        if let t = ToolRegistry.all.first(where: { $0.id == id }) {
            t.make()
                .toolbarBackground(.hidden, for: .navigationBar)
        } else {
            Text("这个工具搬走了。").font(Paper.serif()).paperPage()
        }
    }
}
