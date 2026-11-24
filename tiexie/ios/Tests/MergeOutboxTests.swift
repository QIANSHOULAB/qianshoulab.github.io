import XCTest
@testable import TieXie

// 合并规则、发件箱：杀进程不丢、只寄最新一版、2 分钟没回信再寄、旧的不许盖掉新的。
final class MergeOutboxTests: XCTestCase {
    let t0 = "2026-11-24T17:00:00+08:00"
    let t1 = "2026-11-24T17:05:00+08:00"
    let t2 = "2026-11-24T17:10:00+08:00"

    func book(_ id: String, _ title: String, _ m: String, cat: String = "baodian") -> Book {
        Book(id: id, title: title, category: cat, body: "正文", modified: m)
    }

    func lib(_ books: [Book], sets: [SetItem] = []) -> TXData {
        TXData(site: Site(name: "铁屑江湖", sub: "机床边的武林"), books: books, sets: sets)
    }

    // ------------------------------------------------------------ 合并
    func testNewerWins() {
        let local = lib([book("a", "本地新", t1), book("b", "本地旧", t0)])
        let remote = lib([book("a", "网上旧", t0), book("b", "网上新", t1)])
        let r = Merge.merge(local: local, remote: remote, holds: .init())
        XCTAssertEqual(r.data.book("a")?.title, "本地新")
        XCTAssertEqual(r.data.book("b")?.title, "网上新")
    }

    func testPendingKeepsLocalEvenIfRemoteNewer() {
        var h = Merge.Holds()
        h.pending[ItemKey.book("a")] = t0
        let r = Merge.merge(local: lib([book("a", "没寄到", t0)]), remote: lib([book("a", "别处改的", t2)]), holds: h)
        XCTAssertEqual(r.data.book("a")?.title, "没寄到")
    }

    func testDeletedElsewhereFollows() {
        let r = Merge.merge(local: lib([book("a", "甲", t0), book("b", "乙", t0)]), remote: lib([book("a", "甲", t0)]), holds: .init())
        XCTAssertNil(r.data.book("b"))
        XCTAssertNotNil(r.data.book("a"))
    }

    func testNewLocalNotYetOnlineStays() {
        var h = Merge.Holds()
        h.pending[ItemKey.book("new")] = t1
        let r = Merge.merge(local: lib([book("a", "甲", t0), book("new", "新开的", t1)]), remote: lib([book("a", "甲", t0)]), holds: h)
        XCTAssertEqual(r.data.books.map(\.id), ["a", "new"])
    }

    func testShippedButPagesStaleKeepsLocalThenClears() {
        // 寄到了、大管家推上去了，Pages 缓存还是旧的：旧的不许盖掉新的
        var h = Merge.Holds()
        h.shipped[ItemKey.book("a")] = t1
        h.shipped[ItemKey.book("new")] = t1
        let local = lib([book("a", "新标题", t1), book("new", "新开的", t1)])
        var r = Merge.merge(local: local, remote: lib([book("a", "旧标题", t0)]), holds: h)
        XCTAssertEqual(r.data.book("a")?.title, "新标题")
        XCTAssertEqual(r.data.book("new")?.title, "新开的")
        // 网上追上来了：记号清掉
        r = Merge.merge(local: r.data, remote: lib([book("a", "新标题", t1), book("new", "新开的", t1)]), holds: r.holds)
        XCTAssertTrue(r.holds.shipped.isEmpty)
        XCTAssertEqual(r.data.books.count, 2)
    }

    func testDeletedDoesNotGrowBackFromStaleCache() {
        var h = Merge.Holds()
        h.deleted[ItemKey.book("a")] = t1
        var r = Merge.merge(local: lib([]), remote: lib([book("a", "缓存里的旧版", t0)]), holds: h)
        XCTAssertNil(r.data.book("a"))
        // 网上也没了：记号清掉
        r = Merge.merge(local: r.data, remote: lib([]), holds: r.holds)
        XCTAssertTrue(r.holds.deleted.isEmpty)
        // 扔了以后别处又改过（更新）：网上那份赢
        r = Merge.merge(local: lib([]), remote: lib([book("a", "别处又改了", t2)]), holds: h)
        XCTAssertEqual(r.data.book("a")?.title, "别处又改了")
    }

    func testSetTombstoneNotClearedByBookList() {
        var h = Merge.Holds()
        h.deleted[ItemKey.set("s1")] = t1
        let r = Merge.merge(local: lib([]), remote: lib([], sets: [SetItem(id: "s1", title: "旧", modified: t0)]), holds: h)
        XCTAssertTrue(r.data.sets.isEmpty)
        XCTAssertNotNil(r.holds.deleted[ItemKey.set("s1")])
    }

    // ------------------------------------------------------------ 发件箱
    func testOnlyLatestVersionIsSent() {
        var s = SavedState(data: lib([book("a", "一", t0)]))
        s.enqueuePut(what: "book", id: "a", modified: t0)
        let first = s.outbox[0].req
        s.enqueuePut(what: "book", id: "a", modified: t1)
        XCTAssertEqual(s.outbox.count, 1)
        XCTAssertNotEqual(s.outbox[0].req, first)
        XCTAssertEqual(s.outbox[0].modified, t1)
        // 旧那封的回信：不认
        XCTAssertFalse(s.handleResult(re: first, ok: true, stale: false, why: nil))
        XCTAssertEqual(s.outbox.count, 1)
    }

