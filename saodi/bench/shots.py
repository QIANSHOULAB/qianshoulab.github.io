"""0.3.0 交货截图（照 _ops/设计规范.md 最后一节）：电脑程序窗口 × 浅深 × 空状态、干活中、结果、出错 共 8 张，
外加几张 x- 开头的（盯着、改名预览、分文件夹预览、最小窗口），介绍页 390 / 1280 × 浅深，能开 apple.com 就截两张参照。
界面是开发服务器 + 无头 Chromium 画的同一个页面（exe 里是 WebView2 画它），文件是真文件。

用法：python shots.py <输出目录，默认 saodi/bench/shots-0.3>
要 root（「出错」那张用 chattr +i 模拟被占着）。介绍页的产品图 img/app-*.webp 也从这里出。
"""
from __future__ import annotations

import datetime as dt
import functools
import http.server
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
SAODI = os.path.join(HERE, "..")
APP = os.path.join(SAODI, "app")
sys.path.insert(0, APP)
from saodi import fsutil as fs  # noqa: E402

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "shots-0.3"))
os.makedirs(OUT, exist_ok=True)
W, H = 1180, 780
ERR = []


def port_free():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def write(p, data="x"):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(data)


def photos(d, start, n, when=dt.datetime(2026, 4, 3, 9, 12)):
    os.makedirs(d, exist_ok=True)
    for i in range(n):
        fs.make_jpeg_with_exif(os.path.join(d, f"IMG_{start + i}.JPG"), when + dt.timedelta(hours=7 * i), "iPhone 15 Pro")


class Dev:
    def __init__(self, root):
        self.root = root
        self.home = os.path.join(root, "home")
        self.user = os.path.join(root, "Song")  # 截图里路径尾巴读着像人的：…/Song/桌面/京都旅行
        self.dl = os.path.join(self.user, "下载")
        os.makedirs(self.dl, exist_ok=True)
        self.proc = None

    def start(self):
        self.port = port_free()
        env = dict(os.environ, SAODI_HOME=self.home, SAODI_DOWNLOADS=self.dl, NO_PROXY="*", PYTHONIOENCODING="utf-8")
        for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            env.pop(k, None)
        self.proc = subprocess.Popen([sys.executable, "main.py", "--dev", str(self.port)], cwd=APP, env=env,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                socket.create_connection(("127.0.0.1", self.port), 0.2).close()
                return
            except OSError:
                time.sleep(0.1)

    def stop(self):
        self.proc.terminate()
        self.proc.wait(10)


def slow_server():
    """干活中那张：每个文件慢慢给，进度条停在半路。"""
    class H(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def do_GET(self):
            size = 6_000_000 if "big" in self.path else 2_500_000
            self.send_response(200)
            self.send_header("Content-Length", str(size))
            self.send_header("Content-Type", "application/pdf")
            self.end_headers()
            sent, chunk = 0, b"%" * 65536
            rate = 0.06 if "slow" in self.path else 0.012
            try:
                while sent < size:
                    n = min(len(chunk), size - sent)
                    self.wfile.write(chunk[:n])
                    sent += n
                    time.sleep(rate)
            except OSError:
                pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def page_for(b, url, scheme, w=W, h=H):
    ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, device_scale_factor=1)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: ERR.append(f"{scheme} {e}"))
    pg.on("dialog", lambda d: (ERR.append("dialog " + d.message), d.dismiss()))
    pg.goto(url)
    pg.wait_for_selector("html[data-ready='1']")
    return pg


def shot(pg, name):
    pg.wait_for_timeout(350)
    pg.screenshot(path=os.path.join(OUT, name + ".png"))


def choose(pg, path, ready):
    if not pg.query_selector("#pathIn"):
        pg.click("button[data-act='pick']")
    pg.fill("#pathIn", path)
    pg.press("#pathIn", "Enter")
    pg.wait_for_selector(ready)


