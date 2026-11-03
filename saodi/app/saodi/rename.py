"""改名规则：一串规则依次作用在「主名」上（扩展名单独管），出预览，再交给 ops.execute。

规则长这样（界面直接传 JSON 过来）：
  {"type": "replace", "find": "IMG_", "to": "", "regex": false, "case": false}
  {"type": "insert",  "text": "旅行-", "where": "start" | "end"}
  {"type": "number",  "start": 1, "step": 1, "digits": 3, "where": "start"|"end"|"name", "sep": "-"}
  {"type": "date",    "source": "modified"|"created"|"taken"|"today", "fmt": "YYYY-MM-DD",
                      "where": "start"|"end"|"name", "sep": " ", "fallback": false}
                      拍摄时间读不到：默认这条规则不动这个文件（截图别被改成下载那天）；fallback=true 才用修改时间顶
  {"type": "case",    "mode": "lower"|"upper"|"title"|"sentence"}
  {"type": "trim"}                         去掉首尾空格、连续空格并一个
  {"type": "remove",  "first": 0, "last": 0}   砍掉开头/结尾 N 个字
  {"type": "ext",     "mode": "lower"|"upper"|"set", "to": ".jpg"}
  {"type": "tpl",     "tpl": "{歌手} - {标题}", "where": "name"|"start"|"end", "sep": " "}
      模板变量见 TPL_VARS：文件属性、照片信息、音乐标签。读不到的变量留空并提示。英文名（{artist} - {title}）见 TPL_EN，两套都认。
"""
from __future__ import annotations

import datetime as _dt
import os
import re

from . import fsutil as fs

DATE_FORMATS = {  # 顺序 = 界面下拉顺序；手机相机最常见的排第一
    "YYYYMMDD_hhmmss": "%Y%m%d_%H%M%S",
    "YYYY-MM-DD": "%Y-%m-%d",
    "YYYYMMDD": "%Y%m%d",
    "YYYY-MM-DD hh.mm.ss": "%Y-%m-%d %H.%M.%S",
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
            if fs.IS_WIN and fs.is_hidden_stat(st):  # 隐藏、系统属性只有 Windows 有
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


TPL_VARS = ["原名", "文件夹", "大小", "修改日期", "拍摄日期", "相机", "宽", "高",
            "歌手", "标题", "专辑", "音轨", "年份", "序号"]
# 0.4.0 英文界面用英文变量名（strings.js 的 tpl_vars），两套都认：中文存的模板换到英文界面照样能用
TPL_EN = dict(zip(["name", "folder", "size", "modified", "taken", "camera", "width", "height",
                   "artist", "title", "album", "track", "year", "n"], TPL_VARS))
_TPL_RE = re.compile(r"\{([^{}]+)\}")


def _meta(f: dict) -> dict:
    if "_meta" not in f:
        from . import meta
        m = {}
        m.update({{"title": "标题", "artist": "歌手", "album": "专辑", "track": "音轨", "year": "年份"}[k]: v
                  for k, v in meta.audio_tags(f["path"]).items()})
        wh = meta.image_size(f["path"])
        if wh:
            m["宽"], m["高"] = str(wh[0]), str(wh[1])
        ext = fs.split_ext(f["name"])[1].lower()
        if ext in PHOTO_EXT:
            ex = fs.exif_info(f["path"])
            if ex.get("model"):
                model, make = ex["model"], ex.get("make", "")
                m["相机"] = model if not make or model.lower().startswith(make.split()[0].lower()) else f"{make} {model}"
            if ex.get("taken"):
                m["拍摄日期"] = ex["taken"].strftime("%Y-%m-%d")
                f["_taken"] = ex["taken"]
        f["_meta"] = m
    return f["_meta"]


def render_tpl(f: dict, idx: int, tpl: str, total: int = 0) -> tuple[str, list[str]]:
    stem = fs.split_ext(f["name"])[0]
    missing: list[str] = []

    def val(name: str) -> str:
        shown = name.strip()
        name = TPL_EN.get(shown.lower(), shown)
        if name == "原名":
            return stem
        if name == "文件夹":
            return os.path.basename(f["dir"].rstrip("\\/"))
        if name == "大小":
            from .meta import human_size
            return human_size(f["size"])
        if name == "修改日期":
            return _dt.datetime.fromtimestamp(f["mtime"]).strftime("%Y-%m-%d")
        if name == "序号":
            return str(idx + 1).zfill(max(2, len(str(total))))
        v = _meta(f).get(name)
        if v is None:
            if name in TPL_VARS:
                missing.append(shown)
            else:
                return "{" + shown + "}"
            return ""
        return v

    out = _TPL_RE.sub(lambda m: val(m.group(1)), tpl)
    # 变量空了留下的孤零零的连接符收拾掉："- 标题" -> "标题"
    out = re.sub(r"^[\s\-_.·,，]+|[\s\-_.·,，]+$", "", out)
    out = re.sub(r"(\s*[-_·]\s*){2,}", " - ", out)
    out = re.sub(r"\s{2,}", " ", out)
    return out, missing


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
                    if not r.get("fallback"):
                        notes.append("notaken_skip")
                        continue
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
        elif t == "tpl":
            piece, missing = render_tpl(f, idx, r.get("tpl", ""), r.get("_total", 0))
            if missing:
                notes.append("nometa")
            if piece:
                stem = _place(stem, piece, r.get("where", "name"), r.get("sep", " "))
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
    rules = [dict(r, _total=len(files)) if r.get("type") == "tpl" else r for r in rules]
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
        "notaken": sum(1 for it in items if "notaken_skip" in it["notes"]),
    }


def to_ops(p: dict) -> list[dict]:
    return [
        {"src": os.path.join(it["dir"], it["old"]), "dst": os.path.join(it["dir"], it["new"])}
        for it in p["items"] if it["status"] in ("ok", "bumped")
    ]
