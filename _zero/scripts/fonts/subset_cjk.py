#!/usr/bin/env python3
"""中文标题字库：思源宋体（Noto Serif SC，SIL OFL）只留 cjk-chars.txt 里那些字，合成一个小 woff2。

跑法（在 _zero/ 里；要 fonttools + brotli）：
  npm pack @fontsource/noto-serif-sc@5.3.1 && tar -xzf fontsource-noto-serif-sc-5.3.1.tgz -C /tmp/nsc
  python3 scripts/fonts/subset_cjk.py /tmp/nsc/package 500 src/fonts/zero-serif-sc-500.woff2

fontsource 把整套字切成一百多片（每片一段 unicode-range）。这里按字找到它在哪片，
每片只留要的字，再把这些小片并成一个字库。
"""
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

pkg, weight, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
chars = (Path(__file__).parent / 'cjk-chars.txt').read_text(encoding='utf-8').strip()
css = (pkg / f'{weight}.css').read_text(encoding='utf-8')

blocks = []
for m in re.finditer(r'@font-face\s*{(.*?)}', css, re.S):
    body = m.group(1)
    f = re.search(r"url\(\./files/([^)]+?\.woff2)\)", body)
    r = re.search(r'unicode-range:\s*([^;]+);', body)
    if not f or not r:
        continue
    ranges = []
    for part in r.group(1).split(','):
        part = part.strip().replace('U+', '')
        if '-' in part:
            a, b = part.split('-')
            ranges.append((int(a, 16), int(b, 16)))
        else:
            ranges.append((int(part, 16), int(part, 16)))
    blocks.append((f.group(1), ranges))

by_file = {}
missing = []
for c in chars:
    cp = ord(c)
    hit = next((fn for fn, rs in blocks if any(a <= cp <= b for a, b in rs)), None)
    if hit:
        by_file.setdefault(hit, []).append(c)
    else:
        missing.append(c)
if missing:
    print('这些字 fontsource 里没有：', ''.join(missing))

tmp = out.parent / '.subset-tmp'
tmp.mkdir(exist_ok=True)
parts = []
for i, (fn, cs) in enumerate(sorted(by_file.items())):
    font = TTFont(pkg / 'files' / fn)
    opts = subset.Options()
    opts.flavor = None
    opts.layout_features = ['kern', 'palt', 'locl']
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    opts.notdef_outline = True
    opts.glyph_names = False
    s = subset.Subsetter(opts)
    s.populate(unicodes=[ord(c) for c in cs])
    s.subset(font)
    p = tmp / f'part{i}.ttf'
    font.save(p)
    parts.append(str(p))

merged = Merger().merge(parts)
merged['name'].setName('Zero Serif SC', 1, 3, 1, 0x409)
merged['name'].setName('Zero Serif SC', 4, 3, 1, 0x409)
merged['name'].setName('ZeroSerifSC', 6, 3, 1, 0x409)
merged.flavor = 'woff2'
merged.save(out)
for p in parts:
    Path(p).unlink()
tmp.rmdir()
f = TTFont(out)
print(f'{out}: {out.stat().st_size / 1024:.1f} KB，{len(f.getBestCmap())} 个码位，{len(by_file)} 片并成一个')
