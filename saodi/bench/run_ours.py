"""戒尺僧核心逻辑跑比武场景（跟界面点「执行」走同一条路：Api.rename_run / organize_run）。
用法：python run_ours.py <输出目录> <场景,...>   需要先 gen.py 造好。打印用时和对答案结果。"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "app"))
os.environ.setdefault("SAODI_HOME", tempfile.mkdtemp(prefix="saodi-home-"))
os.environ.setdefault("SAODI_LANG", "zh")  # 0.4.0 起新装默认英文；答案是中文文件夹名，不给就按中文比

from saodi.api import Api  # noqa: E402
import score  # noqa: E402

RENAME = {
    "R1": [{"type": "number", "start": 1, "step": 1, "digits": 4, "where": "start", "sep": "-"}],
    "R2": [{"type": "replace", "find": "IMG_", "to": "旅行_", "regex": False, "case": True}],
    "R3": [{"type": "date", "source": "modified", "fmt": "YYYY-MM-DD", "where": "start", "sep": " "}],
    "R4": [{"type": "date", "source": "taken", "fmt": "YYYYMMDD_hhmmss", "where": "name"}],
    "R5": [{"type": "case", "mode": "lower"}, {"type": "ext", "mode": "lower"}],
    "R6": [{"type": "trim"}],
}
ORGANIZE = {
    "O1": {"name": "按类型", "rules": [{"by": "type"}], "rest": "其他"},
    "O2": {"name": "照片按拍摄月份", "rules": [{"by": "date", "source": "taken", "fmt": "YYYY/YYYY-MM", "only": "photo"}], "rest": ""},
}


def run(out, name):
    api = Api()
    root = os.path.join(out, name)
    t0 = time.perf_counter()
    if name in RENAME:
        p = api.rename_preview(root, RENAME[name])
        t1 = time.perf_counter()
        r = api.rename_run(root, RENAME[name])
    else:
        p = api.organize_preview(root, ORGANIZE[name])
        t1 = time.perf_counter()
        r = api.organize_run(root, ORGANIZE[name])
    t2 = time.perf_counter()
    s = score.score(out, name)
    s.update({"tool": "戒尺僧", "preview_s": round(t1 - t0, 3), "run_s": round(t2 - t1, 3),
              "reported_failed": len(r.get("failed", [])), "failed_codes": sorted({f.get("err", "") for f in r.get("failed", [])})})
    return s


if __name__ == "__main__":
    out = sys.argv[1]
    res = [run(out, n) for n in sys.argv[2].split(",")]
    print(json.dumps(res, ensure_ascii=False, indent=1))
