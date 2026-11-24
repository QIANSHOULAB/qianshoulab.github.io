import XCTest
@testable import TieXie

// 备用信箱（131）：全用假服务器，不碰真的谷歌。配置、令牌都是假的。

/// 假的 Firebase：登录两个接口 + 数据库的 PUT / DELETE（按路径存在一张平表里）
final class FakeFirebase: MailHTTP {
    var flat: [String: Any] = [:]
    var log: [String] = []
    var signUps = 0
    var refreshes = 0
    var fail401Once = false
    var downCode: Int?

    private func json(_ o: Any) -> (Data, Int) {
        ((try? JSONSerialization.data(withJSONObject: o, options: .fragmentsAllowed)) ?? Data(), 200)
    }

    func send(_ req: URLRequest) async throws -> (Data, Int) {
        guard let u = req.url else { return (Data(), 0) }
        switch u.host ?? "" {
        case "identitytoolkit.googleapis.com":
            signUps += 1
            return json(["idToken": "id-s\(signUps)", "refreshToken": "rt-s\(signUps)", "expiresIn": "3600"])
        case "securetoken.googleapis.com":
            refreshes += 1
            let body = String(decoding: req.httpBody ?? Data(), as: UTF8.self)
            guard body.contains("grant_type=refresh_token"), body.contains("refresh_token=rt-") else { return (Data(), 400) }
            return json(["id_token": "id-r\(refreshes)", "refresh_token": "rt-r\(refreshes)", "expires_in": "3600"])
        default:
            break
        }
        if let c = downCode { return (Data(), c) }
        if fail401Once {
            fail401Once = false
            return (Data(), 401)
        }
        let auth = URLComponents(url: u, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "auth" })?.value ?? ""
        guard auth.hasPrefix("id-") else { return (Data(), 401) }
        var parts = u.path.split(separator: "/").map(String.init)
        guard parts.count >= 3, parts[0] == "boxes", parts[1].count == 32 else { return (Data(), 403) }
        parts.removeFirst(2)
        var rest = parts.joined(separator: "/")
        guard rest.hasSuffix(".json") else { return (Data(), 404) }
        rest.removeLast(5)
        switch req.httpMethod ?? "GET" {
        case "PUT":
            flat[rest] = try JSONSerialization.jsonObject(with: req.httpBody ?? Data(), options: .fragmentsAllowed)
            log.append("PUT \(rest)")
        case "DELETE":
            for k in flat.keys where k == rest || k.hasPrefix(rest + "/") { flat.removeValue(forKey: k) }
            log.append("DELETE \(rest)")
        default:
            break
        }
        return (Data("null".utf8), 200)
    }

    /// 某个方向（to_pc / to_phone）下的整棵树，跟流里第一个 put "/" 给的一样；array=true 时 p 像 Firebase 那样变成数组
    func tree(_ dir: String, array: Bool = false) -> [String: Any] {
        var out: [String: Any] = [:]
        for (k, v) in flat where k.hasPrefix(dir + "/") {
            let c = k.split(separator: "/").map(String.init)
            guard c.count >= 3 else { continue }
            var e = out[c[1]] as? [String: Any] ?? [:]
            if c[2] == "meta" {
                e["meta"] = v
            } else if c[2] == "p", c.count == 4 {
                var p = e["p"] as? [String: Any] ?? [:]
                p[c[3]] = v
                e["p"] = p
            }
            out[c[1]] = e
        }
        if array {
            for (mid, e0) in out {
                var e = e0 as? [String: Any] ?? [:]
                if let p = e["p"] as? [String: Any] {
                    e["p"] = (0..<p.count).map { p[String($0)] ?? NSNull() }
                }
                out[mid] = e
            }
        }
        return out
    }
}

final class FakeClock {
    var t = Date(timeIntervalSince1970: 1_800_000_000)
    func now() -> Date { t }
}

func fbEvent(_ name: String, path: String, data: Any) -> (String, String) {
    let o: [String: Any] = ["path": path, "data": data]
    let d = (try? JSONSerialization.data(withJSONObject: o, options: .fragmentsAllowed)) ?? Data()
    return (name, String(decoding: d, as: UTF8.self))
}

