import email
import email.policy

from openpyxl import load_workbook

from zhike.excel import lock_file
from zhike.fakeservers import free_port
from conftest import make_mail, order_mail


def rows(path, sheet):
    ws = load_workbook(path)[sheet]
    head = [c.value for c in ws[1]]
    return [dict(zip(head, [c.value for c in r])) for r in ws.iter_rows(min_row=2)]


def ask_mail():
    return make_mail("想问下复印纸报价", "你好，想问 A4 纸价格。\n电话：9123 4567", frm="陈先生 <chen@buyer.example>")


def test_end_to_end(env):
    imap, smtp, eng, store = env["imap"], env["smtp"], env["eng"], env["store"]
    imap.deliver(order_mail("SM-1", "1,280.50"))
    imap.deliver(order_mail("SM-2", "356.00", who="李雷"))
    imap.deliver(ask_mail())
    imap.deliver(make_mail("周报", "没人管", frm="news@weekly.example"))
    res = eng.run_once()
    assert res["new"] == 4 and not res["errors"]
    xl = store.settings["excel_path"]
    r = rows(xl, "订单")
    assert [x["订单号"] for x in r] == ["SM-1", "SM-2"]
    assert r[0]["金额"] == 1280.5 and r[1]["联系人"] == "李雷" and r[0]["附件"] == "发票_SM-1.pdf"
    assert rows(xl, "询价")[0]["电话"] == "9123 4567"
    # 订单转发给老板，带附件
    assert len(smtp.sent) == 2 and all(s[1] == ["boss@test.local"] for s in smtp.sent)
    fw = email.message_from_bytes(smtp.sent[0][2], policy=email.policy.default)
    assert fw["Subject"].startswith("Fwd:") and [p.get_filename() for p in fw.iter_attachments()] == ["发票_SM-1.pdf"]
    # 询价只存草稿，绝不发出：SMTP 上没有发给陈先生的信
    assert not any("chen@buyer.example" in s[1] for s in smtp.sent)
    assert len(imap.drafts) == 1
    d = email.message_from_bytes(imap.drafts[0]["raw"], policy=email.policy.default)
    assert d["To"] == "chen@buyer.example" and d["Subject"].startswith("Re:")
    assert store.state.data["drafts"][0]["saved"] == "ok"
    # 再跑一遍：不重复
    eng.run_once()
    assert len(rows(xl, "订单")) == 2 and len(smtp.sent) == 2 and len(imap.drafts) == 1


def test_no_loop_on_own_forwards(env):
    imap, smtp, eng = env["imap"], env["smtp"], env["eng"]
    imap.deliver(order_mail("SM-1", "1.00"))
    eng.run_once()
    imap.deliver(smtp.sent[0][2])          # 转发出去的信又回到收件箱
    eng.run_once()
    assert len(smtp.sent) == 1


def test_network_down_then_back(env):
    imap, eng, store, acct = env["imap"], env["eng"], env["store"], env["acct"]
    real = acct["imap_port"]
    acct["imap_port"] = free_port()
    res = eng.run_once()
    assert res["errors"] == [("t1", "net")]
    st = eng.status["t1"]
    assert st["state"] == "net" and st["retry_in"] == 15     # 刚开机网常常还没通：15 秒就再试
    assert 5 <= eng.next_wait() <= 15                         # 后台线程到点就醒，不等满「多久看一次」
    eng.run_once()                      # 退避期间不去连
    assert eng.status["t1"]["fails"] == 1
    eng.started_at -= 600               # 开机过了一阵子：照常退避
    st["next_at"] = 0
    eng.run_once()
    assert eng.status["t1"]["retry_in"] == 240   # 翻倍
    acct["imap_port"] = real
    imap.deliver(order_mail("SM-9", "9.00"))
    res = eng.run_once(only="t1")
    assert res["new"] == 1 and eng.status["t1"]["state"] == "ok"
    assert rows(store.settings["excel_path"], "订单")[0]["订单号"] == "SM-9"


def test_forward_net_fail_retries_without_duplicate_row(env):
    imap, smtp, eng, store, acct = env["imap"], env["smtp"], env["eng"], env["store"], env["acct"]
    real = acct["smtp_port"]
    acct["smtp_port"] = free_port()
    imap.deliver(order_mail("SM-1", "1.00"))
    eng.run_once()
    assert store.state.data["log"][0]["forward"] == "net" and store.state.data["retry"]
    acct["smtp_port"] = real
    eng.run_once()
    assert len(smtp.sent) == 1
    assert len(rows(store.settings["excel_path"], "订单")) == 1
    assert store.state.data["log"][0]["forward"] == "ok" and not store.state.data["retry"]


def test_wrong_password_pauses_only_that_account(env):
    imap, eng, sec = env["imap"], env["eng"], env["sec"]
    sec.set("pw:t1", "wrong")
    res = eng.run_once()
    assert res["errors"] == [("t1", "auth")] and eng.status["t1"]["state"] == "auth"
    logins = imap.logins
    eng.run_once()
    assert imap.logins == logins           # 停住，不反复撞密码（免得被邮箱锁号）
    sec.set("pw:t1", imap.password)
    eng.run_once(only="t1")
    assert eng.status["t1"]["state"] == "ok"


