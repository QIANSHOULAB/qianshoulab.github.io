"""0.3.0：盯「下载」默认在岗、关着时来的补分、撤销了不再分、下载中/占位/隐藏不碰、改法和分法记住、开机自启。
Linux 和 Windows CI 都跑；隐藏属性、注册表那几条只在 Windows 上跑。"""
from __future__ import annotations

import os
import sys
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from saodi import fsutil as fs, ops, organize, watch, winsys  # noqa: E402

IS_WIN = sys.platform == "win32"


@pytest.fixture(autouse=True)
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("SAODI_HOME", str(tmp_path / "_home"))
    monkeypatch.setenv("SAODI_DOWNLOADS", str(tmp_path / "Downloads"))
    (tmp_path / "Downloads").mkdir()
    yield


def put(p, data=b"x" * 100):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return p


def settle(w, n=3):
    out = []
    for _ in range(n):
        out += w.tick()
    return out


def W(d, state=None):
    return watch.Watcher(str(d), organize.PRESETS[0], state_path=str(state) if state else None)


# ---------------------------------------------------------------- 下载中、占位、隐藏、临时
def test_progress_markers_and_placeholders(tmp_path):
    d = tmp_path / "Downloads"
    w = W(d)
    put(d / "合同.docx", b"")                       # Firefox：0 字节占位
    put(d / "合同.docx.part", b"y" * 5000)          # Firefox：真数据在 .part
    put(d / "电影.mp4", b"m" * 5000)                # aria2：边下边写正名
    put(d / "电影.mp4.aria2", b"ctl")               # aria2 控制文件
    put(d / "安装包.exe.xltd", b"t" * 100)           # 迅雷
    put(d / "安装包.exe.xltd.cfg", b"cfg")
    put(d / "照片.zip.baiduyun.p.downloading", b"z")  # 百度网盘
    put(d / "Unconfirmed 123.crdownload", b"c")     # Chrome 刚开始
    put(d / "~$周报.docx", b"o")                     # Office 临时
    put(d / ".隐藏", b"h")
    put(d / "desktop.ini", b"i")
    assert settle(w) == []
    left = sorted(os.listdir(d))
    assert "文档" not in left and "其他" not in left and "视频" not in left, left
    # 下完了：Firefox 把 .part 盖到占位上；aria2 删控制文件；迅雷改名
    os.replace(d / "合同.docx.part", d / "合同.docx")
    (d / "电影.mp4.aria2").unlink()
    os.replace(d / "安装包.exe.xltd", d / "安装包.exe")
    (d / "安装包.exe.xltd.cfg").unlink()
    done = settle(w)
    got = sorted((r["old"], r["to"], r["new"]) for r in done)
    assert got == [("合同.docx", "文档", "合同.docx"), ("安装包.exe", "安装包", "安装包.exe"), ("电影.mp4", "视频", "电影.mp4")], got
    assert sorted(os.listdir(d / "文档")) == ["合同.docx"]  # 没有 0 字节的「合同.docx」+「合同 (2).docx」


def test_in_progress_helper():
    names = {"a.pdf.crdownload", "b.iso.part", "c.mp4.aria2", "d.exe.xltd", "e.zip.baiduyun.p.downloading"}
    for n in ["a.pdf", "b.iso", "c.mp4", "d.exe", "e.zip"]:
        assert fs.in_progress(n, names), n
    assert not fs.in_progress("f.pdf", names)
    for n in ["x.!ut", "x.bc!", "x.xltd.cfg", "x.td", "x.opdownload", "x.aria2"]:
        assert fs.is_skipped(n), n


def test_hidden_attribute_stat():
    class St:
        st_file_attributes = 0x2
    assert fs.is_hidden_stat(St())
    St.st_file_attributes = 0x4
    assert fs.is_hidden_stat(St())
    St.st_file_attributes = 0x20
    assert not fs.is_hidden_stat(St())


