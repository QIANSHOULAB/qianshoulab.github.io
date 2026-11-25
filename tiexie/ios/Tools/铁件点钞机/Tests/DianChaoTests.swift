import XCTest
import UIKit
@testable import TieXie

// 铁件点钞机：假大管家走一遍。信封、加密照接口（tiexie/ios/大管家接口.md + 一叶笺 v2），信箱是假的（存在内存里），
// 大管家那头照 121（pc-butler handheld/tiexie/count.py、service.py）回两封信：stage first、stage final。
// 走的路：出数、补点（第二眼柠檬绿圈）、手改、不算 / 也算上、90 秒超时、没配对、大管家不在、大管家说没数成。
@MainActor
final class DianChaoTests: XCTestCase {

    // ------------------------------------------------------------ 假信箱：PUT 存、GET 取、DELETE 删
    final class FakeRelay: MailHTTP, @unchecked Sendable {
        var letters: [Int: (to: String, mid: String, body: Data)] = [:]
        var seq = 0

        func send(_ req: URLRequest) async throws -> (Data, Int) {
            let url = req.url!
            let last = url.lastPathComponent
            switch req.httpMethod ?? "GET" {
            case "PUT":
                let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
                seq += 1
                letters[seq] = (q.first { $0.name == "to" }?.value ?? "", q.first { $0.name == "mid" }?.value ?? "", req.httpBody ?? Data())
                return (Data("{\"seq\":\(seq)}".utf8), 200)
            case "DELETE":
                letters[Int(last) ?? -1] = nil
                return (Data("{}".utf8), 200)
            default:
                guard let l = letters[Int(last) ?? -1] else { return (Data(), 404) }
                return (l.body, 200)
            }
        }

        func waiting(for to: String) -> [MailItem] {
            letters.keys.sorted().compactMap { k in
                let l = letters[k]!
                return l.to == to ? MailItem(seq: k, mid: l.mid, to: to, at: 0, size: l.body.count, data: nil) : nil
            }
        }
    }

    // ------------------------------------------------------------ 手机这头：跟 Butler 收发一样，只是信箱是假的
    final class FakePost: DianChaoPost {
        var dcPaired = true
        var dcOnline = true
        var dcSeen: Date?
        var dcApp = "0.2.0"
        let client: MailClient
        let relay: FakeRelay
        var waiters: [String: (Data) -> Void] = [:]

        init(pairing: TXPairing, relay: FakeRelay) {
            self.relay = relay
            client = MailClient(pairing: pairing, role: "phone", http: relay)!
        }

        func dcSend(id: String, data: [String: Any], files: [String: Data], onReply: @escaping (Data) -> Void) async throws {
            waiters[id] = onReply
            let d = try JSONSerialization.data(withJSONObject: data)
            _ = try await client.send(MailEnvelope(kind: .request, id: id, at: ISOTime.string(), data: d, files: files))
        }

        func dcForget(_ id: String) { waiters[id] = nil }

        /// 收信：跟 Butler.receive 一样按 re 交给等着的
        func pump() async throws {
            for it in relay.waiting(for: "phone") {
                let env = try await client.receive(it)
                if env.kind == .result, let re = Butler.replyTo(env.data), let w = waiters[re] { w(env.data) }
                try await client.ack(it.seq)
            }
        }
    }

    // ------------------------------------------------------------ 假大管家：拆信、核对、回两封
    struct FakeButler {
        let client: MailClient
        let relay: FakeRelay

        /// 收一封 tx-count：回 (请求 id, 照片)
        func takeLetter() async throws -> (String, Data)? {
            for it in relay.waiting(for: "pc") {
                let env = try await client.receive(it)
                try await client.ack(it.seq)
                let o = try XCTUnwrap(JSONSerialization.jsonObject(with: env.data) as? [String: Any])
                XCTAssertEqual(env.kind, .request)
                XCTAssertEqual(o["ask"] as? String, "tx-count")
                XCTAssertEqual(o["v"] as? Int, 1)
                let id = try XCTUnwrap(o["id"] as? String)
                XCTAssertEqual(env.id, id)
                let names = try XCTUnwrap(o["images"] as? [String])
                XCTAssertEqual(names, ["点钞/\(id.prefix(8)).jpg"])
                let photo = try XCTUnwrap(env.files[names[0]], "信里要带照片")
                return (id, photo)
            }
            return nil
        }

