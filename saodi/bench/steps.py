"""步骤账：Playwright 真点开发服务器（同一套界面 + 真 Python 核心 + 真文件），
把「第一次打开」到「结果到手」每一步记下来，第一次用、第二次用各走一遍，最后对结果。

用法：python steps.py <程序目录 app/> <版本 0.2.1|0.3.0> <输出 json>
  0.2.1 用 git 里的旧版：git archive <提交> saodi | tar -x -C /tmp/old ，程序目录给 /tmp/old/saodi/app

剧本（两版同一套文件、同一个结果）：
  A 整理「下载」：第一次 = 刚装好，「下载」里堆着 40 个乱文件，要按类型分好，以后新下的也自己分；
                  第二次 = 第二天开机，昨天关了程序以后又下了 3 个，要分好；之后再下 1 个，也要分好。
  B 改名：第一次 = 一个文件夹 6 张 IMG_，把 IMG_ 换成「旅行_」；第二次 = 另一个文件夹 5 张，同样改。
  C 批量下载：第一次 = 贴 3 个网址，统一叫「合同」；第二次 = 第二天贴 2 个网址，还叫「合同」。
「双击开程序」「开机」这类在开发服务器里点不了的，记成 manual（照真人算一步），程序这边用重启服务模拟。
选文件夹：真程序是拖进来或系统对话框，这里用路径框（算 1 步）。
"""
from __future__ import annotations

import datetime as dt
import http.server
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "app"))
from saodi import fsutil as fs  # noqa: E402  只用来造带 EXIF 的照片

MESS = ["报价单.pdf", "合同-终版.docx", "IMG_0412.JPG", "IMG_0413.JPG", "截图 2026-10-01.png", "Q3 销售.xlsx", "名单.csv",
        "年会.pptx", "setup.exe", "资料.zip", "歌.mp3", "录屏.mp4", "notes.txt", "发票-滴滴.pdf", "简历.docx",
        "预算 v2.xlsx", "海报.psd", "包.7z", "README.md", "数据.json", "logo.svg", "演示.key", "播客.m4a", "身份证.jpg",
        "说明书.pdf", "周报.docx", "合影.heic", "导出.csv", "安装.msi", "旧照片.png", "无扩展名", "奇怪.xyz",
        "会议纪要.txt", "账单.pdf", "封面.webp", "备份.tar.gz", "表格.ods", "音频.wav", "电影.mkv", "论文.pdf"]
# 不该碰的：下载中、Office 临时、隐藏、系统文件
LEAVE = ["下载中.pdf.crdownload", "大文件.iso.part", "~$周报.docx", ".隐藏", "desktop.ini"]


def port_free():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Sandbox:
    def __init__(self, app, root):
        self.app, self.root = app, root
        self.home = os.path.join(root, "home")
        self.dl = os.path.join(self.home, "Downloads")
        self.saodi_home = os.path.join(root, "saodi_home")
        os.makedirs(self.dl, exist_ok=True)
        self.proc = None
        self.port = None

    def start(self):
        """开程序（0.2.1：开窗口；0.3.0：开机自启 / 开窗口都走这里）。"""
        self.port = port_free()
        env = dict(os.environ, HOME=self.home, USERPROFILE=self.home, SAODI_HOME=self.saodi_home,
                   SAODI_DOWNLOADS=self.dl, NO_PROXY="*", PYTHONIOENCODING="utf-8")
        env.setdefault("SAODI_LANG", "zh")  # 0.4.0 起新装默认英文；步骤账照中文界面记的
        for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            env.pop(k, None)
        self.proc = subprocess.Popen([sys.executable, "main.py", "--dev", str(self.port)], cwd=self.app, env=env,
                                     stdout=subprocess.DEVNULL, stderr=open(os.path.join(self.root, "dev.err"), "a"))
        for _ in range(100):
            try:
                socket.create_connection(("127.0.0.1", self.port), 0.2).close()
                return
            except OSError:
                time.sleep(0.1)
        raise RuntimeError("dev server did not start")

    def stop(self):
        if self.proc:
            self.proc.terminate()
            self.proc.wait(10)
            self.proc = None

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}/"


