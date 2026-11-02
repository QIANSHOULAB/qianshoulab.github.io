"""第一次打开就有的示例邮件和示例规则。公司、人名、邮箱全是编的（.example 域名）。"""
from __future__ import annotations

from email.message import EmailMessage
from email.utils import format_datetime
from datetime import datetime, timedelta, timezone

from . import learn
from .mailparse import parse
from .rules import new_rule

SG = timezone(timedelta(hours=8))


def _msg(i, frm, subj, text, when, html=None, atts=()):
    m = EmailMessage()
    m["From"] = frm
    m["To"] = "me@yourcompany.example"
    m["Subject"] = subj
    m["Date"] = format_datetime(when)
    m["Message-ID"] = f"<demo-{i}@zhike.example>"
    m.set_content(text)
    if html:
        m.add_alternative(html, subtype="html")
    for name, data in atts:
        m.add_attachment(data, maintype="application", subtype="pdf", filename=name)
    return m.as_bytes()


def _order(i, no, when, amount, who, phone, addr):
    text = f"""您好，您的订单已确认。

订单号：{no}
下单时间：{when:%Y-%m-%d %H:%M}
实付金额：¥{amount}
联系人：{who}  电话：{phone}
收货地址：{addr}

山门商贸 · 客服部
"""
    return _msg(i, "山门商贸 <orders@shanmen-shop.example>", f"订单确认 #{no}", text, when,
                atts=[(f"发票_{no}.pdf", b"%PDF-1.4 demo")])


def raw_samples():
    base = datetime(2026, 11, 2, 9, 12, tzinfo=SG)
    out = [
        _order(1, "SM20261101-0042", base - timedelta(days=1, hours=2), "1,280.50", "王小明", "138-0013-8000", "新加坡 淡滨尼 21 街 88 号"),
        _order(2, "SM20261101-0057", base - timedelta(days=1), "356.00", "李雷", "139-1234-5678", "上海市 浦东新区 张江路 1 号"),
        _msg(3, "Lotus Supplies Billing <billing@lotus-supplies.example>", "Invoice INV-88213 from Lotus Supplies",
             "Invoice No: INV-88213\nAmount Due: S$2,430.00\nDue Date: 30 Nov 2026\n\nThank you for your business.",
             base - timedelta(hours=20),
             html="""<html><body><p>Hi there,</p><table>
<tr><td>Invoice No</td><td>INV-88213</td></tr>
<tr><td>Amount Due</td><td>S$2,430.00</td></tr>
<tr><td>Due Date</td><td>30 Nov 2026</td></tr></table>
<p>Thank you for your business.<br>Lotus Supplies Pte Ltd</p></body></html>""",
             atts=[("INV-88213.pdf", b"%PDF-1.4 demo")]),
        _msg(4, "陈先生 <chen.k@example.com>", "想问下 A4 复印纸的批发价",
             "你好，\n\n我们公司每月大概要 200 箱 A4 复印纸（70g），想问下批发价和多久能送到。\n"
             "地址在裕廊东。方便的话给个报价单。\n\n谢谢\n陈先生\n电话：9123 4567", base - timedelta(hours=3)),
        _msg(5, "千手周报 <news@weekly.example>", "本周十大摸鱼技巧（第 42 期）",
             "这是一封没人管的周报。没有规则认领它，知客僧就当没看见。", base - timedelta(hours=2)),
        _order(6, "SM20261102-0003", base, "89.90", "韩梅梅", "135-0000-1111", "新加坡 乌节路 9 号"),
    ]
    return out


def mails():
    return [parse(r, uid=i + 1) for i, r in enumerate(raw_samples())]


def _pick(mail, value):
    s = mail.text.index(value)
    return (mail.text, s, s + len(value))


def demo_rules(ms=None):
    """示例规则全是从示例邮件里「点选」学出来的，跟用户自己点选走同一条路。"""
    ms = ms or mails()
    o1, o2, inv, ask = ms[0], ms[1], ms[2], ms[3]
    r1 = new_rule("订单")
    r1["conditions"] = {"from": ["@shanmen-shop.example"], "subject": ["订单确认"], "body": []}
    for name, v1, v2 in [("订单号", "SM20261101-0042", "SM20261101-0057"),
                         ("下单时间", "2026-11-01 07:12", "2026-11-01 09:12"),
                         ("金额", "¥1,280.50", "¥356.00"),
                         ("联系人", "王小明", "李雷"),
                         ("电话", "138-0013-8000", "139-1234-5678")]:
        r1["fields"].append(learn.learn_field(name, [_pick(o1, v1), _pick(o2, v2)]))
    r1["fields"].append({"name": "附件", "builtin": "@attachments", "type": "text"})
    r1["forward"] = {"enabled": True, "to": ["finance@yourcompany.example"], "note": ""}

    r2 = new_rule("发票")
    r2["conditions"] = {"from": ["@lotus-supplies.example"], "subject": ["invoice"], "body": []}
    for name, v in [("发票号", "INV-88213"), ("应付", "S$2,430.00"), ("到期日", "30 Nov 2026")]:
        r2["fields"].append(learn.learn_field(name, [_pick(inv, v)]))
    r2["fields"].append({"name": "附件", "builtin": "@attachments", "type": "text"})

    r3 = new_rule("询价")
    r3["conditions"] = {"from": [], "subject": ["价", "报价", "quote"], "body": []}
    r3["fields"].append({"name": "主题", "builtin": "@subject", "type": "text"})
    r3["fields"].append(learn.learn_field("电话", [_pick(ask, "9123 4567")]))
    r3["reply"] = {"enabled": True, "mode": "auto",
                   "template": "{称呼}您好，\n\n收到，谢谢关注。报价单我们今天整理好发您，"
                               "送货时间一般是下单后 2 个工作日。\n\n有问题随时找我。",
                   "hint": "语气客气，先确认需求，报价说今天发"}
    return [r1, r2, r3]
