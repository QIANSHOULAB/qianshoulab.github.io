#!/usr/bin/env python3
"""抄经僧比武材料生成器。

python3 gen_materials.py [输出目录，默认 ./work/materials]

产出：
  cert.docx / invoice.docx / contract.docx / payslip.docx   四份 Word 模板
  cert.xlsx / invoice.xlsx / contract.csv(UTF-8 BOM) / payslip.csv(GB18030，模拟中文 Excel 导出)
  invoice_500.xlsx                                           500 行速度测试
  expected.json                                              标准答案：每行成品里必须出现的字 + 期望文件名

刁钻点：占位符被拆成多个 run、加粗/变色/表格格子/页眉页脚里的占位符、图片、
生僻字（䶮 扩展A、𠮷 扩展B、龑喆堃）、空单元格、金额千分位、日期格式、超长文本、
名字带 / : ? 、两行同名、& < > 字符。测试材料里的人名公司名全是编的。
需要：python-docx openpyxl pillow
"""
import json, os, sys, random, datetime as dt
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from openpyxl import Workbook
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "work", "materials")
os.makedirs(OUT, exist_ok=True)
RED = RGBColor(0xC0, 0x1E, 0x1E); BLUE = RGBColor(0x1F, 0x4E, 0x9A)

LONG = ("本条款为测试超长文本而设：双方应本着诚实信用原则履行本合同约定的全部义务，任何一方不得擅自变更或解除合同。"
        "如遇不可抗力导致合同无法履行，受影响一方应在三个工作日内书面通知对方并提供相关证明材料，双方协商确定后续安排。"
        "因履行本合同发生的争议，由双方友好协商解决；协商不成的，任何一方均可向合同签订地有管辖权的人民法院提起诉讼。"
        "本合同未尽事宜，双方可另行签订补充协议，补充协议与本合同具有同等法律效力。本合同一式两份，双方各执一份。")
assert len(LONG) > 180


def img(path, text, color):
    im = Image.new("RGB", (240, 240), "white"); d = ImageDraw.Draw(im)
    d.ellipse((10, 10, 230, 230), outline=color, width=10); d.ellipse((60, 60, 180, 180), fill=color)
    im.save(path); return path


SEAL = img(os.path.join(OUT, "_seal.png"), "", (200, 30, 30))
LOGO = img(os.path.join(OUT, "_logo.png"), "", (30, 80, 160))


def runs(p, parts):
    """parts: [(text, {bold, color, size})]，故意把一个占位符拆成几段。"""
    for t, f in parts:
        r = p.add_run(t)
        r.bold = f.get("bold"); r.italic = f.get("italic")
        if f.get("color"): r.font.color.rgb = f["color"]
        if f.get("size"): r.font.size = Pt(f["size"])


def cell(c, parts):
    p = c.paragraphs[0]; runs(p, parts)


# ---------------- 证书（横版）----------------
def cert():
    d = Document(); s = d.sections[0]
    s.orientation = WD_ORIENT.LANDSCAPE; s.page_width, s.page_height = s.page_height, s.page_width
    runs(s.header.paragraphs[0], [("证书编号：", {}), ("{{证书编号}}", {"bold": True})])
    runs(s.footer.paragraphs[0], [("本证书可凭编号 ", {}), ("{{证书", {}), ("编号}}", {"italic": True}), (" 在线查验", {})])
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; runs(p, [("结业证书", {"bold": True, "size": 36})])
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    # 姓名：拆成三段，红色加粗大字
    runs(p, [("{{", {"bold": True, "color": RED, "size": 32}), ("姓", {"bold": True, "color": RED, "size": 32}), ("名}}", {"bold": True, "color": RED, "size": 32}), (" 同学：", {"size": 20})])
    p = d.add_paragraph(); runs(p, [("于 ", {}), ("{{颁发日期}}", {"color": BLUE}), (" 完成「", {}), ("{{课程名称}}", {"bold": True}), ("」全部课程，考核成绩 ", {}), ("{{成绩}}", {"bold": True, "color": RED}), (" 分，特发此证。", {})])
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.RIGHT; p.add_run().add_picture(SEAL, width=Cm(3))
    d.save(os.path.join(OUT, "cert.docx"))


