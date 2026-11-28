# v3.2 交货截图拼图（v32-shots.mjs 拍的）：每个内核一张总览（行 = 尺寸，列 = 七张）；
# 外加「开场 0 秒跟纯黑左右并排」的对比图：左边是开场那一屏，右边是纯黑 #000；下面一行把亮度拉高 8 倍，看有没有一圈一圈的色带。
# 跑法：python3 scripts/v32-sheet.py <截图目录> <输出目录>    要 Pillow
import json, os, sys
from PIL import Image, ImageDraw

src, dst = sys.argv[1], sys.argv[2]
rep = json.load(open(os.path.join(src, 'v32.json'), encoding='utf-8'))
os.makedirs(dst, exist_ok=True)
rows = [r for r in rep['rows'] if r.get('file') and os.path.exists(os.path.join(src, r['file']))]
COLS = ['首屏', '快进半路', '天上五个名字', '悬停在千手院', '冲进去半路', '后退回到天上', '开场0秒']
def col(name):
    return 3 if name in ('悬停在千手院', '焦点在千手院') else COLS.index(name)
for eng in sorted({r['engine'] for r in rows}):
    mine = [r for r in rows if r['engine'] == eng]
    sizes = []
    for r in mine:
        if r['size'] not in sizes:
            sizes.append(r['size'])
    H = 260
    cw = {s: round(H * int(s.split('x')[0]) / int(s.split('x')[1])) for s in sizes}
    colw = max(cw.values())
    sheet = Image.new('RGB', (8 + len(COLS) * (colw + 8), 8 + len(sizes) * (H + 8)), (22, 22, 22))
    dr = ImageDraw.Draw(sheet)
    for i, s in enumerate(sizes):
        for r in mine:
            if r['size'] != s:
                continue
            im = Image.open(os.path.join(src, r['file'])).convert('RGB').resize((cw[s], H), Image.LANCZOS)
            x, y = 8 + col(r['shot']) * (colw + 8), 8 + i * (H + 8)
            sheet.paste(im, (x, y))
            bad = r.get('errors') or r.get('clash')
            dr.text((x + 4, y + 3), f"{s} {col(r['shot']) + 1}{' !' if bad else ''}", fill=(255, 96, 96) if bad else (200, 200, 200))
    sheet.save(os.path.join(dst, f'{eng}-v32-总览.jpg'), quality=84)
    print(eng, len(mine), '张')

# 开场 0 秒跟纯黑并排（每个内核、每个尺寸一张）
for r in rows:
    if r['shot'] != '开场0秒':
        continue
    im = Image.open(os.path.join(src, r['file'])).convert('RGB')
    w, h = im.size
    out = Image.new('RGB', (w * 2, h * 2), (0, 0, 0))
    out.paste(im, (0, 0))   # 右上是纯黑 #000（底色就是它，不用画）
    boost = im.point(lambda v: min(255, v * 8))
    out.paste(boost, (0, h))
    dr = ImageDraw.Draw(out)
    dr.text((8, 8), 'opening 0s (ink)', fill=(150, 150, 150))
    dr.text((w + 8, 8), '#000000', fill=(150, 150, 150))
    dr.text((8, h + 8), 'x8 brightness: banding check', fill=(150, 150, 150))
    dr.text((w + 8, h + 8), '#000000 x8', fill=(150, 150, 150))
    # 左上那块的平均颜色
    px = list(im.crop((w // 8, h // 10, w // 3, h // 3)).getdata())
    avg = tuple(round(sum(p[i] for p in px) / len(px)) for i in range(3))
    dr.text((8, 24), 'sky avg #%02X%02X%02X' % avg, fill=(150, 150, 150))
    out.save(os.path.join(dst, f"{r['engine']}-{r['size']}-开场0秒跟纯黑并排.png"))
    print('并排', r['engine'], r['size'], 'sky avg', avg)
