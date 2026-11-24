import XCTest
@testable import TieXie

// 排版：VM10、VM12 两本的正文，app 拆出来的结构跟网站 typeset() 一样。
// Fixtures/typeset.json 是 2026-11-24 用 Playwright 打开网站、读 .doc 下面的 DOM 抄的。
final class TypesetTests: XCTestCase {
    struct Fixture: Decodable {
        struct B: Decodable { var t: String; var s: String?; var lead: String?; var text: String?; var lines: [CodeLine]? }
        var body: String
        var blocks: [B]
    }

    func web(_ id: String) throws -> (String, [Block]) {
        let u = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "typeset", withExtension: "json"))
        let all = try JSONDecoder().decode([String: Fixture].self, from: Data(contentsOf: u))
        let f = try XCTUnwrap(all[id])
        let blocks: [Block] = f.blocks.map { b in
            switch b.t {
            case "heading": return .heading(b.s ?? "")
            case "gap": return .gap
            case "code": return .code(b.lines ?? [])
            default: return .para(lead: b.lead, text: b.text ?? "")
            }
        }
        return (f.body, blocks)
    }

    func testVM10SameAsWebsite() throws {
        let (body, want) = try web("vm10")
        XCTAssertEqual(Typeset.blocks(body), want)
    }

    func testVM12SameAsWebsite() throws {
        let (body, want) = try web("vm12")
        XCTAssertEqual(Typeset.blocks(body), want)
    }

    func testRules() {
        XCTAssertEqual(Typeset.blocks("G65 P9738 ;（这是注释）"), [.code([CodeLine(code: "G65 P9738 ;", note: "这是注释")])])
        XCTAssertEqual(Typeset.blocks("【三戒】"), [.heading("【三戒】")])
        XCTAssertEqual(Typeset.blocks("第一式·泰山压顶"), [.heading("第一式·泰山压顶")])
        XCTAssertEqual(Typeset.blocks("一戒：别乱来"), [.para(lead: "一戒：", text: "别乱来")])
        XCTAssertEqual(Typeset.blocks("甲\n\n\n乙"), [.para(lead: nil, text: "甲"), .gap, .para(lead: nil, text: "乙")])
    }
}
