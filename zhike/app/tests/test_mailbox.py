import pytest

from zhike.fakeservers import FakeImap, account_for, free_port
from zhike.mailbox import (AuthError, Imap, NetError, QuotaError, Smtp, account_from, build_draft, build_forward,
                           imap_utf7_decode, imap_utf7_encode)
from zhike.mailbox import test_account as check_account
from zhike.mailparse import parse
from conftest import order_mail


def test_presets():
    a = account_from("someone@qq.com")
    assert a["imap_host"] == "imap.qq.com" and a["smtp_port"] == 465
    assert account_from("x@outlook.com")["smtp_security"] == "starttls"
    assert account_from("x@mycorp.example")["provider"] == "custom"


def test_utf7_roundtrip():
    assert imap_utf7_encode("草稿箱") == "&g0l6P3ux-"
    assert imap_utf7_decode("&g0l6P3ux-") == "草稿箱"
    assert imap_utf7_decode("A&-B") == "A&B"


def test_fetch_and_uid_filter(imap, smtp):
    acct = account_for(imap, smtp)
    imap.deliver(order_mail("A-1", "1.00"))
    imap.deliver(order_mail("A-2", "2.00"))
    with Imap(acct, imap.password) as im:
        uv, n = im.select_inbox()
        assert uv == imap.uidvalidity and n == 2
        assert im.uids_after(0) == [1, 2]
        assert im.uids_after(2) == []          # 服务器会回 2，要滤掉
        ms = im.fetch([1, 2])
        assert [m.subject for m in ms] == ["订单确认 #A-1", "订单确认 #A-2"]
    assert not any("\\Seen" in x["flags"] for x in imap.boxes["INBOX"].msgs)   # 只看不标已读


def test_wrong_password(imap, smtp):
    acct = account_for(imap, smtp)
    with pytest.raises(AuthError):
        Imap(acct, "nope").connect()
    with pytest.raises(AuthError):
        check_account(acct, "nope")


def test_network_down(imap, smtp):
    acct = account_for(imap, smtp)
    acct["imap_port"] = free_port()
    with pytest.raises(NetError):
        Imap(acct, imap.password, timeout=3).connect()
    acct["smtp_port"] = free_port()
    with pytest.raises(NetError):
        Smtp(acct, "x", timeout=3).send(parse(order_mail("A", "1")) and _msg())


def _msg():
    from email.message import EmailMessage
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = "me@test.local", "a@test.local", "x"
    m.set_content("x")
    return m


def test_cut_mid_session(imap, smtp):
    acct = account_for(imap, smtp)
    imap.cut_after_login = True
    with pytest.raises(NetError):
        with Imap(acct, imap.password, timeout=3) as im:
            im.select_inbox()


def test_draft_and_quota(imap, smtp):
    acct = account_for(imap, smtp)
    m = parse(order_mail("A-1", "1.00"))
    with Imap(acct, imap.password) as im:
        assert im.append_draft(build_draft(m, acct["email"], "好的")) == "Drafts"
    assert len(imap.drafts) == 1 and b"In-Reply-To" in imap.drafts[0]["raw"]
    imap.quota_full = True
    with pytest.raises(QuotaError):
        with Imap(acct, imap.password) as im:
            im.append_draft(build_draft(m, acct["email"], "好的"))


def test_qq_style_drafts_folder(smtp):
    s = FakeImap(drafts_name="&g0l6P3ux-", special_use=False).start()
    try:
        acct = account_for(s, smtp)
        with Imap(acct, s.password) as im:
            assert im.append_draft(build_draft(parse(order_mail("A", "1")), acct["email"], "hi")) == "草稿箱"
        assert len(s.drafts) == 1
    finally:
        s.stop()


def test_smtp_forward_auth_and_quota(imap, smtp):
    acct = account_for(imap, smtp)
    m = parse(order_mail("A-1", "1.00"))
    fw = build_forward(m, acct["email"], ["boss@test.local"])
    Smtp(acct, smtp.password).send(fw)
    frm, rcpt, data = smtp.sent[-1]
    assert rcpt == ["boss@test.local"] and b"X-Zhike: forwarded" in data and "发票_A-1.pdf".encode() in data or b"filename" in data
    with pytest.raises(AuthError):
        Smtp(acct, "wrong").send(fw)
    smtp.quota_full = True
    with pytest.raises(QuotaError):
        Smtp(acct, smtp.password).send(fw)


def test_account_check_ok(imap, smtp):
    assert check_account(account_for(imap, smtp), imap.password)["count"] == 0
