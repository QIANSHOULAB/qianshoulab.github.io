"""改名规则：一串规则依次作用在「主名」上（扩展名单独管），出预览，再交给 ops.execute。

规则长这样（界面直接传 JSON 过来）：
  {"type": "replace", "find": "IMG_", "to": "", "regex": false, "case": false}
  {"type": "insert",  "text": "旅行-", "where": "start" | "end"}
  {"type": "number",  "start": 1, "step": 1, "digits": 3, "where": "start"|"end"|"name", "sep": "-"}
  {"type": "date",    "source": "modified"|"created"|"taken"|"today", "fmt": "YYYY-MM-DD",
                      "where": "start"|"end"|"name", "sep": " "}
  {"type": "case",    "mode": "lower"|"upper"|"title"|"sentence"}
  {"type": "trim"}                         去掉首尾空格、连续空格并一个
  {"type": "remove",  "first": 0, "last": 0}   砍掉开头/结尾 N 个字
  {"type": "ext",     "mode": "lower"|"upper"|"set", "to": ".jpg"}
"""
from __future__ import annotations

import datetime as _dt
import os
import re

from . import fsutil as fs

DATE_FORMATS = {
    "YYYY-MM-DD": "%Y-%m-%d",
    "YYYYMMDD": "%Y%m%d",
    "YYYY-MM-DD hh.mm.ss": "%Y-%m-%d %H.%M.%S",
    "YYYYMMDD_hhmmss": "%Y%m%d_%H%M%S",
    "YYYY年MM月DD日": "%Y年%m月%d日",
    "YYYY-MM": "%Y-%m",
}


def list_files(folder: str, recursive: bool = False, filt: dict | None = None) -> list[dict]:
    """列文件。filt: {"ext": "jpg,png", "kw": "发票"}。"""
    folder = os.path.abspath(folder)
    exts = {("." + e.strip().lower().lstrip(".")) for e in (filt or {}).get("ext", "").replace("，", ",").split(",") if e.strip()}
    kw = ((filt or {}).get("kw") or "").strip().casefold()
    out = []

    def walk(d, rel):
        try:
            entries = list(os.scandir(fs.lp(d)))
        except OSError:
            return
        for e in entries:
            if fs.is_skipped(e.name):
                continue
            try:
                is_dir = e.is_dir(follow_symlinks=False)
            except OSError:
                continue
            if is_dir:
                if recursive:
                    walk(os.path.join(d, e.name), os.path.join(rel, e.name) if rel else e.name)
                continue
            if exts and fs.split_ext(e.name)[1].lower() not in exts:
                continue
            if kw and kw not in e.name.casefold():
                continue
            try:
                st = e.stat()
            except OSError:
                continue
            out.append({
                "path": os.path.join(d, e.name), "dir": d, "name": e.name, "rel": rel,
                "size": st.st_size, "mtime": st.st_mtime,
                "ctime": getattr(st, "st_birthtime", st.st_ctime),
            })

    walk(folder, "")
    return out


def sort_files(files: list[dict], by: str = "name") -> list[dict]:
    if by == "mtime":
        return sorted(files, key=lambda f: (f["mtime"], fs.natural_key(f["name"])))
    if by == "taken":
        return sorted(files, key=lambda f: (_taken(f) or _dt.datetime.fromtimestamp(f["mtime"]), fs.natural_key(f["name"])))
    return sorted(files, key=lambda f: (fs.natural_key(f["rel"]), fs.natural_key(f["name"])))


def _taken(f: dict):
    if "_taken" not in f:
        ext = fs.split_ext(f["name"])[1].lower()
        f["_taken"] = fs.photo_taken(f["path"]) if ext in PHOTO_EXT else None
    return f["_taken"]


PHOTO_EXT = {".jpg", ".jpeg", ".heic", ".heif", ".tif", ".tiff", ".dng", ".cr2", ".cr3", ".nef", ".arw", ".orf", ".rw2", ".raf"}


def _place(stem: str, piece: str, where: str, sep: str) -> str:
    if where == "name":
        return piece
    if not stem:
        return piece
    return piece + sep + stem if where == "start" else stem + sep + piece


