"""0.2 精加工：转发信认原信、同义标签、防垃圾、数量/无年份日期、AI 兜底、PDF 附件、微软登录、自动更新。"""
import hashlib
import json
import threading
import urllib.parse
import urllib.request
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from openpyxl import load_workbook

from zhike import learn, oauth, rules as R, samples, updates
from zhike.mailparse import parse
from conftest import make_mail, order_mail


def rows(path, sheet):
    ws = load_workbook(path)[sheet]
    head = [c.value for c in ws[1]]
    return [dict(zip(head, [c.value for c in r])) for r in ws.iter_rows(min_row=2)]


def fwd_of(raw_inner_text, frm, subj, depth=2):
    body = f"---------- Forwarded message ---------\nFrom: {frm}\nDate: Mon, 2 Nov 2026 09:00:00 +0800\nSubject: {subj}\nTo: me@test.local\n\n{raw_inner_text}"
    s = subj
    for d in range(depth - 1):
        s = "Fwd: " + s
        body = f"转给你看下\n\n-----Original Message-----\nFrom: 同事A <a@ourco.example>\nSent: Monday, November 2, 2026 10:00 AM\nTo: b@ourco.example\nSubject: {s}\n\n{body}"
    return make_mail("Fwd: " + s, "帮忙录一下\n\n" + body, frm="同事B <b@ourco.example>")


# ---------- 转发信 ----------
def test_forward_unwrap_two_levels():
    m = parse(fwd_of("订单号：SM-9\n实付金额：¥10.00", "山门商贸 <orders@shanmen-shop.example>", "订单确认 #SM-9"))
    assert m.orig_from == "orders@shanmen-shop.example" and m.orig_from_name == "山门商贸"
    assert m.orig_subject == "订单确认 #SM-9"
    assert m.fwd_by == ["b@ourco.example", "a@ourco.example"]


def test_forward_unwrap_chinese_outlook_and_plain_mail_untouched():
    t = "回复一下\n\n发件人: 青石科技 <finance@qingshi-tech.example>\n发送时间: 2026年11月2日 9:00\n收件人: me@test.local\n主题: 11月服务费发票\n\n发票号码：QS-1"
    m = parse(make_mail("转发: 11月服务费发票", t, frm="a@ourco.example"))
    assert m.orig_from == "finance@qingshi-tech.example" and m.orig_subject == "11月服务费发票"
    plain = parse(order_mail("SM-1", "1.00"))
    assert not plain.forwarded and plain.orig_from == ""


def test_forwarded_order_matches_rule_by_original_sender(env):
    imap, eng, store = env["imap"], env["eng"], env["store"]
    inner = "您好，您的订单已确认。\n\n订单号：SM-77\n下单时间：2026-11-01 09:30\n实付金额：¥88.00\n联系人：王小明  电话：138-0013-8000"
    imap.deliver(fwd_of(inner, "山门商贸 <orders@shanmen-shop.example>", "订单确认 #SM-77"))
    eng.run_once()
    r = rows(store.settings["excel_path"], "订单")
    assert r[0]["订单号"] == "SM-77" and r[0]["金额"] == 88.0
    assert len(env["smtp"].sent) == 1          # 订单规则开着转发


# ---------- 同义标签 / 数量 / 日期 ----------
def test_synonym_labels():
    spec = learn.learn_field("订单号", [("订单号：SM-1\n", 4, 8)])
    for t in ("订单编号：SM-2", "订单号码: SM-2", "Order #: SM-2", "Order Number SM-2"):
        assert learn.extract(spec, t)["raw"] == "SM-2", t
    money = learn.learn_field("金额", [("实付金额：¥12.00", 5, 11)])
    assert learn.extract(money, "应付总额：￥99.50")["value"] == 99.5
    assert learn.extract(money, "金额合计：1,200.00 元")["value"] == 1200.0
    assert learn.extract(money, "Subtotal: $5.00") is None          # Subtotal 里的 Total 不算
    track = learn.learn_field("运单号", [("运单号：SF123456789\n", 4, 15)])
    assert learn.extract(track, "快递单号 SF987654321\n")["raw"] == "SF987654321"   # 没冒号只有空格


