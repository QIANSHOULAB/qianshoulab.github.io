#!/usr/bin/env python3
"""通知套（notice）的版式核对：python3 check_layout.py <zip 或 PDF 文件夹>
  与下段同页：「总体要求」等 5 个标题不许落在页底（标题后面只剩页脚）
  段中不分页：两段长段落的「起」「止」必须在同一页
  字体：PDF 里嵌了宋体（Serif）和楷体（Kai）没有
"""
import sys, os, re, zipfile, subprocess, tempfile, json, unicodedata
src = sys.argv[1]; files = []
if src.endswith(".zip"):
    z = zipfile.ZipFile(src); d = tempfile.mkdtemp()
    for i, n in enumerate(z.namelist()):
        if n.lower().endswith(".pdf"): p = os.path.join(d, f"{i}.pdf"); open(p, "wb").write(z.read(n)); files.append(p)
else:
    files = [os.path.join(src, f) for f in os.listdir(src) if f.lower().endswith(".pdf")]
norm = lambda s: re.sub(r"\s+", "", unicodedata.normalize("NFKC", s))
HEADS = ["总体要求", "任务分工", "经费保障", "其他事项", "联系方式"]
PAIRS = [("长段落·段中不分页起", "长段落·段中不分页止"), ("长段落·二起", "长段落·二止")]
res = {"files": len(files), "pages": 0, "标题落页底": 0, "长段落被拆开": 0, "没嵌宋体": 0, "没嵌楷体": 0, "detail": []}
for f in sorted(files):
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", f], capture_output=True, text=True).stdout).group(1)); res["pages"] += n
    pages = [norm(subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), f, "-"], capture_output=True, text=True).stdout) for i in range(1, n + 1)]
    for h in HEADS:
        for i, t in enumerate(pages):
            k = t.find(h)
            if k >= 0 and i < n - 1 and re.fullmatch(r"(文号[^。，]{0,30})?", t[k + len(h):]):
                res["标题落页底"] += 1; res["detail"].append(f"{os.path.basename(f)} 第{i+1}页 标题「{h}」落在页底")
    for a, b in PAIRS:
        pa = [i for i, t in enumerate(pages) if norm(a) in t]; pb = [i for i, t in enumerate(pages) if norm(b) in t]
        if pa != pb or not pa: res["长段落被拆开"] += 1; res["detail"].append(f"{os.path.basename(f)} 「{a[:5]}」起在第{[x+1 for x in pa]}页、止在第{[x+1 for x in pb]}页")
    fonts = subprocess.run(["pdffonts", f], capture_output=True, text=True).stdout
    if not re.search(r"Serif|Song|Sun|Ming", fonts, re.I): res["没嵌宋体"] += 1
    if not re.search(r"Kai", fonts, re.I): res["没嵌楷体"] += 1
res["total"] = res["标题落页底"] + res["长段落被拆开"]
print(json.dumps(res, ensure_ascii=False, indent=1))
