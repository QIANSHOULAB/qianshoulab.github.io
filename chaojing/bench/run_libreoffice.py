#!/usr/bin/env python3
"""替补一：LibreOffice Writer 邮件合并（免费、不用注册，普通人能拿到的标准做法）。

python3 run_libreoffice.py <材料目录> <输出目录> [套名,...]

模拟用户的「最好情况」：
  1. 把表格注册成数据源（xlsx 用 Calc 驱动；CSV 用文本驱动，字符集保持默认——GUI 向导默认也不问）
  2. 把模板里每个 {{列名}} 换成数据库字段（GUI 里是 Ctrl+F2 → 数据库 → 选列 → 插入，逐个手点）
  3. 邮件合并输出为单独文件：Word 一遍、PDF 一遍，文件名取首列
需要 soffice 在跑：soffice --headless --invisible --accept="socket,host=localhost,port=2002;urp;" &
"""
import sys, os, json, time, re, shutil, glob
import uno
from com.sun.star.beans import PropertyValue, NamedValue

MAT, OUT = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
exp = json.load(open(os.path.join(MAT, "expected.json"), encoding="utf-8"))
ONLY = sys.argv[3].split(",") if len(sys.argv) > 3 else list(exp)
os.makedirs(OUT, exist_ok=True)

local = uno.getComponentContext()
resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
ctx = resolver.resolve("uno:socket,host=localhost,port=2002;urp;StarOffice.ComponentContext")
smgr = ctx.ServiceManager
desktop = smgr.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
dbctx = smgr.createInstanceWithContext("com.sun.star.sdb.DatabaseContext", ctx)


def P(**kw):
    out = []
    for k, v in kw.items():
        p = PropertyValue(); p.Name = k; p.Value = v; out.append(p)
    return tuple(out)


def url(p): return uno.systemPathToFileUrl(p)


def register(key, data):
    name = "bench_" + key
    if dbctx.hasByName(name): dbctx.revokeObject(name)
    ds = dbctx.createInstance()
    work = os.path.join(OUT, "_ds", key); os.makedirs(work, exist_ok=True)
    if data.endswith(".csv"):
        shutil.copy(os.path.join(MAT, data), work)
        ds.URL = "sdbc:flat:" + url(work)
        info = dict(Extension="csv", HeaderLine=True, FieldDelimiter=",", StringDelimiter='"')
        if os.environ.get("LO_CHARSET"):  # 「懂行的用户」：在数据源属性里手动选对字符集
            info["CharSet"] = "UTF-8" if open(os.path.join(MAT, data), "rb").read(3) == b"\xef\xbb\xbf" else "GB18030"
        ds.Info = P(**info)
        table = os.path.splitext(data)[0]
    else:
        ds.URL = "sdbc:calc:" + url(os.path.join(MAT, data)); table = "数据"
    odb = os.path.join(work, name + ".odb")
    ds.DatabaseDocument.storeAsURL(url(odb), ())
    dbctx.registerObject(name, ds)
    return name, table


def build_template(key, tpl, dsname, table):
    doc = desktop.loadComponentFromURL(url(os.path.join(MAT, tpl)), "_blank", 0, P(Hidden=True))
    sd = doc.createReplaceDescriptor(); sd.SearchRegularExpression = True; sd.SearchString = r"\{\{[^}]+\}\}"
    found = doc.findAll(sd); n = 0
    ranges = [found.getByIndex(i) for i in range(found.getCount())]
    styles = doc.StyleFamilies.getByName("PageStyles")
    # 段内多个的情况：重复扫直到没有
    def insert(r):
        col = r.getString().strip("{} ").strip()
        master = doc.createInstance("com.sun.star.text.FieldMaster.Database")
        master.DataBaseName = dsname; master.DataTableName = table; master.DataColumnName = col
        f = doc.createInstance("com.sun.star.text.TextField.Database"); f.attachTextFieldMaster(master)
        r.getText().insertTextContent(r, f, True)
    for r in ranges: insert(r); n += 1
    # 页眉页脚里同段第二个起
    for _ in range(5):
        more = 0
        for i in range(styles.getCount()):
            st = styles.getByIndex(i)
            for prop in ("HeaderText", "FooterText"):
                try: t = st.getPropertyValue(prop)
                except Exception: continue
                if t is None: continue
                en = t.createEnumeration()
                while en.hasMoreElements():
                    par = en.nextElement(); s = par.getString(); m = re.search(r"\{\{[^}]+\}\}", s)
                    if m:
                        c = t.createTextCursorByRange(par.getStart()); c.goRight(m.start(), False); c.goRight(m.end() - m.start(), True); insert(c); n += 1; more += 1
        if not more: break
    out = os.path.join(OUT, "_tpl", key + ".odt"); os.makedirs(os.path.dirname(out), exist_ok=True)
    doc.storeToURL(url(out), P(FilterName="writer8")); doc.close(True)
    return out, n


res = {}
for key in ONLY:
    s = exp[key]; first = None
    dsname, table = register(key, s["data"])
    # 首列做文件名（和我们的默认规则对齐）
    first_col = {"cert": "姓名", "invoice": "客户名称", "invoice_500": "客户名称", "contract": "合同编号", "payslip": "姓名", "notice": "单位"}[key]
    tpl, nfields = build_template(key, s["template"], dsname, table)
    for fmt, filt in (("docx", "MS Word 2007 XML"), ("pdf", "writer_pdf_Export")):
        od = os.path.join(OUT, key, fmt); shutil.rmtree(od, ignore_errors=True); os.makedirs(od)
        mm = smgr.createInstanceWithContext("com.sun.star.text.MailMerge", ctx)
        args = [NamedValue("DataSourceName", dsname), NamedValue("CommandType", 0), NamedValue("Command", table),
                NamedValue("DocumentURL", url(tpl)), NamedValue("OutputType", 2), NamedValue("OutputURL", url(od) + "/"),
                NamedValue("SaveAsSingleFile", False), NamedValue("FileNameFromColumn", True), NamedValue("FileNamePrefix", first_col),
                NamedValue("SaveFilter", filt)]
        t0 = time.time(); err = None
        try: mm.execute(tuple(args))
        except Exception as e:
            # 按首列命名失败（列里有 / : ? 等非法字符会让整批合并失败、一份不出）→ 用户只能改回默认编号命名重来
            err = str(e)[:120]
            shutil.rmtree(od, ignore_errors=True); os.makedirs(od)
            mm = smgr.createInstanceWithContext("com.sun.star.text.MailMerge", ctx)
            args = [a for a in args if a.Name not in ("FileNameFromColumn", "FileNamePrefix")]
            mm.execute(tuple(args))
        dt = time.time() - t0
        files = sorted(os.listdir(od))
        res[f"{key}-{fmt}"] = {"seconds": round(dt, 1), "files": len(files), "fields": nfields, "err": err, "sample": files[:4]}
        print(key, fmt, res[f"{key}-{fmt}"], flush=True)
json.dump(res, open(os.path.join(OUT, "libreoffice.json"), "w"), ensure_ascii=False, indent=1)