def test_mailbox_full(env):
    imap, smtp, eng, store = env["imap"], env["smtp"], env["eng"], env["store"]
    imap.quota_full = True
    smtp.quota_full = True
    imap.deliver(ask_mail())
    imap.deliver(order_mail("SM-1", "1.00"))
    eng.run_once()
    logs = {l["rule"]: l for l in store.state.data["log"]}
    assert logs["询价"]["draft"] == "quota"
    assert logs["订单"]["forward"] == "quota"
    assert store.state.data["drafts"][0]["saved"] == "quota"      # 草稿还在知客僧里，能复制
    assert not store.state.data.get("retry")                        # 满了不重试


def test_ai_draft_and_failures(env):
    imap, eng, sec, g, store = env["imap"], env["eng"], env["sec"], env["gemini"], env["store"]
    sec.set("ai:gemini", "test-key")
    imap.deliver(ask_mail())
    eng.run_once()
    lg = store.state.data["log"][0]
    assert lg["draft_mode"] == "ai" and "AI 写的回复" in store.state.data["drafts"][0]["body"]
    assert g.calls[0][1] == "test-key" and "复印纸" in g.calls[0][2]["contents"][0]["parts"][0]["text"]
    for status, code in [(429, "quota"), (400, "key"), (500, "other")]:
        g.status = status
        imap.deliver(ask_mail())
        eng.run_once()
        lg = store.state.data["log"][0]
        assert lg["draft_mode"] == "template" and lg["ai_error"] == code
        assert "您好" in store.state.data["drafts"][0]["body"]
    eng.ai_base = f"http://127.0.0.1:{free_port()}/v1beta"
    imap.deliver(ask_mail())
    eng.run_once()
    assert store.state.data["log"][0]["ai_error"] == "net"


def test_excel_locked_then_released(env):
    imap, eng, store = env["imap"], env["eng"], env["store"]
    xl = store.settings["excel_path"]
    imap.deliver(order_mail("SM-1", "1.00"))
    eng.run_once()
    lk = lock_file(xl)
    lk.write_text("someone")              # 模拟 Excel 正开着这个文件
    imap.deliver(order_mail("SM-2", "2.00"))
    imap.deliver(order_mail("SM-3", "3.00"))
    eng.run_once()
    assert store.state.data["log"][0]["excel"] == "pending"
    assert len(store.state.data["pending_rows"]) == 2
    assert len(rows(xl, "订单")) == 1
    eng.run_once()                         # 还占着：继续排队，不丢不重
    assert len(store.state.data["pending_rows"]) == 2
    lk.unlink()
    eng.run_once()
    assert [r["订单号"] for r in rows(xl, "订单")] == ["SM-1", "SM-2", "SM-3"]
    assert store.state.data["pending_rows"] == []


def test_excel_permission_error(env, monkeypatch):
    import zhike.excel as X
    imap, eng, store = env["imap"], env["eng"], env["store"]
    real = X._replace

    def deny(*a):
        raise PermissionError("in use")

    monkeypatch.setattr(X, "_replace", deny)
    imap.deliver(order_mail("SM-1", "1.00"))
    eng.run_once()
    assert len(store.state.data["pending_rows"]) == 1
    monkeypatch.setattr(X, "_replace", real)
    assert eng.flush_excel()["written"] == 1


def test_uidvalidity_reset(env):
    imap, eng, store = env["imap"], env["eng"], env["store"]
    imap.deliver(order_mail("SM-1", "1.00"))
    eng.run_once()
    imap.uidvalidity += 1
    assert eng.run_once()["new"] == 0
    imap.deliver(order_mail("SM-2", "2.00"))
    eng.run_once()
    assert [r["订单号"] for r in rows(store.settings["excel_path"], "订单")] == ["SM-1", "SM-2"]


def test_new_account_skips_old_mail(home, imap, smtp, gemini):
    from zhike.engine import Engine
    from zhike.fakeservers import account_for
    from zhike.secrets import Secrets
    from zhike.store import Store
    imap.deliver(order_mail("OLD-1", "1.00"))
    store = Store()
    sec = Secrets(store.root)
    acct = account_for(imap, smtp)
    store.accounts.append(acct)
    sec.set("pw:t1", imap.password)
    eng = Engine(store, sec)
    samples = eng.connect_new(acct)
    assert [m.subject for m in samples] == ["订单确认 #OLD-1"]      # 当样例
    assert eng.run_once()["new"] == 0                                # 不当新信处理
    assert eng.samples()[0].subject == "订单确认 #OLD-1"


def test_broken_config_recovers(home):
    from zhike.store import Store
    s = Store()
    s.config.save()
    (s.root / "config.json").write_text("{坏了", encoding="utf-8")
    s2 = Store()
    assert s2.rules == [] and (s.root / "config.broken.json").exists()
