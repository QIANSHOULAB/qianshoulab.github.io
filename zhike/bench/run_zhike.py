"""知客僧 0.3.0 上场：真界面（devserver + Playwright）里照 0.3.0 的真人用法建规则，再让引擎吃 200 封。

    python run_zhike.py DATA_DIR OUT_DIR

0.3.0 的用法：连上邮箱，贫僧看最近的信拟好规则；人只做两件事——收不收、转给谁。
所以这里：打开窗口 → 拟好的 4 条摆在眼前 → 发票那张填 finance@、询价那张填 sales@ → 点「收下 4 条」。
（0.1 / 0.2 手点 107 下的那套在 run_zhike_v020.py，要对着 0.2.0 的代码跑。）

- 本地假 IMAP / SMTP（zhike.fakeservers），不连任何真邮箱、不对外发信。
- 「点几下」按真实界面动作数：点一下、拖选一段、在框里打一次字（回车算在打字里）各记 1。
- 用户只看得见 DATA_DIR/train 里的 10 封样例；比武用 DATA_DIR/test。打分、计时跟 0.2.0 同一套。
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
(OUT / "知客僧.xlsx").unlink(missing_ok=True)   # 上次的表别混进来
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
store.settings["demo"] = False
acct = account_for(imap, smtp)
store.accounts.append(acct)
store.config.save()
sec.set(f"pw:{acct['id']}", imap.password)
eng = Engine(store, sec, ai_base="http://127.0.0.1:9/v1beta")
api = Api(store, eng)
eng.on_change = api._changed

train = sorted((DATA / "train").glob("*.eml"))
for f in train:
    imap.deliver(f.read_bytes())
eng.connect_new(acct)          # 新加邮箱：最近的信当样例，进度从现在开始（跟界面里点「连上」一样）
KEY = {f.name: parse(f.read_bytes()).key() for f in train}
FORWARD = {"发票": "finance@ourco.example", "询价": "sales@ourco.example"}

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


def run():
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://127.0.0.1:{port}/?dev")
        pg.wait_for_selector(".rec")          # 一打开：拟好的规则摆在眼前
        pg.wait_for_timeout(300)
        names = pg.eval_on_selector_all(".rec .rec-name", "els => els.map(e => e.value)")
        recs = {r["name"]: r for r in api.recs()}
        pg.screenshot(path=str(OUT / "zhike-recs.png"))
        for name, to in FORWARD.items():
            box = f'.rec[data-rec="{recs[name]["id"]}"] .tag-in'
            pg.fill(box, to)
            pg.press(box, "Enter")
            note("type", f"「{name}」转给 {to}", len(to))
        pg.click('[data-act="accept"]')
        note("click", "收下 4 条")
        pg.wait_for_selector(".toast")
        pg.wait_for_timeout(300)
        # 截图：发票信、规则页
        pg.click(f'.li[data-mail="{KEY["t03.eml"]}"]')
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "zhike-inbox.png"))
        pg.click('.side [data-nav="rules"]')
        pg.wait_for_timeout(500)
        pg.screenshot(path=str(OUT / "zhike-rule.png"))
        b.close()
    assert not errors, errors
    return names


t0 = time.time()
rec_names = run()
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

# 同口径核心：解析 + 认规则（含按内容认、挡垃圾）+ 抽字段，不收信、不写表、不发信
from zhike import learn as _L, rules as _R  # noqa: E402
raws = [f.read_bytes() for f in test]
best = None
for _ in range(3):
    tc = time.time()
    for rb in raws:
        mm = parse(rb)
        rr = _R.first_match(store.rules, mm)
        if rr:
            ff = _L.extract_all(rr["fields"], mm)
            _R.junk_reason(mm, store.rules) and _R.complete(rr, ff)
    dt = time.time() - tc
    best = dt if best is None else min(best, dt)
core_sec = round(best, 2)

# 拟规则本身多快（10 封样例 → 4 条）
from zhike import recommend as _RC  # noqa: E402
tr = [parse(f.read_bytes(), uid=i + 1) for i, f in enumerate(train)]
tc = time.time()
for _ in range(10):
    _RC.recommend(tr, [])
rec_sec = round((time.time() - tc) / 10, 3)

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
typed = {"money_cells": 0, "money_numeric": 0, "date_cells": 0, "date_typed": 0, "qty_cells": 0, "qty_numeric": 0, "rows": 0}
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
            if h == "数量":
                typed["qty_cells"] += 1
                typed["qty_numeric"] += isinstance(val, (int, float))

json.dump(store.rules, open(OUT / "rules_zhike.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(pred, open(OUT / "pred_zhike.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
meta = {"actions": acts, "steps": steps, "rec_names": rec_names, "build_sec": build_sec, "rec_sec_10": rec_sec,
        "run_sec_200": run_sec, "core_sec_200": core_sec, "run": res, "smtp_sent": len(smtp.sent), "excel": typed,
        "rules": {k: {"conditions": r["conditions"], "forward": r["forward"]["to"],
                      "fields": [{x: f.get(x) for x in ("name", "type", "labels", "next_line", "builtin")} for f in r["fields"]]}
                  for k, r in rules.items()}}
json.dump(meta, open(OUT / "meta_zhike.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
print(json.dumps({k: meta[k] for k in ("actions", "rec_names", "build_sec", "rec_sec_10", "run_sec_200", "core_sec_200", "smtp_sent", "excel")}, ensure_ascii=False))
srv.shutdown()
imap.stop()
smtp.stop()
