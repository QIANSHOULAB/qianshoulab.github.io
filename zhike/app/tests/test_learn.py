from datetime import date, datetime

from zhike import learn
from zhike.mailparse import parse
from conftest import make_mail


def pick(text, v):
    s = text.index(v)
    return (text, s, s + len(v))


T1 = "订单号：A2024-0017  金额：¥1,280.50\n联系人：王小明 电话：13800138000\n下单日期 2026-10-31\n\nShip To\nJane Doe\n"
T2 = "订单号： B77-9  金额：￥99\n联系人：李雷 电话：13912345678\n下单日期 2026年11月1日\n\nShip To\nBob Lee\n"


def test_same_line_label_and_types():
    cases = {"A2024-0017": ("B77-9", "id"), "¥1,280.50": ("￥99", "money"), "王小明": ("李雷", "text"),
             "13800138000": ("13912345678", "phone"), "Jane Doe": ("Bob Lee", "text")}
    for v, (want, kind) in cases.items():
        spec = learn.learn_field("x", [pick(T1, v)])
        assert spec["type"] == kind, (v, spec)
        assert learn.extract(spec, T2)["raw"] == want, (v, spec)


def test_typed_values():
    assert learn.to_typed("money", "¥1,280.50") == 1280.5
    assert learn.to_typed("money", "S$2,430.00") == 2430.0
    assert learn.to_typed("date", "2026年11月1日") == date(2026, 11, 1)
    assert learn.to_typed("date", "30 Nov 2026") == date(2026, 11, 30)
    assert learn.to_typed("date", "2026-11-01 09:30") == datetime(2026, 11, 1, 9, 30)


def test_two_examples_two_label_spellings():
    a = "Order No: X-1\nTotal: $5.00"
    b = "订单编号：Y-22\n合计：¥8.00"
    spec = learn.learn_field("订单号", [pick(a, "X-1"), pick(b, "Y-22")])
    assert set(spec["labels"]) == {"Order No:", "订单编号:"}
    assert learn.extract(spec, "blah\nOrder No:  Z-333\n")["raw"] == "Z-333"
    assert learn.extract(spec, "订单编号：Q-4")["raw"] == "Q-4"


def test_missing_field_is_none_not_a_guess():
    spec = learn.learn_field("金额", [pick(T1, "¥1,280.50")])
    assert learn.extract(spec, "这封信里没有金额这个标签 ¥5.00") is None


def test_no_label_falls_back_to_nth_of_type():
    t = "a@x.com\n请联系 b@y.com 或 c@z.com"
    spec = learn.learn_field("邮箱", [pick(t, "a@x.com")])
    assert spec["labels"] == [] and spec["type"] == "email"
    assert learn.extract(spec, "z@q.com 然后 w@e.com")["raw"] == "z@q.com"


def test_html_table_mail():
    raw = make_mail("Invoice", "", html="<table><tr><td>Invoice No</td><td>INV-1</td></tr><tr><td>Amount Due</td><td>S$9.90</td></tr></table>")
    # 只有 HTML 正文的信
    import email
    msg = email.message_from_bytes(raw)
    m = parse(raw)
    assert "Invoice No  INV-1" in m.text or "Invoice No" in m.text
    spec = learn.learn_field("应付", [pick(m.text, "S$9.90")])
    raw2 = make_mail("Invoice", "", html="<table><tr><td>Invoice No</td><td>INV-2</td></tr><tr><td>Amount Due</td><td>S$1,000.00</td></tr></table>")
    assert learn.extract(spec, parse(raw2))["value"] == 1000.0


def test_attachments_and_builtins():
    raw = make_mail("订单确认 #1", "订单号：1", atts=[("a.pdf", b"x"), ("b.pdf", b"y")])
    m = parse(raw)
    assert m.attachments == ["a.pdf", "b.pdf"]
    assert learn.extract({"name": "附件", "builtin": "@attachments"}, m)["raw"] == "a.pdf; b.pdf"
    assert learn.extract({"name": "发件人", "builtin": "@from"}, m)["raw"] == "orders@shanmen-shop.example"


def test_suggest_fields():
    names = [s["name"] for s in learn.suggest_fields("订单号：A1  金额：¥3\n联系人：王小明 电话：138\n时间：2026-10-31 14:20\n")]
    assert names == ["订单号", "金额", "联系人", "电话", "时间"]


def test_gb18030_mail():
    from email.message import EmailMessage
    m = EmailMessage()
    m["From"] = "x@qq.com"
    m["Subject"] = "测试"
    m.set_content("金额：¥12.00", charset="gb18030")
    assert "¥12.00" in parse(m.as_bytes()).text


def test_demo_rules_extract_everything():
    from zhike import samples
    ms = samples.mails()
    rules = samples.demo_rules(ms)
    got = learn.extract_all(rules[0]["fields"], ms[5])
    assert got["订单号"]["raw"] == "SM20261102-0003"
    assert got["金额"]["value"] == 89.9
    assert got["联系人"]["raw"] == "韩梅梅"
    assert got["电话"]["raw"] == "135-0000-1111"
