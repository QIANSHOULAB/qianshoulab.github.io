import XCTest
import UIKit
@testable import TieXie

// 英寸照妖镜：拿网页版（gongshi inch/index.html 0.5.5）当标准答案。
// Fixtures/ 是 122 用 PIL 画的 8 张假检查表（歪、倒、横、透视、模糊、阴影、毫米表、没表头），网页版在 Playwright 里读过：
//   <名>.json 里有网页版认出的字框（items）、两种模式下每行每格的换算、对账（expect）、表上印的真值（truth）。
// 1) 同一批字框进 Swift 版的读表、对账、换算，出的每一格跟网页版一字不差；
// 2) 认数、换算的 40 个边角例子跟网页版一字不差（numbers.json）；
// 3) 整条链：苹果 Vision 认这 8 张照片，换算出的每一格跟网页版比。
final class YingCunTests: XCTestCase {
    static let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures")
    static let names = ["s1_flat", "s2_tilt7", "s3_upside", "s4_sideways", "s5_persp_blur", "s6_persp_tilt_shadow", "s7_mm", "s8_loose"]

    struct Fixture: Decodable {
        var name: String
        var kind: String
        var webAngle: Double
        var items: [[Item]]
        var expect: [String: Expect]

        enum Item: Decodable {
            case num(Double), str(String)
            init(from d: Decoder) throws {
                let c = try d.singleValueContainer()
                if let v = try? c.decode(Double.self) { self = .num(v) } else { self = .str(try c.decode(String.self)) }
            }
            var num: Double { if case .num(let v) = self { return v }; return 0 }
            var str: String { if case .str(let s) = self { return s }; return "" }
        }

        struct Row: Decodable {
            var conv: [String: String]
            var flag: [String]
            var ok: [String]
            var sugg: [String: String]
            var checked: Bool
        }

        /// 有表：每行；没表：[字, 换算, 黄不黄]
        enum Expect: Decodable {
            case rows([Row]), loose([[Item]])
            init(from d: Decoder) throws {
                let c = try d.singleValueContainer()
                if let r = try? c.decode([Row].self) { self = .rows(r) } else { self = .loose(try c.decode([[LooseCell]].self).map { $0.map(\.item) }) }
            }
        }

        struct LooseCell: Decodable {
            var item: Item
            init(from d: Decoder) throws {
                let c = try d.singleValueContainer()
                if let b = try? c.decode(Bool.self) { item = .num(b ? 1 : 0) } else { item = try c.decode(Item.self) }
            }
        }

        func makeItems() -> [YCItem] {
            items.map { a in YCItem(x0: a[0].num, y0: a[1].num, x1: a[2].num, y1: a[3].num, text: a[4].str, conf: a[5].num) }
        }
    }

