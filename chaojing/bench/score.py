#!/usr/bin/env python3
"""汇总三家的「准」：python3 score.py <work 目录> [套名,...]  → 打印表格并写 <work>/score.json
我们：work/ours/<套>-both.zip；LibreOffice：work/lo/<套>/{docx,pdf}；docxtpl：work/tpl/<套>/{docx,pdf}
PDF 两种查法：有文字层的用文字层；另外三家 PDF 一律再过一遍 OCR（我们的 PDF 是图片，只能 OCR），用来横向比。
"""
import sys, os, json, subprocess
W = os.path.abspath(sys.argv[1]); E = os.path.join(W, "materials", "expected.json")
SETS = sys.argv[2].split(",") if len(sys.argv) > 2 else ["cert", "invoice", "contract", "payslip"]
HERE = os.path.dirname(os.path.abspath(__file__))


def chk(key, src, *flags):
    out = subprocess.run([sys.executable, os.path.join(HERE, "check.py"), E, key, src, *flags], capture_output=True, text=True)
    return json.loads(out.stdout)


res = {}
for key in SETS:
    srcs = {"抄经僧": (os.path.join(W, "ours", f"{key}-both.zip"),) * 2,
            "LibreOffice邮件合并": (os.path.join(W, "lo", key, "docx"), os.path.join(W, "lo", key, "pdf")),
            "LO邮件合并(手选字符集)": (os.path.join(W, "lo2", key, "docx"), os.path.join(W, "lo2", key, "pdf")),
            "docxtpl+LO": (os.path.join(W, "tpl", key, "docx"), os.path.join(W, "tpl", key, "pdf"))}
    for tool, (dsrc, psrc) in srcs.items():
        if not os.path.exists(dsrc): continue
        d = chk(key, dsrc)["docx"]; p = chk(key, psrc)["pdf"]; po = chk(key, psrc, "--force-ocr")["pdf"]
        res[f"{key}|{tool}"] = {"docx": d, "pdf": p, "pdf_ocr": po}
        f = lambda r: (r.get("total", "-"), r.get("errors", {}).get("文件名", "-"), r.get("files", 0))
        print(f"{key:9s} {tool:14s} Word 错{f(d)[0]:>3}（含文件名{f(d)[1]}）{f(d)[2]}份 | PDF 文字层 错{p.get('total','-')} [{p.get('mode')}] | PDF OCR 错{po.get('total','-')}", flush=True)
json.dump(res, open(os.path.join(W, "score.json"), "w"), ensure_ascii=False, indent=1)
