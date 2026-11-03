"""Python 这边要给人看的字（托盘菜单、通知）也从 ui/strings.js 里拿，界面文字只放一处。"""
from __future__ import annotations

import json
import os
import re

_STR: dict[str, str] = {}


def load(ui_dir: str) -> None:
    try:
        with open(os.path.join(ui_dir, "strings.js"), encoding="utf-8") as f:
            src = f.read()
    except OSError:
        return
    # 一行可以有好几对，直接全文找 key: "value"
    for m in re.finditer(r'(?:"([^"]+)"|\b(\w+))\s*:\s*"((?:[^"\\]|\\.)*)"', src):
        k = m.group(1) or m.group(2)
        if k not in _STR:  # 先出现的是中文那套
            try:
                _STR[k] = json.loads('"' + m.group(3) + '"')
            except ValueError:
                _STR[k] = m.group(3)


def T(key: str, **kw) -> str:
    s = _STR.get(key, key)
    for a, b in kw.items():
        s = s.replace("{" + a + "}", str(b))
    return s
