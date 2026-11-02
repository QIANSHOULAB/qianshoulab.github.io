"""扫地僧入口。

  SaodiSeng.exe                     正常打开窗口
  SaodiSeng.exe --selftest out.json 跑自检，不开窗口
  SaodiSeng.exe --smoke-ui out.txt  开窗口、等界面加载好、写文件、自己关（打包冒烟测试用）
  python main.py --dev [port]       开发：浏览器打开 http://127.0.0.1:port ，接真 Api
"""
from __future__ import annotations

import os
import sys
import threading


def ui_dir() -> str:
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "ui")


def main(argv: list[str]) -> int:
    if "--selftest" in argv:
        from saodi import selftest
        i = argv.index("--selftest")
        return selftest.run(argv[i + 1] if len(argv) > i + 1 else None)
    if "--dev" in argv:
        from saodi import devserver
        i = argv.index("--dev")
        port = int(argv[i + 1]) if len(argv) > i + 1 else 8765
        devserver.serve(ui_dir(), port)
        return 0

    import webview
    from saodi.api import Api
    from saodi import VERSION

    api = Api()
    smoke_out = None
    if "--smoke-ui" in argv:
        smoke_out = argv[argv.index("--smoke-ui") + 1]

    win = webview.create_window(
        "扫地僧", os.path.join(ui_dir(), "index.html"), js_api=api,
        width=1120, height=760, min_size=(860, 560), background_color="#F5F5F7", text_select=True,
    )
    api._window = win  # 下划线开头：pywebview 不会把它暴露给 JS

    def on_loaded():
        _hook_drop(win)
        if smoke_out:
            threading.Thread(target=_smoke, args=(win, smoke_out), daemon=True).start()

    win.events.loaded += on_loaded
    webview.start(debug="--debug" in argv, private_mode=False,
                  storage_path=os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "Saodi", "webview"))
    if smoke_out:
        return 0 if os.path.exists(smoke_out) else 3
    return 0


def _hook_drop(win) -> None:
    """拖文件夹进窗口：pywebview 的 DOM 事件能拿到真实路径（浏览器里拿不到）。"""
    try:
        import json
        from webview.dom import DOMEventHandler

        def on_drop(e):
            files = (e.get("dataTransfer") or {}).get("files") or []
            if files and files[0].get("pywebviewFullPath"):
                win.evaluate_js("window.__dropPath(%s)" % json.dumps(files[0]["pywebviewFullPath"]))

        win.dom.document.events.drop += DOMEventHandler(on_drop, True, True)
    except Exception:
        pass  # 拖不了就点按钮选，不影响主流程


def _smoke(win, out: str) -> None:
    """冒烟：界面真渲染出来、JS 桥真能调 Python，就写 ok 并关窗。"""
    import time
    for _ in range(120):
        try:
            ok = win.evaluate_js("document.documentElement.dataset.ready === '1' && document.querySelectorAll('#nav button').length")
            if ok:
                with open(out, "w", encoding="utf-8") as f:
                    f.write("ok nav=%s" % ok)
                time.sleep(0.5)
                win.destroy()
                return
        except Exception:
            pass
        time.sleep(0.5)
    with open(out + ".timeout", "w") as f:
        f.write("timeout")
    os._exit(3)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