def fill_mess(d):
    for i, n in enumerate(MESS):
        p = os.path.join(d, n)
        if n.upper().endswith(".JPG"):
            fs.make_jpeg_with_exif(p, dt.datetime(2026, 7, 1 + i, 9, 30))
        else:
            with open(p, "w", encoding="utf-8") as f:
                f.write(n)
    for n in LEAVE:
        with open(os.path.join(d, n), "w", encoding="utf-8") as f:
            f.write("x")


def browser_download(d, name, body=b"%PDF-1.4 fake\n" * 200):
    """像 Chrome 那样下一个文件：先写 .crdownload，写完改名。"""
    tmp = os.path.join(d, name + ".crdownload")
    with open(tmp, "wb") as f:
        f.write(body)
    os.replace(tmp, os.path.join(d, name))


def top_files(d):
    return sorted(n for n in os.listdir(d) if os.path.isfile(os.path.join(d, n)))


def where(d, name):
    for sub, _, files in os.walk(d):
        if name in files:
            return os.path.relpath(os.path.join(sub, name), d)
    return None


def wait_until(fn, timeout=20.0, step=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if fn():
            return True
        time.sleep(step)
    return False


class Ledger:
    def __init__(self, ver):
        self.ver = ver
        self.cases = []
        self.cur = None

    def case(self, key, title):
        self.cur = {"key": key, "title": title, "steps": [], "checks": {}}
        self.cases.append(self.cur)

    def step(self, what, kind="ui", fn=None):
        if fn:
            fn()
        self.cur["steps"].append({"n": len(self.cur["steps"]) + 1, "what": what, "kind": kind})

    def check(self, name, ok, detail=None):
        self.cur["checks"][name] = {"ok": bool(ok), "detail": detail}

    def dump(self):
        for c in self.cases:
            c["count"] = len(c["steps"])
            c["ok"] = all(v["ok"] for v in c["checks"].values())
        return {"version": self.ver, "cases": self.cases}


def url_server():
    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            body = ("file " + self.path).encode() * 50
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def choose_folder(page, path, ready):
    """选文件夹：有路径框就填路径回车（=拖进来 / 对话框里选），已经选着一个就直接换（=点「换一个」在对话框里选）。"""
    if page.query_selector("#pathIn"):
        page.fill("#pathIn", path)
        page.press("#pathIn", "Enter")
    else:
        page.evaluate(f"setFolder({path!r})")
    page.wait_for_selector(ready)


def mk_photos(d, n, start):
    os.makedirs(d, exist_ok=True)
    for i in range(n):
        fs.make_jpeg_with_exif(os.path.join(d, f"IMG_{start + i:04d}.JPG"), dt.datetime(2026, 8, 1 + i, 10, 0))


# ------------------------------------------------------------------ 0.2.1
def play_021(sb, L, page_of, srv_base):
    sorted_ok = lambda: all(where(sb.dl, n) and where(sb.dl, n) != n for n in MESS)  # noqa: E731

    # A 第一次
    L.case("A1", "整理「下载」· 第一次（刚装好）")
    page = None

    def open_app():
        nonlocal page
        sb.start()
        page = page_of(sb.url)
    L.step("双击开程序", "manual", open_app)
    L.step("点左边「盯着」", "ui", lambda: page.click("#nav button[data-v='watch']"))
    L.step("点「盯「下载」文件夹」", "ui", lambda: page.click("button[data-act='wdl']"))
    L.step("打开「现在已经在里面的也分一下」", "ui", lambda: page.check("#wExisting"))
    L.step("点「开始盯」", "ui", lambda: page.click("button[data-act='wstart']"))
    L.check("40 个乱文件按类型分好", wait_until(sorted_ok), top_files(sb.dl))
    L.check("下载中 / 临时 / 隐藏的没动", all(os.path.exists(os.path.join(sb.dl, n)) for n in LEAVE))
    browser_download(sb.dl, "新报价.pdf")
    L.check("之后新下的自己分", wait_until(lambda: where(sb.dl, "新报价.pdf") == os.path.join("文档", "新报价.pdf")),
            where(sb.dl, "新报价.pdf"))

    # B 第一次
    L.case("B1", "改名 · 第一次")
    p1 = os.path.join(sb.root, "旅行1")
    mk_photos(p1, 6, 2041)
    L.step("把窗口叫出来（程序开着）", "manual")
    L.step("点左边「改名」", "ui", lambda: page.click("#nav button[data-v='rename']"))
    L.step("选文件夹「旅行1」", "ui", lambda: choose_folder(page, p1, ".quick"))
    L.step("点「替换文字」", "ui", lambda: page.click(".quick button[data-v='replace']"))
    L.step("打「IMG_」", "type", lambda: page.fill("input[data-i='0'][data-k='find']", "IMG_"))
    L.step("打「旅行_」", "type", lambda: page.fill("input[data-i='0'][data-k='to']", "旅行_"))
    page_wait = lambda: page.wait_for_function("document.querySelector('#runBtn') && document.querySelector('#runBtn').textContent.includes('6')")  # noqa: E731
    L.step("看预览，点「改名 6 个」", "ui", lambda: (page_wait(), page.click("#runBtn"), page.wait_for_selector(".toast.show")))
    L.check("6 个改好", sorted(os.listdir(p1)) == [f"旅行_{2041 + i:04d}.JPG" for i in range(6)], sorted(os.listdir(p1)))

    # C 第一次
    L.case("C1", "批量下载 · 第一次")
    L.step("把窗口叫出来（程序开着）", "manual")
    L.step("点左边「下载」", "ui", lambda: page.click("#nav button[data-v='dl']"))
    L.step("贴 3 个网址", "type", lambda: page.fill("#urls", f"{srv_base}/a.pdf\n{srv_base}/b.pdf\n{srv_base}/c.pdf"))
    L.step("点「统一叫」", "ui", lambda: page.click(".seg button[data-v='custom']"))
    L.step("打「合同」", "type", lambda: page.fill("#nmText", "合同"))
    L.step("点「下载 3 个」", "ui", lambda: page.click("#dlGo"))
    got = lambda: sorted(n for n in ("合同-01.pdf", "合同-02.pdf", "合同-03.pdf") if where(sb.dl, n))  # noqa: E731
    L.check("3 个下好、叫「合同-0N」", wait_until(lambda: len(got()) == 3), got())

    # ---- 第二天：关程序，昨天关了以后又下了 3 个
    page.context.close()
    sb.stop()
    for n in ["昨晚的发票.pdf", "昨晚的照片.png", "昨晚的表.xlsx"]:
        browser_download(sb.dl, n)

    L.case("A2", "整理「下载」· 第二次（第二天开机，昨晚关程序后又下了 3 个）")
    L.step("双击开程序", "manual", open_app)
    L.step("点左边「分文件夹」", "ui", lambda: page.click("#nav button[data-v='sort']"))
    L.step("选文件夹「下载」", "ui", lambda: choose_folder(page, sb.dl, "#orunBtn:not([disabled])"))
    L.step("点「分好 3 个文件」", "ui", lambda: (page.click("#orunBtn"), page.wait_for_selector(".toast.show")))
    three = ["昨晚的发票.pdf", "昨晚的照片.png", "昨晚的表.xlsx"]
    L.check("昨晚那 3 个分好", all(where(sb.dl, n) and where(sb.dl, n) != n for n in three), [where(sb.dl, n) for n in three])
    browser_download(sb.dl, "今天的.pdf")
    L.check("之后新下的自己分", wait_until(lambda: where(sb.dl, "今天的.pdf") == os.path.join("文档", "今天的.pdf")),
            where(sb.dl, "今天的.pdf"))

    L.case("B2", "改名 · 第二次（另一个文件夹，同样的改法）")
    p2 = os.path.join(sb.root, "旅行2")
    mk_photos(p2, 5, 3001)
    L.step("把窗口叫出来（程序开着）", "manual")
    L.step("点左边「改名」", "ui", lambda: page.click("#nav button[data-v='rename']"))
    L.step("换文件夹「旅行2」（真程序：点「换一个」在对话框里选，或直接拖进来）", "ui", lambda: choose_folder(page, p2, ".quick"))
    L.step("点「替换文字」", "ui", lambda: page.click(".quick button[data-v='replace']"))
    L.step("打「IMG_」", "type", lambda: page.fill("input[data-i='0'][data-k='find']", "IMG_"))
    L.step("打「旅行_」", "type", lambda: page.fill("input[data-i='0'][data-k='to']", "旅行_"))
    L.step("看预览，点「改名 5 个」", "ui", lambda: (page.wait_for_function("document.querySelector('#runBtn').textContent.includes('5')"),
                                                page.click("#runBtn"), page.wait_for_selector(".toast.show")))
    L.check("5 个改好", sorted(os.listdir(p2)) == [f"旅行_{3001 + i:04d}.JPG" for i in range(5)], sorted(os.listdir(p2)))

    L.case("C2", "批量下载 · 第二次（还叫「合同」）")
    L.step("把窗口叫出来（程序开着）", "manual")
    L.step("点左边「下载」", "ui", lambda: page.click("#nav button[data-v='dl']"))
    L.step("贴 2 个网址", "type", lambda: page.fill("#urls", f"{srv_base}/d.pdf\n{srv_base}/e.pdf"))
    L.step("点「统一叫」", "ui", lambda: page.click(".seg button[data-v='custom']"))
    L.step("打「合同」", "type", lambda: page.fill("#nmText", "合同"))
    L.step("点「下载 2 个」", "ui", lambda: page.click("#dlGo"))
    L.check("2 个下好、叫「合同」", wait_until(lambda: len([1 for sub, _, fl in os.walk(sb.dl) for f in fl if f.startswith("合同-0")]) == 5))
    return page


# ------------------------------------------------------------------ 0.3.0
def play_030(sb, L, page_of, srv_base):
    sorted_ok = lambda: all(where(sb.dl, n) and where(sb.dl, n) != n for n in MESS)  # noqa: E731
    page = None

    def open_app():
        nonlocal page
        sb.start()
        page = page_of(sb.url)

    L.case("A1", "整理「下载」· 第一次（刚装好）")
    L.step("双击开程序", "manual", open_app)
    L.check("开头一句话：「下载」交给贫僧了（一下能关）", page.query_selector("#intro .sw") is not None, page.text_content("#intro"))
    L.step("顶上那句话里点「旧的 40 个也分了」", "ui", lambda: (page.click("button[data-act='pilerun']"), page.wait_for_selector(".toast.show")))
    L.check("40 个乱文件按类型分好", wait_until(sorted_ok), top_files(sb.dl))
    L.check("下载中 / 临时 / 隐藏的没动", all(os.path.exists(os.path.join(sb.dl, n)) for n in LEAVE))
    L.check("刚分的能整批撤销（提示条上就有「撤销」）", page.query_selector("#toastAct") is not None)
    browser_download(sb.dl, "新报价.pdf")
    L.check("之后新下的自己分", wait_until(lambda: where(sb.dl, "新报价.pdf") == os.path.join("文档", "新报价.pdf")),
            where(sb.dl, "新报价.pdf"))

    L.case("B1", "改名 · 第一次")
    p1 = os.path.join(sb.root, "旅行1")
    mk_photos(p1, 6, 2041)
    L.step("把窗口叫出来（程序开着）", "manual")
    L.step("选文件夹「旅行1」", "ui", lambda: choose_folder(page, p1, ".quick"))
    L.step("点「替换文字」", "ui", lambda: page.click(".quick button[data-v='replace']"))
    L.step("打「IMG_」", "type", lambda: page.fill("input[data-i='0'][data-k='find']", "IMG_"))
    L.step("打「旅行_」", "type", lambda: page.fill("input[data-i='0'][data-k='to']", "旅行_"))
    L.step("看预览，点「改名 6 个」", "ui", lambda: (page.wait_for_function("document.querySelector('#runBtn') && document.querySelector('#runBtn').textContent.includes('6')"),
                                                page.click("#runBtn"), page.wait_for_selector(".done-h .ok")))
    L.check("6 个改好", sorted(os.listdir(p1)) == [f"旅行_{2041 + i:04d}.JPG" for i in range(6)], sorted(os.listdir(p1)))

    L.case("C1", "批量下载 · 第一次")
    L.step("把窗口叫出来（程序开着）", "manual")
    L.step("点左边「下载」", "ui", lambda: page.click("#nav button[data-v='dl']"))
    L.step("贴 3 个网址", "type", lambda: page.fill("#urls", f"{srv_base}/a.pdf\n{srv_base}/b.pdf\n{srv_base}/c.pdf"))
    L.step("点「统一叫」", "ui", lambda: page.click(".seg button[data-v='custom']"))
    L.step("打「合同」", "type", lambda: page.fill("#nmText", "合同"))
    L.step("点「下载 3 个」", "ui", lambda: page.click("#dlGo"))
    got = lambda: sorted(n for n in ("合同-01.pdf", "合同-02.pdf", "合同-03.pdf") if where(sb.dl, n))  # noqa: E731
    L.check("3 个下好、叫「合同-0N」", wait_until(lambda: len(got()) == 3), got())

    # ---- 第二天：关机；昨天关了以后又下了 3 个；开机戒尺僧自己起来（开机自启，进托盘，不开窗）
    page.context.close()
    sb.stop()
    three = ["昨晚的发票.pdf", "昨晚的照片.png", "昨晚的表.xlsx"]
    for n in three:
        browser_download(sb.dl, n)

    L.case("A2", "整理「下载」· 第二次（第二天开机，昨晚关程序后又下了 3 个）")
    sb.start()  # = 开机自启：只起后台，不开窗口、不点任何东西
    L.check("昨晚那 3 个分好（开机自己补分）", wait_until(lambda: all(where(sb.dl, n) and where(sb.dl, n) != n for n in three)),
            [where(sb.dl, n) for n in three])
    browser_download(sb.dl, "今天的.pdf")
    L.check("之后新下的自己分", wait_until(lambda: where(sb.dl, "今天的.pdf") == os.path.join("文档", "今天的.pdf")),
            where(sb.dl, "今天的.pdf"))

    L.case("B2", "改名 · 第二次（另一个文件夹，同样的改法）")
    p2 = os.path.join(sb.root, "旅行2")
    mk_photos(p2, 5, 3001)

    def open_window():
        nonlocal page
        page = page_of(sb.url)
    L.step("点托盘图标把窗口叫出来", "manual", open_window)
    L.step("点左边「改名」", "ui", lambda: page.click("#nav button[data-v='rename']"))
    L.step("选文件夹「旅行2」（真程序：拖进来或对话框里选）", "ui", lambda: choose_folder(page, p2, ".quick"))
    L.check("上回的改法自己回来了", page.evaluate("S.rules.length === 1 && S.rules[0].find === 'IMG_' && S.rfrom === 'last'"))
    L.step("看预览，点「改名 5 个」", "ui", lambda: (page.wait_for_function("document.querySelector('#runBtn') && document.querySelector('#runBtn').textContent.includes('5')"),
                                                page.click("#runBtn"), page.wait_for_selector(".done-h .ok")))
    L.check("5 个改好", sorted(os.listdir(p2)) == [f"旅行_{3001 + i:04d}.JPG" for i in range(5)], sorted(os.listdir(p2)))

    L.case("C2", "批量下载 · 第二次（还叫「合同」）")
    L.step("把窗口叫出来（程序开着）", "manual")
    L.step("点左边「下载」", "ui", lambda: page.click("#nav button[data-v='dl']"))
    L.check("文件名规矩记得：统一叫「合同」", page.evaluate("S.naming.mode === 'custom' && S.naming.text === '合同'"))
    L.step("贴 2 个网址", "type", lambda: page.fill("#urls", f"{srv_base}/d.pdf\n{srv_base}/e.pdf"))
    L.step("点「下载 2 个」", "ui", lambda: page.click("#dlGo"))
    L.check("2 个下好、叫「合同」", wait_until(lambda: len([1 for sub, _, fl in os.walk(sb.dl) for f in fl if f.startswith("合同-0")]) == 5))
    return page


def main():
    app, ver, out = sys.argv[1], sys.argv[2], sys.argv[3]
    root = tempfile.mkdtemp(prefix=f"saodi-steps-{ver}-")
    sb = Sandbox(os.path.abspath(app), root)
    fill_mess(sb.dl)
    srv, base = url_server()
    L = Ledger(ver)
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()

        def page_of(url):
            ctx = b.new_context(viewport={"width": 1120, "height": 760})
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.on("dialog", lambda d: errors.append("dialog: " + d.message) or d.dismiss())
            pg.goto(url)
            pg.wait_for_selector("html[data-ready='1']")
            return pg

        play = {"0.2.1": play_021, "0.3.0": play_030}[ver]
        try:
            play(sb, L, page_of, base)
        finally:
            b.close()
            sb.stop()
            srv.shutdown()
    res = L.dump()
    res["page_errors"] = errors
    with open(out, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    for c in res["cases"]:
        print(f'{c["key"]} {c["title"]}: {c["count"]} 步, 结果 {"对" if c["ok"] else "不对"}',
              {k: v["ok"] for k, v in c["checks"].items()})
    print("page errors:", errors)
    shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    main()
