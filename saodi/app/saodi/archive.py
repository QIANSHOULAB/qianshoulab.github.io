"""解压：zip / tar / tar.gz / tgz / tar.bz2 / tar.xz。rar、7z 要第三方库，这版不认。

- 先解到同目录的临时文件夹，成功了再改成正式名字（撞名加 (2)），解一半失败不留半成品
- zip 里的中文文件名：没标 UTF-8 的按 GBK 认（国内 Windows 打的包都这样）
- 防路径穿越（../、绝对路径）、防解压炸弹（总大小、文件数封顶）
- 压缩包里只有一个顶层文件夹时不再套一层
"""
from __future__ import annotations

import os
import shutil
import tarfile
import uuid
import zipfile

from . import fsutil as fs
from . import text as _text

MAX_TOTAL = 20 * 1024 ** 3   # 20 GB
MAX_FILES = 100_000


class ArchiveError(OSError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def kind(name: str) -> str | None:
    low = name.lower()
    if low.endswith(".zip"):
        return "zip"
    if low.endswith((".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz")):
        return "tar"
    return None


def stem_of(name: str) -> str:
    low = name.lower()
    for suf in (".tar.gz", ".tar.bz2", ".tar.xz", ".tgz", ".tbz2", ".txz", ".tar", ".zip"):
        if low.endswith(suf):
            return name[: -len(suf)] or name
    return fs.split_ext(name)[0]


def _zip_name(info: zipfile.ZipInfo) -> str:
    n = info.filename
    if not info.flag_bits & 0x800:
        try:
            n = n.encode("cp437").decode("gbk")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return n


def _safe_parts(name: str) -> list[str] | None:
    name = name.replace("\\", "/")
    if name.startswith("/") or (len(name) > 1 and name[1] == ":"):
        return None
    parts = [p for p in name.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        return None
    return [fs.sanitize(p) or "_" for p in parts]


def _extract_zip(src: str, tmp: str) -> None:
    with zipfile.ZipFile(fs.lp(src)) as z:
        infos = z.infolist()
        if len(infos) > MAX_FILES or sum(i.file_size for i in infos) > MAX_TOTAL:
            raise ArchiveError("toobig")
        for info in infos:
            if info.flag_bits & 0x1:
                raise ArchiveError("password")
            parts = _safe_parts(_zip_name(info))
            if not parts:
                continue
            target = os.path.join(tmp, *parts)
            if info.is_dir():
                os.makedirs(fs.lp(target), exist_ok=True)
                continue
            os.makedirs(fs.lp(os.path.dirname(target)), exist_ok=True)
            with z.open(info) as r, open(fs.lp(target), "wb") as w:
                shutil.copyfileobj(r, w, 1024 * 1024)


def _extract_tar(src: str, tmp: str) -> None:
    with tarfile.open(fs.lp(src)) as t:
        members = t.getmembers()
        if len(members) > MAX_FILES or sum(m.size for m in members) > MAX_TOTAL:
            raise ArchiveError("toobig")
        for m in members:
            parts = _safe_parts(m.name)
            if not parts or not (m.isfile() or m.isdir()):
                continue  # 链接、设备文件一律跳过
            target = os.path.join(tmp, *parts)
            if m.isdir():
                os.makedirs(fs.lp(target), exist_ok=True)
                continue
            os.makedirs(fs.lp(os.path.dirname(target)), exist_ok=True)
            r = t.extractfile(m)
            if r is None:
                continue
            with r, open(fs.lp(target), "wb") as w:
                shutil.copyfileobj(r, w, 1024 * 1024)


def extract(src: str, dest_parent: str, want_name: str | None = None) -> str:
    """解到 dest_parent 下一个新文件夹，返回它的完整路径。失败抛 ArchiveError/OSError，不留残渣。"""
    k = kind(os.path.basename(src))
    if not k:
        raise ArchiveError("notarchive")
    tmp = os.path.join(dest_parent, f".saodi-{uuid.uuid4().hex[:8]}.saodi-tmp")
    os.makedirs(fs.lp(tmp))
    try:
        try:
            (_extract_zip if k == "zip" else _extract_tar)(src, tmp)
        except (zipfile.BadZipFile, tarfile.TarError, EOFError) as e:
            raise ArchiveError("badarchive") from e
        except RuntimeError as e:  # zipfile 碰到加密会抛这个
            raise ArchiveError("password") from e
        inside = os.listdir(fs.lp(tmp))
        name = want_name or stem_of(os.path.basename(src))
        root = tmp
        if len(inside) == 1 and os.path.isdir(fs.lp(os.path.join(tmp, inside[0]))):
            root = os.path.join(tmp, inside[0])
            name = inside[0]
        final = os.path.join(dest_parent, fs.bump(fs.sanitize(name) or _text.T("unz_dir"), fs.names_in(dest_parent)))
        os.rename(fs.lp(root), fs.lp(final))
        if root != tmp:
            os.rmdir(fs.lp(tmp))
        return final
    except BaseException:
        shutil.rmtree(fs.lp(tmp), ignore_errors=True)  # 只删自己刚建的临时文件夹
        raise
