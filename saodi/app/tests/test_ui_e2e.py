"""界面端到端：开发服务器 + 无头 Chromium，真点按钮、真改磁盘。没装 playwright 就跳过。

「下载」用 SAODI_DOWNLOADS 指到临时文件夹（不碰开发机真的下载文件夹）。截图写到 $SAODI_SHOTS（不设就不截）。
0.4.0：英文、中文各跑一遍。都从新用户（默认英文）开始；中文那遍一开就点左下角「中文」，「第二天」重开还得是中文。
"""
from __future__ import annotations

import datetime as dt
import http.server
import os
import re
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
from saodi import fsutil as fs, organize, text  # noqa: E402

LANGS = ["en", "zh"]


def L(lang, key, **kw):
    return text.Tl(lang, key, **kw)


def D(lang, ext):
    """按类型分进哪个文件夹（跟着界面语言）。"""
    return organize.type_dir(ext, lang)


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
        for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "SAODI_LANG"):  # 语言照真用户：新装的默认英文
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


@pytest.fixture(params=LANGS)
def env(tmp_path, request):
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
    yield {"dev": dev, "demo": demo, "tmp": tmp_path, "lang": request.param}
    dev.stop()


def _shot(page, name):
    d = os.environ.get("SAODI_SHOTS")
    if d:
        page.screenshot(path=os.path.join(d, name + ".png"))


def _open(b, url, errors, lang=None):
    page = b.new_page(viewport={"width": 1180, "height": 780})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append("console " + m.text) if m.type == "error" else None)
    page.on("dialog", lambda d: (errors.append("dialog " + d.message), d.dismiss()))
    page.goto(url)
    page.wait_for_selector("html[data-ready='1']")
    if lang and page.evaluate("LANG") != lang:  # 左下角 EN / 中文
        page.click(f".lang button[data-v='{lang}']")
        page.wait_for_selector(f"html[lang='{L(lang, 'html_lang')}']")
        page.wait_for_function(f"document.querySelector('#nav').textContent.includes({L(lang, 'nav_sort')!r})")
    return page


def _toast_has(page, s, timeout=15000):
    page.wait_for_function(f"document.querySelector('#toast').textContent.includes({s!r})", timeout=timeout)


def _folder(page, path, ready):
    if not page.query_selector("#pathIn"):
        page.click("button[data-act='pick']")  # 开发版没有系统对话框：回到选文件夹那页
    page.fill("#pathIn", str(path))
    page.press("#pathIn", "Enter")
    page.wait_for_selector(ready)


