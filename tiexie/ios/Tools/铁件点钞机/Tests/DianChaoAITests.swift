import XCTest
import UIKit
@testable import TieXie

// 168 点钞机先用 Claude API：
// - 搬过来的 count.py 规矩，跟大管家数出一样的数：夹具 Fixtures/count-cases.json 是 pc-butler 的 count.py 原样跑出来的
//   （C:/Claude/170/kit/gen168.py，189 的 solo_more 是 C:/Claude/189/kit/gen189.py）：挑盒子、第二眼、两遍对点、裁大的框、
//   只让 Opus 数（189）、两个大脑一起数（一样 / 不一样）；
// - 189 不抢先（默认）：只发一封 first（Opus）再一封 final，第二眼改了数出「复查改了」；模型表没写 race 就是不抢先；
// - 走 API 的几条：成了（不寄大管家）、额度用完回大管家（30 分钟不再问）、超时回大管家、race 开着时 Opus 跟 Sonnet 不一样走第二眼。
@MainActor
final class DianChaoAITests: XCTestCase {

    // ------------------------------------------------------------ 夹具
    static let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures")
    static let cases: [String: Any] = {
        let d = try! Data(contentsOf: dir.appendingPathComponent("count-cases.json"))
        return try! JSONSerialization.jsonObject(with: d) as! [String: Any]
    }()

    func c(_ name: String) -> [String: Any] { Self.cases[name] as! [String: Any] }

    func num(_ v: Any?) -> Double { DCCount.num(v) ?? .nan }

    func tray(_ d: [String: Any]) -> DCCount.Tray {
        DCCount.Tray(box: (d["box"] as! [Any]).map { Int(num($0)) }, complete: d["complete"] as! Bool, reason: d["reason"] as? String ?? "",
                     pts: (d["pts"] as! [[String: Any]]).map { DCCount.P(y: num($0["y"]), x: num($0["x"])) },
                     area: Int(num(d["area"])), on: d["on"] as? Bool ?? false, main: d["main"] as? Bool ?? false)
    }

    func pts(_ a: Any?) -> [[Double]] { ((a as? [Any]) ?? []).map { (($0 as? [Any]) ?? []).map { num($0) } } }

    func assertTrays(_ got: [DCCount.Tray], _ want: Any?, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
        let w = (want as! [[String: Any]]).map(tray)
        XCTAssertEqual(got.count, w.count, "\(what)：盒子数", file: file, line: line)
        for (g, x) in zip(got, w) {
            XCTAssertEqual(g.box, x.box, "\(what)：box", file: file, line: line)
            XCTAssertEqual(g.complete, x.complete, "\(what)：complete", file: file, line: line)
            XCTAssertEqual(g.on, x.on, "\(what)：on", file: file, line: line)
            XCTAssertEqual(g.main, x.main, "\(what)：main", file: file, line: line)
            XCTAssertEqual(g.pts, x.pts, "\(what)：点", file: file, line: line)
        }
    }

    // ------------------------------------------------------------ 照搬的规矩，跟 count.py 一样
    func testPickTraysSameAsButler() {
        for name in ["pick_whole", "pick_none_whole", "pick_clamp"] {
            let k = c(name)
            assertTrays(DCCount.pickTrays(k["answer"]), k["trays"], name)
        }
    }

    func testAuditSameAsButler() {
        for name in ["audit", "audit_confused"] {
            let k = c(name)
            var ts = (k["trays"] as! [[String: Any]]).map(tray)
            let cr = (k["crop"] as! [Any]).map { Int(num($0)) }
            let got = DCCount.applyAudit(&ts, k["answer"], crop: (cr[0], cr[1], cr[2], cr[3]), aspect: num(k["aspect"]))
            let want = k["got"] as! [String: [String: Any]]
            XCTAssertEqual(Set(got.keys.map(String.init)), Set(want.keys), name)
            for (i, a) in got {
                XCTAssertEqual(a.added, pts(want[String(i)]?["added"]), "\(name)：补")
                XCTAssertEqual(a.removed, pts(want[String(i)]?["removed"]), "\(name)：去")
            }
            assertTrays(ts, k["after"], "\(name) 之后")
        }
    }

