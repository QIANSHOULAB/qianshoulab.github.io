"""跟 Windows 打交道的小事：开机自启、系统是不是深色。

开机自启 = 注册表 HKCU\\...\\Run 里一条「"Zhike.exe" --tray」：登录 Windows 就进托盘、自己连上次的邮箱，不弹窗口。
其它系统上（只有开发和测试）用 data 目录里一个小文件假装，界面照样能点、能测；真注册表那条路在 Windows CI 上测。
"""
from __future__ import annotations

import sys

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
NAME = "QianshouZhike"


def exe_command() -> str:
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --tray'
    return f'"{sys.executable}" "{sys.argv[0]}" --tray'


def _flag():
    from .store import data_dir
    return data_dir() / "autostart.dev"


def autostart_command() -> str | None:
    """注册表里现在写着的那条命令；没有返回 None。"""
    if sys.platform != "win32":
        p = _flag()
        return p.read_text("utf-8") if p.exists() else None
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
            return str(winreg.QueryValueEx(k, NAME)[0])
    except OSError:
        return None


def autostart_enabled() -> bool:
    return autostart_command() is not None


def set_autostart(on: bool) -> bool:
    if sys.platform != "win32":
        p = _flag()
        if on:
            p.write_text(exe_command(), "utf-8")
        else:
            p.unlink(missing_ok=True)
        return on
    import winreg
    # Run 键在新建的 Windows 用户（和 GitHub 的 Windows 机器）上可能还不存在：OpenKey 会报错、0.2 就悄悄没写上。没有就建。
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
        if on:
            winreg.SetValueEx(k, NAME, 0, winreg.REG_SZ, exe_command())
        else:
            try:
                winreg.DeleteValue(k, NAME)
            except OSError:
                pass
    return on


def prefers_dark() -> bool:
    """Windows 设置里应用用深色吗（窗口刚出来那一下的底色跟着它，免得深色模式白闪一下）。"""
    if sys.platform != "win32":
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize") as k:
            return winreg.QueryValueEx(k, "AppsUseLightTheme")[0] == 0
    except OSError:
        return False