@pytest.mark.skipif(not IS_WIN, reason="隐藏属性只有 Windows 有")
def test_windows_hidden_file_never_touched(tmp_path):
    import ctypes
    d = tmp_path / "Downloads"
    w = W(d)
    p = put(d / "藏着.pdf")
    ctypes.windll.kernel32.SetFileAttributesW(str(p), 0x2)
    assert settle(w) == [] and p.exists()
    from saodi import rename
    assert rename.list_files(str(d)) == []


# ---------------------------------------------------------------- 记性：挪回来的不再分、关着时来的补分
def test_moved_back_and_undo_not_resorted(tmp_path):
    d = tmp_path / "Downloads"
    w = W(d)
    put(d / "报价.pdf")
    put(d / "图.png")
    done = settle(w)
    assert {r["old"] for r in done} == {"报价.pdf", "图.png"}
    # 人把报价.pdf 挪回来：不再分走
    os.replace(d / "文档" / "报价.pdf", d / "报价.pdf")
    assert settle(w) == [] and (d / "报价.pdf").exists()
    # 撤销那一批：图.png 回来，也不再分走
    u = ops.undo(done[0]["batch"])
    assert u["ok"] and (d / "图.png").exists()
    w.forgive(u["paths"])
    assert settle(w) == [] and (d / "图.png").exists()
    # 新来的照样分
    put(d / "新.pdf")
    assert [r["old"] for r in settle(w)] == ["新.pdf"]


def test_catch_up_files_that_came_while_closed(tmp_path):
    d = tmp_path / "Downloads"
    st = tmp_path / "_home" / "w.json"
    put(d / "老的.pdf")
    w = W(d, st)
    assert settle(w) == []       # 第一次盯：已经在的不碰
    w.stop()
    put(d / "昨晚的.pdf")          # 程序关着时来的
    put(d / "昨晚的.png")
    w2 = W(d, st)
    got = sorted(r["old"] for r in settle(w2))
    assert got == ["昨晚的.pdf", "昨晚的.png"], got
    assert (d / "老的.pdf").exists()


def test_state_survives_and_moved_ids_persist(tmp_path):
    d = tmp_path / "Downloads"
    st = tmp_path / "_home" / "w.json"
    w = W(d, st)
    put(d / "a.pdf")
    settle(w)
    w.stop()
    os.replace(d / "文档" / "a.pdf", d / "a.pdf")  # 关着时人挪回来了
    w2 = W(d, st)
    assert settle(w2) == [] and (d / "a.pdf").exists()


# ---------------------------------------------------------------- Api：第一次开、记住、一堆一下分、撤销后盯梢不再分
def test_boot_watches_downloads_and_remembers(tmp_path):
    from saodi.api import Api, load_cfg
    d = tmp_path / "Downloads"
    put(d / "旧1.pdf")
    put(d / "旧2.png")
    api = Api()
    api.boot()
    try:
        c = load_cfg()
        assert c["intro"] is True and c["v03"] is True
        ws = api.watch_status()
        assert len(ws) == 1 and ws[0]["on"] and os.path.samefile(ws[0]["folder"], d)
        pile = api.pile()
        assert pile["n"] == 2 and dict(pile["groups"]) == {"文档": 1, "图片": 1}
        r = api.pile_run()
        assert r["done"] == 2 and load_cfg()["intro"] is False
        # 撤销那一批：放回原处，盯梢不再把它们分走
        u = api.undo(r["batch"])
        assert u["ok"] and (d / "旧1.pdf").exists()
        time.sleep(0.1)
        w = next(iter(api._watchers.values()))
        assert settle(w) == [] and (d / "旧1.pdf").exists() and (d / "旧2.png").exists()
        # 关掉：一下；再开：从这一刻算
        api.watch_set(str(d), False)
        assert not api.watch_status()[0]["on"] and api.watch_status()[0]["folder"]
        put(d / "关着时.pdf")
        api.watch_set(str(d), True)
        w = next(iter(api._watchers.values()))
        assert settle(w) == []
        # 重启程序（第二次 boot）：接着盯，不再说开头那句
        api.stop_all()
        api2 = Api()
        api2.boot()
        assert load_cfg()["intro"] is False and api2.watch_status()[0]["on"]
        api2.stop_all()
    finally:
        api.stop_all()


