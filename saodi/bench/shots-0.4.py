"""0.4.0 交货截图（四轮：中英两套）：程序窗口 × 英文、中文 × 空状态、干活中、结果、出错（浅色），外加改名预览（浅、深，
介绍页产品图 img/app-*.webp 和 img/en/app-*.webp 从这两张出）、分文件夹、盯着、最小窗口 900×600；介绍页 390 / 1280 × 英文、中文。
每一张都量一遍排版：按钮、分段、标签、菜单不许被截、不许挤成两行，控件不许撑出框，页面不许横向滚动（结果写 layout-check.json）。
界面是开发服务器 + 无头 Chromium 画的同一个页面（exe 里是 WebView2 画它），文件是真文件。语言照真用户：新装默认英文，中文是点左下角切的。

用法：python shots-0.4.py [输出目录，默认 saodi/bench/shots-0.4]
要 root（「出错」那张用 chattr +i 模拟被占着）。
"""
from __future__ import annotations

import datetime as dt
import functools
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
SAODI = os.path.join(HERE, "..")
APP = os.path.join(SAODI, "app")
sys.path.insert(0, APP)
from saodi import fsutil as fs, organize, text  # noqa: E402

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "shots-0.4"))
os.makedirs(OUT, exist_ok=True)
W, H = 1180, 780
ERR = []
LAYOUT = {}

# 截图里的人家文件：英文用户的文件名就是英文的（用户的文件名不翻，这里是换一家人）
DATA = {
    "en": {
        "user": "Sam", "dl": "Downloads", "desk": "Desktop", "trip": "Kyoto trip", "busy": "Project files", "got": "Contracts",
        "pile": ["quote-2026Q4.pdf", "lease (final).docx", "IMG_0412.JPG", "Screenshot 2026-10-01 at 10.21.png", "Q3 sales.xlsx",
                 "guest list.csv", "offsite rehearsal.mp4", "setup-x64.exe", "assets.zip", "podcast ep 12.m4a", "resume - Alex Chen.pdf",
                 "receipt-uber.pdf", "manual.pdf", "passport scan.jpg", "weekly report 10-27.docx", "budget v2.xlsx", "poster FINAL.psd",
                 "export.csv", "pitch.pptx", "backup.tar.gz", "half-done.zip.crdownload", "~$weekly report 10-27.docx"],
        "extra": ["IMG_4045 (1).JPG", "Screenshot_20260405-213344.png", "itinerary .pdf", "VID_20260404_181207.mp4"],
        "to": "Kyoto-",
        "busy_files": ["spec.docx", "quote.xlsx", "budget.xlsx", "site photo.jpg", "contract scan.pdf", "meeting.m4a", "logo.png", "handover.pdf"],
        "locked": ["quote.xlsx", "budget.xlsx"],
        "urls": ["purchase-agreement-east.pdf", "slow/purchase-agreement-west.pdf", "big/purchase-agreement-north.pdf",
                 "slow/big/framework.pdf", "annex-1-pricing.pdf", "slow/annex-2-list.pdf"],
        "pre": "From the client:\n", "post": "\nPlease review today.",
        "later": ["receipt-doordash.pdf", "IMG_7781.HEIC", "quarterly review.pptx"],
    },
    "zh": {
        "user": "Song", "dl": "下载", "desk": "桌面", "trip": "京都旅行", "busy": "项目资料", "got": "合同",
        "pile": ["报价单-2026Q4.pdf", "合同（终版）.docx", "IMG_0412.JPG", "截图 2026-10-01 10.21.png", "Q3 销售.xlsx",
                 "名单.csv", "年会彩排.mp4", "setup-x64.exe", "资料.zip", "播客 第 12 期.m4a", "简历-张三.pdf", "发票-滴滴.pdf",
                 "说明书.pdf", "身份证正反面.jpg", "周报 10-27.docx", "预算 v2.xlsx", "海报终稿.psd", "导出.csv", "演示.pptx",
                 "备份.tar.gz", "下载中.zip.crdownload", "~$周报 10-27.docx"],
        "extra": ["IMG_4045 (1).JPG", "Screenshot_20260405-213344.png", "行程单 .pdf", "VID_20260404_181207.mp4"],
        "to": "京都-",
        "busy_files": ["需求说明.docx", "报价.xlsx", "预算.xlsx", "现场照片.jpg", "合同扫描件.pdf", "会议录音.m4a", "logo.png", "交付清单.pdf"],
        "locked": ["报价.xlsx", "预算.xlsx"],
        "urls": ["采购合同-华东.pdf", "slow/采购合同-华南.pdf", "big/采购合同-华北.pdf", "slow/big/框架协议.pdf", "附件一-报价.pdf", "slow/附件二-清单.pdf"],
        "pre": "客户发来的：\n", "post": "\n麻烦今天看完。",
        "later": ["发票-美团.pdf", "IMG_7781.HEIC", "季度汇报.pptx"],
    },
}

