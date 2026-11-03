"""界面真流程（浏览器里跑 devserver + Playwright）。没装 Playwright 就跳过（CI 的 Windows 机器上不装）。

    ZHIKE_SHOTS=目录 python -m pytest -q tests/test_ui_e2e.py     # 顺手截图

0.3 的样子：第一次打开就是连邮箱（一句话 + 用示例试试）→ 示例 → 连假邮箱（密码错在密码框下面说）→
贫僧拟好规则（转来的订单信认原发件人）→ 填转给谁、收下（一下）→ 收一轮 → 推销被挡 → 放行 → 表格 → 删规则能撤销。
全程不许有页面报错、接口报错。
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


FWD = ("帮忙录一下\n\n---------- Forwarded message ---------\nFrom: 青禾商贸 <orders@qinghe-shop.example>\n"
       "Date: Mon, 2 Nov 2026 09:00:00 +0800\nSubject: 订单确认 #SM-1001\nTo: me@test.local\n\n"
       "订单号：SM-1001\n下单时间：2026-11-01 09:30\n实付金额：¥1,280.50\n")


def fill_servers(pg, imap, smtp):
    pg.fill("#wform [name=imaphost]", "127.0.0.1")
    pg.fill("#wform [name=imapport]", str(imap.port))
    pg.click('#wform [data-seg="imapsec"] [data-v="plain"]')
    pg.fill("#wform [name=smtphost]", "127.0.0.1")
    pg.fill("#wform [name=smtpport]", str(smtp.port))
    pg.click('#wform [data-seg="smtpsec"] [data-v="plain"]')


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
        # 接口报错 = 外层 ok 是 false（里层的 {"ok": false, "code": "auth"} 是正常回话，比如故意输错密码）
        pg.on("response", lambda r: "/api/" in r.url and r.ok and r.text().startswith('{"ok": false') and bad_api.append(r.url))
        pg.goto(f"http://127.0.0.1:{port}/?dev")
        # 第一次打开：连邮箱那一屏
        pg.wait_for_selector(".wl")
        assert pg.is_visible('[data-act="try-demo"]')
        shot(pg, f"welcome-{scheme}")
        # 用示例试试：一点就有结果。发票信带 PDF 附件，附件里的字也在正文里
        pg.click('[data-act="try-demo"]')
        pg.click('.li:has-text("Invoice INV-88213")')
        pg.wait_for_selector('#mbody:has-text("—— 附件 INV-88213.pdf ——")')
        shot(pg, f"demo-invoice-{scheme}")
        pg.click('[data-act="to-welcome"]')
        pg.wait_for_selector("#wform")
        # Outlook：还没接微软登录时直说
        pg.fill("#wform [name=email]", "me@outlook.com")
        pg.wait_for_function("document.querySelector('#wform .ahelp').textContent.includes('Outlook 即将支持')")
        assert pg.is_hidden("#wform [name=pw]")
        # 连假邮箱：密码错，就在密码框下面说
        pg.fill("#wform [name=email]", imap.user)
        pg.fill("#wform [name=pw]", "wrong")
        pg.wait_for_timeout(500)          # 不认识的域名：自己填服务器那块会自动展开
        if pg.is_hidden("#wform [name=imaphost]"):
            pg.click('#wform [data-act="adv"]')
        fill_servers(pg, imap, smtp)
        pg.click('#wform [data-act="connect"]')
        pg.wait_for_selector("#wform .pw-err:not([hidden])")
        assert "密码不对" in pg.inner_text("#wform .pw-err")
        shot(pg, f"connect-error-{scheme}")
        pg.fill("#wform [name=pw]", imap.password)
        pg.press("#wform [name=pw]", "Enter")             # 回车就连
        # 连上：贫僧拟好了规则，转来的订单信按原发件人认
        pg.wait_for_selector(".rec")
        assert api.recs()[0]["conditions"]["from"] == ["@qinghe-shop.example"]
        assert "开机自己跑" in pg.inner_text(".note")       # 开机自启当场说一句，一下能关
        shot(pg, f"recs-{scheme}")
        pg.fill(".rec .tag-in", "boss@test.local")
        pg.press(".rec .tag-in", "Enter")
        pg.click('[data-act="accept"]')
        pg.wait_for_selector('.toast:has-text("收下 1 条")')
        rule = api.boot()["rules"][0]
        assert rule["forward"] == {"enabled": True, "to": ["boss@test.local"], "note": ""}
        assert [f["name"] for f in rule["fields"] if not f.get("builtin")] == ["订单号", "下单日期", "金额"]
        # 来新信：一封转来的订单、一封冒充推销
        imap.deliver(make_mail("Fwd: 订单确认 #SM-1002", FWD.replace("1001", "1002"), frm="同事B <b@ourco.example>"))
        imap.deliver(make_mail("订单确认：恭喜您获得免费手机一台", "订单号：WIN888\n请点击链接领取", frm="青禾商贸 <promo@qinghe-shop.example>"))
        pg.click('[data-act="run-now"]')
        pg.wait_for_selector('.li:has-text("恭喜您获得")')
        # 被挡下的推销信：收件里看得到原因；「没找到」点一下就进补样例模式
        pg.click('.li:has-text("恭喜您获得")')
        pg.wait_for_selector('.claim-a .chip.doubt')
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
        # 删规则：不问「确定吗」，给撤销
        pg.click('.side [data-nav="rules"]')
        pg.click('[data-act="del-rule"]')
        pg.wait_for_selector(".toast-act")
        assert api.boot()["rules"] == []
        pg.click(".toast-act")
        pg.wait_for_selector('.ri:has-text("订单")')
        assert api.boot()["rules"][0]["id"] == rule["id"]
        b.close()
    srv.shutdown()
    api.engine.stop()
    assert not errors, errors
    assert not bad_api, bad_api
