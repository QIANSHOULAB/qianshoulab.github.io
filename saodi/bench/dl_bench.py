"""下载比武：本地 http 服务造一批刁钻网址，跑扫地僧的下载器或 aria2c，对答案。
用法：python dl_bench.py <输出目录> saodi|aria2
网址（52 个）：
  30 个普通文件 /f/<n>.bin（10KB-2MB）
   5 个 404
   3 个「中途断线」：前 2 次请求只给一半就断（声明了完整长度），支持 Range
   1 个 60MB 大文件：第 1 次给到 40% 就断，支持 Range（看客户端是不是带 Range 续，而不是从头）
   1 个不支持续传的 6MB：第 1 次给一半就断，之后每次都回 200 全量（客户端得从头下，不能拼坏）
   5 个文件名只在 Content-Disposition 里（filename*=UTF-8''合同N.pdf）
   5 个中文网址 /资料/报告N.docx（原样贴中文，不预先转码）
   2 个不同网址同名 /dup/a/report.pdf /dup/b/report.pdf（两个都得留着）
标准答案：每个网址 → 期望文件名 + 内容 sha256；404 → 不该留下文件、要报失败。"""
from __future__ import annotations

import hashlib
import json
import os
import random
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))


def blob(key: str, size: int) -> bytes:
    return random.Random(key).randbytes(size)


FILES = {}      # 路径 -> (内容, 期望名, 选项)
for n in range(30):
    FILES[f"/f/{n}.bin"] = (blob(f"f{n}", random.Random(n).randrange(10_000, 2_000_000)), f"{n}.bin", {})
for n in range(3):
    FILES[f"/drop/drop{n}.bin"] = (blob(f"d{n}", 800_000), f"drop{n}.bin", {"drop": 2})
FILES["/big.iso"] = (blob("big", 60_000_000), "big.iso", {"drop": 1, "frac": 0.4})
FILES["/norange.bin"] = (blob("nr", 6_000_000), "norange.bin", {"drop": 1, "frac": 0.5, "norange": True})
for n in range(5):
    FILES[f"/cd/{n}"] = (blob(f"c{n}", 50_000), f"合同{n}.pdf", {"cd": f"合同{n}.pdf"})
for n in range(5):
    FILES[f"/资料/报告{n}.docx"] = (blob(f"z{n}", 70_000), f"报告{n}.docx", {})
FILES["/dup/a/report.pdf"] = (blob("dupa", 30_000), "report.pdf", {})
FILES["/dup/b/report.pdf"] = (blob("dupb", 31_000), "report.pdf", {})
# 期望名：有 Content-Disposition 用它，没有就是网址最后一段
FILES = {p: (c, (urllib.parse.unquote(p.rsplit("/", 1)[1]) if not o.get("cd") else n), o) for p, (c, n, o) in FILES.items()}
MISSING = [f"/gone/{n}.pdf" for n in range(5)]
HITS: dict[str, list[str]] = {}
LOCK = threading.Lock()


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_GET(self):
        path = urllib.parse.unquote(self.path.split("?")[0])
        rng = self.headers.get("Range", "")
        with LOCK:
            HITS.setdefault(path, []).append(rng or "-")
            k = len(HITS[path])
        if path not in FILES:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        data, name, o = FILES[path]
        start = 0
        m = re.match(r"bytes=(\d+)-", rng)
        if m and not o.get("norange"):
            start = int(m.group(1))
        if start:
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{len(data) - 1}/{len(data)}")
        else:
            self.send_response(200)
        self.send_header("Content-Length", str(len(data) - start))
        self.send_header("Content-Type", "application/octet-stream")
        if not o.get("norange"):
            self.send_header("Accept-Ranges", "bytes")
        if o.get("cd"):
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(o["cd"]))
        self.end_headers()
        body = data[start:]
        if k <= o.get("drop", 0):
            cut = int(len(data) * o.get("frac", 0.5)) - start
            if cut > 0:
                self.wfile.write(body[:cut])
                self.wfile.flush()
            self.close_connection = True
            try:
                self.connection.shutdown(2)
            except OSError:
                pass
            return
        self.wfile.write(body)


def urls(port):
    base = f"http://127.0.0.1:{port}"
    out = [base + p for p in FILES] + [base + p for p in MISSING]
    random.Random(3).shuffle(out)
    return out


def judge(folder, port):
    have = {}
    for f in os.listdir(folder):
        p = os.path.join(folder, f)
        if os.path.isfile(p):
            have[f] = hashlib.sha256(open(p, "rb").read()).hexdigest()
    by_hash = {h: f for f, h in have.items()}
    res = {"total": len(FILES) + len(MISSING), "ok": 0, "wrong_name": 0, "missing_or_corrupt": 0, "junk_files": 0, "examples": []}
    used = set()
    for p, (data, name, o) in FILES.items():
        h = hashlib.sha256(data).hexdigest()
        got = by_hash.get(h)
        if not got:
            res["missing_or_corrupt"] += 1
            res["examples"].append({"url": p, "want": name, "got": None})
            continue
        used.add(got)
        s, e = os.path.splitext(name)
        if got == name or re.fullmatch(re.escape(s) + r"\s?[\(\[_\-~ .]?\d{1,3}[\)\]]?" + re.escape(e), got):
            res["ok"] += 1
        else:
            res["wrong_name"] += 1
            res["examples"].append({"url": p, "want": name, "got": got})
    junk = [f for f in have if f not in used]
    res["junk_files"] = len(junk)
    res["junk"] = junk[:10]
    res["ok"] += len(MISSING)  # 404 先算对，下面有残留就扣
    for m in MISSING:
        nm = m.rsplit("/", 1)[1]
        if any(j.startswith(nm) for j in junk):
            res["ok"] -= 1
    big = HITS.get("/big.iso", [])
    res["big_requests"] = big
    res["big_resumed"] = any(r.startswith("bytes=") and r != "bytes=0-" for r in big)
    return res


def main():
    out, tool = sys.argv[1], sys.argv[2]
    folder = os.path.join(out, "DL-" + tool)
    shutil.rmtree(folder, ignore_errors=True)
    os.makedirs(folder)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    us = urls(port)
    t0 = time.time()
    if tool == "saodi":
        sys.path.insert(0, os.path.join(HERE, "..", "app"))
        from saodi.download import Downloader
        d = Downloader(folder)
        d.start(us)
        d.wait(600)
        st = d.status()
        reported = {"done": st["done"], "failed": st["failed"]}
    else:
        lst = os.path.join(out, "aria2-urls.txt")
        open(lst, "w").write("\n".join(us) + "\n")
        extra = [] if tool == "aria2-noc" else ["-c"]  # -c = 续传；不加 -c 时断了的文件 aria2 会另起一份
        r = subprocess.run(["aria2c", "-i", lst, "-d", folder, "-j", "3", *extra, "--max-tries=5", "--retry-wait=2",
                            "--content-disposition-default-utf8=true", "--console-log-level=warn", "--summary-interval=0"],
                           capture_output=True, text=True)
        tail = r.stdout.strip().splitlines()[-12:]
        reported = {"exit": r.returncode, "tail": tail}
    el = time.time() - t0
    res = judge(folder, port)
    res.update({"tool": tool, "elapsed_s": round(el, 2), "reported": reported})
    print(json.dumps(res, ensure_ascii=False, indent=1))
    srv.shutdown()


if __name__ == "__main__":
    main()
