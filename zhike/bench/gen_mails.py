"""知客僧比武：生成测试邮件 + 标准答案。

    python gen_mails.py OUT_DIR [--n 200] [--seed 2]

产出：
  OUT_DIR/train/*.eml   用户「看得见」的 10 封样例（建规则用，只有常见写法）
  OUT_DIR/test/*.eml    比武用的一批（默认 200 封，带没见过的写法、转发套转发、垃圾邮件）
  OUT_DIR/truth.json    每封的标准答案：归哪条规则、该抽出的字段、该不该转发、转给谁

全部是编的：公司/人名/域名都是 .example，不含真人真公司。
"""
from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timedelta, timezone
from email.header import Header
from email.message import EmailMessage
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import format_datetime, formataddr, parseaddr
import html as _html
from pathlib import Path

SG = timezone(timedelta(hours=8))
ME = "me@ourco.example"
FIN = "finance@ourco.example"
SALES = "sales@ourco.example"
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
FULLMON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

# 规则 → 字段（标准答案的键）；字段类型决定打分时怎么比
RULES = {
    "订单": {"订单号": "id", "金额": "money", "下单日期": "date"},
    "发票": {"发票号": "id", "金额": "money", "到期日": "date", "附件": "text"},
    "物流": {"运单号": "id", "预计送达": "date"},
    "询价": {"产品": "text", "数量": "qty", "电话": "phone"},
}
FORWARD = {"发票": FIN, "询价": SALES}


