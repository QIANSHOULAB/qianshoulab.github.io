"""0.4.0 交货（_ops/文案规范.md「交货前自查」）：中英文字各导出一份、中英截图、介绍页用的 webp。

    python shots-0.4.py             # 全来
    python shots-0.4.py strings     # 只导出 strings-0.4/zh.txt、en.txt（一行一条：键<TAB>字）
    python shots-0.4.py app         # 只截程序（顺手出介绍页 webp：app / recs × 浅深 × 中英）
    python shots-0.4.py intro       # 只截介绍页 390 / 1280 × 中英

程序窗口用 devserver 在浏览器里截（跟 Zhike.exe 的 WebView2 是同一份 ui/），1180×760 = 程序窗口默认大小，2 倍清晰度。
邮箱是本机假的 IMAP / SMTP；信是这里现编的（.example 域名，店名不沾佛门典故），中文界面一套中文为主的信，英文界面一套英文信。
每张截图前查一遍：按钮没被撑破、没挤成两行、字没截断（跟 tests/test_v04.py 同一段检查），页面报错 0。
"""
from __future__ import annotations

import os
import sys
import tempfile
import threading
import time
from email.message import EmailMessage
from email.utils import format_datetime
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ZHIKE = HERE.parent
OUT = HERE / "shots-0.4"
STR_OUT = HERE / "strings-0.4"
IMG = ZHIKE / "img"
sys.path.insert(0, str(ZHIKE / "app"))
sys.path.insert(0, str(ZHIKE / "app" / "tests"))
W, H = 1180, 760
SG = timezone(timedelta(hours=8))
T0 = datetime.now(SG).replace(second=0, microsecond=0)
PDF = None


def mail(frm, subj, body, mins_ago, atts=(), html=None):
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = frm, "me@ourco.example", subj
    m["Date"] = format_datetime(T0 - timedelta(minutes=mins_ago))
    m["Message-ID"] = f"<shot-{abs(hash((frm, subj)))}@ourco.example>"
    m.set_content(body)
    if html:
        m.add_alternative(html, subtype="html")
    for name, data in atts:
        m.add_attachment(data, maintype="application", subtype="pdf", filename=name)
    return m.as_bytes()


def pdf(lines):
    from zhike.samples import make_pdf
    return make_pdf(lines)


def inv_bluepeak(no, amount, due, mins):
    body = f"Hi there,\nPlease find attached our invoice.\n\nInvoice No  {no}\n\nAmount Due  S${amount}\n\nDue Date  {due}\n\nThank you for your business.\nBluepeak Supplies Pte Ltd"
    return mail("Bluepeak Supplies Billing <billing@bluepeak-supplies.example>", f"Invoice {no} from Bluepeak Supplies", body, mins,
                atts=[(f"{no}.pdf", pdf(["Bluepeak Supplies Pte Ltd", "TAX INVOICE", f"Invoice No: {no}", f"PO Number: PO-{no[-5:]}",
                                         f"Amount Due: S${amount}"]))])


