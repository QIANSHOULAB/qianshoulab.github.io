"""知客僧上场：真界面（devserver + Playwright）里像用户一样点出 4 条规则，再让引擎吃 200 封。

    python run_zhike.py DATA_DIR OUT_DIR

- 本地假 IMAP / SMTP（zhike.fakeservers），不连任何真邮箱、不对外发信。
- 「点几下」按真实界面动作数：点一下、拖选一段、在框里打一次字（回车算在打字里）各记 1。
- 用户只看得见 DATA_DIR/train 里的 10 封样例；比武用 DATA_DIR/test。
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "app"))
sys.path.insert(0, str(HERE))

DATA, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
os.environ["ZHIKE_HOME"] = tempfile.mkdtemp(prefix="zhike-bench-")
os.environ["ZHIKE_NO_KEYRING"] = "1"

from zhike.api import Api  # noqa: E402
from zhike.engine import Engine  # noqa: E402
from zhike.fakeservers import FakeImap, FakeSmtp, account_for, free_port  # noqa: E402
from zhike.mailparse import parse  # noqa: E402
from zhike.secrets import Secrets  # noqa: E402
from zhike.store import Store  # noqa: E402
from zhike import devserver  # noqa: E402

imap = FakeImap(user="me@ourco.example").start()
smtp = FakeSmtp(user="me@ourco.example").start()
store = Store()
sec = Secrets(store.root)
store.settings["excel_path"] = str(OUT / "知客僧.xlsx")
acct = account_for(imap, smtp)
store.accounts.append(acct)
store.config.save()
sec.set(f"pw:{acct['id']}", imap.password)
eng = Engine(store, sec, ai_base="http://127.0.0.1:9/v1beta")
api = Api(store, eng)

train = sorted((DATA / "train").glob("*.eml"))
for f in train:
    imap.deliver(f.read_bytes())
eng.connect_new(acct)          # 新加邮箱：最近的信当样例，进度从现在开始
KEY = {f.name: parse(f.read_bytes()).key() for f in train}

port = free_port()
srv = devserver.serve(port, api)
threading.Thread(target=srv.serve_forever, daemon=True).start()

from playwright.sync_api import sync_playwright  # noqa: E402

acts = {"click": 0, "drag": 0, "type": 0, "chars": 0}
steps = []


def note(kind, what, chars=0):
    acts[kind] += 1
    acts["chars"] += chars
    steps.append(f"{kind}: {what}")


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


def run():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
        pg.goto(f"http://127.0.0.1:{port}/?dev")
        pg.wait_for_selector(".li")
        pg.wait_for_timeout(500)
        rid = {}

        def settle(ms=450):
            pg.wait_for_timeout(ms)

        def open_mail(fname):
            key = KEY[fname]
            if pg.evaluate("S.sel") != key:
                pg.click(f'.li[data-mail="{key}"]')
                note("click", f"打开 {fname}")
                settle(250)

        def pick(fname, value, name, rule):
            open_mail(fname)
            key = KEY[fname]
            s = pg.evaluate("([k, v]) => S.mails.find(x => x.key === k).text.indexOf(v)", [key, value])
            assert s >= 0, (fname, value)
            sg = pg.query_selector(f'#mbody .sg[data-s="{s}"]')
            if sg and sg.inner_text() == value:
                sg.click()
                note("click", f"点虚线建议「{value}」")
            else:
                pg.evaluate(SELECT_JS, [s, s + len(value)])
                note("drag", f"拖选「{value}」")
            pg.wait_for_selector("#pname")
            if pg.input_value("#pname") != name:
                pg.fill("#pname", name)
                note("type", f"字段名改成「{name}」", len(name))
            want = rid.get(rule, "__new")
            if pg.input_value("#prule") != want:
                pg.select_option("#prule", want)
                note("click", f"选规则「{rule}」")
            pg.click("#padd")
            note("click", "添加")
            settle(600)
            if rule not in rid:
                rid[rule] = store.rules[0]["id"]
                # 界面的规则列表要等下一次心跳（≤4 秒）才刷新
                pg.wait_for_function("(id) => S.rules.some(r => r.id === id)", arg=rid[rule], timeout=8000)

        def to_rule(rule):
            if pg.evaluate("S.view") != "rules":
                pg.click('.side [data-nav="rules"]')
                note("click", "去「规则」")
                settle()
            if pg.evaluate("S.ruleSel") != rid[rule]:
                pg.click(f'.ri[data-rule="{rid[rule]}"]')
                note("click", f"选规则 {rule}")
                settle()

        def rename(rule):
            to_rule(rule)
            pg.fill("#rname", rule)
            note("type", f"规则改名「{rule}」", len(rule))
            settle(900)

        def tag(rule, path, v):
            to_rule(rule)
            pg.fill(f'[data-tagin="{path}"]', v)
            pg.press(f'[data-tagin="{path}"]', "Enter")
            note("type", f"{path} 加「{v}」", len(v))
            settle(700)

        def untag(rule, path, i=0):
            to_rule(rule)
            pg.click(f'[data-untag="{path}"][data-i="{i}"]')
            note("click", f"{path} 删第 {i + 1} 个")
            settle(700)

        def forward(rule, to):
            to_rule(rule)
            pg.click('label.switch:has(input[data-toggle="forward.enabled"])')
            note("click", "打开转发")
            settle(700)
            tag(rule, "forward.to", to)

        def builtin(rule, k):
            to_rule(rule)
            pg.click(f'[data-builtin="{k}"]')
            note("click", f"加内置字段 {k}")
            settle(600)

        def back_inbox():
            pg.click('.side [data-nav="inbox"]')
            note("click", "回「收件箱」")
            settle(500)

        T = json.load(open(DATA / "truth.json", encoding="utf-8"))["train"]
        v = lambda f, k: T[f]["fields"][k]  # noqa: E731
        raw = {f.name: parse(f.read_bytes()).text for f in train}

        def shown(f, needle):
            """用户眼里看到的那段原文（金额带币种、日期带时间，照原样选）"""
            line = next(ln for ln in raw[f].split("\n") if needle in ln)
            return line

        # ---- 订单：山门（中文纯文本）+ Lotus Mart（只有 HTML） ----
        t = raw["t01.eml"]
        pick("t01.eml", v("t01.eml", "订单号"), "订单号", "订单")
        amt = shown("t01.eml", "实付金额").split("：", 1)[1]
        pick("t01.eml", amt, "金额", "订单")
        dt = shown("t01.eml", "下单时间").split("：", 1)[1]
        pick("t01.eml", dt, "下单日期", "订单")
        pick("t02.eml", v("t02.eml", "订单号"), "订单号", "订单")
        pick("t02.eml", shown("t02.eml", "Total").split("  ", 1)[1].strip(), "金额", "订单")
        pick("t02.eml", shown("t02.eml", "Order Date").split("  ", 1)[1].strip(), "下单日期", "订单")
        rename("订单")
        tag("订单", "conditions.from", "@lotus-mart.example")
        tag("订单", "conditions.subject", "order")
        back_inbox()

        # ---- 发票：莲花（HTML 表格）+ 青石（中文纯文本，中文附件名） ----
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

        # ---- 物流 ----
        pick("t05.eml", v("t05.eml", "运单号"), "运单号", "物流")
        pick("t05.eml", shown("t05.eml", "预计送达").split("：", 1)[1], "预计送达", "物流")
        pick("t06.eml", v("t06.eml", "运单号"), "运单号", "物流")
        pick("t06.eml", shown("t06.eml", "Estimated Delivery").split(": ", 1)[1], "预计送达", "物流")
        rename("物流")
        tag("物流", "conditions.from", "@ninjaexp.example")
        tag("物流", "conditions.subject", "parcel")
        back_inbox()

        # ---- 询价：发件人各不相同，只能按主题认 ----
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

        # ---- 截图 ----
        pg.click(f'.ri[data-rule="{rid["发票"]}"]')
        settle(800)
        pg.screenshot(path=str(OUT / "zhike-rule.png"))
        pg.click('.side [data-nav="inbox"]')
        settle(500)
        pg.click(f'.li[data-mail="{KEY["t03.eml"]}"]')
        settle(600)
        pg.screenshot(path=str(OUT / "zhike-inbox.png"))
        b.close()
    return rid


t0 = time.time()
rid = run()
build_sec = round(time.time() - t0, 1)
rules = {r["name"]: r for r in store.rules}

# ---- 比武：200 封进信箱，跑一轮 ----
test = sorted((DATA / "test").glob("*.eml"))
name_of = {}
for f in test:
    rawb = f.read_bytes()
    imap.deliver(rawb)
    name_of[parse(rawb).key()] = f.name
t1 = time.time()
res = eng.run_once()
run_sec = round(time.time() - t1, 2)

pred = {}
for lg in store.state.data["log"]:
    n = name_of.get(lg["key"])
    if not n:
        continue
    fw = rules[lg["rule"]]["forward"]["to"] if lg.get("forward") == "ok" else []
    pred[n] = {"rule": lg["rule"], "fields": lg["fields"], "forward": fw}

# Excel 里能不能直接算账：金额是数字、日期是日期
from openpyxl import load_workbook  # noqa: E402
wb = load_workbook(store.settings["excel_path"])
typed = {"money_cells": 0, "money_numeric": 0, "date_cells": 0, "date_typed": 0, "rows": 0}
for ws in wb.worksheets:
    hdr = [c.value for c in ws[1]]
    for row in ws.iter_rows(min_row=2, values_only=True):
        typed["rows"] += 1
        for h, val in zip(hdr, row):
            if val in (None, ""):
                continue
            if h == "金额":
                typed["money_cells"] += 1
                typed["money_numeric"] += isinstance(val, (int, float))
            if h in ("下单日期", "到期日", "预计送达"):
                typed["date_cells"] += 1
                typed["date_typed"] += hasattr(val, "year")

json.dump(pred, open(OUT / "pred_zhike.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
meta = {"actions": acts, "steps": steps, "build_sec": build_sec, "run_sec_200": run_sec, "run": res,
        "smtp_sent": len(smtp.sent), "excel": typed,
        "rules": {k: {"conditions": r["conditions"], "fields": [{x: f.get(x) for x in ("name", "type", "labels", "next_line", "builtin")} for f in r["fields"]]} for k, r in rules.items()}}
json.dump(meta, open(OUT / "meta_zhike.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
print(json.dumps({k: meta[k] for k in ("actions", "build_sec", "run_sec_200", "smtp_sent", "excel")}, ensure_ascii=False))
srv.shutdown()
imap.stop()
smtp.stop()
