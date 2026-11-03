#!/usr/bin/env python3
"""对答案：python3 check.py <expected.json> <套名> <zip 或文件夹> [--ocr]

每份成品（.docx/.pdf）按「唯一编号」认是哪一行，然后查：
  缺字：标准答案里的字没出现（含页眉页脚、表格）；整份认不出来时，这一行的字全算缺
  残留：还剩 {{ }} 没填
  乱码：出现 U+FFFD、连续问号替换掉了中文、或 Ã/å 这类 UTF-8 当 Latin-1 读的痕迹
  文件名：名字里该有的字（去掉非法字符后）不在文件名里；份数不够（同名被覆盖）
PDF 有文字层就 pdftotext；没有文字层（图片型）加 --ocr 用 tesseract chi_sim 近似核对（OCR 自身有误差，单列）。
"""
import json, re, sys, os, zipfile, subprocess, tempfile, unicodedata

exp_path, key, src = sys.argv[1:4]; OCR = "--ocr" in sys.argv or "--force-ocr" in sys.argv; FORCE = "--force-ocr" in sys.argv
rows = json.load(open(exp_path, encoding="utf-8"))[key]["rows"]
tmp = tempfile.mkdtemp()
files = []
if src.endswith(".zip"):
    z = zipfile.ZipFile(src)
    for info in z.infolist():
        if info.is_dir(): continue
        name = info.filename
        if not (info.flag_bits & 0x800):  # 没标 UTF-8 的按 cp437→gbk 试
            try: name = name.encode("cp437").decode("gbk")
            except Exception: pass
        p = os.path.join(tmp, str(len(files)) + os.path.splitext(name)[1]); open(p, "wb").write(z.read(info)); files.append((name, p))
else:
    for root, _, fs in os.walk(src):
        for f in fs:
            if f.endswith((".docx", ".pdf", ".odt")): files.append((os.path.relpath(os.path.join(root, f), src), os.path.join(root, f)))


def docx_text(p):
    z = zipfile.ZipFile(p); out = []
    for n in z.namelist():
        if re.match(r"word/(document|header\d*|footer\d*)\.xml$", n):
            xml = z.read(n).decode("utf-8")
            for para in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
                t = "".join(re.findall(r"<w:t(?:\s[^>]*)?>([^<]*)</w:t>", para))
                out.append(t.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&"))
    return "\n".join(out)


def pdf_text(p):
    t = subprocess.run(["pdftotext", "-layout", p, "-"], capture_output=True, text=True).stdout
    if t.strip() and not FORCE: return t, "text"
    if not OCR: return "", "image"
    d = tempfile.mkdtemp(); subprocess.run(["pdftoppm", "-r", "200", "-png", p, os.path.join(d, "pg")], check=True)
    o = ""
    for f in sorted(os.listdir(d)):
        o += subprocess.run(["tesseract", os.path.join(d, f), "-", "-l", "chi_sim+eng", "--psm", "4"], capture_output=True, text=True).stdout
    return o, "ocr"


def norm(s): return re.sub(r"\s+", "", unicodedata.normalize("NFKC", s))


def garbled(t):
    return bool(re.search(r"�|[ÃÂå][\x80-\xbf€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]|\?\?\?", t))


report = {"docx": {}, "pdf": {}}
for kind in ("docx", "pdf"):
    fl = [(n, p) for n, p in files if n.lower().endswith("." + kind) or (kind == "docx" and n.lower().endswith(".odt"))]
    if not fl: continue
    texts = []
    mode = None
    for n, p in fl:
        if kind == "docx": t = docx_text(p) if p.endswith(".docx") else ""; mode = "text"
        else: t, mode = pdf_text(p)
        texts.append((n, t))
    errs = {"缺字": 0, "残留空位": 0, "乱码": 0, "文件名": 0, "认不出是哪行": 0}
    detail = []
    used = set()
    for i, r in enumerate(rows):
        hit = None
        for j, (n, t) in enumerate(texts):
            if j not in used and norm(r["id"]) in norm(t): hit = j; break
        if hit is None:  # 编号没对上（比如 00000003 被读成 3）→ 找命中字最多的那份
            best = max(((sum(norm(m) in norm(t) for m in r["must"]), j) for j, (n, t) in enumerate(texts) if j not in used), default=(0, None))
            if best[0] >= 2: hit = best[1]; detail.append(f"行{i+1} 编号没对上，按内容认")
        if hit is None:
            errs["认不出是哪行"] += 1; errs["缺字"] += len(r["must"]); detail.append(f"行{i+1} 没找到成品（编号 {r['id']}）"); continue
        used.add(hit); n, t = texts[hit]; nt = norm(t)
        for m in r["must"]:
            if norm(m) not in nt:
                errs["缺字"] += 1; detail.append(f"行{i+1} 缺「{m[:30]}」 [{os.path.basename(n)}]")
        if "{{" in t or "}}" in t: errs["残留空位"] += 1; detail.append(f"行{i+1} 残留 {{{{}}}}")
        if garbled(t): errs["乱码"] += 1; detail.append(f"行{i+1} 乱码")
        toks = [x for x in re.split(r'[\\/:*?"<>|]', r["file_key"]) if x.strip()]
        base = os.path.basename(n)
        if not all(norm(x) in norm(base) for x in toks): errs["文件名"] += 1; detail.append(f"行{i+1} 文件名「{base}」不含「{r['file_key']}」")
    report[kind] = {"files": len(fl), "rows": len(rows), "mode": mode, "errors": errs, "total": sum(errs.values()), "detail": detail}

print(json.dumps(report, ensure_ascii=False, indent=1))
