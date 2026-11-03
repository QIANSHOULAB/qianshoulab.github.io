"""界面端到端：开发服务器 + 无头 Chromium，真点按钮、真改磁盘。没装 playwright 就跳过。

「下载」用 SAODI_DOWNLOADS 指到临时文件夹（不碰开发机真的下载文件夹）。截图写到 $SAODI_SHOTS（不设就不截）。
"""
from __future__ import annotations

import datetime as dt
import http.server
import os
import shutil
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


class Dev:
    """开发服务器；restart() = 关掉程序再开（第二天）。"""

    def __init__(self, tmp):
        self.tmp = tmp
        self.dl = tmp / "Downloads"
        self.dl.mkdir(exist_ok=True)
        self.proc = None
        self.start()

    def start(self):
        self.port = _port()
        e = dict(os.environ, SAODI_HOME=str(self.tmp / "_home"), SAODI_DOWNLOADS=str(self.dl), NO_PROXY="*", PYTHONIOENCODING="utf-8")
        for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            e.pop(k, None)
        self.proc = subprocess.Popen([sys.executable, "main.py", "--dev", str(self.port)], cwd=APP, env=e,
                                     stdout=subprocess.DEVNULL, stderr=open(os.path.join(str(self.tmp), "dev.err"), "a"))
        for _ in range(100):
            try:
                socket.create_connection(("127.0.0.1", self.port), 0.2).close()
                return
            except OSError:
                time.sleep(0.1)

    def stop(self):
        self.proc.terminate()
        self.proc.wait(10)

    def restart(self):
        self.stop()
        self.start()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}/"


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
    (tmp_path / "Downloads").mkdir()
    for n in ["旧报价.pdf", "旧照片.png", "下载中.zip.crdownload"]:
        (tmp_path / "Downloads" / n).write_text(n)
    dev = Dev(tmp_path)
    yield {"dev": dev, "demo": demo, "tmp": tmp_path}
    dev.stop()


def _shot(page, name):
    d = os.environ.get("SAODI_SHOTS")
    if d:
        page.screenshot(path=os.path.join(d, name + ".png"))


def _open(b, url, errors):
    page = b.new_page(viewport={"width": 1180, "height": 780})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: (errors.append("dialog " + d.message), d.dismiss()))
    page.goto(url)
    page.wait_for_selector("html[data-ready='1']")
    return page


def _folder(page, path, ready):
    if not page.query_selector("#pathIn"):
        page.click("button[data-act='pick']")  # 开发版没有系统对话框：回到选文件夹那页
    page.fill("#pathIn", str(path))
    page.press("#pathIn", "Enter")
    page.wait_for_selector(ready)


