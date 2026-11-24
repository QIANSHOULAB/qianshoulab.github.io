import XCTest
@testable import TieXie

// 工时榨汁机：十组输入，默认休息表和改过的休息表各跑一遍，网页（gongshi index.html v0.5.5，?lang=zh）出的字一个不差。
// 期望值是 2026-11-24 用 Playwright 在网页上填框、读屏幕上的字抄下来的。
final class GongShiTests: XCTestCase {
    // (开始框, 结束框, 次日结束, 大字, 下面那行)
    static let webDefault: [(String, String, Bool, String, String)] = [
        ("08:30", "13:21", false, "241", "4 小时 1 分 · 毛时长 291 分，扣 50 分"),
        ("0800", "1700", false, "480", "8 小时 · 毛时长 540 分，扣 60 分"),
        ("1000", "1010", false, "0", "0 分 · 毛时长 10 分，扣 10 分"),
        ("1130", "1215", false, "5", "5 分 · 毛时长 45 分，扣 40 分"),
        ("1755", "1840", false, "15", "15 分 · 毛时长 45 分，扣 30 分"),
        ("2000", "0900", true, "75", "1 小时 15 分 · 毛时长 780 分，扣 705 分"),
        ("0815", "2030", false, "645", "10 小时 45 分 · 毛时长 735 分，扣 90 分"),
        ("1400", "1000", false, "—", "结束比开始还早。第二天才收工的话："),
        ("1500", "1509", false, "0", "0 分 · 毛时长 9 分，扣 9 分"),
        ("1900", "0830", true, "105", "1 小时 45 分 · 毛时长 810 分，扣 705 分"),
    ]

    // 改过的：08:00 上班、21:00 下班，加一段 13:00–13:30「茶」，晚饭 17:30–18:30 跟 18:00–18:20 那段叠着（同一分钟只扣一次）
    static let custom = ShiftRules(on: 480, off: 1260, breaks: [BreakSpan(s: 600, e: 610, name: "休息"), BreakSpan(s: 690, e: 730, name: "午饭"), BreakSpan(s: 780, e: 810, name: "茶"), BreakSpan(s: 1050, e: 1110, name: "晚饭"), BreakSpan(s: 1080, e: 1100, name: "休息")])
    static let webCustom: [(String, String, Bool, String, String)] = [
        ("08:30", "13:21", false, "220", "3 小时 40 分 · 毛时长 291 分，扣 71 分"),
        ("0800", "1700", false, "460", "7 小时 40 分 · 毛时长 540 分，扣 80 分"),
        ("1000", "1010", false, "0", "0 分 · 毛时长 10 分，扣 10 分"),
        ("1130", "1215", false, "5", "5 分 · 毛时长 45 分，扣 40 分"),
        ("1755", "1840", false, "10", "10 分 · 毛时长 45 分，扣 35 分"),
        ("2000", "0900", true, "120", "2 小时 · 毛时长 780 分，扣 660 分"),
        ("0815", "2030", false, "595", "9 小时 55 分 · 毛时长 735 分，扣 140 分"),
        ("1400", "1000", false, "—", "结束比开始还早。第二天才收工的话："),
        ("1500", "1509", false, "9", "9 分 · 毛时长 9 分，扣 0 分"),
        ("1900", "0830", true, "150", "2 小时 30 分 · 毛时长 810 分，扣 660 分"),
    ]

    func testTenCasesDefaultRules() {
        for (s, e, n, big, line) in Self.webDefault {
            let o = GongShi.render(start: s, end: e, nextDay: n, rules: .defaults)
            XCTAssertEqual(o.big, big, "\(s)→\(e)")
            XCTAssertEqual(o.line, line, "\(s)→\(e)")
        }
    }

    func testTenCasesCustomRules() {
        XCTAssertTrue(GongShi.valid(Self.custom))
        for (s, e, n, big, line) in Self.webCustom {
            let o = GongShi.render(start: s, end: e, nextDay: n, rules: Self.custom)
            XCTAssertEqual(o.big, big, "\(s)→\(e)")
            XCTAssertEqual(o.line, line, "\(s)→\(e)")
        }
    }

    func testParseAndMask() {
        XCTAssertEqual(GongShi.parse("830", final: true), .minutes(510))
        XCTAssertEqual(GongShi.parse("8", final: false), .empty)
        XCTAssertEqual(GongShi.parse("8", final: true), .minutes(480))
        XCTAssertEqual(GongShi.parse("25:00", final: true), .bad)
        XCTAssertEqual(GongShi.parse("8：3", final: true), .bad)
        XCTAssertEqual(GongShi.parse("8：30", final: true), .minutes(510))
        XCTAssertEqual(GongShi.mask("0830"), "08:30")
        XCTAssertEqual(GongShi.mask("930"), "9:30")
        XCTAssertEqual(GongShi.mask("1"), "1")
    }

    func testOverlapCountsOnce() {
        // 两段完全叠着：只扣一次
        let r = ShiftRules(on: 495, off: 1230, breaks: [BreakSpan(s: 600, e: 610, name: "休息"), BreakSpan(s: 600, e: 610, name: "休息")])
        XCTAssertEqual(GongShi.compute(570, 660, days: 0, rules: r)?.net, 80)
    }

    func testDraftReadsLikeWeb() {
        let ok = GongShiDraft.read(on: "08:15", off: "20:30", rows: [("10:00", "10:10", ""), ("", "", "")])
        XCTAssertEqual(ok.rule?.breaks.count, 1)
        XCTAssertEqual(ok.rule?.breaks.first?.name, "休息")
        XCTAssertEqual(GongShiDraft.read(on: "08:15", off: "20:30", rows: [("10:10", "10:00", "")]).why, GongShiStrings.rowBackwards)
        XCTAssertEqual(GongShiDraft.read(on: "21:00", off: "20:30", rows: []).why, GongShiStrings.offBeforeOn)
    }
}