    func testPairAndDiffSameAsButler() {
        let k = c("pair")
        let a = (k["a"] as! [[String: Any]]).map { DCCount.P(y: num($0["y"]), x: num($0["x"])) }
        let b = (k["b"] as! [[String: Any]]).map { DCCount.P(y: num($0["y"]), x: num($0["x"])) }
        let r = DCCount.pairUp(a, b, aspect: num(k["aspect"]))
        XCTAssertEqual(r.pairs.map { $0.map(Double.init) }, pts(k["pairs"]))
        XCTAssertEqual(r.aLeft.map(Double.init), pts([k["a_left"] as! [Any]]).first ?? [])
        XCTAssertEqual(r.bLeft.map(Double.init), pts([k["b_left"] as! [Any]]).first ?? [])
        XCTAssertEqual(r.near, num(k["near"]), accuracy: 1e-9)
        for name in ["diff_same", "diff_more", "diff_less"] {
            let d = c(name)
            func ts(_ v: Any?) -> [DCCount.Tray] {
                (v as! [[String: Any]]).map { t in
                    DCCount.Tray(box: (t["box"] as! [Any]).map { Int(num($0)) }, complete: true, reason: "",
                                 pts: (t["pts"] as! [[String: Any]]).map { DCCount.P(y: num($0["y"]), x: num($0["x"])) }, area: 0,
                                 on: t["on"] as! Bool, main: t["main"] as! Bool)
                }
            }
            let got = DCCount.diffCounts(ts(d["first"]), ts(d["final"]), aspect: num(d["aspect"]))
            let res = d["res"] as! [Any]
            XCTAssertEqual(got.same, res[0] as? Bool, name)
            let want = res[1] as! [String: [String: Any]]
            for (i, a) in got.diff {
                XCTAssertEqual(a.added, pts(want[String(i)]?["added"]), "\(name)：补")
                XCTAssertEqual(a.removed, pts(want[String(i)]?["removed"]), "\(name)：去")
            }
        }
    }

    func testCropBoxSameAsButler() {
        let k = c("crop")
        let b = DCCount.cropBox((k["trays"] as! [[String: Any]]).map(tray))!
        XCTAssertEqual([b.y0, b.x0, b.y1, b.x1].map(Double.init), (k["box"] as! [Any]).map { num($0) })
        // 一盘很小的（框正好 60 宽）：count.py 照样裁（不到 60 才不裁），夹具里 box 不是 null
        let small = DCCount.cropBox((c("crop_small")["trays"] as! [[String: Any]]).map(tray))
        XCTAssertEqual(small == nil, c("crop_small")["box"] is NSNull, "小盘子裁不裁跟大管家一样")
        XCTAssertNil(DCCount.cropBox([DCCount.Tray(box: [500, 500, 510, 510], complete: true, reason: "", pts: [DCCount.P(y: 505, x: 505)],
                                                   area: 100, on: true, main: true)]), "不到 60 不裁")
        let im = DianChaoTests.photo(2000, 1500)
        let made = DCCount.cropForAudit(im, (k["trays"] as! [[String: Any]]).map(tray))
        XCTAssertNotNil(made)
        XCTAssertNotNil(UIImage(data: made!.0))
    }

    func testExtractJSON() {
        XCTAssertEqual((DCCount.extractJSON("```json\n{\"a\": 1}\n```") as? [String: Any])?["a"] as? Int, 1)
        XCTAssertEqual((DCCount.extractJSON("好的：{\"trays\": []} 数完了") as? [String: Any])?["trays"] as? [Int], [])
        XCTAssertNil(DCCount.extractJSON("数不了"))
    }

    // ------------------------------------------------------------ 假的 /ai
    final class FakeAI: DCAIAsk {
        var ready = true
        var needsCid = false
        var adopted: String?
        var restedN = 0
        var answers: [String: Any] = [:]
        var audit: Any = ["missed": [Any](), "extra": [Any]()] as [String: Any]
        var fail: [String: DCAIError] = [:]
        var delay: [String: UInt64] = ["opus": 300_000_000]
        var asked: [(model: String, words: String)] = []
        var race = false

        func models() async throws -> DCPlan {
            DCPlan(fast: DCModel(model: "sonnet", effort: "medium"), sure: DCModel(model: "opus", effort: "medium"),
                   audit: DCModel(model: "opus-audit", effort: "medium"), race: race)
        }

        func ask(_ m: DCModel, system: String, words: String, image: Data, timeout: TimeInterval) async throws -> Any {
            asked.append((m.model, words))
            XCTAssertEqual(system, words == DCPrompt.auditWords ? DCPrompt.audit : DCPrompt.count)
            if let d = delay[m.model] { try? await Task.sleep(nanoseconds: d) }
            if let e = fail[m.model] { throw e }
            if m.model == "opus-audit" { return audit }
            return answers[m.model] as Any
        }

