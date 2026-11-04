"""0.4.1：左下角「提意见」。点了 → Python 拼好 mailto（收件人、标题、三行提示、最后一行「版本 · 系统 · 程序」）
→ 交给系统默认的邮件程序（Windows 上 os.startfile）。CI 的 Windows 机器上没有邮件程序，真拉起测不了：
这里把「打开」换成记一笔，核对生成的 mailto 字符串对、确实调了打开的那个函数。Linux 和 Windows CI 都跑（界面那几条要 Playwright，CI 跳过）。"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import urllib.request
from collections import namedtuple
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from saodi import VERSION, feedback as FB, text  # noqa: E402

UI = os.path.join(os.path.dirname(__file__), "..", "ui")
SITE = os.path.join(os.path.dirname(__file__), "..", "..")
WV = namedtuple("WV", "major minor build platform service_pack product_type")
SUBJ = {"en": "[QIANSHOU feedback] Jiechi · File Sweeper ", "zh": "[千手院反馈] 戒尺僧 "}


def parse(url):
    head, q = url.split("?", 1)
    p = dict(kv.split("=", 1) for kv in q.split("&"))
    return unquote(head[len("mailto:"):]), unquote(p["subject"]), unquote(p["body"])


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("SAODI_HOME", str(tmp_path / "_home"))
    monkeypatch.setenv("SAODI_DOWNLOADS", str(tmp_path / "Downloads"))
    monkeypatch.delenv("SAODI_LANG", raising=False)
    (tmp_path / "Downloads").mkdir()
    text.load(UI)
    yield tmp_path
    text.set_lang("zh")    # 老测试照中文写（核心单独用时默认中文）


@pytest.fixture
def opened(monkeypatch):
    """不真开邮件程序：os.startfile / webbrowser.open 换成记一笔。"""
    calls = []
    monkeypatch.setattr(FB.os, "startfile", lambda u: calls.append(("startfile", u)), raising=False)
    monkeypatch.setattr(FB.webbrowser, "open", lambda u, *a, **k: calls.append(("webbrowser", u)) or True)
    return calls


def test_feedback_strings_both_languages():
    text.load(UI)
    for k in ("fb_line", "fb_btn", "fb_subject", "fb_q1", "fb_q2", "fb_q3", "fb_nomail", "up_notes"):
        assert text.Tl("en", k) != k and text.Tl("zh", k) != k, k
    assert text.Tl("en", "fb_btn") == "Feedback" and text.Tl("zh", "fb_btn") == "提意见"   # 按钮照直写
    assert text.Tl("en", "fb_subject", v="0.4.1") == SUBJ["en"] + "0.4.1"
    assert text.Tl("zh", "fb_subject", v="0.4.1") == SUBJ["zh"] + "0.4.1"


@pytest.mark.parametrize("lang", ["en", "zh"])
def test_feedback_builds_mailto_and_opens_it(home, opened, lang):
    from saodi.api import Api
    api = Api()
    api.boot(auto_downloads=False)
    api.set_lang(lang)
    res = api.feedback()
    url = res["url"]
    assert res["ok"] and res["to"] == "oilsongchengmin@gmail.com"
    # 真调了打开的函数，Windows 上走 os.startfile（ShellExecute 找 mailto 的默认程序）
    assert opened == [("startfile" if sys.platform == "win32" else "webbrowser", url)]
    # 网址里全是转过码的 ASCII：中文不乱码，空格是 %20 不是 +，换行 %0D%0A
    assert url.isascii() and " " not in url and "+" not in url and "%0D%0A" in url
    to, subj, body = parse(url)
    assert to == "oilsongchengmin@gmail.com" and subj == SUBJ[lang] + VERSION
    lines = body.split("\r\n")
    assert lines[:5] == [text.Tl(lang, "fb_q1"), "", text.Tl(lang, "fb_q2"), "", text.Tl(lang, "fb_q3")]
    assert lines[-2] == "——" and lines[-1] == f"{VERSION} · {FB.os_tag()} · {FB.app_tag()}"
    if sys.platform == "win32":     # CI 的 Windows 机器上：系统那段是真读出来的
        assert re.fullmatch(r"Windows (10|11|Server) \(\d{5}\)", FB.os_tag()), FB.os_tag()
    if lang == "zh":
        assert "%E6%88%92%E5%B0%BA%E5%83%A7" in url        # 「戒尺僧」按 UTF-8 转码
    api.stop_all()


def test_feedback_no_mail_app(home, monkeypatch):
    """没装邮件程序（打开报错）：回 ok False，界面把地址复制给人。"""
    from saodi.api import Api

    def boom(u, *a, **k):
        raise OSError("no association")
    monkeypatch.setattr(FB.os, "startfile", boom, raising=False)
    monkeypatch.setattr(FB.webbrowser, "open", boom)
    res = Api().feedback()
    assert res["ok"] is False and res["to"] == "oilsongchengmin@gmail.com" and res["url"].startswith("mailto:")


@pytest.mark.parametrize("wv,tag", [
    (WV(10, 0, 26100, 2, "", 1), "Windows 11 (26100)"),
    (WV(10, 0, 19045, 2, "", 1), "Windows 10 (19045)"),
    (WV(10, 0, 20348, 2, "", 3), "Windows Server (20348)"),
])
def test_windows_version_tag(monkeypatch, opened, wv, tag):
    """「Windows 版本号」简写：sys.getwindowsversion() 的 build ≥ 22000 是 11；服务器版单说。打开走 os.startfile。"""
    monkeypatch.setattr(FB.sys, "platform", "win32")
    monkeypatch.setattr(FB.sys, "getwindowsversion", lambda: wv, raising=False)
    monkeypatch.setattr(FB.sys, "frozen", True, raising=False)
    monkeypatch.setattr(FB.sys, "executable", os.path.join("x", "SaodiSeng-0.4.1.exe"))
    assert FB.device("0.4.1") == f"0.4.1 · {tag} · SaodiSeng-0.4.1.exe"
    assert FB.launch("mailto:x@y.example?subject=a") and opened == [("startfile", "mailto:x@y.example?subject=a")]


# ---------- 界面真点（Playwright；CI 的 Windows 机器上不装，跳过） ----------
try:
    import playwright.sync_api as pw
except ImportError:
    pw = None
needs_pw = pytest.mark.skipif(pw is None, reason="no playwright")


def _shot(page, name):
    d = os.environ.get("SAODI_SHOTS")
    if d:
        os.makedirs(d, exist_ok=True)
        page.screenshot(path=os.path.join(d, name + ".png"))


@needs_pw
def test_ui_feedback_bottom_left(tmp_path):
    """左下角一行：一句话 +「Feedback / 提意见」。开发服务器不真开邮件程序，拼好的 mailto 记在 /dev/opened：
    英文（新装默认）、中文各点一次，核对收件人、标题、正文；不弹框、不报错。"""
    from test_ui_e2e import Dev, L
    (tmp_path / "Downloads").mkdir()
    dev = Dev(tmp_path)
    opened = lambda: json.loads(urllib.request.build_opener(urllib.request.ProxyHandler({})).open(dev.url + "dev/opened").read())
    errors = []
    try:
        with pw.sync_playwright() as p:
            b = p.chromium.launch()
            page = b.new_page(viewport={"width": 1180, "height": 780})
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append("console " + m.text) if m.type == "error" else None)
            page.on("dialog", lambda d: (errors.append("dialog " + d.message), d.dismiss()))
            page.goto(dev.url)
            page.wait_for_selector("html[data-ready='1']")
            page.wait_for_function("S.update !== null", timeout=20000)    # 查新版回来会重画左边栏底下：等它画完再量、再点
            for lang in ("en", "zh"):
                if lang == "zh":
                    page.click(".lang button[data-v='zh']")
                    page.wait_for_selector("html[lang='zh-CN']")
                fb = page.locator("#foot button.fb[data-act='feedback']")
                assert fb.count() == 1 and fb.inner_text() == L(lang, "fb_btn")
                assert page.locator("#foot .fbl").inner_text().startswith(L(lang, "fb_line"))
                r = fb.bounding_box()
                assert r and r["x"] + r["width"] <= 220, r                       # 在左边栏里，没撑出去
                _shot(page, f"feedback-app-{lang}")
                n = len(opened())
                fb.click()
                for _ in range(50):
                    got = opened()
                    if len(got) > n:
                        break
                    page.wait_for_timeout(50)
                assert len(got) == n + 1
                to, subj, body = parse(got[-1])
                assert to == "oilsongchengmin@gmail.com" and subj == SUBJ[lang] + VERSION
                lines = body.split("\r\n")
                assert lines[:5] == [L(lang, "fb_q1"), "", L(lang, "fb_q2"), "", L(lang, "fb_q3")]
                assert re.fullmatch(re.escape(VERSION) + r" · \S.* · Python \d+\.\d+\.\d+", lines[-1]), lines[-1]
                assert not page.locator("#toast.show").count()                  # 打开了就不吵
            b.close()
    finally:
        dev.stop()
    assert not errors, errors


TRAP = """() => { window.__fb = []; window.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a.fb'); if (a) { window.__fb.push(a.href); e.preventDefault(); } }); }"""
UAS = [("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", r"Windows( 10| 11)? · Chrome 130"),
       ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", r"iOS 17 · Safari 17")]


@needs_pw
@pytest.mark.parametrize("lang", ["en", "zh"])
def test_site_footer_feedback(lang):
    """介绍页页脚的「提意见」：浏览器自己的 mailto，标题、正文填好（字跟程序里同一套），最后一行「版本 · 系统 · 浏览器」，
    版本跟着 version.json 走。点的时候拦下跳转（不真开邮件程序），核对；点的地方 ≥ 44 高。"""
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=SITE))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
    with open(os.path.join(SITE, "version.json"), encoding="utf-8") as f:
        v = json.load(f)["version"]
    text.load(UI)
    errors = []
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        for ua, dev in UAS:
            mobile = "iPhone" in ua
            ctx = b.new_context(user_agent=ua, viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 800},
                                device_scale_factor=2 if mobile else 1)
            ctx.add_init_script(f"({TRAP})()")
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base + f"?lang={lang}")
            pg.wait_for_load_state("networkidle")
            a = pg.locator("footer a.fb")
            assert a.count() == 1 and a.inner_text() == text.Tl(lang, "fb_btn")
            assert pg.locator("footer [data-t=fb_line]").inner_text() == text.Tl(lang, "fb_line")
            a.scroll_into_view_if_needed()
            box = a.bounding_box()
            assert box["height"] >= 44 and box["width"] >= 44, box
            _shot(pg, f"feedback-site-{lang}-{390 if mobile else 1280}")
            a.click()
            href = pg.evaluate("window.__fb[window.__fb.length - 1]")
            assert href.isascii() and " " not in href, href
            to, subj, body = parse(href)
            assert to == "oilsongchengmin@gmail.com" and subj == SUBJ[lang] + v
            lines = body.split("\n")
            assert lines[:5] == [text.Tl(lang, "fb_q1"), "", text.Tl(lang, "fb_q2"), "", text.Tl(lang, "fb_q3")]
            assert re.fullmatch(re.escape(v) + " · " + dev, lines[-1]), lines[-1]
            assert pg.url.startswith(base)                                     # 页面没跳走
            ctx.close()
        b.close()
    srv.shutdown()
    assert not errors, errors