def test_full_flow(env):
    dev, demo, tmp = env["dev"], env["demo"], env["tmp"]
    dl = dev.dl

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
    errors = []

    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        page = _open(b, dev.url, errors)
        # 第一次开：开头一句话，「下载」已经盯上；旧的一下分好，能撤
        page.wait_for_selector("#intro")
        assert "旧的 2 个也分了" in page.text_content("#intro")
        _shot(page, "e2e-intro")
        page.click("button[data-act='pilerun']")
        page.wait_for_selector(".toast.show")
        assert sorted(os.listdir(dl)) == sorted(["文档", "图片", "下载中.zip.crdownload"])
        assert not page.query_selector("#intro")
        page.click("#toastAct")  # 撤销
        page.wait_for_function("document.querySelector('#toast').textContent.includes('撤销了')")
        assert sorted(os.listdir(dl)) == sorted(["旧报价.pdf", "旧照片.png", "下载中.zip.crdownload"])
        time.sleep(4.5)  # 撤回来的，盯梢不再分走
        assert "旧报价.pdf" in os.listdir(dl)

        # 改名：替换 + 序号 + 去空格；改完有完成的勾、能撤
        page.click("#nav button[data-v='rename']")
        _folder(page, demo, ".quick")
        page.click(".quick button[data-v='replace']")
        page.fill("input[data-i='0'][data-k='find']", "IMG_")
        page.fill("input[data-i='0'][data-k='to']", "夏天-")
        page.click(".quick button[data-v='number']")
        page.click(".quick button[data-v='trim']")
        page.wait_for_function("document.querySelector('#runBtn') && !document.querySelector('#runBtn').disabled && document.querySelector('#runBtn').textContent.includes('6')")
        _shot(page, "e2e-rename")
        page.click("#runBtn")
        page.wait_for_selector(".done-h .ok")
        names = sorted(os.listdir(demo))
        assert "001-夏天-2041.JPG" in names and "004-Q3 报表 final.xlsx" in names and "006-发票-滴滴 2026-09.pdf" in names, names
        page.click(".done-h button[data-act='undoall']")
        page.wait_for_function("document.querySelector('#toast').textContent.includes('撤销了')")
        assert "IMG_2041.JPG" in os.listdir(demo)

        # 分文件夹：默认按类型，一下分好；记录页整批撤销
        page.click("#nav button[data-v='sort']")
        page.wait_for_selector("#orunBtn:not([disabled])")
        page.click("#orunBtn")
        page.wait_for_selector(".done-h .ok")
        assert sorted(os.listdir(demo)) == sorted(["图片", "文档", "表格", "安装包"])
        page.click("#nav button[data-v='hist']")
        page.click(".row button[data-act='undoid']")
        page.wait_for_function("document.querySelector('.row .u')")
        assert "IMG_2041.JPG" in os.listdir(demo) and "图片" not in os.listdir(demo)
        _shot(page, "e2e-hist")

        # 盯着：新下载落地就分；窗口里一眼看得到、能撤；一下能关
        page.click("#nav button[data-v='watch']")
        part = dl / "报价单.pdf.crdownload"
        part.write_text("x" * 100)
        time.sleep(1)
        os.replace(part, dl / "报价单.pdf")
        page.wait_for_function("document.querySelector('#toast').textContent.includes('报价单.pdf')", timeout=15000)
        assert os.listdir(dl / "文档") == ["报价单.pdf"]
        _shot(page, "e2e-watch")
        page.click("#toastAct")
        page.wait_for_function("document.querySelector('#toast').textContent.includes('撤销了')")
        time.sleep(4.5)
        assert (dl / "报价单.pdf").exists()
        page.click(".row .sw[data-act='wset']")
        page.wait_for_function("document.querySelector(\".row .sw[data-act='wset']\").getAttribute('aria-checked') === 'false'")
        (dl / "关着.pdf").write_text("x")
        time.sleep(4.5)
        assert (dl / "关着.pdf").exists()
        page.click(".row .sw[data-act='wset']")

        # 下载：统一叫「合同」
        dld = tmp / "dl"
        page.click("#nav button[data-v='dl']")
        page.evaluate(f"S.dlFolder = {str(dld)!r}; render()")
        page.fill("#urls", f"合同 {base}/a.pdf ，{base}/b.pdf\n{base}/a.pdf")
        assert "2" in page.text_content("#found")
        page.click(".seg button[data-v='custom']")
        page.fill("#nmText", "合同")
        page.click("#dlGo")
        page.wait_for_function("document.querySelectorAll('.pb.done').length === 2", timeout=15000)
        assert sorted(os.listdir(dld)) == ["合同-01.pdf", "合同-02.pdf"]
        _shot(page, "e2e-dl")
        page.close()

        # 第二天：关程序再开。改法、下载名字、上回在哪页都记得；关着时来的文件补分
        (dl / "昨晚的.pdf").write_text("x")
        dev.restart()
        (demo2 := tmp / "又一堆").mkdir()
        for i in range(3):
            fs.make_jpeg_with_exif(str(demo2 / f"IMG_{3000 + i}.JPG"), dt.datetime(2026, 8, 1 + i))
        page = _open(b, dev.url, errors)
        assert page.evaluate("S.view") == "dl"
        assert page.evaluate("S.naming.mode") == "custom" and page.evaluate("S.naming.text") == "合同"
        for _ in range(40):
            if (dl / "文档" / "昨晚的.pdf").exists():
                break
            time.sleep(0.25)
        assert (dl / "文档" / "昨晚的.pdf").exists(), os.listdir(dl)
        page.click("#nav button[data-v='rename']")
        _folder(page, demo2, ".quick")
        assert page.evaluate("S.rules.length") == 3 and page.evaluate("S.rfrom") == "last"
        page.wait_for_function("document.querySelector('#runBtn') && !document.querySelector('#runBtn').disabled")
        page.click("#runBtn")
        page.wait_for_selector(".done-h .ok")
        assert sorted(os.listdir(demo2)) == ["001-夏天-3000.JPG", "002-夏天-3001.JPG", "003-夏天-3002.JPG"]
        assert not errors, errors
        b.close()
    srv.shutdown()


