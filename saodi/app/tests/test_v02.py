"""0.2 新增：模板改名（音乐标签/图片尺寸/相机/文件属性）、按内容分、复制、解压。"""
from __future__ import annotations

import datetime as dt
import io
import os
import struct
import sys
import tarfile
import zipfile
import zlib

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from saodi import fsutil as fs, ops, rename, organize, watch, meta, content, archive  # noqa: E402
from test_core import mk, ls, read  # noqa: E402,F401


@pytest.fixture(autouse=True)
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("SAODI_HOME", str(tmp_path / "_home"))
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "_xdg"))


# ------------------------------------------------------------------ 造测试文件
def _id3_frame(fid: str, text: str, enc: int, ver: int = 3) -> bytes:
    if enc == 0:
        body = b"\x00" + text.encode("gbk")
    elif enc == 1:
        body = b"\x01" + text.encode("utf-16")
    else:
        body = b"\x03" + text.encode("utf-8")
    size = len(body)
    sz = struct.pack(">I", size) if ver == 3 else bytes([(size >> 21) & 0x7F, (size >> 14) & 0x7F, (size >> 7) & 0x7F, size & 0x7F])
    return fid.encode() + sz + b"\x00\x00" + body


def make_mp3(path, tags: dict, enc=1, ver=3, v1: dict | None = None):
    frames = b""
    for fid, k in (("TIT2", "title"), ("TPE1", "artist"), ("TALB", "album"), ("TRCK", "track")):
        if k in tags:
            frames += _id3_frame(fid, tags[k], enc, ver)
    data = b""
    if frames:
        n = len(frames)
        data = b"ID3" + bytes([ver, 0, 0]) + bytes([(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F]) + frames
    data += b"\xff\xfb\x90\x00" + b"\x00" * 400  # 假装是音频帧
    if v1:
        t = b"TAG" + v1.get("title", "").encode("gbk").ljust(30, b"\x00") + v1.get("artist", "").encode("gbk").ljust(30, b"\x00")
        t += v1.get("album", "").encode("gbk").ljust(30, b"\x00") + b"2001" + b"\x00" * 28 + b"\x00\x07\x00"
        data += t
    with open(path, "wb") as f:
        f.write(data)


def make_flac(path, comments: dict):
    vendor = b"saodi"
    items = [f"{k}={v}".encode() for k, v in comments.items()]
    blk = struct.pack("<I", len(vendor)) + vendor + struct.pack("<I", len(items))
    for it in items:
        blk += struct.pack("<I", len(it)) + it
    streaminfo = b"\x00" + (34).to_bytes(3, "big") + b"\x00" * 34
    vc = bytes([0x80 | 4]) + len(blk).to_bytes(3, "big") + blk
    with open(path, "wb") as f:
        f.write(b"fLaC" + streaminfo + vc + b"\xff\xf8" + b"\x00" * 100)


def _atom(typ: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 8 + len(payload)) + typ + payload


def make_m4a(path, title, artist, track):
    def data(v: bytes, kind=1):
        return _atom(b"data", struct.pack(">II", kind, 0) + v)
    ilst = _atom(b"ilst", _atom(b"\xa9nam", data(title.encode())) + _atom(b"\xa9ART", data(artist.encode()))
                 + _atom(b"trkn", data(struct.pack(">HHHH", 0, track, 12, 0), 0)))
    meta_ = _atom(b"meta", b"\x00\x00\x00\x00" + _atom(b"hdlr", b"\x00" * 25) + ilst)
    moov = _atom(b"moov", _atom(b"mvhd", b"\x00" * 100) + _atom(b"udta", meta_))
    with open(path, "wb") as f:
        f.write(_atom(b"ftyp", b"M4A \x00\x00\x00\x00M4A mp42isom") + _atom(b"mdat", b"\x00" * 64) + moov)


def make_png(path, w, h):
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    chunk = struct.pack(">I", 13) + b"IHDR" + ihdr + struct.pack(">I", zlib.crc32(b"IHDR" + ihdr))
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk)


def make_docx(path, text):
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", f'<w:document><w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>')


def make_xlsx(path, text):
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("xl/sharedStrings.xml", f"<sst><si><t>{text}</t></si></sst>")
        z.writestr("xl/worksheets/sheet1.xml", "<worksheet/>")