final class FirebaseMailboxTests: XCTestCase {
    static let cfg = FBConfig(type: "firebase-rtdb", apiKey: "fake-api-key", databaseURL: "https://fake-db.example.firebasedatabase.app/")

    func makeMailbox(_ fake: FakeFirebase, box: String = String(repeating: "ab", count: 16), clock: FakeClock = FakeClock()) -> (FBMailbox, FBAuth) {
        let auth = FBAuth(config: Self.cfg, http: fake, now: { clock.now() }, loadRefresh: { nil }, saveRefresh: { _ in })
        return (FBMailbox(config: Self.cfg, box: box, auth: auth, http: fake), auth)
    }

    // ------------------------------------------------------------ 配置
    func testConfigFromDelivery() throws {
        func data(_ backup: [String: Any], kind2: String = "config") throws -> Data {
            try JSONSerialization.data(withJSONObject: ["id": "cfg-0123456789ab", "kind2": kind2, "at": "x", "backup": backup])
        }
        let ok = ["type": "firebase-rtdb", "apiKey": "k", "databaseURL": "https://a.example.com"]
        let got = try XCTUnwrap(FBConfig.fromDelivery(try data(ok)))
        XCTAssertEqual(got.id, "cfg-0123456789ab")
        XCTAssertEqual(got.config.apiKey, "k")
        XCTAssertNil(FBConfig.fromDelivery(try data(ok, kind2: "other")))
        XCTAssertNil(FBConfig.fromDelivery(try data(["type": "other", "apiKey": "k", "databaseURL": "https://a.example.com"])))
        XCTAssertNil(FBConfig.fromDelivery(try data(["type": "firebase-rtdb", "apiKey": "k", "databaseURL": "http://a.example.com"])))
        XCTAssertNil(FBConfig.fromDelivery(try data(["type": "firebase-rtdb", "apiKey": "", "databaseURL": "https://a.example.com"])))
        XCTAssertEqual(Self.cfg.base, "https://fake-db.example.firebasedatabase.app")
    }

    // ------------------------------------------------------------ 登录
    func testAuthSignUpThenRefresh() async throws {
        let fake = FakeFirebase()
        let clock = FakeClock()
        var saved: [String] = []
        let auth = FBAuth(config: Self.cfg, http: fake, now: { clock.now() }, loadRefresh: { nil }, saveRefresh: { saved.append($0) })
        let t1 = try await auth.token()
        XCTAssertEqual(t1, "id-s1")
        XCTAssertEqual(saved, ["rt-s1"])
        // 没到点：用缓存的
        clock.t.addTimeInterval(3000)
        let t2 = try await auth.token()
        XCTAssertEqual(t2, "id-s1")
        XCTAssertEqual(fake.signUps, 1)
        // 离到点不足 5 分钟：换新的（refresh，不是重新登录）
        clock.t.addTimeInterval(400)
        let t3 = try await auth.token()
        XCTAssertEqual(t3, "id-r1")
        XCTAssertEqual(fake.signUps, 1)
        XCTAssertEqual(saved.last, "rt-r1")
    }

    func testAuthUsesSavedRefreshToken() async throws {
        let fake = FakeFirebase()
        let auth = FBAuth(config: Self.cfg, http: fake, loadRefresh: { "rt-old" }, saveRefresh: { _ in })
        let t = try await auth.token()
        XCTAssertEqual(t, "id-r1")
        XCTAssertEqual(fake.signUps, 0)
    }

    func testAuthRefreshRejectedSignsUpAgain() async throws {
        let fake = FakeFirebase()
        let auth = FBAuth(config: Self.cfg, http: fake, loadRefresh: { "garbage" }, saveRefresh: { _ in })
        let t = try await auth.token()
        XCTAssertEqual(t, "id-s1")  // 换不成：重新匿名登录
    }

