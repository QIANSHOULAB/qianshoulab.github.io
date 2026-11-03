"""知客僧 Windows 入口：窗口（pywebview / WebView2）+ 托盘（pystray）+ 后台收信线程。

开机就在岗：头一个邮箱连上时写好开机自启（注册表 Run，带 --tray）。登录 Windows → 只进托盘、自己连上次的邮箱、
接着上次的进度收信，不弹窗口；有事（草稿备好、拟了新规则、密码不对、Excel 被占着）才冒气泡。关窗口 = 收进托盘。

用法：
  知客僧.exe              打开窗口（已经在跑：把那个窗口亮出来）
  知客僧.exe --tray       开机自启用：只进托盘，不弹窗口
  知客僧.exe --selftest out.json   冒烟自测（打包后 CI 用）
  知客僧.exe --update-probe out.json   自动更新冒烟：换完自己、重启后写个文件就退（CI 用）
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
    """托盘图标：跟 exe、总舵首页卡片同一个（赭色信封）。"""
    from zhike.icon import draw
    return draw(64)


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

    # 自动更新：上次下好的新版先换上、重启；新版起来后把旧的删掉
    from zhike import updates
    updates.cleanup(args)
    if updates.apply_pending(args):
        return
    if "--update-probe" in args:
        import json
        from zhike import VERSION as V
        i = args.index("--update-probe")
        import time
        exe = updates.exe_path()
        for _ in range(40):
            if not exe or not list(exe.parent.glob(exe.name + "*.old")):
                break
            time.sleep(0.5)
        left = sorted(p.name for p in exe.parent.iterdir()) if exe else []
        Path(args[i + 1]).write_text(json.dumps({"version": V, "files": left}), "utf-8")
        return

    import webview
    import pystray
    from zhike import APP_NAME, VERSION, platform as P
    from zhike.api import Api, S as TXT

    state = {"window": None, "icon": None, "quitting": False}

    def show():
        w = state["window"]
        if w:
            w.show()
            w.restore()
            try:
                w.evaluate_js("window.zkShown && window.zkShown()")   # 有新拟的规则：一打开就摆出来
            except Exception:
                pass

    if not single_instance(show):
        return

    def notify(title, body):
        """托盘气泡。只有要人管的事才来（见 Api._tell）。"""
        icon = state["icon"]
        if not icon:
            return
        try:
            icon.notify(body, title)
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

    def restart_for_update():
        """「重启」按钮：换上下好的新版，起新的，自己退。"""
        exe = updates.exe_path()
        if exe and updates.pending(exe) and updates.swap(exe):
            updates.relaunch(exe, [a for a in args if a != "--tray"])
            quit_all()

    api.on_restart = restart_for_update

    hidden = "--tray" in args
    dark = P.prefers_dark()
    win = webview.create_window(f"{APP_NAME}", resource("ui", "index.html"), js_api=js_facade(api),
                                width=1180, height=760, min_size=(980, 640), hidden=hidden,
                                background_color="#000000" if dark else "#F5F5F7", text_select=True)
    state["window"] = win

    def on_closing():
        if state["quitting"]:
            return True
        win.hide()
        # 头一回关窗口：说一句贫僧还在托盘里，不然人以为关掉了
        if not api.store.state.data.get("told_tray"):
            api.store.state.data["told_tray"] = True
            api.store.state.save()
            notify(APP_NAME, TXT["tray_hint"])
        return False      # 关窗口 = 收进托盘，后台照常盯着

    win.events.closing += on_closing

    menu = pystray.Menu(
        pystray.MenuItem(TXT["m_open"], lambda: show(), default=True),
        pystray.MenuItem(TXT["m_run"], lambda: api.engine.wake()),
        pystray.MenuItem(TXT["m_excel"], lambda: api.open_excel()),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(TXT["m_quit"], lambda: quit_all()),
    )
    icon = pystray.Icon("zhike", tray_image(), f"{APP_NAME} {VERSION}", menu)
    state["icon"] = icon
    icon.run_detached()

    if api.store.accounts:
        api.engine.start()
    def update_loop():
        import time
        time.sleep(8)
        while not state["quitting"]:
            try:
                api.check_update()
            except Exception:
                pass
            time.sleep(6 * 3600)

    threading.Thread(target=update_loop, daemon=True).start()

    # 开机自启：头一个邮箱连上那一刻写（Api._added，界面当场说一句、一下能关）。
    # 邮箱是别处带来的（老版本升上来、配置拷过来）也补上；人关过就不再动。
    if api.store.accounts and api.store.settings.get("autostart", True) and not api.store.state.data.get("autostart_set"):
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
