"""自动更新：读 version.json → 后台下载新 exe（核对 sha256）→ 下次启动（或点「重启」）时换掉自己再起来。

version.json 和 Zhike.exe 一起挂在 GitHub release「zhike-latest」上，CI 打包完才一起传，
所以 version.json 说有新版的时候，exe 一定已经在了。只 GET，不上传任何东西。

换自己的办法（Windows 上正在跑的 exe 不能覆盖，但能改名）：
  Zhike.exe → Zhike.exe.old，Zhike.exe.new → Zhike.exe，起新的，旧的退出；新的起来后删掉 .old。
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from . import VERSION

BASE = "https://github.com/QIANSHOULAB/qianshoulab.github.io/releases/download/zhike-latest/"
VERSION_URL = BASE + "version.json"
PAGE = "https://qianshoulab.github.io/zhike/"


def _v(s):
    return tuple(int(x) for x in re.findall(r"\d+", s or "")[:3])


def exe_path() -> Path | None:
    """打包后的 exe 才能自己换自己；python 源码跑的时候返回 None。"""
    if getattr(sys, "frozen", False):
        return Path(sys.executable)
    return None


def _get(url, timeout):
    req = urllib.request.Request(url, headers={"User-Agent": f"zhike/{VERSION}", "Cache-Control": "no-cache"})
    return urllib.request.urlopen(req, timeout=timeout)


def check(timeout=8, url=None):
    try:
        with _get(url or os.environ.get("ZHIKE_UPDATE_URL") or VERSION_URL, timeout) as r:
            info = json.loads(r.read().decode())
        latest = str(info.get("version", ""))
        if not re.fullmatch(r"\d+\.\d+\.\d+", latest):
            return None
        return {"latest": latest, "current": VERSION, "newer": _v(latest) > _v(VERSION), "url": PAGE,
                "exe": info.get("url") or BASE + "Zhike.exe", "sha256": (info.get("sha256") or "").lower(),
                "size": int(info.get("size") or 0), "can_self": exe_path() is not None}
    except Exception:
        return None


def _new(exe: Path) -> Path:
    return exe.with_name(exe.name + ".new")


def _marker(exe: Path) -> Path:
    return exe.with_name(exe.name + ".new.json")


def _sha(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for buf in iter(lambda: f.read(1 << 20), b""):
            h.update(buf)
    return h.hexdigest()


def download(info: dict, exe: Path | None = None, timeout=60) -> bool:
    """下到 Zhike.exe.new，核对 sha256，写一个小标记文件。成功返回 True。"""
    exe = exe or exe_path()
    if not exe or not info or not info.get("newer") or not info.get("sha256"):
        return False
    mk = _marker(exe)
    try:
        old = json.loads(mk.read_text("utf-8"))
        if old.get("version") == info["latest"] and _new(exe).exists() and _sha(_new(exe)) == old.get("sha256"):
            return True      # 已经下好了
    except Exception:
        pass
    part = exe.with_name(exe.name + ".part")
    h = hashlib.sha256()
    try:
        with _get(info["exe"], timeout) as r, open(part, "wb") as f:
            while True:
                buf = r.read(1 << 16)
                if not buf:
                    break
                f.write(buf)
                h.update(buf)
        if h.hexdigest() != info["sha256"]:
            part.unlink(missing_ok=True)
            return False
        os.replace(part, _new(exe))
        mk.write_text(json.dumps({"version": info["latest"], "sha256": info["sha256"]}), "utf-8")
        return True
    except Exception:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        return False


def pending(exe: Path | None = None):
    """下好、比现在新的版本号；没有返回 None。"""
    exe = exe or exe_path()
    if not exe:
        return None
    try:
        mk = json.loads(_marker(exe).read_text("utf-8"))
    except Exception:
        return None
    if _v(mk.get("version")) > _v(VERSION) and _new(exe).exists():
        return mk.get("version")
    return None


def swap(exe: Path) -> bool:
    """把 .new 换上来（再核一遍 sha256）。返回 True = 换好了，该重启。"""
    new, mk = _new(exe), _marker(exe)
    try:
        want = json.loads(mk.read_text("utf-8")).get("sha256")
        if not want or _sha(new) != want:
            raise ValueError("bad sha")
    except Exception:
        for p in (new, mk):
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass
        return False
    old = exe.with_name(exe.name + ".old")
    try:
        old.unlink(missing_ok=True)
    except OSError:
        old = exe.with_name(exe.name + f".{int(time.time())}.old")
    try:
        os.replace(exe, old)
    except OSError:
        return False
    try:
        os.replace(new, exe)
    except OSError:
        os.replace(old, exe)      # 换不上就退回去，照旧跑
        return False
    try:
        mk.unlink(missing_ok=True)
    except OSError:
        pass
    return True


def relaunch(exe: Path, args: list):
    """起新的 exe，带上旧进程的 pid 让它等旧的退干净。"""
    env = dict(os.environ)
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"   # 新进程别复用旧进程解压出来的临时目录
    flags = 0
    if sys.platform == "win32":
        flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    subprocess.Popen([str(exe), *args, "--wait-pid", str(os.getpid())], env=env, close_fds=True, creationflags=flags)


def apply_pending(args: list) -> bool:
    """启动时调用：有下好的新版就换上、重启，返回 True（调用方直接退出）。"""
    exe = exe_path()
    if not exe or not pending(exe):
        return False
    if not swap(exe):
        return False
    relaunch(exe, args)
    return True


def cleanup(args: list):
    """新版起来后：等旧进程退出，删掉 .old。会把 args 里的 --wait-pid N 拿掉。"""
    if "--wait-pid" in args:
        i = args.index("--wait-pid")
        try:
            wait_pid(int(args[i + 1]))
        except (IndexError, ValueError):
            pass
        del args[i:i + 2]
    exe = exe_path()
    if not exe:
        return
    olds = list(exe.parent.glob(exe.name + "*.old"))
    if not olds:
        return

    def sweep(tries):
        for p in olds:
            for _ in range(tries):
                try:
                    p.unlink(missing_ok=True)
                    break
                except OSError:
                    time.sleep(0.3)

    sweep(10)
    if any(p.exists() for p in olds):     # 旧进程的外壳还没松手：后台再等一分钟，不耽误启动
        import threading
        threading.Thread(target=sweep, args=(200,), daemon=True).start()


def wait_pid(pid: int, timeout=15):
    if sys.platform == "win32":
        import ctypes
        k = ctypes.windll.kernel32
        h = k.OpenProcess(0x00100000, False, pid)    # SYNCHRONIZE
        if h:
            k.WaitForSingleObject(h, int(timeout * 1000))
            k.CloseHandle(h)
        return
    end = time.time() + timeout
    while time.time() < end:
        try:
            os.kill(pid, 0)
        except OSError:
            return
        time.sleep(0.2)