# ---------------- 发票 ----------------
def invoice():
    d = Document(); s = d.sections[0]
    hp = s.header.paragraphs[0]; hp.add_run().add_picture(LOGO, width=Cm(1.2)); runs(hp, [("  示例商贸有限公司    发票号码：", {}), ("{{发票", {"color": RED}), ("号码}}", {"color": RED})])
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; runs(p, [("增值税普通发票（样张）", {"bold": True, "size": 20})])
    t = d.add_table(rows=4, cols=2); t.style = "Table Grid"
    for i, (k, v) in enumerate([("购买方", "{{客户名称}}"), ("纳税人识别号", "{{税号}}"), ("地址电话", "{{地址}}"), ("开票日期", "{{开票日期}}")]):
        cell(t.cell(i, 0), [(k, {"bold": True})])
        cell(t.cell(i, 1), [(v[:3], {"bold": i == 0}), (v[3:], {"bold": i == 0, "color": BLUE if i == 3 else None})])
    d.add_paragraph()
    t2 = d.add_table(rows=3, cols=4); t2.style = "Table Grid"
    for j, h in enumerate(["项目", "数量", "单价", "金额"]): cell(t2.cell(0, j), [(h, {"bold": True})])
    for j, h in enumerate(["{{项目}}", "{{数量}}", "{{单价}}", "{{金额}}"]): cell(t2.cell(1, j), [(h, {})])
    cell(t2.cell(2, 0), [("合计（大写）", {"bold": True})]); cell(t2.cell(2, 1), [("{{金额大写}}", {})])
    cell(t2.cell(2, 2), [("合计", {"bold": True})]); cell(t2.cell(2, 3), [("¥", {"bold": True}), ("{{金", {"bold": True, "color": RED}), ("额}}", {"bold": True, "color": RED})])
    p = d.add_paragraph(); runs(p, [("备注：", {"bold": True}), ("{{备注}}", {})])
    d.save(os.path.join(OUT, "invoice.docx"))


# ---------------- 合同 ----------------
def contract():
    d = Document(); s = d.sections[0]
    runs(s.header.paragraphs[0], [("合同编号：", {}), ("{{合同编号}}", {"bold": True})])
    runs(s.footer.paragraphs[0], [("甲方：{{甲方}}    乙方：{{乙方}}", {"size": 9})])
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; runs(p, [("技术服务合同", {"bold": True, "size": 22})])
    p = d.add_paragraph(); runs(p, [("甲方（委托方）：", {"bold": True}), ("{{甲", {"bold": True, "color": BLUE}), ("方", {"bold": True, "color": BLUE}), ("}}", {"bold": True, "color": BLUE})])
    p = d.add_paragraph(); runs(p, [("乙方（服务方）：", {"bold": True}), ("{{ 乙方 }}", {"bold": True})])
    p = d.add_paragraph(); runs(p, [("甲方住所：", {}), ("{{地址}}", {})])
    p = d.add_paragraph(); runs(p, [("第一条 服务期限自 ", {}), ("{{开始日期}}", {"color": RED}), (" 起至 ", {}), ("{{结束日期}}", {"color": RED}), (" 止。", {})])
    p = d.add_paragraph(); runs(p, [("第二条 合同总价为人民币 ", {}), ("{{合同金额}}", {"bold": True}), (" 元（大写：", {}), ("{{金额大写}}", {"bold": True}), ("）。", {})])
    p = d.add_paragraph(); runs(p, [("第三条 附加条款：", {}), ("{{附加条款}}", {})])
    t = d.add_table(rows=3, cols=2); t.style = "Table Grid"
    cell(t.cell(0, 0), [("甲方（盖章）：", {}), ("{{甲方}}", {"bold": True})]); cell(t.cell(0, 1), [("乙方（盖章）：", {}), ("{{乙方}}", {"bold": True})])
    cell(t.cell(1, 0), [("签约日期：", {}), ("{{签约日期}}", {})]); cell(t.cell(1, 1), [("签约日期：", {}), ("{{签约日期}}", {})])
    cell(t.cell(2, 0), [("经办人：", {}), ("{{经办人}}", {})]); cell(t.cell(2, 1), [("（以下无正文）", {})])
    d.save(os.path.join(OUT, "contract.docx"))