def test_qty_is_number_with_unit(home):
    spec = learn.learn_field("数量", [("数量：200 箱\n", 3, 8)])
    assert spec["type"] == "qty"
    v = learn.extract(spec, "数量：500 reams\n")["value"]
    assert v == 500 and v.unit == "reams"
    from zhike.excel import append_rows
    p = home / "q.xlsx"
    append_rows(p, "询价", [("数量", "qty")], [{"数量": v}])
    c = load_workbook(p)["询价"]["A2"]
    assert c.value == 500 and "reams" in c.number_format


def test_yearless_date_uses_mail_date():
    assert learn.parse_date("11月5日", datetime(2026, 11, 2)) == date(2026, 11, 5)
    assert learn.parse_date("1月3日", datetime(2026, 12, 28)) == date(2027, 1, 3)
    spec = learn.learn_field("预计送达", [("预计送达：11月5日\n", 5, 10)])
    m = parse(make_mail("快递", "预计送达：12月1日\n"))
    assert isinstance(learn.extract(spec, m)["value"], date)


# ---------- 防垃圾 ----------
def test_promo_with_matching_subject_is_held_then_released(env):
    imap, eng, store, smtp = env["imap"], env["eng"], env["store"], env["smtp"]
    store.rules[2]["forward"] = {"enabled": True, "to": ["sales@test.local"], "note": ""}
    store.rules[2]["fields"].append(learn.learn_field("产品", [("产品：A4 纸\n", 3, 7)]))
    imap.deliver(make_mail("询价 网站推广 首页排名 报价", "老板您好，网站首页排名服务，报价低至 999 元/月。\n电话：9000 0000",
                           frm="seo@rank-up.example"))
    eng.run_once()
    lg = store.state.data["log"][0]
    assert lg["rule"] is None and lg["held"] == "询价" and lg["junk"] == "promo"
    assert not smtp.sent and not Path(store.settings["excel_path"]).exists()
    eng.release(lg["id"])
    assert len(smtp.sent) == 1 and rows(store.settings["excel_path"], "询价")


def test_complete_order_with_unsubscribe_footer_still_processed(env):
    imap, eng, store = env["imap"], env["eng"], env["store"]
    raw = make_mail("订单确认 #SM-5", "订单号：SM-5\n下单时间：2026-11-01 09:30\n实付金额：¥5.00\n联系人：甲  电话：138-0000-0000\n\n退订请回复 TD")
    imap.deliver(raw)
    eng.run_once()
    assert rows(store.settings["excel_path"], "订单")[0]["订单号"] == "SM-5"


def test_lookalike_domain_held(env):
    imap, eng, store = env["imap"], env["eng"], env["store"]
    store.rules[0]["conditions"] = {"from": ["@shanmen-shop.example"], "subject": [], "body": [], "exclude": []}
    imap.deliver(make_mail("订单确认 #X", "订单号：X1\n实付金额：¥1.00", frm="orders@shanmen-sh0p.example"))
    imap.deliver(make_mail("订单确认 #Y", "订单号：Y1\n实付金额：¥1.00", frm="orders@shanmen-shop.example"))
    eng.run_once()
    # 冒充域名本来就对不上发件人条件；这里看的是 junk_reason 认得出它
    m = parse(make_mail("x", "y", frm="orders@shanmen-sh0p.example"))
    assert R.junk_reason(m, store.rules) == "lookalike"


def test_exclude_words():
    rule = R.new_rule("询价")
    rule["conditions"]["subject"] = ["询价"]
    rule["conditions"]["exclude"] = ["推广"]
    assert R.matches(rule, parse(make_mail("询价 A4", "x")))
    assert not R.matches(rule, parse(make_mail("询价 网站推广", "x")))


def test_content_match_for_open_sender_rule():
    ms = samples.mails()
    rule = R.new_rule("询价")
    rule["conditions"]["subject"] = ["询价"]
    t = "产品：A4 纸\n数量：200 箱\n联系电话：+65 9123 4567\n"
    for n, a, b in (("产品", 3, 7), ("数量", 11, 16), ("电话", 22, 36)):
        rule["fields"].append(learn.learn_field(n, [(t, a, b)]))
    m = parse(make_mail("Price enquiry", "Product: A4 paper\nQuantity: 20 reams\nPhone: +65 8000 1111\n", frm="x@buyer.example"))
    assert R.first_match([rule], m) is rule
    rule["conditions"]["from"] = ["@shop.example"]         # 限了发件人就不按内容认
    assert R.first_match([rule], m) is None
    assert ms


