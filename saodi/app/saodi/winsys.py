"""跟 Windows 打交道的小事：开机自启、系统是不是深色。别的系统上是空操作。"""
from __future__ import annotations

import os
import sys

IS_WIN = sys.platform == "win32"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
NAME = "QianshouSaodi"


def exe_command() -> str:
    """开机自启跑的命令：只进托盘、不弹窗口。"""
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --tray'
    return f'"{sys.executable}" "{os.path.abspath(sys.argv[0])}" --tray'


def autostart_enabled() -> bool:
    if not IS_WIN:
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
            v, _ = winreg.QueryValueEx(k, NAME)
            return bool(v)
    except OSError:
        return False


def autostart_command() -> str | None:
    if not IS_WIN:
        return None
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
            return winreg.QueryValueEx(k, NAME)[0]
    except OSError:
        return None


def set_autostart(on: bool) -> bool:
    """写 / 删 HKCU\\...\\Run 里的一项。只动当前用户，不要管理员。返回现在是不是开着。"""
    if not IS_WIN:
        return False
    import winreg
    # Run 这个键有的机器上压根没有（CI 机器就是），OpenKey 会失败 → 用 CreateKeyEx：有就开，没有就建
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE | winreg.KEY_QUERY_VALUE) as k:
        if on:
            winreg.SetValueEx(k, NAME, 0, winreg.REG_SZ, exe_command())
        else:
            try:
                winreg.DeleteValue(k, NAME)
            except OSError:
                pass
    return autostart_enabled()


def system_dark() -> bool:
    """Windows「应用模式」是不是深色。窗口还没画出网页前的底色跟着它，免得深色模式下白闪一下。"""
    if not IS_WIN:
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize") as k:
            return winreg.QueryValueEx(k, "AppsUseLightTheme")[0] == 0
    except OSError:
        return False