# ---------------- 工资条 ----------------
def payslip():
    d = Document(); s = d.sections[0]
    runs(s.header.paragraphs[0], [("{{月份}}", {"bold": True}), (" 工资条 · 仅限本人查阅", {})])
    p = d.add_paragraph(); p.add_run().add_picture(LOGO, width=Cm(1.5))
    t = d.add_table(rows=2, cols=3); t.style = "Table Grid"
    for j, (k, v) in enumerate([("姓名", "{{姓名}}"), ("工号", "{{工号}}"), ("部门", "{{部门}}")]):
        cell(t.cell(0, j), [(k, {"bold": True})]); cell(t.cell(1, j), [(v, {"bold": j == 0, "color": RED if j == 0 else None})])
    d.add_paragraph()
    t = d.add_table(rows=2, cols=5); t.style = "Table Grid"
    for j, (k, v) in enumerate([("基本工资", "{{基本工资}}"), ("绩效奖金", "{{绩效奖金}}"), ("补贴", "{{补贴}}"), ("扣款", "{{扣款}}"), ("实发", "{{实发}}")]):
        cell(t.cell(0, j), [(k, {"bold": True})])
        cell(t.cell(1, j), [(v[:4], {"bold": j == 4}), (v[4:], {"bold": j == 4, "color": BLUE if j == 4 else None})])
    p = d.add_paragraph(); runs(p, [("备注：", {}), ("{{备注}}", {"italic": True})])
    d.save(os.path.join(OUT, "payslip.docx"))


cert(); invoice(); contract(); payslip()


# ---------------- 通知（0.2.1 复赛加）：自动编号、宋体/仿宋/楷体、分页属性 ----------------
# 编号全是 Word 自动编号（numbering.xml），正文里没有一个手打的「一、」「1.」；
# 「标题」样式自带编号 + 与下段同页 + 段中不分页；长段落带段中不分页；正文孤行控制。
from docx.oxml import parse_xml
from docx.oxml.ns import qn, nsdecls
from docx.enum.style import WD_STYLE_TYPE

NUMBERING = [  # (abstractNumId, [(fmt, lvlText, suff, left, hanging)])
    (101, [("chineseCounting", "%1、", "nothing", 0, 0), ("chineseCounting", "（%2）", "nothing", 0, 0),
           ("decimal", "%3.", "tab", 840, 420), ("decimal", "(%4)", "tab", 1260, 420)]),
    (102, [("chineseCounting", "第%1条", "space", 0, 0)]),
    (103, [("decimal", "%1.", "tab", 420, 420), ("decimal", "%1.%2", "tab", 840, 420)]),
]


def add_numbering(d):
    el = d.part.numbering_part.element
    first_num = el.find(qn("w:num"))
    for aid, lvls in NUMBERING:
        x = f'<w:abstractNum {nsdecls("w")} w:abstractNumId="{aid}"><w:multiLevelType w:val="multilevel"/>'
        for i, (fmt, txt, suff, left, hang) in enumerate(lvls):
            x += (f'<w:lvl w:ilvl="{i}"><w:start w:val="1"/><w:numFmt w:val="{fmt}"/><w:suff w:val="{suff}"/><w:lvlText w:val="{txt}"/>'
                  f'<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="{left}" w:hanging="{hang}"/></w:pPr></w:lvl>')
        x += "</w:abstractNum>"
        first_num.addprevious(parse_xml(x))
    for nid, aid, restart in ((201, 101, False), (202, 102, False), (203, 103, False), (204, 103, True)):
        x = f'<w:num {nsdecls("w")} w:numId="{nid}"><w:abstractNumId w:val="{aid}"/>'
        if restart: x += '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>'
        el.append(parse_xml(x + "</w:num>"))


def set_fonts(rpr_owner, east, ascii_=None):
    rpr = rpr_owner.get_or_add_rPr(); f = rpr.find(qn("w:rFonts"))
    if f is None: f = parse_xml(f'<w:rFonts {nsdecls("w")}/>'); rpr.insert(0, f)
    f.set(qn("w:eastAsia"), east)
    if ascii_: f.set(qn("w:ascii"), ascii_); f.set(qn("w:hAnsi"), ascii_)


def ppr_add(p_or_style, xml):
    ppr = p_or_style.get_or_add_pPr(); ppr.append(parse_xml(xml))


def num(p, nid, ilvl):
    ppr_add(p._p, f'<w:numPr {nsdecls("w")}><w:ilvl w:val="{ilvl}"/><w:numId w:val="{nid}"/></w:numPr>')


