"""0.3.0 交货截图（_ops/设计规范.md 最后一节）：电脑程序 = 窗口 × 浅深 × 空状态、干活中、结果、出错 8 张，外加几张补充；
介绍页 390 / 1280 × 浅深；介绍页要用的 webp；apple.com 两张参照。

    python shots-0.3.py             # 全来
    python shots-0.3.py app         # 只截程序（顺手出介绍页用的 webp）
    python shots-0.3.py intro       # 只截介绍页
    python shots-0.3.py apple       # 只截 apple.com 参照

程序窗口用 devserver 在浏览器里截（窗口里的网页跟 Zhike.exe 的 WebView2 是同一份 ui/），1180×760 = 程序窗口的默认大小。
邮箱是本机假的 IMAP / SMTP，信是 bench/samples 里编的 .example 信。
"""
from __future__ import annotations

import os
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ZHIKE = HERE.parent
OUT = HERE / "shots-0.3"
IMG = ZHIKE / "img"
sys.path.insert(0, str(ZHIKE / "app"))
sys.path.insert(0, str(HERE))
W, H = 1180, 760


def app_shots():
    from playwright.sync_api import sync_playwright
    from steps import baita
    for scheme in ("light", "dark"):
        os.environ["ZHIKE_HOME"] = tempfile.mkdtemp(prefix="zhike-shots-")
        os.environ["ZHIKE_NO_KEYRING"] = "1"
        for k in [k for k in sys.modules if k == "zhike" or k.startswith("zhike.")]:
            del sys.modules[k]
        from zhike import devserver
        from zhike.api import Api
        from zhike.fakeservers import FakeImap, FakeSmtp, free_port
        imap = FakeImap(user="me@ourco.example").start()
        smtp = FakeSmtp(user="me@ourco.example").start()
        for f in sorted((HERE / "samples").glob("t*.eml")):
            imap.deliver(f.read_bytes())
        api = Api()
        api.store.settings["excel_path"] = str(Path(os.environ["ZHIKE_HOME"]) / "知客僧" / "知客僧.xlsx")
        real_add = api.add_account

        def slow_add(*a):          # 「干活中」那张：让「正在连」多亮一会儿
            time.sleep(2.5)
            return real_add(*a)
        api.add_account = slow_add
        port = free_port()
        srv = devserver.serve(port, api)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        errors = []
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": W, "height": H}, color_scheme=scheme, device_scale_factor=2)
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
            pg.goto(f"http://127.0.0.1:{port}/?dev")
            pg.wait_for_selector(".wl")
            pg.wait_for_timeout(400)
            pg.screenshot(path=str(OUT / f"1-empty-{scheme}.png"))

            def fill(pw):
                pg.fill("#wform [name=email]", imap.user)
                pg.fill("#wform [name=pw]", pw)
                pg.wait_for_timeout(500)
                pg.fill("#wform [name=imaphost]", "127.0.0.1")
                pg.fill("#wform [name=imapport]", str(imap.port))
                pg.click('#wform [data-seg="imapsec"] [data-v="plain"]')
                pg.fill("#wform [name=smtphost]", "127.0.0.1")
                pg.fill("#wform [name=smtpport]", str(smtp.port))
                pg.click('#wform [data-seg="smtpsec"] [data-v="plain"]')
            fill("not-the-app-password")
            pg.click('#wform [data-act="connect"]')
            pg.wait_for_selector("#wform .pw-err:not([hidden])")
            pg.wait_for_timeout(500)
            pg.screenshot(path=str(OUT / f"4-error-{scheme}.png"))
            pg.fill("#wform [name=pw]", imap.password)
            pg.click('#wform [data-act="connect"]')
            pg.wait_for_timeout(700)
            pg.screenshot(path=str(OUT / f"2-working-{scheme}.png"))
            pg.wait_for_selector(".rec")
            pg.wait_for_timeout(500)
            pg.screenshot(path=str(OUT / f"x-recs-{scheme}.png"))
            pg.screenshot(path=str(IMG / f"recs-{scheme}.png"), clip={"x": 220, "y": 0, "width": W - 220, "height": H})
            recs = {r["name"]: r for r in api.recs()}
            for name, to in (("发票", "finance@ourco.example"), ("询价", "sales@ourco.example")):
                box = f'.rec[data-rec="{recs[name]["id"]}"] .tag-in'
                pg.fill(box, to)
                pg.press(box, "Enter")
            pg.click('[data-act="accept"]')
            pg.wait_for_selector(".toast")
            # 收下以后来了几封新信
            from gen_mails import Gen
            g = Gen(11)
            for raw in (g.order_shanmen()[0], g.invoice_lotus()[0], g.ship_ninja()[0], g.inquiry(en=False)[0]):
                imap.deliver(raw)
            api.run_now()
            pg.click('.side [data-nav="inbox"]')
            pg.wait_for_timeout(300)
            pg.click('.li:has-text("Invoice INV")')
            pg.wait_for_timeout(500)
            pg.mouse.move(W - 10, H - 10)
            pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
            pg.screenshot(path=str(OUT / f"3-result-{scheme}.png"))
            # 介绍页大图：高清一张
            pg2 = b.new_page(viewport={"width": W, "height": H}, color_scheme=scheme, device_scale_factor=2)
            pg2.goto(f"http://127.0.0.1:{port}/?dev")
            pg2.wait_for_selector(".li")
            pg2.click('.li:has-text("Invoice INV")')
            pg2.wait_for_timeout(600)
            pg2.screenshot(path=str(IMG / f"app-{scheme}.png"))
            pg2.click('.side [data-nav="table"]')
            pg2.wait_for_selector("table td")
            pg2.wait_for_timeout(400)
            pg2.screenshot(path=str(OUT / f"x-table-{scheme}.png"))
            pg2.click('.side [data-nav="rules"]')
            pg2.wait_for_selector("#rdetail .rhead")
            pg2.wait_for_timeout(500)
            pg2.screenshot(path=str(OUT / f"x-rules-{scheme}.png"))
            pg2.close()
            # 第二天：新来一家供应商 → 拟成「归进发票」
            imap.deliver(baita("BT-2026-118", "1,234.00"))
            api.run_now()
            pg.evaluate("window.zkShown()")
            pg.wait_for_selector('.rec')
            pg.wait_for_timeout(500)
            pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
            pg.screenshot(path=str(OUT / f"x-extend-{scheme}.png"))
            b.close()
        assert not errors, errors
        srv.shutdown()
        api.engine.stop()
        imap.stop()
        smtp.stop()
    # 介绍页用的 webp
    from PIL import Image
    for name in ("app", "recs"):
        for scheme in ("light", "dark"):
            src = IMG / f"{name}-{scheme}.png"
            Image.open(src).save(IMG / f"{name}-{scheme}.webp", "WEBP", quality=82, method=6)
            src.unlink()
    print("app shots ok")


