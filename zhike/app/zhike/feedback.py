"""提意见：拼一封 mailto（收件人、标题、正文都填好），交给系统默认的邮件程序打开。
不接任何表单，不收任何数据，也不替人发：信写不写、发不发，全在人自己的邮件程序里。

正文 = 三行空着的提示 + 最后一行「版本 · 系统 · 程序」（比如 0.4.1 · Windows 11 (26100) · Zhike.exe），人不用自己打。
字在 ui/strings.js（fb_subject、fb_q1..3）。标题、正文按 encodeURIComponent 那样转码（空格 %20，不是 +），换行 %0D%0A（RFC 6068）。
"""
from __future__ import annotations

import os
import platform
import sys
import urllib.parse
import webbrowser
from pathlib import Path

from .text import T

TO = "oilsongchengmin@gmail.com"


def os_tag() -> str:
    """系统简写：Windows 11 (26100)、Windows 10 (19045)、Windows Server (20348)；别的系统（开发、测试）照实写。"""
    if sys.platform == "win32":
        try:
            w = sys.getwindowsversion()
            if getattr(w, "product_type", 1) != 1:          # 1 = 工作站；2、3 = 服务器
                name = "Windows Server"
            elif w.major == 10:
                name = "Windows 11" if w.build >= 22000 else "Windows 10"
            else:
                name = "Windows " + {(6, 3): "8.1", (6, 2): "8", (6, 1): "7"}.get((w.major, w.minor), f"{w.major}.{w.minor}")
            return f"{name} ({w.build})"
        except Exception:
            return "Windows " + platform.version()
    if sys.platform == "darwin":
        return "macOS " + (platform.mac_ver()[0] or platform.release())
    return f"{platform.system() or sys.platform} {platform.release().split('-')[0]}".strip()


def app_tag() -> str:
    """哪个程序：打包好的 exe 写 exe 的名字；从源码跑的写 Python 版本。"""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).name
    return "Python " + platform.python_version()


def device(version: str) -> str:
    return f"{version} · {os_tag()} · {app_tag()}"


def subject(lang: str, version: str) -> str:
    return T("fb_subject", lang, v=version)


def body(lang: str, version: str) -> str:
    return "\n\n".join(T(k, lang) for k in ("fb_q1", "fb_q2", "fb_q3")) + "\n\n\n——\n" + device(version)


def _enc(s: str) -> str:
    return urllib.parse.quote(s.replace("\r\n", "\n").replace("\n", "\r\n"), safe="")


def mailto(lang: str, version: str) -> str:
    return f"mailto:{TO}?subject={_enc(subject(lang, version))}&body={_enc(body(lang, version))}"


def launch(url: str) -> bool:
    """用系统默认的邮件程序打开。Windows 上 os.startfile（ShellExecute 照 mailto 的默认程序开），别处 webbrowser。"""
    try:
        if sys.platform == "win32":
            os.startfile(url)  # noqa
            return True
        return bool(webbrowser.open(url))
    except Exception:
        return False
