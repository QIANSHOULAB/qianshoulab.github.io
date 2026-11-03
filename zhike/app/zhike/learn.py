"""不用写正则：从样例邮件里用户点选的值，归纳出「怎么在新邮件里找到它」。

一条字段规格（spec）长这样，全部是普通 JSON：
    {"name": "订单号", "type": "id", "labels": ["订单号："], "next_line": false,
     "stop_ws": 0, "stop_ch": "", "nth": 0}
- labels：值前面的标签（多封样例归纳出的几种写法都存着，任何一种命中就行）
- next_line：标签单独一行、值在下一行（很多 HTML 表格转成文字后长这样）
- type：值的类型，决定值从哪儿结束（金额、日期、编号……）；text 类型靠 stop_ws/stop_ch 判断结尾
- nth：一个标签都没有时，用「正文里第几个这种类型的值」兜底
内置字段（收到时间、发件人、主题、附件）用 builtin 表示，不用学。
"""
from __future__ import annotations

import re
from datetime import datetime, date

_MON = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?"
CUR = r"(?:[¥￥$€£]|S\$|US\$|HK\$|RM|RMB|CNY|SGD|USD|HKD|EUR)"
PATTERNS = {
    "email": r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}",
    "date": (r"\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?"
             r"|\d{1,2}/\d{1,2}/\d{4}(?:\s+\d{1,2}:\d{2})?"
             rf"|\d{{1,2}}\s+{_MON}\s+\d{{4}}|{_MON}\s+\d{{1,2}},?\s+\d{{4}}"
             r"|\d{1,2}月\d{1,2}日"),
    "money": (rf"{CUR}\s?-?\d[\d,]*(?:\.\d+)?"
              rf"|-?\d[\d,]*(?:\.\d+)?\s?(?:元|块|{CUR})"
              r"|-?\d{1,3}(?:,\d{3})*\.\d{2}|-?\d+\.\d{2}"),
    "phone": r"\+?\d[\d\s\-()]{5,18}\d",
    "id": r"[A-Za-z0-9#][A-Za-z0-9_\-#/.]*",
    "number": r"-?\d[\d,]*(?:\.\d+)?",
    # 数量：数字 + 单位（200 箱、500 reams、3 pcs）；进 Excel 是数字，单位放进单元格格式里
    "qty": r"\d[\d,]*(?:\.\d+)?[ \t]?(?:[\u4e00-\u9fff]{1,2}|[A-Za-z]{1,8}\.?)(?![A-Za-z\u4e00-\u9fff])",
}
_RX = {k: re.compile(v) for k, v in PATTERNS.items()}
_PHONE_HINT = re.compile(r"电话|手机|联系方式|Tel|Phone|Mobile|WhatsApp|微信", re.I)
_LABEL_TAIL = re.compile(r"([^\s:：|｜,，;；]{1,20}(?:[ \t][A-Za-z][^\s:：|｜,，;；]{0,14}){0,2}[ \t]*[:：#＃][ \t]*)$")
_SEP = re.compile(r"\s{2,}|\t|[|｜；;，,]")
# 同一个字段的常见叫法：学到其中一种，其它几种也认（学来的写法优先）。
SYNONYMS = [
    ["订单号", "订单编号", "订单号码", "订单 No", "Order Number", "Order No", "Order #", "Order ID"],
    ["发票号", "发票号码", "发票编号", "Invoice No", "Invoice Number", "Invoice #"],
    ["实付金额", "实付款", "实付", "应付金额", "应付总额", "应付", "金额合计", "合计金额", "合计", "总金额", "总额", "总计",
     "Amount Due", "Total Due", "Grand Total", "Total Amount", "Total", "Amount"],
    ["付款期限", "到期日", "到期日期", "截止日期", "最后付款日", "Due Date", "Payment Due"],
    ["下单时间", "下单日期", "订单日期", "Order Date", "Date Ordered"],
    ["运单号", "快递单号", "物流单号", "运单编号", "快递单号码", "Tracking Number", "Tracking No", "Tracking #", "Tracking ID", "AWB"],
    ["预计送达", "预计到达", "预计送达时间", "Estimated Delivery", "Expected Delivery", "ETA"],
    ["联系电话", "电话", "手机", "手机号", "手机号码", "联系方式", "Phone", "Tel", "Mobile", "Contact Number"],
    ["数量", "订购数量", "采购数量", "Quantity", "Qty"],
    ["产品", "品名", "商品", "产品名称", "Product", "Item"],
    ["收货人", "联系人", "收件人", "Recipient", "Contact"],
]
_SYN = {}
for _g in SYNONYMS:
    for _w in _g:
        _SYN.setdefault(_w.lower(), _g)