def notice():
    d = Document(); add_numbering(d)
    normal = d.styles["Normal"]; normal.font.size = Pt(14)
    set_fonts(normal.element, "仿宋_GB2312", "Times New Roman")
    ppr_add(normal.element, f'<w:widowControl {nsdecls("w")}/>')
    h = d.styles.add_style("公文标题", WD_STYLE_TYPE.PARAGRAPH); h.base_style = normal; h.font.bold = True; h.font.size = Pt(16)
    set_fonts(h.element, "黑体")
    ppr_add(h.element, f'<w:keepNext {nsdecls("w")}/>'); ppr_add(h.element, f'<w:keepLines {nsdecls("w")}/>')
    ppr_add(h.element, f'<w:numPr {nsdecls("w")}><w:numId w:val="201"/></w:numPr>')  # 样式自带编号（一、二、三、）
    s = d.sections[0]
    runs(s.header.paragraphs[0], [("{{单位}} · 内部通知", {"size": 9})])
    runs(s.footer.paragraphs[0], [("文号 {{文号}}", {"size": 9})])
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("关于做好年度数据整理工作的通知"); r.bold = True; r.font.size = Pt(22); set_fonts(r._r, "方正小标宋简体")
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; r = p.add_run("{{文号}}"); set_fonts(r._r, "宋体", "SimSun")
    p = d.add_paragraph(); runs(p, [("{{单位}}", {"bold": True}), ("：", {})])
    FILL = "各部门要按本通知要求逐项落实，形成台账，专人负责，按期报送，确保数据完整、口径一致、来源可查。"
    def para(text, keep_lines=False):
        p = d.add_paragraph(); p.paragraph_format.first_line_indent = Pt(28); runs(p, [(text, {})])
        if keep_lines: ppr_add(p._p, f'<w:keepLines {nsdecls("w")}/>')
        return p
    def head(t): return d.add_paragraph(t, style="公文标题")
    head("总体要求")
    para("{{开头}}" + FILL)
    for k in range(2): para(FILL * 3)
    p = d.add_paragraph(); num(p, 201, 1); runs(p, [("工作目标：", {"bold": True}), ("全年数据当年清。", {})])
    p = d.add_paragraph(); num(p, 201, 1); runs(p, [("工作原则：", {"bold": True}), ("谁产生、谁负责。", {})])
    for t in ("数据要真实", "口径要统一"):
        p = d.add_paragraph(); num(p, 201, 2); runs(p, [(t + "，" + FILL, {})])
        p = d.add_paragraph(); num(p, 201, 3); runs(p, [("由 {{联系人}} 牵头核对。", {})])
        p = d.add_paragraph(); num(p, 201, 3); runs(p, [("核对结果于 {{日期}} 前报送。", {})])
    head("任务分工")
    para("长段落·段中不分页起。" + "{{正文}}" + FILL * 4 + "长段落·段中不分页止。", keep_lines=True)
    for k in range(3): para(FILL * 2)
    for t in ("台账建立", "专人负责", "按期报送"):
        p = d.add_paragraph(); num(p, 202, 0); runs(p, [(t + "：" + FILL, {})])
    head("经费保障")
    para("本项工作经费 {{金额}} 元，从部门预算列支。" + FILL * 2)
    p = d.add_paragraph(); num(p, 203, 0); runs(p, [("材料清单" , {})])
    p = d.add_paragraph(); num(p, 203, 1); runs(p, [("数据台账一份", {})])
    p = d.add_paragraph(); num(p, 203, 1); runs(p, [("说明材料一份", {})])
    p = d.add_paragraph(); num(p, 203, 0); runs(p, [("报送方式", {})])
    p = d.add_paragraph(); num(p, 204, 0); runs(p, [("重新起号的清单第一项", {})])
    head("其他事项")
    para("长段落·二起。" + FILL * 5 + "长段落·二止。", keep_lines=True)
    para(FILL * 3)
    head("联系方式")
    para("联系人：{{联系人}}。" + FILL)
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.RIGHT; r = p.add_run("{{单位}}办公室"); set_fonts(r._r, "楷体_GB2312", "KaiTi")
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.RIGHT; r = p.add_run("{{日期}}"); set_fonts(r._r, "KaiTi")
    d.save(os.path.join(OUT, "notice.docx"))


notice()

# ---------------- 数据 ----------------
# 名字：编的。刁钻行：生僻字、非法文件名字符、同名、空格子、超长、& < >
NAMES = ["张伟明", "刘䶮", "𠮷祥云", "王龑喆", "陈/晓:明?", "张伟明", "李堃", "赵一", "周*小<雨>", "欧阳春晓"]
CNUM = "零壹贰叁肆伍陆柒捌玖"


def daxie(n):  # 只给样本用：整数元
    n = int(round(n)); units = ["", "拾", "佰", "仟", "万", "拾", "佰", "仟", "亿"]
    s = ""; digits = str(n)[::-1]; zero = False
    for i, ch in enumerate(digits):
        v = int(ch)
        if v == 0:
            if i == 4: s = "万" + s
            zero = bool(s)
            continue
        s = CNUM[v] + units[i] + ("零" if zero and not s.startswith("万") else "") + s; zero = False
    return (s or "零") + "元整"


