"""知客僧 Windows 入口：窗口（pywebview / WebView2）+ 托盘（pystray）+ 后台收信线程。

用法：
  知客僧.exe              打开窗口
  知客僧.exe --tray       开机自启用：只进托盘，不弹窗口
  知客僧.exe --selftest out.json   冒烟自测（打包后 CI 用）
"""
from __future__ import annotations

import functools
import os
import socket
import sys
import threading
from pathlib import Path


def resource(*parts) -> str:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return str(base.joinpath(*parts))


# ---------- 只开一个 ----------
def single_instance(on_show):
    """已经有一个在跑：叫它把窗口亮出来，自己退出。"""
    from zhike.store import data_dir
    pf = data_dir() / "instance.port"
    try:
        port = int(pf.read_text())
        with socket.create_connection(("127.0.0.1", port), timeout=1) as s:
            s.sendall(b"show")
        return False
    except Exception:
        pass
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(2)
    pf.write_text(str(srv.getsockname()[1]))

    def loop():
        while True:
            try:
                c, _ = srv.accept()
                if c.recv(16) == b"show":
                    on_show()
                c.close()
            except Exception:
                break

    threading.Thread(target=loop, daemon=True).start()
    return True


def tray_image():
    from PIL import Image, ImageDraw
    s = 64
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((2, 2, s - 2, s - 2), radius=14, fill=(10, 113, 227, 255))
    d.rounded_rectangle((13, 19, s - 13, s - 19), radius=4, outline=(255, 255, 255, 255), width=4)
    d.line((14, 21, s // 2, 36, s - 14, 21), fill=(255, 255, 255, 255), width=4, joint="curve")
    return img


def js_facade(api):
    """只把方法交给网页，内部对象（store、engine）不暴露，pywebview 也不用去遍历它们。"""
    ns = {}
    for name in dir(type(api)):
        if name.startswith("_"):
            continue
        fn = getattr(type(api), name)
        if callable(fn):
            def make(n):
                @functools.wraps(getattr(type(api), n))
                def f(self, *a):
                    return getattr(api, n)(*a)
                return f
            ns[name] = make(name)
    return type("ZhikeJs", (), ns)()


def main():
    args = sys.argv[1:]
    if "--selftest" in args:
        from zhike.selftest import run
        i = args.index("--selftest")
        sys.exit(run(args[i + 1] if len(args) > i + 1 else None))

    import webview
    import pystray
    from zhike import APP_NAME, VERSION
    from zhike.api import Api

    state = {"window": None, "icon": None, "quitting": False}

    def show():
        w = state["window"]
        if w:
            w.show()
            w.restore()

    if not single_instance(show):
        return

    def notify(log):
        icon = state["icon"]
        if not icon:
            return
        parts = []
        if log.get("excel") in ("ok", "pending"):
            parts.append("进表")
        if log.get("forward") == "ok":
            parts.append("已转发")
        if log.get("draft") == "ok":
            parts.append("草稿已备好")
        if parts:
            try:
                icon.notify(f"{log.get('subject', '')[:40]}\n{' · '.join(parts)}", f"{APP_NAME} · {log.get('rule')}")
            except Exception:
                pass

    def quit_all():
        state["quitting"] = True
        try:
            api.engine.stop()
        except Exception:
            pass
        if state["icon"]:
            state["icon"].stop()
        if state["window"]:
            state["window"].destroy()

    api = Api(on_quit=quit_all, notify=notify)

    def pick_excel():
        w = state["window"]
        r = w.create_file_dialog(webview.SAVE_DIALOG, save_filename="知客僧.xlsx",
                                 file_types=("Excel (*.xlsx)",))
        if not r:
            return None
        p = r if isinstance(r, str) else r[0]
        return p if p.lower().endswith(".xlsx") else p + ".xlsx"

    api.pick_excel = pick_excel

    hidden = "--tray" in args
    win = webview.create_window(f"{APP_NAME}", resource("ui", "index.html"), js_api=js_facade(api),
                                width=1180, height=760, min_size=(860, 560), hidden=hidden,
                                background_color="#FFFFFF", text_select=True)
    state["window"] = win

    def on_closing():
        if state["quitting"]:
            return True
        win.hide()
        return False      # 关窗口 = 收进托盘，后台照常盯着

    win.events.closing += on_closing

    menu = pystray.Menu(
        pystray.MenuItem("打开知客僧", lambda: show(), default=True),
        pystray.MenuItem("现在就收", lambda: api.engine.wake()),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出", lambda: quit_all()),
    )
    icon = pystray.Icon("zhike", tray_image(), f"{APP_NAME} {VERSION}", menu)
    state["icon"] = icon
    icon.run_detached()

    if api.store.accounts:
        api.engine.start()
    threading.Timer(8, api.check_update).start()

    # 第一次跑：默认开机自启（设置里可以关）
    from zhike import platform as P
    if api.store.settings.get("autostart", True) and not api.store.state.data.get("autostart_set"):
        try:
            P.set_autostart(True)
            api.store.state.data["autostart_set"] = True
            api.store.state.save()
        except Exception:
            pass

    webview.start(debug=bool(os.environ.get("ZHIKE_DEBUG")), private_mode=False)
    quit_all()


if __name__ == "__main__":
    main()
