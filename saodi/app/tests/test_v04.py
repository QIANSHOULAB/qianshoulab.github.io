"""0.4.0：英文一套、中文一套。默认英文，选过就记进设置文件；0.3.x 的老用户接着中文；
分出来的文件夹名跟着语言（已经分好的旧文件夹不动）；托盘、冒泡、示例、模板变量两套都有。Linux 和 Windows CI 都跑。"""
from __future__ import annotations

import os
import re
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from saodi import fsutil as fs, organize, rename, text, watch  # noqa: E402

UI = os.path.join(os.path.dirname(__file__), "..", "ui")


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("SAODI_HOME", str(tmp_path / "_home"))
    monkeypatch.setenv("SAODI_DOWNLOADS", str(tmp_path / "Downloads"))
    monkeypatch.delenv("SAODI_LANG", raising=False)  # 照真用户：没人指定语言
    (tmp_path / "Downloads").mkdir()
    return tmp_path


def put(p, data=b"x" * 100):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return p


def settle(w, n=3):
    out = []
    for _ in range(n):
        out += w.tick()
    return out


def test_new_user_gets_english_and_it_sticks(home):
    from saodi.api import Api, load_cfg
    api = Api()
    api.boot()
    assert text.lang() == "en" and load_cfg()["lang"] == "en"
    h = api.hello()
    assert h["lang"] == "en" and [p["name"] for p in h["presets"]] == ["By type", "By month", "Photos by month taken"]
    assert h["presets"][0]["rest"] == "Other"
    ws = api.watch_status()
    assert ws[0]["scheme"]["name"] == "By type"
    # 换成中文：记进设置文件，重开照旧
    h = api.set_lang("zh")
    api.stop_all()
    assert h["lang"] == "zh" and load_cfg()["lang"] == "zh"
    text.set_lang("en")
    api2 = Api()
    api2.boot()
    assert text.lang() == "zh" and api2.watch_status()[0]["scheme"]["name"] == "按类型"
    api2.stop_all()


def test_old_user_keeps_chinese(home):
    """0.3.x 用过的（设置文件里有 v03、没有 lang）：接着中文，「下载」里不冒出一套英文文件夹。"""
    from saodi.api import Api, load_cfg, save_cfg
    save_cfg({"v03": True, "watch": [{"folder": str(home / "Downloads"), "scheme": organize.PRESETS[0], "on": True}]})
    api = Api()
    api.boot()
    assert text.lang() == "zh" and load_cfg()["lang"] == "zh"
    api.stop_all()


def test_folder_names_follow_language_old_folders_untouched(home):
    """英文下分进 Images / Documents / Other；以前中文分好的「图片」原样留着，不改名、不往里塞。"""
    d = home / "box"
    for n in ["a.jpg", "b.pdf", "c.xlsx", "d.unknown"]:
        put(d / n)
    put(d / "图片" / "old.jpg")
    text.set_lang("en")
    p = organize.plan(str(d), organize.PRESETS[0])  # 0.3 存的中文那套也照当前语言分
    assert {it["old"]: it["to"] for it in p["items"]} == {"a.jpg": "Images", "b.pdf": "Documents", "c.xlsx": "Spreadsheets", "d.unknown": "Other"}
    from saodi import ops
    ops.execute(organize.to_ops(p), "organize")
    assert sorted(os.listdir(d)) == ["Documents", "Images", "Other", "Spreadsheets", "图片"]
    assert os.listdir(d / "图片") == ["old.jpg"]
    text.set_lang("zh")
    put(d / "e.png")
    p = organize.plan(str(d), organize.presets("en")[0])
    assert [(it["old"], it["to"]) for it in p["items"] if it["status"] != "same"] == [("e.png", "图片")]


def test_switch_language_relabels_saved_schemes_and_running_watch(home):
    from saodi.api import Api, load_cfg
    text.set_lang("zh")
    os.environ["SAODI_LANG"] = "zh"
    try:
        api = Api()
        api.boot()
    finally:
        del os.environ["SAODI_LANG"]
    dl = home / "Downloads"
    assert load_cfg()["watch"][0]["scheme"]["rest"] == "其他"
    put(home / "box" / "a.txt")
    api.organize_run(str(home / "box"), organize.presets("zh")[1])  # sort_last 也是中文那套
    api.set_lang("en")
    c = load_cfg()
    assert c["watch"][0]["scheme"] == organize.presets("en")[0] and c["sort_last"]["name"] == "By month"
    assert api.organize_default(str(home / "nowhere"))["scheme"]["name"] == "By month"
    w = next(iter(api._watchers.values()))
    assert w.scheme["name"] == "By type"
    put(dl / "report.pdf")
    got = settle(w)
    assert [(r["old"], r["to"]) for r in got] == [("report.pdf", "Documents")]
    api.stop_all()