    // ------------------------------------------------------------ 寄信
    func testPutLetterChunksAndMetaLast() async throws {
        let fake = FakeFirebase()
        let (m, _) = makeMailbox(fake)
        let sealed = Data((0..<2_300_000).map { UInt8(truncatingIfNeeded: $0 &* 7) })
        try await m.putLetter(mid: "abcdef12-0001", sealed: sealed, to: "pc")
        let ps = fake.flat.keys.filter { $0.hasPrefix("to_pc/abcdef12-0001/p/") }
        XCTAssertEqual(ps.count, 4)  // 2.3 MB → base64 3.07M 字 → 4 片
        for k in ps {
            let s = try XCTUnwrap(fake.flat[k] as? String)
            XCTAssertLessThanOrEqual(s.count, 1_000_000)
        }
        let meta = try XCTUnwrap(fake.flat["to_pc/abcdef12-0001/meta"] as? [String: Any])
        XCTAssertEqual((meta["n"] as? NSNumber)?.intValue, 4)
        XCTAssertEqual((meta["size"] as? NSNumber)?.intValue, 2_300_000)
        XCTAssertNotNil(meta["at"])
        XCTAssertEqual(fake.log.last, "PUT to_pc/abcdef12-0001/meta")
        // 删整封 = ack
        try await m.deleteLetter(mid: "abcdef12-0001", dir: "to_pc")
        XCTAssertTrue(fake.flat.isEmpty)
    }

    func testPutLetterTooBigAndBadID() async throws {
        let fake = FakeFirebase()
        let (m, _) = makeMailbox(fake)
        do {
            try await m.putLetter(mid: "abcdef12", sealed: Data(count: FBMailbox.maxRaw + 1), to: "pc")
            XCTFail("太大了应该不收")
        } catch let e as MailError {
            XCTAssertEqual(e, .tooBig(FBMailbox.maxRaw + 1))
        }
        do {
            try await m.putLetter(mid: "../x", sealed: Data([1]), to: "pc")
            XCTFail("id 不对应该不收")
        } catch {}
        XCTAssertTrue(fake.flat.isEmpty)
    }

    func testExpiredTokenRetriesOnce() async throws {
        let fake = FakeFirebase()
        let (m, _) = makeMailbox(fake)
        try await m.markSeen()  // 先登上
        fake.fail401Once = true
        try await m.markSeen()
        XCTAssertEqual(fake.refreshes + fake.signUps, 2)  // 401 以后换了一个新令牌
        XCTAssertNotNil(fake.flat["seen/phone"])
    }

    func testServerDownThrowsHTTP() async throws {
        let fake = FakeFirebase()
        let (m, _) = makeMailbox(fake)
        fake.downCode = 503
        do {
            try await m.markSeen()
            XCTFail("应该报错")
        } catch let e as MailError {
            guard case .http(let c, _) = e else { return XCTFail("不是 http 错误") }
            XCTAssertEqual(c, 503)
        }
    }

    // ------------------------------------------------------------ 收信：大管家 → 手机，整条链
    func testRoundTripDeskToPhoneThroughFakeFirebase() async throws {
        let fake = FakeFirebase()
        let pair = TXPairing.generate()
        let (deskBox, _) = makeMailbox(fake, box: pair.box)
        let desk = try XCTUnwrap(MailClient(pairing: pair, role: "pc", http: NoHTTP()))
        let phone = try XCTUnwrap(MailClient(pairing: pair, role: "phone", http: NoHTTP()))
        let data = try JSONSerialization.data(withJSONObject: ["re": "req-0001", "ok": true, "commit": "abc1234"])
        let env = MailEnvelope(kind: .result, id: "req-0001", at: ISOTime.string(), data: data, files: ["img/a-12345678.jpg": Data([9, 8, 7])])
        try await deskBox.putLetter(mid: env.id, sealed: try desk.seal(env, to: "phone"), to: "phone")

        for array in [false, true] {
            var inbox = FBInbox()
            let (ev, d) = fbEvent("put", path: "/", data: fake.tree("to_phone", array: array))
            guard case .letters(let ls) = inbox.handle(event: ev, data: d) else { return XCTFail("没收到信") }
            XCTAssertEqual(ls.count, 1)
            XCTAssertEqual(ls[0].mid, "req-0001")
            let back = try phone.open(ls[0].sealed)
            XCTAssertEqual(back.id, "req-0001")
            XCTAssertEqual(back.kind, .result)
            XCTAssertEqual(back.files["img/a-12345678.jpg"], Data([9, 8, 7]))
            // 同一棵树再给一遍（重连以后第一个 put "/"）：不办两次
            XCTAssertEqual(inbox.handle(event: ev, data: d), .none)
            // 手机自己拆不开寄给电脑的（方向不对）
            XCTAssertThrowsError(try desk.open(ls[0].sealed))
        }
    }

