import XCTest
@testable import TieXie

// 角度算距离：十组输入，网页（gongshi tp/index.html v0.5.5，?lang=zh）出的字一个不差。
// 期望值是 2026-11-24 用 Playwright 在网页上填框、读屏幕上的字抄下来的。
final class JiaoDuTests: XCTestCase {
    // (半径框, 角度框, 大字, 下面那行, 1° ≈ …)
    static let web: [(String, String, String, String, String)] = [
        ("16", "0.4175", "0.117", "R16 上偏 0.4175° · 半径没偏的话，TP 约 0.233", "1° ≈ 0.2793 mm"),
        ("16", "-1.3762", "0.384", "R16 上偏 1.3762° · 半径没偏的话，TP 约 0.769", "1° ≈ 0.2793 mm"),
        ("25.4", "0.5", "0.222", "R25.4 上偏 0.5° · 半径没偏的话，TP 约 0.443", "1° ≈ 0.4433 mm"),
        ("100", "1", "1.745", "R100 上偏 1° · 半径没偏的话，TP 约 3.491", "1° ≈ 1.7453 mm"),
        ("8", "0.0125", "0.002", "R8 上偏 0.0125° · 半径没偏的话，TP 约 0.003", "1° ≈ 0.1396 mm"),
        ("50", "180", "100.000", "R50 上偏 180° · 半径没偏的话，TP 约 200.000", "1° ≈ 0.8727 mm"),
        ("3.175", "2.25", "0.125", "R3.175 上偏 2.25° · 半径没偏的话，TP 约 0.249", "1° ≈ 0.0554 mm"),
        ("120", "-0.0833", "0.174", "R120 上偏 0.0833° · 半径没偏的话，TP 约 0.349", "1° ≈ 2.0944 mm"),
        ("16,5", "0.3", "0.086", "R16.5 上偏 0.3° · 半径没偏的话，TP 约 0.173", "1° ≈ 0.2880 mm"),
        ("0.5", "45", "0.383", "R0.5 上偏 45° · 半径没偏的话，TP 约 0.765", "1° ≈ 0.0087 mm"),
    ]

    func testTenCasesMatchWeb() {
        for (r, a, big, line, per) in Self.web {
            let o = JiaoDu.render(r: r, a: a)
            XCTAssertEqual(o.big, big, "R=\(r) a=\(a)")
            XCTAssertEqual(o.line, line, "R=\(r) a=\(a)")
            XCTAssertEqual(o.perDeg, per, "R=\(r) a=\(a)")
        }
    }

    func testBadInputs() {
        XCTAssertEqual(JiaoDu.render(r: "", a: "").line, JiaoDuStrings.need)
        XCTAssertEqual(JiaoDu.render(r: "-3", a: "1").line, JiaoDuStrings.badR)
        XCTAssertEqual(JiaoDu.render(r: "16", a: "abc").line, JiaoDuStrings.badA)
        XCTAssertEqual(JiaoDu.render(r: "16", a: "abc").big, "—")
    }

    func testToFixedLikeJavaScript() {
        // JS：(0.125).toFixed(2) = "0.13"，(1.005).toFixed(2) = "1.00"（1.005 其实比 1.005 小一点）
        XCTAssertEqual(JSNumber.toFixed(0.125, 2), "0.13")
        XCTAssertEqual(JSNumber.toFixed(1.005, 2), "1.00")
        XCTAssertEqual(JSNumber.toFixed(100, 3), "100.000")
        XCTAssertEqual(JSNumber.toFixed(-0.0001, 3), "-0.000")
        XCTAssertEqual(JSNumber.toFixed(9.9996, 3), "10.000")
    }
}
