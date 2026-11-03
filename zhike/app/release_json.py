"""CI 用：给 release「zhike-latest」写 version.json（版本、下载地址、sha256、大小、更新说明中英两套）。

    python release_json.py dist/Zhike.exe dist/version.json https://github.com/<repo>/releases/download/zhike-latest/Zhike.exe

更新说明就是 ui/strings.js 里的 up_notes（中英各一句），程序的「有新版本」卡片拿它显示「这次弄了点啥」。
不进 exe（app.py 不 import 它）。
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
    print(json.dumps(info, ensure_ascii=False))


if __name__ == "__main__":
    main(*sys.argv[1:4])