BUILTINS = {
    "@received": "收到时间",
    "@from": "发件人",
    "@from_name": "发件人名字",
    "@subject": "主题",
    "@attachments": "附件",
}


def _full(kind, v):
    return _RX[kind].fullmatch(v) is not None


def infer_type(value: str, label: str = "") -> str:
    v = value.strip()
    if not v:
        return "text"
    if _full("email", v):
        return "email"
    if _full("date", v):
        return "date"
    digits = sum(c.isdigit() for c in v)
    if _PHONE_HINT.search(label or "") and digits >= 6 and _full("phone", v):
        return "phone"
    if _full("money", v) and not re.fullmatch(r"\d+", v):
        return "money"
    if re.fullmatch(r"-?\d[\d,]*(?:\.\d+)?", v):
        return "number" if ("." in v or "," in v or len(v) < 6) else "id"
    if v.startswith("+") and digits >= 7 and _full("phone", v):
        return "phone"
    if _full("qty", v) and not re.search(rf"\d\s*{_MON}$", v, re.I) and not re.fullmatch(r"\d+[A-Za-z]{2,}", v):
        return "qty"
    if _full("id", v) and digits:
        return "id"
    return "text"


def _line_bounds(text, pos):
    a = text.rfind("\n", 0, pos) + 1
    b = text.find("\n", pos)
    return a, (len(text) if b < 0 else b)


def _norm_label(s: str) -> str:
    s = re.sub(r"\s+", " ", s.strip())
    return s.replace("：", ":").replace("＃", "#")


def _label_regex(label: str):
    parts = []
    for ch in _norm_label(label):
        if ch == " ":
            parts.append(r"\s+")
        elif ch == ":":
            parts.append(r"\s*[:：]")
        elif ch == "#":
            parts.append(r"\s*[#＃]")
        else:
            parts.append(re.escape(ch))
    return re.compile("".join(parts), re.I)


def _one_example(text: str, start: int, end: int):
    a, b = _line_bounds(text, start)
    left = text[a:start]
    right = text[end:b]
    label, next_line = "", False
    if left.strip():
        m = _LABEL_TAIL.search(left)
        if m:
            label = m.group(1)
            words = label.split()
            # 「A123 Order No:」前面那个带数字的词是上一个值，不是标签
            while len(words) > 1 and any(c.isdigit() for c in words[0]):
                words.pop(0)
            label = " ".join(words)
        else:
            piece = [p for p in _SEP.split(left) if p.strip()]
            label = piece[-1] if piece else left
            if len(label.strip()) > 20:
                label = label.strip()[-12:]
    else:
        # 值在行首：看上一行是不是个短标签
        for line in reversed(text[:a].split("\n")):
            if line.strip():
                if len(line.strip()) <= 30:
                    label, next_line = line.strip(), True
                break
    stop_ws, stop_ch = 0, ""
    if right:
        if right[0].isspace():
            run = len(right) - len(right.lstrip())
            stop_ws = 2 if run >= 2 else 1
        else:
            stop_ch = right[0]
    return _norm_label(label), next_line, stop_ws, stop_ch


def _nth_of_type(text, kind, start):
    rx = _RX.get(kind)
    if not rx:
        return 0
    n = 0
    for m in rx.finditer(text):
        if m.start() >= start:
            break
        n += 1
    return n


def learn_field(name: str, examples: list) -> dict:
    """examples: [(text, start, end), ...] —— 用户在一封或几封样例邮件里选中的同一个字段。"""
    if not examples:
        raise ValueError("no examples")
    labels, types, nexts, stops_ws, stops_ch, nths = [], [], [], [], [], []
    for text, s, e in examples:
        value = text[s:e]
        # 选区两头的空白去掉，免得用户手抖多选了空格
        while s < e and text[s].isspace():
            s += 1
        while e > s and text[e - 1].isspace():
            e -= 1
        value = text[s:e]
        label, nl, sw, sc = _one_example(text, s, e)
        if label and label not in labels:
            labels.append(label)
        types.append(infer_type(value, label))
        nexts.append(nl)
        stops_ws.append(sw)
        stops_ch.append(sc)
        nths.append(_nth_of_type(text, types[-1], s))
    kinds = set(types)
    if len(kinds) == 1:
        kind = types[0]
    elif kinds <= {"id", "number"}:
        kind = "id"
    elif kinds <= {"money", "number"}:
        kind = "money"
    else:
        kind = "text"
    return {
        "name": name,
        "type": kind,
        "labels": labels,
        "next_line": all(nexts) and bool(labels),
        "stop_ws": max(stops_ws) if kind == "text" else 0,
        "stop_ch": stops_ch[0] if kind == "text" and len(set(stops_ch)) == 1 else "",
        "nth": nths[0] if not labels else 0,
    }


