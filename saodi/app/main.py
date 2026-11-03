"""戒尺僧（原扫地僧）入口。exe 文件名照旧叫 SaodiSeng.exe。

  SaodiSeng.exe                       正常打开窗口（已经在托盘里跑着：叫它把窗口亮出来，自己退）
  SaodiSeng.exe --tray                开机自启用：只进托盘、不弹窗口，接着盯「下载」
  SaodiSeng.exe --selftest out.json   跑自检，不开窗口
  SaodiSeng.exe --smoke-ui out.txt    开窗口、等界面加载好、写文件、自己关（打包冒烟测试用）
  SaodiSeng.exe --tray --smoke-tray out.json   托盘冒烟：不开窗、自己盯下载、等第二个实例来叫窗口、写结果、自己退（CI 用）
  python main.py --dev [port]         开发：浏览器打开 http://127.0.0.1:port ，接真 Api
"""
from __future__ import annotations

import json
import os
import socket
import sys
import threading
import time


def ui_dir() -> str:
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "ui")


def asset(name: str) -> str:
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "assets", name)


# ---------------------------------------------------------------- 只开一个
def single_instance(on_show, on_ping=None):
    """已经有一个在跑：叫它把窗口亮出来（--tray 起的只打个招呼），自己退出。返回 False 表示该退。"""
    from saodi import fsutil as fs
    pf = os.path.join(fs.home_dir(), "instance.port")
    want = b"saodi tray\n" if "--tray" in sys.argv else b"saodi show\n"
    try:
        with open(pf, encoding="utf-8") as f:
            port = int(f.read().strip())
        with socket.create_connection(("127.0.0.1", port), timeout=1.5) as s:
            s.settimeout(1.5)
            s.sendall(want)
            if s.recv(8).startswith(b"ok"):
                return False
    except (OSError, ValueError):
        pass
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(4)
    with open(pf, "w", encoding="utf-8") as f:
        f.write(str(srv.getsockname()[1]))

    def loop():
        while True:
            try:
                c, _ = srv.accept()
            except OSError:
                break
            try:
                c.settimeout(2)
                msg = c.recv(32)
                if msg.startswith(b"saodi"):
                    c.sendall(b"ok\n")
                    if msg.startswith(b"saodi show"):
                        on_show()
                    elif on_ping:
                        on_ping()
                c.close()
            except OSError:
                pass

    threading.Thread(target=loop, daemon=True).start()
    return True