def fmt_money(x): return f"{x:,.2f}"


def save_xlsx(path, headers, rows, fmts):
    wb = Workbook(); ws = wb.active; ws.title = "数据"; ws.append(headers)
    for r in rows: ws.append(r)
    for col, nf in fmts.items():
        ci = headers.index(col) + 1
        for row in ws.iter_rows(min_row=2, min_col=ci, max_col=ci):
            for c in row: c.number_format = nf
    wb.save(path)


expected = {}

# 证书：xlsx，日期是真日期格子（中文格式），成绩是数字
H = ["姓名", "证书编号", "课程名称", "成绩", "颁发日期"]
rows, exp = [], []
for i, n in enumerate(NAMES):
    date = dt.date(2026, 10, 1) + dt.timedelta(days=i * 3)
    score = [95.5, 88, 100, 72.5, 90, 85, 60, 99, 77, 93][i]
    course = "Excel 数据透视表入门" if i != 7 else ""  # 第 8 行课程空
    rows.append([n, f"QS-2026-{i+1:04d}", course, score, date])
    exp.append({"must": [n, f"QS-2026-{i+1:04d}", course, f"{score:g}", f"{date.year}年{date.month}月{date.day}日"],
                "file_key": n, "id": f"QS-2026-{i+1:04d}"})
save_xlsx(os.path.join(OUT, "cert.xlsx"), H, rows, {"颁发日期": 'yyyy"年"m"月"d"日"', "成绩": "General"})
expected["cert"] = {"template": "cert.docx", "data": "cert.xlsx", "rows": exp}

# 发票：xlsx，金额千分位两位小数，日期 yyyy-mm-dd，备注超长，客户名带 & < >
H = ["客户名称", "发票号码", "税号", "地址", "开票日期", "项目", "数量", "单价", "金额", "金额大写", "备注"]
CUST = ["示例科技有限公司", "甲&乙<咨询>有限公司", "刘䶮工作室", "𠮷祥云贸易商行", "陈/晓:明?设计部", "示例科技有限公司", "", "北京某某文化传媒有限公司", "周*小<雨>花店", "欧阳春晓律师事务所"]


def inv_rows(n, seed=1):
    rnd = random.Random(seed); out, ex = [], []
    for i in range(n):
        k = i % 10; qty = rnd.randint(1, 50); price = round(rnd.uniform(9, 99999), 2)
        if k == 6: qty, price = 0, 0.0
        amt = round(qty * price, 2); date = dt.date(2026, 1, 1) + dt.timedelta(days=i % 300)
        cust = CUST[k] + ("" if n <= 10 or i < 10 else f"{i+1}")
        note = LONG if k == 3 else ("" if k == 6 else "按合同约定付款")
        tax = f"91110000MA0{i:06d}X" if k != 6 else ""
        out.append([cust, f"{i+1:08d}", tax, "北京市示例区示例路1号 010-00000000", date, "技术服务费", qty, price, amt, daxie(amt), note])
        ex.append({"must": [x for x in [cust, f"{i+1:08d}", tax, f"{date:%Y-%m-%d}", str(qty), fmt_money(price), fmt_money(amt), daxie(amt), note] if x], "file_key": cust, "id": f"{i+1:08d}"})
    return out, ex


rows, exp = inv_rows(10)
save_xlsx(os.path.join(OUT, "invoice.xlsx"), H, rows, {"开票日期": "yyyy-mm-dd", "单价": "#,##0.00", "金额": "#,##0.00"})
expected["invoice"] = {"template": "invoice.docx", "data": "invoice.xlsx", "rows": exp}
rows5, exp5 = inv_rows(500, seed=5)
save_xlsx(os.path.join(OUT, "invoice_500.xlsx"), H, rows5, {"开票日期": "yyyy-mm-dd", "单价": "#,##0.00", "金额": "#,##0.00"})
expected["invoice_500"] = {"template": "invoice.docx", "data": "invoice_500.xlsx", "rows": exp5}