    static func load(_ n: String) throws -> Fixture {
        try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: dir.appendingPathComponent(n + ".json")))
    }

    /// 网页版 read() 末尾那段：有表头且读出尺寸/公差 → table；有数 → loose
    static func kind(_ items: [YCItem]) -> (String, YCTable?) {
        if let A = YingCun.analyze(items), A.rows.contains(where: { r in ["DIM", "LSL", "USL"].contains { r[$0]?.num != nil } }) { return ("table", A) }
        return (items.contains { $0.num != nil } ? "loose" : "none", nil)
    }

    // ------------------------------------------------------------ 1) 同一批字框
    func testLogicMatchesWebOnWebBoxes() throws {
        var cells = 0
        for n in Self.names {
            let fx = try Self.load(n)
            for mode in YCMode.allCases {
                let items = fx.makeItems()
                let (kind, A) = Self.kind(items)
                XCTAssertEqual(kind, fx.kind, n)
                guard let exp = fx.expect[mode.rawValue] else { XCTFail("\(n) 没有 \(mode.rawValue)"); continue }
                switch exp {
                case .rows(let rows):
                    guard let A else { XCTFail("\(n) 没读出表"); continue }
                    XCTAssertEqual(A.rows.count, rows.count, "\(n) 行数")
                    let chk = YingCun.checkRows(A.rows)
                    for (i, w) in rows.enumerated() where i < A.rows.count {
                        var conv: [String: String] = [:]
                        for k in YingCun.keys6 { if let p = A.rows[i][k]?.num { conv[k] = YingCun.convert(p, mode) } }
                        XCTAssertEqual(conv, w.conv, "\(n) \(mode) 第 \(i + 1) 行换算")
                        XCTAssertEqual(chk[i].flag.sorted(), w.flag, "\(n) \(mode) 第 \(i + 1) 行黄格")
                        XCTAssertEqual(chk[i].ok.sorted(), w.ok, "\(n) \(mode) 第 \(i + 1) 行对上账")
                        XCTAssertEqual(chk[i].sugg, w.sugg, "\(n) \(mode) 第 \(i + 1) 行倒推")
                        XCTAssertEqual(chk[i].checked, w.checked, "\(n) \(mode) 第 \(i + 1) 行")
                        cells += conv.count
                    }
                case .loose(let list):
                    let got = items.filter { $0.num != nil }.map { [$0.text, YingCun.convert($0.num!, mode), ($0.conf < 0.9) ? "1" : "0"] }
                    let want = list.map { [$0[0].str, $0[1].str, $0[2].num != 0 ? "1" : "0"] }
                    XCTAssertEqual(got, want, "\(n) \(mode)")
                    cells += got.count
                }
            }
        }
        XCTAssertGreaterThan(cells, 600)
    }

    // ------------------------------------------------------------ 2) 认数、换算
    func testParseConvertMatchesWeb() throws {
        let raw = try Data(contentsOf: Self.dir.appendingPathComponent("numbers.json"))
        let cases = try XCTUnwrap(JSONSerialization.jsonObject(with: raw) as? [[Any]])
        XCTAssertEqual(cases.count, 40)
        for c in cases {
            let text = c[0] as! String
            let p = YingCun.parseNum(text)
            if c[1] is NSNull {
                XCTAssertNil(p, "「\(text)」网页版不认")
                continue
            }
            let q = try XCTUnwrap(p, "「\(text)」")
            XCTAssertEqual(q.s, c[1] as? String, "「\(text)」")
            XCTAssertEqual(YingCun.convert(q, .in2mm), c[2] as? String, "「\(text)」英寸 → 毫米")
            XCTAssertEqual(YingCun.convert(q, .mm2in), c[3] as? String, "「\(text)」毫米 → 英寸")
        }
    }

    func testCheckRowsSuggestion() {
        // 上差认错了一位：下面那条对上账，给 USL、UCL 倒推的值
        func it(_ s: String, _ x: Double) -> YCItem { YCItem(x0: x, y0: 0, x1: x + 10, y1: 10, text: s, conf: 0.99) }
        var r = YCMap<YCItem>()
        r["DIM"] = it("1.0860", 0); r["LSL"] = it("-0.0050", 20); r["USL"] = it("+0.0080", 40)
        r["LCL"] = it("1.0810", 60); r["UCL"] = it("1.0910", 80)
        let c = YingCun.checkRows([r])[0]
        XCTAssertEqual(c.flag, ["USL", "UCL"])
        XCTAssertEqual(c.sugg["USL"], "0.0050")
        XCTAssertEqual(c.sugg["UCL"], "1.0940")
        // 人改过的就是真理
        r["USL"]!.edited = true
        XCTAssertEqual(YingCun.checkRows([r])[0].flag, ["UCL"])
    }

    // ------------------------------------------------------------ 3) 苹果 Vision 整条链
    func testVisionMatchesWeb() async throws {
        var lines: [String] = []
        var good = 0, total = 0
        for n in Self.names {
            let fx = try Self.load(n)
            guard let img = UIImage(contentsOfFile: Self.dir.appendingPathComponent(n + ".jpg").path) else { XCTFail("\(n).jpg 打不开"); continue }
            let job: YCJob
            do {
                job = try await YingCunVision.read(img)
            } catch {
                lines.append("\(n): Vision 出错 \(error)")
                continue
            }
            let th = YingCun.median(job.items.map(\.h))
            var note = "\(n): \(job.kind.rawValue) 转\(Int(job.angle.rounded()))°(网页\(Int(fx.webAngle.rounded()))) 字框\(job.items.count) th\(Int(th))"
            note += " [" + job.notes.joined(separator: "；") + "]"
            guard case .rows(let rows)? = fx.expect["in2mm"] else {
                // 没表头那张：网页版换了哪些数
                if case .loose(let list)? = fx.expect["in2mm"] {
                    let want = Set(list.map { $0[1].str })
                    let got = Set(job.items.compactMap { $0.num.map { YingCun.convert($0, .in2mm) } })
                    let hit = want.intersection(got).count
                    good += hit; total += want.count
                    note += " 对上\(hit)/\(want.count)"
                    if hit < want.count { note += " 少\(want.subtracting(got).sorted()) 多\(got.subtracting(want).sorted())" }
                }
                XCTAssertNotNil(YingCunRender.draw(job, .in2mm), n)
                lines.append(note)
                continue
            }
            let A = job.table
            if A == nil {
                // 排查：表头找没找到、字框长啥样
                let hd = YingCun.headerOf(job.items, th)
                note += " 表头" + (hd.map { h in h.hs.keys.joined(separator: ",") } ?? "没找到")
                let cand = job.items.compactMap { i in YingCun.hdrKey(i.text).map { "\($0)=\(i.text)@\(Int(i.cx)),\(Int(i.cy))" } }
                note += " 候选[" + cand.prefix(12).joined(separator: " ") + "]"
                let sample = job.items.sorted { $0.cy < $1.cy }.prefix(40).map { "\($0.text)@\(Int($0.cx)),\(Int($0.cy)),\(Int($0.h))" }
                note += " 字框[" + sample.joined(separator: " ") + "]"
            }
            var hit = 0, cnt = 0
            var miss: [String] = []
            for (i, w) in rows.enumerated() {
                for (k, v) in w.conv.sorted(by: { $0.key < $1.key }) {
                    // 余量是 0 的那格网页版不落红字（SHOW 跳过），不算
                    if k == "STOCK" && v == "0.000" { continue }
                    cnt += 1
                    let got = (A != nil && i < A!.rows.count) ? A!.rows[i][k]?.num.map { YingCun.convert($0, .in2mm) } : nil
                    if got == v { hit += 1 } else if miss.count < 4 { miss.append("r\(i + 1)\(k):\(got ?? "无")≠\(v)") }
                }
            }
            good += hit; total += cnt
            note += " 行\(A?.rows.count ?? 0)/\(rows.count) 对上\(hit)/\(cnt)"
            if !miss.isEmpty { note += " " + miss.joined(separator: " ") }
            if let d = YingCunRender.draw(job, .in2mm) {
                XCTAssertGreaterThan(d.labels.count, 0, n)
                note += " 图\(Int(d.image.size.width))x\(Int(d.image.size.height))"
            }
            lines.append(note)
        }
        let summary = "Vision 对上 \(good)/\(total) 格｜" + lines.joined(separator: "｜")
        print("122-VISION " + summary)
        // 每一格都要跟网页版一样
        XCTAssertEqual(good, total, summary)
    }
}
