"""Windows CI 冒烟：开机就在岗（不是 pytest 用例，打包后在 windows-latest 上跑）。

    python tests/win_boot_probe.py dist/Zhike.exe 工作目录

照 Windows 登录时开机自启那样起 exe（Zhike.exe --tray），查：
1. 不弹窗口（知客僧的窗口都不可见）；
2. 自己连上次的邮箱（密码在 Windows 凭据管理器里），接着上次的进度收：关机时来的新信进 Excel、照规则转发，旧信不重复；
3. 注册表 Run 里写好了开机自启：「"…\\Zhike.exe" --tray」；
4. 再双击一次 exe（就像从开始菜单再打开）：不起第二个，把原来那个的窗口亮出来。
邮箱是本机假的 IMAP / SMTP（zhike.fakeservers），不连任何真邮箱。
"""
from __future__ import annotations

import ctypes
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from zhike import platform as P, samples  # noqa: E402
from zhike.engine import Engine  # noqa: E402
from zhike.fakeservers import FakeImap, FakeSmtp, account_for  # noqa: E402
from zhike.secrets import Secrets  # noqa: E402
from zhike.store import Store  # noqa: E402

TITLE = "知客僧"


def windows(visible_only=True):
    """知客僧的顶层窗口（按标题找）。"""
    user32 = ctypes.windll.user32
    out = []
    proto = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    def cb(h, _):
        n = user32.GetWindowTextLengthW(h)
        if n:
            buf = ctypes.create_unicode_buffer(n + 1)
            user32.GetWindowTextW(h, buf, n + 1)
            if buf.value == TITLE and (user32.IsWindowVisible(h) or not visible_only):
                out.append(int(h or 0))
        return True

    user32.EnumWindows(proto(cb), 0)
    return out


def order(i, no, amount):
    return samples._order(i, no, samples.datetime.now(samples.SG), amount, "王小明", "138-0013-8000", "新加坡 淡滨尼 21 街 88 号")


def excel_orders(path):
    from openpyxl import load_workbook
    try:
        wb = load_workbook(path, read_only=True)
        ws = wb["订单"]
        head = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
        i = head.index("订单号")
        got = [r[i] for r in ws.iter_rows(min_row=2, values_only=True)]
        wb.close()
        return got
    except Exception:
        return None


def main():
    exe = str(Path(sys.argv[1]).resolve())
    work = Path(sys.argv[2]).resolve()
    home = work / "home"
    home.mkdir(parents=True, exist_ok=True)
    os.environ["ZHIKE_HOME"] = str(home)
    res = {"ok": False, "steps": {}}
    imap = FakeImap(user="me@ourco.example").start()
    smtp = FakeSmtp(user="me@ourco.example").start()
    procs = []
    try:
        # 「上次」：连好了邮箱、有规则，收过一封旧信
        store = Store()
        store.settings["excel_path"] = str(work / "out" / "知客僧.xlsx")
        acct = account_for(imap, smtp)
        store.accounts.append(acct)
        rules = samples.demo_rules()
        rules[0]["forward"]["to"] = ["boss@test.local"]
        store.config.data["rules"] = rules
        store.settings["demo"] = False
        store.config.save()
        sec = Secrets(store.root)
        sec.set(f"pw:{acct['id']}", imap.password)
        res["steps"]["secret_backend"] = sec.where
        imap.deliver(order(901, "SM-OLD", "1.00"))
        Engine(store, sec).connect_new(acct)          # 进度记到这封，之前的不处理
        # 关机这段时间来了新信
        imap.deliver(order(902, "SM-NEW", "88.00"))
        P.set_autostart(False)

        # 1. 开机：Windows 照注册表起 --tray
        procs.append(subprocess.Popen([exe, "--tray"], env=dict(os.environ)))
        got = None
        for _ in range(120):
            time.sleep(1)
            got = excel_orders(store.settings["excel_path"])
            if got and "SM-NEW" in got:
                break
        res["steps"]["excel"] = got
        assert got == ["SM-NEW"], f"开机后没把新信收进表：{got}"
        for _ in range(20):
            if smtp.sent:
                break
            time.sleep(0.5)
        res["steps"]["forwarded"] = [s[1] for s in smtp.sent]
        assert [s[1] for s in smtp.sent] == [["boss@test.local"]], smtp.sent
        vis = windows()
        res["steps"]["visible_windows_tray"] = len(vis)
        res["steps"]["hidden_windows_tray"] = len(windows(visible_only=False))
        assert not vis, "--tray 起来不该弹窗口"
        cmd = P.autostart_command()
        res["steps"]["autostart"] = cmd
        assert cmd and cmd.lower() == f'"{exe}" --tray'.lower(), cmd

        # 2. 再打开一次：不起第二个，原来那个亮出窗口
        second = subprocess.Popen([exe], env=dict(os.environ))
        procs.append(second)
        shown = []
        for _ in range(40):
            time.sleep(0.5)
            shown = windows()
            if shown:
                break
        res["steps"]["visible_windows_after_open"] = len(shown)
        assert len(shown) == 1, f"再打开一次应该亮出 1 个窗口，实际 {len(shown)}"
        try:
            second.wait(20)
            res["steps"]["second_exit"] = second.returncode
        except subprocess.TimeoutExpired:
            raise AssertionError("第二个进程没退出（应该只叫醒第一个）")
        res["ok"] = True
    except Exception as e:
        import traceback
        res["error"] = f"{e}\n{traceback.format_exc()}"
    finally:
        subprocess.run(["taskkill", "/IM", "Zhike.exe", "/F"], capture_output=True)
        try:
            P.set_autostart(False)
        except Exception:
            pass
        imap.stop()
        smtp.stop()
    print(json.dumps(res, ensure_ascii=False, indent=1))
    (work / "boot-probe.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), "utf-8")
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
