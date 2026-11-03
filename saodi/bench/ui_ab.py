"""界面快慢：两版轮流跑 ui_bench.py（同机同时段），每个场景取中位数。
用法：python ui_ab.py <材料目录> <旧 app 目录> <轮数> <输出 json>"""
from __future__ import annotations

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
out, old_app, rounds, res_path = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
NEW_APP = os.path.join(HERE, "..", "app")
res = {"old": {}, "new": {}}
for i in range(rounds):
    order = [("old", old_app), ("new", NEW_APP)] if i % 2 == 0 else [("new", NEW_APP), ("old", old_app)]
    for tag, app in order:
        subprocess.run([sys.executable, os.path.join(HERE, "ui_bench.py"), out, os.path.join(out, "shots-" + tag), app],
                       capture_output=True, text=True, timeout=900)
        for r in json.load(open(os.path.join(out, "ui_saodi.json"), encoding="utf-8")):
            d = res[tag].setdefault(r["scenario"], {"wall": [], "inpage": [], "wrong": 0, "clicks": r["clicks"], "typing": r["typing"]})
            d["wall"].append(r["run_to_toast_s"])
            d["inpage"].append(r["click_to_toast_ms"])
            d["wrong"] += r["wrong"] + r["lost"]
        print(i, tag, {k: (v["wall"][-1], v["inpage"][-1]) for k, v in res[tag].items()}, flush=True)
med = lambda xs: sorted(xs)[len(xs) // 2]  # noqa: E731
for tag in res:
    for sc, d in res[tag].items():
        d["wall_med"], d["inpage_med"] = med(d["wall"]), med(d["inpage"])
json.dump(res, open(res_path, "w"), ensure_ascii=False, indent=1)
for sc in res["new"]:
    o, n = res["old"][sc], res["new"][sc]
    print(sc, "old", o["wall_med"], "s", o["inpage_med"], "ms", f'{o["clicks"]}+{o["typing"]}', "| new", n["wall_med"], "s", n["inpage_med"], "ms",
          f'{n["clicks"]}+{n["typing"]}', "| wrong", o["wrong"], n["wrong"])
