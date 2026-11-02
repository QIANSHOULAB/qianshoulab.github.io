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
}
_RX = {k: re.compile(v) for k, v in PATTERNS.items()}
_PHONE_HINT = re.compile(r"电话|手机|联系方式|Tel|Phone|Mobile|WhatsApp|微信", re.I)
_LABEL_TAIL = re.compile(r"([^\s:：|｜,，;；]{1,20}(?:[ \t][A-Za-z][^\s:：|｜,，;；]{0,14}){0,2}[ \t]*[:：#＃][ \t]*)$")
_SEP = re.compile(r"\s{2,}|\t|[|｜；;，,]")
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


def to_typed(kind: str, raw: str):
    """转成 Excel 里能算账的值：金额→数字，日期→日期，其它原样。"""
    v = raw.strip()
    try:
        if kind in ("money", "number"):
            num = re.sub(r"[^\d.\-]", "", v.replace(",", ""))
            if num in ("", "-", ".", "-."):
                return v
            f = float(num)
            return int(f) if f.is_integer() and "." not in num else f
        if kind == "date":
            return parse_date(v) or v
    except Exception:
        return v
    return v


def parse_date(v: str):
    s = re.sub(r"\s+", " ", v.strip())
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


def extract(spec: dict, mail) -> dict | None:
    """返回 {"raw": 原文, "value": 可写进 Excel 的值, "span": [起, 止] 或 None}，找不到返回 None。"""
    b = spec.get("builtin")
    if b:
        return _builtin(b, mail)
    text = mail.text if hasattr(mail, "text") else mail
    labels = spec.get("labels") or []
    found = None
    for label in labels:
        for m in _label_regex(label).finditer(text):
            pos = _skip(text, m.end(), spec.get("next_line"))
            r = _read_value(spec, text, pos)
            if r:
                found = r
                break
        if found:
            break
    if not found and not labels and spec["type"] in _RX:
        ms = list(_RX[spec["type"]].finditer(text))
        n = spec.get("nth", 0)
        if n < len(ms):
            found = ms[n].span()
    if not found:
        return None
    raw = text[found[0]:found[1]]
    return {"raw": raw, "value": to_typed(spec["type"], raw), "span": list(found)}


def _builtin(b, mail):
    if b == "@received":
        try:
            d = datetime.fromisoformat(mail.date).astimezone()
            return {"raw": d.strftime("%Y-%m-%d %H:%M"), "value": d.replace(tzinfo=None), "span": None}
        except Exception:
            return {"raw": mail.date, "value": mail.date, "span": None}
    v = {
        "@from": mail.from_addr,
        "@from_name": mail.from_name or mail.from_addr,
        "@subject": mail.subject,
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
        seen.add(label)
        s = m.start("value") + (len(m.group("value")) - len(m.group("value").lstrip()))
        out.append({"name": label, "start": s, "end": s + len(value), "value": value,
                    "type": infer_type(value, label)})
        if len(out) >= limit:
            break
    return out