def first_batch(lang):
    """连上那一刻邮箱里已经有的：两家订单、两家发票、两家快递、两封询价、一封推销、一封冒充发票。"""
    if lang == "en":
        return [
            mail("Brightside Store <orders@brightside-shop.example>", "Order confirmed #BS20261102-9609",
                 "Hi, your order is confirmed.\n\nOrder Number: BS20261102-9609\nOrder Date: 2026-11-02 03:00\nTotal: $1,831.38\n"
                 "Contact: Jordan Lee  Phone: +65 6170 2379\n\nBrightside Store · Customer Care", 60 * 30),
            mail("Maple Mart <orders@maplemart.example>", "Your Maple Mart order MM-585500",
                 "Thanks for your order!\n\nOrder Number  MM-585500\n\nOrder Date  Oct 31, 2026\n\nItems  4\n\nTotal  US$ 66.75\n\nMaple Mart · Help", 60 * 40),
            inv_bluepeak("INV-56383", "18,590.91", "9 Dec 2026", 60 * 26),
            mail("Northwind Tech Finance <finance@northwind-tech.example>", "[Northwind Tech] November service invoice NW-2026-4932",
                 "Dear customer,\n\nYour November service invoice is attached.\n\nInvoice Number: NW-2026-4932\nAmount Due: US$ 3,443.89\n"
                 "Due Date: 22 Nov 2026\n\nNorthwind Tech Finance", 60 * 28,
                 atts=[("NW-2026-4932.pdf", pdf(["Northwind Tech", "Invoice Number: NW-2026-4932", "Amount Due: US$ 3,443.89"]))]),
            mail("Swift Courier <noreply@swiftcourier.example>", "Your parcel has shipped",
                 "Your parcel has shipped.\nTracking Number: SC1698829178134\nEstimated Delivery: 06 Nov 2026\n", 60 * 20),
            mail("Ninja Express <tracking@ninjaexp.example>", "Your parcel NV2026SG93420454 is on the way",
                 "Good news! Your parcel is on the way.\n\nTracking Number: NV2026SG93420454\nEstimated Delivery: 06 Nov 2026\n\nTrack it at https://ninjaexp.example/track", 60 * 22),
            mail("Dana Lim <dana.lim@inbox.example>", "Quote request: filing cabinets",
                 "Hi,\n\nCould you quote for:\nProduct: Filing cabinets\nQuantity: 3 units\nPhone: +65 8517 4570\n\nThanks", 60 * 18),
            mail("Buyer <buyer795@inbox.example>", "Request for Quotation: Office chairs",
                 "Hello,\n\nPlease quote for the following:\n\nProduct: Office chairs\nQuantity: 100 pcs\nPhone: +65 8124 7847\n\nRegards", 60 * 17),
            mail("Ninja Express <news@ninjaexp.example>", "November deals: ship 3, pay 2",
                 "Ship more, pay less this November. Tracking made easy.\nUnsubscribe: https://ninjaexp.example/u", 60 * 16),
            mail("Bluepeak Supplies Billing <billing@bluepeak-supp1ies.example>", "Invoice INV-15584 overdue - action required",
                 "Your invoice is OVERDUE.\nInvoice No  INV-15584\nAmount Due  S$9,860.00\n\nPay now", 60 * 15),
        ]
    return [
        mail("青禾商贸 <orders@qinghe-shop.example>", "订单确认 #SM20261102-9609",
             "您好，您的订单已确认。\n\n订单号：SM20261102-9609\n下单时间：2026-11-02 03:00\n实付金额：¥1,831.38\n收货人：周女士  电话：135-1702-3790\n\n青禾商贸 · 客服部", 60 * 30),
        mail("白鹭优选 <orders@bailu-mart.example>", "白鹭优选｜订单已付款 BL-585500",
             "感谢下单！\n\n订单编号  BL-585500\n\n订单日期  2026-10-31\n\n件数  4\n\n应付总额  ￥466.75\n\n白鹭优选 · 客服", 60 * 40),
        inv_bluepeak("INV-56383", "18,590.91", "9 Dec 2026", 60 * 26),
        mail("青石科技 财务部 <finance@qingshi-tech.example>", "【青石科技】11月服务费发票 QS-2026-4932",
             "贵司好：\n\n本月服务费发票已开具，详见附件。\n\n发票号码：QS-2026-4932\n应付金额：RMB 34,443.89\n付款期限：2026年11月22日\n\n青石科技 财务部", 60 * 28,
             atts=[("发票_QS-2026-4932.pdf", pdf(["Qingshi Tech", "Invoice No: QS-2026-4932", "Amount: RMB 34,443.89"]))]),
        mail("顺风快递 <noreply@shunfeng-express.example>", "您的快递已发出",
             "您的快递已发出。\n运单号：SF1698829178134\n预计送达：11月6日\n查件请登录官网。", 60 * 20),
        mail("Ninja Express <tracking@ninjaexp.example>", "Your parcel NV2026SG93420454 is on the way",
             "Good news! Your parcel is on the way.\n\nTracking Number: NV2026SG93420454\nEstimated Delivery: 06 Nov 2026\n\nTrack it at https://ninjaexp.example/track", 60 * 22),
        mail("客户 <buyer855@inbox.example>", "询价：办公椅",
             "你好，\n\n想问下批发价：\n产品：办公椅\n数量：50 把\n联系电话：+65 8517 4570\n\n谢谢", 60 * 18),
        mail("Buyer <buyer795@inbox.example>", "Request for Quotation: Office chairs",
             "Hello,\n\nPlease quote for the following:\n\nProduct: Office chairs\nQuantity: 100 pcs\nPhone: +65 8124 7847\n\nRegards", 60 * 17),
        mail("青禾商贸 <news@qinghe-shop.example>", "双十一大促｜全场五折，订单满 199 包邮",
             "全场五折\n退订请回复 TD", 60 * 16),
        mail("Bluepeak Supplies Billing <billing@bluepeak-supp1ies.example>", "Invoice INV-15584 overdue - action required",
             "Your invoice is OVERDUE.\nInvoice No  INV-15584\nAmount Due  S$9,860.00\n\nPay now", 60 * 15),
    ]


