"""0.2.1 精加工：断线立刻续传、没拍摄时间默认不动、默认格式。"""
from __future__ import annotations

import datetime as dt
import http.server
import os
import sys
import threading
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from saodi import fsutil as fs, ops, rename, organize, download  # noqa: E402
from test_core import mk, ls  # noqa: E402


@pytest.fixture(autouse=True)
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("SAODI_HOME", str(tmp_path / "_home"))
    for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("NO_PROXY", "*")


BODY = os.urandom(300_000)


class _Drop(http.server.BaseHTTPRequestHandler):
    """前 3 次：第 1 次给一半就断，第 2、3 次回了响应头一个字节不给就断；之后正常。都支持 Range。"""
    protocol_version = "HTTP/1.1"
    hits: list = []

    def log_message(self, *a):
        pass

    def do_GET(self):
        rng = self.headers.get("Range", "")
        _Drop.hits.append(rng)
        start = int(rng[6:].split("-")[0]) if rng.startswith("bytes=") else 0
        self.send_response(206 if start else 200)
        if start:
            self.send_header("Content-Range", f"bytes {start}-{len(BODY) - 1}/{len(BODY)}")
        self.send_header("Content-Length", str(len(BODY) - start))
        self.end_headers()
        k = len(_Drop.hits)
        if k <= 3:
            if k == 1:
                self.wfile.write(BODY[:len(BODY) // 2])
                self.wfile.flush()
            self.close_connection = True
            try:
                self.connection.shutdown(2)
            except OSError:
                pass
            return
        self.wfile.write(BODY[start:])


def test_download_cut_resumes_immediately(tmp_path):
    _Drop.hits = []
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Drop)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    try:
        d = tmp_path / "dl"
        dl = download.Downloader(str(d), backoff=(5, 5, 5, 5))  # 断线续传应该一下都不等：等过一次就超 5 s
        t0 = time.perf_counter()
        dl.start([f"http://127.0.0.1:{s.server_address[1]}/x.bin"])
        assert dl.wait(10)
        el = time.perf_counter() - t0
    finally:
        s.shutdown()
    assert (d / "x.bin").read_bytes() == BODY
    assert _Drop.hits[1] == f"bytes={len(BODY) // 2}-"  # 半截落了盘，接着续
    assert el < 3, el
    assert dl.status()["items"][0]["state"] == "done"


def test_dead_server_still_gives_up(tmp_path):
    dl = download.Downloader(str(tmp_path / "dl"), backoff=0.01)
    dl.start(["http://127.0.0.1:9/nothing.bin"])  # 没人听的端口（Windows 上每次拒连要 2 s 左右）
    assert dl.wait(60)
    it = dl.status()["items"][0]
    assert it["state"] == "failed" and it["tries"] == 5


def _photos(d):
    fs.make_jpeg_with_exif(str(d / "a.jpg"), dt.datetime(2024, 5, 31, 23, 59, 59))
    mk(d, "截图.png", content="png")
    mk(d, "坏.jpg", content="not a jpeg")
    for n in ("截图.png", "坏.jpg"):
        os.utime(d / n, (dt.datetime(2026, 11, 1).timestamp(),) * 2)


def test_organize_taken_skips_no_exif_by_default(tmp_path):
    d = mk(tmp_path / "f")
    _photos(d)
    scheme = organize.PRESETS[2]
    assert scheme["name"] == "照片按拍摄月份"
    ops.execute(organize.to_ops(organize.plan(str(d), scheme)), "organize")
    assert sorted(ls(d)) == ["2024", "坏.jpg", "截图.png"]
    assert ls(d / "2024" / "2024-05") == ["a.jpg"]
    ops.undo()
    fb = {**scheme, "rules": [dict(scheme["rules"][0], fallback=True)]}
    ops.execute(organize.to_ops(organize.plan(str(d), fb)), "organize")
    assert ls(d / "2026" / "2026-11") == ["坏.jpg"]  # png 不算照片（only: photo），照旧不动


def test_taken_default_format_first():
    assert list(rename.DATE_FORMATS)[0] == "YYYYMMDD_hhmmss"
    f = {"name": "x.jpg", "mtime": 0, "ctime": 0, "path": "", "rel": "", "_taken": dt.datetime(2024, 5, 1, 8, 0, 0)}
    assert rename.apply_rules(f, 0, [{"type": "date", "source": "taken", "fmt": "YYYYMMDD_hhmmss", "where": "name"}])[0] == "20240501_080000.jpg"