# ---------- AI 兜底 ----------
def test_ai_fills_missing_fields_only_if_in_text(env):
    eng, sec, g = env["eng"], env["sec"], env["gemini"]
    sec.set("ai:gemini", "k")
    rule = R.new_rule("询价")
    rule["conditions"]["subject"] = ["报价"]
    rule["fields"].append(learn.learn_field("数量", [("数量：200 箱\n", 3, 8)]))
    rule["fields"].append(learn.learn_field("产品", [("产品：A4 纸\n", 3, 7)]))
    m = parse(make_mail("报价请求", "我们想订 300 箱 A4 复印纸，麻烦报个价。", frm="c@buyer.example"))
    g.body = {"candidates": [{"content": {"parts": [{"text": '```json\n{"数量": "300 箱", "产品": "金条"}\n```'}]}}]}
    f = eng.extract(rule, m)
    assert f["数量"]["raw"] == "300 箱" and f["数量"]["value"] == 300 and f["数量"]["by"] == "ai"
    assert f["产品"] is None                       # 「金条」原文里没有，不要


# ---------- PDF 附件 ----------
def test_pdf_attachment_text_is_extractable():
    pdf = samples.make_pdf(["Invoice No: INV-5", "Amount Due: S$1,234.50"])
    m = parse(make_mail("Invoice", "See attached.", atts=[("INV-5.pdf", pdf)], frm="Lotus Billing <b@lotus.example>"))
    assert "—— 附件 INV-5.pdf ——" in m.text and m.body == "See attached."
    assert m.from_name == "Lotus Billing"
    spec = learn.learn_field("应付", [("Amount Due: S$9.00", 12, 18)])
    assert learn.extract(spec, m)["value"] == 1234.5
    bad = parse(make_mail("x", "y", atts=[("broken.pdf", b"%PDF-1.4 junk")]))
    assert bad.text == "y"


def test_forward_does_not_quote_pdf_text(env):
    from zhike.mailbox import build_forward
    pdf = samples.make_pdf(["SECRET-PDF-LINE"])
    m = parse(make_mail("Invoice", "See attached.", atts=[("a.pdf", pdf)]))
    out = build_forward(m, "me@test.local", ["x@test.local"])
    assert "SECRET-PDF-LINE" not in out.get_body(("plain",)).get_content()


# ---------- 微软登录 ----------
class FakeMs:
    def __init__(self):
        self.calls = []
        owner = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                n = int(self.headers.get("Content-Length", 0))
                q = dict(urllib.parse.parse_qsl(self.rfile.read(n).decode()))
                owner.calls.append(q)
                if q.get("grant_type") == "refresh_token" and q.get("refresh_token") == "dead":
                    body, code = {"error": "invalid_grant", "error_description": "expired"}, 400
                else:
                    body, code = {"access_token": "ms-access-token", "refresh_token": "r2", "expires_in": 3600}, 200
                data = json.dumps(body).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.base = f"http://127.0.0.1:{self.srv.server_address[1]}"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()


def fake_browser(url):
    """装作用户在微软页面上点了「接受」：直接打回调地址。"""
    q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(url).query))
    assert q["code_challenge_method"] == "S256" and "IMAP.AccessAsUser.All" in q["scope"]
    cb = q["redirect_uri"] + "/?" + urllib.parse.urlencode({"code": "c1", "state": q["state"]})
    threading.Thread(target=lambda: urllib.request.urlopen(cb, timeout=5).read(), daemon=True).start()