def test_custom_scheme_is_left_alone(home):
    text.set_lang("en")
    mine = {"name": "发票归档", "rules": [{"by": "kw", "kw": "发票", "to": "发票"}, {"by": "type"}], "rest": "其他"}
    assert organize.localize(mine) is mine  # 自己定的不改名、不改「其他」
    d = home / "inv"
    put(d / "发票-滴滴.pdf")
    put(d / "x.png")
    put(d / "y.zzz")
    got = {it["old"]: it["to"] for it in organize.plan(str(d), mine)["items"]}
    assert got == {"发票-滴滴.pdf": "发票", "x.png": "Images", "y.zzz": "其他"}


def test_strings_both_languages_in_python():
    text.load(UI)
    assert text.Tl("en", "tray_quit") == "Quit" and text.Tl("zh", "tray_quit") == "退出"
    text.set_lang("en")
    assert text.T("n_many", name="a.pdf", n=3, more=2, to="Documents") == "a.pdf and 2 more → Documents"
    assert text.T("done_rename", n=1) == "1 file renamed" and text.T("done_rename", n="1,000") == "1,000 files renamed"
    assert text.T("n_title", folder=text.T("downloads_name")) == "Jiechi · Downloads"
    text.set_lang("zh")
    assert text.T("n_many", name="a.pdf", n=3, more=2, to="文档") == "a.pdf 等 3 个 → 文档"
    # 两套键一样多，值里没有漏掉的 {占位}
    src = open(os.path.join(UI, "strings.js"), encoding="utf-8").read()
    en, zh = text._STR["en"], text._STR["zh"]
    assert set(en) == set(zh) and len(en) > 300
    for k in en:
        if k.startswith("tpl_"):
            continue
        skip = {"n", "more"} if k in ("n_many", "w_toast_n") else set()  # 中文「等 {n} 个」，英文「and {more} more」
        assert set(re.findall(r"\{(\w+)[}?]", en[k])) - skip == set(re.findall(r"\{(\w+)[}?]", zh[k])) - skip, k
    assert src.count("\n  en: {") == 1 and src.count("\n  zh: {") == 1


def test_english_template_variables(tmp_path):
    from test_v02 import make_mp3
    make_mp3(tmp_path / "track01.mp3", {"title": "Hey Jude", "artist": "The Beatles", "track": "7"})
    f = rename.list_files(str(tmp_path))[0]
    assert rename.render_tpl(f, 0, "{artist} - {title}")[0] == "The Beatles - Hey Jude"
    assert rename.render_tpl(f, 0, "{歌手} - {标题}")[0] == "The Beatles - Hey Jude"  # 中文存的模板照样认
    out, missing = rename.render_tpl(f, 0, "{track} {album} {Title}")
    assert out == "07 Hey Jude" and missing == ["album"]
    assert rename.render_tpl(f, 0, "{nope}")[0] == "{nope}"


def test_demo_and_history_in_english(home):
    from saodi.api import Api
    text.set_lang("en")
    api = Api()
    r = api.make_demo()
    names = sorted(os.listdir(r["path"]))
    assert os.path.basename(r["path"]).startswith("Jiechi sample-")
    assert "Q3 report FINAL.xlsx" in names and "stuff.zip" in names and not any(re.search(r"[一-鿿]", n) for n in names), names
    api.organize_run(r["path"], organize.presets("zh")[0])  # 记录里存的是「按类型」
    assert api.history()[0]["label"] == "By type"
    text.set_lang("zh")
    assert api.history()[0]["label"] == "按类型"


def test_watch_notification_in_english(home):
    from saodi.api import Api
    got = []
    text.set_lang("en")
    api = Api(notify=lambda title, msg: got.append((title, msg)))
    dl = home / "Downloads"
    w = watch.Watcher(str(dl), organize.presets()[0], on_done=api._on_watch_done)
    put(dl / "a.pdf")
    put(dl / "b.png")
    settle(w)
    assert got == [("Jiechi · Downloads", "a.pdf and 1 more → Documents, Images")], got
    assert fs.downloads_dir() == str(dl)
