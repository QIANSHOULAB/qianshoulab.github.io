"""0.4.1：设置「关于」里的「提意见」。点了 → Python 拼好 mailto（收件人、标题、三行提示、最后一行「版本 · 系统 · 程序」）
→ 交给系统默认的邮件程序（Windows 上 os.startfile）。CI 的 Windows 机器上没有邮件程序，真拉起测不了：
这里把「打开」换成记一笔，核对生成的 mailto 字符串对、确实调了打开的那个函数。Linux 和 Windows CI 都跑。"""
import re
import sys
from collections import namedtuple
from urllib.parse import unquote

import pytest

from zhike import VERSION, feedback as FB, text
from zhike.api import Api

WV = namedtuple("WV", "major minor build platform service_pack product_type")


def parse(url):
    head, q = url.split("?", 1)
    p = dict(kv.split("=", 1) for kv in q.split("&"))
    return unquote(head[len("mailto:"):]), unquote(p["subject"]), unquote(p["body"])


@pytest.fixture
def opened(monkeypatch):
    """不真开邮件程序：os.startfile / webbrowser.open 换成记一笔。"""
    calls = []
    monkeypatch.setattr(FB.os, "startfile", lambda u: calls.append(("startfile", u)), raising=False)
    monkeypatch.setattr(FB.webbrowser, "open", lambda u, *a, **k: calls.append(("webbrowser", u)) or True)
    return calls


def test_feedback_strings_both_languages():
    d = text.load()
    for k in ("btn_feedback", "fb_line", "fb_subject", "fb_q1", "fb_q2", "fb_q3", "fb_nomail"):
        assert d["en"][k] and d["zh"][k], k
    assert d["en"]["btn_feedback"] == "Feedback" and d["zh"]["btn_feedback"] == "提意见"   # 按钮照直写
    assert d["en"]["fb_subject"] == "[QIANSHOU feedback] Zhike · Inbox Sorter {v}"
    assert d["zh"]["fb_subject"] == "[千手院反馈] 知客僧 {v}"


@pytest.mark.parametrize("lang", ["en", "zh"])
def test_feedback_builds_mailto_and_opens_it(home, opened, lang):
    api = Api()
    api.set_lang(lang)
    res = api.feedback()
    url = res["url"]
    assert res["ok"] and res["to"] == "oilsongchengmin@gmail.com"
    # 真调了打开的函数，Windows 上走 os.startfile（ShellExecute 找 mailto 的默认程序）
    assert opened == [("startfile" if sys.platform == "win32" else "webbrowser", url)]
    # 网址里全是转过码的 ASCII：中文不乱码，空格是 %20 不是 +，换行 %0D%0A
    assert url.isascii() and " " not in url and "+" not in url and "%0D%0A" in url
    to, subj, body = parse(url)
    assert to == "oilsongchengmin@gmail.com"
    assert subj == ("[QIANSHOU feedback] Zhike · Inbox Sorter " if lang == "en" else "[千手院反馈] 知客僧 ") + VERSION
    lines = body.split("\r\n")
    q = [text.T(k, lang) for k in ("fb_q1", "fb_q2", "fb_q3")]
    assert lines[:5] == [q[0], "", q[1], "", q[2]]
    assert lines[-2] == "——"
    assert lines[-1] == f"{VERSION} · {FB.os_tag()} · {FB.app_tag()}"
    if sys.platform == "win32":     # CI 的 Windows 机器上：系统那段是真读出来的
        assert re.fullmatch(r"Windows (10|11|Server) \(\d{5}\)", FB.os_tag()), FB.os_tag()
    if lang == "zh":
        assert "%E5%8D%83%E6%89%8B%E9%99%A2" in url        # 「千手院」按 UTF-8 转码


