import XCTest
import UIKit
@testable import TieXie

// 166：管控线模式（默认只换 LCL / UCL）、「全要」不变、斜 45° 和整张横拍、红字不叠、存原图（存相册在 ci/shots.sh 里验）。
// Fixtures/s9–s13 是 166 用 PIL 画的假单子（内容全是编的），truth166.json 是表上印的真值：
//   s9_two_level   两层表头：TOLERANCE 底下 LSL/USL，CONTROL LIMIT 底下 LCL/UCL，右边 M.I. 和五列实测值
//   s10_limits_only 只有「CONTROL LIMIT 控制范围」，底下两格只写「下」「上」（没有 DIMENSION / LSL / USL）
//   s11_tilt45     s9 那样的单子斜 45° 拍
//   s12_whole      整张单子横拍（4032 × 3024）、26 行、字小，带抬头和签字栏
//   s13_no_limits  有 DIMENSION / LSL / USL / STOCK，没有管控线
final class YingCun166Tests: XCTestCase {
    static let dir = YingCunTests.dir

    struct Truth: Decodable {
        var layout: String
        var rows: [[String: Value]]
        enum Value: Decodable {
            case s(String), list([String])
            init(from d: Decoder) throws {
                let c = try d.singleValueContainer()
                if let v = try? c.decode(String.self) { self = .s(v) } else { self = .list(try c.decode([String].self)) }
            }
            var str: String? { if case .s(let v) = self { return v }; return nil }
        }
    }

    static func truth() throws -> [String: Truth] {
        try JSONDecoder().decode([String: Truth].self, from: Data(contentsOf: dir.appendingPathComponent("truth166.json")))
    }

    static func conv(_ s: String?, _ mode: YCMode = .in2mm) -> String? { s.flatMap(YingCun.parseNum).map { YingCun.convert($0, mode) } }

    /// 一张白图当底（只测逻辑、出图不看长相）
    static func blank(_ items: [YCItem]) -> YCRaster {
        YCRaster(width: Int((items.map(\.x1).max() ?? 100) + 200), height: Int((items.map(\.y1).max() ?? 100) + 200))
    }

    /// 留给 CI 的话：写到 tiexie/ios/notes-166.txt，ci/shots.sh 转成 Actions 注释（XCTSkip 的字在注释里看不见）
    static func note(_ lines: [String]) {
        let url = dir.appendingPathComponent("../../../../notes-166.txt").standardizedFileURL
        let old = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        try? (old + lines.map { $0.replacingOccurrences(of: "\n", with: " ") + "\n" }.joined()).write(to: url, atomically: true, encoding: .utf8)
    }

    /// 排查：表头每格在哪、每列线在哪、第 2 行附近的字框
    static func dump(_ job: YCJob, _ A: YCTable) -> String {
        let hs = A.hs.keys.map { k in "\(k)=\(A.hs[k]!.text)@\(Int(A.hx[k] ?? -1)),\(Int(A.hs[k]!.cy))" }.joined(separator: " ")
        let y = A.rows.count > 1 ? A.rows[1].keys.map { A.rows[1][$0]!.cy }.reduce(0, +) / Double(A.rows[1].count) : A.hy + 3 * A.th
        let ls = A.lines.keys.map { k in "\(k)@\(Int(A.lines[k]!.0 + A.lines[k]!.1 * y))" }.joined(separator: " ")
        let r1 = A.rows.count > 1 ? A.rows[1].keys.map { "\($0)=\(A.rows[1][$0]!.text)" }.joined(separator: ",") : "-"
        let near = job.items.filter { abs($0.cy - y) < 1.2 * A.th && !$0.text.isEmpty }.sorted { $0.cx < $1.cx }
            .map { "\($0.text)@\(Int($0.cx))\($0.col.map { ":" + $0 } ?? "")" }.joined(separator: " ")
        let hdr = job.raw.filter { abs($0.cy - A.hy) < 2.5 * A.th }.sorted { $0.cx < $1.cx }.map { "\($0.text)@\(Int($0.cx)),\(Int($0.cy))" }.joined(separator: " ")
        return "th\(Int(A.th)) hy\(Int(A.hy)) 表头[\(hs)] 线[\(ls)] 第2行[\(r1)] 那行字框[\(near)] 表头那排[\(hdr)]"
    }

    static func overlaps(_ labels: [YCLabel]) -> Int {
        var n = 0
        for i in 0..<labels.count {
            for j in (i + 1)..<max(i + 1, labels.count) {
                let a = labels[i], b = labels[j]
                if CGRect(x: a.x, y: a.y, width: a.w, height: a.h).insetBy(dx: 0.5, dy: 0.5)
                    .intersects(CGRect(x: b.x, y: b.y, width: b.w, height: b.h).insetBy(dx: 0.5, dy: 0.5)) { n += 1 }
            }
        }
        return n
    }