def _read_value(spec, text, pos):
    kind = spec["type"]
    a, b = _line_bounds(text, pos) if pos < len(text) else (pos, pos)
    if kind == "text":
        seg = text[pos:b]
        end = len(seg)
        if spec.get("stop_ch"):
            i = seg.find(spec["stop_ch"])
            if i > 0:
                end = min(end, i)
        sw = spec.get("stop_ws") or 0
        if sw:
            lead = len(seg) - len(seg.lstrip(" \t"))
            m = re.search(r"[ \t]{%d,}" % sw, seg[lead:])
            if m:
                end = min(end, lead + m.start())
        val = seg[:end].strip()[:200]
        if not val:
            return None
        s = pos + seg.find(val)
        return s, s + len(val)
    rx = _RX[kind]
    m = rx.match(text, pos)
    if not m or m.end() > b:
        m = rx.search(text, pos, min(b, pos + 16 + 40))
        if m and m.start() - pos > 16:
            m = None
    if not m or m.start() >= b:
        return None
    s, e = m.start(), m.end()
    val = text[s:e].rstrip(".,，。 ")
    return s, s + len(val)


def _skip(text, pos, next_line):
    if next_line:
        nl = text.find("\n", pos)
        if nl < 0:
            return len(text)
        pos = nl + 1
        while pos < len(text) and text[pos] in " \t\n":
            pos += 1
        return pos
    while pos < len(text) and text[pos] in " \t:：#＃-–—>|":
        pos += 1
    return pos


class Qty(float):
    """数量：本身是数字（Excel 里能求和），带着单位，写表时单位进单元格格式。"""
    unit = ""

    def __new__(cls, v, unit=""):
        o = float.__new__(cls, v)
        o.unit = unit
        return o


def to_typed(kind: str, raw: str, ref=None):
    """转成 Excel 里能算账的值：金额→数字，日期→日期，数量→数字（单位留着），其它原样。
    ref：收信时间，「11月5日」这种没写年份的日期按它补年份。"""
    v = raw.strip()
    try:
        if kind == "qty":
            m = re.match(r"(\d[\d,]*(?:\.\d+)?)\s*(.*)$", v)
            if not m:
                return v
            n = float(m.group(1).replace(",", ""))
            return Qty(n, m.group(2).strip().rstrip("."))
        if kind in ("money", "number"):
            num = re.sub(r"[^\d.\-]", "", v.replace(",", ""))
            if num in ("", "-", ".", "-."):
                return v
            f = float(num)
            return int(f) if f.is_integer() and "." not in num else f
        if kind == "date":
            return parse_date(v, ref) or v
    except Exception:
        return v
    return v


