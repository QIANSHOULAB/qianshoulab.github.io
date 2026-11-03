#!/usr/bin/env python3
"""给 fonts/<族>/<字重>/*.woff 生成 index.json（哪个字在哪一块）。
python3 make_index.py <字体目录(含 400/)> 块名1 块名2 ...   块名顺序 = 同一个字在多块里时的优先顺序
格式：{"v":1,"files":[块名...],"r":[距上段末尾, 段长, 块号, ...]}
"""
import sys, os, json
from fontTools.ttLib import TTFont
d, names = sys.argv[1], sys.argv[2:]
cov = {}
for i, n in enumerate(names):
    for cp in TTFont(os.path.join(d, "400", n + ".woff")).getBestCmap():
        cov.setdefault(cp, i)
r, p, cps = [], 0, sorted(cov)
i = 0
while i < len(cps):
    a = cps[i]; s = cov[a]; b = a
    while i + 1 < len(cps) and cps[i + 1] == b + 1 and cov[cps[i + 1]] == s: i += 1; b = cps[i]
    r += [a - p, b - a, s]; p = b; i += 1
json.dump({"v": 1, "files": names, "r": r}, open(os.path.join(d, "index.json"), "w"), separators=(",", ":"))
print(len(cov), "chars", len(names), "files")
