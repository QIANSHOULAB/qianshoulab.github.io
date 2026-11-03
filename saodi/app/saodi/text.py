"""Python 这边要给人看的字（托盘、冒泡、分出来的文件夹名、示例文件）也从 ui/strings.js 里拿，字只放一处。

两套：en（默认）、zh。当前语言是全局的（整个程序一个界面语言）：Api 一开就照设置文件定（api._lang_of），
人在界面上切了就 set_lang。没人定的时候（核心单独用：老测试、比武脚本）是中文，跟 0.3 以前一样。
"""
from __future__ import annotations

import json
import os
import re
import sys

LANGS = ("en", "zh")
_STR: dict[str, dict[str, str]] = {"en": {}, "zh": {}}
_LANG = "zh"
_loaded = False

_BLOCK = re.compile(r"^  (en|zh): \{\n(.*?)^  \},?$", re.M | re.S)
_PAIR = re.compile(r'(?:"([^"]+)"|\b(\w+))\s*:\s*"((?:[^"\\]|\\.)*)"')
_PLURAL = re.compile(r"\{(\w+)\?([^|{}]*)\|([^{}]*)\}")


def _default_ui() -> str:
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(base, "ui")


def load(ui_dir: str | None = None) -> None:
    global _loaded
    try:
        with open(os.path.join(ui_dir or _default_ui(), "strings.js"), encoding="utf-8") as f:
            src = f.read()
    except OSError:
        return
    for m in _BLOCK.finditer(src):
        d = _STR[m.group(1)]
        for p in _PAIR.finditer(m.group(2)):
            k = p.group(1) or p.group(2)
            try:
                d[k] = json.loads('"' + p.group(3) + '"')
            except ValueError:
                d[k] = p.group(3)
    _loaded = True


def set_lang(lang: str) -> str:
    global _LANG
    _LANG = lang if lang in LANGS else "en"
    return _LANG


def lang() -> str:
    return _LANG


def Tl(lang_: str, key: str, **kw) -> str:
    """指定语言拿字（比如认旧设置里存的是哪种语言的名字）。"""
    if not _loaded:
        load()
    s = _STR.get(lang_, {}).get(key)
    if s is None:
        s = _STR["en"].get(key, key)
    if kw:
        def plural(m):
            if m.group(1) not in kw:
                return m.group(0)
            try:
                n = float(str(kw[m.group(1)]).replace(",", ""))
            except ValueError:
                n = 0
            return m.group(2) if n == 1 else m.group(3)
        s = _PLURAL.sub(plural, s)
        for a, b in kw.items():
            s = s.replace("{" + a + "}", str(b))
    return s


def T(key: str, **kw) -> str:
    return Tl(_LANG, key, **kw)


def every(key: str) -> set[str]:
    """这条字在所有语言里的样子（认「其他」「Other」都是同一个意思）。"""
    return {Tl(x, key) for x in LANGS}
