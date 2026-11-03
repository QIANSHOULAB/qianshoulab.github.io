"""0.3：去掉没必要的步骤——贫僧拟规则（人只管收不收）、开机就在岗、撤销代替「确定吗」、有事才叫人。"""
import sys
from pathlib import Path

import pytest
from openpyxl import load_workbook

from zhike import platform as P, recommend as RC, rules as R
from zhike.api import Api
from zhike.mailparse import parse
from conftest import make_mail, order_mail

SAMPLES = Path(__file__).resolve().parents[2] / "bench" / "samples"


def train():
    """比武那 10 封样例：两家订单、两家发票、两家快递、两封询价、一封推销、一封冒充发票（域名差一个字母）。"""
    return [parse(f.read_bytes(), uid=i + 1) for i, f in enumerate(sorted(SAMPLES.glob("t*.eml")))]


def ov(imap, smtp):
    return {"provider": "custom", "imap_host": "127.0.0.1", "imap_port": imap.port, "imap_security": "plain",
            "smtp_host": "127.0.0.1", "smtp_port": smtp.port, "smtp_security": "plain"}


def rows(path, sheet):
    ws = load_workbook(path)[sheet]
    head = [c.value for c in ws[1]]
    return [dict(zip(head, [c.value for c in r])) for r in ws.iter_rows(min_row=2)]


NEW_SUPPLIER = make_mail("Tax Invoice BT-2026-118 from Baita Office",
                         "Dear customer,\n\nInvoice Number: BT-2026-118\nTotal Due: S$1,234.00\nPayment Due: 2026-12-01\n\nBaita Office Supplies",
                         frm="Baita Office Billing <billing@baita-office.example>", atts=[("BT-2026-118.pdf", b"%PDF-1.4 x")])


# ---------- 拟规则 ----------
def test_recommend_from_bench_samples():
    recs = {r["name"]: r for r in RC.recommend(train(), [])}
    assert set(recs) == {"订单", "发票", "物流", "询价"}
    o = recs["订单"]
    assert o["conditions"]["from"] == ["@shanmen-shop.example", "@lotus-mart.example"]       # 两家合成一条
    assert [f["name"] for f in o["fields"]] == ["订单号", "下单日期", "金额"]                   # 列名统一：Order Number → 订单号
    assert o["conditions"]["subject"] == ["订单确认", "Your Lotus Mart order"]
    inv = recs["发票"]
    assert "@lotus-supp1ies.example" not in inv["conditions"]["from"]                         # 冒充的那家不算
    assert inv["attachments"] and [f["name"] for f in inv["fields"]] == ["发票号", "金额", "到期日"]
    ask = recs["询价"]
    assert ask["open"] and ask["conditions"]["from"] == [] and "报价" in ask["conditions"]["subject"]
    assert all(r["kind"] == "new" for r in recs.values())


def test_recommended_rule_reads_like_hand_built():
    ms = train()
    recs = {r["name"]: r for r in RC.recommend(ms, [])}
    by = {m.key(): m for m in ms}
    rule = RC.to_rule(recs["订单"], by, forward=["boss@test.local"])
    from zhike import learn
    lm = next(m for m in ms if "lotus-mart" in m.from_addr)
    got = learn.extract_all(rule["fields"], lm)
    assert got["订单号"]["raw"] == "LM-585500" and got["金额"]["value"] == 66.75
    assert rule["forward"] == {"enabled": True, "to": ["boss@test.local"], "note": ""}
    # 新来一封没见过的写法（订单编号、应付总额）照样认（同义词 0.2 就有）
    m = parse(make_mail("订单确认 #SM-77", "订单编号：SM-77\n下单时间：2026-11-01 09:30\n应付总额：￥88.00\n", frm="山门商贸 <orders@shanmen-shop.example>"))
    assert R.first_match([rule], m) is rule and learn.extract_all(rule["fields"], m)["订单号"]["raw"] == "SM-77"


def test_junk_and_people_are_not_recommended():
    ms = [parse(make_mail("订单确认：恭喜您获得免费手机一台", "订单号：WIN888\n实付金额：¥0.00\n请点击链接领取", frm="领奖中心 <promo@win-prize.example>")),
          parse(make_mail("我的快递怎么还没到", "订单号：SM-1\n都三天了", frm="张三 <zhang3@gmail.com>")),
          parse(make_mail("双十一大促", "全场五折\n退订请回复 TD", frm="山门商贸 <news@shanmen-shop.example>"))]
    assert RC.recommend(ms, []) == []


