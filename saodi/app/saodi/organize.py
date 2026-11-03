"""分文件夹：按类型 / 日期 / 关键词 / 扩展名，把文件夹第一层的文件分进子文件夹。

分出来的文件夹名（图片 / Images……）、现成分法的名字跟着界面语言，字在 ui/strings.js。
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
from . import archive, content, text
from .rename import list_files, _taken, apply_rules, PHOTO_EXT

# 分出来的文件夹名跟着界面语言（strings.js 的 t_ 开头那些）：中文「图片」，英文「Images」。
# 换了语言，已经分好的旧文件夹不动、不改名，以后新来的进新语言的文件夹。
TYPES = [
    ("img", "jpg jpeg png gif bmp webp heic heif tif tiff svg ico raw dng cr2 cr3 nef arw psd ai"),
    ("video", "mp4 mov avi mkv wmv flv webm m4v 3gp mts"),
    ("audio", "mp3 wav flac aac m4a ogg wma amr opus"),
    ("doc", "pdf doc docx txt rtf md odt pages wps epub"),
    ("sheet", "xls xlsx csv xlsm ods numbers et"),
    ("slides", "ppt pptx key odp dps"),
    ("archive", "zip rar 7z tar gz bz2 xz tgz iso"),
    ("app", "exe msi dmg pkg apk appx msix"),
    ("code", "py js ts html css json xml yml yaml java c cpp cs go rs sh bat ps1 sql"),
]
EXT_TYPE = {("." + e): key for key, exts in TYPES for e in exts.split()}


def type_dir(ext: str, lang: str | None = None) -> str | None:
    """这个扩展名按类型分进哪个文件夹（当前语言）；认不出给 None。"""
    key = EXT_TYPE.get(ext.lower())
    return text.Tl(lang or text.lang(), "t_" + key) if key else None


DATE_DIRS = {
    "YYYY/MM": ("%Y", "%m"),
    "YYYY/YYYY-MM": ("%Y", "%Y-%m"),
    "YYYY-MM": ("%Y-%m",),
    "YYYY": ("%Y",),
    "YYYY/MM/DD": ("%Y", "%m", "%d"),
}

# 三个现成的分法：规则跟语言无关，名字和「其他」文件夹跟着语言
_PRESETS = [
    ("p_type", [{"by": "type"}], True),
    ("p_month", [{"by": "date", "source": "modified", "fmt": "YYYY/YYYY-MM"}], False),
    ("p_taken", [{"by": "date", "source": "taken", "fmt": "YYYY/YYYY-MM", "only": "photo"}], False),
]


def presets(lang: str | None = None) -> list[dict]:
    lang = lang or text.lang()
    return [{"name": text.Tl(lang, k), "rules": [dict(r) for r in rules], "rest": text.Tl(lang, "other") if rest else ""}
            for k, rules, rest in _PRESETS]


def __getattr__(name):
    if name == "PRESETS":  # 老代码、测试、比武脚本用的 organize.PRESETS：中文那套（0.3 存下来的就是这个样子）
        return presets("zh")
    raise AttributeError(name)


def _bare(rules):
    return [{k: v for k, v in r.items() if k not in ("fallback", "off")} for r in rules or []]


def localize(scheme: dict | None, lang: str | None = None) -> dict | None:
    """存下来的现成分法（不管当时是哪种语言存的）换成当前语言的名字和「其他」文件夹；自己定的原样不动。"""
    if not scheme:
        return scheme
    lang = lang or text.lang()
    for k, rules, rest in _PRESETS:
        if scheme.get("name") in text.every(k) and _bare(scheme.get("rules")) == rules:
            r0 = scheme.get("rest") or ""
            if r0 and r0 not in text.every("other"):
                return scheme
            out = dict(scheme)
            out["name"] = text.Tl(lang, k)
            out["rest"] = text.Tl(lang, "other") if r0 else ""
            return out
    return scheme


def localize_name(name: str, lang: str | None = None) -> str:
    """记录里存的分法名字（「按类型」「By type」）照当前语言显示。"""
    for k, _, _ in _PRESETS:
        if name in text.every(k):
            return text.Tl(lang or text.lang(), k)
    return name


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
                return [type_dir(ext)]
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
                if when is None and not r.get("fallback"):
                    continue  # 没拍摄时间：这条不管它（fallback=true 才按修改时间分）
            if when is None:
                when = _dt.datetime.fromtimestamp(f["ctime"] if r.get("source") == "created" else f["mtime"])
            return [when.strftime(p) for p in DATE_DIRS.get(r.get("fmt", "YYYY/MM"), ("%Y", "%m"))]
        elif by == "size":
            mb = f["size"] / 1048576
            if mb >= float(r.get("mb", 100)):
                return [r.get("to") or text.T("big")]
    rest = scheme.get("rest")
    return [rest] if rest else None


def plan(folder: str, scheme: dict, files: list[dict] | None = None) -> dict:
    folder = os.path.abspath(folder)
    scheme = localize(scheme)
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
            want = fs.sanitize(archive.stem_of(f["name"])) or text.T("unz_dir")
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