    func testInboxWaitsForMetaAndAllPieces() throws {
        let sealed = Data((0..<10).map { UInt8($0) })
        let b64 = sealed.base64EncodedString()
        let half = b64.index(b64.startIndex, offsetBy: 8)
        let a = String(b64[..<half]), b = String(b64[half...])
        var inbox = FBInbox()
        // 第一个 put "/"：空的
        var (e, d) = fbEvent("put", path: "/", data: NSNull())
        XCTAssertEqual(inbox.handle(event: e, data: d), .none)
        (e, d) = fbEvent("put", path: "/mid-000001/p/0", data: a)
        XCTAssertEqual(inbox.handle(event: e, data: d), .none)
        (e, d) = fbEvent("put", path: "/mid-000001/p/1", data: b)
        XCTAssertEqual(inbox.handle(event: e, data: d), .none)  // 还没有 meta：不算到齐
        (e, d) = fbEvent("put", path: "/mid-000001/meta", data: ["at": 1_800_000_000_000, "n": 2, "size": 10])
        XCTAssertEqual(inbox.handle(event: e, data: d), .letters([FBLetter(mid: "mid-000001", sealed: sealed)]))
        // 删了以后又来一封同名的，是新的一封
        (e, d) = fbEvent("put", path: "/mid-000001", data: NSNull())
        XCTAssertEqual(inbox.handle(event: e, data: d), .none)
        (e, d) = fbEvent("put", path: "/mid-000001", data: ["p": [a, b], "meta": ["n": 2, "size": 10]])
        XCTAssertEqual(inbox.handle(event: e, data: d), .letters([FBLetter(mid: "mid-000001", sealed: sealed)]))
    }

    func testInboxRejectsWrongSizeOrMissingPiece() throws {
        let sealed = Data((0..<10).map { UInt8($0) })
        let b64 = sealed.base64EncodedString()
        var inbox = FBInbox()
        var (e, d) = fbEvent("put", path: "/mid-000002", data: ["p": [b64], "meta": ["n": 1, "size": 11]])
        XCTAssertEqual(inbox.handle(event: e, data: d), .none)  // 字节数对不上
        (e, d) = fbEvent("put", path: "/mid-000003", data: ["p": [b64], "meta": ["n": 2, "size": 10]])
        XCTAssertEqual(inbox.handle(event: e, data: d), .none)  // 少一片
    }

    func testInboxPatchAndReconnectEvents() throws {
        let sealed = Data([1, 2, 3, 4])
        let b64 = sealed.base64EncodedString()
        var inbox = FBInbox()
        let (e, d) = fbEvent("patch", path: "/mid-000004", data: ["p/0": b64, "meta": ["n": 1, "size": 4]])
        XCTAssertEqual(inbox.handle(event: e, data: d), .letters([FBLetter(mid: "mid-000004", sealed: sealed)]))
        XCTAssertEqual(inbox.handle(event: "keep-alive", data: "null"), .none)
        XCTAssertEqual(inbox.handle(event: "cancel", data: "null"), .reconnect)
        XCTAssertEqual(inbox.handle(event: "auth_revoked", data: "\"x\""), .reconnect)
        XCTAssertEqual(inbox.handle(event: "put", data: "不是 JSON"), .none)
    }

    func testSSELines() {
        var s = SSELines()
        XCTAssertNil(s.feed("event: keep-alive"))
        XCTAssertEqual(s.feed("data: null")?.event, "keep-alive")
        XCTAssertNil(s.feed("event: put"))
        let r = s.feed("data: {\"path\":\"/\",\"data\":null}")
        XCTAssertEqual(r?.event, "put")
        XCTAssertEqual(r?.data, "{\"path\":\"/\",\"data\":null}")
        XCTAssertNil(s.feed(": 注释行"))
    }

