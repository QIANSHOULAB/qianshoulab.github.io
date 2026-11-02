"""核心逻辑测试：全在造出来的假文件夹里跑。  cd saodi/app && python -m pytest -q"""
from __future__ import annotations

import datetime as dt
import http.server
import os
import sys
import threading
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from saodi import fsutil as fs, ops, rename, organize, watch, download  # noqa: E402


@pytest.fixture(autouse=True)
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("SAODI_HOME", str(tmp_path / "_home"))
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "_xdg"))
    return tmp_path


def mk(d, *names, content=None):
    os.makedirs(fs.lp(str(d)), exist_ok=True)
    for n in names:
        with open(fs.lp(os.path.join(d, n)), "w", encoding="utf-8") as f:
            f.write(content if content is not None else n)
    return d


def ls(d):
    return sorted(n for n in os.listdir(fs.lp(str(d))) if not n.startswith("."))


def read(p):
    with open(fs.lp(str(p)), encoding="utf-8") as f:
        return f.read()


def run_rename(d, rules, **kw):
    p = rename.plan(str(d), rules, **kw)
    return p, ops.execute(rename.to_ops(p), "rename")


# ------------------------------------------------------------------ 改名基础
def test_number_replace_and_undo(tmp_path):
    d = mk(tmp_path / "f", "IMG_10.jpg", "IMG_2.jpg", "IMG_1.jpg", "notes.txt")
    p, r = run_rename(d, [{"type": "replace", "find": "img_", "to": ""},
                          {"type": "number", "start": 1, "digits": 3, "where": "start", "sep": "-"}])
    assert r["done"] == 4 and not r["failed"]
    # 自然排序：1 < 2 < 10
    assert ls(d) == ["001-1.jpg", "002-2.jpg", "003-10.jpg", "004-notes.txt"]
    assert read(d / "003-10.jpg") == "IMG_10.jpg"  # 内容跟着走
    u = ops.undo()
    assert u["restored"] == 4
    assert ls(d) == ["IMG_1.jpg", "IMG_10.jpg", "IMG_2.jpg", "notes.txt"]
    assert ops.undo(r["batch"])["err"] == "already"


def test_preview_does_not_touch_disk(tmp_path):
    d = mk(tmp_path / "f", "a.txt")
    rename.plan(str(d), [{"type": "insert", "text": "X", "where": "start"}])
    assert ls(d) == ["a.txt"]


def test_swap_and_case_only(tmp_path):
    d = mk(tmp_path / "f", "a.txt", "b.txt", "Photo.JPG")
    # a<->b 互换：用正则一次换
    p, r = run_rename(d, [{"type": "replace", "find": "^([ab])$", "to": "X\\1", "regex": True},
                          {"type": "replace", "find": "Xa", "to": "b", "case": True},
                          {"type": "replace", "find": "Xb", "to": "a", "case": True},
                          {"type": "case", "mode": "lower"}, {"type": "ext", "mode": "lower"}])
    assert p["bumped"] == 0
    assert ls(d) == ["a.txt", "b.txt", "photo.jpg"]
    assert read(d / "a.txt") == "b.txt" and read(d / "b.txt") == "a.txt"
    ops.undo()
    assert read(d / "a.txt") == "a.txt" and ls(d) == ["Photo.JPG", "a.txt", "b.txt"]


def test_conflicts_never_overwrite(tmp_path):
    d = mk(tmp_path / "f", "报告 v1.docx", "报告 v2.docx", "报告.docx", "keep.txt")
    p, r = run_rename(d, [{"type": "replace", "find": " v\\d", "to": "", "regex": True}],
                      filt={"ext": "docx"})
    # 报告.docx 不在改名之列（名字不变）占着原名，两个新名都被让开
    assert sorted(it["new"] for it in p["items"]) == ["报告 (2).docx", "报告 (3).docx", "报告.docx"]
    assert p["bumped"] == 2 and r["done"] == 2
    assert read(d / "报告.docx") == "报告.docx"
    assert {read(d / "报告 (2).docx"), read(d / "报告 (3).docx")} == {"报告 v1.docx", "报告 v2.docx"}


def test_conflict_appearing_between_preview_and_run(tmp_path):
    d = mk(tmp_path / "f", "a.txt")
    p = rename.plan(str(d), [{"type": "replace", "find": "a", "to": "b"}])
    mk(d, "b.txt", content="别人刚放的")
    r = ops.execute(rename.to_ops(p), "rename")
    assert r["done"] == 1 and r["bumped"] == 1
    assert read(d / "b.txt") == "别人刚放的" and read(d / "b (2).txt") == "a.txt"