# ------------------------------------------------------------------ 音乐标签
def test_mp3_tags_utf16_gbk_v24_v1(tmp_path):
    a = tmp_path / "a.mp3"
    make_mp3(a, {"title": "稻香", "artist": "周杰伦", "album": "魔杰座", "track": "3/12"}, enc=1, ver=3)
    assert meta.audio_tags(str(a)) == {"title": "稻香", "artist": "周杰伦", "album": "魔杰座", "track": "03"}
    b = tmp_path / "b.mp3"
    make_mp3(b, {"title": "月亮代表我的心", "artist": "邓丽君"}, enc=0, ver=3)  # 标成 latin1 实际 GBK
    assert meta.audio_tags(str(b))["artist"] == "邓丽君"
    c = tmp_path / "c.mp3"
    make_mp3(c, {"title": "Ünïcode ✓", "artist": "Björk"}, enc=3, ver=4)
    assert meta.audio_tags(str(c)) == {"title": "Ünïcode ✓", "artist": "Björk"}
    d = tmp_path / "d.mp3"
    make_mp3(d, {}, v1={"title": "老歌", "artist": "老歌手", "album": "精选"})
    t = meta.audio_tags(str(d))
    assert t["title"] == "老歌" and t["artist"] == "老歌手" and t["track"] == "07" and t["year"] == "2001"


def test_flac_and_m4a(tmp_path):
    make_flac(tmp_path / "x.flac", {"TITLE": "Hotel", "ARTIST": "Eagles", "TRACKNUMBER": "1", "DATE": "1976-12-08"})
    assert meta.audio_tags(str(tmp_path / "x.flac")) == {"title": "Hotel", "artist": "Eagles", "track": "01", "year": "1976"}
    make_m4a(tmp_path / "y.m4a", "晴天", "周杰伦", 5)
    assert meta.audio_tags(str(tmp_path / "y.m4a")) == {"title": "晴天", "artist": "周杰伦", "track": "05"}
    (tmp_path / "z.mp3").write_bytes(b"not an mp3 at all")
    assert meta.audio_tags(str(tmp_path / "z.mp3")) == {}


def test_rename_music_by_template(tmp_path):
    d = mk(tmp_path / "歌")
    make_mp3(d / "track01.mp3", {"title": "稻香", "artist": "周杰伦", "track": "1"})
    make_mp3(d / "track02.mp3", {"title": "晴天", "artist": "周杰伦", "track": "2"})
    make_mp3(d / "unknown.mp3", {})
    p = rename.plan(str(d), [{"type": "tpl", "tpl": "{音轨} {歌手} - {标题}", "where": "name"}])
    m = {it["old"]: it for it in p["items"]}
    assert m["track01.mp3"]["new"] == "01 周杰伦 - 稻香.mp3"
    assert m["track02.mp3"]["new"] == "02 周杰伦 - 晴天.mp3"
    assert m["unknown.mp3"]["new"] == "unknown.mp3" and "nometa" in m["unknown.mp3"]["notes"]
    r = ops.execute(rename.to_ops(p), "rename")
    assert r["done"] == 2


def test_partial_tags_clean_separators(tmp_path):
    d = mk(tmp_path / "歌")
    make_mp3(d / "a.mp3", {"title": "只有标题"})
    p = rename.plan(str(d), [{"type": "tpl", "tpl": "{歌手} - {标题}"}])
    assert p["items"][0]["new"] == "只有标题.mp3" and "nometa" in p["items"][0]["notes"]


# ------------------------------------------------------------------ 图片 / 相机 / 文件属性
def test_image_size_and_camera(tmp_path):
    make_png(tmp_path / "a.png", 1920, 1080)
    (tmp_path / "b.gif").write_bytes(b"GIF89a" + struct.pack("<HH", 320, 240) + b"\x00" * 20)
    (tmp_path / "c.bmp").write_bytes(b"BM" + b"\x00" * 16 + struct.pack("<ii", 800, -600) + b"\x00" * 30)
    (tmp_path / "d.webp").write_bytes(b"RIFF\x00\x00\x00\x00WEBPVP8X" + b"\x0a\x00\x00\x00\x00\x00\x00\x00"
                                      + (4031).to_bytes(3, "little") + (3023).to_bytes(3, "little") + b"\x00" * 20)
    fs.make_jpeg_with_exif(str(tmp_path / "e.jpg"), dt.datetime(2026, 4, 3, 10, 0), model="iPhone 15 Pro", size=(4032, 3024))
    heic = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 8 + b"\x00\x00\x00\x14ispe\x00\x00\x00\x00" + struct.pack(">II", 512, 512) \
        + b"\x00\x00\x00\x14ispe\x00\x00\x00\x00" + struct.pack(">II", 4032, 3024)
    (tmp_path / "f.heic").write_bytes(heic)
    assert meta.image_size(str(tmp_path / "a.png")) == (1920, 1080)
    assert meta.image_size(str(tmp_path / "b.gif")) == (320, 240)
    assert meta.image_size(str(tmp_path / "c.bmp")) == (800, 600)
    assert meta.image_size(str(tmp_path / "d.webp")) == (4032, 3024)
    assert meta.image_size(str(tmp_path / "e.jpg")) == (4032, 3024)
    assert meta.image_size(str(tmp_path / "f.heic")) == (4032, 3024)
    assert fs.exif_info(str(tmp_path / "e.jpg"))["model"] == "iPhone 15 Pro"
    p = rename.plan(str(tmp_path), [{"type": "tpl", "tpl": "{拍摄日期} {相机} {宽}x{高}"}], filt={"ext": "jpg"})
    assert p["items"][0]["new"] == "2026-04-03 iPhone 15 Pro 4032x3024.jpg"