def test_feedback_no_mail_app(home, monkeypatch):
    """没装邮件程序（打开报错）：回 ok False，界面把地址复制给人。"""
    def boom(u, *a, **k):
        raise OSError("no association")
    monkeypatch.setattr(FB.os, "startfile", boom, raising=False)
    monkeypatch.setattr(FB.webbrowser, "open", boom)
    res = Api().feedback()
    assert res["ok"] is False and res["to"] == "oilsongchengmin@gmail.com" and res["url"].startswith("mailto:")


@pytest.mark.parametrize("wv,tag", [
    (WV(10, 0, 26100, 2, "", 1), "Windows 11 (26100)"),
    (WV(10, 0, 22631, 2, "", 1), "Windows 11 (22631)"),
    (WV(10, 0, 19045, 2, "", 1), "Windows 10 (19045)"),
    (WV(10, 0, 20348, 2, "", 3), "Windows Server (20348)"),
    (WV(6, 1, 7601, 2, "", 1), "Windows 7 (7601)"),
])
def test_windows_version_tag(monkeypatch, opened, wv, tag):
    """「Windows 版本号」简写：sys.getwindowsversion() 的 build ≥ 22000 是 11；服务器版单说。打开走 os.startfile。"""
    monkeypatch.setattr(FB.sys, "platform", "win32")
    monkeypatch.setattr(FB.sys, "getwindowsversion", lambda: wv, raising=False)
    assert FB.os_tag() == tag
    assert FB.device("0.4.1").startswith("0.4.1 · " + tag + " · ")
    assert FB.launch("mailto:x@y.example?subject=a") and opened == [("startfile", "mailto:x@y.example?subject=a")]


def test_frozen_exe_names_itself(monkeypatch):
    monkeypatch.setattr(FB.sys, "frozen", True, raising=False)
    monkeypatch.setattr(FB.sys, "executable", r"C:\Users\me\Downloads\Zhike.exe" if sys.platform == "win32" else "/x/Zhike.exe")
    assert FB.app_tag() == "Zhike.exe"


# ---------- 界面真点（Playwright；CI 的 Windows 机器上不装，跳过） ----------
try:
    import playwright.sync_api as pw
except ImportError:
    pw = None
needs_pw = pytest.mark.skipif(pw is None, reason="no playwright")


@needs_pw
def test_ui_feedback_in_settings(home, monkeypatch):
    """设置 →「关于」里一行：一句话 +「Feedback / 提意见」。点了：Python 拼好 mailto 交给「打开」（这里记一笔，不真开）；
    中英两套各点一次，核对收件人、标题、正文；打不开时提示条把地址给人。按钮不撑破、不挤行。"""
    import threading
    from test_ui_e2e import shot
    from test_v04 import OVERFLOW_JS
    from zhike import devserver
    from zhike.fakeservers import free_port
    monkeypatch.delenv("ZHIKE_LANG")
    got, fail = [], {"on": False}

    def fake_launch(url):
        got.append(url)
        return not fail["on"]
    monkeypatch.setattr(FB, "launch", fake_launch)
    api = Api()
    api.store.settings["excel_path"] = str(home / "out" / "Zhike.xlsx")      # 别碰真的「文档」文件夹
    port = free_port()
    srv = devserver.serve(port, api)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errors, over = [], []
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1180, "height": 760}, locale="en-US")
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
        pg.goto(f"http://127.0.0.1:{port}/?dev")
        pg.wait_for_selector(".wl")
        pg.click('[data-act="try-demo"]')
        pg.click('.side [data-nav="settings"]')
        for lang, btn, line, subj in [("en", "Feedback", "Zhike being dense? Tell us.", "[QIANSHOU feedback] Zhike · Inbox Sorter "),
                                      ("zh", "提意见", "嫌贫僧哪里笨，写信来骂。", "[千手院反馈] 知客僧 ")]:
            if lang == "zh":
                pg.click('.seg.lang [data-lang="zh"]')
                pg.wait_for_selector('.bar h1:has-text("设置")')
            fb = pg.locator('[data-act="feedback"]')
            assert fb.count() == 1 and fb.inner_text() == btn
            row = pg.locator('.row:has([data-act="feedback"])')
            assert row.locator(".l b").inner_text() == line
            assert row.locator("xpath=ancestor::div[contains(@class,'grp')]//h2").inner_text() == text.T("set_about", lang)
            fb.scroll_into_view_if_needed()
            pg.wait_for_timeout(200)
            over += pg.evaluate(OVERFLOW_JS)
            shot(pg, f"feedback-settings-{lang}")
            n = len(got)
            fb.click()
            for _ in range(40):
                if len(got) > n:
                    break
                pg.wait_for_timeout(50)
            assert len(got) == n + 1
            to, s, body = parse(got[-1])
            assert to == "oilsongchengmin@gmail.com" and s == subj + VERSION
            lines = body.split("\r\n")
            assert lines[0] == text.T("fb_q1", lang) and lines[2] == text.T("fb_q2", lang) and lines[4] == text.T("fb_q3", lang)
            assert lines[-1] == f"{VERSION} · {FB.os_tag()} · {FB.app_tag()}"
            assert not pg.locator(".toast").count()                                # 打开了就不吵
        # 没装邮件程序：提示条一句话 + 地址
        fail["on"] = True
        pg.click('[data-act="feedback"]')
        pg.wait_for_selector('.toast:has-text("oilsongchengmin@gmail.com")')
        assert pg.inner_text(".toast") == "没找到邮件程序，地址复制好了：oilsongchengmin@gmail.com"
        b.close()
    srv.shutdown()
    api.engine.stop()
    assert not errors, errors
    assert not over, sorted(set(over))