def test_chinese_and_special_chars(tmp_path):
    d = mk(tmp_path / "f", "会议 纪要  2026.txt", "😀 emoji  名.md", "con.txt", "a.b.c.tar")
    p, r = run_rename(d, [{"type": "trim"}, {"type": "replace", "find": " ", "to": ":"},
                          {"type": "insert", "text": "?<客户>", "where": "end"}])
    names = ls(d)
    assert "会议：纪要：2026？‹客户›.txt" in names
    assert "😀：emoji：名？‹客户›.md" in names
    assert not any(c in "".join(names) for c in '<>:"/\\|?*')
    # 保留名
    p2 = rename.plan(str(d), [{"type": "replace", "find": "^.*$", "to": "CON", "regex": True}], filt={"ext": "tar"})
    assert p2["items"][0]["new"].upper() != "CON.TAR" and p2["items"][0]["new"].startswith("_")


def test_empty_name_is_error_not_rename(tmp_path):
    d = mk(tmp_path / "f", "abc.txt")
    p = rename.plan(str(d), [{"type": "replace", "find": "abc", "to": ""}, {"type": "ext", "mode": "set", "to": ""}])
    assert p["items"][0]["status"] == "error" and p["changed"] == 0


def test_long_names_and_deep_paths(tmp_path):
    deep = tmp_path / "f"
    for i in range(6):
        deep = deep / ("很长的文件夹名字" * 4 + str(i))
    d = mk(deep, "短.txt")
    assert len(str(d)) > 260
    p, r = run_rename(d, [{"type": "insert", "text": "超" * 300, "where": "end"}])
    new = ls(d)[0]
    assert new.endswith(".txt") and len(new.encode()) <= 255
    assert r["done"] == 1
    assert ops.undo()["restored"] == 1 and ls(d) == ["短.txt"]


def test_busy_file_skipped_others_done(tmp_path, monkeypatch):
    d = mk(tmp_path / "f", "1.txt", "2.txt", "3.txt")
    real = os.rename

    def fake(src, dst):
        if os.path.basename(src) == "2.txt":
            raise PermissionError(32, "被另一个程序占用")
        return real(src, dst)

    monkeypatch.setattr(os, "rename", fake)
    p, r = run_rename(d, [{"type": "insert", "text": "新-", "where": "start"}])
    monkeypatch.setattr(os, "rename", real)
    assert r["done"] == 2 and r["failed"] == [{"name": "2.txt", "err": "busy"}]
    assert ls(d) == ["2.txt", "新-1.txt", "新-3.txt"]
    ops.undo()
    assert ls(d) == ["1.txt", "2.txt", "3.txt"]


def test_failure_in_second_phase_rolls_back(tmp_path, monkeypatch):
    d = mk(tmp_path / "f", "x.txt")
    real = os.rename

    def fake(src, dst):
        if os.path.basename(dst) == "y.txt":
            raise PermissionError(5, "拒绝访问")
        return real(src, dst)

    monkeypatch.setattr(os, "rename", fake)
    p, r = run_rename(d, [{"type": "replace", "find": "x", "to": "y"}])
    monkeypatch.setattr(os, "rename", real)
    assert r["done"] == 0 and ls(d) == ["x.txt"]
    assert not [n for n in os.listdir(d) if n.endswith(".saodi-tmp")]


def test_undo_skips_files_user_moved(tmp_path):
    d = mk(tmp_path / "f", "a.txt", "b.txt")
    run_rename(d, [{"type": "insert", "text": "z", "where": "start"}])
    os.rename(d / "za.txt", tmp_path / "elsewhere.txt")
    u = ops.undo()
    assert u["restored"] == 1 and u["skipped"] == [{"name": "za.txt", "err": "gone"}]
    assert ls(d) == ["b.txt"]


def test_undo_when_original_name_reoccupied(tmp_path):
    d = mk(tmp_path / "f", "a.txt")
    run_rename(d, [{"type": "insert", "text": "z", "where": "start"}])
    mk(d, "a.txt", content="新来的")
    u = ops.undo()
    assert u["restored"] == 1
    assert read(d / "a.txt") == "新来的" and read(d / "a (2).txt") == "a.txt"


