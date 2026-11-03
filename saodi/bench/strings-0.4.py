"""戒尺僧 0.4.0 · 文字清单：从 app/ui/strings.js（唯一的字库）
  1) 对一遍中英两套的键；程序界面（app.js）、介绍页（index.html）、Python（托盘、冒泡、文件夹名）用到的键一条不缺；
  2) 导出 bench/strings-0.4/zh.txt、en.txt，一行一条：键<Tab>字（照 strings.js 里的分节）。
用法：python saodi/bench/strings-0.4.py
"""
from __future__ import annotations

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SAODI = os.path.dirname(HERE)
APP = os.path.join(SAODI, "app")
sys.path.insert(0, APP)
from saodi import text  # noqa: E402

src = open(os.path.join(APP, "ui", "strings.js"), encoding="utf-8").read()
text.load(os.path.join(APP, "ui"))
en, zh = text._STR["en"], text._STR["zh"]
problems = [f"zh 缺 {k}" for k in en if k not in zh] + [f"en 缺 {k}" for k in zh if k not in en]

# 用到的键：t("key") / T("key") / data-t="key" / data-h="key"，外加拼出来的（err_、fix_、k_、st_、t_、q_、rule_、sd_）
used = set()
for f in ["ui/app.js", "main.py", "saodi/api.py", "saodi/organize.py", "saodi/archive.py", "saodi/download.py", "saodi/selftest.py"]:
    s = open(os.path.join(APP, f), encoding="utf-8").read()
    used |= set(re.findall(r'\b(?:t|T|Tl\(\w+,)\s*\(?\s*"(\w+)"', s)) | set(re.findall(r'\bTl\([^,]+,\s*"(\w+)"', s))
    used |= set(re.findall(r'\["\w+", "((?:q|rule|nav)_\w+)"', s))
page = open(os.path.join(SAODI, "index.html"), encoding="utf-8").read()
used |= set(re.findall(r'data-[th]="(\w+)"', page)) | set(re.findall(r'\bt\("(\w+)"', page))
for k in used:
    if k not in en and not k.endswith("_"):  # "err_" + code 这种是前缀
        problems.append(f"用到了但字库里没有：{k}")
for code in ["busy", "gone", "exists", "toolong", "diskfull", "oserror", "password", "badarchive", "toobig", "notarchive"]:
    for p in ("err_", "fix_"):
        if p + code not in en:
            problems.append("缺 " + p + code)
if problems:
    print("\n".join(problems))
    sys.exit(1)

# 照 strings.js 的分节导出
out = os.path.join(HERE, "strings-0.4")
os.makedirs(out, exist_ok=True)
for lang in ("en", "zh"):
    block = re.search(r"^  %s: \{\n(.*?)^  \},?$" % lang, src, re.M | re.S).group(1)
    lines = [f"# 戒尺僧 0.4.0 {'英文' if lang == 'en' else '中文'}文字（从 app/ui/strings.js 导出）。一行一条：键<Tab>字。"
             "{n} 是填进去的数，{n?file|files} 按数挑单复数；| 隔开的是一串示例文件名。", ""]
    for ln in block.splitlines():
        m = re.match(r"\s*/\*\s*(.*?)\s*\*/\s*$", ln)
        if m:
            lines += ["", "## " + m.group(1)]
            continue
        for p in text._PAIR.finditer(ln):
            k = p.group(1) or p.group(2)
            lines.append(f"{k}\t{text._STR[lang][k]}")
    with open(os.path.join(out, lang + ".txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines).replace("\n\n\n", "\n\n") + "\n")
print(f"ok：{len(en)} 条 × 2 种语言，用到的 {len(used)} 个键都有 -> {out}")
