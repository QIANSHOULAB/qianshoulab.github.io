"""下载：扫地僧和 aria2 轮流各跑 N 遍（同机同时段），记用时和对答案。
用法：python dl_ab.py <输出目录> <遍数> <结果 json>"""
from __future__ import annotations

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
out, n, res_path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
res = {"saodi": [], "aria2": []}
for i in range(n):
    for tool in (("saodi", "aria2") if i % 2 == 0 else ("aria2", "saodi")):
        r = subprocess.run([sys.executable, os.path.join(HERE, "dl_bench.py"), out, tool], capture_output=True, text=True, timeout=900)
        j = json.loads(r.stdout)
        res[tool].append({k: j[k] for k in ("ok", "total", "wrong_name", "missing_or_corrupt", "junk_files", "big_resumed", "elapsed_s")})
        print(i, tool, j["elapsed_s"], f'{j["ok"]}/{j["total"]}', "junk", j["junk_files"], flush=True)
med = lambda xs: sorted(xs)[len(xs) // 2]  # noqa: E731
res["median_s"] = {t: med([x["elapsed_s"] for x in res[t]]) for t in ("saodi", "aria2")}
json.dump(res, open(res_path, "w"), ensure_ascii=False, indent=1)
print(res["median_s"])