def parse_date(v: str, ref=None):
    s = re.sub(r"\s+", " ", v.strip())
    m = re.fullmatch(r"(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?", s)
    if m:
        # 没写年份：取离收信时间最近的那一年（12 月收到「1月5日」就是明年）
        ref = ref or date.today()
        ref = ref.date() if isinstance(ref, datetime) else ref
        best = None
        for y in (ref.year - 1, ref.year, ref.year + 1):
            try:
                d = date(y, int(m.group(1)), int(m.group(2)))
            except ValueError:
                continue
            if best is None or abs((d - ref).days) < abs((best - ref).days):
                best = d
        return best
    s2 = re.sub(r"\s*[年月/.]\s*", "-", s).replace("日", "")
    s2 = re.sub(r"-\s+", "-", s2).strip("- ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            d = datetime.strptime(s2, fmt)
            return d.date() if fmt == "%Y-%m-%d" else d
        except ValueError:
            pass
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            d = datetime.strptime(s, fmt)
            return d.date() if fmt == "%d/%m/%Y" else d
        except ValueError:
            pass
    t = s.replace(",", "").replace(".", "")
    for fmt in ("%d %b %Y", "%d %B %Y", "%b %d %Y", "%B %d %Y"):
        try:
            return datetime.strptime(t.replace("Sept", "Sep"), fmt).date()
        except ValueError:
            pass
    return None


def _stem(label: str) -> str:
    return re.sub(r"\s*[:：]$", "", _norm_label(label)).strip()


def synonyms(labels: list) -> list:
    """学来的标签之外，同一字段的其它常见叫法（长的在前，免得「电话」抢在「联系电话」前面）。"""
    have = {_stem(x).lower() for x in labels}
    out = []
    for x in labels:
        for w in _SYN.get(_stem(x).lower(), []):
            if w.lower() not in have and w not in out:
                out.append(w)
    return sorted(out, key=len, reverse=True)


def _syn_regex(word: str):
    body = r"\s+".join(re.escape(p) for p in word.split())
    body = body.replace(r"\#", r"\s*[#＃]")
    # 左边不能紧挨着字母/汉字（「Subtotal」里的 Total、「联系电话」里的电话不算），右边冒号或空白都行
    lead = r"(?<![A-Za-z\u4e00-\u9fff])"
    return re.compile(lead + body + r"(?:[ \t]*[:：#＃]|(?=[ \t\n]))", re.I)


def _by_labels(spec, text, labels, rx_of, next_line):
    for label in labels:
        for m in rx_of(label).finditer(text):
            pos = _skip(text, m.end(), next_line)
            r = _read_value(spec, text, pos)
            if r:
                return r
    return None


def extract(spec: dict, mail) -> dict | None:
    """返回 {"raw": 原文, "value": 可写进 Excel 的值, "span": [起, 止] 或 None}，找不到返回 None。"""
    b = spec.get("builtin")
    if b:
        return _builtin(b, mail)
    text = mail.text if hasattr(mail, "text") else mail
    labels = spec.get("labels") or []
    found = _by_labels(spec, text, labels, _label_regex, spec.get("next_line"))
    if not found and labels and spec["type"] != "text":
        # 学来的写法都没对上：试同义叫法（只给有类型的值用，类型本身就是一道把关）
        found = _by_labels(spec, text, synonyms(labels), _syn_regex, False)
        if not found and spec.get("next_line"):
            found = _by_labels(spec, text, synonyms(labels), _syn_regex, True)
    elif not found and labels:
        found = _by_labels(spec, text, synonyms(labels), lambda w: re.compile(
            r"(?<![A-Za-z\u4e00-\u9fff])" + r"\s+".join(re.escape(p) for p in w.split()) + r"[ \t]*[:：]", re.I),
            spec.get("next_line"))
    if not found and not labels and spec["type"] in _RX:
        ms = list(_RX[spec["type"]].finditer(text))
        n = spec.get("nth", 0)
        if n < len(ms):
            found = ms[n].span()
    if not found:
        return None
    raw = text[found[0]:found[1]]
    ref = None
    try:
        ref = datetime.fromisoformat(mail.date)
    except Exception:
        pass
    return {"raw": raw, "value": to_typed(spec["type"], raw, ref), "span": list(found)}


def _builtin(b, mail):
    if b == "@received":
        try:
            d = datetime.fromisoformat(mail.date).astimezone()
            return {"raw": d.strftime("%Y-%m-%d %H:%M"), "value": d.replace(tzinfo=None), "span": None}
        except Exception:
            return {"raw": mail.date, "value": mail.date, "span": None}
    of = getattr(mail, "orig_from", "")   # 转发信：记原发件人、原主题
    v = {
        "@from": of or mail.from_addr,
        "@from_name": (getattr(mail, "orig_from_name", "") or of) if of else (mail.from_name or mail.from_addr),
        "@subject": getattr(mail, "orig_subject", "") or mail.subject,
        "@attachments": "; ".join(mail.attachments),
    }.get(b, "")
    return {"raw": v, "value": v, "span": None}


def extract_all(fields: list, mail) -> dict:
    out = {}
    for f in fields:
        try:
            out[f["name"]] = extract(f, mail)
        except Exception:
            out[f["name"]] = None
    return out


_SUGGEST = re.compile(
    r"(?m)(?:^|(?<=[ \t|｜]))[ \t]*"
    r"(?P<label>(?!\d)[^\s:：|｜]{1,12}(?: [A-Za-z][^\s:：|｜]{0,11}){0,2})[ \t]*[:：][ \t]*"
    r"(?P<value>[^\n]*?)(?=\s{2,}|\t|[|｜]|[ \t]+(?!\d)[^\s:：|｜]{1,12}[:：]|$)")


def suggest_fields(text: str, limit: int = 12) -> list:
    """一封邮件里看着像「标签：值」的地方，一键就能收成字段。"""
    out, seen = [], set()
    for m in _SUGGEST.finditer(text):
        label, value = m.group("label").strip(), m.group("value").strip()
        if not value or len(value) > 80 or label in seen:
            continue
        if re.fullmatch(r"https?|mailto|\d+", label, re.I):
            continue
        # 转发信里的信头（From/Date/To…）不是要收的字段
        if re.fullmatch(r"From|To|Cc|Date|Sent|Subject|发件人|收件人|抄送|发送时间|主题", label, re.I):
            continue
        seen.add(label)
        s = m.start("value") + (len(m.group("value")) - len(m.group("value").lstrip()))
        out.append({"name": label, "start": s, "end": s + len(value), "value": value,
                    "type": infer_type(value, label)})
        if len(out) >= limit:
            break
    return out
