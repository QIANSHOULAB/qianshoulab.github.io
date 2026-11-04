"""CI 用：给 release「zhike-latest」写 version.json（版本、下载地址、sha256、大小、更新说明中英两套），还有 Release 说明。

    python release_json.py dist/Zhike.exe dist/version.json https://github.com/<repo>/releases/download/zhike-latest/Zhike.exe
    python release_json.py --notes dist/notes.md        # Release 说明（英文在前、中文跟着，各带一句这版干了啥）

更新说明就是 ui/strings.js 里的 up_notes（中英各一句），程序的「有新版本」卡片拿它显示「这次弄了点啥」，Release 说明也用它。
写成文件交给 gh --notes-file：Windows 控制台是 cp1252，中文不走控制台。不进 exe（app.py 不 import 它）。
"""
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from zhike import VERSION  # noqa: E402
from zhike.text import T  # noqa: E402


def main(exe, out, url):
    data = Path(exe).read_bytes()
    info = {"version": VERSION, "url": url, "sha256": hashlib.sha256(data).hexdigest(), "size": len(data),
            "notes": {"en": T("up_notes", "en"), "zh": T("up_notes", "zh")}}
    Path(out).write_text(json.dumps(info, ensure_ascii=False), "utf-8")
    print(json.dumps(info))      # 控制台可能是 cp1252：打印用 \u 转义，文件里照常是 UTF-8


def notes(out):
    body = (f"Zhike · Inbox Sorter {VERSION} for Windows. Download Zhike.exe and double-click. https://qianshoulab.github.io/zhike/\n\n"
            f"{T('up_notes_h', 'en')} {T('up_notes', 'en')}\n\n"
            f"知客僧 {VERSION} Windows 版。下载 Zhike.exe，双击就跑。\n\n"
            f"{T('up_notes_h', 'zh')}{T('up_notes', 'zh')}\n")
    Path(out).write_text(body, "utf-8")
    print(body.encode("ascii", "backslashreplace").decode())


if __name__ == "__main__":
    if sys.argv[1:2] == ["--notes"]:
        notes(sys.argv[2])
    else:
        main(*sys.argv[1:4])
