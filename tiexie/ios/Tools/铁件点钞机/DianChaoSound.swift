import AudioToolbox
import Foundation

// 点钞机的两声：叮（数完了）、叮叮（复查改了，顺手震一下）。两个小 wav 走系统提示音那条路：
// 跟着手机侧面的静音拨片，不打断正在放的音乐。

@MainActor
enum DCSound {
    static let ding = "dianchao-ding"
    static let dingDing = "dianchao-dingding"
    private static var ids: [String: SystemSoundID] = [:]

    static func url(_ name: String) -> URL? { Bundle.main.url(forResource: name, withExtension: "wav") }

    static func play(_ kind: DCChime.Kind) {
        let name = kind == .done ? ding : dingDing
        if ids[name] == nil, let u = url(name) {
            var i: SystemSoundID = 0
            if AudioServicesCreateSystemSoundID(u as CFURL, &i) == noErr { ids[name] = i }
        }
        if let i = ids[name] { AudioServicesPlaySystemSound(i) }
        if kind == .fixed { AudioServicesPlaySystemSound(kSystemSoundID_Vibrate) }
    }
}