def main(argv: list[str]) -> int:
    if "--selftest" in argv:
        from saodi import selftest
        i = argv.index("--selftest")
        return selftest.run(argv[i + 1] if len(argv) > i + 1 else None)
    if "--dev" in argv:
        from saodi import devserver
        i = argv.index("--dev")
        port = int(argv[i + 1]) if len(argv) > i + 1 and argv[i + 1].isdigit() else 8765
        devserver.serve(ui_dir(), port)
        return 0

    import webview
    from saodi import VERSION, text, winsys
    from saodi.api import Api, load_cfg, save_cfg

    text.load(ui_dir())
    T = text.T
    tray_mode = "--tray" in argv
    smoke_out = argv[argv.index("--smoke-ui") + 1] if "--smoke-ui" in argv else None
    smoke_tray = argv[argv.index("--smoke-tray") + 1] if "--smoke-tray" in argv else None
    st = {"win": None, "icon": None, "quitting": False, "visible": not tray_mode, "shows": 0, "tip": lambda: T("app")}

    def show():
        st["shows"] += 1
        w = st["win"]
        if w:
            st["visible"] = True
            try:
                w.show()
                w.restore()
            except Exception:
                pass

    if not single_instance(show):
        return 0

    def notify(title, msg):
        """自动分完：窗口开着由界面自己报；收在托盘里就冒个泡。"""
        if st["visible"] or not st["icon"] or not load_cfg().get("notify", True):
            return
        try:
            st["icon"].notify(msg, title)
        except Exception:
            pass

    def on_lang(_lang):
        """左下角换了语言：窗口标题、托盘菜单、托盘提示跟着换（菜单的字是现取的，重画一下就行）。"""
        if st["win"]:
            try:
                st["win"].set_title(T("win_title"))
            except Exception:
                pass
        if st["icon"]:
            try:
                st["icon"].update_menu()
                st["icon"].title = st["tip"]()
            except Exception:
                pass

    api = Api(notify=notify, on_lang=on_lang)
    api.boot()

    # 第一次跑：默认开机自启（盯着那页一个开关就能关）；exe 挪了地方也跟着改
    if winsys.IS_WIN and getattr(sys, "frozen", False) and not smoke_out:
        c = load_cfg()
        try:
            if c.get("autostart") is None:
                winsys.set_autostart(True)
                c["autostart"] = True
                save_cfg(c)
            elif c.get("autostart") and winsys.autostart_command() != winsys.exe_command():
                winsys.set_autostart(True)
        except OSError:
            pass

    dark = winsys.system_dark()
    win = webview.create_window(
        T("win_title"), os.path.join(ui_dir(), "index.html"), js_api=api,
        width=1180, height=780, min_size=(900, 600), hidden=tray_mode,
        background_color="#000000" if dark else "#FFFFFF", text_select=True,
    )
    api._window = win  # 下划线开头：pywebview 不会把它暴露给 JS
    st["win"] = win

    # ---------------- 托盘
    icon = None
    try:
        import pystray
        from PIL import Image

        def dl_watch():
            from saodi import fsutil as fs
            d = os.path.normcase(os.path.abspath(fs.downloads_dir()))
            return next((w for w in api.watch_status() if os.path.normcase(w["folder"]) == d), None)

        def toggle_dl(_icon=None, _item=None):
            w = dl_watch()
            if w:
                api.watch_set(w["folder"], not w["on"])
            elif _icon is not None:
                show()

        def tip():
            w = dl_watch()
            return T("tray_tip_on") if w and w["on"] else T("tray_tip_off")

        st["tip"] = tip
        menu = pystray.Menu(  # 字给成函数：换了语言 update_menu() 一下就是新字
            pystray.MenuItem(lambda item: T("tray_open"), lambda: show(), default=True),
            pystray.MenuItem(lambda item: T("tray_watch_dl"), toggle_dl, checked=lambda item: bool((dl_watch() or {}).get("on"))),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(lambda item: T("tray_quit"), lambda: quit_all()),
        )
        icon = pystray.Icon("saodi", Image.open(asset("icon-64.png")), tip(), menu)
        st["icon"] = icon
        icon.run_detached()
    except Exception:
        icon = None  # 托盘起不来（极少见）：关窗就退出，别的照常

    def quit_all():
        st["quitting"] = True
        try:
            api.stop_all()
        except Exception:
            pass
        if st["icon"]:
            try:
                st["icon"].stop()
            except Exception:
                pass
        try:
            win.destroy()
        except Exception:
            pass

    def on_closing():
        if st["quitting"] or not st["icon"]:
            return True
        win.hide()  # 关窗 = 收进托盘，照常盯着
        st["visible"] = False
        c = load_cfg()
        if not c.get("told_tray"):
            c["told_tray"] = True
            save_cfg(c)
            try:
                st["icon"].notify(T("tray_first"), T("win_title"))
            except Exception:
                pass
        return False

    win.events.closing += on_closing

    def refresh_tip():
        while not st["quitting"] and st["icon"]:
            try:
                st["icon"].title = tip()
            except Exception:
                pass
            time.sleep(5)

    if icon:
        threading.Thread(target=refresh_tip, daemon=True).start()

    def on_loaded():
        _hook_drop(win)
        if smoke_out:
            threading.Thread(target=_smoke, args=(win, smoke_out, st), daemon=True).start()

    win.events.loaded += on_loaded
    if smoke_tray:
        threading.Thread(target=_smoke_tray, args=(api, st, smoke_tray, quit_all), daemon=True).start()
    from saodi import fsutil as fs
    webview.start(debug="--debug" in argv, private_mode=False,
                  storage_path=os.path.join(os.environ.get("LOCALAPPDATA") or fs.home_dir(), "Saodi", "webview"))
    quit_all()
    code = (0 if os.path.exists(smoke_out) else 3) if smoke_out else 0
    # 托盘线程万一没收到退出消息，别让进程隐身挂在后台：3 秒后硬退（该存的上面都存过了）
    t = threading.Timer(3.0, lambda: os._exit(code))
    t.daemon = True
    t.start()
    return code


def _hook_drop(win) -> None:
    """拖文件夹进窗口：pywebview 的 DOM 事件能拿到真实路径（浏览器里拿不到）。"""
    try:
        from webview.dom import DOMEventHandler

        def on_drop(e):
            files = (e.get("dataTransfer") or {}).get("files") or []
            if files and files[0].get("pywebviewFullPath"):
                win.evaluate_js("window.__dropPath(%s)" % json.dumps(files[0]["pywebviewFullPath"]))

        win.dom.document.events.drop += DOMEventHandler(on_drop, True, True)
    except Exception:
        pass  # 拖不了就点按钮选，不影响主流程


def _smoke(win, out: str, st) -> None:
    """冒烟：界面真渲染出来、JS 桥真能调 Python，就写 ok 并关窗。"""
    for _ in range(120):
        try:
            ok = win.evaluate_js("document.documentElement.dataset.ready === '1' && document.querySelectorAll('#nav button').length")
            if ok:
                with open(out, "w", encoding="utf-8") as f:
                    f.write("ok nav=%s" % ok)
                time.sleep(0.5)
                st["quitting"] = True
                win.destroy()
                return
        except Exception:
            pass
        time.sleep(0.5)
    with open(out + ".timeout", "w") as f:
        f.write("timeout")
    os._exit(3)