def test_full_flow(env):
    dev, demo, tmp, lang = env["dev"], env["demo"], env["tmp"], env["lang"]
    dl = dev.dl
    undone = re.split(r"[.，,]", L(lang, "undone", n=1))[0]  # Undone / 撤销了

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
        assert page.evaluate("LANG") == "en" and page.get_attribute("html", "lang") == "en"  # 新装的默认英文
        if lang == "zh":
            page.close()
            page = _open(b, dev.url, errors, lang)
        # 第一次开：开头一句话，「下载」已经盯上；旧的一下分好，能撤
        page.wait_for_selector("#intro")
        assert L(lang, "intro_pile", n=2) in page.text_content("#intro")
        _shot(page, f"e2e-{lang}-intro")
        page.click("button[data-act='pilerun']")
        page.wait_for_selector(".toast.show")
        assert sorted(os.listdir(dl)) == sorted([D(lang, ".pdf"), D(lang, ".png"), "下载中.zip.crdownload"])
        assert not page.query_selector("#intro")
        page.click("#toastAct")  # 撤销
        _toast_has(page, undone)
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
        assert page.text_content("#runBtn").strip() == L(lang, "run_rename", n=6)
        _shot(page, f"e2e-{lang}-rename")
        page.click("#runBtn")
        page.wait_for_selector(".done-h .ok")
        assert L(lang, "done_rename", n=6) in page.text_content(".done-h")
        names = sorted(os.listdir(demo))
        assert "001-夏天-2041.JPG" in names and "004-Q3 报表 final.xlsx" in names and "006-发票-滴滴 2026-09.pdf" in names, names  # 文件名照原样，不翻
        page.click(".done-h button[data-act='undoall']")
        _toast_has(page, undone)
        assert "IMG_2041.JPG" in os.listdir(demo)

        # 分文件夹：默认按类型，一下分好；记录页整批撤销
        page.click("#nav button[data-v='sort']")
        page.wait_for_selector("#orunBtn:not([disabled])")
        assert page.text_content(".row[data-act='scheme'] .t") == L(lang, "p_type")
        page.click("#orunBtn")
        page.wait_for_selector(".done-h .ok")
        assert sorted(os.listdir(demo)) == sorted([D(lang, e) for e in (".jpg", ".pdf", ".xlsx", ".exe")])
        page.click("#nav button[data-v='hist']")
        page.wait_for_selector(".row button[data-act='undoid']")
        assert L(lang, "p_type") in page.text_content(".group")  # 记录里分法的名字跟着语言
        page.click(".row button[data-act='undoid']")
        page.wait_for_function("document.querySelector('.row .u')")
        assert "IMG_2041.JPG" in os.listdir(demo) and D(lang, ".jpg") not in os.listdir(demo)
        _shot(page, f"e2e-{lang}-hist")

        # 盯着：新下载落地就分；窗口里一眼看得到、能撤；一下能关
        page.click("#nav button[data-v='watch']")
        part = dl / "报价单.pdf.crdownload"
        part.write_text("x" * 100)
        time.sleep(1)
        os.replace(part, dl / "报价单.pdf")
        _toast_has(page, "报价单.pdf → " + D(lang, ".pdf"))
        assert os.listdir(dl / D(lang, ".pdf")) == ["报价单.pdf"]
        _shot(page, f"e2e-{lang}-watch")
        page.click("#toastAct")
        _toast_has(page, undone)
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
        assert page.text_content("#dlGo").strip() == L(lang, "d_go", n=2)
        page.fill("#nmText", "合同")
        page.click("#dlGo")
        page.wait_for_function("document.querySelectorAll('.pb.done').length === 2", timeout=15000)
        assert sorted(os.listdir(dld)) == ["合同-01.pdf", "合同-02.pdf"]
        _shot(page, f"e2e-{lang}-dl")
        page.close()

        # 第二天：关程序再开。改法、下载名字、上回在哪页都记得；关着时来的文件补分
        (dl / "昨晚的.pdf").write_text("x")
        dev.restart()
        (demo2 := tmp / "又一堆").mkdir()
        for i in range(3):
            fs.make_jpeg_with_exif(str(demo2 / f"IMG_{3000 + i}.JPG"), dt.datetime(2026, 8, 1 + i))
        page = _open(b, dev.url, errors)
        assert page.evaluate("LANG") == lang and page.get_attribute("html", "lang") == L(lang, "html_lang")  # 选过的语言记住了
        assert page.evaluate("S.view") == "dl"
        assert page.evaluate("S.naming.mode") == "custom" and page.evaluate("S.naming.text") == "合同"
        for _ in range(40):
            if (dl / D(lang, ".pdf") / "昨晚的.pdf").exists():
                break
            time.sleep(0.25)
        assert (dl / D(lang, ".pdf") / "昨晚的.pdf").exists(), os.listdir(dl)
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
    lang = env["lang"]
    music = env["tmp"] / "歌"
    music.mkdir()
    make_mp3(music / "track01.mp3", {"title": "稻香", "artist": "周杰伦", "track": "1"})
    make_mp3(music / "x.mp3", {})
    errors = []
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        page = _open(b, env["dev"].url, errors, lang)
        _folder(page, music, ".quick")
        page.click(".quick button[data-v='music']")
        track = L(lang, "tpl_vars").split(",")[11]  # 音轨 / track
        page.click(f".vars button:text-is('{track}')")   # 光标不在框里：加到末尾
        page.wait_for_function("document.querySelector('#tbl').textContent.includes('周杰伦 - 稻香01.mp3')")
        page.fill("input[data-k='tpl']", "{%s} %s" % (track, L(lang, "tpl_music")))
        page.wait_for_function("document.querySelector('#tbl').textContent.includes('01 周杰伦 - 稻香.mp3')")
        assert L(lang, "n_nometa") in page.text_content("#tbl")
        _shot(page, f"e2e-{lang}-music")
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
        page.wait_for_function(f"document.querySelector('#orunBtn').textContent.includes({L(lang, 'run_copy', n=3)!r})")
        _shot(page, f"e2e-{lang}-copy-unzip")
        page.click("#orunBtn")
        page.wait_for_selector(".done-h .ok")
        assert sorted(os.listdir(box)) == sorted(["合同.pdf", "照片.zip", "照片", D(lang, ".pdf"), D(lang, ".zip")])
        # 菜单代替下拉：日期规则换成「拍摄时间」
        page.click("#nav button[data-v='rename']")
        page.click(".quick button[data-v='date']")
        page.click(".rule .pick")
        page.click(f"#menu button:has-text({L(lang, 's_taken')!r})")
        page.wait_for_function("S.rules[S.rules.length - 1].source === 'taken'")
        assert not errors, errors
        b.close()


def test_errors_in_place(env):
    """出错：一句人话 + 怎么办，放在出事的地方；不弹框。"""
    errors = []
    tmp, lang = env["tmp"], env["lang"]
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        page = _open(b, env["dev"].url, errors, lang)
        page.fill("#pathIn", str(tmp / "没有这个文件夹"))
        page.press("#pathIn", "Enter")
        page.wait_for_selector(".err-line")
        assert page.text_content(".err-line") == L(lang, "nofolder") + L(lang, "nofolder_fix")
        _shot(page, f"e2e-{lang}-nofolder")
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
                assert L(lang, "fail_head", n=1) + L(lang, "err_busy") in page.text_content(".fail") and "b.pdf" in page.text_content(".fail")
                _shot(page, f"e2e-{lang}-busy")
                # 松手以后「再试一次」：只做没动成的那个；「撤销」连两批一起撤
                subprocess.run(["chattr", "-i", str(box / "b.pdf")])
                page.click(".fail button[data-act='retry']")
                page.wait_for_function("!document.querySelector('.fail')")
                assert sorted(os.listdir(box / D(lang, ".pdf"))) == ["a.pdf", "b.pdf"] and os.listdir(box / D(lang, ".png")) == ["c.png"]
                page.click(".done-h button[data-act='undoall']")
                _toast_has(page, L(lang, "undone", n=3))
                assert sorted(n for n in os.listdir(box)) == ["a.pdf", "b.pdf", "c.png"]
            finally:
                subprocess.run(["chattr", "-i", str(box / "b.pdf")])
        assert not errors, errors
        b.close()