TRAP = """() => { window.__fb = []; window.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a.fb'); if (a) { window.__fb.push(a.href); e.preventDefault(); } }); }"""
UAS = [("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0", r"Windows( 10| 11)? · Edge 130"),
       ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", r"iOS 17 · Safari 17")]


@needs_pw
@pytest.mark.parametrize("lang", ["en", "zh"])
def test_site_footer_feedback(lang):
    """介绍页页脚的「提意见」：浏览器自己的 mailto，标题、正文填好（字跟程序里同一套），最后一行「版本 · 系统 · 浏览器」。
    点的时候拦下跳转（不真开邮件程序），核对；点的地方 ≥ 44 高。"""
    import threading
    from functools import partial
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
    from pathlib import Path
    from test_ui_e2e import shot
    site = Path(__file__).resolve().parents[2]
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(site)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
    errors = []
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        for i, (ua, dev) in enumerate(UAS):
            mobile = "iPhone" in ua
            ctx = b.new_context(user_agent=ua, viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 800},
                                device_scale_factor=2 if mobile else 1)
            ctx.add_init_script(f"({TRAP})()")
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base + f"?lang={lang}")
            a = pg.locator("footer a.fb")
            assert a.count() == 1 and a.inner_text() == text.T("btn_feedback", lang)
            assert pg.locator("footer [data-str=fb_line]").inner_text() == text.T("fb_line", lang)
            a.scroll_into_view_if_needed()
            box = a.bounding_box()
            assert box["height"] >= 44 and box["width"] >= 44, box
            if i == 0:
                shot(pg, f"feedback-site-{lang}-1280")
            else:
                shot(pg, f"feedback-site-{lang}-390")
            a.click()
            href = pg.evaluate("window.__fb[window.__fb.length - 1]")
            assert href.isascii() and " " not in href, href
            to, s, body = parse(href)
            assert to == "oilsongchengmin@gmail.com" and s == text.T("fb_subject", lang, v=VERSION)
            lines = body.split("\n")
            assert lines[:5] == [text.T("fb_q1", lang), "", text.T("fb_q2", lang), "", text.T("fb_q3", lang)]
            assert re.fullmatch(re.escape(VERSION) + " · " + dev, lines[-1]), lines[-1]   # Chromium 问得到真版本时写 Windows 10 / 11
            assert pg.url.startswith(base)                                     # 页面没跳走
            ctx.close()
        b.close()
    srv.shutdown()
    assert not errors, errors