class Gen:
    def __init__(self, seed):
        self.r = random.Random(seed)
        self.i = 0
        self.base = datetime(2026, 11, 2, 9, 0, tzinfo=SG)

    def when(self):
        return self.base - timedelta(minutes=self.r.randint(5, 60 * 24 * 6))

    def money(self, lo=20, hi=30000):
        return round(self.r.uniform(lo, hi), 2)

    def fmt_money(self, v):
        return f"{v:,.2f}"

    def day(self, start_days=1, span=40):
        return (self.base + timedelta(days=self.r.randint(start_days, span))).date()

    # ---------- 信封 ----------
    def msg(self, frm, subj, text=None, html=None, when=None, atts=(), charset="utf-8", to=ME, att_style="2231"):
        self.i += 1
        when = when or self.when()
        if not atts and charset == "utf-8" and att_style == "2231":
            m = EmailMessage()
            m["From"], m["To"], m["Subject"] = frm, to, subj
            m["Date"] = format_datetime(when)
            m["Message-ID"] = f"<bench-{self.i}-{self.r.randint(1000, 9999)}@mail.example>"
            if text is not None:
                m.set_content(text)
                if html:
                    m.add_alternative(html, subtype="html")
            else:
                m.set_content(html, subtype="html")
            return m.as_bytes()
        # 老式写法：手搭 MIME（gb18030 正文 / RFC2047 附件名）
        outer = MIMEMultipart("mixed")
        nm, ad = parseaddr(frm)
        outer["From"] = formataddr((str(Header(nm, charset).encode()), ad)) if nm else ad
        outer["To"] = to
        outer["Subject"] = Header(subj, charset)
        outer["Date"] = format_datetime(when)
        outer["Message-ID"] = f"<bench-{self.i}-{self.r.randint(1000, 9999)}@mail.example>"
        if text is not None and html:
            alt = MIMEMultipart("alternative")
            alt.attach(MIMEText(text, "plain", charset))
            alt.attach(MIMEText(html, "html", charset))
            outer.attach(alt)
        elif text is not None:
            outer.attach(MIMEText(text, "plain", charset))
        else:
            outer.attach(MIMEText(html, "html", charset))
        for name in atts:
            p = MIMEApplication(b"%PDF-1.4 bench", "pdf")
            if att_style == "2047":
                p.add_header("Content-Disposition", "attachment", filename=Header(name, "gb18030").encode())
            else:
                p.add_header("Content-Disposition", "attachment", filename=("utf-8", "", name))
            outer.attach(p)
        return outer.as_bytes()

    # ---------- 订单 ----------
    def order_shanmen(self, seen=True):
        no = f"SM{self.base:%Y%m%d}-{self.r.randint(1, 9999):04d}"
        t = self.when()
        amt = self.money(30, 5000)
        lab_no = "订单号" if seen or self.r.random() < 0.6 else self.r.choice(["订单编号", "订单号码"])
        lab_amt = "实付金额" if seen or self.r.random() < 0.6 else self.r.choice(["实付款", "应付总额"])
        dstyle = 0 if seen else self.r.choice([0, 0, 1, 2])
        dtxt = [f"{t:%Y-%m-%d %H:%M}", f"{t.year}/{t.month}/{t.day} {t:%H:%M}", f"{t.year}年{t.month}月{t.day}日 {t:%H:%M}"][dstyle]
        cur = "¥" if seen or self.r.random() < 0.7 else "￥"
        text = (f"您好，您的订单已确认。\n\n{lab_no}：{no}\n下单时间：{dtxt}\n{lab_amt}：{cur}{self.fmt_money(amt)}\n"
                f"收货人：客户{self.r.choice('甲乙丙丁戊')}  电话：1{self.r.randint(30, 89)}-{self.r.randint(1000, 9999)}-{self.r.randint(1000, 9999)}\n\n山门商贸 · 客服部\n")
        html = None
        if self.r.random() < 0.5:
            html = "<html><body>" + text.replace("\n", "<br>") + "</body></html>"
        truth = {"订单号": no, "金额": amt, "下单日期": t.date().isoformat()}
        raw = self.msg("山门商贸 <orders@shanmen-shop.example>", f"订单确认 #{no}", text, html, when=t)
        return raw, "订单", truth, text, "山门商贸 <orders@shanmen-shop.example>", f"订单确认 #{no}", t

    def order_lotusmart(self, seen=True):
        no = f"LM-{self.r.randint(100000, 999999)}"
        t = self.when()
        amt = self.money(10, 900)
        lab_no = "Order Number" if seen or self.r.random() < 0.6 else "Order #"
        dstyle = 0 if seen else self.r.choice([0, 1, 2, 3])
        dtxt = [f"{MON[t.month - 1]} {t.day}, {t.year}", f"{t.day:02d}/{t.month:02d}/{t.year}",
                f"{t.day} {FULLMON[t.month - 1]} {t.year}", f"{t:%Y-%m-%d}"][dstyle]
        cur = "US$ " if seen or self.r.random() < 0.6 else self.r.choice(["USD ", "$"])
        html = f"""<html><head><style>td{{padding:4px}}</style></head><body>
<h2>Thanks for your order!</h2><p>Hi there, we&rsquo;re getting your order ready.</p>
<table><tr><td>{lab_no}</td><td><b>{no}</b></td></tr>
<tr><td>Order Date</td><td>{dtxt}</td></tr>
<tr><td>Items</td><td>{self.r.randint(1, 6)}</td></tr>
<tr><td>Total</td><td>{cur}{self.fmt_money(amt)}</td></tr></table>
<p>Lotus Mart &middot; <a href="https://lotus-mart.example/help">Help</a></p></body></html>"""
        truth = {"订单号": no, "金额": amt, "下单日期": t.date().isoformat()}
        subj = f"Your Lotus Mart order {no}"
        raw = self.msg("Lotus Mart <orders@lotus-mart.example>", subj, None, html, when=t)
        return raw, "订单", truth, None, "Lotus Mart <orders@lotus-mart.example>", subj, t

    # ---------- 发票 ----------
    def invoice_lotus(self, seen=True):
        no = f"INV-{self.r.randint(10000, 99999)}"
        amt = self.money(200, 20000)
        due = self.day(10, 45)
        cur = "S$" if seen else self.r.choice(["S$", "S$", "USD ", "€", "SGD "])
        dstyle = 0 if seen else self.r.choice([0, 0, 1, 2])
        dtxt = [f"{due.day} {MON[due.month - 1]} {due.year}", f"{due:%Y-%m-%d}", f"{due.day:02d}/{due.month:02d}/{due.year}"][dstyle]
        att = f"{no}.pdf" if seen or self.r.random() < 0.5 else f"发票_莲花供应_{due.year}年{due.month}月.pdf"
        html = f"""<html><body><p>Hi there,</p><p>Please find attached our invoice.</p><table>
<tr><td>Invoice No</td><td>{no}</td></tr>
<tr><td>Amount Due</td><td>{cur}{self.fmt_money(amt)}</td></tr>
<tr><td>Due Date</td><td>{dtxt}</td></tr></table>
<p>Thank you for your business.<br>Lotus Supplies Pte Ltd</p></body></html>"""
        t = self.when()
        frm = "Lotus Supplies Billing <billing@lotus-supplies.example>"
        subj = f"Invoice {no} from Lotus Supplies"
        raw = self.msg(frm, subj, None, html, when=t, atts=[att])
        truth = {"发票号": no, "金额": amt, "到期日": due.isoformat(), "附件": att}
        return raw, "发票", truth, None, frm, subj, t

    def invoice_qingshi(self, seen=True):
        no = f"QS-2026-{self.r.randint(1, 9999):04d}"
        amt = self.money(1000, 90000)
        due = self.day(10, 45)
        lab_amt = "应付金额" if seen or self.r.random() < 0.6 else "金额合计"
        cur_style = 0 if seen else self.r.choice([0, 1, 2])
        mtxt = [f"RMB {self.fmt_money(amt)}", f"￥{self.fmt_money(amt)} 元", f"{self.fmt_money(amt)} 元"][cur_style]
        lab_due = "付款期限" if seen or self.r.random() < 0.6 else "到期日"
        dstyle = 0 if seen else self.r.choice([0, 1, 2])
        dtxt = [f"{due.year}年{due.month}月{due.day}日", f"{due.year}/{due.month:02d}/{due.day:02d}", f"{due:%Y-%m-%d}"][dstyle]
        att = f"发票_{no}.pdf"
        text = f"贵司好：\n\n本月服务费发票已开具，详见附件。\n\n发票号码：{no}\n{lab_amt}：{mtxt}\n{lab_due}：{dtxt}\n\n青石科技 财务部\n"
        legacy = (not seen) and self.r.random() < 0.4      # 老式国产客户端：GB18030 正文 + RFC2047 附件名
        t = self.when()
        frm = "青石科技 财务部 <finance@qingshi-tech.example>"
        subj = f"【青石科技】{due.month}月服务费发票 {no}"
        raw = self.msg(frm, subj, text, None, when=t, atts=[att], charset="gb18030" if legacy else "utf-8",
                       att_style="2047" if legacy else "2231")
        truth = {"发票号": no, "金额": amt, "到期日": due.isoformat(), "附件": att}
        return raw, "发票", truth, text, frm, subj, t

    # ---------- 物流 ----------
    def ship_sf(self, seen=True):
        no = f"SF{self.r.randint(10**12, 10**13 - 1)}"
        eta = self.day(1, 5)
        lab = "运单号" if seen or self.r.random() < 0.7 else "快递单号"
        sep = "：" if seen or lab == "运单号" else " "
        dtxt = f"{eta.month}月{eta.day}日" if seen or self.r.random() < 0.6 else f"{eta:%Y-%m-%d}"
        text = f"您的快递已发出。\n{lab}{sep}{no}\n预计送达：{dtxt}\n查件请登录官网。\n"
        t = self.when()
        frm = "顺风快递 <noreply@shunfeng-express.example>"
        subj = "您的快递已发出"
        return self.msg(frm, subj, text, None, when=t), "物流", {"运单号": no, "预计送达": eta.isoformat()}, text, frm, subj, t

    def ship_ninja(self, seen=True):
        no = f"NV2026SG{self.r.randint(10**7, 10**8 - 1)}"
        eta = self.day(1, 5)
        lab = "Tracking Number" if seen or self.r.random() < 0.6 else "Tracking #"
        dtxt = f"{eta.day:02d} {MON[eta.month - 1]} {eta.year}" if seen or self.r.random() < 0.6 else f"{FULLMON[eta.month - 1]} {eta.day}, {eta.year}"
        text = f"Good news! Your parcel is on the way.\n\n{lab}: {no}\nEstimated Delivery: {dtxt}\n\nTrack it at https://ninjaexp.example/track\n"
        html = "<html><body>" + text.replace("\n", "<br>") + "</body></html>"
        t = self.when()
        frm = "Ninja Express <tracking@ninjaexp.example>"
        subj = f"Your parcel {no} is on the way"
        return self.msg(frm, subj, text, html, when=t), "物流", {"运单号": no, "预计送达": eta.isoformat()}, text, frm, subj, t

    # ---------- 询价 ----------
    PRODUCTS = [("A4 复印纸（70g）", "箱"), ("打印机墨盒", "个"), ("办公椅", "把"), ("文件柜", "台")]
    EN_PRODUCTS = [("Office chairs", "pcs"), ("A4 copy paper", "reams"), ("Standing desks", "units")]

    def _phone(self):
        return f"+65 {self.r.choice('89')}{self.r.randint(100, 999)} {self.r.randint(1000, 9999)}"

    def inquiry(self, seen=True, en=None):
        en = self.r.random() < 0.35 if en is None else en
        sender = f"buyer{self.r.randint(1, 999)}@{self.r.choice(['mail', 'post', 'inbox'])}.example"
        ph = self._phone()
        qty = self.r.choice([20, 50, 100, 200, 300, 500])
        prose = (not seen) and self.r.random() < 0.25
        if en:
            prod, unit = self.r.choice(self.EN_PRODUCTS)
            subj = "Request for Quotation: " + prod if seen or self.r.random() < 0.7 else "Price enquiry"
            if prose:
                body = f"Hi,\n\nWe need about {qty} {unit} of {prod.lower()}. Could you quote? Call me at {ph}.\n\nThanks"
                truth = {"产品": None, "数量": qty, "电话": ph}
            else:
                body = f"Hello,\n\nPlease quote for the following:\n\nProduct: {prod}\nQuantity: {qty} {unit}\nPhone: {ph}\n\nRegards"
                truth = {"产品": prod, "数量": qty, "电话": ph}
        else:
            prod, unit = self.r.choice(self.PRODUCTS)
            subj = self.r.choice(["询价：", "询价 - ", "报价请求："]) + prod.split("（")[0] if seen or self.r.random() < 0.75 else "想问下价格"
            if seen:
                subj = "询价：" + prod.split("（")[0]
            if prose:
                body = f"你好，\n\n我们想订 {qty} {unit}{prod}，麻烦报个价，多久能送到？电话 {ph}。\n"
                truth = {"产品": None, "数量": qty, "电话": ph}
            else:
                lab_ph = "联系电话" if seen or self.r.random() < 0.7 else "手机"
                body = f"你好，\n\n想问下批发价：\n产品：{prod}\n数量：{qty} {unit}\n{lab_ph}：{ph}\n\n谢谢\n"
                truth = {"产品": prod, "数量": qty, "电话": ph}
        t = self.when()
        frm = f"客户 <{sender}>" if not en else f"Buyer <{sender}>"
        return self.msg(frm, subj, body, None, when=t), "询价", truth, body, frm, subj, t

    # ---------- 转发套转发 ----------
    def forwarded(self, depth):
        kind = self.r.choice(["order_shanmen", "invoice_qingshi", "invoice_lotus"])
        raw, rule, truth, text, frm, subj, t = getattr(self, kind)(seen=True)
        if text is None:   # 原信只有 HTML：转发里也是 HTML
            from email import message_from_bytes, policy
            m = message_from_bytes(raw, policy=policy.default)
            inner = m.get_body(("html",)).get_content()
        else:
            inner = text
        hdr = f"From: {frm}\nDate: {format_datetime(t)}\nSubject: {subj}\nTo: {ME}\n"
        body = f"---------- Forwarded message ---------\n{hdr}\n{inner}"
        s = subj
        for d in range(depth):
            s = "Fwd: " + s
            who = ["同事A <colleague.a@ourco.example>", "同事B <colleague.b@ourco.example>"][d % 2]
            if d < depth - 1:
                body = f"转给你看下\n\n---------- Forwarded message ---------\nFrom: {who}\nDate: {format_datetime(t)}\nSubject: {s}\n\n{body}"
        who = "同事B <colleague.b@ourco.example>" if depth > 1 else "同事A <colleague.a@ourco.example>"
        lead = "帮忙录一下\n\n"
        atts = [truth["附件"]] if "附件" in truth else ()
        if text is None:
            html = "<html><body><p>" + lead.strip() + "</p><div>" + _html.escape(body.replace(inner, "")).replace("\n", "<br>") + inner + "</div></body></html>"
            out = self.msg(who, s, None, html, when=t + timedelta(hours=1), atts=atts)
        else:
            out = self.msg(who, s, lead + body, None, when=t + timedelta(hours=1), atts=atts)
        return out, rule, truth

    # ---------- 垃圾 / 不该管的 ----------
    def spam(self):
        k = self.r.choice(["phish", "prize", "promo", "seo", "newsletter"])
        t = self.when()
        if k == "phish":   # 冒充发票，域名差一个字母
            no = f"INV-{self.r.randint(10000, 99999)}"
            html = f"<html><body><p>Your invoice is OVERDUE.</p><table><tr><td>Invoice No</td><td>{no}</td></tr><tr><td>Amount Due</td><td>S$9,860.00</td></tr></table><p><a href='http://pay-now.example/x'>Pay now</a></p></body></html>"
            raw = self.msg("Lotus Supplies Billing <billing@lotus-supp1ies.example>", f"Invoice {no} overdue - action required", None, html, when=t)
        elif k == "prize":
            raw = self.msg("领奖中心 <promo@win-prize.example>", "订单确认：恭喜您获得免费手机一台",
                           "订单号：WIN888\n实付金额：¥0.00\n请点击链接领取 http://win-prize.example/get\n", when=t)
        elif k == "promo":
            raw = self.msg("山门商贸 <news@shanmen-shop.example>", "双十一大促｜全场五折，订单满 199 包邮",
                           "亲爱的会员：\n\n双十一大促开始啦！订单满 199 包邮。\n退订请回复 TD\n", when=t)
        elif k == "seo":
            raw = self.msg("网络推广 <seo@rank-up.example>", "询价 网站推广 首页排名 报价",
                           "老板您好，我们提供网站首页排名服务，报价低至 999 元/月。\n联系电话：+65 9000 0000\n", when=t)
        else:
            raw = self.msg("Ninja Express <news@ninjaexp.example>", "November deals: ship 3, pay 2",
                           "Ship more, pay less this November. Tracking made easy.\nUnsubscribe: https://ninjaexp.example/u\n",
                           "<html><body><p>Ship more, pay less this November.</p></body></html>", when=t)
        return raw, None, {}