def test_existing_rule_gets_new_sender_as_extend():
    ms = train()
    by = {m.key(): m for m in ms}
    inv = next(r for r in RC.recommend(ms, []) if r["name"] == "发票")
    rule = RC.to_rule(inv, by)
    new = parse(NEW_SUPPLIER, uid=99)
    recs = RC.recommend(ms + [new], [rule])
    assert sorted((r["kind"], r["name"]) for r in recs) == [("extend", "发票"), ("new", "物流"), ("new", "订单"), ("new", "询价")]
    ext = next(r for r in recs if r["kind"] == "extend")      # 发票已经有规则了：新来的这家拟成「归进去」
    assert ext["rule_id"] == rule["id"] and ext["name"] == "发票" and ext["senders"][0]["addr"] == "billing@baita-office.example"
    after = RC.extend(rule, ext, {new.key(): new})
    assert "@baita-office.example" in after["conditions"]["from"]
    labels = next(f for f in after["fields"] if f["name"] == "发票号")["labels"]
    assert "Invoice Number:" in labels and "Invoice No" in labels and "发票号码:" in labels      # 老写法一个不丢
    from zhike import learn
    got = learn.extract_all(after["fields"], parse(NEW_SUPPLIER.replace(b"BT-2026-118", b"BT-2026-200")))
    assert got["发票号"]["raw"] == "BT-2026-200" and got["金额"]["value"] == 1234.0
    assert not rule["conditions"]["from"].count("@baita-office.example")                      # 原规则没被改（返回的是新对象）


def test_subject_stem():
    assert RC.subject_stem("订单确认 #SM20261102-9609") == "订单确认"
    assert RC.subject_stem("Invoice INV-56383 from Lotus Supplies") == "Invoice"
    assert RC.subject_stem("【青石科技】11月服务费发票 QS-2026-4932") == "服务费发票"
    assert RC.subject_stem("Fwd: Your parcel NV2026SG93420454 is on the way") == "Your parcel"
    assert RC.subject_stem("12345") == ""


# ---------- 连上邮箱 → 拟好 → 收下（一下）→ 新信进表；能撤销 ----------
def test_connect_recommend_accept_undo(home, imap, smtp):
    for m in train():
        imap.deliver(m.raw)
    api = Api()
    api.store.settings["excel_path"] = str(home / "out" / "知客僧.xlsx")
    res = api.add_account(imap.user, imap.password, ov(imap, smtp))
    assert res["ok"] and res["samples"] == 10 and res["recs"] == 4
    assert res["autostart"] and api.boot()["settings"]["autostart"]          # 头一个邮箱连上：开机自己跑，当场说
    recs = api.recs()
    fw = {"发票": ["finance@test.local"], "询价": ["sales@test.local"]}
    out = api.accept_recs([{"id": r["id"], "forward": fw.get(r["name"], [])} for r in recs])
    assert out["created"] == 4 and api.recs() == []
    assert sorted(r["name"] for r in api.boot()["rules"]) == sorted(["订单", "物流", "发票", "询价"])
    imap.deliver(order_mail("SM-500", "500.00", frm="山门商贸 <orders@shanmen-shop.example>"))   # 比武样例里那家
    imap.deliver(make_mail("询价：文件柜", "产品：文件柜\n数量：3 台\n联系电话：+65 8000 0000", frm="客户 <someone@post.example>"))
    api.engine.run_once()
    assert rows(api.store.settings["excel_path"], "订单")[0]["订单号"] == "SM-500"
    assert [s[1] for s in smtp.sent] == [["sales@test.local"]]                # 询价转给销售
    assert api.undo(out["undo"]) and api.boot()["rules"] == [] and len(api.recs()) == 4
    assert not api.undo(out["undo"])                                          # 同一下只能撤一次
    api.engine.stop()


def test_skipped_recs_are_remembered(home, imap, smtp):
    for m in train():
        imap.deliver(m.raw)
    api = Api()
    api.add_account(imap.user, imap.password, ov(imap, smtp))
    recs = api.recs()
    keep, skip = recs[0], [r["id"] for r in recs[1:]]
    api.accept_recs([{"id": keep["id"], "name": "我的" + keep["name"]}], skip)
    assert api.boot()["rules"][0]["name"] == "我的" + keep["name"]
    assert api.recs() == []                                                    # 关掉的不再拟
    api.engine.stop()