def second_batch(lang):
    """收下规则以后来的几封新信。"""
    if lang == "en":
        return [inv_bluepeak("INV-88213", "2,430.00", "30 Nov 2026", 25),
                mail("Brightside Store <orders@brightside-shop.example>", "Order confirmed #BS20261103-0042",
                     "Hi, your order is confirmed.\n\nOrder Number: BS20261103-0042\nOrder Date: 2026-11-03 09:30\nTotal: $356.00\n", 40),
                mail("Kelvin Tan <kelvin.tan@example.com>", "Request for quote: A4 copy paper",
                     "Hi,\n\nProduct: A4 copy paper 70gsm\nQuantity: 200 boxes\nPhone: 9123 4567\n\nThanks, Kelvin", 12)]
    return [inv_bluepeak("INV-88213", "2,430.00", "30 Nov 2026", 25),
            mail("青禾商贸 <orders@qinghe-shop.example>", "订单确认 #SM20261103-0042",
                 "您好，您的订单已确认。\n\n订单号：SM20261103-0042\n下单时间：2026-11-03 09:30\n实付金额：¥356.00\n", 40),
            mail("陈先生 <chen.k@example.com>", "询价：A4 复印纸",
                 "你好，\n\n产品：A4 复印纸 70g\n数量：200 箱\n联系电话：9123 4567\n\n谢谢", 12)]


def export_strings():
    from zhike.text import load
    STR_OUT.mkdir(exist_ok=True)
    d = load()
    import subprocess
    import json
    site = json.loads(subprocess.check_output(["node", "-e", "global.window=global;require(process.argv[1]);console.log(JSON.stringify(SITE))",
                                               str(ZHIKE / "app" / "ui" / "strings.js")]))
    for L in ("zh", "en"):
        lines = [f"{k}\t{v}".replace("\n", "\\n") for k, v in d[L].items()]
        lines += [f"site.{k}\t{v}".replace("\n", "\\n") for k, v in site[L].items()]
        (STR_OUT / f"{L}.txt").write_text("\n".join(lines) + "\n", "utf-8")
        print(L, len(lines), "lines")


def app_shots():
    from playwright.sync_api import sync_playwright
    from test_v04 import OVERFLOW_JS
    from PIL import Image
    problems = []
    for lang in ("en", "zh"):
        for scheme in ("light", "dark"):
            os.environ["ZHIKE_HOME"] = tempfile.mkdtemp(prefix="zhike-shots-")
            os.environ["ZHIKE_NO_KEYRING"] = "1"
            os.environ["ZHIKE_LANG"] = lang
            for k in [k for k in sys.modules if k == "zhike" or k.startswith("zhike.")]:
                del sys.modules[k]
            from zhike import devserver
            from zhike.api import Api
            from zhike.fakeservers import FakeImap, FakeSmtp, free_port
            imap = FakeImap(user="me@ourco.example").start()
            smtp = FakeSmtp(user="me@ourco.example").start()
            for raw in first_batch(lang):
                imap.deliver(raw)
            api = Api()
            api.store.settings["excel_path"] = str(Path(os.environ["ZHIKE_HOME"]) / "out" / ("Zhike.xlsx" if lang == "en" else "知客僧.xlsx"))
            port = free_port()
            srv = devserver.serve(port, api)
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            errors = []
            tag = f"{lang}-{scheme}"
            with sync_playwright() as p:
                b = p.chromium.launch()
                pg = b.new_page(viewport={"width": W, "height": H}, color_scheme=scheme, device_scale_factor=2,
                                locale="en-US" if lang == "en" else "zh-CN")
                pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.on("console", lambda m: m.type == "error" and errors.append(m.text))

                def check(where):
                    problems.extend(f"{tag} {where}: {x}" for x in pg.evaluate(OVERFLOW_JS))

                pg.goto(f"http://127.0.0.1:{port}/?dev")
                pg.wait_for_selector(".wl")
                pg.wait_for_timeout(400)
                check("empty")
                pg.screenshot(path=str(OUT / f"app-{tag}-1-empty.png"))
                pg.fill("#wform [name=email]", imap.user)
                pg.fill("#wform [name=pw]", imap.password)
                pg.wait_for_timeout(500)
                pg.fill("#wform [name=imaphost]", "127.0.0.1")
                pg.fill("#wform [name=imapport]", str(imap.port))
                pg.click('#wform [data-seg="imapsec"] [data-v="plain"]')
                pg.fill("#wform [name=smtphost]", "127.0.0.1")
                pg.fill("#wform [name=smtpport]", str(smtp.port))
                pg.click('#wform [data-seg="smtpsec"] [data-v="plain"]')
                pg.click('#wform [data-act="connect"]')
                pg.wait_for_selector(".rec")
                pg.wait_for_timeout(500)
                check("recs")
                pg.screenshot(path=str(OUT / f"app-{tag}-x-recs.png"))
                pg.screenshot(path=str(IMG / f"recs-{scheme}{'-en' if lang == 'en' else ''}.png"), clip={"x": 220, "y": 0, "width": W - 220, "height": H})
                recs = {r["type"]: r for r in api.recs()}
                for typ, to in (("发票", "finance@ourco.example"), ("询价", "sales@ourco.example")):
                    box = f'.rec[data-rec="{recs[typ]["id"]}"] .tag-in'
                    pg.fill(box, to)
                    pg.press(box, "Enter")
                pg.click('[data-act="accept"]')
                pg.wait_for_selector(".toast")
                check("accepted")
                for raw in second_batch(lang):
                    imap.deliver(raw)
                api.run_now()
                pg.click('.side [data-nav="inbox"]')
                pg.wait_for_timeout(300)
                pg.click('.li:has-text("INV-88213")')
                pg.wait_for_timeout(500)
                pg.mouse.move(W - 10, H - 10)
                pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
                check("result")
                pg.screenshot(path=str(OUT / f"app-{tag}-2-result.png"))
                pg.screenshot(path=str(IMG / f"app-{scheme}{'-en' if lang == 'en' else ''}.png"))
                for v in ("rules", "table", "settings"):
                    pg.click(f'.side [data-nav="{v}"]')
                    pg.wait_for_timeout(500)
                    check(v)
                    pg.screenshot(path=str(OUT / f"app-{tag}-x-{v}.png"))
                b.close()
            srv.shutdown()
            api.engine.stop()
            imap.stop()
            smtp.stop()
            assert not errors, errors
    for name in ("app", "recs"):
        for scheme in ("light", "dark"):
            for suf in ("", "-en"):
                src = IMG / f"{name}-{scheme}{suf}.png"
                Image.open(src).save(IMG / f"{name}-{scheme}{suf}.webp", "WEBP", quality=82, method=6)
                src.unlink()
    assert not problems, problems
    print("app shots ok, overflow problems 0")


