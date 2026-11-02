"""开发用：浏览器里看界面。python -m zhike.devserver [端口]，只监听 127.0.0.1。"""
from __future__ import annotations

import json
import sys
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .api import Api

UI = Path(__file__).resolve().parents[1] / "ui"


def serve(port=8765, api=None):
    api = api or Api()

    class H(SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(UI), **k)

        def do_POST(self):
            name = self.path.rsplit("/", 1)[-1]
            n = int(self.headers.get("Content-Length", 0))
            args = json.loads(self.rfile.read(n) or b"[]")
            try:
                fn = getattr(api, name)
                if name.startswith("_"):
                    raise AttributeError(name)
                out = {"ok": True, "result": fn(*args)}
            except Exception as e:
                traceback.print_exc()
                out = {"ok": False, "error": repr(e)}
            data = json.dumps(out, ensure_ascii=False, default=str).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *a):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    return srv


if __name__ == "__main__":
    p = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"http://127.0.0.1:{p}/")
    serve(p).serve_forever()
