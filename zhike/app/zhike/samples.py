"""第一次打开就有的示例邮件和示例规则。公司、人名、邮箱全是编的（.example 域名）。"""
from __future__ import annotations

from email.message import EmailMessage
from email.utils import format_datetime
from datetime import datetime, timedelta, timezone

from . import learn
from .mailparse import parse
from .rules import new_rule

SG = timezone(timedelta(hours=8))


def make_pdf(lines: list) -> bytes:
    """最小的文字 PDF（Helvetica，只放英文/数字），示例发票和测试用。"""
    def esc(t):
        return t.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    ops = ["BT", "/F1 12 Tf", "14 TL", "72 760 Td"]
    for ln in lines:
        ops.append(f"({esc(ln)}) Tj T*")
    ops.append("ET")
    stream = "\n".join(ops).encode("latin-1")
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    x = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
    return out


INVOICE_PDF = make_pdf(["Bluepeak Supplies Pte Ltd", "TAX INVOICE", "", "Invoice No: INV-88213",
                        "PO Number: PO-55107", "GST Reg No: 201912345K", "",
                        "A4 copy paper 70g    40 boxes    S$1,800.00", "Toner cartridge    6 pcs    S$450.00",
                        "", "Subtotal: S$2,250.00", "GST 8%: S$180.00", "Amount Due: S$2,430.00"])
INVOICE_HTML = """<html><body><p>Hi there,</p><table>
<tr><td>Invoice No</td><td>INV-88213</td></tr>
<tr><td>Amount Due</td><td>S$2,430.00</td></tr>
<tr><td>Due Date</td><td>30 Nov 2026</td></tr></table>
<p>Thank you for your business.<br>Bluepeak Supplies Pte Ltd</p></body></html>"""


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

青禾商贸 · 客服部
"""
    return _msg(i, "青禾商贸 <orders@qinghe-shop.example>", f"订单确认 #{no}", text, when,
                atts=[(f"发票_{no}.pdf", b"%PDF-1.4 demo")])


def _order_en(i, no, when, amount, who, phone, addr):
    text = f"""Hi, your order is confirmed.

Order Number: {no}
Order Date: {when:%Y-%m-%d %H:%M}
Total: ${amount}
Contact: {who}  Phone: {phone}
Ship to: {addr}

