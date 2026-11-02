"""查新版：看 GitHub 上 zhike-latest 这个发布的名字（「知客僧 0.1.0」）。只读，不上传任何东西。"""
from __future__ import annotations

import json
import re
import urllib.request

from . import VERSION

API = "https://api.github.com/repos/QIANSHOULAB/qianshoulab.github.io/releases/tags/zhike-latest"
PAGE = "https://qianshoulab.github.io/zhike/"


def _v(s):
    return tuple(int(x) for x in re.findall(r"\d+", s)[:3])


def check(timeout=8):
    try:
        req = urllib.request.Request(API, headers={"Accept": "application/vnd.github+json", "User-Agent": "zhike"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode())
        m = re.search(r"\d+\.\d+\.\d+", data.get("name", "") + " " + data.get("body", ""))
        if not m:
            return None
        latest = m.group(0)
        return {"latest": latest, "current": VERSION, "newer": _v(latest) > _v(VERSION), "url": PAGE}
    except Exception:
        return None
