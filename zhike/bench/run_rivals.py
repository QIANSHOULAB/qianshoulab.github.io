"""替补对手上场：invoice2data（开源，按模板正则抽字段）+ Dovecot Sieve（开源邮件过滤器，判断转发）。

    python run_rivals.py DATA_DIR OUT_DIR

- invoice2data 不认识邮件格式：先用知客僧自己的 mailparse 把邮件转成文字（HTML 也转好），
  前面加上 From/Subject 两行，给模板的 keywords 用。等于白送了它一个邮件解析器。
- Sieve 用 sieve-test 离线跑（apt 装 dovecot-sieve），只看它打算干什么，不真发信。
- 模板和过滤脚本是照 train/ 那 10 封样例手写的，见 rivals/。
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "app"))
from zhike.mailparse import parse  # noqa: E402

DATA, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
TPL = HERE / "rivals" / "invoice2data"
SIEVE = HERE / "rivals" / "forward.sieve"

import logging  # noqa: E402
logging.disable(logging.CRITICAL)
from invoice2data import extract_data  # noqa: E402
from invoice2data.extract.loader import read_templates  # noqa: E402
from invoice2data.input import text as text_input  # noqa: E402

test = sorted((DATA / "test").glob("*.eml"))
tmp = Path(tempfile.mkdtemp(prefix="rivals-"))

# ---- invoice2data ----
t0 = time.time()
templates = read_templates(str(TPL))
pred = {}
for f in test:
    m = parse(f.read_bytes())
    txt = tmp / (f.stem + ".txt")
    txt.write_text(f"From: {m.from_name} <{m.from_addr}>\nSubject: {m.subject}\n\n{m.text}\n", encoding="utf-8")
    try:
        r = extract_data(str(txt), templates=templates, input_module=text_input)
    except Exception:
        r = None
    if r:
        fields = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in r.items()
                  if k not in ("issuer", "currency", "desc")}
        pred[f.name] = {"rule": r.get("issuer"), "fields": fields, "forward": []}
    else:
        pred[f.name] = {"rule": None, "fields": {}, "forward": []}
i2d_sec = round(time.time() - t0, 2)

# ---- Sieve ----
# sieve-test 不肯用 root 跑：脚本和信抄到谁都能读的临时目录，用 nobody 跑
import os, shutil  # noqa: E401,E402
sv = Path(tempfile.mkdtemp(prefix="sieve-"))
os.chmod(sv, 0o755)
shutil.copy(SIEVE, sv / "f.sieve")
for f in test:
    shutil.copy(f, sv / f.name)
for p in sv.iterdir():
    os.chmod(p, 0o644)
pre = ["runuser", "-u", "nobody", "--"] if os.geteuid() == 0 else []
t1 = time.time()
for f in test:
    out = subprocess.run(pre + ["sieve-test", str(sv / "f.sieve"), str(sv / f.name)],
                         capture_output=True, text=True).stdout
    to = re.findall(r"redirect message to: <?([^>\s]+)>?", out)
    pred[f.name]["forward"] = [a.strip("<>") for a in to]
sieve_sec = round(time.time() - t1, 2)

# 动手量：模板和脚本里用户要自己敲的东西
files = sorted(TPL.glob("*.yml")) + [SIEVE]
lines = sum(1 for p in files for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.strip().startswith("#"))
chars = sum(len(ln.strip()) for p in files for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.strip().startswith("#"))
regex = sum(len(re.findall(r"\\[sdS]|\(|\[", p.read_text(encoding="utf-8"))) > 0 for p in files)
nre = sum(1 for p in TPL.glob("*.yml") for ln in p.read_text(encoding="utf-8").splitlines() if re.search(r"\(.*\)", ln) and ":" in ln)

json.dump(pred, open(OUT / "pred_rivals.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
meta = {"invoice2data_sec_200": i2d_sec, "sieve_sec_200": sieve_sec, "files": len(files), "lines": lines,
        "chars": chars, "regex_lines": nre}
json.dump(meta, open(OUT / "meta_rivals.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(meta, ensure_ascii=False))
