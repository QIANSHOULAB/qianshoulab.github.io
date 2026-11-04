"""CI 用：写 Release 说明（英文在前、中文跟着，各带一句这版干了啥），交给 gh --notes-file。

    python release_notes.py dist/notes.md

「这版干了啥」取自 ui/strings.js 的 up_notes（中英各一句），version.json 的 notes 用同一句。
写成文件：Windows 控制台是 cp1252，中文不走控制台。不进 exe（main.py 不 import 它）。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from saodi import VERSION, text  # noqa: E402


def notes(version: str = VERSION) -> str:
    text.load(os.path.join(HERE, "ui"))
    exe = f"SaodiSeng-{version}.exe"
    return (f"Jiechi · File Sweeper for Windows, from QIANSHOU LAB. Grab {exe} and run it, no installer. "
            "It starts with Windows and quietly sorts your Downloads folder from the tray. English by default; switch to 中文 bottom-left.\n\n"
            f"What’s new in {version}: {text.Tl('en', 'up_notes')}\n\n"
            f"千手院 · 戒尺僧（原扫地僧）Windows 版。下载 {exe} 双击就跑，不用装；开机自己在托盘里盯着「下载」。左下角 EN / 中文 一点就换。\n\n"
            f"{version} 这次弄了点啥：{text.Tl('zh', 'up_notes')}\n\n"
            "https://qianshoulab.github.io/saodi/\n")


if __name__ == "__main__":
    body = notes()
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        f.write(body)
    print(body.encode("ascii", "backslashreplace").decode())