def test_dates_and_photo_taken(tmp_path):
    d = mk(tmp_path / "f")
    fs.make_jpeg_with_exif(str(d / "IMG_0002.JPG"), dt.datetime(2024, 5, 1, 9, 30, 0))
    fs.make_jpeg_with_exif(str(d / "IMG_0001.JPG"), dt.datetime(2024, 5, 1, 9, 30, 0))
    fs.make_jpeg_with_exif(str(d / "z.jpg"), dt.datetime(2023, 12, 31, 23, 59, 59))
    mk(d, "no-exif.jpg", content="not a jpeg")
    os.utime(d / "no-exif.jpg", (dt.datetime(2020, 1, 2).timestamp(),) * 2)
    assert fs.photo_taken(str(d / "z.jpg")) == dt.datetime(2023, 12, 31, 23, 59, 59)
    p, r = run_rename(d, [{"type": "date", "source": "taken", "fmt": "YYYY-MM-DD hh.mm.ss", "where": "name"},
                          {"type": "ext", "mode": "lower"}], sort_by="taken")
    assert ls(d) == ["2020-01-02 00.00.00.jpg", "2023-12-31 23.59.59.jpg",
                     "2024-05-01 09.30.00 (2).jpg", "2024-05-01 09.30.00.jpg"]
    assert [it for it in p["items"] if "notaken" in it["notes"]][0]["old"] == "no-exif.jpg"


def test_case_modes_and_trim_remove():
    f = {"name": "  hello   WORLD  foo.TXT", "mtime": 0, "ctime": 0, "path": "", "rel": ""}
    assert rename.apply_rules(f, 0, [{"type": "trim"}, {"type": "case", "mode": "title"}])[0] == "Hello World Foo.TXT"
    assert rename.apply_rules(f, 0, [{"type": "trim"}, {"type": "case", "mode": "sentence"}])[0] == "Hello world foo.TXT"
    assert rename.apply_rules(f, 0, [{"type": "trim"}, {"type": "remove", "first": 6, "last": 4}])[0] == "WORLD.TXT"
    assert rename.apply_rules(f, 4, [{"type": "trim"}, {"type": "number", "start": 10, "step": 5, "digits": 2, "where": "end", "sep": "_"}])[0] == "hello WORLD foo_30.TXT"


def test_recursive_and_filter(tmp_path):
    d = mk(tmp_path / "f", "a.pdf", "b.txt", "发票-1.pdf")
    mk(d / "sub", "发票-2.pdf", ".hidden.pdf", "desktop.ini")
    files = rename.list_files(str(d), recursive=True, filt={"ext": "PDF", "kw": "发票"})
    assert sorted(f["name"] for f in files) == ["发票-1.pdf", "发票-2.pdf"]
    p, r = run_rename(d, [{"type": "insert", "text": "-已报", "where": "end"}], recursive=True, filt={"kw": "发票"})
    assert r["done"] == 2 and ls(d / "sub") == ["desktop.ini", "发票-2-已报.pdf"]


def test_1000_files_speed(tmp_path, capsys):
    d = tmp_path / "big"
    mk(d, *[f"照片 {i}.jpg" for i in range(1000)])
    t0 = time.perf_counter()
    p = rename.plan(str(d), [{"type": "replace", "find": "照片 ", "to": "旅行-"},
                             {"type": "number", "digits": 4, "where": "end", "sep": "-"}])
    t1 = time.perf_counter()
    r = ops.execute(rename.to_ops(p), "rename")
    t2 = time.perf_counter()
    u = ops.undo()
    t3 = time.perf_counter()
    assert r["done"] == 1000 and u["restored"] == 1000
    with capsys.disabled():
        print(f"\n[1000 文件] 预览 {t1-t0:.3f}s 执行 {t2-t1:.3f}s 撤销 {t3-t2:.3f}s")
    assert t2 - t0 < 10


# ------------------------------------------------------------------ 分文件夹
def test_organize_by_type_and_undo(tmp_path):
    d = mk(tmp_path / "f", "a.jpg", "b.PDF", "c.xlsx", "d.unknown", "e.zip")
    mk(d / "图片", "a.jpg", content="已经有一张同名的")
    p = organize.plan(str(d), organize.PRESETS[0])
    r = ops.execute(organize.to_ops(p), "organize")
    assert r["done"] == 5
    assert ls(d) == ["其他", "压缩包", "图片", "文档", "表格"]
    assert ls(d / "图片") == ["a (2).jpg", "a.jpg"] and read(d / "图片" / "a.jpg") == "已经有一张同名的"
    ops.undo()
    assert ls(d) == ["a.jpg", "b.PDF", "c.xlsx", "d.unknown", "e.zip", "图片"]  # 自己建的空文件夹收走，原有的不动


