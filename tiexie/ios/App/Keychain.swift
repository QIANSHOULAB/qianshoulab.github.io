import Foundation
import Security

/// 钥匙串：大管家信箱的配对（信箱号 + 钥匙）存这里，不进日志、不进 UserDefaults。
/// 131 起还存备用信箱的配置（apiKey、databaseURL）和匿名登录的 refreshToken：各一个 account。
/// LiveContainer 里钥匙串万一用不了（写不进去），退一步存在 app 自己的数据文件夹（只有这台手机、这个 app 看得见），报告里写了。
enum Keychain {
    static let service = "lab.qianshou.tiexie.butler"
    static let account = "pairing"
    static let backupAccount = "backup-config"
    static let backupAuthAccount = "backup-auth"

    private static func base(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    /// 配对一直叫 pair.bin，别的 account 叫 <account>.bin
    private static func fallbackURL(_ account: String) -> URL {
        Store.dir.appendingPathComponent(account == Keychain.account ? "pair.bin" : "\(account).bin")
    }

    static func read(account: String = Keychain.account) -> Data? {
        var q = base(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data { return d }
        return try? Data(contentsOf: fallbackURL(account))
    }

    @discardableResult
    static func write(_ data: Data, account: String = Keychain.account) -> Bool {
        let q = base(account)
        let attrs: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var ok = SecItemUpdate(q as CFDictionary, attrs as CFDictionary) == errSecSuccess
        if !ok {
            var add = q
            for (k, v) in attrs { add[k] = v }
            ok = SecItemAdd(add as CFDictionary, nil) == errSecSuccess
        }
        if ok {
            try? FileManager.default.removeItem(at: fallbackURL(account))
            return true
        }
        do {
            try data.write(to: fallbackURL(account), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch {
            return false
        }
    }

    static func delete(account: String = Keychain.account) {
        SecItemDelete(base(account) as CFDictionary)
        try? FileManager.default.removeItem(at: fallbackURL(account))
    }
}
