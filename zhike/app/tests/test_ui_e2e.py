"""界面真流程（浏览器里跑 devserver + Playwright）。没装 Playwright 就跳过（CI 的 Windows 机器上不装）。

    ZHIKE_SHOTS=目录 python -m pytest -q tests/test_ui_e2e.py     # 顺手截图

从示例模式开始：看示例 → 设置里连邮箱（本地假 IMAP/SMTP）→ 用转来的信建规则（点虚线建议）→
收一轮 → 推销信被挡下 → 放行 → 表格。全程不许有页面报错、接口报错。
"""
import os
import threading

import pytest

pw = pytest.importorskip("playwright.sync_api")

from zhike import devserver  # noqa: E402
from zhike.api import Api  # noqa: E402
from zhike.fakeservers import free_port  # noqa: E402
from conftest import make_mail  # noqa: E402

SHOTS = os.environ.get("ZHIKE_SHOTS")


def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.screenshot(path=os.path.join(SHOTS, name + ".png"))


FWD = ("帮忙录一下\n\n---------- Forwarded message ---------\nFrom: 山门商贸 <orders@shanmen-shop.example>\n"
       "Date: Mon, 2 Nov 2026 09:00:00 +0800\nSubject: 订单确认 #SM-1001\nTo: me@test.local\n\n"
       "订单号：SM-1001\n下单时间：2026-11-01 09:30\n实付金额：¥1,280.50\n")


@pytest.mark.parametrize("scheme", ["light", "dark"])
def test_full_flow(home, imap, smtp, scheme):
    imap.deliver(make_mail("Fwd: 订单确认 #SM-1001", FWD, frm="同事A <a@ourco.example>"))
    api = Api()
    api.store.settings["excel_path"] = str(home / "out" / "知客僧.xlsx")
    port = free_port()
    srv = devserver.serve(port, api)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errors, bad_api = [], []
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1180, "height": 760}, color_scheme=scheme)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
        pg.on("response", lambda r: "/api/" in r.url and r.ok and '"ok": false' in (r.text() or "") and bad_api.append(r.url))
        pg.goto(f"http://127.0.0.1:{port}/?dev")
        pg.wait_for_selector(".li")
        # 示例：发票信带 PDF 附件，附件里的字也在正文里
        pg.click('.li:has-text("Invoice INV-88213")')
        pg.wait_for_selector('#mbody:has-text("—— 附件 INV-88213.pdf ——")')
        shot(pg, f"demo-invoice-{scheme}")
        # Outlook：还没接微软登录时直说
        pg.click('.side [data-nav="settings"]')
        pg.fill("#aemail", "me@outlook.com")
        pg.wait_for_function("document.querySelector('#ahelp').textContent.includes('Outlook 即将支持')")
        assert pg.is_hidden("#apw")
        # 连上假邮箱（自己填服务器）
        pg.fill("#aemail", imap.user)
        pg.fill("#apw", imap.password)
        pg.wait_for_timeout(500)          # 不认识的域名：自己填服务器那块会自动展开
        if pg.is_hidden("#ihost"):
            pg.click('[data-act="adv"]')
        pg.fill("#ihost", "127.0.0.1")
        pg.fill("#iport", str(imap.port))
        pg.select_option("#isec", "plain")
        pg.fill("#shost", "127.0.0.1")
        pg.fill("#sport", str(smtp.port))
        pg.select_option("#ssec", "plain")
        pg.click('[data-act="connect"]')
        pg.wait_for_selector(".msg.ok")
        assert pg.inner_html("#demo") == ""      # 连上了，示例横幅马上消失
        # 用转来的信建规则：认得出原发件人，点虚线建议收字段
        pg.click('.side [data-nav="inbox"]')
        pg.wait_for_selector(".li")
        pg.wait_for_selector('.r-fwd:has-text("orders@shanmen-shop.example")')
        shot(pg, f"fwd-mail-{scheme}")
        pg.click('[data-act="rule-from"]')
        pg.wait_for_selector(".claim-h")
        for label in ("订单号", "实付金额"):
            pg.click(f'#mbody .sg[title="{label}"]')
            pg.wait_for_selector("#pname")
            pg.click("#padd")
            pg.wait_for_timeout(500)
        # 规则条件：认原发件人的域名
        pg.click('.side [data-nav="rules"]')
        pg.wait_for_selector('[data-tagin="conditions.exclude"]')
        assert "@shanmen-shop.example" in pg.inner_text('[data-tags="conditions.from"]')
        pg.click('label.switch:has(input[data-toggle="forward.enabled"])')
        pg.wait_for_selector('[data-tagin="forward.to"]')
        pg.fill('[data-tagin="forward.to"]', "boss@test.local")
        pg.press('[data-tagin="forward.to"]', "Enter")
        pg.wait_for_timeout(600)
        shot(pg, f"rule-{scheme}")
        # 来新信：一封转来的订单、一封冒充推销
        imap.deliver(make_mail("Fwd: 订单确认 #SM-1002", FWD.replace("1001", "1002"), frm="同事B <b@ourco.example>"))
        imap.deliver(make_mail("订单确认：恭喜您获得免费手机一台", "订单号：WIN888\n请点击链接领取", frm="山门商贸 <promo@shanmen-shop.example>"))
        pg.click('.side [data-nav="inbox"]')
        pg.click('[data-act="run-now"]')
        pg.wait_for_timeout(800)
        # 被挡下的推销信：收件里看得到原因；「没找到」点一下就进补样例模式
        pg.click('.li:has-text("恭喜您获得")')
        pg.wait_for_selector('.claim-a .chip.red')
        pg.click("[data-want]")
        pg.wait_for_selector(".want-bar")
        shot(pg, f"junk-want-{scheme}")
        pg.click('[data-act="want-cancel"]')
        pg.click('.side [data-nav="log"]')
        pg.wait_for_selector("[data-release]")
        shot(pg, f"log-{scheme}")
        n_before = len(smtp.sent)
        pg.click("[data-release]")
        pg.wait_for_timeout(600)
        assert len(smtp.sent) == n_before + 1
        pg.click('.side [data-nav="table"]')
        pg.wait_for_selector("table td")
        assert "SM-1002" in pg.inner_text("table")
        shot(pg, f"table-{scheme}")
        b.close()
    srv.shutdown()
    api.engine.stop()
    assert not errors, errors
    assert not bad_api, bad_api