# 排版量一遍：按钮、分段、标签、菜单、标题不许被截、不许两行；控件不许撑出框；页面不许横向滚动
CHECK_JS = r"""() => {
  const bad = [];
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.opacity !== "0"; };
  const lines = el => {
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const tops = []; let n;
    while ((n = tw.nextNode())) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width > 1) tops.push(r.top); }
    tops.sort((a, b) => a - b); let c = tops.length ? 1 : 0; for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > 8) c++; return c;
  };
  const name = el => (el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 48);
  const one = "button, .btn, .seg button, .tag, .k-chip, .quick button, .lang button, .head h1, .pick span, .upd b, .intro b, .done-h b, .menu button, .group-h, .lbl, .f > .k, .grp-h b, .nav button > span:not(.end), .brand b, .brand span, .stat, .rule-h b, .vars button, .row .t";
  for (const el of document.querySelectorAll(one)) {
    if (!vis(el) || el.closest(".toast:not(.show)")) continue;
    if (el.matches(".row, .grp-h, .sw, .ib, .recipes .rc button, .pick, .lang button::after")) continue;
    if (!name(el)) continue;
    if (!el.matches(".sel") && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible") bad.push("cut: " + name(el));  // .sel 是文件名、路径，省略是故意的
    if (lines(el) > 1) bad.push("2 lines: " + name(el));
  }
  for (const el of document.querySelectorAll(".rule, .f, .row, .bar, .intro, .head, .seg, .group, .done-h, .fail, .quick, .lang, .side-foot, .acts, .go-row")) {
    if (!vis(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "auto") bad.push("spills: " + el.className + " · " + name(el).slice(0, 30));
  }
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth) bad.push("page scrolls sideways by " + (de.scrollWidth - de.clientWidth) + "px");
  return [...new Set(bad)];
}"""


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
    def __init__(self, root, lang):
        self.root, self.lang, self.d = root, lang, DATA[lang]
        self.home = os.path.join(root, "home")
        self.user = os.path.join(root, "Users", self.d["user"])  # 路径尾巴读着像人的：…/Users/Sam/Desktop/Kyoto trip
        self.dl = os.path.join(self.user, self.d["dl"])
        os.makedirs(self.dl, exist_ok=True)

    def start(self):
        self.port = port_free()
        env = dict(os.environ, SAODI_HOME=self.home, SAODI_DOWNLOADS=self.dl, NO_PROXY="*", PYTHONIOENCODING="utf-8")
        for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "SAODI_LANG"):
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
    class Hd(http.server.BaseHTTPRequestHandler):
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

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Hd)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def page_for(b, url, scheme, lang, w=W, h=H):
    ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, device_scale_factor=1)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: ERR.append(f"{lang} {scheme} {e}"))
    pg.on("console", lambda m: ERR.append(f"{lang} console {m.text}") if m.type == "error" else None)
    pg.on("dialog", lambda d: (ERR.append("dialog " + d.message), d.dismiss()))
    pg.goto(url)
    pg.wait_for_selector("html[data-ready='1']")
    if pg.evaluate("LANG") != lang:
        pg.click(f".lang button[data-v='{lang}']")
        pg.wait_for_selector(f"html[lang='{text.Tl(lang, 'html_lang')}']")
        pg.wait_for_timeout(300)
    return pg


def shot(pg, name, full=False):
    pg.wait_for_timeout(350)
    LAYOUT[name] = pg.evaluate(CHECK_JS)
    pg.screenshot(path=os.path.join(OUT, name + ".png"), full_page=full)


def choose(pg, path, ready):
    if not pg.query_selector("#pathIn"):
        pg.click("button[data-act='pick']")
    pg.fill("#pathIn", path)
    pg.press("#pathIn", "Enter")
    pg.wait_for_selector(ready)


