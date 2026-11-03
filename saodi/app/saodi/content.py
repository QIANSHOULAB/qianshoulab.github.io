"""按文件内容判断：抽出文件里的文字（只读前一截），给「内容里有 XX」的规则用。

能读：txt csv md log json xml html htm rtf tsv ini（自动认 UTF-8 / UTF-16 / GBK）
      docx xlsx pptx（Office 新格式，本质是 zip 里的 xml）
      pdf（只认没压缩或 Flate 压缩里的英文、数字；中文 PDF 多半是字形编码，认不出）
读不了的返回 ""。
"""
from __future__ import annotations

import re
import zipfile
import zlib

from . import fsutil as fs

TEXT_EXT = {".txt", ".csv", ".tsv", ".md", ".log", ".json", ".xml", ".html", ".htm", ".rtf", ".ini", ".yml", ".yaml"}
OFFICE_EXT = {".docx", ".xlsx", ".pptx", ".docm", ".xlsm"}
LIMIT = 4 * 1024 * 1024  # 每个文件最多看 4 MB 文字

_cache: dict[tuple, str] = {}


def decode(b: bytes) -> str:
    if b.startswith(b"\xef\xbb\xbf"):
        return b[3:].decode("utf-8", "replace")
    if b.startswith((b"\xff\xfe", b"\xfe\xff")):
        return b.decode("utf-16", "replace")
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        pass
    try:
        return b.decode("gb18030")
    except UnicodeDecodeError:
        return b.decode("utf-8", "replace")


_TAG = re.compile(rb"<[^>]+>")


def _office(path: str) -> str:
    out = []
    with zipfile.ZipFile(fs.lp(path)) as z:
        names = z.namelist()
        want = [n for n in names if n == "word/document.xml" or n.startswith(("word/header", "word/footer"))
                or n == "xl/sharedStrings.xml" or (n.startswith("xl/worksheets/sheet") and n.endswith(".xml"))
                or (n.startswith("ppt/slides/slide") and n.endswith(".xml"))]
        total = 0
        for n in want:
            raw = z.read(n)[:LIMIT]
            # 段落/单元格之间补空格，免得词粘一起
            raw = raw.replace(b"</w:p>", b"\n").replace(b"</a:p>", b"\n").replace(b"</si>", b"\n").replace(b"</c>", b" ")
            txt = _TAG.sub(b"", raw).decode("utf-8", "replace")
            out.append(txt)
            total += len(txt)
            if total > LIMIT:
                break
    import html
    return html.unescape("\n".join(out))


def _pdf(path: str) -> str:
    with open(fs.lp(path), "rb") as f:
        data = f.read(LIMIT * 4)
    chunks = [data]
    for m in re.finditer(rb"stream\r?\n", data):
        start = m.end()
        end = data.find(b"endstream", start)
        if end == -1:
            break
        try:
            chunks.append(zlib.decompress(data[start:end].rstrip(b"\r\n")))
        except zlib.error:
            pass
        if len(chunks) > 400:
            break
    words = []
    for c in chunks[1:] or chunks:
        for s in re.findall(rb"\(((?:\\.|[^\\)])*)\)", c):
            words.append(s.replace(b"\\(", b"(").replace(b"\\)", b")"))
    return b" ".join(words).decode("latin-1", "replace")


def text_of(path: str, mtime: float = 0) -> str:
    key = (path, mtime)
    if key in _cache:
        return _cache[key]
    ext = fs.split_ext(path)[1].lower()
    txt = ""
    try:
        if ext in TEXT_EXT:
            with open(fs.lp(path), "rb") as f:
                txt = decode(f.read(LIMIT))
            if ext in (".html", ".htm", ".xml", ".rtf"):
                txt = re.sub(r"<[^>]+>", " ", txt)
        elif ext in OFFICE_EXT:
            txt = _office(path)
        elif ext == ".pdf":
            txt = _pdf(path)
    except (OSError, zipfile.BadZipFile, KeyError, ValueError, RuntimeError):
        txt = ""
    if len(_cache) > 2000:
        _cache.clear()
    _cache[key] = txt
    return txt


def contains(path: str, words: list[str], mtime: float = 0) -> bool:
    if not words:
        return False
    t = text_of(path, mtime).casefold()
    return bool(t) and any(w.casefold() in t for w in words)
