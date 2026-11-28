#!/usr/bin/env python3
"""v3.3 字库：全站标题字换成细黑（Song 11-28 选的「星尘字」：全首页不再有宋体）。两套，都是 SIL OFL、自己托管、裁小：

- Zero Display：Montserrat（细、宽、几何，大写好看），只留基本拉丁 + 拉丁补充 + 几个排版标点。200 给 3D 里聚出来的大字，300 给小字。
- Zero Hei SC：思源黑体（Noto Sans SC），只留 cjk-chars.txt 里那些字（collect-chars.mjs 收的）。200、300 同上。

跑法（在 _zero/ 里；要 fonttools + brotli）：
  npm pack @fontsource/montserrat@5.3.0 @fontsource/noto-sans-sc@5.3.1
  mkdir -p /tmp/fs && for f in fontsource-*.tgz; do mkdir -p /tmp/fs/${f%.tgz} && tar -xzf $f -C /tmp/fs/${f%.tgz}; done
  python3 scripts/fonts/subset.py /tmp/fs/fontsource-montserrat-5.3.0/package /tmp/fs/fontsource-noto-sans-sc-5.3.1/package src/fonts

fontsource 把思源黑体切成一百多片（每片一段 unicode-range）。这里按字找到它在哪片，每片只留要的字，再并成一个字库。
"""
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

mont, noto, outdir = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
chars = (Path(__file__).parent / 'cjk-chars.txt').read_text(encoding='utf-8').strip()
LATIN = [*range(0x20, 0x7F), *range(0xA0, 0x100), 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2192, 0x00B7]


def opts():
    o = subset.Options()
    o.flavor = None
    o.layout_features = ['kern', 'liga', 'palt', 'locl']
    o.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    o.notdef_outline = True
    o.glyph_names = False
    o.hinting = False
    return o


def rename(font, family):
    for rec in font['name'].names:
        if rec.nameID in (1, 4, 16):
            rec.string = family
        elif rec.nameID == 6:
            rec.string = family.replace(' ', '')


def latin(weight):
    src = mont / 'files' / f'montserrat-latin-{weight}-normal.woff2'
    font = TTFont(src)
    s = subset.Subsetter(opts())
    s.populate(unicodes=LATIN)
    s.subset(font)
    rename(font, 'Zero Display')
    font.flavor = 'woff2'
    out = outdir / f'zero-display-{weight}.woff2'
    font.save(out)
    print(f'{out}: {out.stat().st_size / 1024:.1f} KB')


def cjk(weight):
    css = (noto / f'{weight}.css').read_text(encoding='utf-8')
    blocks = []
    for m in re.finditer(r'@font-face\s*{(.*?)}', css, re.S):
        body = m.group(1)
        f = re.search(r"url\(\./files/([^)]+?\.woff2)\)", body)
        r = re.search(r'unicode-range:\s*([^;]+);', body)
        if not f or not r:
            continue
        ranges = []
        for part in r.group(1).split(','):
            part = part.strip().replace('U+', '').replace('u+', '')
            if '-' in part:
                a, b = part.split('-')
                ranges.append((int(a, 16), int(b, 16)))
            else:
                ranges.append((int(part, 16), int(part, 16)))
        blocks.append((f.group(1), ranges))
    by_file, missing = {}, []
    for c in chars:
        cp = ord(c)
        hit = next((fn for fn, rs in blocks if any(a <= cp <= b for a, b in rs)), None)
        (by_file.setdefault(hit, []).append(c)) if hit else missing.append(c)
    if missing:
        print('这些字 fontsource 里没有：', ''.join(missing))
    tmp = outdir / '.subset-tmp'
    tmp.mkdir(exist_ok=True)
    parts = []
    for i, (fn, cs) in enumerate(sorted(by_file.items())):
        font = TTFont(noto / 'files' / fn)
        s = subset.Subsetter(opts())
        s.populate(unicodes=[ord(c) for c in cs])
        s.subset(font)
        p = tmp / f'part{i}.ttf'
        font.flavor = None
        font.save(p)
        parts.append(str(p))
    merged = Merger().merge(parts) if len(parts) > 1 else TTFont(parts[0])
    rename(merged, 'Zero Hei SC')
    merged.flavor = 'woff2'
    out = outdir / f'zero-hei-sc-{weight}.woff2'
    merged.save(out)
    for p in parts:
        Path(p).unlink()
    tmp.rmdir()
    f = TTFont(out)
    print(f'{out}: {out.stat().st_size / 1024:.1f} KB，{len(f.getBestCmap())} 个码位，{len(by_file)} 片并成一个')


for w in (200, 300):
    latin(w)
    cjk(w)
