#!/usr/bin/env python3
"""把 test/e2e.js 截的 duo-*.png（网页 + 侧栏拼成的窗口）转成介绍页用的 img/*.jpg。
用法：python3 huayuan/bench/intro-img.py <e2e 截图目录> [后缀]
  中文：HY_LANG=zh 跑出来的目录，不带后缀 → img/side-table.jpg …
  英文：HY_LANG=en 跑出来的目录，后缀 -en → img/side-table-en.jpg …（介绍页英文版用）
"""
import sys, os
from PIL import Image
src = sys.argv[1]
suf = sys.argv[2] if len(sys.argv) > 2 else ""
img = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'img')
pairs = {'duo-table-start.png': 'side-table.jpg', 'duo-table-start-dark.png': 'side-table-dark.jpg',
         'duo-scroll-done.png': 'side-scroll.jpg', 'duo-cards-done-dark.png': 'side-cards-dark.jpg'}
for a, b in pairs.items():
    im = Image.open(os.path.join(src, a)).convert('RGB')
    b = b.replace('.jpg', suf + '.jpg')
    im.save(os.path.join(img, b), 'JPEG', quality=84, optimize=True, progressive=True)
    print(b, im.size)
