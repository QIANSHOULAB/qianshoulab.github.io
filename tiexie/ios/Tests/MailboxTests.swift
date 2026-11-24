import XCTest
@testable import TieXie

// 加密、信封、配对码：跟一叶笺接口 v2 一字不差。
final class MailboxTests: XCTestCase {
    // 一叶笺接口 v2「加密」那节的对照密文：钥匙 0..31、信箱 0123456789abcdef…、to=phone，拆开是一封 result
    static let vectorKey = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
    static let vectorBox = "0123456789abcdef0123456789abcdef"
    static let vector = "oKGio6SlpqeoqaqrnToKD3/5Lp0JDOm3JUDirBXfLHzmlW5O9WoEvF35MFD/RnfPngB/Hz7oJvIrSLPLcTZ3eU/iKCpxZjFulUq0gJ+MvVUAlcbM1oaebO7s9sHvfYme9O27E4pXBLjj3xy5v7QbmiGCrfXxr2Nyv6qjZ3AVTJ/8GblTRO3k0MYgl2HnZdUHp2C6NRR5z7r01hnlbk4IjwR0HAJYkdOpwYbTkXn+iBhR5e02syYZGl82DVdVCt/7agfAWefxVAN+ZIvu0IzK6VHxXkl3svxVeBYK+rBvdtkTUeCIz+16gC+0tRVKa1xU1QH1Ha3TJjouKXpdaNGjSu03Xegb2N5HUB4dsDsdqPPN9oDSVpFhqFYKQeEKRTpogYryEMlXPerairQduTU77V26Lki9VmeJ/1c0jIjbiw=="

    func testOpensYiyeVector() throws {
        let key = try XCTUnwrap(Base64URL.decode(Self.vectorKey))
        XCTAssertEqual(key, Data(0..<32))
        let sealed = try XCTUnwrap(Data(base64Encoded: Self.vector))
        let plain = try MailCrypto.open(sealed, key: key, box: Self.vectorBox, to: "phone")
        let env = try MailEnvelope.decode(plain)
        XCTAssertEqual(env.kind, .result)
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: env.data) as? [String: Any])
        XCTAssertEqual(obj["text"] as? String, "# 11月3日交接\n\nA线早班 1,280件")
        // 方向不对拆不开
        XCTAssertThrowsError(try MailCrypto.open(sealed, key: key, box: Self.vectorBox, to: "pc"))
    }

    func testRoundTripPhoneToPc() throws {
        let p = TXPairing.generate()  // 假配对，现生成
        let phone = try XCTUnwrap(MailClient(pairing: p, role: "phone", http: NoHTTP()))
        let pc = try XCTUnwrap(MailClient(pairing: p, role: "pc", http: NoHTTP()))
        let data = try JSONSerialization.data(withJSONObject: TXAsk.hello(id: "11111111-2222", app: "0.1.0"))
        let env = MailEnvelope(kind: .request, id: "11111111-2222", at: ISOTime.string(), data: data, files: ["img/a-12345678.jpg": Data([1, 2, 3])])
        let sealed = try phone.seal(env, to: "pc")
        let back = try pc.open(sealed)
        XCTAssertEqual(back.kind, .request)
        XCTAssertEqual(back.files["img/a-12345678.jpg"], Data([1, 2, 3]))
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: back.data) as? [String: Any])
        XCTAssertEqual(obj["ask"] as? String, "tx-hello")
        // 手机自己拆不开寄给电脑的
        XCTAssertThrowsError(try phone.open(sealed))
    }

    func testEnvelopeShape() throws {
        let data = try JSONSerialization.data(withJSONObject: ["v": 1, "id": "abcdef12", "ask": "tx-del"] as [String: Any])
        let raw = try MailEnvelope(kind: .request, id: "abcdef12", at: "2026-11-24T17:00:00+08:00", data: data, files: [:]).encoded()
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: raw) as? [String: Any])
        XCTAssertEqual(obj["v"] as? Int, 2)
        XCTAssertEqual(obj["kind"] as? String, "request")
        XCTAssertEqual(obj["id"] as? String, "abcdef12")
        XCTAssertNotNil(obj["data"] as? [String: Any])
        XCTAssertNil(obj["files"])
    }

    // ------------------------------------------------------------ 配对码
    func testPairingThreeForms() throws {
        let p = TXPairing.generate()
        let json = p.json
        let code = Base64URL.encode(Data(json.utf8))
        XCTAssertFalse(code.contains("="))
        XCTAssertEqual(TXPairing.parse(json), p)
        XCTAssertEqual(TXPairing.parse("tiexie:\(code)"), p)
        XCTAssertEqual(TXPairing.parse("  tiexie://pair?c=\(code)\n"), p)
        XCTAssertEqual(TXPairing.parse(p.code), p)
    }

    func testYiyeCodeRejected() throws {
        // 一叶笺的配对码：没有 app 字段
        let yiye = "{\"v\":2,\"relay\":\"https://luruseng-relay.lunzigeju.workers.dev\",\"box\":\"0123456789abcdef0123456789abcdef\",\"key\":\"AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8\",\"host\":\"掌机\",\"at\":\"2026-11-22T00:00:00+08:00\"}"
        XCTAssertNil(TXPairing.parse(yiye))
        XCTAssertNil(TXPairing.parse("tiexie:" + Base64URL.encode(Data(yiye.utf8))))
        // app 写的是别人
        var other = TXPairing.generate()
        other.app = "yiye"
        XCTAssertNil(TXPairing.parse(other.json))
        // 坏的
        XCTAssertNil(TXPairing.parse("tiexie:不是码"))
        XCTAssertNil(TXPairing.parse("hello"))
        var short = TXPairing.generate()
        short.key = "AAEC"
        XCTAssertNil(TXPairing.parse(short.json))
    }

    func testSocketURLAndBoxShort() throws {
        let p = TXPairing.generate()
        let c = try XCTUnwrap(MailClient(pairing: p, http: NoHTTP()))
        XCTAssertEqual(c.socketURL?.absoluteString, "wss://luruseng-relay.lunzigeju.workers.dev/dgj/\(p.box)/ws?as=phone")
        XCTAssertEqual(p.boxShort.count, 6)
    }

    func testUpdateGoesBackToLiveContainerHome() {
        // livecontainer://install 从住在里面的 app 发出去只弹 “Please restart LiveContainer”，所以先回本体
        XCTAssertEqual(Updater.homeURL.absoluteString, "livecontainer://livecontainer-launch?bundle-name=ui")
    }

    func testUpdaterReadsSource() throws {
        let src = "{\"name\":\"千手院\",\"apps\":[{\"bundleIdentifier\":\"lab.qianshou.tiexie\",\"versions\":[{\"version\":\"0.1.2\",\"downloadURL\":\"https://x/y.ipa\"}]}]}"
        XCTAssertEqual(Updater.newer(in: Data(src.utf8), than: "0.1.0"), AppUpdate(version: "0.1.2", url: "https://x/y.ipa"))
        XCTAssertNil(Updater.newer(in: Data(src.utf8), than: "0.1.2"))
        XCTAssertNil(Updater.newer(in: Data(src.utf8), than: "0.10.0"))
    }
}

struct NoHTTP: MailHTTP {
    func send(_ req: URLRequest) async throws -> (Data, Int) { (Data(), 500) }
}