def run_lang(lang: str, root: str, b, srv):
    dev = Dev(os.path.join(root, lang), lang)
    d = dev.d
    for n in d["pile"]:
        write(os.path.join(dev.dl, n), n)
    trip = os.path.join(dev.user, d["desk"], d["trip"])
    photos(trip, 4021, 24)
    for n in d["extra"]:
        write(os.path.join(trip, n), n)
    dev.start()
    url = f"http://127.0.0.1:{dev.port}/"
    P = f"{lang}-"

    # 1 空状态：第一次打开（开头那句话 + 把文件夹拖进来 / 用示例试试）
    pg = page_for(b, url, "light", lang)
    pg.wait_for_selector("#intro")
    shot(pg, P + "1-empty")
    pg.click("button[data-act='introok']")
    pg.context.close()

    # 改名预览（浅、深；介绍页产品图用这两张）+ 3 结果
    for scheme in ("light", "dark"):
        pg = page_for(b, url, scheme, lang)
        pg.click("#nav button[data-v='rename']")
        choose(pg, trip, ".quick")
        if not pg.query_selector(".rule"):
            pg.click(".quick button[data-v='replace']")
            pg.fill("input[data-i='0'][data-k='find']", "IMG_")
            pg.fill("input[data-i='0'][data-k='to']", d["to"])
            pg.click(".quick button[data-v='taken']")
            pg.click(".seg[role='group'] button[data-key='where'][data-i='1'][data-v='start']")
        pg.wait_for_function("document.querySelector('#runBtn') && !document.querySelector('#runBtn').disabled")
        pg.wait_for_timeout(300)
        shot(pg, f"{P}x-rename-{scheme}")
        if scheme == "light":
            pg.click("#runBtn")
            pg.wait_for_selector(".done-h .ok")
            pg.wait_for_timeout(600)
            pg.evaluate("document.querySelector('#toast').classList.remove('show')")
            shot(pg, P + "3-result")
            pg.click(".done-h button[data-act='undoall']")
            pg.wait_for_selector(".toast.show")
        pg.context.close()

    # 分文件夹预览（「下载」那一摊）
    pg = page_for(b, url, "light", lang)
    pg.click("#nav button[data-v='sort']")
    choose(pg, dev.dl, "#orunBtn:not([disabled])")
    pg.click(f".grp-h[data-v='{organize.type_dir('.pdf', lang)}']")
    shot(pg, P + "x-sort")

    # 4 出错：两个文件被占着（chattr +i 模拟），一句人话 + 怎么办 + 再试一次
    busy = os.path.join(dev.user, d["desk"], d["busy"])
    for n in d["busy_files"]:
        write(os.path.join(busy, n), n)
    locked = [os.path.join(busy, n) for n in d["locked"]]
    for p in locked:
        subprocess.run(["chattr", "+i", p], check=True)
    try:
        choose(pg, busy, "#orunBtn:not([disabled])")
        pg.click("#orunBtn")
        pg.wait_for_selector(".fail")
        pg.wait_for_timeout(600)
        pg.evaluate("document.querySelector('#toast').classList.remove('show')")
        shot(pg, P + "4-error")
    finally:
        for p in locked:
            subprocess.run(["chattr", "-i", p])
    pg.context.close()

    # 2 干活中：批量下载，进度条走在半路
    got = os.path.join(dev.user, d["desk"], d["got"])
    os.makedirs(got, exist_ok=True)
    pg = page_for(b, url, "light", lang)
    pg.click("#nav button[data-v='dl']")
    pg.evaluate(f"S.dlFolder = {got!r}; render()")
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    pg.fill("#urls", d["pre"] + "\n".join(f"{base}/files/{n}" for n in d["urls"]) + d["post"])
    pg.click("#dlGo")
    pg.wait_for_timeout(1400)
    shot(pg, P + "2-working")
    pg.click("button[data-act='dcancel']")
    pg.context.close()

    # 盯着：刚才分的
    for n in d["later"]:
        p = os.path.join(dev.dl, n + ".crdownload")
        write(p, n * 20)
        os.replace(p, os.path.join(dev.dl, n))
        time.sleep(1.2)
    pg = page_for(b, url, "light", lang)
    pg.click("#nav button[data-v='watch']")
    last = os.path.join(dev.dl, organize.type_dir(".pptx", lang), d["later"][-1])
    for _ in range(40):
        if os.path.exists(last):
            break
        time.sleep(0.25)
    pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('#toast').classList.remove('show')")
    shot(pg, P + "x-watch")
    pg.context.close()

    # 最小窗口 900×600：改名页规则卡片最挤的时候
    pg = page_for(b, url, "light", lang, 900, 600)
    pg.click("#nav button[data-v='rename']")
    choose(pg, trip, ".quick")
    pg.click("button[data-act='rclear']") if pg.query_selector("button[data-act='rclear']") else None
    for q in ("number", "date", "remove"):
        pg.click(f".quick button[data-v='{q}']")
    pg.wait_for_function("document.querySelector('#runBtn') && !document.querySelector('#runBtn').disabled")
    shot(pg, P + "x-min-900x600")
    pg.evaluate("document.querySelector('.pane-l .scroll').scrollTop = 1e6")
    shot(pg, P + "x-min-900x600-bottom")
    pg.context.close()
    dev.stop()