    // ------------------------------------------------------------ 什么时候换管子
    func testFailoverRules() {
        XCTAssertTrue(BackupRoute.shouldFailover(URLError(.notConnectedToInternet)))
        XCTAssertTrue(BackupRoute.shouldFailover(URLError(.timedOut)))
        XCTAssertTrue(BackupRoute.shouldFailover(MailError.http(500, "error code: 1101")))
        XCTAssertTrue(BackupRoute.shouldFailover(MailError.http(503, "")))
        XCTAssertTrue(BackupRoute.shouldFailover(MailError.http(429, "")))
        XCTAssertTrue(BackupRoute.shouldFailover(MailError.http(404, "")))
        XCTAssertFalse(BackupRoute.shouldFailover(MailError.http(413, "")))
        XCTAssertFalse(BackupRoute.shouldFailover(MailError.http(200, "")))
        XCTAssertFalse(BackupRoute.shouldFailover(MailError.tooBig(30_000_000)))
        XCTAssertFalse(BackupRoute.shouldFailover(MailError.badLetter("x")))
    }

    func testRouteSendFailureThenReturnAfterFiveMinutes() {
        var r = BackupRoute()
        var t = Date(timeIntervalSince1970: 1_800_000_000)
        r.socketUp(t)
        XCTAssertFalse(r.backup)
        r.sendFailed(t)
        XCTAssertTrue(r.backup)
        // Cloudflare 好了，但不到 5 分钟：还走备用
        t.addTimeInterval(299)
        XCTAssertFalse(r.tick(t))
        XCTAssertTrue(r.backup)
        // 中间又寄失败一次：重新数 5 分钟
        r.sendFailed(t)
        r.socketUp(t)
        t.addTimeInterval(299)
        r.tick(t)
        XCTAssertTrue(r.backup)
        t.addTimeInterval(2)
        XCTAssertTrue(r.tick(t))
        XCTAssertFalse(r.backup)
    }

    func testRouteSocketDownOverSixtySecondsOnlyWithNet() {
        var r = BackupRoute()
        var t = Date(timeIntervalSince1970: 1_800_000_000)
        r.socketDown(t)
        t.addTimeInterval(59)
        r.tick(t)
        XCTAssertFalse(r.backup)
        // 没网：不算 Cloudflare 的事
        t.addTimeInterval(10)
        r.tick(t, netOK: false)
        XCTAssertFalse(r.backup)
        XCTAssertTrue(r.tick(t, netOK: true))
        XCTAssertTrue(r.backup)
        // 断着的时候不回去；重连后好满 5 分钟才回去
        t.addTimeInterval(1000)
        r.tick(t)
        XCTAssertTrue(r.backup)
        r.socketUp(t)
        t.addTimeInterval(301)
        XCTAssertTrue(r.tick(t))
        XCTAssertFalse(r.backup)
    }

    func testSeenLettersOnceButDistinctContent() throws {
        func env(_ id: String, _ obj: [String: Any]) throws -> MailEnvelope {
            MailEnvelope(kind: .result, id: id, at: "x", data: try JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]), files: [:])
        }
        var s = SeenLetters()
        let first = SeenLetters.key(try env("req-0001", ["re": "req-0001", "stage": "first"]))
        let final = SeenLetters.key(try env("req-0001", ["re": "req-0001", "stage": "final"]))
        XCTAssertNotEqual(first, final)  // 点钞机 first / final 同一个 id，不能互相吞
        XCTAssertTrue(s.first(first))
        XCTAssertFalse(s.first(first))  // 两条路都来了：只办一次
        XCTAssertTrue(s.first(final))
        var small = SeenLetters()
        small.limit = 2
        XCTAssertTrue(small.first("a"))
        XCTAssertTrue(small.first("b"))
        XCTAssertTrue(small.first("c"))
        XCTAssertTrue(small.first("a"))  // 最老的挤掉了
    }
}