def test_organize_keyword_ext_date_rest(tmp_path):
    d = mk(tmp_path / "f", "发票-滴滴.pdf", "INVOICE 22.pdf", "合同.pdf", "照片.png", "随便.txt")
    os.utime(d / "照片.png", (dt.datetime(2025, 3, 9).timestamp(),) * 2)
    scheme = {"rules": [{"by": "kw", "kw": "发票，invoice", "to": "发票"}, {"by": "ext", "ext": "pdf", "to": "PDF"},
                        {"by": "date", "fmt": "YYYY/MM", "only": "photo"}, {"by": "ext", "ext": "png"}], "rest": ""}
    p = organize.plan(str(d), scheme)
    m = {it["old"]: it["to"] for it in p["items"]}
    assert m == {"发票-滴滴.pdf": "发票", "INVOICE 22.pdf": "发票", "合同.pdf": "PDF", "照片.png": "PNG", "随便.txt": ""}
    scheme["rules"][2]["only"] = ""
    m = {it["old"]: it["to"] for it in organize.plan(str(d), scheme)["items"]}
    assert m["照片.png"] == "2025/03"


def test_scheme_with_rename(tmp_path):
    d = mk(tmp_path / "f", "Scan 1.PDF")
    p = organize.plan(str(d), {"rules": [{"by": "type"}], "rename": [{"type": "case", "mode": "lower"}, {"type": "ext", "mode": "lower"}]})
    ops.execute(organize.to_ops(p), "organize")
    assert ls(d / "文档") == ["scan 1.pdf"]


# ------------------------------------------------------------------ 盯文件夹
def test_watcher_handles_new_files_only(tmp_path):
    d = mk(tmp_path / "dl", "old.pdf")
    w = watch.Watcher(str(d), organize.PRESETS[0], interval=0.05)
    assert w.tick() == []
    mk(d, "new.jpg", "下载中.pdf.crdownload")
    assert w.tick() == []          # 第一眼：登记，还没落稳
    done = w.tick()                # 第二眼：大小没变 → 处理
    assert [(x["old"], x["to"]) for x in done] == [("new.jpg", "图片")]
    assert ls(d) == sorted(["old.pdf", "图片", "下载中.pdf.crdownload"])
    # 下载完改名成正式文件 → 被接住
    os.rename(d / "下载中.pdf.crdownload", d / "下载中.pdf")
    w.tick()
    assert [x["old"] for x in w.tick()] == ["下载中.pdf"]
    assert ls(d / "文档") == ["下载中.pdf"]


def test_watcher_waits_for_growing_file(tmp_path):
    d = mk(tmp_path / "dl")
    w = watch.Watcher(str(d), {"rules": [{"by": "type"}]})
    with open(d / "big.zip", "wb") as f:
        f.write(b"x" * 10)
        f.flush()
        w.tick()
        f.write(b"x" * 10)
        f.flush()
        assert w.tick() == []      # 还在长
    assert len(w.tick()) == 1
    assert ls(d / "压缩包") == ["big.zip"]


def test_watcher_thread_and_inplace_rename(tmp_path):
    d = mk(tmp_path / "w")
    w = watch.Watcher(str(d), {"rules": [], "rename": [{"type": "insert", "text": "收-", "where": "start"}]}, interval=0.05)
    w.start()
    mk(d, "a.txt")
    time.sleep(0.6)
    w.stop()
    assert ls(d) == ["收-a.txt"]   # 改完的新名字不会被再改一次


# ------------------------------------------------------------------ 回收站
def test_trash_never_deletes(tmp_path):
    p = tmp_path / "x.txt"
    p.write_text("hi")
    fs.to_trash(str(p))
    assert not p.exists()
    if fs.IS_WIN:
        return  # Windows 进的是真回收站
    tdir = tmp_path / "_xdg" / "Trash" / "files"
    assert (tdir / "x.txt").read_text() == "hi"


# ------------------------------------------------------------------ 下载
class _H(http.server.BaseHTTPRequestHandler):
    hits: dict = {}
    ranges: list = []
    BODY = bytes(range(256)) * 4096  # 1 MB

    def log_message(self, *a):
        pass

    def do_GET(self):
        p = self.path
        _H.hits[p] = _H.hits.get(p, 0) + 1
        rng = self.headers.get("Range")
        if rng:
            _H.ranges.append((p, rng))
        body = _H.BODY
        if p.startswith("/flaky"):
            if rng:
                start = int(rng.split("=")[1].split("-")[0])
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {start}-{len(body)-1}/{len(body)}")
                self.send_header("Content-Length", str(len(body) - start))
                self.end_headers()
                self.wfile.write(body[start:])
                return
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body[: len(body) // 3])
            self.wfile.flush()
            self.connection.shutdown(2)  # 断网
            return
        if p.startswith("/err500") and _H.hits[p] < 3:
            self.send_error(503)
            return
        if p.startswith("/404"):
            self.send_error(404)
            return
        self.send_response(200)
        if p.startswith("/cd"):
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''%E5%90%88%E5%90%8C%3A%E7%BB%88%E7%89%88.pdf")
        if p.startswith("/noname"):
            self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", "5")
        self.end_headers()
        self.wfile.write(b"hello")


@pytest.fixture
def server():
    _H.hits, _H.ranges = {}, []
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _H)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{s.server_address[1]}"
    s.shutdown()


