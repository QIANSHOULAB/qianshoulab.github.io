#!/usr/bin/env python3
"""替补二：自己写代码的做法 —— pandas 读表 + docxtpl 填 Word + LibreOffice 转 PDF。
（DocsAutomator / PDFMonkey 这类在线服务背后也是「模板 + 数据 → 渲染」，这是不注册能拿到的最接近的开源做法。）

python3 run_docxtpl.py <材料目录> <输出目录> [套名,...]

照一个普通会写 Python 的人的写法：pandas 默认读表，CSV 先按 UTF-8 读、报错再换 GB18030；
文件名取首列、把非法字符换成 _；不做同名去重（常见写法）。
"""
import sys, os, re, json, time, glob, subprocess, shutil
import pandas as pd
from docxtpl import DocxTemplate

MAT, OUT = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
exp = json.load(open(os.path.join(MAT, "expected.json"), encoding="utf-8"))
ONLY = sys.argv[3].split(",") if len(sys.argv) > 3 else list(exp)
res = {}
for key in ONLY:
    s = exp[key]; t0 = time.time(); note = []
    p = os.path.join(MAT, s["data"])
    if p.endswith(".csv"):
        try: df = pd.read_csv(p, encoding="utf-8-sig", keep_default_na=False)
        except UnicodeDecodeError: df = pd.read_csv(p, encoding="gb18030", keep_default_na=False); note.append("UTF-8 报错，改 GB18030 重读")
    else:
        df = pd.read_excel(p).fillna("")
    od = os.path.join(OUT, key, "docx"); shutil.rmtree(od, ignore_errors=True); os.makedirs(od)
    first = df.columns[0]; errs = 0
    for _, row in df.iterrows():
        ctx = {k.strip(): v for k, v in row.to_dict().items()}
        name = re.sub(r'[\\/:*?"<>|]', "_", str(row[first])) or "空"
        try:
            tpl = DocxTemplate(os.path.join(MAT, s["template"])); tpl.render(ctx); tpl.save(os.path.join(od, name + ".docx"))
        except Exception as e:
            errs += 1; note.append(f"渲染失败：{str(e)[:80]}")
    t_docx = time.time() - t0
    pd_dir = os.path.join(OUT, key, "pdf"); shutil.rmtree(pd_dir, ignore_errors=True); os.makedirs(pd_dir)
    t1 = time.time()
    files = sorted(glob.glob(os.path.join(od, "*.docx")))
    for i in range(0, len(files), 50):  # 一次喂 50 个，免得命令行太长
        subprocess.run(["soffice", "--headless", "--norestore", "-env:UserInstallation=file:///tmp/claude-0/lo_conv", "--convert-to", "pdf", "--outdir", pd_dir] + files[i:i + 50],
                       capture_output=True)
    t_pdf = time.time() - t1
    res[key] = {"rows": len(df), "docx_files": len(files), "pdf_files": len(os.listdir(pd_dir)), "sec_docx": round(t_docx, 1), "sec_pdf": round(t_pdf, 1), "errs": errs, "note": note[:5]}
    print(key, res[key], flush=True)
json.dump(res, open(os.path.join(OUT, "docxtpl.json"), "w"), ensure_ascii=False, indent=1)