def _smoke_tray(api, st, out: str, quit_all) -> None:
    """托盘冒烟（CI）：--tray 起来不开窗；「下载」默认就盯上；浏览器式下载（.crdownload → 改名）落地就分；
    0 字节占位 + .part、隐藏文件不动；开机自启那一项写对了；第二个实例来了会叫窗口出来。"""
    from saodi import fsutil as fs, text, winsys
    res = {"checks": {}}

    def check(name, ok, detail=None):
        res["checks"][name] = "ok" if ok else f"FAIL {detail!r}"

    def wait(fn, sec):
        t0 = time.time()
        while time.time() - t0 < sec:
            try:
                if fn():
                    return True
            except Exception:
                pass
            time.sleep(0.3)
        return False

    try:
        dl = fs.downloads_dir()
        check("tray_icon", wait(lambda: st["icon"] is not None and st["icon"].visible, 30), st["icon"])
        check("window_hidden", not st["visible"])
        if winsys.IS_WIN and st["icon"] is not None:
            # pystray 不看 Shell_NotifyIcon 的返回值；这里自己问一下系统托盘真收没收（CI 机器可能没有任务栏，只记不判）
            try:
                from pystray._util import win32 as w32
                import ctypes
                ok = w32.Shell_NotifyIcon(w32.NIM_MODIFY, w32.NOTIFYICONDATAW(
                    cbSize=ctypes.sizeof(w32.NOTIFYICONDATAW), hWnd=st["icon"]._hwnd, hID=id(st["icon"]),
                    uFlags=w32.NIF_TIP, szTip=text.T("app")))
                res["shell_tray_accepted"] = bool(ok)
            except Exception as e:  # noqa: BLE001
                res["shell_tray_accepted"] = "unknown " + repr(e)
        check("downloads_watched", wait(lambda: any(w["on"] and os.path.normcase(w["folder"]) == os.path.normcase(dl)
                                                    for w in api.watch_status()), 10), api.watch_status())
        # 像 Chrome：先写 .crdownload，写完改名
        part = os.path.join(dl, "报价单.pdf.crdownload")
        with open(part, "wb") as f:
            f.write(b"%PDF-1.4\n" * 1000)
        time.sleep(5)
        check("crdownload_untouched", os.path.exists(part))
        os.replace(part, os.path.join(dl, "报价单.pdf"))
        # 像 Firefox：0 字节占位 + .part
        open(os.path.join(dl, "合同.docx"), "wb").close()
        with open(os.path.join(dl, "合同.docx.part"), "wb") as f:
            f.write(b"x" * 5000)
        # 隐藏文件
        hid = os.path.join(dl, "藏着.pdf")
        with open(hid, "wb") as f:
            f.write(b"%PDF")
        if winsys.IS_WIN:
            import ctypes
            ctypes.windll.kernel32.SetFileAttributesW(hid, 0x2)
        from saodi import organize
        res["lang"] = text.lang()  # 新装的默认英文：分进「Documents」
        docs = organize.type_dir(".pdf")
        check("sorted_after_download", wait(lambda: os.path.exists(os.path.join(dl, docs, "报价单.pdf")), 30), os.listdir(dl))
        time.sleep(5)
        check("placeholder_untouched", os.path.exists(os.path.join(dl, "合同.docx")) and os.path.exists(os.path.join(dl, "合同.docx.part")), os.listdir(dl))
        check("hidden_untouched", os.path.exists(hid), os.listdir(dl))
        if winsys.IS_WIN:
            cmd = winsys.autostart_command() or ""
            check("autostart_cmd", "--tray" in cmd, cmd)
        # 托盘菜单的字跟着语言：切到中文再切回来，菜单现取的字跟着变
        items = list(st["icon"].menu.items) if st["icon"] is not None else []
        if items:
            api.set_lang("zh")
            zh = items[0].text
            api.set_lang("en")
            check("tray_menu_lang", zh == text.Tl("zh", "tray_open") and items[0].text == text.Tl("en", "tray_open"), (zh, items[0].text))
        res["ready_for_second"] = True
        with open(out + ".ready", "w", encoding="utf-8") as f:
            f.write("ready")
        check("second_instance_shows_window", wait(lambda: st["shows"] > 0, 90), st["shows"])
    except Exception as e:  # noqa: BLE001
        res["checks"]["exception"] = "FAIL " + repr(e)
    res["ok"] = all(v == "ok" for v in res["checks"].values())
    with open(out, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    time.sleep(1)
    quit_all()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
