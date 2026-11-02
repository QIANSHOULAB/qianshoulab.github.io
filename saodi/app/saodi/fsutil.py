"""文件系统小工具：路径、合法文件名、回收站、照片拍摄时间、配置目录。

全部只用标准库，Windows 与 Linux 行为尽量一致（测试在 Linux 跑，用户在 Windows 用）。
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import re
import struct
import sys
import unicodedata

IS_WIN = sys.platform == "win32"

# Windows 不许出现在文件名里的字符 -> 换成长得像的全角字符，中文用户看着也顺
_BAD = {
    "<": "‹", ">": "›", ":": "：", '"': "＂", "/": "／", "\\": "＼",
    "|": "｜", "?": "？", "*": "＊",
}
_RESERVED = {"CON", "PRN", "AUX", "NUL"} | {f"COM{i}" for i in range(1, 10)} | {f"LPT{i}" for i in range(1, 10)}
MAX_COMPONENT = 255  # NTFS 与 ext4 单个名字的上限（字符/字节都按这个卡）

# 不碰的文件
SKIP_NAMES = {"desktop.ini", "thumbs.db", ".ds_store"}
TEMP_SUFFIXES = (".part", ".crdownload", ".download", ".tmp", ".partial", ".saodi-tmp")


def is_skipped(name: str) -> bool:
    low = name.lower()
    return (
        low in SKIP_NAMES
        or name.startswith(".")
        or name.startswith("~$")
        or low.endswith(TEMP_SUFFIXES)
    )


def sanitize(name: str) -> str:
    """把任意字符串变成 Windows 也认的文件名。空串原样返回，由调用方报错。"""
    name = unicodedata.normalize("NFC", name)
    name = "".join(_BAD.get(c, c) for c in name if ord(c) >= 32)
    name = name.rstrip(" .")
    if not name:
        return ""
    stem = name.split(".")[0].upper()
    if stem in _RESERVED:
        name = "_" + name
    if len(name) > MAX_COMPONENT or len(name.encode("utf-8")) > MAX_COMPONENT:
        stem, ext = split_ext(name)
        budget = MAX_COMPONENT - len(ext.encode("utf-8"))
        b = stem.encode("utf-8")[:budget]
        stem = b.decode("utf-8", "ignore").rstrip(" .")
        name = stem + ext
    return name


def split_ext(name: str) -> tuple[str, str]:
    """'a.b.txt' -> ('a.b', '.txt')；'.bashrc' / 'abc' -> (name, '')。超长尾巴不算扩展名。"""
    i = name.rfind(".")
    if i <= 0 or len(name) - i > 12 or " " in name[i:]:
        return name, ""
    return name[:i], name[i:]


def lp(path: str) -> str:
    """Windows 超长路径加 \\\\?\\ 前缀，其他系统原样。"""
    if not IS_WIN:
        return path
    p = os.path.abspath(path)
    if p.startswith("\\\\?\\") or len(p) < 240:
        return p
    if p.startswith("\\\\"):
        return "\\\\?\\UNC\\" + p[2:]
    return "\\\\?\\" + p


def unlp(path: str) -> str:
    if path.startswith("\\\\?\\UNC\\"):
        return "\\\\" + path[8:]
    if path.startswith("\\\\?\\"):
        return path[4:]
    return path


def exists(path: str) -> bool:
    return os.path.lexists(lp(path))


def names_in(folder: str) -> set[str]:
    """目录里已有名字（casefold，用于大小写不敏感的冲突判断）。"""
    try:
        return {n.casefold() for n in os.listdir(lp(folder))}
    except OSError:
        return set()


def bump(name: str, taken: set[str]) -> str:
    """name 被占了就变成 'name (2).ext'、'name (3).ext'……taken 存的是 casefold 名字。"""
    if name.casefold() not in taken:
        return name
    stem, ext = split_ext(name)
    m = re.match(r"^(.*) \((\d+)\)$", stem)
    base, n = (m.group(1), int(m.group(2))) if m else (stem, 1)
    while True:
        n += 1
        cand = sanitize(f"{base} ({n}){ext}")
        if cand.casefold() not in taken:
            return cand


def natural_key(s: str):
    return [int(t) if t.isdigit() else t.casefold() for t in re.split(r"(\d+)", s)]


# ---------------------------------------------------------------- 配置目录
def home_dir() -> str:
    d = os.environ.get("SAODI_HOME")
    if not d:
        base = os.environ.get("APPDATA") if IS_WIN else os.path.expanduser("~/.config")
        d = os.path.join(base or os.path.expanduser("~"), "Saodi")
    os.makedirs(d, exist_ok=True)
    return d


def read_json(path: str, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".saodi-tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


# ---------------------------------------------------------------- 回收站
def to_trash(path: str) -> None:
    """进回收站，绝不直接删。失败抛 OSError。"""
    path = os.path.abspath(path)
    if IS_WIN:
        _trash_win(path)
    else:
        _trash_xdg(path)


def _trash_win(path: str) -> None:
    import ctypes
    from ctypes import wintypes

    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND), ("wFunc", wintypes.UINT),
            ("pFrom", wintypes.LPCWSTR), ("pTo", wintypes.LPCWSTR),
            ("fFlags", ctypes.c_ushort), ("fAnyOperationsAborted", wintypes.BOOL),
            ("hNameMappings", ctypes.c_void_p), ("lpszProgressTitle", wintypes.LPCWSTR),
        ]

    FO_DELETE, FOF_SILENT, FOF_NOCONFIRMATION, FOF_ALLOWUNDO, FOF_NOERRORUI = 3, 4, 16, 64, 1024
    op = SHFILEOPSTRUCTW()
    op.wFunc = FO_DELETE
    op.pFrom = unlp(path) + "\0"
    op.fFlags = FOF_SILENT | FOF_NOCONFIRMATION | FOF_ALLOWUNDO | FOF_NOERRORUI
    rc = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))
    if rc != 0 or op.fAnyOperationsAborted:
        raise OSError(f"回收站拒收 (code {rc})")


def _trash_xdg(path: str) -> None:
    base = os.path.join(os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share"), "Trash")
    files, info = os.path.join(base, "files"), os.path.join(base, "info")
    os.makedirs(files, exist_ok=True)
    os.makedirs(info, exist_ok=True)
    name = os.path.basename(path)
    taken = {n.casefold() for n in os.listdir(files)}
    dest_name = bump(name, taken)
    with open(os.path.join(info, dest_name + ".trashinfo"), "w", encoding="utf-8") as f:
        f.write("[Trash Info]\nPath=%s\nDeletionDate=%s\n" % (path, _dt.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")))
    os.rename(path, os.path.join(files, dest_name))


# ---------------------------------------------------------------- 照片拍摄时间
def photo_taken(path: str) -> _dt.datetime | None:
    """读 EXIF DateTimeOriginal（JPEG / HEIC / TIFF / 多数 RAW 都能找到 Exif 块）。读不到返回 None。"""
    try:
        with open(lp(path), "rb") as f:
            head = f.read(512 * 1024)
    except OSError:
        return None
    tiff = None
    if head[:4] in (b"II*\x00", b"MM\x00*"):
        tiff = head
    else:
        i = head.find(b"Exif\x00\x00")
        while i != -1:
            cand = head[i + 6:]
            if cand[:4] in (b"II*\x00", b"MM\x00*"):
                tiff = cand
                break
            i = head.find(b"Exif\x00\x00", i + 1)
    if tiff is None:
        return None
    try:
        return _parse_tiff_date(tiff)
    except (struct.error, ValueError, IndexError):
        return None


def _parse_tiff_date(t: bytes):
    e = "<" if t[:2] == b"II" else ">"

    def ifd(off):
        n = struct.unpack_from(e + "H", t, off)[0]
        out = {}
        for k in range(n):
            tag, typ, cnt, val = struct.unpack_from(e + "HHI4s", t, off + 2 + 12 * k)
            out[tag] = (typ, cnt, val)
        return out

    def ascii_val(entry):
        typ, cnt, val = entry
        if cnt <= 4:
            raw = val[:cnt]
        else:
            o = struct.unpack(e + "I", val)[0]
            raw = t[o:o + cnt]
        return raw.split(b"\x00")[0].decode("ascii", "ignore").strip()

    ifd0 = ifd(struct.unpack_from(e + "I", t, 4)[0])
    s = None
    if 0x8769 in ifd0:
        sub = ifd(struct.unpack(e + "I", ifd0[0x8769][2])[0])
        for tag in (0x9003, 0x9004):
            if tag in sub:
                s = ascii_val(sub[tag])
                if s:
                    break
    if not s and 0x0132 in ifd0:
        s = ascii_val(ifd0[0x0132])
    if not s or s.startswith("0000"):
        return None
    return _dt.datetime.strptime(s[:19], "%Y:%m:%d %H:%M:%S")


def make_jpeg_with_exif(path: str, when: _dt.datetime) -> None:
    """测试/自检用：造一张带拍摄时间的最小 JPEG（不需要能显示，只要 EXIF 合规）。"""
    ds = when.strftime("%Y:%m:%d %H:%M:%S").encode() + b"\x00"  # 20 字节
    # TIFF 头(8) + IFD0(2+12+4=18) -> 26 ；ExifIFD 在 26：2+12+4=18 -> 44 ；字符串在 44
    tiff = b"II*\x00" + struct.pack("<I", 8)
    tiff += struct.pack("<H", 1) + struct.pack("<HHII", 0x8769, 4, 1, 26) + struct.pack("<I", 0)
    tiff += struct.pack("<H", 1) + struct.pack("<HHII", 0x9003, 2, 20, 44) + struct.pack("<I", 0)
    tiff += ds
    app1 = b"Exif\x00\x00" + tiff
    data = b"\xff\xd8" + b"\xff\xe1" + struct.pack(">H", len(app1) + 2) + app1 + b"\xff\xd9"
    with open(path, "wb") as f:
        f.write(data)
