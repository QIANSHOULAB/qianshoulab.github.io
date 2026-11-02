"""界面 <-> 核心 的桥。pywebview 把 Api 的方法暴露给 JS；开发时 devserver 用同一个类走 HTTP。

返回值一律是能转 JSON 的 dict/list；错误用代号（err），文案在 ui/strings.js 统一管。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import urllib.request

from . import VERSION
from . import fsutil as fs
from . import ops, rename, organize, watch, download

UPDATE_URL = "https://qianshoulab.github.io/saodi/version.json"
PAGE_URL = "https://qianshoulab.github.io/saodi/"


def _cfg_path():
    return os.path.join(fs.home_dir(), "config.json")


def load_cfg() -> dict:
    c = fs.read_json(_cfg_path(), {})
    c.setdefault("schemes", [])
    c.setdefault("rename_presets", [])
    c.setdefault("recent", [])
    return c


def save_cfg(c: dict) -> None:
    fs.write_json(_cfg_path(), c)


class Api:
    def __init__(self):
        self._window = None  # pywebview 窗口，开发服务器下为 None
        self._watchers: dict[str, watch.Watcher] = {}
        self._dl: download.Downloader | None = None
        self._busy = threading.Lock()
        self._update = None

    # ------------------------------------------------------------ 基本
    def hello(self):
        c = load_cfg()
        return {
            "version": VERSION, "platform": sys.platform, "cfg": c,
            "presets": organize.PRESETS, "types": [t[0] for t in organize.TYPES],
            "date_formats": list(rename.DATE_FORMATS), "dir_formats": list(organize.DATE_DIRS),
            "downloads": os.path.join(os.path.expanduser("~"), "Downloads"),
        }

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
        c["recent"] = [path] + [p for p in c["recent"] if p != path][:7]
        save_cfg(c)
        return {"ok": True, "path": path, "name": os.path.basename(path) or path}

    def open_path(self, path: str):
        try:
            if fs.IS_WIN:
                os.startfile(path)  # noqa
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
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
            self._update = {"newer": newer, "version": info.get("version"), "url": info.get("url") or PAGE_URL}
        except Exception:
            self._update = {"newer": False}
        return self._update

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
            return ops.execute(rename.to_ops(p), "rename", label)

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
            return ops.execute(organize.to_ops(p), "organize", scheme.get("name") or os.path.basename(folder))

    def save_scheme(self, scheme):
        c = load_cfg()
        name = (scheme.get("name") or "").strip() or "我的方案"
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
            return ops.undo(batch_id)

    def history(self):
        return ops.history(30)

    # ------------------------------------------------------------ 盯文件夹
    def watch_start(self, folder, scheme, include_existing=False):
        folder = os.path.abspath(folder)
        self.watch_stop(folder)
        w = watch.Watcher(folder, scheme, include_existing=bool(include_existing))
        w.start()
        self._watchers[folder] = w
        c = load_cfg()
        c["watch"] = [x for x in c.get("watch", []) if x["folder"] != folder] + [{"folder": folder, "scheme": scheme}]
        save_cfg(c)
        return self.watch_status()

    def watch_stop(self, folder):
        folder = os.path.abspath(folder)
        w = self._watchers.pop(folder, None)
        if w:
            w.stop()
        c = load_cfg()
        c["watch"] = [x for x in c.get("watch", []) if x["folder"] != folder]
        save_cfg(c)
        return self.watch_status()

    def watch_resume(self):
        """开程序时把上次在盯的文件夹接着盯（只盯新来的）。"""
        for x in load_cfg().get("watch", []):
            if os.path.isdir(fs.lp(x["folder"])) and x["folder"] not in self._watchers:
                w = watch.Watcher(x["folder"], x["scheme"])
                w.start()
                self._watchers[x["folder"]] = w
        return self.watch_status()

    def watch_status(self):
        return [{"folder": f, "name": os.path.basename(f) or f, "scheme": w.scheme, "running": w.running,
                 "since": w.started, "log": w.log[:50],
                 "count": sum(1 for r in w.log if r.get("ok"))} for f, w in self._watchers.items()]

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
