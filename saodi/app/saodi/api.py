"""界面 <-> 核心 的桥。pywebview 把 Api 的方法暴露给 JS；开发时 devserver 用同一个类走 HTTP。

返回值一律是能转 JSON 的 dict/list；错误用代号（err），文案在 ui/strings.js 统一管。
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import urllib.request

from . import VERSION
from . import fsutil as fs
from . import ops, rename, organize, watch, download, winsys, text
from .text import T

UPDATE_URL = "https://qianshoulab.github.io/saodi/version.json"
PAGE_URL = "https://qianshoulab.github.io/saodi/"
PREFS = {"view", "intro", "notify"}  # 界面能直接存的小偏好


def _cfg_path():
    return os.path.join(fs.home_dir(), "config.json")


def load_cfg() -> dict:
    c = fs.read_json(_cfg_path(), {})
    c.setdefault("schemes", [])
    c.setdefault("rename_presets", [])
    c.setdefault("recent", [])
    c.setdefault("watch", [])
    return c


def save_cfg(c: dict) -> None:
    fs.write_json(_cfg_path(), c, pretty=True)


def _lang_of(c: dict) -> str:
    """界面语言：选过的照选的；没选过的新用户英文（Song 11-03 22:19：默认英文，第二语言中文）；
    0.3.x 用过的老用户（只有中文那会儿装的）接着中文，免得一升级「下载」里冒出一套英文文件夹。
    SAODI_LANG 只给开发、测试、比武用（设置文件里还没有 lang 时才看）。"""
    if c.get("lang") in text.LANGS:
        return c["lang"]
    env = os.environ.get("SAODI_LANG")
    if env in text.LANGS:
        return env
    return "zh" if c.get("v03") else "en"


def _same(a: str, b: str) -> bool:
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def _state_path(folder: str) -> str:
    h = hashlib.sha1(os.path.normcase(os.path.abspath(folder)).encode("utf-8")).hexdigest()[:16]
    return os.path.join(fs.home_dir(), "watch", h + ".json")


def _rules_key(rules) -> str:
    return json.dumps([{k: v for k, v in r.items() if not k.startswith("_")} for r in rules], ensure_ascii=False, sort_keys=True)


class Api:
    def __init__(self, notify=None, on_lang=None):
        self._window = None  # pywebview 窗口，开发服务器下为 None
        self._on_lang = on_lang  # 换了语言：窗口标题、托盘菜单跟着换，由 main.py 给
        text.set_lang(_lang_of(load_cfg()))
        self._watchers: dict[str, watch.Watcher] = {}
        self._dl: download.Downloader | None = None
        self._busy = threading.Lock()
        self._wlock = threading.Lock()
        self._update = None
        self._notify = notify  # 自动分完了怎么叫人（托盘冒泡），由 main.py 给

    # ------------------------------------------------------------ 开机
    def boot(self, auto_downloads: bool = True):
        """程序一开（开机自启进托盘也算）就调：0.3.0 第一次开把「下载」盯上；接着盯上次在盯的，关着时来的补分。"""
        c = load_cfg()
        if c.get("lang") not in text.LANGS:  # 定下来记进设置文件，以后就照它（先定语言再标 v03）
            c["lang"] = text.set_lang(_lang_of(c))
            save_cfg(c)
        if not c.get("v03"):
            c["v03"] = True
            c["intro"] = True  # 顶上那句话，人点掉或者动过开关就不再说
            dl = fs.downloads_dir()
            if auto_downloads and os.path.isdir(fs.lp(dl)) and not any(_same(x["folder"], dl) for x in c["watch"]):
                c["watch"].append({"folder": os.path.abspath(dl), "scheme": organize.presets()[0], "on": True})
            save_cfg(c)
        self.watch_resume()
        return True

    # ------------------------------------------------------------ 基本
    def hello(self):
        c = load_cfg()
        dl = fs.downloads_dir()
        return {
            "version": VERSION, "platform": sys.platform, "cfg": c, "lang": text.lang(),
            "presets": organize.presets(), "types": [organize.type_dir("." + e.split()[0]) for _, e in organize.TYPES],
            "date_formats": list(rename.DATE_FORMATS), "dir_formats": list(organize.DATE_DIRS),
            "downloads": dl,
            "autostart": self._autostart(c),
        }

    @staticmethod
    def _autostart(c):
        # Windows 上看注册表；别的系统（开发、测试）只记个开关，界面照样能点
        if winsys.IS_WIN:
            return {"supported": True, "on": winsys.autostart_enabled()}
        return {"supported": False, "on": c.get("autostart", True) is not False}

    def pile(self, folder=None):
        """「下载」里现在堆着的、照它盯着用的分法会挪走的：顶上那句话里报个数，一点就分。"""
        folder = os.path.abspath(folder or fs.downloads_dir())
        if not os.path.isdir(fs.lp(folder)):
            return {"folder": folder, "n": 0, "groups": []}
        ent = next((x for x in load_cfg()["watch"] if _same(x["folder"], folder)), None)
        scheme = organize.localize(ent["scheme"] if ent else organize.presets()[0])
        p = organize.plan(folder, scheme)
        return {"folder": folder, "n": p["changed"], "groups": p["groups"][:4], "scheme": scheme}

    def pile_run(self, folder=None):
        """把那一堆按盯着用的分法分了：一批，能整批撤销。"""
        info = self.pile(folder)
        r = self.organize_run(info["folder"], info["scheme"]) if info["n"] else {"done": 0, "failed": [], "batch": None}
        c = load_cfg()
        c["intro"] = False
        save_cfg(c)
        return r

    def organize_default(self, folder):
        """这个文件夹上回用的分法；没有的话，一文件夹几乎全是照片就先给「照片按拍摄月份」
        （按类型分等于全进「图片」，没人这么分）；再不然用上回的；再没有就「按类型」。选中的那项打着勾，一下能换。"""
        c = load_cfg()
        key = os.path.normcase(os.path.abspath(folder))
        if key in c.get("sort_by_folder", {}):
            return {"scheme": organize.localize(c["sort_by_folder"][key]), "from": "folder"}
        files = rename.list_files(folder) if os.path.isdir(fs.lp(folder)) else []
        if len(files) >= 5 and sum(1 for f in files if fs.split_ext(f["name"])[1].lower() in rename.PHOTO_EXT) >= 0.8 * len(files):
            return {"scheme": organize.presets()[2], "from": "guess"}
        if c.get("sort_last"):
            return {"scheme": organize.localize(c["sort_last"]), "from": "last"}
        return {"scheme": organize.presets()[0], "from": "preset"}

    def set_lang(self, lang):
        """左下角 EN / 中文：记进设置文件，下次打开照旧。存着的现成分法换成新语言的名字（以后新分的进新语言的文件夹，旧文件夹不动）。"""
        if lang not in text.LANGS:
            return self.hello()
        with self._wlock:
            text.set_lang(lang)
            c = load_cfg()
            c["lang"] = lang
            for x in c["watch"]:
                x["scheme"] = organize.localize(x["scheme"])
            if c.get("sort_last"):
                c["sort_last"] = organize.localize(c["sort_last"])
            c["sort_by_folder"] = {k: organize.localize(v) for k, v in c.get("sort_by_folder", {}).items()}
            save_cfg(c)
            for w in self._watchers.values():
                w.scheme = organize.localize(w.scheme)
        if self._on_lang:
            try:
                self._on_lang(lang)
            except Exception:
                pass
        return self.hello()

    def set_pref(self, key, value):
        if key not in PREFS:
            return False
        c = load_cfg()
        c[key] = value
        save_cfg(c)
        return True

    def pick_folder(self, start: str = ""):
        if not self._window:
            return None
        import webview
        kind = webview.FileDialog.FOLDER if hasattr(webview, "FileDialog") else webview.FOLDER_DIALOG
        r = self._window.create_file_dialog(kind, directory=start or "")
        return r[0] if r else None

    def check_folder(self, path: str):
        path = (path or "").strip().strip('"')
        if path and os.path.isfile(fs.lp(path)):  # 拖进来的是文件 → 用它所在的文件夹
            path = os.path.dirname(path)
        if not path or not os.path.isdir(fs.lp(path)):
            return {"ok": False, "err": "nofolder"}
        path = os.path.abspath(path)
        c = load_cfg()
        c["recent"] = [path] + [p for p in c["recent"] if not _same(p, path)][:7]
        save_cfg(c)
        return {"ok": True, "path": path, "name": os.path.basename(path) or path}

    def open_path(self, path: str):
        try:
            if fs.IS_WIN:
                os.startfile(path)  # noqa
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except Exception:
            return False

    def open_page(self):
        return self.open_path(PAGE_URL)

    def check_update(self):
        """读总舵上的 version.json；只 GET，不传任何东西。失败就当没新版。"""
        if self._update is not None:
            return self._update
        try:
            req = urllib.request.Request(UPDATE_URL, headers={"User-Agent": "Saodi/" + VERSION})
            with urllib.request.urlopen(req, timeout=6) as r:
                info = json.loads(r.read().decode("utf-8"))
            newer = _vtuple(info.get("version", "0")) > _vtuple(VERSION)
            # notes：这一版干了啥，{"en": …, "zh": …}（0.4.0 起），界面照当前语言挑一句放在「有新版」下面
            self._update = {"newer": newer, "version": info.get("version"), "url": info.get("url") or PAGE_URL, "notes": info.get("notes")}
        except Exception:
            self._update = {"newer": False}
        return self._update

    def make_demo(self):
        """「用示例试试」：在临时文件夹里造一堆乱文件，一点就有东西可改可分。"""
        import datetime as dt
        import zipfile
        d = tempfile.mkdtemp(prefix=T("demo_dir"))
        for i in range(4):
            fs.make_jpeg_with_exif(os.path.join(d, f"IMG_{2041 + i}.JPG"), dt.datetime(2026, 7, 3 + i, 9, 30 + i), "iPhone 15")
        for n in T("demo_files").split("|"):
            with open(os.path.join(d, n), "w", encoding="utf-8") as f:
                f.write(n)
        with zipfile.ZipFile(os.path.join(d, T("demo_zip")), "w") as z:
            z.writestr(T("demo_zip_in"), T("demo_zip_in"))
        return self.check_folder(d)

    # ------------------------------------------------------------ 改名
    def rename_preview(self, folder, rules, opts=None):
        o = opts or {}
        p = rename.plan(folder, rules, recursive=bool(o.get("recursive")),
                        filt={"ext": o.get("ext", ""), "kw": o.get("kw", "")}, sort_by=o.get("sort", "name"))
        return p

    def rename_run(self, folder, rules, opts=None):
        with self._busy:
            p = self.rename_preview(folder, rules, opts)
            label = os.path.basename(folder)
            r = ops.execute(rename.to_ops(p), "rename", label)
        if r["done"]:
            self._remember_rename(rules, opts or {})
        return r  # 改了啥界面手里有（就是预览那张表），这里只回数和没动成的

    def _remember_rename(self, rules, opts):
        """改法记住：下回打开就是这套，最近 6 套留着一点换。"""
        rules = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rules]
        c = load_cfg()
        entry = {"rules": rules, "opts": {k: opts.get(k) for k in ("recursive", "ext", "kw", "sort") if k in opts}}
        key = _rules_key(rules)
        c["rename_last"] = entry
        c["rename_recent"] = [entry] + [e for e in c.get("rename_recent", []) if _rules_key(e["rules"]) != key][:5]
        save_cfg(c)

    def forget_rename(self, idx=None):
        c = load_cfg()
        if idx is None:
            c.pop("rename_last", None)
        else:
            rec = c.get("rename_recent", [])
            if 0 <= int(idx) < len(rec):
                gone = rec.pop(int(idx))
                if c.get("rename_last") and _rules_key(c["rename_last"]["rules"]) == _rules_key(gone["rules"]):
                    c.pop("rename_last", None)
            c["rename_recent"] = rec
        save_cfg(c)
        return {"last": c.get("rename_last"), "recent": c.get("rename_recent", [])}

    def save_rename_preset(self, name, rules):
        c = load_cfg()
        c["rename_presets"] = [x for x in c["rename_presets"] if x["name"] != name] + [{"name": name, "rules": rules}]
        save_cfg(c)
        return c["rename_presets"]

    def delete_rename_preset(self, name):
        c = load_cfg()
        c["rename_presets"] = [x for x in c["rename_presets"] if x["name"] != name]
        save_cfg(c)
        return c["rename_presets"]

    # ------------------------------------------------------------ 分文件夹
    def organize_preview(self, folder, scheme):
        return organize.plan(folder, scheme)

    def organize_run(self, folder, scheme):
        with self._busy:
            p = organize.plan(folder, scheme)
            r = ops.execute(organize.to_ops(p), "organize", scheme.get("name") or os.path.basename(folder),
                            meta={"folder": os.path.abspath(folder)})
        r["groups"] = p["groups"]
        if r["done"]:
            c = load_cfg()
            c["sort_last"] = scheme
            fsch = c.get("sort_by_folder", {})
            fsch[os.path.normcase(os.path.abspath(folder))] = scheme
            c["sort_by_folder"] = dict(list(fsch.items())[-30:])
            save_cfg(c)
        return r

    def retry(self, kind, folder, items):
        """「再试一次」：只把上回没动成的那几个照原计划再做一遍（不重算整个文件夹，免得改过的再改一遍、复制过的再复制）。"""
        folder = os.path.abspath(folder)
        todo = []
        for it in items or []:
            if kind == "rename":
                d = os.path.join(folder, it.get("rel") or "")
                todo.append({"src": os.path.join(d, it["old"]), "dst": os.path.join(d, it["new"])})
            else:
                dst_dir = os.path.join(folder, *it["to"].split("/")) if it.get("to") else folder
                op = {"src": os.path.join(folder, it["old"]), "dst": os.path.join(dst_dir, it["new"])}
                if it.get("op") in ("copy", "extract"):
                    op["mode"] = it["op"]
                todo.append(op)
        with self._busy:
            return ops.execute(todo, "rename" if kind == "rename" else "organize", os.path.basename(folder),
                               meta=None if kind == "rename" else {"folder": folder})

    def save_scheme(self, scheme):
        c = load_cfg()
        name = (scheme.get("name") or "").strip() or T("my_scheme")
        scheme["name"] = name
        c["schemes"] = [s for s in c["schemes"] if s["name"] != name] + [scheme]
        save_cfg(c)
        return c["schemes"]

    def delete_scheme(self, name):
        c = load_cfg()
        c["schemes"] = [s for s in c["schemes"] if s["name"] != name]
        save_cfg(c)
        return c["schemes"]

    # ------------------------------------------------------------ 撤销 / 记录
    def undo(self, batch_id=None):
        with self._busy:
            r = ops.undo(batch_id)
        if r.get("ok"):
            # 撤回原处的文件：盯着这个文件夹的别再把它分走（人刚说了不要）
            for w in list(self._watchers.values()):
                w.forgive(r.get("paths", []))
                for rec in w.log:
                    if rec.get("batch") == r["batch"]:
                        rec["undone"] = True
        return r

    def history(self):
        h = ops.history(30)
        for x in h:
            if x.get("kind") != "rename" and x.get("label"):
                x["label"] = organize.localize_name(x["label"])
        return h

    # ------------------------------------------------------------ 盯文件夹
    def _make_watcher(self, folder, scheme, include_existing=False, fresh=False):
        sp = _state_path(folder)
        if fresh and os.path.exists(sp):
            try:
                os.remove(sp)  # 人刚打开开关：从这一刻算，关着那阵来的不追究
            except OSError:
                pass
        w = watch.Watcher(folder, scheme, include_existing=bool(include_existing), state_path=sp,
                          on_done=self._on_watch_done)
        w.log = self._seed_log(folder)
        w.start()
        return w

    def _seed_log(self, folder) -> list[dict]:
        """重开程序后，盯着那页照样看得到之前自动分了啥（从账本里捞最近的）。"""
        out = []
        try:
            names = sorted(os.listdir(ops.history_dir()), reverse=True)[:400]
        except OSError:
            return out
        for n in names:
            j = fs.read_json(os.path.join(ops.history_dir(), n), None)
            if not j or j.get("kind") != "watch" or not _same(j.get("folder") or "?", folder):
                continue
            t = j.get("time", "")
            for r in j.get("ops", []):
                if r.get("state") not in ("done", "undone"):
                    continue
                rel = os.path.relpath(os.path.dirname(r["dst"]), folder)
                out.append({"time": t[11:19], "ts": t, "old": os.path.basename(r["src"]), "to": "" if rel == "." else rel.replace("\\", "/"),
                            "new": os.path.basename(r["dst"]), "op": r.get("mode") or "move", "ok": True,
                            "batch": j["id"], "undone": bool(j.get("undone"))})
            if len(out) >= 50:
                break
        return out[:50]

    def _on_watch_done(self, w, recs):
        now = _dt.datetime.now().isoformat(timespec="seconds")
        for r in recs:
            r.setdefault("ts", now)
        if self._notify:
            ok = [r for r in recs if r.get("ok")]
            if ok:
                dirs = []
                for r in ok:
                    if (r["to"] or ".") not in dirs:
                        dirs.append(r["to"] or ".")
                to = T("sep_list").join(d if d != "." else T("w_inplace") for d in dirs[:3])
                msg = T("n_one", name=ok[0]["old"], to=to) if len(ok) == 1 else T("n_many", name=ok[0]["old"], n=len(ok), more=len(ok) - 1, to=to)
                name = T("downloads_name") if _same(w.folder, fs.downloads_dir()) else (os.path.basename(w.folder) or w.folder)
                try:
                    self._notify(T("n_title", folder=name), msg)
                except Exception:
                    pass

    def watch_start(self, folder, scheme, include_existing=False):
        folder = os.path.abspath(folder)
        with self._wlock:
            old = self._watchers.pop(folder, None)
            if old:
                old.stop()
            self._watchers[folder] = self._make_watcher(folder, scheme, include_existing, fresh=True)
            c = load_cfg()
            c["watch"] = [x for x in c["watch"] if not _same(x["folder"], folder)] + [{"folder": folder, "scheme": scheme, "on": True}]
            c["intro"] = False
            save_cfg(c)
        return self.watch_status()

    def watch_set(self, folder, on):
        """开关：关了还留在单子上，一下就能再打开。"""
        folder = os.path.abspath(folder)
        with self._wlock:
            c = load_cfg()
            ent = next((x for x in c["watch"] if _same(x["folder"], folder)), None)
            if not ent:
                return self.watch_status()
            ent["on"] = bool(on)
            w = self._watchers.pop(folder, None)
            if w:
                w.stop()
            if on and os.path.isdir(fs.lp(folder)):
                self._watchers[folder] = self._make_watcher(folder, ent["scheme"], fresh=True)
            save_cfg(c)
        return self.watch_status()

    def watch_stop(self, folder):
        """从单子上拿掉。"""
        folder = os.path.abspath(folder)
        with self._wlock:
            w = self._watchers.pop(folder, None)
            if w:
                w.stop()
            c = load_cfg()
            c["watch"] = [x for x in c["watch"] if not _same(x["folder"], folder)]
            save_cfg(c)
        return self.watch_status()

    def watch_scheme(self, folder, scheme):
        """换分法：接着盯，不重算「见过的」。"""
        folder = os.path.abspath(folder)
        with self._wlock:
            c = load_cfg()
            for x in c["watch"]:
                if _same(x["folder"], folder):
                    x["scheme"] = scheme
            save_cfg(c)
            w = self._watchers.get(folder)
            if w:
                w.scheme = scheme
        return self.watch_status()

    def watch_resume(self):
        """开程序时把上次在盯的文件夹接着盯；程序关着那阵来的文件也补分（存了「见过的」）。"""
        with self._wlock:
            for x in load_cfg()["watch"]:
                f = os.path.abspath(x["folder"])
                if x.get("on", True) and os.path.isdir(fs.lp(f)) and f not in self._watchers:
                    self._watchers[f] = self._make_watcher(f, x["scheme"])
        return self.watch_status()

    def watch_status(self):
        today = _dt.date.today().isoformat()
        out = []
        for x in load_cfg()["watch"]:
            f = os.path.abspath(x["folder"])
            w = self._watchers.get(f)
            log = w.log[:50] if w else []
            out.append({"folder": f, "name": os.path.basename(f) or f, "scheme": organize.localize(x["scheme"]), "on": bool(w and w.running),
                        "exists": os.path.isdir(fs.lp(f)), "log": log,
                        "today": sum(1 for r in (w.log if w else []) if r.get("ok") and not r.get("undone") and (r.get("ts") or "").startswith(today)),
                        "count": sum(1 for r in (w.log if w else []) if r.get("ok"))})
        return out

    def stop_all(self):
        with self._wlock:
            for w in self._watchers.values():
                w.stop()
            self._watchers.clear()

    # ------------------------------------------------------------ 开机自启
    def autostart_set(self, on):
        c = load_cfg()
        c["autostart"] = bool(on)
        save_cfg(c)
        if not winsys.IS_WIN:
            return self._autostart(c)
        try:
            return {"supported": True, "on": winsys.set_autostart(bool(on))}
        except OSError:
            return {"supported": True, "on": winsys.autostart_enabled(), "err": "oserror"}

    # ------------------------------------------------------------ 下载
    def dl_start(self, text, folder, naming=None):
        urls = download.parse_urls(text)
        if not urls:
            return {"ok": False, "err": "nourl"}
        folder = os.path.abspath(folder)
        if not self._dl or self._dl.folder != folder or self._dl.status()["active"] == 0:
            self._dl = download.Downloader(folder, naming)
        else:
            self._dl.naming = naming or self._dl.naming
        self._dl.start(urls)
        c = load_cfg()
        c["dl"] = {"folder": folder, "naming": naming or {"mode": "keep"}}
        save_cfg(c)
        return {"ok": True, "n": len(urls)}

    def dl_status(self):
        return self._dl.status() if self._dl else None

    def dl_retry(self):
        return self._dl.retry_failed() if self._dl else 0

    def dl_cancel(self):
        if self._dl:
            self._dl.cancel()
        return True

    def dl_clear(self):
        if self._dl and self._dl.status()["active"] == 0:
            self._dl = None
        return True

    def preview_urls(self, text):
        return download.parse_urls(text)


def _vtuple(v):
    try:
        return tuple(int(x) for x in str(v).split("."))
    except ValueError:
        return (0,)