def webp(src, dst):
    from PIL import Image
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    Image.open(src).convert("RGB").save(dst, "WEBP", quality=88, method=6)


def intro_shots(b):
    for lang, d in (("zh", "img"), ("en", os.path.join("img", "en"))):
        for scheme in ("light", "dark"):
            webp(os.path.join(OUT, f"{lang}-x-rename-{scheme}.png"), os.path.join(SAODI, d, f"app-{scheme}.webp"))

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=SAODI))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
    for lang in ("en", "zh"):
        for w, h, scheme in ((390, 844, "light"), (1280, 800, "light"), (1280, 800, "dark")):
            ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, device_scale_factor=2 if w == 390 else 1)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: ERR.append(f"intro {e}"))
            bad = []
            pg.on("response", lambda r: bad.append(r.url) if r.status >= 400 else None)
            pg.goto(base)
            pg.wait_for_load_state("networkidle")
            assert pg.evaluate("LANG") == "en"  # 默认英文
            if lang == "zh":  # 右上角切中文；再开一次还是中文（记住了）
                pg.click(".lang button[data-l='zh']")
                pg.goto(base)
                pg.wait_for_load_state("networkidle")
                assert pg.get_attribute("html", "lang") == "zh-CN", "intro lang not remembered"
            name = f"{lang}-intro-{w}" + ("" if scheme == "light" else "-dark")
            imgs = pg.evaluate("[...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src)")
            if imgs or bad:
                ERR.append(f"intro {name}: broken {imgs} {bad}")
            meta = {"title": pg.title(), "desc": pg.get_attribute("meta[name=description]", "content"), "lang": pg.get_attribute("html", "lang")}
            lay = pg.evaluate(r"""() => {
              const bad = []; const de = document.documentElement;
              if (de.scrollWidth > de.clientWidth) bad.push("page scrolls sideways by " + (de.scrollWidth - de.clientWidth) + "px");
              for (const el of document.querySelectorAll("nav .dl, .btn, .lang button, nav .back, .n b, .s h3, .f h3")) {
                const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const tops = new Set(); let n;
                while ((n = tw.nextNode())) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width > 1) tops.add(Math.round(r.top / 10)); }
                if (tops.size > 1) bad.push("2 lines: " + el.textContent.trim().slice(0, 40));
                const r = el.getBoundingClientRect(); if (r.right > de.clientWidth + 1) bad.push("off screen: " + el.textContent.trim().slice(0, 40));
              }
              const nav = document.querySelector("nav .wrap"); if (nav.scrollWidth > nav.clientWidth + 1) bad.push("nav spills");
              return bad;
            }""")
            LAYOUT[name] = lay + [f"meta {json.dumps(meta, ensure_ascii=False)}"]
            pg.screenshot(path=os.path.join(OUT, name + ".png"), full_page=True)
            ctx.close()
    srv.shutdown()


def main():
    root = tempfile.mkdtemp(prefix="saodi-shots-")
    srv = slow_server()
    with sync_playwright() as p:
        b = p.chromium.launch()
        for lang in ("en", "zh"):
            run_lang(lang, root, b, srv)
        intro_shots(b)
        b.close()
    srv.shutdown()
    shutil.rmtree(root, ignore_errors=True)
    with open(os.path.join(OUT, "layout-check.json"), "w", encoding="utf-8") as f:
        json.dump(LAYOUT, f, ensure_ascii=False, indent=1)
    probs = {k: [x for x in v if not x.startswith("meta ")] for k, v in LAYOUT.items()}
    print("shots ->", OUT, len(os.listdir(OUT)))
    print("layout problems:", {k: v for k, v in probs.items() if v} or "none")
    print("errors:", ERR or "none")


if __name__ == "__main__":
    main()
