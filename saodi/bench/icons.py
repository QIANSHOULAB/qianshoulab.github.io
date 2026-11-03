"""把 icons.js 画好的各尺寸 PNG 拼成 exe / 窗口用的 icon.ico，顺手出托盘用的 64 px 和介绍页的 180 px。
用法：python icons.py <icons.js 的输出目录>"""
from __future__ import annotations

import os
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "app", "assets")
SITE = os.path.join(HERE, "..")

src = sys.argv[1]
sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
imgs = [Image.open(os.path.join(src, f"icon-{s}.png")).convert("RGBA") for s in sizes]
imgs[-1].save(os.path.join(ASSETS, "icon.ico"), format="ICO", sizes=[(s, s) for s in sizes], append_images=imgs[:-1])
shutil.copy(os.path.join(src, "icon-64.png"), os.path.join(ASSETS, "icon-64.png"))
shutil.copy(os.path.join(src, "icon-256.png"), os.path.join(ASSETS, "icon.png"))
shutil.copy(os.path.join(src, "icon-180.png"), os.path.join(SITE, "apple-touch-icon.png"))
shutil.copy(os.path.join(ASSETS, "icon.svg"), os.path.join(SITE, "icon.svg"))
shutil.copy(os.path.join(ASSETS, "icon.svg"), os.path.join(HERE, "..", "app", "ui", "icon.svg"))
ico = Image.open(os.path.join(ASSETS, "icon.ico"))
print("icon.ico sizes:", sorted(ico.info.get("sizes", [])))
