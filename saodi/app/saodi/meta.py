"""读文件里藏的信息：音乐标签（MP3 / FLAC / M4A）、图片像素尺寸、相机型号。纯标准库，读不到就返回空。

音乐标签：
  MP3   ID3v2.2/2.3/2.4（含老歌常见的 GBK 乱码修正）+ ID3v1 兜底
  FLAC  Vorbis comment
  M4A / MP4 / AAC(m4a)  iTunes ilst
图片尺寸：PNG GIF BMP WEBP JPEG HEIC(ispe)
"""
from __future__ import annotations

import os
import struct

from . import fsutil as fs

AUDIO_EXT = {".mp3", ".flac", ".m4a", ".mp4", ".aac", ".m4b"}
IMAGE_EXT = {".png", ".gif", ".bmp", ".webp", ".jpg", ".jpeg", ".heic", ".heif"}


# ------------------------------------------------------------------ 文本解码
def _latin_or_gbk(b: bytes) -> str:
    """ID3 里标成 latin1 的字段，国内老 MP3 实际多是 GBK。有高位字节就先试 GB18030。"""
    b = b.split(b"\x00")[0]
    if any(c >= 0x80 for c in b):
        try:
            return b.decode("gb18030")
        except UnicodeDecodeError:
            pass
    return b.decode("latin-1")


def _id3_text(data: bytes) -> str:
    if not data:
        return ""
    enc, body = data[0], data[1:]
    try:
        if enc == 0:
            s = _latin_or_gbk(body)
        elif enc == 1:
            s = body.decode("utf-16")
        elif enc == 2:
            s = body.decode("utf-16-be")
        else:
            s = body.decode("utf-8", "replace")
    except UnicodeDecodeError:
        s = body.decode("latin-1", "replace")
    return s.split("\x00")[0].strip()


# ------------------------------------------------------------------ MP3
_ID3_MAP = {
    "TIT2": "title", "TPE1": "artist", "TALB": "album", "TRCK": "track", "TYER": "year", "TDRC": "year",
    "TT2": "title", "TP1": "artist", "TAL": "album", "TRK": "track", "TYE": "year",
}


def _syncsafe(b: bytes) -> int:
    return (b[0] << 21) | (b[1] << 14) | (b[2] << 7) | b[3]


def _id3v2(f) -> dict:
    f.seek(0)
    h = f.read(10)
    if len(h) < 10 or h[:3] != b"ID3":
        return {}
    ver, flags, size = h[3], h[5], _syncsafe(h[6:10])
    data = f.read(size)
    if flags & 0x80 and ver < 4:  # 整个标签做过反同步
        data = data.replace(b"\xff\x00", b"\xff")
    pos = 0
    if flags & 0x40:  # 扩展头
        ext = struct.unpack(">I", data[:4])[0]
        pos = (_syncsafe(data[:4]) if ver == 4 else ext + 4)
    out = {}
    while pos < len(data):
        if ver == 2:
            if pos + 6 > len(data):
                break
            fid = data[pos:pos + 3].decode("latin-1")
            fsz = int.from_bytes(data[pos + 3:pos + 6], "big")
            hdr = 6
        else:
            if pos + 10 > len(data):
                break
            fid = data[pos:pos + 4].decode("latin-1")
            raw = data[pos + 4:pos + 8]
            fsz = _syncsafe(raw) if ver == 4 else struct.unpack(">I", raw)[0]
            hdr = 10
        if not fid.strip("\x00") or fsz <= 0:
            break
        body = data[pos + hdr:pos + hdr + fsz]
        key = _ID3_MAP.get(fid)
        if key and key not in out:
            v = _id3_text(body)
            if v:
                out[key] = v
        pos += hdr + fsz
    return out


def _id3v1(f) -> dict:
    try:
        f.seek(-128, os.SEEK_END)
    except OSError:
        return {}
    t = f.read(128)
    if t[:3] != b"TAG":
        return {}
    out = {}
    for key, a, b in (("title", 3, 33), ("artist", 33, 63), ("album", 63, 93), ("year", 93, 97)):
        v = _latin_or_gbk(t[a:b]).strip()
        if v:
            out[key] = v
    if t[125] == 0 and t[126]:
        out["track"] = str(t[126])
    return out


# ------------------------------------------------------------------ FLAC
_VORBIS = {"TITLE": "title", "ARTIST": "artist", "ALBUM": "album", "TRACKNUMBER": "track", "DATE": "year", "YEAR": "year"}


def _flac(f) -> dict:
    f.seek(0)
    if f.read(4) != b"fLaC":
        return {}
    out = {}
    while True:
        h = f.read(4)
        if len(h) < 4:
            break
        last, typ, ln = h[0] & 0x80, h[0] & 0x7F, int.from_bytes(h[1:4], "big")
        if typ == 4:
            blk = f.read(ln)
            vl = struct.unpack_from("<I", blk, 0)[0]
            p = 4 + vl
            n = struct.unpack_from("<I", blk, p)[0]
            p += 4
            for _ in range(n):
                cl = struct.unpack_from("<I", blk, p)[0]
                p += 4
                kv = blk[p:p + cl].decode("utf-8", "replace")
                p += cl
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    key = _VORBIS.get(k.upper())
                    if key and key not in out and v.strip():
                        out[key] = v.strip()
            break
        f.seek(ln, os.SEEK_CUR)
        if last:
            break
    return out


# ------------------------------------------------------------------ M4A
_ILST = {b"\xa9nam": "title", b"\xa9ART": "artist", b"aART": "albumartist", b"\xa9alb": "album", b"\xa9day": "year", b"trkn": "track"}


