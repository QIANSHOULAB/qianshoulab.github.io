"""界面端到端：开发服务器 + 无头 Chromium，真点按钮、真改磁盘。没装 playwright 就跳过。

截图写到 $SAODI_SHOTS（不设就不截）。
"""
from __future__ import annotations

import datetime as dt
import http.server
import os
import socket
import subprocess
import sys
import threading
import time

import pytest

pw = pytest.importorskip("playwright.sync_api")
APP = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, APP)
from saodi import fsutil as fs  # noqa: E402


def _port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


@pytest.fixture
def env(tmp_path):
    demo = tmp_path / "乱七八糟"
    demo.mkdir()
    for i, n in enumerate(["IMG_2041.JPG", "IMG_2042.JPG", "发票-滴滴  2026-09.pdf", "Q3 报表 final.xlsx", "setup.exe", "notes.txt"]):
        p = demo / n
        if n.startswith("IMG"):
            fs.make_jpeg_with_exif(str(p), dt.datetime(2026, 7, 1 + i, 9, 30))
        else:
            p.write_text(n)
    port = _port()
    e = dict(os.environ, SAODI_HOME=str(tmp_path / "_home"), NO_PROXY="*", PYTHONIOENCODING="utf-8")
    for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        e.pop(k, None)
    proc = subprocess.Popen([sys.executable, "main.py", "--dev", str(port)], cwd=APP, env=e,
                            stdout=subprocess.DEVNULL, stderr=open(os.path.join(str(tmp_path), "dev.err"), "w"))
    for _ in range(50):
        try:
            socket.create_connection(("127.0.0.1", port), 0.2).close()
            break
        except OSError:
            time.sleep(0.1)
    yield {"url": f"http://127.0.0.1:{port}/", "demo": demo, "tmp": tmp_path}
    proc.terminate()


def _shot(page, name):
    d = os.environ.get("SAODI_SHOTS")
    if d:
        page.screenshot(path=os.path.join(d, name + ".png"))


def test_full_flow(env):
    demo = env["demo"]
    # 下载用的本地小服务器
    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Length", "3")
            self.end_headers()
            self.wfile.write(b"abc")

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"

    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": 1120, "height": 760})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(env["url"])
        page.wait_for_selector("html[data-ready='1']")
        page.fill("#pathIn", str(demo))
        page.press("#pathIn", "Enter")
        try:
            page.wait_for_selector(".quick", timeout=5000)
        except Exception:
            print("ERR", open(os.path.join(str(env["tmp"]), "dev.err")).read(), errors, page.evaluate("api.check_folder(document.querySelector('#pathIn').value).then(JSON.stringify)"), page.evaluate("JSON.stringify([S.folder, S.view])"), page.text_content("#toast"))
            raise
        # 改名：替换 + 序号 + 去空格
        page.click(".quick button:has-text('替换文字')")
        page.fill("input[data-i='0'][data-k='find']", "IMG_")
        page.fill("input[data-i='0'][data-k='to']", "夏天-")
        page.click(".quick button:has-text('加序号')")
        page.click(".quick button:has-text('去多余空格')")
        page.wait_for_selector("#runBtn:not([disabled])")
        page.wait_for_function("document.querySelector('#runBtn').textContent.includes('6')")
        _shot(page, "e2e-rename")
        page.click("#runBtn")
        page.wait_for_selector(".toast.show")
        names = sorted(os.listdir(demo))
        assert "001-夏天-2041.JPG" in names and "004-Q3 报表 final.xlsx" in names and "006-发票-滴滴 2026-09.pdf" in names, names
        page.click("#toastAct")  # 撤销
        page.wait_for_function("document.querySelector('#toast').textContent.includes('撤销')")
        assert "IMG_2041.JPG" in os.listdir(demo)
        # 分文件夹
        page.click("#nav button[data-v='sort']")
        page.wait_for_selector("#orunBtn:not([disabled])")
        page.click("#orunBtn")
        page.wait_for_selector(".toast.show")
        assert sorted(os.listdir(demo)) == sorted(["图片", "文档", "表格", "安装包"])
        # 记录页整批撤销
        page.click("#nav button[data-v='hist']")
        page.click(".hrow button[data-act='undoid']")
        page.wait_for_function("document.querySelector('.hrow .u')")
        assert "IMG_2041.JPG" in os.listdir(demo) and "图片" not in os.listdir(demo)
        _shot(page, "e2e-hist")
        # 盯着
        inbox = env["tmp"] / "inbox"
        inbox.mkdir()
        page.click("#nav button[data-v='watch']")
        page.evaluate(f"S.wFolder = {str(inbox)!r}; render()")
        page.click("button[data-act='wstart']")
        page.wait_for_selector(".wc-h .st")
        (inbox / "报价.pdf").write_text("x")
        page.wait_for_selector(".log .to", timeout=15000)
        assert os.listdir(inbox / "文档") == ["报价.pdf"]
        _shot(page, "e2e-watch")
        page.click("button[data-act='wstop']")
        # 下载
        dl = env["tmp"] / "dl"
        page.click("#nav button[data-v='dl']")
        page.evaluate(f"S.dlFolder = {str(dl)!r}; render()")
        page.fill("#urls", f"合同 {base}/a.pdf ，{base}/b.pdf\n{base}/a.pdf")
        assert "2" in page.text_content("#found")
        page.click(".seg button:has-text('统一叫')")
        page.fill("#nmText", "合同")
        page.click("#dlGo")
        page.wait_for_function("document.querySelectorAll('.dl .s.done').length === 2", timeout=15000)
        assert sorted(os.listdir(dl)) == ["合同-01.pdf", "合同-02.pdf"]
        _shot(page, "e2e-dl")
        assert not errors, errors
        b.close()
    srv.shutdown()