def intro_shots():
    from playwright.sync_api import sync_playwright
    import http.server
    import functools
    root = ZHIKE.parent
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    handler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/zhike/"
    bad = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w, h in ((390, 844), (1280, 800)):
            for scheme in ("light", "dark"):
                pg = b.new_page(viewport={"width": w, "height": h}, color_scheme=scheme, device_scale_factor=2 if w == 390 else 1)
                pg.on("pageerror", lambda e: bad.append(str(e)))
                pg.on("console", lambda m: m.type == "error" and bad.append(m.text))
                pg.on("response", lambda r: r.status >= 400 and bad.append(f"{r.status} {r.url}"))
                pg.goto(url)
                pg.wait_for_load_state("networkidle")
                pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager')")
                pg.wait_for_timeout(600)
                over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                broken = pg.evaluate("[...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src)")
                assert over <= 0, (w, scheme, "横向溢出", over)
                assert not broken, (w, scheme, broken)
                pg.screenshot(path=str(OUT / f"intro-{w}-{scheme}.png"), full_page=True)
                pg.close()
        b.close()
    srv.shutdown()
    assert not bad, bad
    print("intro shots ok")


def apple_shots():
    from playwright.sync_api import sync_playwright
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    with sync_playwright() as p:
        b = p.chromium.launch(proxy={"server": proxy} if proxy else None)
        for u, w, h, name in (("https://www.apple.com/macos/", 1280, 800, "ref-apple-macos-1280.png"),
                              ("https://www.apple.com/iphone/", 390, 844, "ref-apple-iphone-390.png")):
            try:
                pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2 if w == 390 else 1)
                pg.goto(u, wait_until="domcontentloaded", timeout=30000)
                pg.wait_for_timeout(3000)
                pg.screenshot(path=str(OUT / name))
                print("ok", name)
                pg.close()
            except Exception as e:  # 沙盒打不开就算了
                print("fail", name, str(e).split("\n")[0])
        b.close()


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    IMG.mkdir(exist_ok=True)
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "app"):
        app_shots()
    if what in ("all", "intro"):
        intro_shots()
    if what in ("all", "apple"):
        apple_shots()
