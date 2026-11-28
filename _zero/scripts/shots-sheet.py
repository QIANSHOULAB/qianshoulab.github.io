# 把 genesis-shots.mjs 截的图拼成每个内核一张总览（行 = 尺寸，列 = 七幕；第七幕「开天」在两个尺寸上多三列），给人一眼看完。
# 跑法：python3 scripts/shots-sheet.py <截图目录> <输出目录>    要 Pillow
import json, os, sys
from PIL import Image, ImageDraw

src, dst = sys.argv[1], sys.argv[2]
rep = json.load(open(os.path.join(src, '验收.json'), encoding='utf-8'))
os.makedirs(dst, exist_ok=True)
rows = [r for r in rep['rows'] if r.get('file')]
for eng in sorted({r['engine'] for r in rows}):
    mine = [r for r in rows if r['engine'] == eng]
    sizes = []
    for r in mine:
        if r['size'] not in sizes:
            sizes.append(r['size'])
    H = 240
    cw = {s: round(H * int(s.split('x')[0]) / int(s.split('x')[1])) for s in sizes}
    colw = max(cw.values())
    ncol = max(r.get('col', r['act']) if isinstance(r.get('col', r['act']), int) else 0 for r in mine) + 1
    sheet = Image.new('RGB', (8 + ncol * (colw + 8), 8 + len(sizes) * (H + 8)), (22, 22, 22))
    dr = ImageDraw.Draw(sheet)
    for i, s in enumerate(sizes):
        for r in mine:
            if r['size'] != s:
                continue
            p = os.path.join(src, r['file'])
            if not os.path.exists(p):
                continue
            im = Image.open(p).convert('RGB').resize((cw[s], H), Image.LANCZOS)
            c = r['col'] if isinstance(r.get('col'), int) and r['col'] >= 0 else int(str(r['act'])[0]) - 1
            x, y = 8 + c * (colw + 8), 8 + i * (H + 8)
            sheet.paste(im, (x, y))
            bad = r.get('errors') or r.get('overflow') or r.get('clipped')
            tag = str(r['act']).split('-')[0]   # 只写 7a、7b 这种：默认字体没有中文
            dr.text((x + 4, y + 3), f"{s} {tag}{' !' if bad else ''}", fill=(255, 96, 96) if bad else (200, 200, 200))
    sheet.save(os.path.join(dst, f'{eng}-总览.jpg'), quality=82)
    print(eng, len(mine), '张')