    // ------------------------------------------------------------ 网页版字框：全要不变，管控线只落 LCL / UCL
    func testLimitsOnWebBoxes() throws {
        for n in YingCunTests.names {
            let fx = try YingCunTests.load(n)
            let items = fx.makeItems()
            let job = YCJob(up: Self.blank(items), items: items, angle: 0)
            XCTAssertEqual(job.kind.rawValue, fx.kind, n)
            guard case .rows(let rows)? = fx.expect["in2mm"] else {
                // 没表头那张：管控线模式一个数都不换，给提示
                XCTAssertNil(job.limits, n)
                let d = try XCTUnwrap(YingCunRender.draw(job, .in2mm, .limits), n)
                XCTAssertTrue(d.missing, n)
                XCTAssertTrue(d.labels.isEmpty, n)
                continue
            }
            // 全要：跟网页版一样（行数、每格）
            let all = try XCTUnwrap(YingCunRender.draw(job, .in2mm, .all), n)
            XCTAssertEqual(all.rows, rows.count, n)
            // 管控线：用的就是全要那张表；红字只在 LCL、UCL，个数 = 网页版这两列落红字的格数
            let A = try XCTUnwrap(job.limits, n)
            XCTAssertEqual(A.rows.count, rows.count, n)
            let d = try XCTUnwrap(YingCunRender.draw(job, .in2mm, .limits), n)
            XCTAssertFalse(d.missing, n)
            XCTAssertEqual(Set(d.labels.compactMap(\.key)), ["LCL", "UCL"], n)
            let want = rows.reduce(0) { acc, w in acc + ["LCL", "UCL"].filter { w.conv[$0] != nil }.count }
            XCTAssertEqual(d.labels.count, want, n)
            for c in d.checks { XCTAssertTrue(c.flag.isSubset(of: YingCun.limitKeys), n) }
            for L in d.labels { XCTAssertEqual(YingCun.convert(L.item.num!, .in2mm), rows[L.row].conv[L.key!], "\(n) 第 \(L.row + 1) 行 \(L.key!)") }
            XCTAssertEqual(Self.overlaps(d.labels), 0, n)
            // 单找管控线（不靠 DIMENSION 那排）也读得一样
            let solo = try XCTUnwrap(YingCun.analyzeLimits(fx.makeItems()), "\(n) 单找管控线")
            XCTAssertEqual(solo.rows.count, rows.count, "\(n) 单找管控线行数")
            for (i, r) in solo.rows.enumerated() where i < rows.count {
                for k in ["LCL", "UCL"] {
                    XCTAssertEqual(r[k]?.num.map { YingCun.convert($0, .in2mm) }, rows[i].conv[k], "\(n) 单找 第 \(i + 1) 行 \(k)")
                }
            }
        }
    }

    // ------------------------------------------------------------ 「CONTROL LIMIT 控制范围」底下分两格
    func testLimitTitleHeader() throws {
        func it(_ s: String, _ x: Double, _ y: Double, w: Double = 90) -> YCItem { YCItem(x0: x - w / 2, y0: y - 15, x1: x + w / 2, y1: y + 15, text: s, conf: 0.95) }
        func sheet(sub: Bool) -> [YCItem] {
            var a = [it("NO.", 60, 100), it("ITEM", 200, 100), it("CONTROL LIMIT", 470, 80, w: 220), it("控制范围", 640, 80, w: 110),
                     it("M.I.", 800, 100), it("1", 960, 100, w: 20), it("2", 1120, 100, w: 20)]
            if sub { a += [it("下", 420, 125, w: 26), it("上", 620, 125, w: 26)] }
            for r in 0..<6 {
                let y = 180 + Double(r) * 60
                let l = 1.0 + Double(r) * 0.25
                a += [it("\(r + 1)", 60, y, w: 20), it("BORE", 200, y), it(String(format: "%.4f", l), 420, y), it(String(format: "%.4f", l + 0.01), 620, y),
                      it("CA", 800, y, w: 40), it(String(format: "%.4f", l + 0.004), 960, y), it(String(format: "%.4f", l + 0.006), 1120, y)]
            }
            return a
        }
        for sub in [true, false] {
            let A = try XCTUnwrap(YingCun.analyzeLimits(sheet(sub: sub)), "底下两格\(sub ? "有字" : "没字")")
            XCTAssertEqual(A.rows.count, 6)
            for (r, row) in A.rows.enumerated() {
                let l = 1.0 + Double(r) * 0.25
                XCTAssertEqual(row["LCL"]?.text, String(format: "%.4f", l), "\(sub) 第 \(r + 1) 行 LCL")
                XCTAssertEqual(row["UCL"]?.text, String(format: "%.4f", l + 0.01), "\(sub) 第 \(r + 1) 行 UCL")
            }
        }
        // 全要这套没 DIMENSION 那排，不算表（整张全换）
        let job = YCJob(up: YCRaster(width: 1300, height: 600), items: sheet(sub: true), angle: 0)
        XCTAssertEqual(job.kind, .loose)
        XCTAssertNotNil(job.limits)
        XCTAssertTrue(YingCun.isLimitTitle("CONTROL LIMIT 控制范围"))
        XCTAssertTrue(YingCun.isLimitTitle("CONTR0L LIMlT"))
        XCTAssertTrue(YingCun.isLimitTitle("控制范围"))
        XCTAssertFalse(YingCun.isLimitTitle("CONTROL PLAN NO."))
        XCTAssertFalse(YingCun.isLimitTitle("LCL"))
    }