def test_delete_rule_and_remove_account_can_undo(home, imap, smtp):
    api = Api()
    r = api.boot()["rules"][0]                                                 # 示例模式也能删、能撤
    u = api.delete_rule(r["id"])["undo"]
    assert r["id"] not in [x["id"] for x in api.boot()["rules"]]
    assert api.undo(u) and r["id"] in [x["id"] for x in api.boot()["rules"]]
    res = api.add_account(imap.user, imap.password, ov(imap, smtp))
    aid = res["account"]["id"]
    u = api.remove_account(aid)["undo"]
    assert api.boot()["accounts"] == [] and api.secrets.get(f"pw:{aid}") is None
    assert api.undo(u) and api.boot()["accounts"][0]["id"] == aid and api.secrets.get(f"pw:{aid}") == imap.password
    api.engine.stop()


# ---------- 有事才叫人 ----------
def test_notify_only_when_someone_has_to_act(env):
    said = []
    api = Api(env["store"], env["eng"], notify=lambda t, b: said.append(b))
    env["eng"].on_change = api._changed
    env["imap"].deliver(order_mail("SM-1", "1.00"))          # 照常进表、转发：不吵
    env["eng"].run_once()
    assert said == []
    env["imap"].deliver(make_mail("想问下 A4 纸的价", "电话：9123 4567\n要 200 箱", frm="陈先生 <chen@example.com>"))
    env["eng"].run_once()                                     # 询价规则开着起草：草稿备好了，叫一声
    assert len(said) == 1 and "草稿" in said[0]
    env["sec"].set(f"pw:{env['acct']['id']}", "wrong")
    env["eng"].run_once()
    env["eng"].run_once()
    assert len(said) == 2 and "密码不对" in said[1]            # 密码不对：只叫一次


# ---------- 开机就在岗 ----------
def test_autostart_toggle(home):
    api = Api()
    assert not api.boot()["settings"]["autostart"]            # 没连邮箱之前不动开机自启
    api.set_setting("autostart", True)
    assert api.boot()["settings"]["autostart"] and "--tray" in P.autostart_command()
    api.set_setting("autostart", False)
    assert not api.boot()["settings"]["autostart"] and api.store.settings["autostart"] is False


@pytest.mark.skipif(sys.platform != "win32", reason="Windows 注册表")
def test_autostart_registry_roundtrip():
    had = P.autostart_command()
    try:
        P.set_autostart(True)
        cmd = P.autostart_command()
        assert cmd.endswith("--tray") and sys.executable in cmd
        P.set_autostart(False)
        assert P.autostart_command() is None
    finally:
        if had:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, P.RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
                winreg.SetValueEx(k, P.NAME, 0, winreg.REG_SZ, had)


def test_new_supplier_next_day_one_click_and_caught_up(home, imap, smtp):
    """第二天：来了一家新供应商的发票。贫僧拟成「归进发票」，收下那一下，这封也补进表、转给财务。"""
    for m in train():
        imap.deliver(m.raw)
    said = []
    api = Api(notify=lambda t, b: said.append(b))
    api.store.settings["excel_path"] = str(home / "out" / "知客僧.xlsx")
    api.add_account(imap.user, imap.password, ov(imap, smtp))
    fw = {"发票": ["finance@test.local"]}
    api.accept_recs([{"id": r["id"], "forward": fw.get(r["name"], [])} for r in api.recs()])
    imap.deliver(NEW_SUPPLIER)
    api.engine.run_once()
    assert not smtp.sent and "发票" in said[-1]                                # 没规则管：先不动，叫一声「拟了条规则」
    recs = api.recs()
    assert [(r["kind"], r["name"]) for r in recs] == [("extend", "发票")]
    out = api.accept_recs([{"id": recs[0]["id"]}])
    assert out["extended"] == 1 and out["caught_up"] == 1
    got = rows(api.store.settings["excel_path"], "发票")
    assert got[-1]["发票号"] == "BT-2026-118" and got[-1]["金额"] == 1234.0
    assert [s[1] for s in smtp.sent] == [["finance@test.local"]]
    api.engine.stop()