def test_v02_flow(env, tmp_path):
    from test_v02 import make_mp3
    import zipfile
    music = env["tmp"] / "歌"
    music.mkdir()
    make_mp3(music / "track01.mp3", {"title": "稻香", "artist": "周杰伦", "track": "1"})
    make_mp3(music / "x.mp3", {})
    errors = []
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        page = _open(b, env["dev"].url, errors)
        _folder(page, music, ".quick")
        page.click(".quick button[data-v='music']")
        page.click(".vars button:has-text('音轨')")   # 光标不在框里：加到末尾
        page.wait_for_function("document.querySelector('#tbl').textContent.includes('周杰伦 - 稻香01.mp3')")
        page.fill("input[data-k='tpl']", "{音轨} {歌手} - {标题}")
        page.wait_for_function("document.querySelector('#tbl').textContent.includes('01 周杰伦 - 稻香.mp3')")
        assert "有的信息读不到" in page.text_content("#tbl")
        _shot(page, "e2e-music")
        page.click("#runBtn")
        page.wait_for_selector(".done-h .ok")
        assert sorted(os.listdir(music)) == ["01 周杰伦 - 稻香.mp3", "x.mp3"]
        # 复制 + 解压
        box = env["tmp"] / "收件"
        box.mkdir()
        (box / "合同.pdf").write_text("x")
        with zipfile.ZipFile(box / "照片.zip", "w") as z:
            z.writestr("1.jpg", "x")
        page.click("#nav button[data-v='sort']")
        _folder(page, box, "#orunBtn")
        page.click(".seg button[data-v='copy']")
        page.click(".sw[data-v='unzip']")
        page.wait_for_function("document.querySelector('#orunBtn').textContent.includes('复制 3')")
        _shot(page, "e2e-copy-unzip")
        page.click("#orunBtn")
        page.wait_for_selector(".done-h .ok")
        assert sorted(os.listdir(box)) == sorted(["合同.pdf", "照片.zip", "照片", "文档", "压缩包"])
        # 菜单代替下拉：日期规则换成「拍摄时间」
        page.click("#nav button[data-v='rename']")
        page.click(".quick button[data-v='date']")
        page.click(".rule .pick")
        page.click("#menu button:has-text('拍摄时间')")
        page.wait_for_function("S.rules[S.rules.length - 1].source === 'taken'")
        assert not errors, errors
        b.close()


def test_errors_in_place(env):
    """出错：一句人话 + 怎么办，放在出事的地方；不弹框。"""
    errors = []
    tmp = env["tmp"]
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        page = _open(b, env["dev"].url, errors)
        page.fill("#pathIn", str(tmp / "没有这个文件夹"))
        page.press("#pathIn", "Enter")
        page.wait_for_selector(".err-line")
        assert "找不到" in page.text_content(".err-line") and "拖进来" in page.text_content(".err-line")
        _shot(page, "e2e-nofolder")
        # 文件被占着（Linux 上用 chattr +i 模拟；没有 chattr 就跳过这段）
        box = tmp / "占着"
        box.mkdir()
        for n in ["a.pdf", "b.pdf", "c.png"]:
            (box / n).write_text(n)
        if shutil.which("chattr") and subprocess.run(["chattr", "+i", str(box / "b.pdf")], capture_output=True).returncode == 0:
            try:
                page.click("#nav button[data-v='sort']")
                _folder(page, box, "#orunBtn:not([disabled])")
                page.click("#orunBtn")
                page.wait_for_selector(".fail")
                assert "被别的程序占着" in page.text_content(".fail") and "b.pdf" in page.text_content(".fail")
                _shot(page, "e2e-busy")
                # 松手以后「再试一次」：只做没动成的那个；「撤销」连两批一起撤
                subprocess.run(["chattr", "-i", str(box / "b.pdf")])
                page.click(".fail button[data-act='retry']")
                page.wait_for_function("!document.querySelector('.fail')")
                assert sorted(os.listdir(box / "文档")) == ["a.pdf", "b.pdf"] and os.listdir(box / "图片") == ["c.png"]
                page.click(".done-h button[data-act='undoall']")
                page.wait_for_function("document.querySelector('#toast').textContent.includes('撤销了，3 个')")
                assert sorted(n for n in os.listdir(box)) == ["a.pdf", "b.pdf", "c.png"]
            finally:
                subprocess.run(["chattr", "-i", str(box / "b.pdf")])
        assert not errors, errors
        b.close()