def build(out: Path, n: int, seed: int):
    (out / "train").mkdir(parents=True, exist_ok=True)
    (out / "test").mkdir(parents=True, exist_ok=True)
    truth = {"train": {}, "test": {}}
    g = Gen(seed * 1000 + 1)
    train = [g.order_shanmen(), g.order_lotusmart(), g.invoice_lotus(), g.invoice_qingshi(),
             g.ship_sf(), g.ship_ninja(), g.inquiry(en=False), g.inquiry(en=True)]
    train = [x[:3] for x in train] + [g.spam(), g.spam()]
    for i, (raw, rule, tr) in enumerate(train):
        name = f"t{i + 1:02d}.eml"
        (out / "train" / name).write_bytes(raw)
        truth["train"][name] = {"rule": rule, "fields": tr, "forward": FORWARD.get(rule)}

    g = Gen(seed)
    mix = (["order_shanmen"] * 30 + ["order_lotusmart"] * 20 + ["invoice_lotus"] * 20 + ["invoice_qingshi"] * 20
           + ["ship_sf"] * 18 + ["ship_ninja"] * 18 + ["inquiry"] * 30 + ["fwd1"] * 8 + ["fwd2"] * 6 + ["spam"] * 30)
    scale = n / len(mix)
    picks = []
    for k in sorted(set(mix), key=mix.index):
        picks += [k] * max(1, round(mix.count(k) * scale))
    picks = picks[:n]
    g.r.shuffle(picks)
    for i, k in enumerate(picks):
        if k == "spam":
            raw, rule, tr = g.spam()
        elif k.startswith("fwd"):
            raw, rule, tr = g.forwarded(int(k[-1]))
        else:
            raw, rule, tr = getattr(g, k)(seen=False)[:3]
        name = f"m{i + 1:03d}.eml"
        (out / "test" / name).write_bytes(raw)
        truth["test"][name] = {"rule": rule, "fields": tr, "forward": FORWARD.get(rule), "kind": k}
    (out / "truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=1), encoding="utf-8")
    return truth


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--seed", type=int, default=2)
    a = ap.parse_args()
    t = build(Path(a.out), a.n, a.seed)
    print(f"train {len(t['train'])} · test {len(t['test'])} → {a.out}")