@pytest.fixture(autouse=True)
def no_proxy(monkeypatch):
    for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("NO_PROXY", "*")


def test_parse_urls():
    t = "合同 https://a.com/x.pdf，还有https://b.com/y?z=1 和 (https://a.com/x.pdf)。\nhttp://c.cn/文件.doc"
    assert download.parse_urls(t) == ["https://a.com/x.pdf", "https://b.com/y?z=1", "http://c.cn/文件.doc"]


def test_normalize_url():
    assert download.normalize_url("https://例子.cn/文件 1.pdf?q=报表") == "https://xn--fsqu00a.cn/%E6%96%87%E4%BB%B6%201.pdf?q=%E6%8A%A5%E8%A1%A8"
    assert download.normalize_url("https://a.com/x%20y.pdf?a=1&b=2") == "https://a.com/x%20y.pdf?a=1&b=2"


def test_batches_in_same_second_undo_in_order(tmp_path):
    d = mk(tmp_path / "f", "a.txt")
    for k in range(5):
        p = rename.plan(str(d), [{"type": "insert", "text": str(k), "where": "end"}])
        ops.execute(rename.to_ops(p), "rename")
    assert ls(d) == ["a01234.txt"]
    for k in range(5):
        ops.undo()
    assert ls(d) == ["a.txt"]


def test_download_chinese_url(server, tmp_path):
    dl = download.Downloader(str(tmp_path / "dl"), backoff=0.05)
    dl.start([server + "/x/中文 文件.txt"])
    assert dl.wait(10) and ls(tmp_path / "dl") == ["中文 文件.txt"]


def test_download_resume_after_disconnect(server, tmp_path):
    d = tmp_path / "dl"
    dl = download.Downloader(str(d), backoff=0.05)
    dl.start([server + "/flaky/big.bin"])
    assert dl.wait(20)
    st = dl.status()
    assert st["done"] == 1, st
    assert (d / "big.bin").read_bytes() == _H.BODY
    assert _H.ranges and _H.ranges[0][1].startswith("bytes=") and _H.ranges[0][1] != "bytes=0-"
    assert not list(d.glob("*.part"))


def test_download_retry_names_and_404(server, tmp_path):
    d = mk(tmp_path / "dl", "a.txt")
    dl = download.Downloader(str(d), backoff=0.05)
    dl.start([server + "/x/a.txt", server + "/y/a.txt", server + "/err500/r.txt",
              server + "/404/nope.txt", server + "/cd/whatever", server + "/noname/"])
    assert dl.wait(20)
    by = {it["url"].split("/")[3]: it for it in dl.status()["items"]}
    assert by["err500"]["state"] == "done" and by["err500"]["tries"] == 3
    assert by["404"]["state"] == "failed" and by["404"]["tries"] == 1
    assert by["cd"]["name"] == "合同：终版.pdf"
    assert by["noname"]["name"] == "download.png"
    assert sorted(ls(d)) == sorted(["a.txt", "a (2).txt", "a (3).txt", "r.txt", "合同：终版.pdf", "download.png"])
    assert read(d / "a.txt") == "a.txt"  # 原文件没被盖


def test_download_naming_custom_and_partial_resume_from_previous_session(server, tmp_path):
    d = tmp_path / "dl"
    os.makedirs(d)
    (d / "big.bin.part").write_bytes(_H.BODY[:1000])  # 上回没下完的残片
    dl = download.Downloader(str(d), backoff=0.05)
    dl.start([server + "/flaky/big.bin"])
    assert dl.wait(20) and (d / "big.bin").read_bytes() == _H.BODY
    assert _H.ranges[0][1] == "bytes=1000-"
    d2 = tmp_path / "dl2"
    dl2 = download.Downloader(str(d2), naming={"mode": "custom", "text": "合同", "digits": 2})
    dl2.start([server + "/p/x.pdf", server + "/p/y.pdf"])
    assert dl2.wait(10)
    assert ls(d2) == ["合同-01.pdf", "合同-02.pdf"]