Brightside Store · Customer Care
"""
    return _msg(f"en-{i}", "Brightside Store <orders@brightside-shop.example>", f"Order confirmed #{no}", text, when,
                atts=[(f"Invoice_{no}.pdf", b"%PDF-1.4 demo")])


def raw_samples(lang="zh"):
    """示例信：中文界面一套、英文界面一套（公司、人名、邮箱全是编的，不拿佛门的词起店名）。"""
    base = datetime(2026, 11, 2, 9, 12, tzinfo=SG)
    inv = _msg("en-3" if lang == "en" else 3, "Bluepeak Supplies Billing <billing@bluepeak-supplies.example>",
               "Invoice INV-88213 from Bluepeak Supplies",
               "Invoice No: INV-88213\nAmount Due: S$2,430.00\nDue Date: 30 Nov 2026\n\nThank you for your business.",
               base - timedelta(hours=20), html=INVOICE_HTML, atts=[("INV-88213.pdf", INVOICE_PDF)])
    if lang == "en":
        return [
            _order_en(1, "BS20261101-0042", base - timedelta(days=1, hours=2), "1,280.50", "Alex Chen", "+65 6123 4567", "88 Tampines St 21, Singapore"),
            _order_en(2, "BS20261101-0057", base - timedelta(days=1), "356.00", "Priya Nair", "+65 6234 5678", "1 Raffles Place, Singapore"),
            inv,
            _msg("en-4", "Kelvin Tan <kelvin.tan@example.com>", "Price for A4 copy paper?",
                 "Hi,\n\nWe go through about 200 boxes of A4 copy paper (70gsm) a month. Could you send your wholesale price "
                 "and how soon you can deliver?\nWe're in Jurong East. A quote would be great.\n\nThanks\nKelvin Tan\nPhone: 9123 4567",
                 base - timedelta(hours=3)),
            _msg("en-5", "QIANSHOU Weekly <news@weekly.example>", "10 ways to look busy (Issue 42)",
                 "A newsletter nobody asked for. No rule claims it, so Zhike pretends it never happened.", base - timedelta(hours=2)),
            _order_en(6, "BS20261102-0003", base, "89.90", "Sam Lee", "+65 6345 6789", "9 Orchard Rd, Singapore"),
        ]
    return [
        _order(1, "SM20261101-0042", base - timedelta(days=1, hours=2), "1,280.50", "王小明", "138-0013-8000", "新加坡 淡滨尼 21 街 88 号"),
        _order(2, "SM20261101-0057", base - timedelta(days=1), "356.00", "李雷", "139-1234-5678", "上海市 浦东新区 张江路 1 号"),
        inv,
        _msg(4, "陈先生 <chen.k@example.com>", "想问下 A4 复印纸的批发价",
             "你好，\n\n我们公司每月大概要 200 箱 A4 复印纸（70g），想问下批发价和多久能送到。\n"
             "地址在裕廊东。方便的话给个报价单。\n\n谢谢\n陈先生\n电话：9123 4567", base - timedelta(hours=3)),
        _msg(5, "千手周报 <news@weekly.example>", "本周十大摸鱼技巧（第 42 期）",
             "这是一封没人管的周报。没有规则认领它，知客僧就当没看见。", base - timedelta(hours=2)),
        _order(6, "SM20261102-0003", base, "89.90", "韩梅梅", "135-0000-1111", "新加坡 乌节路 9 号"),
    ]


def mails(lang="zh"):
    return [parse(r, uid=i + 1) for i, r in enumerate(raw_samples(lang))]


def _pick(mail, value):
    s = mail.text.index(value)
    return (mail.text, s, s + len(value))


def demo_rules(ms=None, lang="zh"):
    """示例规则全是从示例邮件里「点选」学出来的，跟用户自己点选走同一条路。规则名、列名跟着语言。"""
    from .text import T
    ms = ms or mails(lang)
    o1, o2, inv, ask = ms[0], ms[1], ms[2], ms[3]
    att = {"name": T("b_attachments", lang), "builtin": "@attachments", "type": "text"}
    r1 = new_rule(T("rt_order", lang), lang)
    if lang == "en":
        r1["conditions"] = {"from": ["@brightside-shop.example"], "subject": ["Order confirmed"], "body": []}
        picks = [(T("col_order", lang), "BS20261101-0042", "BS20261101-0057"),
                 (T("col_orderdate", lang), "2026-11-01 07:12", "2026-11-01 09:12"),
                 (T("col_amount", lang), "$1,280.50", "$356.00"),
                 (T("col_contact", lang), "Alex Chen", "Priya Nair"),
                 (T("col_phone", lang), "+65 6123 4567", "+65 6234 5678")]
    else:
        r1["conditions"] = {"from": ["@qinghe-shop.example"], "subject": ["订单确认"], "body": []}
        picks = [("订单号", "SM20261101-0042", "SM20261101-0057"),
                 ("下单时间", "2026-11-01 07:12", "2026-11-01 09:12"),
                 ("金额", "¥1,280.50", "¥356.00"),
                 ("联系人", "王小明", "李雷"),
                 ("电话", "138-0013-8000", "139-1234-5678")]
    for name, v1, v2 in picks:
        r1["fields"].append(learn.learn_field(name, [_pick(o1, v1), _pick(o2, v2)]))
    r1["fields"].append(dict(att))
    r1["forward"] = {"enabled": True, "to": ["finance@yourcompany.example"], "note": ""}

    r2 = new_rule(T("rt_invoice", lang), lang)
    r2["conditions"] = {"from": ["@bluepeak-supplies.example"], "subject": ["invoice"], "body": []}
    inv_names = ([T("col_invoice", lang), T("col_amount", lang), T("col_due", lang), "PO #"] if lang == "en"
                 else ["发票号", "应付", "到期日", "采购单号"])
    for name, v in zip(inv_names, ["INV-88213", "S$2,430.00", "30 Nov 2026", "PO-55107"]):
        r2["fields"].append(learn.learn_field(name, [_pick(inv, v)]))
    r2["fields"].append(dict(att))

    r3 = new_rule(T("rt_quote", lang), lang)
    r3["fields"].append({"name": T("b_subject", lang), "builtin": "@subject", "type": "text"})
    r3["fields"].append(learn.learn_field(T("col_phone", lang), [_pick(ask, "9123 4567")]))
    if lang == "en":
        r3["conditions"] = {"from": [], "subject": ["price", "quote"], "body": []}
        r3["reply"] = {"enabled": True, "mode": "auto",
                       "template": "Hi {name},\n\nThanks for getting in touch. We'll put the quote together and send it today. "
                                   "Delivery is usually 2 business days after you order.\n\nAny questions, just ask.",
                       "hint": "Friendly. Confirm what they need; say the quote goes out today."}
    else:
        r3["conditions"] = {"from": [], "subject": ["价", "报价", "quote"], "body": []}
        r3["reply"] = {"enabled": True, "mode": "auto",
                       "template": "{称呼}您好，\n\n收到，谢谢关注。报价单我们今天整理好发您，"
                                   "送货时间一般是下单后 2 个工作日。\n\n有问题随时找我。",
                       "hint": "语气客气，先确认需求，报价说今天发"}
    return [r1, r2, r3]
