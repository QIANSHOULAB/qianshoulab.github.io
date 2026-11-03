"""两版轮流跑同一套材料（每轮重造），比核心快慢：同机同时段，免得拿别的会话量的数比。
用法：python speed_ab.py <材料目录> <旧版 bench 目录> <新版 bench 目录> <轮数> <输出 json>"""
from __future__ import annotations

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen  # noqa: E402

out, old_b, new_b, rounds, res_path = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
SC = ["R1", "R2", "R3", "R4", "R5", "R6", "O1", "O2"]
res = {"old": {s: [] for s in SC}, "new": {s: [] for s in SC}, "wrong": {"old": 0, "new": 0}}
for i in range(rounds):
    for tag, b in (("old", old_b), ("new", new_b)) if i % 2 == 0 else (("new", new_b), ("old", old_b)):
        for s in SC:
            gen.make(out, s)
        r = subprocess.run([sys.executable, os.path.join(b, "run_ours.py"), out, ",".join(SC)], capture_output=True, text=True)
        for x in json.loads(r.stdout):
            res[tag][x["scenario"]].append(x["run_s"])
            res["wrong"][tag] += x["wrong"] + x["lost"]
        gen.unlock_all(out)
        print(i, tag, {s: res[tag][s][-1] for s in SC}, flush=True)
med = lambda xs: sorted(xs)[len(xs) // 2]  # noqa: E731
res["median"] = {tag: {s: med(v) for s, v in res[tag].items()} for tag in ("old", "new")}
json.dump(res, open(res_path, "w"), ensure_ascii=False, indent=1)
print(json.dumps(res["median"], ensure_ascii=False), res["wrong"])
