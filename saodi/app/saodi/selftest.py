"""打包后的 exe 自检（GitHub Actions 的 Windows 机器上跑）：真 NTFS、真文件占用、真回收站、真超长路径。

  SaodiSeng.exe --selftest result.json   → 全过退出码 0
"""
from __future__ import annotations

import datetime as dt
import http.server
import json
import os
import shutil
import tempfile
import threading
import time
import traceback

from . import fsutil as fs, ops, rename, organize, download, watch, VERSION


def _mk(d, *names):
    os.makedirs(fs.lp(d), exist_ok=True)
    for n in names:
        with open(fs.lp(os.path.join(d, n)), "w", encoding="utf-8") as f:
            f.write(n)


def _ls(d):
    return sorted(n for n in os.listdir(fs.lp(d)) if not n.startswith("."))


def run(out_path: str | None = None) -> int:
    root = tempfile.mkdtemp(prefix="saodi-selftest-")
    os.environ["SAODI_HOME"] = os.path.join(root, "_home")
    res = {"version": VERSION, "platform": os.name, "checks": {}, "timing": {}}

    def check(name, fn):
        try:
            fn()
            res["checks"][name] = "ok"
        except Exception:
            res["checks"][name] = "FAIL " + traceback.format_exc()[-800:]

    def t_speed():
        d = os.path.join(root, "big")
        _mk(d, *[f"照片 {i}.jpg" for i in range(1000)])
        t0 = time.perf_counter()
        p = rename.plan(d, [{"type": "replace", "find": "照片 ", "to": "旅行-"}, {"type": "number", "digits": 4, "where": "end"}])
        t1 = time.perf_counter()
        r = ops.execute(rename.to_ops(p), "rename")
        t2 = time.perf_counter()
        u = ops.undo()
        t3 = time.perf_counter()
        assert r["done"] == 1000 and u["restored"] == 1000, (r, u)
        res["timing"] = {"preview_1000": round(t1 - t0, 3), "rename_1000": round(t2 - t1, 3), "undo_1000": round(t3 - t2, 3)}

    def t_case_and_swap():
        d = os.path.join(root, "case")
        _mk(d, "a.txt", "b.txt", "Photo.JPG")
        p = rename.plan(d, [{"type": "replace", "find": "^([ab])$", "to": "X\\1", "regex": True},
                            {"type": "replace", "find": "Xa", "to": "b", "case": True},
                            {"type": "replace", "find": "Xb", "to": "a", "case": True},
                            {"type": "case", "mode": "lower"}, {"type": "ext", "mode": "lower"}])
        ops.execute(rename.to_ops(p), "rename")
        assert _ls(d) == ["a.txt", "b.txt", "photo.jpg"], _ls(d)
        with open(os.path.join(d, "a.txt"), encoding="utf-8") as f:
            assert f.read() == "b.txt"
        ops.undo()
        assert _ls(d) == ["Photo.JPG", "a.txt", "b.txt"], _ls(d)

    def t_long_path():
        d = os.path.join(root, "long")
        for i in range(14):
            d = os.path.join(d, "很长的文件夹名字很长的文件夹名字很长的" + str(i))
        _mk(d, "短.txt")
        assert len(d) > 260
        p = rename.plan(d, [{"type": "insert", "text": "超" * 300, "where": "end"}])
        r = ops.execute(rename.to_ops(p), "rename")
        assert r["done"] == 1, r
        assert ops.undo()["restored"] == 1 and _ls(d) == ["短.txt"]

    def t_busy():
        d = os.path.join(root, "busy")
        _mk(d, "1.txt", "2.txt", "3.txt")
        h = open(os.path.join(d, "2.txt"), "rb")  # Windows 上打开着的文件改不了名
        try:
            p = rename.plan(d, [{"type": "insert", "text": "新-", "where": "start"}])
            r = ops.execute(rename.to_ops(p), "rename")
        finally:
            h.close()
        if os.name == "nt":
            assert r["done"] == 2 and r["failed"] == [{"name": "2.txt", "err": "busy"}], r
        ops.undo()
        assert _ls(d) == ["1.txt", "2.txt", "3.txt"], _ls(d)

    def t_bad_chars():
        d = os.path.join(root, "chars")
        _mk(d, "会议 纪要.txt", "con.txt")
        p = rename.plan(d, [{"type": "replace", "find": " ", "to": ":"}, {"type": "insert", "text": "?", "where": "end"}])
        r = ops.execute(rename.to_ops(p), "rename")
        assert r["done"] == 2 and "会议：纪要？.txt" in _ls(d), _ls(d)

    def t_exif_organize():
        d = os.path.join(root, "org")
        os.makedirs(d)
        fs.make_jpeg_with_exif(os.path.join(d, "IMG_1.JPG"), dt.datetime(2024, 5, 1, 9, 30))
        _mk(d, "合同.pdf", "表.xlsx")
        p = organize.plan(d, organize.PRESETS[2])
        assert [it["to"] for it in p["items"] if it["old"] == "IMG_1.JPG"] == ["2024/2024-05"]
        r = ops.execute(organize.to_ops(organize.plan(d, organize.PRESETS[0])), "organize")
        assert r["done"] == 3 and _ls(d) == sorted(["图片", "文档", "表格"]), _ls(d)
        ops.undo()
        assert _ls(d) == sorted(["IMG_1.JPG", "合同.pdf", "表.xlsx"]), _ls(d)

    def t_trash():
        p = os.path.join(root, "扔我.txt")
        _mk(root, "扔我.txt")
        fs.to_trash(p)
        assert not os.path.exists(p)

    def t_watch():
        d = os.path.join(root, "watch")
        _mk(d, "old.pdf")
        w = watch.Watcher(d, organize.PRESETS[0])
        _mk(d, "new.png")
        w.tick()
        assert [x["to"] for x in w.tick()] == ["图片"]

    def t_download():
        body = os.urandom(600_000)

        class H(http.server.BaseHTTPRequestHandler):
            n = 0

            def log_message(self, *a):
                pass

            def do_GET(self):
                rng = self.headers.get("Range")
                if rng:
                    s = int(rng.split("=")[1].split("-")[0])
                    self.send_response(206)
                    self.send_header("Content-Range", f"bytes {s}-{len(body)-1}/{len(body)}")
                    self.send_header("Content-Length", str(len(body) - s))
                    self.end_headers()
                    self.wfile.write(body[s:])
                    return
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body[:200_000])
                self.wfile.flush()
                self.connection.shutdown(2)

        s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=s.serve_forever, daemon=True).start()
        for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            os.environ.pop(k, None)
        os.environ["NO_PROXY"] = "*"
        d = os.path.join(root, "dl")
        dl = download.Downloader(d, backoff=0.1)
        dl.start([f"http://127.0.0.1:{s.server_address[1]}/文件.bin"])
        assert dl.wait(30), dl.status()
        s.shutdown()
        with open(os.path.join(d, "文件.bin"), "rb") as f:
            assert f.read() == body

    def t_v02():
        import zipfile
        from . import meta, content
        d = os.path.join(root, "v02")
        os.makedirs(d)
        # MP3 ID3v2.3 UTF-16 标签
        def fr(fid, txt):
            body = b"\x01" + txt.encode("utf-16")
            return fid.encode() + len(body).to_bytes(4, "big") + b"\x00\x00" + body
        frames = fr("TIT2", "稻香") + fr("TPE1", "周杰伦")
        n = len(frames)
        tag = b"ID3\x03\x00\x00" + bytes([(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F]) + frames
        with open(os.path.join(d, "t.mp3"), "wb") as f:
            f.write(tag + b"\xff\xfb" + b"\x00" * 200)
        assert meta.audio_tags(os.path.join(d, "t.mp3")) == {"title": "稻香", "artist": "周杰伦"}
        with zipfile.ZipFile(os.path.join(d, "包.zip"), "w") as z:
            z.writestr("里面.txt", "采购合同")
            z.writestr("x.docx", "")
        with zipfile.ZipFile(os.path.join(d, "合同.docx"), "w") as z:
            z.writestr("word/document.xml", "<w:p><w:t>租赁合同</w:t></w:p>")
        assert content.contains(os.path.join(d, "合同.docx"), ["租赁"])
        sch = {"rules": [{"by": "content", "kw": "租赁", "to": "租赁"}, {"by": "type"}], "action": "copy", "unzip": True}
        r = ops.execute(organize.to_ops(organize.plan(d, sch)), "organize")
        assert r["extracted"] == 1 and r["copied"] == 3 and not r["failed"], r
        assert os.path.exists(os.path.join(d, "包", "里面.txt")) and os.path.exists(os.path.join(d, "租赁", "合同.docx"))
        u = ops.undo()
        assert u["restored"] == 4 and not u["skipped"], u
        assert _ls(d) == sorted(["t.mp3", "包.zip", "合同.docx"]), _ls(d)

    for name, fn in [("speed_1000", t_speed), ("case_swap", t_case_and_swap), ("long_path", t_long_path),
                     ("busy_file", t_busy), ("bad_chars", t_bad_chars), ("exif_organize", t_exif_organize),
                     ("recycle_bin", t_trash), ("watch", t_watch), ("download_resume", t_download),
                     ("tags_copy_unzip_content", t_v02)]:
        check(name, fn)
    ok = all(v == "ok" for v in res["checks"].values())
    res["ok"] = ok
    text = json.dumps(res, ensure_ascii=False, indent=1)
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)
    shutil.rmtree(fs.lp(root), ignore_errors=True)
    return 0 if ok else 1