    func testResendAfterTwoMinutes() {
        var s = SavedState(data: lib([book("a", "一", t0)]))
        s.enqueuePut(what: "book", id: "a", modified: t0)
        let now = Date()
        XCTAssertEqual(s.due(now: now).count, 1)
        s.markSent(req: s.outbox[0].req, at: now)
        XCTAssertEqual(s.due(now: now.addingTimeInterval(60)).count, 0)
        XCTAssertEqual(s.due(now: now.addingTimeInterval(121)).count, 1)
        // 同一个请求 id 重寄（大管家按 id 只办一次）
        XCTAssertEqual(s.due(now: now.addingTimeInterval(121))[0].req, s.outbox[0].req)
    }

    func testOkClearsAndShipsStaleDoesNot() {
        var s = SavedState(data: lib([book("a", "一", t0), book("b", "二", t0)]))
        s.enqueuePut(what: "book", id: "a", modified: t1)
        s.enqueuePut(what: "book", id: "b", modified: t1)
        let ra = s.outbox[0].req, rb = s.outbox[1].req
        XCTAssertTrue(s.handleResult(re: ra, ok: true, stale: false, why: nil))
        XCTAssertEqual(s.holds.shipped[ItemKey.book("a")], t1)
        XCTAssertNil(s.holds.pending[ItemKey.book("a")])
        XCTAssertTrue(s.handleResult(re: rb, ok: true, stale: true, why: nil))
        XCTAssertNil(s.holds.shipped[ItemKey.book("b")])
        XCTAssertTrue(s.outbox.isEmpty)
    }

    func testFailedStaysInOutbox() {
        var s = SavedState(data: lib([book("a", "一", t0)]))
        s.enqueuePut(what: "book", id: "a", modified: t1)
        s.handleResult(re: s.outbox[0].req, ok: false, stale: false, why: "推不上 GitHub")
        XCTAssertEqual(s.outbox.count, 1)
        XCTAssertEqual(s.outbox[0].why, "推不上 GitHub")
    }

    func testFilesOnlyForImagesNotOnline() {
        var s = SavedState(data: lib([Book(id: "a", title: "甲", category: "buzhen", img: "img/vm10.jpg",
                                           plates: ["img/a-1234abcd.jpg"], modified: t0)]))
        s.online = ["img/vm10.jpg"]
        s.enqueuePut(what: "book", id: "a", modified: t0)
        XCTAssertEqual(s.filesToSend(for: s.outbox[0]), ["img/a-1234abcd.jpg"])
        s.handleResult(re: s.outbox[0].req, ok: true, stale: false, why: nil)
        XCTAssertTrue(s.online.contains("img/a-1234abcd.jpg"))
    }

    func testRequestShapes() throws {
        var s = SavedState(data: lib([book("a", "甲", t0)]))
        s.enqueuePut(what: "book", id: "a", modified: t0)
        let put = try XCTUnwrap(TXAsk.put(s.outbox[0], state: s, app: "0.1.0"))
        XCTAssertEqual(put["ask"] as? String, "tx-put")
        XCTAssertEqual(put["what"] as? String, "book")
        let item = try XCTUnwrap(put["item"] as? [String: Any])
        XCTAssertEqual(item["modified"] as? String, t0)
        XCTAssertTrue(item["setId"] is NSNull)  // 跟 data.json 一样写 null
        s.enqueueDel(what: "book", id: "a", at: t1)
        let del = TXAsk.del(s.outbox[0], app: "0.1.0")
        XCTAssertEqual(del["ask"] as? String, "tx-del")
        XCTAssertEqual(del["item"] as? String, "a")
        XCTAssertEqual(del["modified"] as? String, t1)
    }

    // ------------------------------------------------------------ 杀进程不丢
    @MainActor
    func testKillDoesNotLoseEdits() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("tx-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        do {
            let s = Store(folder: dir)
            var b = try XCTUnwrap(s.data.book("vm10"))
            b.title = "VM10探零宝典（改）"
            s.saveBook(b)
            s.saveBook(Book(id: "bd-abc123", title: "新开一本", category: "baodian", modified: ""))
            s.deleteBook("vm12")
            XCTAssertEqual(s.state.outbox.count, 3)
        }  // 这里 Store 没了，等于杀进程
        let again = Store(folder: dir)
        XCTAssertEqual(again.data.book("vm10")?.title, "VM10探零宝典（改）")
        XCTAssertEqual(again.data.book("bd-abc123")?.title, "新开一本")
        XCTAssertNil(again.data.book("vm12"))
        XCTAssertEqual(Set(again.state.outbox.map(\.key)), [ItemKey.book("vm10"), ItemKey.book("bd-abc123"), ItemKey.book("vm12")])
    }

    func testNewIDs() {
        for c in ["baodian", "daofa", "buzhen", "bingqi", "set"] {
            let id = NewID.make(c)
            XCTAssertTrue(NewID.isValid(id), id)
        }
        XCTAssertFalse(NewID.isValid("VM10"))
        XCTAssertTrue(ImagePath.isSafe("img/bd-7f3a2c-0a1b2c3d.jpg"))
        XCTAssertFalse(ImagePath.isSafe("img/../x.jpg"))
        XCTAssertFalse(ImagePath.isSafe("../img/x.jpg"))
    }
}
