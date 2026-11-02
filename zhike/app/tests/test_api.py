from zhike.api import Api
from zhike.fakeservers import free_port
from conftest import order_mail


def test_demo_first_open(home):
    api = Api()
    b = api.boot()
    assert b["demo"] and [r["name"] for r in b["rules"]] == ["订单", "发票", "询价"]
    ms = api.mails()
    assert len(ms) == 6 and sum(1 for m in ms if m["rule"]) == 5
    assert api.table(b["rules"][0]["id"])["rows"][0]["订单号"]
    assert api.drafts()[0]["saved"] == "demo"


def test_learn_through_api(home):
    api = Api()
    m = next(x for x in api.mails() if x["subject"] == "本周十大摸鱼技巧（第 42 期）")
    r = api.new_rule(m["key"])
    assert r["conditions"]["from"] == ["@weekly.example"]
    full = api.engine.find_mail(m["key"])
    s = full.text.index("没有规则")
    r = api.learn(r["id"], "说法", m["key"], s, s + 4)
    assert any(f["name"] == "说法" for f in r["fields"])
    again = next(x for x in api.mails() if x["key"] == m["key"])
    assert again["rule"]["id"] == r["id"]


def test_add_account_flow(home, imap, smtp):
    api = Api()
    ov = {"provider": "custom", "imap_host": "127.0.0.1", "imap_port": imap.port, "imap_security": "plain",
          "smtp_host": "127.0.0.1", "smtp_port": smtp.port, "smtp_security": "plain"}
    assert api.add_account(imap.user, "bad", ov) == {"ok": False, "code": "auth"}
    bad = dict(ov, imap_port=free_port())
    assert api.add_account(imap.user, imap.password, bad)["code"] == "net"
    assert api.add_account("x@unknown-host.example", "p")["code"] == "need_server"
    imap.deliver(order_mail("OLD", "1"))
    res = api.add_account(imap.user, imap.password, ov)
    assert res["ok"] and res["samples"] == 1
    assert not api.boot()["demo"] and api.boot()["rules"] == []
    assert "app-pass" not in (api.store.root / "config.json").read_text(encoding="utf-8")   # 密码不进明文配置
    api.engine.stop()


def test_ai_key_errors(home, gemini):
    api = Api()
    api.engine.ai_base = gemini.base
    gemini.status = 400
    assert api.set_ai_key("bad")["code"] == "ai_key"
    gemini.status = 429
    assert api.set_ai_key("k1")["ok"]            # 额度暂时没了也先存
    gemini.status = 200
    assert api.set_ai_key("k2")["ok"] and api.boot()["has_ai_key"]
    api.engine.ai_base = f"http://127.0.0.1:{free_port()}/v1beta"
    assert api.set_ai_key("k3")["code"] == "ai_net"
    assert api.set_ai_key("")["cleared"] and not api.boot()["has_ai_key"]
