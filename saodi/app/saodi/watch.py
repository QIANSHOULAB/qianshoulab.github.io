"""盯着文件夹：每隔几秒看一眼，新来的文件等它「落稳」（大小两次不变、能打开）后按方案处理。

用轮询而不是系统通知：网盘同步盘、U 盘、网络盘都靠得住，代码也短。
开盯那一刻已经在的文件不碰（除非 include_existing），只处理新来的。
"""
from __future__ import annotations

import datetime as _dt
import os
import threading
import time

from . import fsutil as fs
from . import ops
from . import organize


class Watcher:
    def __init__(self, folder: str, scheme: dict, interval: float = 2.0, include_existing: bool = False):
        self.folder = os.path.abspath(folder)
        self.scheme = scheme
        self.interval = interval
        self.log: list[dict] = []
        self._seen: dict[str, tuple] = {}
        self._pending: dict[str, tuple] = {}
        self._failed: set[str] = set()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.started = _dt.datetime.now().isoformat(timespec="seconds")
        if not include_existing:
            for f in self._snapshot().values():
                self._seen[f["name"]] = (f["size"], f["mtime"])

    def _snapshot(self) -> dict[str, dict]:
        from .rename import list_files
        out = {}
        for f in list_files(self.folder, False):
            try:  # Windows 目录列表里的大小会滞后，直接 stat 文件本身才准
                st = os.stat(fs.lp(f["path"]))
                f["size"], f["mtime"] = st.st_size, st.st_mtime
            except OSError:
                continue
            out[f["name"]] = f
        return out

    def _openable(self, path: str) -> bool:
        if fs.in_use(path):
            return False
        try:
            with open(fs.lp(path), "rb+"):
                return True
        except OSError:
            return False

    def tick(self) -> list[dict]:
        """看一眼，处理落稳的新文件。返回这次处理的记录（测试直接调这个，不用线程）。"""
        snap = self._snapshot()
        ready = []
        for name, f in snap.items():
            sig = (f["size"], f["mtime"])
            if self._seen.get(name) == sig:
                continue
            if self._pending.get(name) == sig and self._openable(f["path"]):
                ready.append(f)
            else:
                self._pending[name] = sig
        if not ready:
            return []
        p = organize.plan(self.folder, self.scheme, files=ready)
        todo = organize.to_ops(p)
        res = ops.execute(todo, "watch", self.scheme.get("name", "")) if todo else None
        done = []
        now = _dt.datetime.now().strftime("%H:%M:%S")
        failed = {x["name"] for x in (res or {}).get("failed", [])}
        for it in p["items"]:
            self._pending.pop(it["old"], None)
            if it["status"] == "same":
                self._seen[it["old"]] = (snap[it["old"]]["size"], snap[it["old"]]["mtime"])
                continue
            rec = {"time": now, "old": it["old"], "to": it["to"], "new": it["new"], "op": it.get("op", "move"),
                   "ok": it["old"] not in failed, "batch": res["batch"] if res else None}
            if not rec["ok"]:
                # 没挪动（多半被占用）：不记成见过，下一轮再试；同一个文件只报一次
                if it["old"] in self._failed:
                    continue
                self._failed.add(it["old"])
            else:
                self._failed.discard(it["old"])
            done.append(rec)
        # 原地改名后的新名字、复制/解压后还留在原地的原件，都算见过，免得再处理一遍
        for r in done:
            if r["ok"] and not r["to"] and r["op"] == "move":
                self._seen[r["new"]] = None
            if r["ok"] and r["op"] in ("copy", "extract"):
                self._seen[r["old"]] = None
        for name in list(self._seen):
            if self._seen[name] is None:
                f = self._snapshot().get(name)
                self._seen[name] = (f["size"], f["mtime"]) if f else ("gone",)
        self.log = (done[::-1] + self.log)[:300]
        return done

    def _loop(self):
        while not self._stop.wait(self.interval):
            try:
                self.tick()
            except Exception as e:  # 盯梢线程不能死
                self.log.insert(0, {"time": time.strftime("%H:%M:%S"), "old": "", "err": str(e), "ok": False})

    def start(self):
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())