    // ------------------------------------------------------------ 红字不叠
    func testLooseLabelsNeverOverlap() throws {
        // 整张横拍那种：30 行 × 8 列小字挤在一起
        var items: [YCItem] = []
        for r in 0..<30 {
            for c in 0..<8 {
                let x = 40 + Double(c) * 120, y = 40 + Double(r) * 26
                items.append(YCItem(x0: x, y0: y - 11, x1: x + 78, y1: y + 11, text: String(format: "%.4f", 0.5 + Double(r * 8 + c) * 0.0137), conf: 0.95))
            }
        }
        let obstacles = items.map { CGRect(x: $0.x0, y: $0.cy - $0.h / YingCunVision.boxGrow / 2, width: $0.x1 - $0.x0, height: $0.h / YingCunVision.boxGrow) }
        let (spots, skipped) = YingCunRender.placeLoose(items, obstacles: obstacles, bounds: CGRect(x: 0, y: 0, width: 1100, height: 900), mode: .in2mm) { t, fs in
            Double(t.count) * 0.58 * fs
        }
        XCTAssertEqual(spots.count + skipped, items.count)
        for i in 0..<spots.count {
            let (it, r, _) = spots[i]
            XCTAssertLessThanOrEqual(Double(r.height), it.h + 0.01, "红字框不高过原数那一格")
            for o in obstacles { XCTAssertFalse(o.intersects(r), "红字压到别的字") }
            for j in (i + 1)..<max(i + 1, spots.count) { XCTAssertFalse(spots[j].1.intersects(r), "红字压红字") }
        }
        // 网页版那张没表头的（稀）：一个都不该挤掉
        let s8 = try YingCunTests.load("s8_loose").makeItems()
        let job = YCJob(up: Self.blank(s8), items: s8, angle: 0)
        let d = try XCTUnwrap(YingCunRender.draw(job, .in2mm, .all))
        XCTAssertEqual(d.skipped, 0)
        XCTAssertEqual(d.labels.count, s8.filter { $0.num != nil }.count)
        XCTAssertEqual(Self.overlaps(d.labels), 0)
    }

    // ------------------------------------------------------------ 苹果 Vision 整条链（166 的五张）
    static var visionResult: (Int, Int, [String], String)?

