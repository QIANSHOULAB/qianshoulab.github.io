"""跟 Windows 打交道的小事：开机自启。其它系统上是空操作。"""
from __future__ import annotations

import sys

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
NAME = "QianshouZhike"


def exe_command() -> str:
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --tray'
    return f'"{sys.executable}" "{sys.argv[0]}" --tray'


def autostart_enabled() -> bool:
    if sys.platform != "win32":
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
            winreg.QueryValueEx(k, NAME)
            return True
    except OSError:
        return False


def set_autostart(on: bool) -> bool:
    if sys.platform != "win32":
        return False
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
        if on:
            winreg.SetValueEx(k, NAME, 0, winreg.REG_SZ, exe_command())
        else:
            try:
                winreg.DeleteValue(k, NAME)
            except OSError:
                pass
    return on