def test_rename_and_scheme_remembered(tmp_path):
    from saodi.api import Api, load_cfg
    f1 = tmp_path / "旅行1"
    put(f1 / "IMG_1.JPG")
    api = Api()
    rules = [{"type": "replace", "find": "IMG_", "to": "旅行_"}]
    r = api.rename_run(str(f1), rules, {"sort": "name"})
    assert r["done"] == 1 and not r["failed"] and (f1 / "旅行_1.JPG").exists()
    c = load_cfg()
    assert c["rename_last"]["rules"] == rules and c["rename_recent"][0]["rules"] == rules
    api.rename_run(str(f1), [{"type": "insert", "text": "x-", "where": "start"}], {})
    assert len(load_cfg()["rename_recent"]) == 2
    assert api.forget_rename(0)["recent"][0]["rules"] == rules
    # 分法：这个文件夹上回用的
    f2 = tmp_path / "收件"
    put(f2 / "a.pdf")
    sch = organize.PRESETS[1]
    assert api.organize_default(str(f2))["from"] == "preset"
    api.organize_run(str(f2), sch)
    assert api.organize_default(str(f2)) == {"scheme": sch, "from": "folder"}
    assert api.organize_default(str(tmp_path))["from"] == "last"


def test_photo_folder_guesses_by_taken_month(tmp_path):
    """一文件夹照片：按类型分等于全进「图片」，没人这么分 —— 先给「照片按拍摄月份」，看得见、一下能换。"""
    import datetime as dt
    from saodi.api import Api
    api = Api()
    d = tmp_path / "相册"
    d.mkdir()
    for i in range(9):
        fs.make_jpeg_with_exif(str(d / f"IMG_{i}.JPG"), dt.datetime(2026, 1 + i, 3))
    put(d / "说明.txt")
    got = api.organize_default(str(d))
    assert got["from"] == "guess" and got["scheme"] == organize.PRESETS[2], got
    mixed = tmp_path / "杂"
    for n in ["a.pdf", "b.docx", "c.jpg", "d.xlsx"]:
        put(mixed / n)
    assert api.organize_default(str(mixed))["from"] == "preset"
    # 这个文件夹上回用过别的分法：照上回的，不猜
    api.organize_run(str(d), organize.PRESETS[0])
    assert api.organize_default(str(d))["from"] == "folder"


def test_retry_redoes_only_the_failed_ones(tmp_path):
    from saodi.api import Api
    api = Api()
    d = tmp_path / "f"
    put(d / "001-a.txt")   # 第一回已经改好的
    put(d / "b.txt")       # 第一回被占着没改成的
    r = api.retry("rename", str(d), [{"rel": "", "old": "b.txt", "new": "002-b.txt"}])
    assert r["done"] == 1 and sorted(os.listdir(d)) == ["001-a.txt", "002-b.txt"]
    put(d / "x.pdf")
    r = api.retry("organize", str(d), [{"old": "x.pdf", "to": "文档", "new": "x.pdf", "op": "copy"}])
    assert r["copied"] == 1 and (d / "x.pdf").exists() and (d / "文档" / "x.pdf").exists()


def test_autostart_switch(tmp_path):
    from saodi.api import Api, load_cfg
    api = Api()
    if not IS_WIN:
        assert api.hello()["autostart"] == {"supported": False, "on": True}
        assert api.autostart_set(False)["on"] is False and load_cfg()["autostart"] is False
        return
    before = winsys.autostart_command()
    try:
        assert api.autostart_set(True)["on"] is True
        assert "--tray" in winsys.autostart_command()
        assert api.autostart_set(False)["on"] is False and winsys.autostart_command() is None
    finally:
        if before:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, winsys.RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
                winreg.SetValueEx(k, winsys.NAME, 0, winreg.REG_SZ, before)


def test_strings_shared_with_python():
    from saodi import text
    text.load(os.path.join(os.path.dirname(__file__), "..", "ui"))
    assert text.T("tray_quit") == "退出"
    assert text.T("n_many", name="a.pdf", n=3, to="文档") == "a.pdf 等 3 个 → 文档"
