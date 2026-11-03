"""对答案：按 inode 认文件（改名/挪动不变 inode），看每个文件最后落在哪。
用法：python score.py <输出目录> <场景>  → 打印 JSON：对/错/丢/降级，错的举例。"""
from __future__ import annotations

import json
import os
import re
import sys


def walk(root):
    m = {}
    for d, _, fs in os.walk(root):
        for f in fs:
            p = os.path.join(d, f)
            m[os.lstat(p).st_ino] = os.path.relpath(p, root)
    return m


def splitext(n):
    i = n.rfind(".")
    return (n, "") if i <= 0 else (n[:i], n[i:])


def bump_ok(final, want):
    if os.path.dirname(final) != os.path.dirname(want):
        return False
    fs_, fe = splitext(os.path.basename(final))
    ws, we = splitext(os.path.basename(want))
    if fe.lower() != we.lower():
        return False
    if fs_ == ws:
        return True
    return bool(re.fullmatch(re.escape(ws) + r"\s?[\(\[_\-~ .]?\d{1,4}[\)\]]?", fs_))


def _loc(w):
    """0.4.0：英文界面（SAODI_LANG=en）分进 Images / Documents / Other：答案里的中文文件夹名换成英文的再对。"""
    if os.environ.get("SAODI_LANG") != "en":
        return w
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app"))
    from saodi import organize, text
    m = {text.Tl("zh", "t_" + k): text.Tl("en", "t_" + k) for k, _ in organize.TYPES}
    m[text.Tl("zh", "other")] = text.Tl("en", "other")
    for pre in ("*bump*", "*prefix*", ""):
        if w.startswith(pre):
            head, sep, rest = w[len(pre):].partition("/")
            if sep and head in m:
                return pre + m[head] + "/" + rest
            return w
    return w


def judge(final, wants, orig):
    wants = [w if w == orig else _loc(w) for w in wants]  # 原来就在「文档」里的（旧文件夹）该原地不动，不换名
    for w in wants:
        if w.startswith("*bump*"):
            if bump_ok(final, w[6:]):
                return "ok" if final == orig else ("ok_bump" if final != w[6:] else "ok")
        elif w.startswith("*prefix*"):
            if os.path.basename(final).startswith(w[8:]):
                return "ok"
        elif final == w:
            return "ok"
    return "wrong"


def score(out, name):
    ans = json.load(open(os.path.join(out, name + ".answer.json"), encoding="utf-8"))
    now = walk(os.path.join(out, name))
    res = {"scenario": name, "total": 0, "ok": 0, "wrong": 0, "lost": 0, "degraded": 0, "examples": []}
    for rel, spec in ans["files"].items():
        res["total"] += 1
        ino = ans["inodes"][rel]
        final = now.get(ino)
        if final is None:
            res["lost"] += 1
            res["examples"].append({"orig": rel, "got": None, "want": spec["want"][:2], "kind": spec["kind"]})
            continue
        v = judge(final, spec["want"], rel)
        if v == "wrong":
            res["wrong"] += 1
            if len(res["examples"]) < 12:
                res["examples"].append({"orig": rel, "got": final, "want": spec["want"][:2], "kind": spec["kind"]})
        else:
            res["ok"] += 1
            if spec["kind"] == "无EXIF" and final != rel:
                res["degraded"] += 1
    return res


if __name__ == "__main__":
    print(json.dumps(score(sys.argv[1], sys.argv[2]), ensure_ascii=False, indent=1))