def test_file_attribute_vars(tmp_path):
    d = mk(tmp_path / "报销单", "a.pdf", "b.pdf")
    with open(d / "b.pdf", "wb") as f:
        f.write(b"x" * 2_500_000)
    os.utime(d / "a.pdf", (dt.datetime(2026, 1, 9).timestamp(),) * 2)
    p = rename.plan(str(d), [{"type": "tpl", "tpl": "{文件夹}-{序号}-{大小}", "where": "name"}])
    assert [it["new"] for it in p["items"]] == ["报销单-01-5B.pdf", "报销单-02-2.4MB.pdf"]
    p = rename.plan(str(d), [{"type": "tpl", "tpl": "{修改日期}", "where": "start", "sep": "_"}], filt={"kw": "a"})
    assert p["items"][0]["new"] == "2026-01-09_a.pdf"


# ------------------------------------------------------------------ 按内容分
def test_content_extract(tmp_path):
    (tmp_path / "gbk.txt").write_bytes("这是一份采购合同，甲方：某某".encode("gbk"))
    (tmp_path / "u16.csv").write_bytes("编号,发票号\n1,INV-001".encode("utf-16"))
    make_docx(tmp_path / "w.docx", "租赁合同 &amp; 补充协议")
    make_xlsx(tmp_path / "x.xlsx", "增值税发票汇总")
    stream = zlib.compress(b"BT (Invoice No. 8821) Tj ET")
    (tmp_path / "p.pdf").write_bytes(b"%PDF-1.4\n1 0 obj<</Filter/FlateDecode>>stream\n" + stream + b"\nendstream\nendobj\n%%EOF")
    assert content.contains(str(tmp_path / "gbk.txt"), ["采购合同"])
    assert content.contains(str(tmp_path / "u16.csv"), ["发票号"])
    assert "租赁合同 & 补充协议" in content.text_of(str(tmp_path / "w.docx"))
    assert content.contains(str(tmp_path / "x.xlsx"), ["发票"])
    assert content.contains(str(tmp_path / "p.pdf"), ["invoice no"])
    assert not content.contains(str(tmp_path / "w.docx"), ["发票"])
    (tmp_path / "bad.docx").write_bytes(b"not a zip")
    assert content.text_of(str(tmp_path / "bad.docx")) == ""


def test_organize_by_content(tmp_path):
    d = mk(tmp_path / "f")
    make_docx(d / "扫描001.docx", "房屋租赁合同")
    make_xlsx(d / "表1.xlsx", "发票明细")
    (d / "随手记.txt").write_text("今天买了菜", encoding="utf-8")
    scheme = {"rules": [{"by": "content", "kw": "合同", "to": "合同"}, {"by": "content", "kw": "发票，invoice", "to": "发票"}], "rest": ""}
    p = organize.plan(str(d), scheme)
    m = {it["old"]: it["to"] for it in p["items"]}
    assert m == {"扫描001.docx": "合同", "表1.xlsx": "发票", "随手记.txt": ""}


# ------------------------------------------------------------------ 复制
def test_copy_mode_and_undo_to_trash(tmp_path):
    d = mk(tmp_path / "f", "a.jpg", "b.pdf")
    mk(d / "图片", "a.jpg", content="已有")
    p = organize.plan(str(d), {"rules": [{"by": "type"}], "action": "copy"})
    assert p["action"] == "copy" and p["changed"] == 2
    r = ops.execute(organize.to_ops(p), "organize")
    assert r["done"] == 2 and r["copied"] == 2
    assert ls(d) == sorted(["a.jpg", "b.pdf", "图片", "文档"])          # 原件都在
    assert ls(d / "图片") == ["a (2).jpg", "a.jpg"] and read(d / "图片" / "a.jpg") == "已有"
    u = ops.undo()
    assert u["restored"] == 2
    assert ls(d) == sorted(["a.jpg", "b.pdf", "图片"]) and ls(d / "图片") == ["a.jpg"]
    if fs.IS_WIN:
        return  # Windows 进的是真回收站
    trash = tmp_path / "_xdg" / "Trash" / "files"
    assert sorted(os.listdir(trash)) == ["a (2).jpg", "b.pdf"]       # 复制品进了回收站，不是删


