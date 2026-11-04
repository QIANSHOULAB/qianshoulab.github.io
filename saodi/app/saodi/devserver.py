"""开发/测试用：浏览器打开界面，POST /api/<方法名> 调真 Api。只监听 127.0.0.1。"""
from __future__ import annotations

import http.server
import json
import os

from .api import Api


def serve(ui: str, port: int = 8765) -> None:
    from . import feedback, text
    text.load(ui)
    # 开发 / 测试时「提意见」不真开邮件程序：记下拼好的 mailto，GET /dev/opened 拿得到（端到端测试核对用）
    opened = []

    def record(url):
        opened.append(url)
        print("feedback:", url, flush=True)   # 网址本身全是 ASCII，Windows 控制台不会炸
        return True
    feedback.launch = record
    api = Api()
    # 开发 / 测试时只在明确给了 SAODI_DOWNLOADS 才去盯「下载」，免得动到开发机上真的下载文件夹
    api.boot(auto_downloads=bool(os.environ.get("SAODI_DOWNLOADS")))

    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=ui, **k)

        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.path.split("?")[0] == "/dev/opened":
                body = json.dumps(opened).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path.split("?")[0] == "/dev.js":
                body = b"window.SAODI_DEV = true;"
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def do_POST(self):
            name = self.path.rsplit("/", 1)[-1]
            n = int(self.headers.get("Content-Length") or 0)
            args = json.loads(self.rfile.read(n) or b"[]")
            fn = getattr(api, name, None)
            if not name or name.startswith("_") or not callable(fn):
                self.send_error(404)
                return
            try:
                body = json.dumps({"r": fn(*args)}, ensure_ascii=False, default=str).encode()
            except Exception as e:
                body = json.dumps({"e": repr(e)}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    s = http.server.ThreadingHTTPServer(("127.0.0.1", port), H)
    print(f"戒尺僧开发模式: http://127.0.0.1:{port}/  (SAODI_HOME={os.environ.get('SAODI_HOME', '默认')})")
    s.serve_forever()
