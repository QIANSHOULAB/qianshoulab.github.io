"""0.4.0：英文界面那套准不准（规则名、列名换成英文，认法应该一字不差）。

    python run_zhike_en.py DATA_DIR OUT_DIR

跟 run_zhike.py 同一套用法（拟好的 4 条 → 发票转 finance@、询价转 sales@ → 收下），只是 ZHIKE_LANG=en、不走界面（界面英文那遍在
tests/test_v04.py 真点过）。打分前把英文规则名、列名换回中文（标准答案是中文写的），再用同一个 score.py。
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "app"))
sys.path.insert(0, str(HERE))
DATA, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
os.environ["ZHIKE_HOME"] = tempfile.mkdtemp(prefix="zhike-bench-en-")
os.environ["ZHIKE_NO_KEYRING"] = "1"
os.environ["ZHIKE_LANG"] = "en"

from zhike import learn, text  # noqa: E402
from zhike.api import Api  # noqa: E402
from zhike.engine import Engine  # noqa: E402
from zhike.fakeservers import FakeImap, FakeSmtp, account_for  # noqa: E402
from zhike.mailparse import parse  # noqa: E402
from zhike.secrets import Secrets  # noqa: E402
from zhike.store import Store  # noqa: E402
from score import score  # noqa: E402

imap = FakeImap(user="me@ourco.example").start()
smtp = FakeSmtp(user="me@ourco.example").start()
store = Store()
assert store.lang == "en"
sec = Secrets(store.root)
store.settings["excel_path"] = str(OUT / "Zhike.xlsx")
store.settings["demo"] = False
acct = account_for(imap, smtp)
store.accounts.append(acct)
store.config.save()
sec.set(f"pw:{acct['id']}", imap.password)
eng = Engine(store, sec, ai_base="http://127.0.0.1:9/v1beta")
api = Api(store, eng)
eng.on_change = api._changed
for f in sorted((DATA / "train").glob("*.eml")):
    imap.deliver(f.read_bytes())
eng.connect_new(acct)
FORWARD = {"发票": "finance@ourco.example", "询价": "sales@ourco.example"}      # 按类型（内部认法），不按名字
recs = api.recs()
api.accept_recs([{"id": r["id"], "forward": [FORWARD[r["type"]]] if r["type"] in FORWARD else []} for r in recs])
names = sorted(r["name"] for r in store.rules)

test = sorted((DATA / "test").glob("*.eml"))
name_of = {}
for f in test:
    rb = f.read_bytes()
    imap.deliver(rb)
    name_of[parse(rb).key()] = f.name
t1 = time.time()
eng.run_once()
run_sec = round(time.time() - t1, 2)

zh_rule = {text.T(k, "en"): text.T(k, "zh") for k in text.TYPES.values()}
zh_builtin = {text.T("b_" + b, "en"): text.T("b_" + b, "zh") for b in ("received", "from", "from_name", "subject", "attachments")}


def zh_field(n):
    if n in zh_builtin:
        return zh_builtin[n]
    return learn.canonical(n)            # Order # → 订单号，Amount → 金额……


rules = {r["name"]: r for r in store.rules}
pred = {}
for lg in store.state.data["log"]:
    n = name_of.get(lg["key"])
    if not n:
        continue
    fw = rules[lg["rule"]]["forward"]["to"] if lg.get("forward") == "ok" else []
    pred[n] = {"rule": zh_rule.get(lg["rule"], lg["rule"]), "fields": {zh_field(k): v for k, v in lg["fields"].items()}, "forward": fw}
truth = json.load(open(DATA / "truth.json", encoding="utf-8"))
s = score(truth, pred)
s.pop("examples")
res = {"rules_en": names, "run_sec_200": run_sec, "smtp_sent": len(smtp.sent),
       "headers": {ws.title: [c.value for c in ws[1]] for ws in __import__("openpyxl").load_workbook(store.settings["excel_path"]).worksheets},
       "score": {k: s[k] for k in ("field_total", "field_err", "rule_err", "junk_rows", "fwd_should", "fwd_err")}}
json.dump(res, open(OUT / "meta_zhike_en.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False))
eng.stop()
imap.stop()
smtp.stop()
