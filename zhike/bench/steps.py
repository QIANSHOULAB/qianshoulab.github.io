"""步骤账：用 Playwright 把主流程从「第一次打开」走到「结果到手」，第一次用、第二次用各走一遍，0.2.0 和 0.3.0 都走。

    python steps.py OUT_DIR OLD_APP_DIR
      OLD_APP_DIR = 0.2.0 的 zhike/app（git archive 9426474 zhike/app | tar -x -C 某处）

剧本（两版一样，邮箱是本机假的 IMAP / SMTP，信全是编的 .example 域名）：
- 第一次用：邮箱里已经有比武那 10 封样例（两家订单、两家发票、两家快递、两封询价、一封推销、一封冒充发票）。
  要的结果：订单 / 发票 / 物流 / 询价各一张表，发票转给 finance@，询价转给 sales@。连好、建好以后来 4 封新信，进表、转发 = 结果到手。
- 第二次用（第二天开机）：夜里来了 2 封老熟人的信，外加一家新供应商（白塔文具）的发票，要进「发票」表、转给财务。
  结果到手 = 白塔的发票进了「发票」表、转出去了。
「点托盘图标」「开机」这种窗口外的事，浏览器里模拟：开机 = 新起一份程序（同一个数据目录）并让它照 app.py 那样开始盯；
点托盘打开窗口 = 重新载入页面（0.3.0 另调一下 app.py 会调的 zkShown()）。打开 Excel 只核对文件里有没有那几行，不真去开 Excel。
每一步记：点 / 打字 / 拖选、干了啥。必要不必要、为什么，写在比武报告「0.3.0 复赛」的步骤账里。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from email.message import EmailMessage
from email.utils import format_datetime, make_msgid
from pathlib import Path

HERE = Path(__file__).resolve().parent
SAMPLES = HERE / "samples"


def baita(no, amount):
    """新供应商的发票（第二次用）：标签是同义词表里认得的写法。"""
    from datetime import datetime, timedelta, timezone
    m = EmailMessage()
    m["From"] = "Baita Office Billing <billing@baita-office.example>"
    m["To"] = "me@ourco.example"
    m["Subject"] = f"Tax Invoice {no} from Baita Office"
    m["Date"] = format_datetime(datetime.now(timezone(timedelta(hours=8))))
    m["Message-ID"] = make_msgid(domain="baita-office.example")
    m.set_content(f"Dear customer,\n\nInvoice Number: {no}\nTotal Due: S${amount}\nPayment Due: 2026-12-01\n\nBaita Office Supplies")
    m.add_attachment(b"%PDF-1.4 bench", maintype="application", subtype="pdf", filename=f"{no}.pdf")
    return m.as_bytes()


def walk(version, app_dir, out):
    sys.path.insert(0, str(app_dir))
    sys.path.insert(0, str(HERE))
    os.environ["ZHIKE_HOME"] = tempfile.mkdtemp(prefix=f"zhike-steps-{version}-")
    os.environ["ZHIKE_NO_KEYRING"] = "1"
    from zhike import devserver
    from zhike.api import Api
    from zhike.fakeservers import FakeImap, FakeSmtp, free_port
    from zhike.mailparse import parse
    from gen_mails import Gen
    from openpyxl import load_workbook
    from playwright.sync_api import sync_playwright

    imap = FakeImap(user="me@ourco.example").start()
    smtp = FakeSmtp(user="me@ourco.example").start()
    train = sorted(SAMPLES.glob("t*.eml"))
    for f in train:
        imap.deliver(f.read_bytes())
    KEY = {f.name: parse(f.read_bytes()).key() for f in train}
    TRUTH = json.load(open(SAMPLES / "truth.json", encoding="utf-8"))["train"]
    RAW = {f.name: parse(f.read_bytes()).text for f in train}
    excel = str(Path(os.environ["ZHIKE_HOME"]) / "out" / "知客僧.xlsx")
    g = Gen(7)
    log = {"version": version, "first": [], "second": [], "check": {}}
    cur = {"list": None}

    def step(kind, what):
        cur["list"].append({"n": len(cur["list"]) + 1, "kind": kind, "what": what})

    def rows(sheet):
        try:
            ws = load_workbook(excel, read_only=True)[sheet]
            it = ws.iter_rows(values_only=True)
            head = list(next(it))
            return [dict(zip(head, r)) for r in it]
        except Exception:
            return []

    state = {"api": None, "srv": None}

    def boot(first=False):
        """起一份程序（同一个数据目录）。第一次 = 刚装好；之后 = 开机自己起来（app.py：有邮箱就开始盯）。"""
        if state["srv"]:
            state["srv"].shutdown()
            state["api"].engine.stop()
            time.sleep(0.3)
        api = Api()
        if first:
            api.store.settings["excel_path"] = excel
            api.store.config.save()
        api.open_excel = lambda: Path(api.store.settings["excel_path"]).exists()   # 不真去开 Excel
        if api.store.accounts:
            api.engine.start()
        port = free_port()
        srv = devserver.serve(port, api)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        state.update(api=api, srv=srv, port=port)
        return api

    def settle(pg, ms=450):
        pg.wait_for_timeout(ms)

    def mail_arrives(raws):
        """新信到了，后台到点去收（相当于等上「多久看一次」那么久）。"""
        api = state["api"]
        n0 = len(api.store.state.data["processed"])
        for r in raws:
            imap.deliver(r)
        api.engine.wake()
        for _ in range(150):
            time.sleep(0.1)
            if len(api.store.state.data["processed"]) - n0 >= len(raws):
                break
        time.sleep(0.5)

    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1180, "height": 760})
        pg.on("pageerror", lambda e: errors.append(str(e)))

        # ================= 第一次用 =================
        cur["list"] = log["first"]
        api = boot(first=True)
        pg.goto(f"http://127.0.0.1:{state['port']}/?dev")
        step("开", "双击 Zhike.exe（头一回）")
        settle(pg, 900)

        def servers(prefix_new):
            if prefix_new:
                pg.fill("#wform [name=imaphost]", "127.0.0.1"); step("打字", "收信服务器")
                pg.fill("#wform [name=imapport]", str(imap.port)); step("打字", "收信端口")
                pg.click('#wform [data-seg="imapsec"] [data-v="plain"]'); step("点", "收信加密方式")
                pg.fill("#wform [name=smtphost]", "127.0.0.1"); step("打字", "发信服务器")
                pg.fill("#wform [name=smtpport]", str(smtp.port)); step("打字", "发信端口")
                pg.click('#wform [data-seg="smtpsec"] [data-v="plain"]'); step("点", "发信加密方式")
            else:
                pg.fill("#ihost", "127.0.0.1"); step("打字", "收信服务器")
                pg.fill("#iport", str(imap.port)); step("打字", "收信端口")
                pg.select_option("#isec", "plain"); step("点", "收信加密方式（下拉）")
                pg.fill("#shost", "127.0.0.1"); step("打字", "发信服务器")
                pg.fill("#sport", str(smtp.port)); step("打字", "发信端口")
                pg.select_option("#ssec", "plain"); step("点", "发信加密方式（下拉）")

        if version == "0.3.0":
            pg.wait_for_selector("#wform")
            pg.fill("#wform [name=email]", imap.user); step("打字", "邮箱地址")
            pg.fill("#wform [name=pw]", imap.password); step("打字", "应用专用密码")
            settle(pg, 500)
            servers(True)
            pg.click('#wform [data-act="connect"]'); step("点", "连上")
            pg.wait_for_selector(".rec")
            settle(pg)
            log["check"]["recs_shown"] = pg.eval_on_selector_all(".rec .rec-name", "els => els.map(e => e.value)")
            recs = {r["name"]: r for r in state["api"].recs()}
            for name, to in (("发票", "finance@ourco.example"), ("询价", "sales@ourco.example")):
                box = f'.rec[data-rec="{recs[name]["id"]}"] .tag-in'
                pg.fill(box, to)
                pg.press(box, "Enter"); step("打字", f"「{name}」转给 {to}")
            pg.click('[data-act="accept"]'); step("点", "收下 4 条")
            pg.wait_for_selector(".toast")
            settle(pg)
        else:
            pg.wait_for_selector(".demo")
            pg.click('.demo [data-nav="settings"]'); step("点", "横幅上的「连邮箱」")
            pg.wait_for_selector("#aemail")
            pg.fill("#aemail", imap.user); step("打字", "邮箱地址")
            pg.fill("#apw", imap.password); step("打字", "应用专用密码")
            settle(pg, 500)
            if pg.is_hidden("#ihost"):
                pg.click('[data-act="adv"]'); step("点", "自己填服务器")
            servers(False)
            pg.click('[data-act="connect"]'); step("点", "连上")
            pg.wait_for_selector(".msg.ok")
            pg.click('.side [data-nav="inbox"]'); step("点", "去「收件」")
            pg.wait_for_selector(".li")
            settle(pg, 500)
            build_rules_v020(pg, step, KEY, TRUTH, RAW, state)
        # 连好、建好以后来了 4 封新信，后台到点自己收
        first_new = [g.order_lotusmart()[0], g.invoice_qingshi()[0], g.ship_sf()[0], g.inquiry(en=False)[0]]
        mail_arrives(first_new)
        pg.click('.side [data-nav="table"]'); step("点", "去「表格」")
        pg.wait_for_selector('[data-act="open-excel"]')
        pg.click('[data-act="open-excel"]'); step("点", "打开 Excel（看结果）")
        settle(pg, 300)
        log["check"]["first"] = {s: len(rows(s)) for s in ("订单", "发票", "物流", "询价")}
        log["check"]["first_forwards"] = sorted(x for s in smtp.sent for x in s[1])
        log["check"]["first_rules"] = [r["name"] for r in state["api"].store.rules]

        # ================= 第二次用：第二天开机 =================
        cur["list"] = log["second"]
        n_fw = len(smtp.sent)
        api = boot()                      # 开机：程序自己起来进托盘、自己连上次的邮箱（两版都是 0 下）
        log["check"]["engine_running_after_boot"] = bool(api.engine._thread and api.engine._thread.is_alive())
        second_new = [g.order_shanmen()[0], g.ship_ninja()[0], baita("BT-2026-118", "1,234.00")]
        mail_arrives(second_new)
        pg.goto(f"http://127.0.0.1:{state['port']}/?dev")
        pg.wait_for_selector(".side .nav-i, .side [data-nav]")
        settle(pg, 800)
        if version == "0.3.0":
            pg.evaluate("window.zkShown && window.zkShown()")
        step("点", "托盘图标（打开窗口）")
        settle(pg, 800)
        bkey = parse(second_new[2]).key()
        if version == "0.3.0":
            pg.wait_for_selector('.rec')
            log["check"]["second_recs_shown"] = pg.inner_text(".rec .rec-t")
            pg.click('[data-act="accept"]'); step("点", "收下 1 条（归进「发票」）")
            pg.wait_for_selector(".toast")
            log["check"]["second_toast"] = pg.inner_text(".toast span")
            settle(pg)
        else:
            extend_rule_v020(pg, step, bkey, state)
            mail_arrives([baita("BT-2026-131", "560.00")])      # 0.2.0：头一封白塔的发票已经错过了，只能等下一封
        pg.click('.side [data-nav="table"]'); step("点", "去「表格」")
        pg.wait_for_selector('[data-act="open-excel"]')
        pg.click('[data-act="open-excel"]'); step("点", "打开 Excel（看结果）")
        settle(pg, 300)
        inv = rows("发票")
        log["check"]["second_baita_rows"] = [r.get("发票号") for r in inv if str(r.get("发票号") or "").startswith("BT-")]
        log["check"]["second_forwards"] = sorted(x for s in smtp.sent[n_fw:] for x in s[1])
        log["check"]["second_all_rows"] = {s: len(rows(s)) for s in ("订单", "发票", "物流", "询价")}
        b.close()
    state["srv"].shutdown()
    state["api"].engine.stop()
    imap.stop()
    smtp.stop()
    log["errors"] = errors
    for k in ("first", "second"):
        c = {"点": 0, "打字": 0, "拖选": 0, "开": 0}
        for s in log[k]:
            c[s["kind"]] = c.get(s["kind"], 0) + 1
        log["count_" + k] = {"steps": len(log[k]), **c}
    (Path(out) / f"steps-{version}.json").write_text(json.dumps(log, ensure_ascii=False, indent=1, default=str), "utf-8")
    print(json.dumps({k: log[k] for k in ("version", "count_first", "count_second", "check", "errors")}, ensure_ascii=False, default=str))


def build_rules_v020(pg, step, KEY, T, RAW, state):
    """0.2.0：照比武那套手点 4 条规则（跟 run_zhike_v020.py 一样的点法）。"""
    rid = {}

    def settle(ms=450):
        pg.wait_for_timeout(ms)

    def open_mail(fname):
        key = KEY[fname]
        if pg.evaluate("S.sel") != key:
            pg.click(f'.li[data-mail="{key}"]'); step("点", f"打开样例信 {fname}")
            settle(250)

    def pick(fname, value, name, rule):
        open_mail(fname)
        key = KEY[fname]
        s = pg.evaluate("([k, v]) => S.mails.find(x => x.key === k).text.indexOf(v)", [key, value])
        sg = pg.query_selector(f'#mbody .sg[data-s="{s}"]')
        if sg and sg.inner_text() == value:
            sg.click(); step("点", f"点虚线建议「{value}」")
        else:
            pg.evaluate(SELECT_JS, [s, s + len(value)]); step("拖选", f"拖选「{value}」")
        pg.wait_for_selector("#pname")
        if pg.input_value("#pname") != name:
            pg.fill("#pname", name); step("打字", f"字段名改成「{name}」")
        want = rid.get(rule, "__new")
        if pg.input_value("#prule") != want:
            pg.select_option("#prule", want); step("点", f"「放进」选「{rule}」")
        pg.click("#padd"); step("点", "收下")
        settle(600)
        if rule not in rid:
            rid[rule] = state["api"].store.rules[0]["id"]
            pg.wait_for_function("(id) => S.rules.some(r => r.id === id)", arg=rid[rule], timeout=8000)

    def to_rule(rule):
        if pg.evaluate("S.view") != "rules":
            pg.click('.side [data-nav="rules"]'); step("点", "去「规则」")
            settle()
        if pg.evaluate("S.ruleSel") != rid[rule]:
            pg.click(f'.ri[data-rule="{rid[rule]}"]'); step("点", f"选规则「{rule}」")
            settle()

    def rename(rule):
        to_rule(rule)
        pg.fill("#rname", rule); step("打字", f"规则改名「{rule}」")
        # 0.2.0 的坑：改名后 450 毫秒才存，这当口心跳（4 秒一次）把界面手里的规则换成后台旧的，下一下改动会把新名字冲掉。
        # 走步骤账时多等一个心跳，让它存稳（只是等，不算一步）；0.3.0 改着的时候心跳先不换。
        settle(4500)

    def tag(rule, path, v):
        to_rule(rule)
        pg.fill(f'[data-tagin="{path}"]', v)
        pg.press(f'[data-tagin="{path}"]', "Enter"); step("打字", f"{'发件人' if 'from' in path else '主题' if 'subject' in path else '转发'}加「{v}」")
        settle(700)

    def untag(rule, path, i=0):
        to_rule(rule)
        pg.click(f'[data-untag="{path}"][data-i="{i}"]'); step("点", "删掉猜的发件人条件")
        settle(700)

    def forward(rule, to):
        to_rule(rule)
        pg.click('label.switch:has(input[data-toggle="forward.enabled"])'); step("点", "打开「自动转发」")
        settle(700)
        tag(rule, "forward.to", to)

    def builtin(rule, k):
        to_rule(rule)
        pg.click(f'[data-builtin="{k}"]'); step("点", "加内置字段「附件」")
        settle(600)

    def back_inbox():
        pg.click('.side [data-nav="inbox"]'); step("点", "回「收件」")
        settle(500)

    v = lambda f, k: T[f]["fields"][k]  # noqa: E731

    def shown(f, needle):
        return next(ln for ln in RAW[f].split("\n") if needle in ln)

    pick("t01.eml", v("t01.eml", "订单号"), "订单号", "订单")
    pick("t01.eml", shown("t01.eml", "实付金额").split("：", 1)[1], "金额", "订单")
    pick("t01.eml", shown("t01.eml", "下单时间").split("：", 1)[1], "下单日期", "订单")
    pick("t02.eml", v("t02.eml", "订单号"), "订单号", "订单")
    pick("t02.eml", shown("t02.eml", "Total").split("  ", 1)[1].strip(), "金额", "订单")
    pick("t02.eml", shown("t02.eml", "Order Date").split("  ", 1)[1].strip(), "下单日期", "订单")
    rename("订单")
    tag("订单", "conditions.from", "@lotus-mart.example")
    tag("订单", "conditions.subject", "order")
    back_inbox()
    pick("t03.eml", v("t03.eml", "发票号"), "发票号", "发票")
    pick("t03.eml", shown("t03.eml", "Amount Due").split("  ", 1)[1].strip(), "金额", "发票")
    pick("t03.eml", shown("t03.eml", "Due Date").split("  ", 1)[1].strip(), "到期日", "发票")
    pick("t04.eml", v("t04.eml", "发票号"), "发票号", "发票")
    pick("t04.eml", shown("t04.eml", "应付金额").split("：", 1)[1], "金额", "发票")
    pick("t04.eml", shown("t04.eml", "付款期限").split("：", 1)[1], "到期日", "发票")
    rename("发票")
    builtin("发票", "@attachments")
    tag("发票", "conditions.from", "@qingshi-tech.example")
    tag("发票", "conditions.subject", "发票")
    forward("发票", "finance@ourco.example")
    back_inbox()
    pick("t05.eml", v("t05.eml", "运单号"), "运单号", "物流")
    pick("t05.eml", shown("t05.eml", "预计送达").split("：", 1)[1], "预计送达", "物流")
    pick("t06.eml", v("t06.eml", "运单号"), "运单号", "物流")
    pick("t06.eml", shown("t06.eml", "Estimated Delivery").split(": ", 1)[1], "预计送达", "物流")
    rename("物流")
    tag("物流", "conditions.from", "@ninjaexp.example")
    tag("物流", "conditions.subject", "parcel")
    back_inbox()
    pick("t07.eml", v("t07.eml", "产品"), "产品", "询价")
    pick("t07.eml", shown("t07.eml", "数量").split("：", 1)[1], "数量", "询价")
    pick("t07.eml", v("t07.eml", "电话"), "电话", "询价")
    pick("t08.eml", v("t08.eml", "产品"), "产品", "询价")
    pick("t08.eml", shown("t08.eml", "Quantity").split(": ", 1)[1], "数量", "询价")
    pick("t08.eml", v("t08.eml", "电话"), "电话", "询价")
    rename("询价")
    untag("询价", "conditions.from", 0)
    tag("询价", "conditions.subject", "报价")
    tag("询价", "conditions.subject", "Quotation")
    forward("询价", "sales@ourco.example")


def extend_rule_v020(pg, step, bkey, state):
    """0.2.0 第二次用：新供应商的发票没规则管。人得自己发现它、一个字段一个字段点进「发票」、再加发件人和主题条件。"""
    api = state["api"]
    inv = next(r for r in api.store.rules if r["name"] == "发票")
    pg.wait_for_selector(".li")
    pg.click(f'.li[data-mail="{bkey}"]'); step("点", "在收件里找到白塔那封发票")
    pg.wait_for_timeout(300)
    for label, name in (("Invoice Number", "发票号"), ("Total Due", "金额"), ("Payment Due", "到期日")):
        pg.click(f'#mbody .sg[title="{label}"]'); step("点", f"点虚线建议「{label}」")
        pg.wait_for_selector("#pname")
        pg.fill("#pname", name); step("打字", f"字段名改成「{name}」（跟表里那列对上）")
        pg.select_option("#prule", inv["id"]); step("点", "「放进」选「发票」")
        pg.click("#padd"); step("点", "收下")
        pg.wait_for_timeout(700)
    pg.click('.side [data-nav="rules"]'); step("点", "去「规则」")
    pg.wait_for_timeout(400)
    if pg.evaluate("S.ruleSel") != inv["id"]:
        pg.click(f'.ri[data-rule="{inv["id"]}"]'); step("点", "选规则「发票」")
        pg.wait_for_timeout(400)
    for path, v, what in (("conditions.from", "@baita-office.example", "发件人"), ("conditions.subject", "Tax Invoice", "主题")):
        pg.fill(f'[data-tagin="{path}"]', v)
        pg.press(f'[data-tagin="{path}"]', "Enter"); step("打字", f"{what}加「{v}」")
        pg.wait_for_timeout(700)
    pg.click('.side [data-nav="inbox"]'); step("点", "回「收件」")
    pg.wait_for_timeout(400)


SELECT_JS = """([s, e]) => {
  const body = document.querySelector('#mbody');
  const kids = [...body.children];
  const loc = (o) => { for (const k of kids) { const st = +k.dataset.s, n = k.textContent.length;
      if (o >= st && o <= st + n) return [k.firstChild, o - st]; } };
  const [a, ao] = loc(s), [b, bo] = loc(e);
  const r = document.createRange(); r.setStart(a, ao); r.setEnd(b, bo);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  body.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
}"""


if __name__ == "__main__":
    if sys.argv[1] == "--one":
        walk(sys.argv[2], Path(sys.argv[3]), sys.argv[4])
    else:
        out = Path(sys.argv[1])
        out.mkdir(parents=True, exist_ok=True)
        old = Path(sys.argv[2])
        for ver, app in (("0.2.0", old), ("0.3.0", HERE.parent / "app")):
            subprocess.run([sys.executable, __file__, "--one", ver, str(app), str(out)], check=True)
