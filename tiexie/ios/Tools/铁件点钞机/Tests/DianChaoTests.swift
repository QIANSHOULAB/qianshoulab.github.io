import XCTest
import UIKit
@testable import TieXie

// 铁件点钞机：假大管家走一遍。信封、加密照接口（tiexie/ios/大管家接口.md + 一叶笺 v2），信箱是假的（存在内存里），
// 大管家那头照 121（pc-butler handheld/tiexie/count.py、service.py）回两封信：stage first、stage final。
// 走的路：出数、补点（第二眼柠檬绿圈）、手改、不算 / 也算上、90 秒超时、没配对、大管家不在、大管家说没数成。
// 150：第一封到了就是「完成」；复查一样就什么都不动，多一件、少一件才改、叮叮、写「复查改了」；复查没回来就用第一遍的数。
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
        XCTAssertEqual(m.run?.phase, .done, "150：第一遍数完就算完成")
        XCTAssertEqual(m.run?.reviewing, true)
        XCTAssertEqual(m.run?.total, 9)
        XCTAssertEqual(m.run?.statusLine, DianChaoStrings.fixHint, "界面上不写「复查中」")
        XCTAssertEqual(m.busy, false, "重数、快门马上能点")
        XCTAssertNotNil(m.countFrom)
        XCTAssertNotNil(post.waiters[rid], "复查还要等")

        try await butler.final(rid, trays: Self.finalTrays, total: 10)
        try await post.pump()
        let r = try XCTUnwrap(m.run)
        XCTAssertEqual(r.phase, .done)
        XCTAssertEqual(r.total, 10)
        XCTAssertEqual(r.added, 1)
        XCTAssertEqual(r.trays[0].pts.filter(\.aud).count, 1, "第二眼补的那颗是柠檬绿圈")
        XCTAssertEqual(r.trays[0].pts.last?.y, 800)
        XCTAssertTrue(r.statusLine.hasPrefix("复查揪出 1 个漏网的"), r.statusLine)
        XCTAssertEqual(r.reviewing, false)
        XCTAssertEqual(r.fix?.line, "复查改了：9 → 10")
        XCTAssertNil(post.waiters[rid], "两封都到了就不等了")
        XCTAssertTrue(relay.letters.isEmpty, "信都 ack 了")
        // 复查回来时数码管还在跑：先把头一声叮补上，再叮叮
        try await waitChime(m, 2)
        XCTAssertEqual(m.chime?.kind, .fixed)
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
        // 第一封到了、第二眼迟迟不来：照第一遍的数，不提示
        var s = DCRun(id: "abcdef12-w", sentAt: t0)
        s.receive(DianChao.parse(try! JSONSerialization.data(withJSONObject: ["ok": true, "stage": "first", "trays": Self.firstTrays]))!)
        XCTAssertEqual(s.phase, .done)
        XCTAssertTrue(s.reviewing)
        XCTAssertFalse(s.tick(now: Date().addingTimeInterval(DianChao.finalTimeout - 5)))
        XCTAssertTrue(s.tick(now: Date().addingTimeInterval(DianChao.finalTimeout + 1)))
        XCTAssertEqual(s.phase, .done)
        XCTAssertFalse(s.reviewing)
        XCTAssertTrue(s.settled)
        XCTAssertEqual(s.total, 9)
        XCTAssertNil(s.fix)
        XCTAssertEqual(s.statusLine, DianChaoStrings.fixHint)
        XCTAssertFalse(s.receive(Self.letter("final", Self.moreTrays)), "不等了以后迟到的复查不认")
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
        XCTAssertEqual(m.run?.phase, .done)
        XCTAssertEqual(m.run?.total, 9)
        XCTAssertNotNil(m.countFrom, "150：数码管跑一下、叮一下挪到第一封到的时候")
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
        XCTAssertEqual(m.run?.phase, .done)
        XCTAssertEqual(m.run?.total, 9)
    }

    // ------------------------------------------------------------ 150 第一遍数完就算完成
    /// 第一遍那两盒，复查回来的几种样子
    static func checked(_ pts: [[Int]], added: [[Int]], removed: [[Int]]) -> [[String: Any]] {
        let main: [String: Any] = ["box": [100, 100, 900, 600], "complete": true, "main": true, "counted": true, "count": pts.count,
                                   "pts": pts, "audit": ["added": added, "removed": removed]]
        let cut: [String: Any] = ["box": [100, 650, 1000, 1000], "complete": false, "main": false, "counted": false, "count": 2,
                                  "pts": [[300, 800], [500, 800]], "audit": NSNull()]
        return [main, cut]
    }
    static let nine: [[Int]] = [[200, 200], [200, 300], [200, 400], [400, 200], [400, 300], [400, 400], [600, 200], [600, 300], [600, 400]]
    static let sameTrays = checked(nine, added: [], removed: [])
    static let moreTrays = checked(nine + [[800, 300]], added: [[800, 300]], removed: [])
    static let lessTrays = checked(Array(nine.dropFirst()), added: [], removed: [[200, 200]])
    static let swapTrays = checked(Array(nine.dropFirst()) + [[800, 300]], added: [[800, 300]], removed: [[200, 200]])

    static func letter(_ stage: String, _ trays: [[String: Any]], ok: Bool = true) -> DianChao.Letter {
        let o: [String: Any] = ["ok": ok, "stage": stage, "trays": trays]
        let d = try! JSONSerialization.data(withJSONObject: o)
        return DianChao.parse(d)!
    }

    /// 等响到第 n 下（最多 5 秒）
    func waitChime(_ m: DianChaoModel, _ n: Int) async throws {
        for _ in 0..<500 {
            if (m.chime?.n ?? 0) >= n { return }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("一直没响到第 \(n) 下，现在 \(String(describing: m.chime))")
    }

    /// 拍一张、寄到、第一封（9 件）到了、头一声叮响过了
    func firstArrived() async throws -> (DianChaoModel, String) {
        let m = DianChaoModel()
        m.post = post
        m.take(Self.photo(4032, 3024))
        try await waitLetter(to: "pc")
        let got = try await butler.takeLetter()
        let (rid, _) = try XCTUnwrap(got)
        try await butler.first(rid, trays: Self.firstTrays, total: 9)
        try await post.pump()
        XCTAssertNil(m.chime, "数码管跑到了才叮")
        try await waitChime(m, 1)
        XCTAssertEqual(m.chime?.kind, .done)
        return (m, rid)
    }

    func testFinalSameChangesNothing() async throws {
        // 复查看过、一处没改；复查没看成（audit 是 null）：都一样
        let noAudit: [[String: Any]] = Self.firstTrays.map { (t: [String: Any]) -> [String: Any] in
            var u = t
            u["audit"] = NSNull()
            return u
        }
        for trays in [Self.sameTrays, noAudit] {
            let (m, rid) = try await firstArrived()
            let before = try XCTUnwrap(m.run)
            let from = m.countFrom
            try await butler.final(rid, trays: trays, total: 9)
            try await post.pump()
            try await Task.sleep(nanoseconds: 900_000_000)
            XCTAssertEqual(m.run?.phase, .done)
            XCTAssertEqual(m.run?.reviewing, false)
            XCTAssertEqual(m.run?.trays, before.trays, "点一颗不动")
            XCTAssertEqual(m.run?.total, 9)
            XCTAssertNil(m.run?.fix, "不写、不闪")
            XCTAssertEqual(m.run?.statusLine, before.statusLine)
            XCTAssertEqual(m.countFrom, from, "数码管不重跑")
            XCTAssertEqual(m.chime?.n, 1, "不叮")
            XCTAssertNil(post.waiters[rid])
        }
    }

    func testFinalOneMore() async throws {
        let (m, rid) = try await firstArrived()
        try await butler.final(rid, trays: Self.moreTrays, total: 10)
        try await post.pump()
        let r = try XCTUnwrap(m.run)
        XCTAssertEqual(r.total, 10)
        XCTAssertEqual(r.fix?.before, 9)
        XCTAssertEqual(r.fix?.after, 10)
        XCTAssertEqual(r.fix?.line, "复查改了：9 → 10")
        XCTAssertEqual(r.fix?.added, [DCMark(tray: 0, y: 800, x: 300)])
        XCTAssertEqual(r.fix?.removed, [])
        XCTAssertEqual(r.trays[0].pts.filter(\.aud).count, 1)
        XCTAssertTrue(r.statusLine.hasPrefix("复查揪出 1 个漏网的"), r.statusLine)
        XCTAssertEqual(m.countFrom, .distantPast, "数直接换过去")
        XCTAssertEqual(m.chime, DCChime(n: 2, kind: .fixed), "叮叮")
        XCTAssertNil(post.waiters[rid])
    }

    func testFinalOneLess() async throws {
        let (m, rid) = try await firstArrived()
        try await butler.final(rid, trays: Self.lessTrays, total: 8)
        try await post.pump()
        let r = try XCTUnwrap(m.run)
        XCTAssertEqual(r.total, 8)
        XCTAssertEqual(r.fix?.line, "复查改了：9 → 8")
        XCTAssertEqual(r.fix?.added, [])
        XCTAssertEqual(r.fix?.removed, [DCMark(tray: 0, y: 200, x: 200)])
        XCTAssertTrue(r.statusLine.hasPrefix("删了 1 个点错的"), r.statusLine)
        XCTAssertEqual(m.chime, DCChime(n: 2, kind: .fixed))
        // 改完照样能手改，那一行留着
        m.tap(y: 200, x: 200, hitX: 30, aspect: 0.75)
        XCTAssertEqual(m.run?.total, 9)
        XCTAssertEqual(m.run?.fix?.line, "复查改了：9 → 8")
    }

    func testFinalSameCountOtherDots() {
        var r = DCRun(id: "abcdef12-x", sentAt: Date())
        r.receive(Self.letter("first", Self.firstTrays))
        XCTAssertTrue(r.receive(Self.letter("final", Self.swapTrays)))
        XCTAssertEqual(r.total, 9)
        XCTAssertEqual(r.fix?.line, "复查改了：9 → 9（补 1 个、去 1 个）")
        XCTAssertEqual(r.fix?.added, [DCMark(tray: 0, y: 800, x: 300)])
        XCTAssertEqual(r.fix?.removed, [DCMark(tray: 0, y: 200, x: 200)])
    }

    /// 复查没回来（出错、额度）：就用第一遍的数，不卡钞、不提示、不响
    func testReviewFailsQuietly() async throws {
        let (m, rid) = try await firstArrived()
        let before = try XCTUnwrap(m.run)
        try await butler.fail(rid, why: "额度用完了")
        try await post.pump()
        try await Task.sleep(nanoseconds: 900_000_000)
        XCTAssertEqual(m.run?.phase, .done)
        XCTAssertEqual(m.run?.reviewing, false)
        XCTAssertEqual(m.run?.trays, before.trays)
        XCTAssertNil(m.run?.fix)
        XCTAssertEqual(m.run?.statusLine, before.statusLine)
        XCTAssertEqual(m.chime?.n, 1)
        XCTAssertNil(post.waiters[rid])
    }

    func testRecountWhileReviewing() async throws {
        let (m, rid) = try await firstArrived()
        m.send()
        XCTAssertEqual(m.run?.phase, .waiting)
        XCTAssertNotEqual(m.run?.id, rid)
        XCTAssertNil(post.waiters[rid], "上一盘的复查不等了")
        try await butler.final(rid, trays: Self.moreTrays, total: 10)
        try await post.pump()
        XCTAssertEqual(m.run?.phase, .waiting)
        XCTAssertNil(m.run?.fix)
        XCTAssertEqual(m.chime?.n, 1)
        m.leave()
    }

    /// 复查回来之前已经手改过、点过「也算上」：都留着，复查只搬它改的那几处
    func testEditsBeforeReviewStay() {
        var r = DCRun(id: "abcdef12-x", sentAt: Date())
        r.receive(Self.letter("first", Self.firstTrays))
        r.tap(y: 400, x: 300, hitX: 30, aspect: 0.75)
        r.toggle(1)
        XCTAssertEqual(r.total, 10)
        r.receive(Self.letter("final", Self.moreTrays))
        XCTAssertEqual(r.total, 11)
        XCTAssertEqual(r.fix?.line, "复查改了：10 → 11")
        XCTAssertEqual(r.editedText, "手改 −1")
        XCTAssertTrue(r.trays[1].on)
        XCTAssertFalse(r.trays[0].pts.contains { $0.y == 400 && $0.x == 300 }, "手删的不长回来")
    }

    /// 复查要补 / 要删的，手上已经改过了：看得见的没变，不提示
    func testReviewAgreesWithHand() {
        var r = DCRun(id: "abcdef12-x", sentAt: Date())
        r.receive(Self.letter("first", Self.firstTrays))
        r.tap(y: 805, x: 310, hitX: 30, aspect: 0.75)
        XCTAssertEqual(r.total, 10)
        r.receive(Self.letter("final", Self.moreTrays))
        XCTAssertEqual(r.total, 10, "同一件不补两颗")
        XCTAssertNil(r.fix)
        var s = DCRun(id: "abcdef12-y", sentAt: Date())
        s.receive(Self.letter("first", Self.firstTrays))
        s.tap(y: 200, x: 200, hitX: 30, aspect: 0.75)
        s.receive(Self.letter("final", Self.lessTrays))
        XCTAssertEqual(s.total, 8)
        XCTAssertNil(s.fix)
    }

    /// 那盒点了「不算」：复查改的看不见，不提示；再「也算上」就是复查改过的
    func testReviewInExcludedTray() {
        var r = DCRun(id: "abcdef12-x", sentAt: Date())
        r.receive(Self.letter("first", Self.firstTrays))
        r.toggle(0)
        r.receive(Self.letter("final", Self.moreTrays))
        XCTAssertNil(r.fix)
        XCTAssertEqual(r.total, 0)
        r.toggle(0)
        XCTAssertEqual(r.total, 10)
    }

    func testFlashAndSounds() {
        XCTAssertEqual(DianChao.flash(-100), 1, "截图定格")
        XCTAssertEqual(DianChao.flash(0), 1)
        XCTAssertEqual(DianChao.flash(0.45), 0.15)
        XCTAssertEqual(DianChao.flash(0.65), 1)
        XCTAssertEqual(DianChao.flash(DianChao.flashDur), 0)
        XCTAssertNotNil(DCSound.url(DCSound.ding), "叮在包里")
        XCTAssertNotNil(DCSound.url(DCSound.dingDing), "叮叮在包里")
    }

    /// 截图那两张摆得对不对
    func testDemoStages() {
        let a = DianChaoModel()
        a.showDemo(Self.photo(1200, 900), stage: "first")
        XCTAssertEqual(a.run?.phase, .done)
        XCTAssertEqual(a.run?.total, 9)
        XCTAssertNil(a.run?.fix)
        let b = DianChaoModel()
        b.showDemo(Self.photo(1200, 900), stage: "fixed")
        XCTAssertEqual(b.run?.total, 10)
        XCTAssertEqual(b.run?.fix?.line, "复查改了：9 → 10")
        XCTAssertEqual(b.run?.fix?.added.count, 1)
    }
}