def intro_shots():
    from playwright.sync_api import sync_playwright
    import http.server
    import functools
    root = ZHIKE.parent
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(root))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/zhike/"
    bad = []
    # 大标题、副标题：每段不折行的 <span> 必须在一行里（「快递单」不许拆成两行）；按钮不许挤成两行
    LINES = """() => {
      const out = [];
      for (const sp of document.querySelectorAll('.hero h1 span, .hero .sl span')) {
        const rg = document.createRange(); rg.selectNodeContents(sp);
        const tops = new Set([...rg.getClientRects()].map(r => Math.round(r.top)));
        if (tops.size > 1) out.push('split: ' + sp.textContent);
      }
      for (const b of document.querySelectorAll('.btn, .lang button')) {
        const rg = document.createRange(); rg.selectNodeContents(b);
        const tops = new Set([...rg.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top / 4)));
        if (tops.size > 2) out.push('btn wraps: ' + b.textContent);
      }
      return out;
    }"""
    with sync_playwright() as p:
        b = p.chromium.launch()
        for lang in ("en", "zh"):
            for w, h in ((390, 844), (1280, 800)):
                for scheme in ("light", "dark"):
                    pg = b.new_page(viewport={"width": w, "height": h}, color_scheme=scheme, device_scale_factor=2 if w == 390 else 1,
                                    locale="en-US" if lang == "en" else "zh-CN")
                    pg.on("pageerror", lambda e: bad.append(str(e)))
                    pg.on("console", lambda m: m.type == "error" and bad.append(m.text))
                    pg.on("response", lambda r: r.status >= 400 and bad.append(f"{r.status} {r.url}"))
                    pg.goto(url + f"?lang={lang}")
                    pg.wait_for_load_state("networkidle")
                    pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager')")
                    pg.wait_for_timeout(600)
                    assert pg.evaluate("document.documentElement.lang") == ("en" if lang == "en" else "zh-CN")
                    over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                    broken = pg.evaluate("[...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src)")
                    lines = pg.evaluate(LINES)
                    assert over <= 0, (lang, w, scheme, "横向溢出", over)
                    assert not broken, (lang, w, scheme, broken)
                    assert not lines, (lang, w, scheme, lines)
                    pg.screenshot(path=str(OUT / f"intro-{lang}-{w}-{scheme}.png"), full_page=True)
                    pg.close()
        # 不跟浏览器语言走：中文浏览器第一次打开也是英文；点「中文」以后记住
        pg = b.new_page(viewport={"width": 390, "height": 844}, locale="zh-CN")
        pg.goto(url)
        assert pg.evaluate("document.documentElement.lang") == "en"
        pg.click('.lang [data-lang="zh"]')
        assert pg.title() == "知客僧 · 邮件分拣"
        pg.reload()
        assert pg.evaluate("document.documentElement.lang") == "zh-CN"
        pg.close()
        b.close()
    srv.shutdown()
    assert not bad, bad
    print("intro shots ok")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    IMG.mkdir(exist_ok=True)
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "strings"):
        export_strings()
    if what in ("all", "app"):
        app_shots()
    if what in ("all", "intro"):
        intro_shots()
