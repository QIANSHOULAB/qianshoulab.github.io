import SwiftUI
import PhotosUI
import UIKit

// 拍照、从相册挑：秘籍封面、布阵图纸用；122 的照妖镜、点钞机也用这一份。

/// 系统相机（拍一张就回来）
struct CameraPicker: UIViewControllerRepresentable {
    var onPick: (UIImage?) -> Void

    static var available: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let c = UIImagePickerController()
        c.sourceType = .camera
        c.delegate = context.coordinator
        return c
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onPick: (UIImage?) -> Void
        init(onPick: @escaping (UIImage?) -> Void) { self.onPick = onPick }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onPick(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onPick(nil) }
    }
}

/// 「拍照」「相册」两个按钮。挑好的图交给 onImages（相册可以一次挑几张）
struct PhotoButtons: View {
    var multiple = false
    var cameraTitle = "拍照"
    var albumTitle = "相册"
    var onImages: ([UIImage]) -> Void

    @State private var camera = false
    @State private var items: [PhotosPickerItem] = []

    var body: some View {
        HStack(spacing: 10) {
            if CameraPicker.available {
                InkButton(title: cameraTitle) { camera = true }
            }
            PhotosPicker(selection: $items, maxSelectionCount: multiple ? 20 : 1, matching: .images) {
                Text(albumTitle)
                    .font(Paper.serif(17, relativeTo: .body))
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Paper.ink, lineWidth: 1.5))
            }
            .buttonStyle(.plain)
        }
        .fullScreenCover(isPresented: $camera) {
            CameraPicker { img in
                camera = false
                if let img { onImages([img]) }
            }
            .ignoresSafeArea()
        }
        .onChange(of: items) { _, new in
            guard !new.isEmpty else { return }
            let picked = new
            items = []
            Task {
                var out: [UIImage] = []
                for it in picked {
                    if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { out.append(img) }
                }
                await MainActor.run { if !out.isEmpty { onImages(out) } }
            }
        }
    }
}

enum ImageShrink {
    /// 长边缩到 maxSide 以内（不放大），扶正方向，出 JPEG
    static func jpeg(_ img: UIImage, maxSide: CGFloat, quality: CGFloat = 0.82) -> Data? {
        let w = img.size.width, h = img.size.height
        guard w > 0, h > 0 else { return nil }
        let k = min(1, maxSide / max(w, h))
        let size = CGSize(width: (w * k).rounded(), height: (h * k).rounded())
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        f.opaque = true
        let out = UIGraphicsImageRenderer(size: size, format: f).image { _ in
            img.draw(in: CGRect(origin: .zero, size: size))
        }
        return out.jpegData(compressionQuality: quality)
    }
}
