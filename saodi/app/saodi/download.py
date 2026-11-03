"""批量下载：一串网址 -> 指定文件夹。断点续传（.part + Range）、失败自动重试、按规则命名。

只用标准库 urllib；系统代理（环境变量）自动生效。
命名规则：
  {"mode": "keep"}                       用网站给的名字
  {"mode": "number", "prefix": "", "digits": 3, "start": 1}   001-原名
  {"mode": "custom", "text": "合同", "digits": 2}            合同-01.pdf
"""
from __future__ import annotations

import email.message
import http.client
import mimetypes
import os
import re
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from . import fsutil as fs
from . import VERSION
from . import text as _text

UA = f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Saodi/{VERSION}"
CHUNK = 1024 * 1024


def parse_urls(text: str) -> list[str]:
    """从一坨文字里抠网址：一行一个、空格逗号分隔、混着中文都行。去重保序。"""
    seen, out = set(), []
    for u in re.findall(r"https?://[^\s,，;；<>\"'）)】]+", text or ""):
        u = u.rstrip(".。、")
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def normalize_url(url: str) -> str:
    """网址里的中文、空格转成 %xx，中文域名转 punycode（urllib 只认 ASCII）。"""
    parts = urllib.parse.urlsplit(url.strip())
    host = parts.hostname or ""
    try:
        host_a = host.encode("idna").decode("ascii")
    except UnicodeError:
        host_a = host
    netloc = parts.netloc.replace(host, host_a) if host else parts.netloc
    safe = "/%:@!$&'()*+,;=~-._"
    return urllib.parse.urlunsplit((parts.scheme, netloc, urllib.parse.quote(parts.path, safe=safe),
                                    urllib.parse.quote(parts.query, safe=safe + "?"), ""))


def name_from(url: str, headers) -> str:
    cd = headers.get("Content-Disposition", "") if headers else ""
    name = ""
    if cd:
        m = re.search(r"filename\*\s*=\s*([^']*)'[^']*'([^;]+)", cd, re.I)
        if m:
            name = urllib.parse.unquote(m.group(2).strip().strip('"'), encoding=m.group(1) or "utf-8", errors="replace")
        else:
            msg = email.message.Message()
            msg["content-disposition"] = cd
            name = msg.get_filename() or ""
    if not name:
        name = urllib.parse.unquote(os.path.basename(urllib.parse.urlsplit(url).path))
    name = fs.sanitize(name) or "download"
    if not fs.split_ext(name)[1] and headers:
        ct = (headers.get("Content-Type") or "").split(";")[0].strip()
        ext = mimetypes.guess_extension(ct) if ct else None
        if ext and ext != ".bin":
            name += ext
    return name


class Item:
    def __init__(self, idx: int, url: str):
        self.idx, self.url = idx, url
        self.name = ""          # 最终文件名
        self.state = "wait"     # wait / run / retry / done / failed / cancel
        self.got = 0
        self.total = 0
        self.tries = 0
        self.fresh = 0          # 这一次连接收到的字节
        self.alive = False      # 这一次服务器回过话（有响应头）
        self.quick = 0          # 立刻续传用掉的次数
        self.err = ""
        self.path = ""

    def view(self):
        return {"i": self.idx, "url": self.url, "name": self.name, "state": self.state,
                "got": self.got, "total": self.total, "tries": self.tries, "err": self.err}