    static func runVision() async throws -> (Int, Int, [String], String) {
        if let r = visionResult { return r }
        let truth = try Self.truth()
        var good = 0, total = 0
        var fails: [String] = []
        var lines: [String] = []
        for n in ["s9_two_level", "s10_limits_only", "s11_tilt45", "s12_whole", "s13_no_limits"] {
            guard let t = truth[n] else { fails.append("\(n) 没真值"); continue }
            guard let img = UIImage(contentsOfFile: dir.appendingPathComponent(n + ".jpg").path) else { fails.append("\(n).jpg 打不开"); continue }
            let job: YCJob
            do { job = try await YingCunVision.read(img) } catch { fails.append("\(n) Vision 出错 \(error)"); continue }
            var note = "\(n): 全要\(job.kind.rawValue) 管控线\(job.limits == nil ? "没找到" : "\(job.limits!.rows.count)行") 转\(Int(job.angle.rounded()))° [\(job.notes.joined(separator: "；"))]"
            // 管控线
            let dl = YingCunRender.draw(job, .in2mm, .limits)
            if t.layout == "no_limits" {
                if dl?.missing != true { fails.append("\(n) 该说没找到管控线") }
            } else if let A = job.limits, let dl {
                var hit = 0, cnt = 0
                var miss: [String] = []
                for (i, w) in t.rows.enumerated() {
                    for k in ["LCL", "UCL"] {
                        cnt += 1
                        let got = i < A.rows.count ? A.rows[i][k]?.num.map { YingCun.convert($0, .in2mm) } : nil
                        if got == conv(w[k]?.str) { hit += 1 } else if miss.count < 4 { miss.append("r\(i + 1)\(k):\(got ?? "无")≠\(conv(w[k]?.str) ?? "?")") }
                    }
                }
                good += hit; total += cnt
                note += " 管控线对上\(hit)/\(cnt) 行\(A.rows.count)/\(t.rows.count)" + (miss.isEmpty ? "" : " " + miss.joined(separator: " "))
                if !miss.isEmpty { note += " ‖ 管控线表 " + dump(job, A) + (job.table.map { " ‖ 全要表 " + dump(job, $0) } ?? "") }
                if !Set(dl.labels.compactMap(\.key)).isSubset(of: YingCun.limitKeys) { fails.append("\(n) 管控线模式落了别的列") }
                if overlaps(dl.labels) > 0 { fails.append("\(n) 管控线红字叠了") }
            } else {
                fails.append("\(n) 管控线没找到")
                let cand = job.raw.filter { YingCun.isLimitTitle($0.text) || ["LCL", "UCL"].contains(YingCun.hdrKey($0.text) ?? "") }
                note += " 候选[" + cand.prefix(8).map { "\($0.text)@\(Int($0.cx)),\(Int($0.cy))" }.joined(separator: " ") + "]"
            }
            // 全要
            if let da = YingCunRender.draw(job, .in2mm, .all) {
                if overlaps(da.labels) > 0 { fails.append("\(n) 全要红字叠了") }
                note += " 全要红字\(da.labels.count) 挤掉\(da.skipped)"
                if t.layout == "limits_only" {
                    if job.kind != .loose { fails.append("\(n) 全要该是没表头全换") }
                } else if let A = job.table {
                    var hit = 0, cnt = 0
                    var miss: [String] = []
                    let printed = t.layout == "no_limits" ? ["DIM", "LSL", "USL", "STOCK"] : YingCun.keys6
                    for (i, w) in t.rows.enumerated() {
                        for k in printed {
                            guard let v = w[k]?.str, !(k == "STOCK" && v == "0") else { continue }
                            cnt += 1
                            let got = i < A.rows.count ? A.rows[i][k]?.num.map { YingCun.convert($0, .in2mm) } : nil
                            if got == conv(v) { hit += 1 } else if miss.count < 6 { miss.append("r\(i + 1)\(k):\(got ?? "无")≠\(conv(v) ?? "?")") }
                        }
                    }
                    good += hit; total += cnt
                    note += " 全要对上\(hit)/\(cnt)" + (miss.isEmpty ? "" : " " + miss.joined(separator: " "))
                    if !miss.isEmpty { note += " ‖ " + dump(job, A) }
                } else {
                    fails.append("\(n) 全要没读出表")
                }
            } else {
                fails.append("\(n) 全要出不了图")
            }
            lines.append(note)
        }
        let summary = "166 Vision 对上 \(good)/\(total) 格｜" + lines.joined(separator: "｜")
        print("166-VISION " + summary)
        note(["166 Vision 对上 \(good)/\(total) 格" + (fails.isEmpty ? "" : "；毛病：" + fails.joined(separator: "；"))] + lines)
        visionResult = (good, total, fails, summary)
        return (good, total, fails, summary)
    }

    func testVision166() async throws {
        let (good, total, fails, summary) = try await Self.runVision()
        XCTAssertTrue(fails.isEmpty, fails.joined(separator: "；") + "｜" + summary)
        XCTAssertGreaterThan(total, 300)
        XCTAssertEqual(good, total, summary)
    }

    func testVision166Report() async throws {
        let (_, _, _, summary) = try await Self.runVision()
        throw XCTSkip(summary)
    }

    /// 整张横拍那张直接用原图大小认（自动那条路只在 2016 读不出表头时才走）
    func testWholeSheetHiRes() async throws {
        let img = try XCTUnwrap(UIImage(contentsOfFile: Self.dir.appendingPathComponent("s12_whole.jpg").path))
        let job = try await YingCunVision.read(img, hires: true)
        let t = try XCTUnwrap(try Self.truth()["s12_whole"])
        let A = try XCTUnwrap(job.limits, "原图大小认：管控线没找到 [\(job.notes.joined(separator: "；"))]")
        var hit = 0
        for (i, w) in t.rows.enumerated() where i < A.rows.count {
            for k in ["LCL", "UCL"] where A.rows[i][k]?.num.map({ YingCun.convert($0, .in2mm) }) == Self.conv(w[k]?.str) { hit += 1 }
        }
        Self.note(["s12 原图大小认：管控线对上 \(hit)/\(2 * t.rows.count) 行\(A.rows.count) [\(job.notes.joined(separator: "；"))]"])
        XCTAssertEqual(hit, 2 * t.rows.count, "原图大小认 管控线对上 \(hit)/\(2 * t.rows.count) [\(job.notes.joined(separator: "；"))]")
    }
}