def run_scheme(scheme: str, root: str, b, srv):
    dev = Dev(os.path.join(root, scheme))
    # 「下载」里堆着一摊
    for n in ["报价单-2026Q4.pdf", "合同（终版）.docx", "IMG_0412.JPG", "截图 2026-10-01 10.21.png", "Q3 销售.xlsx",
              "名单.csv", "年会彩排.mp4", "setup-x64.exe", "资料.zip", "播客 第 12 期.m4a", "简历-张三.pdf", "发票-滴滴.pdf",
              "说明书.pdf", "身份证正反面.jpg", "周报 10-27.docx", "预算 v2.xlsx", "海报终稿.psd", "导出.csv", "演示.pptx",
              "备份.tar.gz", "下载中.zip.crdownload", "~$周报 10-27.docx"]:
        write(os.path.join(dev.dl, n), n)
    # 京都那次的照片
    trip = os.path.join(dev.user, "桌面", "京都旅行")
    photos(trip, 4021, 24)
    for n in ["IMG_4045 (1).JPG", "Screenshot_20260405-213344.png", "行程单 .pdf", "VID_20260404_181207.mp4"]:
        write(os.path.join(trip, n), n)
    dev.start()
    url = f"http://127.0.0.1:{dev.port}/"

    # 1 空状态：第一次打开（开头那句话 + 把文件夹拖进来 / 用示例试试）
    pg = page_for(b, url, scheme)
    pg.wait_for_selector("#intro")
    shot(pg, f"1-empty-{scheme}")
    pg.click("button[data-act='introok']")
    pg.context.close()

    # x 改名预览（介绍页产品图用这张）
    pg = page_for(b, url, scheme)
    choose(pg, trip, ".quick")
    pg.click(".quick button[data-v='replace']")
    pg.fill("input[data-i='0'][data-k='find']", "IMG_")
    pg.fill("input[data-i='0'][data-k='to']", "京都-")
    pg.click(".quick button[data-v='taken']")
    pg.click(".seg[role='group'] button[data-key='where'][data-i='1'][data-v='start']")
    pg.wait_for_function("document.querySelector('#runBtn') && !document.querySelector('#runBtn').disabled")
    shot(pg, f"x-rename-{scheme}")

    # 3 结果：改名改完（完成的勾、改了啥、撤销）
    pg.click("#runBtn")
    pg.wait_for_selector(".done-h .ok")
    pg.wait_for_timeout(600)
    pg.evaluate("document.querySelector('#toast').classList.remove('show')")
    shot(pg, f"3-result-{scheme}")
    pg.click(".done-h button[data-act='undoall']")
    pg.wait_for_function("document.querySelector('#toast').textContent.includes('撤销了')")
    pg.context.close()

    # x 分文件夹预览（「下载」那一摊，开关显示「盯着呢」）
    pg = page_for(b, url, scheme)
    pg.click("#nav button[data-v='sort']")
    choose(pg, dev.dl, "#orunBtn:not([disabled])")
    pg.click(".grp-h[data-v='文档']")
    shot(pg, f"x-sort-{scheme}")

    # 4 出错：两个文件被占着（chattr +i 模拟），一句人话 + 怎么办 + 再试一次
    busy = os.path.join(dev.user, "桌面", "项目资料")
    for n in ["需求说明.docx", "报价.xlsx", "预算.xlsx", "现场照片.jpg", "合同扫描件.pdf", "会议录音.m4a", "logo.png", "交付清单.pdf"]:
        write(os.path.join(busy, n), n)
    locked = [os.path.join(busy, "报价.xlsx"), os.path.join(busy, "预算.xlsx")]
    for p in locked:
        subprocess.run(["chattr", "+i", p], check=True)
    try:
        choose(pg, busy, "#orunBtn:not([disabled])")
        pg.click("#orunBtn")
        pg.wait_for_selector(".fail")
        pg.wait_for_timeout(600)
        pg.evaluate("document.querySelector('#toast').classList.remove('show')")
        shot(pg, f"4-error-{scheme}")
    finally:
        for p in locked:
            subprocess.run(["chattr", "-i", p])
    pg.context.close()

    # 2 干活中：批量下载，进度条走在半路；顺手「下载」里来了个新文件被自动分走（盯着页的料）
    got = os.path.join(dev.user, "桌面", "合同")
    os.makedirs(got, exist_ok=True)
    pg = page_for(b, url, scheme)
    pg.click("#nav button[data-v='dl']")
    pg.evaluate(f"S.dlFolder = {got!r}; render()")
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    urls = "\n".join(f"{base}/files/{n}" for n in ["采购合同-华东.pdf", "slow/采购合同-华南.pdf", "big/采购合同-华北.pdf",
                                                    "slow/big/框架协议.pdf", "附件一-报价.pdf", "slow/附件二-清单.pdf"])
    pg.fill("#urls", "客户发来的：\n" + urls + "\n麻烦今天看完。")
    pg.click("#dlGo")
    pg.wait_for_timeout(1400)
    shot(pg, f"2-working-{scheme}")
    pg.click("button[data-act='dcancel']")
    pg.context.close()

    # x 盯着：刚才分的、撤销过的
    for n in ["发票-美团.pdf", "IMG_7781.HEIC", "季度汇报.pptx"]:
        p = os.path.join(dev.dl, n + ".crdownload")
        write(p, n * 20)
        os.replace(p, os.path.join(dev.dl, n))
        time.sleep(1.2)
    pg = page_for(b, url, scheme)
    pg.click("#nav button[data-v='watch']")
    for _ in range(40):
        if os.path.exists(os.path.join(dev.dl, "演示", "季度汇报.pptx")):
            break
        time.sleep(0.25)
    pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('#toast').classList.remove('show')")
    shot(pg, f"x-watch-{scheme}")
    pg.context.close()

    if scheme == "light":  # 最小窗口
        pg = page_for(b, url, scheme, 900, 600)
        pg.click("#nav button[data-v='rename']")
        choose(pg, trip, ".quick")
        pg.click(".quick button[data-v='number']")
        pg.wait_for_function("document.querySelector('#runBtn') && !document.querySelector('#runBtn').disabled")
        shot(pg, "x-min-900x600-light")
        pg.context.close()
    dev.stop()