        func rested() { restedN += 1 }
        func adopt(cid: String) { adopted = cid }
    }

    func demoPhoto() throws -> (UIImage, Data) {
        let img = try XCTUnwrap(UIImage(contentsOfFile: Self.dir.appendingPathComponent("demo-tray.jpg").path))
        return try XCTUnwrap(DianChaoModel.shrink(img))
    }

    func until(_ ok: @escaping () -> Bool, _ secs: Double = 6) async -> Bool {
        let end = Date().addingTimeInterval(secs)
        while Date() < end {
            if ok() { return true }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return ok()
    }

    /// 两个一起数，跟 count.py 的 Counter 走出一样的两封
    func raceSameAsButler(_ name: String) async throws {
        let k = c(name)
        let (photo, jpeg) = try demoPhoto()
        XCTAssertEqual([Double(photo.cgImage!.width), Double(photo.cgImage!.height)], (k["size"] as! [Any]).map { num($0) }, "缩图跟大管家一样大")
        let ai = FakeAI()
        ai.race = true
        ai.answers = ["sonnet": k["son"]!, "opus": k["opus"]!]
        ai.audit = k["audit"]!
        var first: [String: Any]?
        let final = try await DCAICounter(ai: ai).count(photo: photo, jpeg: jpeg) { first = $0 }
        let wf = k["first"] as! [String: Any], wl = k["final"] as! [String: Any]
        XCTAssertEqual(first?["total"] as? Int, Int(num(wf["total"])), "\(name)：first 件数")
        XCTAssertEqual(pts((first?["trays"] as? [[String: Any]])?.first?["pts"]), pts((wf["trays"] as! [[String: Any]]).first?["pts"]))
        XCTAssertEqual(final["total"] as? Int, Int(num(wl["total"])), "\(name)：final 件数")
        XCTAssertEqual(final["same"] as? Bool, wl["same"] as? Bool, "\(name)：same")
        let gt = final["trays"] as! [[String: Any]], wt = wl["trays"] as! [[String: Any]]
        XCTAssertEqual(gt.count, wt.count)
        for (g, w) in zip(gt, wt) {
            XCTAssertEqual(pts(g["pts"]), pts(w["pts"]), "\(name)：final 的点")
            let ga = g["audit"] as? [String: Any], wa = w["audit"] as? [String: Any]
            XCTAssertEqual(ga == nil, wa == nil, "\(name)：audit 有没有")
            XCTAssertEqual(pts(ga?["added"]), pts(wa?["added"]), "\(name)：补")
            XCTAssertEqual(pts(ga?["removed"]), pts(wa?["removed"]), "\(name)：去")
        }
        let r = final["race"] as! [String: Any], wr = wl["race"] as! [String: Any]
        XCTAssertEqual(r["first"] as? String, wr["first"] as? String)
        XCTAssertEqual(r["agree"] as? Bool, wr["agree"] as? Bool)
    }

    func testRaceAgreeSameAsButler() async throws { try await raceSameAsButler("race_same") }
    func testRaceDisagreeSameAsButler() async throws { try await raceSameAsButler("race_more") }

    // ------------------------------------------------------------ 189 不抢先
    /// 只问 Opus：一封 first（10 件）、再一封 final（第二眼补 1 件 → 11），跟 count.py 一样；Sonnet 一次都不问
    func testSoloOneFirstThenFinalSameAsButler() async throws {
        let k = c("solo_more")
        let (photo, jpeg) = try demoPhoto()
        let ai = FakeAI()
        ai.answers = ["opus": k["opus"]!]
        ai.audit = k["audit"]!
        var firsts: [[String: Any]] = []
        let final = try await DCAICounter(ai: ai).count(photo: photo, jpeg: jpeg) { firsts.append($0) }
        XCTAssertEqual(ai.asked.map { $0.model }, ["opus", "opus-audit"], "只问 Opus 两遍：数一遍、第二眼一遍")
        XCTAssertEqual(firsts.count, 1, "first 只发一封")
        let wf = k["first"] as! [String: Any], wl = k["final"] as! [String: Any]
        XCTAssertEqual(firsts.first?["stage"] as? String, "first")
        XCTAssertEqual(firsts.first?["total"] as? Int, Int(num(wf["total"])))
        XCTAssertEqual(firsts.first?["part"] as? String, wf["part"] as? String)
        XCTAssertEqual(pts((firsts.first?["trays"] as? [[String: Any]])?.first?["pts"]), pts((wf["trays"] as! [[String: Any]]).first?["pts"]))
        XCTAssertEqual(final["stage"] as? String, "final")
        XCTAssertEqual(final["total"] as? Int, Int(num(wl["total"])))
        XCTAssertNil(final["same"])
        XCTAssertNil(final["race"])
        let g = (final["trays"] as! [[String: Any]])[0], w = (wl["trays"] as! [[String: Any]])[0]
        XCTAssertEqual(pts(g["pts"]), pts(w["pts"]))
        XCTAssertEqual(pts((g["audit"] as? [String: Any])?["added"]), pts((w["audit"] as? [String: Any])?["added"]))
        XCTAssertEqual(pts((g["audit"] as? [String: Any])?["removed"]), pts((w["audit"] as? [String: Any])?["removed"]))
    }

    /// 点钞机上走一遍：Opus 数完先出数（Claude 数的、复查还在后头），假的第二眼改了数 → 「复查改了：10 → 11」
    func testSoloSecondLookShowsFixed() async throws {
        let k = c("solo_more")
        let ai = FakeAI()
        ai.answers = ["opus": k["opus"]!]
        ai.audit = k["audit"]!
        ai.delay = ["opus-audit": 1_000_000_000]
        let vm = model(ai)
        vm.take(try demoPhoto().0)
        let counted = await until { vm.run?.phase == .done }
        XCTAssertTrue(counted)
        XCTAssertEqual(vm.run?.total, 10, "第一个出来的数就是 Opus 的")
        XCTAssertEqual(vm.run?.reviewing, true, "第二眼还在后头")
        XCTAssertNil(vm.run?.fix)
        let done = await until { vm.run?.reviewing == false }
        XCTAssertTrue(done)
        XCTAssertEqual(vm.run?.total, 11)
        XCTAssertEqual(vm.run?.fix?.line, DianChaoStrings.fixed(10, 11, add: 1, del: 0))
        XCTAssertEqual(vm.run?.byAI, true)
        XCTAssertFalse(ai.asked.contains { $0.model == "sonnet" })
        XCTAssertTrue(relay.waiting(for: "pc").isEmpty)
    }

    /// 中转站模型表：没写 race、写 false 都不抢先；只有 true 才抢先
    func testPlanNoRaceUnlessSaid() {
        let old: [String: Any] = ["fast": ["model": "claude-sonnet-5-5", "effort": "medium"],
                                  "sure": ["model": "claude-opus-5-5", "effort": "medium"]]
        XCTAssertFalse(DCAI.plan(old).race, "读不到开关也照不抢先走")
        XCTAssertFalse(DCAI.plan([:]).race)
        XCTAssertEqual(DCAI.plan([:]).sure, DCModel(model: "claude-opus-5-5", effort: "medium"))
        XCTAssertEqual(DCAI.plan([:]).audit.model, "claude-opus-5-5")
        func parsed(_ s: String) -> [String: Any] { (DCCount.extractJSON(s) as? [String: Any]) ?? [:] }
        XCTAssertFalse(DCAI.plan(parsed(#"{"race": false}"#)).race)
        XCTAssertFalse(DCAI.plan(parsed(#"{"race": "true"}"#)).race)
        XCTAssertTrue(DCAI.plan(parsed(#"{"race": true}"#)).race)
    }

    // ------------------------------------------------------------ 点钞机走 API
    var relay: DianChaoTests.FakeRelay!
    var post: DianChaoTests.FakePost!

    override func setUp() async throws {
        relay = DianChaoTests.FakeRelay()
        post = DianChaoTests.FakePost(pairing: TXPairing.generate(), relay: relay)
    }

    func model(_ ai: FakeAI) -> DianChaoModel {
        let vm = DianChaoModel()
        vm.post = post
        vm.ai = ai
        return vm
    }

    /// API 成了：两封都出、写「Claude 数的」、不寄大管家；第二眼没挑出毛病就什么都不动
    func testAPICountsWithoutButler() async throws {
        let ai = FakeAI()
        ai.answers = ["opus": c("race_same")["opus"]!]
        let vm = model(ai)
        vm.take(try demoPhoto().0)
        let done = await until { vm.run?.phase == .done && vm.run?.reviewing == false }
        XCTAssertTrue(done, "该数完")
        XCTAssertEqual(vm.run?.total, 9)
        XCTAssertEqual(vm.run?.byAI, true)
        XCTAssertNil(vm.run?.fix, "第二眼没补没去：复查什么都不动")
        XCTAssertTrue(relay.waiting(for: "pc").isEmpty, "API 数成了不该寄大管家")
        XCTAssertEqual(ai.asked.map { $0.model }, ["opus", "opus-audit"])
    }

    /// 额度用完：这一盘寄大管家，记着 30 分钟不问
    func testQuotaGoesToButler() async throws {
        let ai = FakeAI()
        ai.fail = ["sonnet": .quota, "opus": .quota]
        let vm = model(ai)
        vm.take(try demoPhoto().0)
        let sent = await until { !self.relay.waiting(for: "pc").isEmpty }
        XCTAssertTrue(sent, "额度用完该寄大管家")
        XCTAssertEqual(ai.restedN, 1)
        XCTAssertEqual(vm.run?.byAI, false)
        XCTAssertEqual(vm.run?.phase, .waiting)
    }

    /// 超时（别的错）：这一盘寄大管家，不记歇着
    func testTimeoutGoesToButler() async throws {
        let ai = FakeAI()
        ai.fail = ["sonnet": .other("Claude 0 超时"), "opus": .other("Claude 0 超时")]
        let vm = model(ai)
        vm.take(try demoPhoto().0)
        let sent = await until { !self.relay.waiting(for: "pc").isEmpty }
        XCTAssertTrue(sent, "超时该寄大管家")
        XCTAssertEqual(ai.restedN, 0)
    }

    /// race 开着：Opus 跟 Sonnet 不一样，Opus 的过第二眼，复查改了（9 → 11）
    func testDisagreeGoesToSecondLook() async throws {
        let ai = FakeAI()
        ai.race = true
        let k = c("race_more")
        ai.answers = ["sonnet": k["son"]!, "opus": k["opus"]!]
        ai.audit = k["audit"]!
        let vm = model(ai)
        vm.take(try demoPhoto().0)
        let done = await until { vm.run?.phase == .done && vm.run?.reviewing == false }
        XCTAssertTrue(done)
        XCTAssertTrue(ai.asked.contains { $0.model == "opus-audit" && $0.words == DCPrompt.auditWords }, "该看第二眼")
        XCTAssertEqual(vm.run?.total, 11)
        XCTAssertNotNil(vm.run?.fix, "复查改了该写出来")
        XCTAssertTrue(relay.waiting(for: "pc").isEmpty)
    }

    /// 没有 cid：问大管家要一个（tx-ai），回来存下
    func testAsksButlerForCid() async throws {
        let ai = FakeAI()
        ai.ready = false
        ai.needsCid = true
        let vm = model(ai)
        vm.fetchCid()
        let asked = await until { !self.relay.waiting(for: "pc").isEmpty }
        XCTAssertTrue(asked)
        XCTAssertEqual(DCCid.parse(Data(#"{"ok":true,"cid":"AbCdEfGhIjKlMnOpQrStUv12"}"#.utf8)), "AbCdEfGhIjKlMnOpQrStUv12")
        XCTAssertNil(DCCid.parse(Data(#"{"ok":false,"why":"关了"}"#.utf8)))
        XCTAssertNil(DCCid.parse(Data(#"{"ok":true,"cid":"短"}"#.utf8)))
    }

    /// 请求正文：提示当 system、照片跟着那句话、模型档位照表
    func testMessagesBody() throws {
        let d = DCAI.body(DCModel(model: "claude-opus-5-5", effort: "medium"), system: DCPrompt.count, words: DCPrompt.countWords, image: Data([1, 2, 3]))
        let o = try XCTUnwrap(JSONSerialization.jsonObject(with: d) as? [String: Any])
        XCTAssertEqual(o["model"] as? String, "claude-opus-5-5")
        XCTAssertEqual((o["output_config"] as? [String: Any])?["effort"] as? String, "medium")
        XCTAssertEqual(((o["system"] as? [[String: Any]])?.first)?["text"] as? String, DCPrompt.count)
        let content = (((o["messages"] as? [[String: Any]])?.first)?["content"] as? [[String: Any]]) ?? []
        XCTAssertEqual(content.map { $0["type"] as? String }, ["text", "image", "text"])
        XCTAssertEqual(content.last?["text"] as? String, "只输出 JSON。")
        XCTAssertTrue(DCPrompt.count.hasSuffix("没有托盘就输出 {\"part\": \"\", \"trays\": []}。\n"))
    }
}