# 合同：UTF-8 带 BOM 的 CSV，字段里有逗号、引号、换行
H = ["合同编号", "甲方", "乙方", "地址", "开始日期", "结束日期", "合同金额", "金额大写", "附加条款", "签约日期", "经办人"]
rows, exp = [], []
for i, n in enumerate(NAMES):
    amt = [120000, 8800.5, 1500000, 36000, 999, 120000, 50000, 0, 7300, 260000][i]
    clause = LONG if i in (2, 8) else ("付款方式：首付 50%，验收后付清" if i != 5 else "")
    addr = '上海市示例区"创新"路 88 号，3 楼' if i == 1 else "广州市示例区示例大道 1 号"
    row = [f"HT/2026/{i+1:03d}", n + "（个人）", "示例信息技术有限公司", addr, f"2026-11-{i+1:02d}", f"2027-10-{i+1:02d}", fmt_money(amt), daxie(amt), clause, f"2026年10月{20+i}日", "" if i == 4 else "李四"]
    rows.append(row)
    exp.append({"must": [x for x in [row[0], row[1], row[2], addr, row[4], row[5], row[6], row[7], clause, row[9], row[10]] if x], "file_key": row[0], "id": row[0]})
import csv, io
buf = io.StringIO(); w = csv.writer(buf, lineterminator="\r\n"); w.writerow(H); w.writerows(rows)
open(os.path.join(OUT, "contract.csv"), "w", encoding="utf-8-sig", newline="").write(buf.getvalue())
expected["contract"] = {"template": "contract.docx", "data": "contract.csv", "rows": exp}

# 工资条：GB18030 编码 CSV（中文 Excel 存 CSV 的样子），补贴有空格子
H = ["姓名", "工号", "部门", "月份", "基本工资", "绩效奖金", "补贴", "扣款", "实发", "备注"]
rows, exp = [], []
for i, n in enumerate(NAMES):
    base = [12000, 8500, 15000, 9800, 7000, 12000, 20000, 6500, 11000, 13500][i]
    perf = [3000, 1200, 0, 800, 500, 3000, 5000, 0, 900, 2000][i]
    sub = "" if i in (1, 4, 7) else fmt_money(800)
    ded = fmt_money(base * 0.105)
    net = fmt_money(base + perf + (800 if sub else 0) - base * 0.105)
    row = [n, f"E{1001+i}", "财务部" if i % 2 else "市场部", "2026年10月", fmt_money(base), fmt_money(perf), sub, ded, net, "" if i % 3 else "含国庆加班费"]
    rows.append(row)
    exp.append({"must": [x for x in row if x], "file_key": n, "id": row[1]})
buf = io.StringIO(); w = csv.writer(buf, lineterminator="\r\n"); w.writerow(H); w.writerows(rows)
open(os.path.join(OUT, "payslip.csv"), "w", encoding="gb18030", newline="").write(buf.getvalue())
expected["payslip"] = {"template": "payslip.docx", "data": "payslip.csv", "rows": exp}

# 通知：xlsx；正文长短不一，让每份分页落点都不一样
H = ["单位", "文号", "联系人", "日期", "金额", "开头", "正文"]
rows, exp = [], []
UNITS = ["示例市数据局", "刘䶮研究所", "𠮷祥区财政所", "北京某某科技有限公司", "陈/晓:明?工作室", "示例市数据局", "欧阳春晓事务所", "甲&乙<咨询>中心", "李堃办公室", "示例县统计站"]
NUMS = ["一、", "二、", "三、", "四、", "五、", "（一）", "（二）", "1.", "2.", "(1)", "(2)", "第一条", "第二条", "第三条", "1.1", "1.2"]
for i, u in enumerate(UNITS):
    wen = f"示数〔2026〕{i+1:03d}号"; who = ["王一", "李二", "张三", "赵四", "", "钱五", "孙六", "周七", "吴八", "郑九"][i]
    day = f"2026年12月{i+1}日"; amt = fmt_money([50000, 1200.5, 880000, 36000, 999, 50000, 7300, 0, 120000, 260000][i])
    head = "根据上级部署，结合本单位实际，" * (1 + (i * 5) % 13)  # 长短拉开，让分页落点每份都不一样
    body = "具体分工另行通知，各部门先行梳理家底。" * (2 + (i * 7) % 9)
    rows.append([u, wen, who, day, amt, head, body])
    exp.append({"must": [x for x in [u, wen, who, day, amt] if x], "pdf_must": NUMS, "file_key": u, "id": wen})  # 编号在 Word 里是 numbering.xml，只在 PDF 里查
save_xlsx(os.path.join(OUT, "notice.xlsx"), H, rows, {})
expected["notice"] = {"template": "notice.docx", "data": "notice.xlsx", "rows": exp}

json.dump(expected, open(os.path.join(OUT, "expected.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok ->", OUT)