        func reply(_ body: [String: Any], mid: String) async throws {
            let d = try JSONSerialization.data(withJSONObject: body)
            _ = try await client.send(MailEnvelope(kind: .result, id: mid, at: ISOTime.string(), data: d, files: [:]))
        }

        /// 照 121 service.count_job：第一封 id = <请求>-1、re = 请求；第二封 id = re = 请求
        func first(_ rid: String, trays: [[String: Any]], total: Int) async throws {
            try await reply(["v": 1, "id": "\(rid)-1", "re": rid, "ok": true, "host": "电脑", "at": ISOTime.string(), "stage": "first",
                             "secs": 12.3, "total": total, "trays": trays, "part": "aluminium plates"], mid: "\(rid)-1")
        }

        func final(_ rid: String, trays: [[String: Any]], total: Int) async throws {
            try await reply(["v": 1, "id": rid, "re": rid, "ok": true, "host": "电脑", "at": ISOTime.string(), "stage": "final",
                             "secs": 30.1, "audit_secs": 17.8, "total": total, "trays": trays], mid: rid)
        }

        /// 145 照 service.Partials：id = <请求>-p<n>、for = 请求、不带 re
        func partial(_ rid: String, n: Int, trays: [[String: Any]], total: Int) async throws {
            try await reply(["v": 1, "id": "\(rid)-p\(n)", "for": rid, "ok": true, "host": "电脑", "at": ISOTime.string(), "stage": "partial",
                             "secs": 3.1, "total": total, "trays": trays], mid: "\(rid)-p\(n)")
        }

        func fail(_ rid: String, why: String) async throws {
            try await reply(["v": 1, "id": rid, "re": rid, "ok": false, "host": "电脑", "at": ISOTime.string(), "stage": "final", "why": why], mid: rid)
        }
    }

    var relay: FakeRelay!
    var post: FakePost!
    var butler: FakeButler!

    override func setUp() async throws {
        let p = TXPairing.generate()
        relay = FakeRelay()
        post = FakePost(pairing: p, relay: relay)
        butler = FakeButler(client: MailClient(pairing: p, role: "pc", http: relay)!, relay: relay)
    }