def test_microsoft_login_and_xoauth2(home, imap, smtp, monkeypatch):
    ms = FakeMs()
    monkeypatch.setenv("ZHIKE_MS_CLIENT_ID", "test-client")
    monkeypatch.setenv("ZHIKE_MS_AUTHORITY", ms.base)
    from zhike.api import Api
    from zhike.fakeservers import account_for
    api = Api()
    api._browser = fake_browser
    assert api.boot()["ms_login"] is True
    base = account_for(imap, smtp)
    monkeypatch.setattr("zhike.api.account_from", lambda e, p=None, **k: {**base, "provider": "outlook"})
    res = api.add_microsoft(imap.user)
    assert res["ok"], res
    acct = api.store.accounts[0]
    assert acct["auth"] == "oauth" and not api.secrets.get(f"pw:{acct['id']}")
    assert ms.calls[0]["grant_type"] == "authorization_code" and ms.calls[0]["code_verifier"]
    rules = samples.demo_rules()
    rules[0]["forward"]["to"] = ["boss@test.local"]
    api.engine.store.config.data["rules"] = rules      # 先放规则再投信：后台线程先跑到也照规则办
    imap.deliver(order_mail("SM-1", "1.00"))
    api.engine.run_once()
    assert len(smtp.sent) == 1            # SMTP 也走 XOAUTH2
    api.engine.stop()


def test_microsoft_token_refresh_and_expiry(home, monkeypatch):
    ms = FakeMs()
    monkeypatch.setenv("ZHIKE_MS_CLIENT_ID", "test-client")
    monkeypatch.setenv("ZHIKE_MS_AUTHORITY", ms.base)
    from zhike.secrets import Secrets
    sec = Secrets(home)
    ts = oauth.TokenStore(sec)
    ts.save("a", {"access_token": "old", "refresh_token": "r1", "expires_at": 0})
    assert ts.access_token("a") == "ms-access-token"
    assert json.loads(sec.get("ms:a"))["refresh_token"] == "r2"
    ts.save("b", {"access_token": "old", "refresh_token": "dead", "expires_at": 0})
    with pytest.raises(oauth.OAuthError) as e:
        ts.access_token("b")
    assert e.value.code == "expired"


def test_microsoft_unavailable_without_client_id(home, monkeypatch):
    monkeypatch.delenv("ZHIKE_MS_CLIENT_ID", raising=False)
    monkeypatch.setattr(oauth, "CLIENT_ID", "")
    from zhike.api import Api
    assert Api().add_microsoft("x@outlook.com") == {"ok": False, "code": "ms_soon"}


# ---------- 自动更新 ----------
def serve_files(files: dict):
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            data = files.get(self.path)
            self.send_response(200 if data is not None else 404)
            self.end_headers()
            if data is not None:
                self.wfile.write(data)

        def log_message(self, *a):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def test_update_download_verify_swap(tmp_path):
    new = b"MZ new exe 9.9.9" * 1000
    files = {}
    srv, base = serve_files(files)
    files["/Zhike.exe"] = new
    files["/version.json"] = json.dumps({"version": "9.9.9", "url": base + "/Zhike.exe",
                                         "sha256": hashlib.sha256(new).hexdigest(), "size": len(new)}).encode()
    exe = tmp_path / "Zhike.exe"
    exe.write_bytes(b"MZ old")
    info = updates.check(url=base + "/version.json")
    assert info["newer"] and info["latest"] == "9.9.9"
    assert updates.download(info, exe)
    assert updates.pending(exe) == "9.9.9"
    assert updates.swap(exe)
    assert exe.read_bytes() == new and (tmp_path / "Zhike.exe.old").read_bytes() == b"MZ old"
    assert updates.pending(exe) is None
    # 被改过的下载：sha256 对不上就不要
    files["/Zhike.exe"] = b"tampered"
    exe2 = tmp_path / "b" / "Zhike.exe"
    exe2.parent.mkdir()
    exe2.write_bytes(b"MZ old")
    assert not updates.download(info, exe2)
    assert exe2.read_bytes() == b"MZ old" and not (tmp_path / "b" / "Zhike.exe.new").exists()
    srv.shutdown()


def test_update_not_newer(tmp_path):
    files = {"/version.json": json.dumps({"version": "0.0.1", "sha256": "x"}).encode()}
    srv, base = serve_files(files)
    info = updates.check(url=base + "/version.json")
    assert info["newer"] is False and not updates.download(info, tmp_path / "Zhike.exe")
    srv.shutdown()