def test_copy_undo_skips_modified_copy(tmp_path):
    d = mk(tmp_path / "f", "a.txt")
    r = ops.execute(organize.to_ops(organize.plan(str(d), {"rules": [{"by": "type"}], "action": "copy"})), "organize")
    with open(d / "文档" / "a.txt", "a", encoding="utf-8") as f:
        f.write(" 用户后来又改过")
    u = ops.undo(r["batch"])
    assert u["skipped"] == [{"name": "a.txt", "err": "changed"}] and ls(d / "文档") == ["a.txt"]


# ------------------------------------------------------------------ 解压
def _zip_gbk(path, files: dict):
    """模拟国内 Windows 打的包：文件名 GBK，不标 UTF-8。"""
    buf = io.BytesIO()
    swaps = []
    with zipfile.ZipFile(buf, "w") as z:
        for i, (n, data) in enumerate(files.items()):
            g = n.encode("gbk")
            ph = (f"#{i}#".encode() + b"x" * len(g))[:len(g)]  # 同字节长度的 ASCII 占位
            swaps.append((ph, g))
            z.writestr(ph.decode(), data)
    raw = buf.getvalue()
    for ph, g in swaps:
        raw = raw.replace(ph, g)
    with open(path, "wb") as f:
        f.write(raw)


def test_unzip_gbk_names_single_top_and_undo(tmp_path):
    d = mk(tmp_path / "f")
    _zip_gbk(d / "资料.zip", {"合同.txt": "a", "附件/图.png": "b"})
    with zipfile.ZipFile(d / "项目.zip", "w") as z:  # 只有一个顶层文件夹
        z.writestr("项目源码/readme.md", "hi")
        z.writestr("项目源码/src/a.py", "print(1)")
    with tarfile.open(d / "备份.tar.gz", "w:gz") as t:
        data = "日志".encode()
        ti = tarfile.TarInfo("logs/1.log")
        ti.size = len(data)
        t.addfile(ti, io.BytesIO(data))
    mk(d, "资料")  # 同名文件已存在 → 解到 资料 (2)
    p = organize.plan(str(d), {"rules": [{"by": "type"}], "unzip": True})
    assert p["extract"] == 3
    r = ops.execute(organize.to_ops(p), "organize")
    assert r["extracted"] == 3 and not r["failed"], r
    assert sorted(ls(d / "资料 (2)")) == ["合同.txt", "附件"]
    assert ls(d / "项目源码") == ["readme.md", "src"]
    assert read(d / "logs" / "1.log") == "日志"  # 只有一个顶层文件夹：不再套一层
    assert ls(d / "压缩包") == sorted(["资料.zip", "项目.zip", "备份.tar.gz"])
    ops.undo()
    assert ls(d) == sorted(["资料", "资料.zip", "项目.zip", "备份.tar.gz"])


def test_unzip_rejects_traversal_and_bad_archive(tmp_path):
    d = mk(tmp_path / "f")
    with zipfile.ZipFile(d / "evil.zip", "w") as z:
        z.writestr("../../escape.txt", "x")
        z.writestr("/abs.txt", "x")
        z.writestr("ok.txt", "fine")
    (d / "broken.zip").write_bytes(b"PK\x03\x04 garbage")
    p = organize.plan(str(d), {"rules": [], "unzip": True})
    r = ops.execute(organize.to_ops(p), "organize")
    assert not (tmp_path / "escape.txt").exists() and not os.path.exists("/abs.txt")
    assert ls(d / "evil") == ["ok.txt"]
    assert r["failed"] == [{"name": "broken.zip", "err": "badarchive"}]
    assert not [n for n in os.listdir(d) if n.endswith(".saodi-tmp")]


# ------------------------------------------------------------------ 盯着 + 复制/解压
def test_watcher_copy_mode_does_not_loop(tmp_path):
    d = mk(tmp_path / "dl")
    w = watch.Watcher(str(d), {"rules": [{"by": "type"}], "action": "copy"})
    mk(d, "a.pdf")
    w.tick()
    assert len(w.tick()) == 1
    for _ in range(3):
        assert w.tick() == []          # 原件还在，但不会再复制一遍
    assert ls(d / "文档") == ["a.pdf"] and "a.pdf" in ls(d)


def test_watcher_unzip(tmp_path):
    d = mk(tmp_path / "dl")
    w = watch.Watcher(str(d), {"rules": [{"by": "type"}], "unzip": True})
    with zipfile.ZipFile(d / "照片.zip", "w") as z:
        z.writestr("1.jpg", "x")
    w.tick()
    got = w.tick()
    assert sorted(x["op"] for x in got) == ["extract", "move"]
    assert ls(d) == sorted(["压缩包", "照片"]) and ls(d / "照片") == ["1.jpg"]
    assert w.tick() == [] and w.tick() == []   # 解出来的文件夹不会被当新文件