    static func photo(_ w: Int, _ h: Int) -> UIImage {
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: w, height: h), format: f).image { c in
            UIColor.darkGray.setFill()
            c.fill(CGRect(x: 0, y: 0, width: w, height: h))
            UIColor.lightGray.setFill()
            for i in 0..<10 { c.fill(CGRect(x: 200 + i * 300, y: 400, width: 200, height: 800)) }
        }
    }

    /// 等异步的寄信落进信箱
    func waitLetter(to: String) async throws {
        for _ in 0..<200 {
            if !relay.waiting(for: to).isEmpty { return }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("信箱里一直没有寄给 \(to) 的信")
    }

    // 一盒 10 件（主盒，完整）+ 一盒露半截的
    static let firstTrays: [[String: Any]] = [
        ["box": [100, 100, 900, 600], "complete": true, "main": true, "counted": true, "count": 9,
         "pts": [[200, 200], [200, 300], [200, 400], [400, 200], [400, 300], [400, 400], [600, 200], [600, 300], [600, 400]]],
        ["box": [100, 650, 1000, 1000], "complete": false, "main": false, "counted": false, "count": 2, "pts": [[300, 800], [500, 800]]],
    ]
    static let finalTrays: [[String: Any]] = [
        ["box": [100, 100, 900, 600], "complete": true, "main": true, "counted": true, "count": 10,
         "pts": [[200, 200], [200, 300], [200, 400], [400, 200], [400, 300], [400, 400], [600, 200], [600, 300], [600, 400], [800, 300]],
         "audit": ["added": [[800, 300]], "removed": []]],
        ["box": [100, 650, 1000, 1000], "complete": false, "main": false, "counted": false, "count": 2, "pts": [[300, 800], [500, 800]], "audit": NSNull()],
    ]

    // ------------------------------------------------------------ 出数、补点
    func testCountFirstThenFinal() async throws {
        let m = DianChaoModel()
        m.post = post
        m.take(Self.photo(4032, 3024))
        // 缩到大管家看图的尺寸
        XCTAssertEqual(m.photo?.size, CGSize(width: 2212, height: 1659))
        XCTAssertEqual(m.run?.phase, .waiting)
        try await waitLetter(to: "pc")
        let got = try await butler.takeLetter()
        let (rid, jpeg) = try XCTUnwrap(got)
        XCTAssertEqual(rid, m.run?.id)
        XCTAssertEqual(Array(jpeg.prefix(2)), [0xFF, 0xD8], "照片是 JPEG")
        XCTAssertEqual(UIImage(data: jpeg)?.size, CGSize(width: 2212, height: 1659))

        try await butler.first(rid, trays: Self.firstTrays, total: 9)
        try await post.pump()
        XCTAssertEqual(m.run?.phase, .first)
        XCTAssertEqual(m.run?.total, 9)
        XCTAssertEqual(m.run?.statusLine, DianChaoStrings.auditing)
        XCTAssertNotNil(m.countFrom)

        try await butler.final(rid, trays: Self.finalTrays, total: 10)
        try await post.pump()
        let r = try XCTUnwrap(m.run)
        XCTAssertEqual(r.phase, .done)
        XCTAssertEqual(r.total, 10)
        XCTAssertEqual(r.added, 1)
        XCTAssertEqual(r.trays[0].pts.filter(\.aud).count, 1, "第二眼补的那颗是柠檬绿圈")
        XCTAssertEqual(r.trays[0].pts.last?.y, 800)
        XCTAssertTrue(r.statusLine.hasPrefix("复查揪出 1 个漏网的"), r.statusLine)
        XCTAssertNil(post.waiters[rid], "两封都到了就不等了")
        XCTAssertTrue(relay.letters.isEmpty, "信都 ack 了")
        // 存图：照片下面接一块面板
        let poster = DCDraw.poster(photo: try XCTUnwrap(m.photo), run: r)
        XCTAssertEqual(poster.size.width, 2212)
        XCTAssertEqual(Double(poster.size.height), 1659 + (2212 * 0.3).rounded())
    }

    // ------------------------------------------------------------ 手改
    func testManualEdits() throws {
        var r = DCRun(id: "abcdef12-x", sentAt: Date())
        let L = try XCTUnwrap(DianChao.parse(try JSONSerialization.data(withJSONObject: ["ok": true, "stage": "final", "trays": Self.finalTrays])))
        r.receive(L)
        XCTAssertEqual(r.total, 10)
        // 点圆点删掉
        r.tap(y: 400, x: 300, hitX: 30, aspect: 0.75)
        XCTAssertEqual(r.total, 9)
        XCTAssertEqual(r.editedText, "手改 −1")
        // 点漏掉的件补一个（落在主盒里）
        r.tap(y: 700, x: 500, hitX: 30, aspect: 0.75)
        XCTAssertEqual(r.total, 10)
        XCTAssertEqual(r.editedText, "手改 +1 −1")
        XCTAssertEqual(r.trays[0].pts.last?.man, true)
        // 手补的再点掉：+1 退回去
        r.tap(y: 700, x: 500, hitX: 30, aspect: 0.75)
        XCTAssertEqual(r.editedText, "手改 −1")
        // 露半截那盒「也算上」
        r.toggle(1)
        XCTAssertEqual(r.total, 11)
        r.toggle(0)
        XCTAssertEqual(r.total, 2)
        // 点钞中不许改
        var w = DCRun(id: "abcdef12-y", sentAt: Date())
        w.tap(y: 100, x: 100, hitX: 30, aspect: 1)
        XCTAssertEqual(w.total, 0)
    }

    // ------------------------------------------------------------ 超时
    func testTimeouts() {
        let t0 = Date()
        var r = DCRun(id: "abcdef12-z", sentAt: t0)
        XCTAssertFalse(r.tick(now: t0.addingTimeInterval(89)))
        XCTAssertEqual(r.phase, .waiting)
        XCTAssertTrue(r.tick(now: t0.addingTimeInterval(90)))
        XCTAssertEqual(r.phase, .jam("大管家没回，再拍一次？"))
        XCTAssertEqual(r.statusLine, "大管家没回，再拍一次？")
        // 第一封到了、第二眼迟迟不来：照第一遍的数
        var s = DCRun(id: "abcdef12-w", sentAt: t0)
        s.receive(DianChao.parse(try! JSONSerialization.data(withJSONObject: ["ok": true, "stage": "first", "trays": Self.firstTrays]))!)
        XCTAssertEqual(s.phase, .first)
        XCTAssertFalse(s.tick(now: Date().addingTimeInterval(DianChao.finalTimeout - 5)))
        XCTAssertTrue(s.tick(now: Date().addingTimeInterval(DianChao.finalTimeout + 1)))
        XCTAssertEqual(s.phase, .done)
        XCTAssertEqual(s.total, 9)
        // 超时以后迟到的信不认
        XCTAssertFalse(r.receive(DianChao.parse(try! JSONSerialization.data(withJSONObject: ["ok": true, "stage": "final", "trays": Self.finalTrays]))!))
    }

    // ------------------------------------------------------------ 没配对、大管家不在：直说，不寄、不排队
    func testNotPairedAndAway() async throws {
        let m = DianChaoModel()
        m.post = post
        post.dcPaired = false
        m.take(Self.photo(800, 600))
        XCTAssertEqual(m.refused, "还没跟大管家配对：设置 › 粘贴配对码")
        XCTAssertNil(m.run)
        post.dcPaired = true
        post.dcOnline = false
        post.dcSeen = Calendar.current.date(bySettingHour: 7, minute: 5, second: 0, of: Date())
        m.send()
        XCTAssertEqual(m.refused, "大管家不在（上次在线 07:05），这盘先自己数。")
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertTrue(relay.letters.isEmpty, "没寄")
    }

    // ------------------------------------------------------------ 大管家说没数成
    func testButlerSaysNo() async throws {
        let m = DianChaoModel()
        m.post = post
        m.take(Self.photo(1000, 800))
        try await waitLetter(to: "pc")
        let got = try await butler.takeLetter()
        let (rid, _) = try XCTUnwrap(got)
        try await butler.fail(rid, why: "大脑 90 秒没数完")
        try await post.pump()
        XCTAssertEqual(m.run?.phase, .jam("大脑 90 秒没数完"))
        XCTAssertNil(post.waiters[rid])
    }

    // ------------------------------------------------------------ 小算法
    func testResizedSizeLikeLuru() {
        // pc-butler handheld/luru.py resized_size 算的
        XCTAssertTrue(DianChao.resizedSize(4032, 3024) == (2212, 1659))
        XCTAssertTrue(DianChao.resizedSize(3024, 4032) == (1659, 2212))
        XCTAssertTrue(DianChao.resizedSize(4000, 1800) == (2576, 1159))
        XCTAssertTrue(DianChao.resizedSize(2000, 1500) == (2000, 1500))
        XCTAssertTrue(DianChao.resizedSize(5712, 4284) == (2212, 1659))
    }

    func testRequestShapeAndRouting() throws {
        let id = "9F1C2D4E-0B7A-4C61-9E52-2A6F1D3B8C70"
        let o = DianChao.request(id: id, app: "0.2.0", at: "2026-11-24T19:00:00+08:00")
        XCTAssertEqual(o["ask"] as? String, "tx-count")
        XCTAssertEqual(o["images"] as? [String], ["点钞/9F1C2D4E.jpg"])
        let first = try JSONSerialization.data(withJSONObject: ["id": "\(id)-1", "re": id, "stage": "first"])
        XCTAssertEqual(Butler.replyTo(first), id, "第一封的 id 带 -1，按 re 交回去")
        // 145：partial 带 for、不带 re。新版按 for 交回去；旧版（只看 re / id）拿到的是 <id>-p1，没有工具在等，放过去
        let part: [String: Any] = ["id": "\(id)-p1", "for": id, "stage": "partial"]
        XCTAssertEqual(Butler.replyTo(try JSONSerialization.data(withJSONObject: part)), id)
        XCTAssertEqual((part["re"] as? String) ?? (part["id"] as? String), "\(id)-p1", "旧版手机的找法找不到点钞机")
    }

    // ------------------------------------------------------------ 145 边数边出点
    static func trays(_ n: Int) -> [[String: Any]] {
        let all: [[Int]] = (0..<10).map { [200 + ($0 / 3) * 200, 200 + ($0 % 3) * 100] }
        return [["box": [100, 100, 900, 600], "complete": true, "main": true, "counted": true, "count": n, "pts": Array(all.prefix(n))]]
    }

    func testPartialInOrderThenFirstFinal() async throws {
        let m = DianChaoModel()
        m.post = post
        m.take(Self.photo(4032, 3024))
        try await waitLetter(to: "pc")
        let got = try await butler.takeLetter()
        let (rid, _) = try XCTUnwrap(got)
        try await butler.partial(rid, n: 1, trays: Self.trays(3), total: 3)
        try await post.pump()
        XCTAssertEqual(m.run?.phase, .waiting, "partial 不算出数")
        XCTAssertEqual(m.run?.liveTotal, 3)
        XCTAssertEqual(m.run?.total, 3)
        XCTAssertNil(m.countFrom)
        try await butler.partial(rid, n: 2, trays: Self.trays(7), total: 7)
        try await post.pump()
        XCTAssertEqual(m.run?.liveTotal, 7)
        XCTAssertEqual(m.run?.liveFrom, 3, "新来的从 3 往上亮")
        let a = try XCTUnwrap(m.run?.liveAt)
        XCTAssertEqual(m.run?.liveShown(at: a), 3)
        XCTAssertEqual(m.run?.liveShown(at: a.addingTimeInterval(1)), 7)
        try await butler.first(rid, trays: Self.firstTrays, total: 9)
        try await post.pump()
        XCTAssertEqual(m.run?.phase, .first)
        XCTAssertEqual(m.run?.total, 9)
        XCTAssertNil(m.countFrom, "点已经一个个亮过了，第一封不再从 0 跑")
        try await butler.partial(rid, n: 3, trays: Self.trays(8), total: 8)
        try await post.pump()
        XCTAssertEqual(m.run?.total, 9, "第一封以后来的 partial 不要")
        try await butler.final(rid, trays: Self.finalTrays, total: 10)
        try await post.pump()
        XCTAssertEqual(m.run?.phase, .done)
        XCTAssertEqual(m.run?.total, 10, "最后的数只认 final")
    }

    func testPartialOutOfOrderAndRepeated() throws {
        var r = DCRun(id: "abcdef12-x", sentAt: Date())
        func L(_ n: Int, stage: String = "partial", ok: Bool = true) -> DianChao.Letter {
            var l = DianChao.Letter(stage: stage, ok: ok, why: "", total: n, trays: [])
            var pts: [DCPoint] = []
            for i in 0..<n {
                let y = Double(200 + (i / 3) * 200)
                let x = Double(200 + (i % 3) * 100)
                pts.append(DCPoint(y: y, x: x))
            }
            l.trays = [DCTray(box: [100, 100, 900, 600], complete: true, main: true, on: true, pts: pts)]
            return l
        }
        XCTAssertTrue(r.receive(L(5)))
        XCTAssertFalse(r.receive(L(5)), "重复来的不要")
        XCTAssertFalse(r.receive(L(2)), "晚到的旧的不要")
        XCTAssertEqual(r.total, 5)
        XCTAssertTrue(r.receive(L(8)))
        XCTAssertFalse(r.receive(L(9, ok: false)), "坏的 partial 不卡钞")
        XCTAssertEqual(r.phase, .waiting)
        XCTAssertEqual(r.total, 8)
        XCTAssertTrue(r.receive(L(6, stage: "final")), "final 比 partial 少也认 final")
        XCTAssertEqual(r.phase, .done)
        XCTAssertEqual(r.total, 6)
        XCTAssertFalse(r.receive(L(9)))
        XCTAssertEqual(r.total, 6)
        // 只有 partial、第一封一直不来：照样 90 秒卡钞
        var r2 = DCRun(id: "abcdef12-y", sentAt: Date(timeIntervalSinceNow: -91))
        XCTAssertTrue(r2.receive(L(4)))
        XCTAssertTrue(r2.tick(now: Date()))
        XCTAssertEqual(r2.phase, .jam(DianChaoStrings.noReply))
    }

    /// 旧版手机（0.3.2 的 Butler：按 re / id 找等着的）收到 partial：没人在等，不交给点钞机，后面的 first / final 照旧
    func testOldPhoneIgnoresPartial() async throws {
        let m = DianChaoModel()
        m.post = post
        m.take(Self.photo(4032, 3024))
        try await waitLetter(to: "pc")
        let got = try await butler.takeLetter()
        let (rid, _) = try XCTUnwrap(got)
        try await butler.partial(rid, n: 1, trays: Self.trays(3), total: 3)
        for it in relay.waiting(for: "phone") {           // 旧的找法
            let env = try await post.client.receive(it)
            let o = try XCTUnwrap(JSONSerialization.jsonObject(with: env.data) as? [String: Any])
            let key = (o["re"] as? String) ?? (o["id"] as? String)
            XCTAssertNotEqual(key, rid)
            if let k = key, let w = post.waiters[k] { w(env.data) }
            try await post.client.ack(it.seq)
        }
        XCTAssertEqual(m.run?.phase, .waiting)
        XCTAssertEqual(m.run?.liveTotal, 0, "旧版没交给点钞机")
        try await butler.first(rid, trays: Self.firstTrays, total: 9)
        try await post.pump()
        XCTAssertEqual(m.run?.phase, .first)
        XCTAssertEqual(m.run?.total, 9)
    }
}
