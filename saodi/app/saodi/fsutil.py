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
# 下载中、临时文件：浏览器（Chrome/Edge .crdownload、Firefox .part、Opera .opdownload、Safari .download）、
# aria2（.aria2 控制文件）、迅雷（.xltd + .xltd.cfg，老版 .td）、百度网盘（.downloading）、BT（.!ut .!qb .bc!）、快车（.jc!）
TEMP_SUFFIXES = (".part", ".crdownload", ".download", ".opdownload", ".partial", ".tmp", ".temp",
                 ".aria2", ".xltd", ".xltd.cfg", ".td", ".td.cfg", ".downloading",
                 ".!ut", ".!qb", ".!bt", ".bc!", ".jc!", ".saodi-tmp")
# 这些后缀的文件还在，说明去掉后缀的那个名字还没下完（Firefox 先放个 0 字节的同名占位、aria2 边下边写正名）
PROGRESS_SUFFIXES = (".part", ".crdownload", ".download", ".opdownload", ".partial", ".aria2", ".xltd", ".td",
                     ".downloading", ".baiduyun.p.downloading", ".baiduyun.downloading", ".!ut", ".!qb", ".bc!", ".jc!")
FILE_ATTRIBUTE_HIDDEN, FILE_ATTRIBUTE_SYSTEM = 0x2, 0x4


def is_skipped(name: str) -> bool:
    low = name.lower()
    return (
        low in SKIP_NAMES
        or name.startswith(".")
        or name.startswith("~$")
        or low.endswith(TEMP_SUFFIXES)
    )


def is_hidden_stat(st) -> bool:
    """Windows 上标了「隐藏」或「系统」属性的文件（资源管理器默认不显示的），一律不碰。"""
    return bool(getattr(st, "st_file_attributes", 0) & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM))


def in_progress(name: str, names_lower: set[str]) -> bool:
    """同一文件夹里有 name.part / name.crdownload / name.aria2 这类兄弟文件 → name 还没下完。"""
    low = name.lower()
    return any(low + suf in names_lower for suf in PROGRESS_SUFFIXES)


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


# ---------------------------------------------------------------- 下载文件夹
def downloads_dir() -> str:
    """「下载」文件夹的真实位置：Windows 上问系统（用户可能把它挪到了 D 盘），问不到用 ~/Downloads。
    SAODI_DOWNLOADS 环境变量优先（测试、比武用，免得碰真的下载文件夹）。"""
    env = os.environ.get("SAODI_DOWNLOADS")
    if env:
        return os.path.abspath(env)
    if IS_WIN:
        try:
            import ctypes
            import uuid as _uuid
            from ctypes import wintypes

            class GUID(ctypes.Structure):
                _fields_ = [("Data1", wintypes.DWORD), ("Data2", wintypes.WORD), ("Data3", wintypes.WORD),
                            ("Data4", ctypes.c_ubyte * 8)]

            u = _uuid.UUID("{374DE290-123F-4565-9164-39C4925E467B}")  # FOLDERID_Downloads
            g = GUID(u.fields[0], u.fields[1], u.fields[2], (ctypes.c_ubyte * 8)(*u.bytes[8:]))
            out = ctypes.c_wchar_p()
            sh = ctypes.windll.shell32
            if sh.SHGetKnownFolderPath(ctypes.byref(g), 0, None, ctypes.byref(out)) == 0:
                path = out.value
                ctypes.windll.ole32.CoTaskMemFree(out)
                if path:
                    return path
        except Exception:
            pass
    return os.path.join(os.path.expanduser("~"), "Downloads")


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


def write_json(path: str, data, pretty: bool = False) -> None:
    """先写临时文件再换上，写一半断电也不会坏。
    默认紧凑写：json.dumps 不缩进走 C 编码器；json.dump(indent=) 是一块块纯 Python 编，
    1500 个文件的账本每批要写两遍，紧凑写省下几十毫秒（0.3.0）。配置文件小，缩进好让人看。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".saodi-tmp"
    text = json.dumps(data, ensure_ascii=False, indent=1) if pretty else json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def in_use(path: str) -> bool:
    """别的程序还开着这个文件吗？Windows 用独占方式试开一下；其他系统一律当没开。"""
    if not IS_WIN:
        return False
    import ctypes
    from ctypes import wintypes
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.CreateFileW.restype = wintypes.HANDLE
    k32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
                                wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    GENERIC_READ, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL = 0x80000000, 3, 0x80
    h = k32.CreateFileW(lp(path), GENERIC_READ, 0, None, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, None)
    if h in (None, wintypes.HANDLE(-1).value):
        return True
    k32.CloseHandle(h)
    return False


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
    return exif_info(path).get("taken")


def exif_info(path: str) -> dict:
    """{"taken": datetime|None, "make": str, "model": str}，读不到的键不给。"""
    try:
        with open(lp(path), "rb") as f:
            head = f.read(512 * 1024)
    except OSError:
        return {}
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
        return {}
    try:
        return _parse_tiff(tiff)
    except (struct.error, ValueError, IndexError):
        return {}


def _parse_tiff(t: bytes) -> dict:
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
        return raw.split(b"\x00")[0].decode("utf-8", "ignore").strip()

    out: dict = {}
    ifd0 = ifd(struct.unpack_from(e + "I", t, 4)[0])
    for tag, key in ((0x010F, "make"), (0x0110, "model")):
        if tag in ifd0:
            try:
                v = ascii_val(ifd0[tag])
                if v:
                    out[key] = v
            except (struct.error, IndexError):
                pass
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
    if s and not s.startswith("0000"):
        try:
            out["taken"] = _dt.datetime.strptime(s[:19], "%Y:%m:%d %H:%M:%S")
        except ValueError:
            pass
    return out


def make_jpeg_with_exif(path: str, when: _dt.datetime, model: str = "", size: tuple[int, int] | None = None) -> None:
    """测试/自检用：造一张带拍摄时间（可选相机型号、像素尺寸）的最小 JPEG。"""
    ds = when.strftime("%Y:%m:%d %H:%M:%S").encode() + b"\x00"  # 20 字节
    mb = model.encode() + b"\x00" if model else b""
    n0 = 2 if model else 1
    ifd0_len = 2 + 12 * n0 + 4
    exif_off = 8 + ifd0_len
    str_off = exif_off + 18
    model_off = str_off + 20
    tiff = b"II*\x00" + struct.pack("<I", 8) + struct.pack("<H", n0)
    if model:
        tiff += struct.pack("<HHII", 0x0110, 2, len(mb), model_off)
    tiff += struct.pack("<HHII", 0x8769, 4, 1, exif_off) + struct.pack("<I", 0)
    tiff += struct.pack("<H", 1) + struct.pack("<HHII", 0x9003, 2, 20, str_off) + struct.pack("<I", 0)
    tiff += ds + mb
    app1 = b"Exif\x00\x00" + tiff
    data = b"\xff\xd8" + b"\xff\xe1" + struct.pack(">H", len(app1) + 2) + app1
    if size:
        w, h = size
        sof = struct.pack(">BHHB", 8, h, w, 3) + b"\x01\x11\x00\x02\x11\x01\x03\x11\x01"
        data += b"\xff\xc0" + struct.pack(">H", len(sof) + 2) + sof
    data += b"\xff\xd9"
    with open(path, "wb") as f:
        f.write(data)