def _atoms(f, start: int, end: int):
    pos = start
    while pos + 8 <= end:
        f.seek(pos)
        h = f.read(8)
        if len(h) < 8:
            return
        size, typ = struct.unpack(">I4s", h)
        hdr = 8
        if size == 1:
            size = struct.unpack(">Q", f.read(8))[0]
            hdr = 16
        elif size == 0:
            size = end - pos
        if size < hdr:
            return
        yield typ, pos + hdr, pos + size
        pos += size


def _m4a(f) -> dict:
    f.seek(0, os.SEEK_END)
    end = f.tell()
    f.seek(4)
    if f.read(4) != b"ftyp":
        return {}
    out = {}

    def walk(s, e, path):
        for typ, a, b in _atoms(f, s, e):
            if path == () and typ == b"moov":
                walk(a, b, ("moov",))
            elif path == ("moov",) and typ == b"udta":
                walk(a, b, ("moov", "udta"))
            elif path == ("moov", "udta") and typ == b"meta":
                walk(a + 4, b, ("moov", "udta", "meta"))  # meta 是 full box，多 4 字节
            elif path == ("moov", "udta", "meta") and typ == b"ilst":
                for it, ia, ib in _atoms(f, a, b):
                    key = _ILST.get(it)
                    if not key:
                        continue
                    for dt, da, db in _atoms(f, ia, ib):
                        if dt != b"data":
                            continue
                        f.seek(da + 8)
                        val = f.read(db - da - 8)
                        if key == "track":
                            if len(val) >= 4:
                                out[key] = str(struct.unpack(">H", val[2:4])[0])
                        else:
                            out[key] = val.decode("utf-8", "replace").strip()
    walk(0, end, ())
    if "artist" not in out and "albumartist" in out:
        out["artist"] = out["albumartist"]
    out.pop("albumartist", None)
    return out


def audio_tags(path: str) -> dict:
    """{"title","artist","album","track","year"}，读不到的键不给。"""
    ext = fs.split_ext(path)[1].lower()
    if ext not in AUDIO_EXT:
        return {}
    try:
        with open(fs.lp(path), "rb") as f:
            if ext == ".flac":
                t = _flac(f)
            elif ext == ".mp3":
                t = _id3v2(f)
                if not t.get("title") or not t.get("artist"):
                    for k, v in _id3v1(f).items():
                        t.setdefault(k, v)
            else:
                t = _m4a(f)
    except (OSError, struct.error, ValueError, IndexError):
        return {}
    if "track" in t:  # "3/12" -> "03"
        n = t["track"].split("/")[0].strip()
        t["track"] = n.zfill(2) if n.isdigit() else n
    if "year" in t:
        t["year"] = t["year"][:4]
    return {k: v for k, v in t.items() if v}


# ------------------------------------------------------------------ 图片尺寸
def image_size(path: str) -> tuple[int, int] | None:
    ext = fs.split_ext(path)[1].lower()
    if ext not in IMAGE_EXT:
        return None
    try:
        with open(fs.lp(path), "rb") as f:
            head = f.read(64)
            if head[:8] == b"\x89PNG\r\n\x1a\n":
                return struct.unpack(">II", head[16:24])
            if head[:6] in (b"GIF87a", b"GIF89a"):
                return struct.unpack("<HH", head[6:10])
            if head[:2] == b"BM":
                w, h = struct.unpack("<ii", head[18:26])
                return (w, abs(h))
            if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
                kind = head[12:16]
                if kind == b"VP8 ":
                    w, h = struct.unpack("<HH", head[26:30])
                    return (w & 0x3FFF, h & 0x3FFF)
                if kind == b"VP8L":
                    b = head[21:25]
                    return (1 + (((b[1] & 0x3F) << 8) | b[0]), 1 + (((b[3] & 0xF) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6)))
                if kind == b"VP8X":
                    return (1 + int.from_bytes(head[24:27], "little"), 1 + int.from_bytes(head[27:30], "little"))
            if head[:2] == b"\xff\xd8":
                f.seek(2)
                while True:
                    m = f.read(2)
                    if len(m) < 2 or m[0] != 0xFF:
                        return None
                    while m[1] == 0xFF:
                        m = m[:1] + f.read(1)
                    mk = m[1]
                    if mk in (0xD8, 0x01) or 0xD0 <= mk <= 0xD7:
                        continue
                    ln = struct.unpack(">H", f.read(2))[0]
                    if 0xC0 <= mk <= 0xCF and mk not in (0xC4, 0xC8, 0xCC):
                        h, w = struct.unpack(">xHH", f.read(5))
                        return (w, h)
                    f.seek(ln - 2, os.SEEK_CUR)
            if ext in (".heic", ".heif"):
                f.seek(0)
                buf = f.read(1024 * 1024)
                best = None
                i = buf.find(b"ispe")
                while i != -1:
                    w, h = struct.unpack(">II", buf[i + 8:i + 16])
                    if not best or w * h > best[0] * best[1]:
                        best = (w, h)
                    i = buf.find(b"ispe", i + 4)
                return best
    except (OSError, struct.error, IndexError):
        return None
    return None


def human_size(n: int) -> str:
    for unit, k in (("GB", 1 << 30), ("MB", 1 << 20), ("KB", 1 << 10)):
        if n >= k:
            v = n / k
            return (f"{v:.1f}".rstrip("0").rstrip(".")) + unit
    return f"{n}B"
