"""Python 这边要给人看的字（托盘、气泡、拟规则起的名字和列名、内置列、默认回信模板、转发信头……）也从 ui/strings.js 里拿：
字只放一处，中英两套。默认英文，第二语言中文；用哪套记在 config.json 的 settings.lang（Store 管）。"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

LANGS = ("en", "zh")
_STR: dict | None = None
_PAIR = re.compile(r'(?:^|[\s,{])([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"((?:[^"\\]|\\.)*)"')

# 规范列名（learn.CANON 的值）→ strings.js 里的键。中文规范名是程序内部认字段用的「身份证」，显示时换成当前语言
COLS = {"订单号": "col_order", "发票号": "col_invoice", "金额": "col_amount", "到期日": "col_due", "下单日期": "col_orderdate",
        "运单号": "col_tracking", "预计送达": "col_eta", "电话": "col_phone", "数量": "col_qty", "产品": "col_product",
        "联系人": "col_contact"}
# 拟规则认出的类型（recommend.TYPES 的名字）→ 键
TYPES = {"订单": "rt_order", "发票": "rt_invoice", "物流": "rt_ship", "询价": "rt_quote"}


def _file() -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    return base / "ui" / "strings.js"


def load(path=None) -> dict:
    """读 strings.js 里 window.STR 那段：{"en": {...}, "zh": {...}}。只认「键: "值"」，注释单独占行。"""
    out = {k: {} for k in LANGS}
    try:
        src = Path(path or _file()).read_text("utf-8")
    except OSError:
        return out
    cur, in_str = None, False
    for line in src.splitlines():
        s = line.strip()
        if s.startswith("window.STR"):
            in_str = True
            continue
        if s.startswith("window.") and in_str:
            break
        if not in_str or s.startswith(("//", "/*", "*")):
            continue
        m = re.match(r"^(en|zh)\s*:\s*\{", s)
        if m:
            cur = m.group(1)
            continue
        if cur:
            for k, v in _PAIR.findall(line):
                try:
                    out[cur][k] = json.loads('"' + v + '"')
                except ValueError:
                    out[cur][k] = v
    return out


def _strings() -> dict:
    global _STR
    if _STR is None:
        _STR = load()
    return _STR


def norm(lang) -> str:
    return "zh" if str(lang or "").lower().startswith("zh") else "en"


def T(key: str, lang="en", **kw) -> str:
    """取一句话。n == 1 时先找英文单数 key_1。{名字} 换成 kw 里的值。"""
    d = _strings()
    L = d.get(norm(lang)) or {}
    if "n" in kw and str(kw["n"]) == "1" and key + "_1" in L:
        key += "_1"
    s = L.get(key, d["en"].get(key, key))
    for a, b in kw.items():
        s = s.replace("{" + a + "}", str(b))
    return s


def col(name: str, lang="en") -> str:
    """规范列名换成当前语言的叫法；不是规范名（人自己起的、信里原样的标签）原样返回。"""
    k = COLS.get(name)
    return T(k, lang) if k else name


def type_name(t: str, lang="en") -> str:
    k = TYPES.get(t)
    return T(k, lang) if k else t


def type_names(t: str) -> set:
    """一类规则在两种语言下的名字（中文时起的「订单」、英文时起的 Orders 都算同一类）。"""
    k = TYPES.get(t)
    return {T(k, x) for x in LANGS} | {t} if k else {t}
