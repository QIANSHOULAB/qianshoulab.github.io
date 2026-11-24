import Foundation
import Security

/// 钥匙串：大管家信箱的配对（信箱号 + 钥匙）存这里，不进日志、不进 UserDefaults。
/// LiveContainer 里钥匙串万一用不了（写不进去），退一步存在 app 自己的数据文件夹（只有这台手机、这个 app 看得见），报告里写了。
enum Keychain {
    static let service = "lab.qianshou.tiexie.butler"
    static let account = "pairing"

    private static func base() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    private static var fallbackURL: URL {
        Store.dir.appendingPathComponent("pair.bin")
    }

    static func read() -> Data? {
        var q = base()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data { return d }
        return try? Data(contentsOf: fallbackURL)
    }

    @discardableResult
    static func write(_ data: Data) -> Bool {
        let q = base()
        let attrs: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var ok = SecItemUpdate(q as CFDictionary, attrs as CFDictionary) == errSecSuccess
        if !ok {
            var add = q
            for (k, v) in attrs { add[k] = v }
            ok = SecItemAdd(add as CFDictionary, nil) == errSecSuccess
        }
        if ok {
            try? FileManager.default.removeItem(at: fallbackURL)
            return true
        }
        do {
            try data.write(to: fallbackURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch {
            return false
        }
    }

    static func delete() {
        SecItemDelete(base() as CFDictionary)
        try? FileManager.default.removeItem(at: fallbackURL)
    }
}