def apply_rules(f: dict, idx: int, rules: list[dict], today: _dt.datetime | None = None) -> tuple[str, list[str]]:
    """返回 (新名字, 提示代号列表)。"""
    stem, ext = fs.split_ext(f["name"])
    notes: list[str] = []
    for r in rules:
        if r.get("off"):
            continue
        t = r.get("type")
        if t == "replace":
            find = r.get("find", "")
            if not find:
                continue
            to = r.get("to", "")
            flags = 0 if r.get("case") else re.IGNORECASE
            if r.get("regex"):
                try:
                    stem = re.sub(find, to, stem, flags=flags)
                except re.error:
                    notes.append("badregex")
            else:
                stem = re.sub(re.escape(find), lambda _m: to, stem, flags=flags)
        elif t == "insert":
            text = r.get("text", "")
            stem = text + stem if r.get("where", "start") == "start" else stem + text
        elif t == "number":
            n = int(r.get("start", 1)) + idx * int(r.get("step", 1))
            piece = str(n).zfill(max(0, int(r.get("digits", 3))))
            stem = _place(stem, piece, r.get("where", "start"), r.get("sep", "-"))
        elif t == "date":
            src = r.get("source", "modified")
            when = None
            if src == "taken":
                when = _taken(f)
                if when is None:
                    notes.append("notaken")
            elif src == "created":
                when = _dt.datetime.fromtimestamp(f["ctime"])
            elif src == "today":
                when = today or _dt.datetime.now()
            if when is None:
                when = _dt.datetime.fromtimestamp(f["mtime"])
            fmt = DATE_FORMATS.get(r.get("fmt", "YYYY-MM-DD"), r.get("fmt") or "%Y-%m-%d")
            stem = _place(stem, when.strftime(fmt), r.get("where", "start"), r.get("sep", " "))
        elif t == "case":
            m = r.get("mode", "lower")
            if m == "lower":
                stem = stem.lower()
            elif m == "upper":
                stem = stem.upper()
            elif m == "title":
                stem = re.sub(r"[A-Za-z]+('[A-Za-z]+)?", lambda x: x.group(0)[0].upper() + x.group(0)[1:].lower(), stem)
            elif m == "sentence":
                stem = stem[:1].upper() + stem[1:].lower()
        elif t == "trim":
            stem = re.sub(r"[ \t　]+", " ", stem).strip()
            stem = re.sub(r"\s*([-_])\s*", r"\1", stem) if r.get("tight") else stem
        elif t == "remove":
            a, b = max(0, int(r.get("first", 0))), max(0, int(r.get("last", 0)))
            stem = stem[a:len(stem) - b if b else None]
        elif t == "ext":
            m = r.get("mode", "lower")
            if m == "lower":
                ext = ext.lower()
            elif m == "upper":
                ext = ext.upper()
            elif m == "set":
                to = (r.get("to") or "").strip()
                ext = ("." + to.lstrip(".")) if to else ""
    return stem + ext, notes


def plan(folder: str, rules: list[dict], recursive: bool = False, filt: dict | None = None,
         sort_by: str = "name", files: list[dict] | None = None) -> dict:
    """出预览：每个文件的旧名、新名、状态（same/ok/bumped/error）。不碰磁盘。"""
    files = sort_files(files if files is not None else list_files(folder, recursive, filt), sort_by)
    by_dir: dict[str, list[int]] = {}
    items = []
    for i, f in enumerate(files):
        raw, notes = apply_rules(f, i, rules)
        new = fs.sanitize(raw)
        it = {"dir": f["dir"], "rel": f["rel"], "old": f["name"], "new": new, "notes": notes, "status": "ok"}
        if new != raw and new:
            it["notes"] = notes + ["fixed"]
        if not new:
            it["new"], it["status"] = f["name"], "error"
            it["notes"] = notes + ["empty"]
        elif new == f["name"]:
            it["status"] = "same"
        items.append(it)
        by_dir.setdefault(f["dir"], []).append(len(items) - 1)

    # 同目录内去重：没改名的、批外文件占着原名；改名的放掉原名
    for d, idxs in by_dir.items():
        moving = {items[i]["old"].casefold() for i in idxs if items[i]["status"] == "ok"}
        taken = {n for n in fs.names_in(d) if n not in moving}
        # 名字没变的先登记，避免被别人抢
        for i in idxs:
            if items[i]["status"] != "ok":
                taken.add(items[i]["new"].casefold())
        for i in idxs:
            it = items[i]
            if it["status"] != "ok":
                continue
            # 只改大小写：自己占自己不算撞
            want = it["new"]
            final = fs.bump(want, taken)
            if final != want:
                it["new"], it["status"] = final, "bumped"
            taken.add(final.casefold())
    changed = sum(1 for it in items if it["status"] in ("ok", "bumped"))
    return {
        "items": items, "total": len(items), "changed": changed,
        "bumped": sum(1 for it in items if it["status"] == "bumped"),
        "errors": sum(1 for it in items if it["status"] == "error"),
    }


def to_ops(p: dict) -> list[dict]:
    return [
        {"src": os.path.join(it["dir"], it["old"]), "dst": os.path.join(it["dir"], it["new"])}
        for it in p["items"] if it["status"] in ("ok", "bumped")
    ]