def webp(src, dst):
    from PIL import Image
    Image.open(src).convert("RGB").save(dst, "WEBP", quality=88, method=6)


def intro_shots(b):
    os.makedirs(os.path.join(SAODI, "img"), exist_ok=True)
    webp(os.path.join(OUT, "x-rename-light.png"), os.path.join(SAODI, "img", "app-light.webp"))
    webp(os.path.join(OUT, "x-rename-dark.png"), os.path.join(SAODI, "img", "app-dark.webp"))
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=SAODI))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
    for w, h in ((390, 844), (1280, 800)):
        for scheme in ("light", "dark"):
            ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, device_scale_factor=2 if w == 390 else 1)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: ERR.append(f"intro {e}"))
            bad = []
            pg.on("response", lambda r: bad.append(r.url) if r.status >= 400 and "version.json" not in r.url else None)
            pg.goto(url)
            pg.wait_for_load_state("networkidle")
            over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            imgs = pg.evaluate("[...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src)")
            if over > 0 or imgs or bad:
                ERR.append(f"intro {w} {scheme}: overflow {over}px, broken {imgs} {bad}")
            pg.screenshot(path=os.path.join(OUT, f"intro-{w}-{scheme}.png"), full_page=True)
            ctx.close()
    srv.shutdown()


def apple_refs(b):
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    for url, name, w, h in (("https://www.apple.com/macos/", "ref-apple-macos-1280", 1280, 800),
                            ("https://www.apple.com/iphone/", "ref-apple-iphone-390", 390, 844)):
        try:
            br = b
            ctx = br.new_context(viewport={"width": w, "height": h}, **({"proxy": {"server": proxy}} if proxy else {}))
            pg = ctx.new_page()
            pg.goto(url, timeout=30000)
            pg.wait_for_timeout(2500)
            pg.screenshot(path=os.path.join(OUT, name + ".png"))
            ctx.close()
            print("apple ok", name)
        except Exception as e:  # noqa: BLE001
            print("apple.com 打不开：", name, str(e).splitlines()[0][:160])


def main():
    root = tempfile.mkdtemp(prefix="saodi-shots-")
    srv = slow_server()
    with sync_playwright() as p:
        b = p.chromium.launch()
        for scheme in ("light", "dark"):
            run_scheme(scheme, root, b, srv)
        intro_shots(b)
        apple_refs(b)
        b.close()
    srv.shutdown()
    shutil.rmtree(root, ignore_errors=True)
    print("shots ->", OUT, sorted(os.listdir(OUT)))
    print("errors:", ERR)


if __name__ == "__main__":
    main()
