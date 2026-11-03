"""盯着文件夹：每隔几秒看一眼，新来的文件等它「落稳」后按方案处理。

用轮询而不是系统通知：网盘同步盘、U 盘、网络盘都靠得住，代码也短。

落稳 = 两次看大小、修改时间都不变 + 能独占打开（Windows 上有人开着就打不开）
       + 不是 0 字节（Firefox 开下时先放个同名空占位）+ 旁边没有 name.part / name.crdownload / name.aria2 这类还在下的兄弟。
下载中的 .part/.crdownload、隐藏文件、~$ 临时文件根本不进名单（fsutil.is_skipped / is_hidden_stat）。

记性（0.3.0）：
- 第一次盯：那一刻已经在的文件不碰（除非 include_existing），只管新来的。
- 带 state_path 时把「见过的」存盘：程序关着时来的文件，下次一开就补分；
- 自己挪走过的文件（认文件身份 st_dev:st_ino，改名挪动都不变）又回到这里 —— 多半是撤销了或者人挪回来的 —— 不再动它。
"""
from __future__ import annotations

import datetime as _dt
import os
import threading
import time

from . import fsutil as fs
from . import ops
from . import organize

STATE_VER = 1
MAX_SEEN = 20000
MAX_MOVED = 20000


def _ident(st) -> str | None:
    ino = getattr(st, "st_ino", 0)
    if not ino:
        return None  # 有的网络盘给不出文件身份，就不认身份
    return f"{st.st_dev}:{ino}"


class Watcher:
    def __init__(self, folder: str, scheme: dict, interval: float = 2.0, include_existing: bool = False,
                 state_path: str | None = None, on_done=None):
        self.folder = os.path.abspath(folder)
        self.scheme = scheme
        self.interval = interval
        self.state_path = state_path
        self.on_done = on_done
        self.log: list[dict] = []
        self._seen: dict[str, tuple | None] = {}
        self._moved: dict[str, float] = {}
        self._pending: dict[str, tuple] = {}
        self._failed: set[str] = set()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._dirty = False
        self.started = _dt.datetime.now().isoformat(timespec="seconds")
        loaded = (not include_existing) and self._load()
        if not loaded and not include_existing:
            for f in self._snapshot()[0].values():
                self._seen[f["name"]] = (f["size"], f["mtime"])
            self._dirty = True
        self.save()

    # ------------------------------------------------------------ 存盘
    def _load(self) -> bool:
        if not self.state_path:
            return False
        st = fs.read_json(self.state_path, None)
        if not st or st.get("v") != STATE_VER or os.path.normcase(st.get("folder", "")) != os.path.normcase(self.folder):
            return False
        self._seen = {k: (tuple(v) if v else None) for k, v in st.get("seen", {}).items()}
        self._moved = dict(st.get("moved", {}))
        return True

    def save(self, force: bool = False) -> None:
        if not self.state_path or not (self._dirty or force):
            return
        if len(self._seen) > MAX_SEEN:
            self._seen = dict(list(self._seen.items())[-MAX_SEEN:])
        if len(self._moved) > MAX_MOVED:
            self._moved = dict(sorted(self._moved.items(), key=lambda kv: kv[1])[-MAX_MOVED:])
        try:
            fs.write_json(self.state_path, {"v": STATE_VER, "folder": self.folder,
                                            "seen": {k: list(v) if v else None for k, v in self._seen.items()},
                                            "moved": self._moved})
            self._dirty = False
        except OSError:
            pass

    # ------------------------------------------------------------ 看一眼
    def _snapshot(self) -> tuple[dict[str, dict], set[str]]:
        """返回（名单里的文件，文件夹里所有名字的小写 —— 含下载中、临时的，用来认「还没下完」）。"""
        from .rename import list_files
        try:
            every = {n.lower() for n in os.listdir(fs.lp(self.folder))}
        except OSError:
            every = set()
        out = {}
        for f in list_files(self.folder, False):
            try:  # Windows 目录列表里的大小会滞后，直接 stat 文件本身才准
                st = os.stat(fs.lp(f["path"]))
            except OSError:
                continue
            f["size"], f["mtime"], f["ident"] = st.st_size, st.st_mtime, _ident(st)
            out[f["name"]] = f
        return out, every

    def _openable(self, path: str) -> bool:
        if fs.in_use(path):
            return False
        try:
            with open(fs.lp(path), "rb+"):
                return True
        except OSError:
            return False

    def forgive(self, paths: list[str]) -> None:
        """撤销把文件放回这个文件夹了：记成见过，别再分走（人刚说了不要）。"""
        for p in paths:
            if os.path.normcase(os.path.dirname(os.path.abspath(p))) != os.path.normcase(self.folder):
                continue
            try:
                st = os.stat(fs.lp(p))
            except OSError:
                continue
            self._seen[os.path.basename(p)] = (st.st_size, st.st_mtime)
            ident = _ident(st)
            if ident:
                self._moved[ident] = time.time()
            self._pending.pop(os.path.basename(p), None)
            self._dirty = True
        self.save()

    def tick(self) -> list[dict]:
        """看一眼，处理落稳的新文件。返回这次处理的记录（测试直接调这个，不用线程）。"""
        snap, every = self._snapshot()
        ready = []
        for name, f in snap.items():
            sig = (f["size"], f["mtime"])
            if self._seen.get(name) == sig:
                continue
            if f["ident"] and f["ident"] in self._moved:
                # 贫僧挪走过的又回来了（撤销 / 人挪回来的）：不再动
                self._seen[name] = sig
                self._dirty = True
                continue
            if f["size"] == 0 or fs.in_progress(name, every):
                self._pending.pop(name, None)  # 占位或者还在下：等下完再说
                continue
            if self._pending.get(name) == sig and self._openable(f["path"]):
                ready.append(f)
            else:
                self._pending[name] = sig
        if not ready:
            self.save()
            return []
        p = organize.plan(self.folder, self.scheme, files=ready)
        todo = organize.to_ops(p)
        res = ops.execute(todo, "watch", self.scheme.get("name", ""), meta={"folder": self.folder}) if todo else None
        done = []
        now = _dt.datetime.now().strftime("%H:%M:%S")
        failed = {x["name"] for x in (res or {}).get("failed", [])}
        by_name = {f["name"]: f for f in ready}
        for it in p["items"]:
            self._pending.pop(it["old"], None)
            if it["status"] == "same":
                self._seen[it["old"]] = (snap[it["old"]]["size"], snap[it["old"]]["mtime"])
                self._dirty = True
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
                ident = (by_name.get(it["old"]) or {}).get("ident")
                if ident and rec["op"] == "move":
                    self._moved[ident] = time.time()
                    self._dirty = True
            done.append(rec)
        # 原地改名后的新名字、复制/解压后还留在原地的原件，都算见过，免得再处理一遍
        for r in done:
            if r["ok"] and not r["to"] and r["op"] == "move":
                self._seen[r["new"]] = None
            if r["ok"] and r["op"] in ("copy", "extract"):
                self._seen[r["old"]] = None
        if any(v is None for v in self._seen.values()):
            snap2 = self._snapshot()[0]
            for name in list(self._seen):
                if self._seen[name] is None:
                    f = snap2.get(name)
                    self._seen[name] = (f["size"], f["mtime"]) if f else ("gone",)
            self._dirty = True
        self.log = (done[::-1] + self.log)[:300]
        self.save()
        if done and self.on_done:
            try:
                self.on_done(self, done)
            except Exception:
                pass
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
        self.save(force=True)

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())