class Downloader:
    def __init__(self, folder: str, naming: dict | None = None, workers: int = 3,
                 retries: int = 4, backoff: tuple = (0.3, 1, 3, 6), timeout: float = 20,
                 quick: int = 30):
        self.folder = os.path.abspath(folder)
        self.naming = naming or {"mode": "keep"}
        self.workers, self.retries, self.backoff, self.timeout = workers, retries, backoff, timeout
        self.quick = quick  # 断线前收到过新数据：立刻带 Range 续，不等、不算重试次数（上限防死循环）
        self.items: list[Item] = []
        self._cancel = threading.Event()
        self._lock = threading.Lock()
        self._pool: ThreadPoolExecutor | None = None
        os.makedirs(fs.lp(self.folder), exist_ok=True)

    # ---------------------------------------------------------- 命名
    def _final_name(self, it: Item, server_name: str) -> str:
        n = self.naming
        mode = n.get("mode", "keep")
        stem, ext = fs.split_ext(server_name)
        if mode == "number":
            k = int(n.get("start", 1)) + it.idx
            name = f"{n.get('prefix', '')}{str(k).zfill(int(n.get('digits', 3)))}-{server_name}"
        elif mode == "custom":
            k = int(n.get("start", 1)) + it.idx
            name = f"{n.get('text') or _text.T('dl_file')}-{str(k).zfill(int(n.get('digits', 2)))}{ext}"
        else:
            name = server_name
        return fs.sanitize(name) or server_name

    def _claim(self, it: Item, wanted: str) -> str:
        """抢一个不撞名的名字（同批其他下载、文件夹里已有的都算）。续传时同一网址沿用 .part。"""
        with self._lock:
            taken = fs.names_in(self.folder)
            for o in self.items:
                if o is not it and o.name:
                    taken.add(o.name.casefold())
            # 已有同名 .part（上次没下完）→ 直接续上
            if os.path.exists(fs.lp(os.path.join(self.folder, wanted + ".part"))) and wanted.casefold() not in {o.name.casefold() for o in self.items if o is not it}:
                return wanted
            taken |= {x[:-5] for x in taken if x.endswith(".part")}
            return fs.bump(wanted, taken)

    # ---------------------------------------------------------- 下载一个
    def _fetch(self, it: Item) -> None:
        part = os.path.join(self.folder, it.name + ".part") if it.name else None
        have = os.path.getsize(fs.lp(part)) if part and os.path.exists(fs.lp(part)) else 0
        req = urllib.request.Request(normalize_url(it.url), headers={"User-Agent": UA, "Accept-Encoding": "identity"})
        if have:
            req.add_header("Range", f"bytes={have}-")
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            status = resp.status
            it.alive = True
            if not it.name:
                it.name = self._claim(it, self._final_name(it, name_from(it.url, resp.headers)))
                part = os.path.join(self.folder, it.name + ".part")
                have = os.path.getsize(fs.lp(part)) if os.path.exists(fs.lp(part)) else 0
                if have:  # 有残片但这次请求没带 Range：重新带着 Range 来一次
                    raise _Resume()
            length = resp.headers.get("Content-Length")
            if status == 206:
                m = re.search(r"/(\d+)", resp.headers.get("Content-Range", ""))
                it.total = int(m.group(1)) if m else have + int(length or 0)
                mode = "ab"
            else:
                have = 0
                it.total = int(length) if length else 0
                mode = "wb"
            it.got = have
            it.fresh = 0
            with open(fs.lp(part), mode) as f:
                while True:
                    if self._cancel.is_set():
                        it.state = "cancel"
                        return
                    try:
                        buf = resp.read(CHUNK)
                    except http.client.IncompleteRead as e:  # 断线：已到手的半截先落盘，好接着续
                        f.write(e.partial)
                        it.got += len(e.partial)
                        it.fresh += len(e.partial)
                        raise ConnectionError("cut") from None
                    if not buf:
                        break
                    f.write(buf)
                    it.got += len(buf)
                    it.fresh += len(buf)
        if it.total and it.got < it.total:
            raise ConnectionError("short")
        final = os.path.join(self.folder, it.name)
        if os.path.exists(fs.lp(final)):  # 下的过程中有人放了同名文件 → 换个名，不覆盖
            with self._lock:
                it.name = fs.bump(it.name, fs.names_in(self.folder))
                final = os.path.join(self.folder, it.name)
        os.rename(fs.lp(part), fs.lp(final))
        it.path = final
        it.state = "done"
        it.total = it.total or it.got

    def _run_one(self, it: Item) -> None:
        while not self._cancel.is_set():
            it.tries += 1
            it.fresh, it.alive = 0, False
            it.state = "run"
            try:
                self._fetch(it)
                return
            except _Resume:
                it.tries -= 1
                continue
            except urllib.error.HTTPError as e:
                it.err = f"HTTP {e.code}"
                if e.code == 416 and it.name:  # 残片比文件还大/已完整：丢掉残片的说法不成立，改名为成品
                    part = os.path.join(self.folder, it.name + ".part")
                    if os.path.exists(fs.lp(part)):
                        fs.to_trash(part)
                    continue
                if e.code in (400, 401, 403, 404, 410):
                    it.state = "failed"
                    return
            except (urllib.error.URLError, socket.timeout, ConnectionError, OSError, EOFError) as e:
                it.err = _short(e)
            except Exception as e:  # http.client.IncompleteRead 等
                it.err = _short(e)
            if it.fresh and it.quick < self.quick:
                # 断之前收到过数据：服务器是活的，马上续（.part 在，下一次自动带 Range）
                it.quick += 1
                it.tries -= 1
                it.fresh = 0
                it.state = "retry"
                continue
            if it.tries > self.retries:
                it.state = "failed"
                return
            it.state = "retry"
            if it.alive:  # 服务器回了话才断：多半是线路抖，马上再连（算一次重试）
                continue
            b = self.backoff
            wait = b[min(it.tries - 1, len(b) - 1)] if isinstance(b, (tuple, list)) else b * (2 ** (it.tries - 1))
            if self._cancel.wait(wait):
                break
        if it.state != "done":
            it.state = "cancel"

    # ---------------------------------------------------------- 对外
    def start(self, urls: list[str]) -> None:
        base = len(self.items)
        new = [Item(base + i, u) for i, u in enumerate(urls)]
        self.items.extend(new)
        self._cancel.clear()
        if not self._pool:
            self._pool = ThreadPoolExecutor(max_workers=self.workers)
        for it in new:
            self._pool.submit(self._run_one, it)

    def retry_failed(self) -> int:
        bad = [it for it in self.items if it.state in ("failed", "cancel")]
        self._cancel.clear()
        if not self._pool:
            self._pool = ThreadPoolExecutor(max_workers=self.workers)
        for it in bad:
            it.tries, it.quick, it.err, it.state = 0, 0, "", "wait"
            self._pool.submit(self._run_one, it)
        return len(bad)

    def cancel(self) -> None:
        self._cancel.set()

    def wait(self, timeout: float = 60) -> bool:
        end = time.time() + timeout
        while time.time() < end:
            if all(it.state in ("done", "failed", "cancel") for it in self.items):
                return True
            time.sleep(0.05)
        return False

    def status(self) -> dict:
        items = [it.view() for it in self.items]
        return {
            "folder": self.folder, "items": items,
            "done": sum(1 for x in items if x["state"] == "done"),
            "failed": sum(1 for x in items if x["state"] == "failed"),
            "active": sum(1 for x in items if x["state"] in ("wait", "run", "retry")),
        }


class _Resume(Exception):
    pass


def _short(e: BaseException) -> str:
    s = getattr(e, "reason", None) or e
    return (type(e).__name__ + ": " + str(s))[:120]
