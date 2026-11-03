"""分文件夹：按类型 / 日期 / 关键词 / 扩展名，把文件夹第一层的文件分进子文件夹。

方案（scheme）= 有序规则表，第一条命中的说了算；都不中的看 "rest"：留在原地或进某个文件夹。
  "action": "move"(默认，挪过去) | "copy"(复制一份过去，原件不动)
  "unzip": true  压缩包（zip/tar）顺手解压到原地一个同名文件夹，压缩包本身照规则处理
  规则 by: type / ext / kw(名字里有) / content(内容里有) / date / size
  {"name": "按类型", "rules": [{"by": "type"}], "rest": ""}
  {"name": "发票归档", "rules": [{"by": "kw", "kw": "发票,invoice", "to": "发票"},
                                 {"by": "ext", "ext": "pdf", "to": "PDF"},
                                 {"by": "date", "source": "modified", "fmt": "YYYY/MM"}], "rest": "其他"}
"""
from __future__ import annotations

import datetime as _dt
import os

from . import fsutil as fs
from . import archive, content
from .rename import list_files, _taken, apply_rules, PHOTO_EXT

TYPES = [
    ("图片", "jpg jpeg png gif bmp webp heic heif tif tiff svg ico raw dng cr2 cr3 nef arw psd ai"),
    ("视频", "mp4 mov avi mkv wmv flv webm m4v 3gp mts"),
    ("音频", "mp3 wav flac aac m4a ogg wma amr opus"),
    ("文档", "pdf doc docx txt rtf md odt pages wps epub"),
    ("表格", "xls xlsx csv xlsm ods numbers et"),
    ("演示", "ppt pptx key odp dps"),
    ("压缩包", "zip rar 7z tar gz bz2 xz tgz iso"),
    ("安装包", "exe msi dmg pkg apk appx msix"),
    ("代码", "py js ts html css json xml yml yaml java c cpp cs go rs sh bat ps1 sql"),
]
EXT_TYPE = {("." + e): name for name, exts in TYPES for e in exts.split()}

DATE_DIRS = {
    "YYYY/MM": ("%Y", "%m"),
    "YYYY/YYYY-MM": ("%Y", "%Y-%m"),
    "YYYY-MM": ("%Y-%m",),
    "YYYY": ("%Y",),
    "YYYY/MM/DD": ("%Y", "%m", "%d"),
}

PRESETS = [
    {"name": "按类型", "rules": [{"by": "type"}], "rest": "其他"},
    {"name": "按月份", "rules": [{"by": "date", "source": "modified", "fmt": "YYYY/YYYY-MM"}], "rest": ""},
    {"name": "照片按拍摄月份", "rules": [{"by": "date", "source": "taken", "fmt": "YYYY/YYYY-MM", "only": "photo"}], "rest": ""},
]


def _split(s: str) -> list[str]:
    return [x.strip() for x in (s or "").replace("，", ",").replace(" ", ",").split(",") if x.strip()]


def target_of(f: dict, scheme: dict) -> list[str] | None:
    """返回子文件夹路径片段，None 表示不动。"""
    ext = fs.split_ext(f["name"])[1].lower()
    for r in scheme.get("rules", []):
        if r.get("off"):
            continue
        by = r.get("by")
        if r.get("only") == "photo" and ext not in PHOTO_EXT:
            continue
        if by == "type":
            if ext in EXT_TYPE:
                return [EXT_TYPE[ext]]
        elif by == "ext":
            if ext.lstrip(".") in {e.lower().lstrip(".") for e in _split(r.get("ext", ""))}:
                return [r.get("to") or ext.lstrip(".").upper()]
        elif by == "kw":
            name = f["name"].casefold()
            if any(k.casefold() in name for k in _split(r.get("kw", ""))):
                return [r.get("to") or _split(r.get("kw", ""))[0]]
        elif by == "content":
            words = _split(r.get("kw", ""))
            if words and content.contains(f["path"], words, f.get("mtime", 0)):
                return [r.get("to") or words[0]]
        elif by == "date":
            when = None
            if r.get("source") == "taken":
                when = _taken(f)
            if when is None:
                when = _dt.datetime.fromtimestamp(f["ctime"] if r.get("source") == "created" else f["mtime"])
            return [when.strftime(p) for p in DATE_DIRS.get(r.get("fmt", "YYYY/MM"), ("%Y", "%m"))]
        elif by == "size":
            mb = f["size"] / 1048576
            if mb >= float(r.get("mb", 100)):
                return [r.get("to") or "大文件"]
    rest = scheme.get("rest")
    return [rest] if rest else None


def plan(folder: str, scheme: dict, files: list[dict] | None = None) -> dict:
    folder = os.path.abspath(folder)
    files = files if files is not None else list_files(folder, False)
    files = sorted(files, key=lambda f: fs.natural_key(f["name"]))
    rename_rules = scheme.get("rename") or []
    copy = scheme.get("action") == "copy"
    unzip = bool(scheme.get("unzip"))
    taken_by_dir: dict[str, set[str]] = {}

    def taken(d):
        if d not in taken_by_dir:
            taken_by_dir[d] = fs.names_in(d)
        return taken_by_dir[d]

    items = []
    for i, f in enumerate(files):
        if unzip and archive.kind(f["name"]):
            want = fs.sanitize(archive.stem_of(f["name"])) or "解压"
            final = fs.bump(want, taken(f["dir"]))
            taken(f["dir"]).add(final.casefold())
            items.append({"old": f["name"], "dir": f["dir"], "to": "", "new": final, "op": "extract",
                          "status": "bumped" if final != want else "ok"})
        parts = target_of(f, scheme)
        new_name = f["name"]
        if rename_rules:
            new_name = fs.sanitize(apply_rules(f, i, rename_rules)[0]) or f["name"]
        parts = [fs.sanitize(p) for p in (parts or []) if fs.sanitize(p)]
        if not parts and (new_name == f["name"] or copy):
            items.append({"old": f["name"], "dir": f["dir"], "to": "", "new": f["name"], "status": "same", "op": "move"})
            continue
        dst_dir = os.path.join(f["dir"], *parts)
        t = taken(dst_dir)
        if not parts:  # 原地改名：自己的旧名放掉
            t.discard(f["name"].casefold())
        final = fs.bump(new_name, t)
        t.add(final.casefold())
        items.append({
            "old": f["name"], "dir": f["dir"], "to": "/".join(parts), "new": final,
            "op": "copy" if copy else "move",
            "status": "bumped" if final != new_name else "ok",
        })
    moved = [it for it in items if it["status"] != "same"]
    groups: dict[str, int] = {}
    for it in moved:
        if it["op"] != "extract":
            groups[it["to"] or "."] = groups.get(it["to"] or ".", 0) + 1
    return {
        "items": items, "total": len(files), "changed": sum(1 for it in moved if it["op"] != "extract"),
        "extract": sum(1 for it in moved if it["op"] == "extract"),
        "action": "copy" if copy else "move",
        "groups": sorted(groups.items(), key=lambda kv: -kv[1]),
        "bumped": sum(1 for it in items if it["status"] == "bumped"),
    }


def to_ops(p: dict) -> list[dict]:
    out = []
    for it in p["items"]:
        if it["status"] == "same":
            continue
        dst_dir = os.path.join(it["dir"], *it["to"].split("/")) if it["to"] else it["dir"]
        op = {"src": os.path.join(it["dir"], it["old"]), "dst": os.path.join(dst_dir, it["new"])}
        if it.get("op") in ("copy", "extract"):
            op["mode"] = it["op"]
        out.append(op)
    return out
