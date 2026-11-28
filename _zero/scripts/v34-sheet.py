# v3.4 交货图（v34-shots.mjs 截的）拼成几张看的图，原图转成 JPG：
#   <内核>-v34-总览.jpg        行 = 四个手机竖屏（中文），列 = 第二到第七幕的展示位置
#   <内核>-v34-英文-390x844.jpg  390×844 英文那一套，一行
#   <内核>-Song那一幕-改前改后.jpg  390×844 第六幕刚开头（P 5.15），左改前（v3.3）、右改后（v3.4），原大
#   原图/<文件名>.jpg           每张原图（质量 90；PNG 几十张太压仓库）
# 跑法：python3 scripts/v34-sheet.py <截图目录> <输出目录>    要 Pillow
import json, os, sys
from PIL import Image, ImageDraw

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(dst, '原图'), exist_ok=True)
rep = json.load(open(os.path.join(src, 'shots.json'), encoding='utf-8'))
rows = [r for r in rep['rows'] if r.get('file') and os.path.exists(os.path.join(src, r['file'] + '.png'))]
ACTS = [2, 3, 4, 5, 6, 7]
NAME = {2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7'}


def grid(items, keys, H, path):
    cw = {k: round(H * int(k.split('x')[0]) / int(k.split('x')[1])) for k in keys}
    colw = max(cw.values())
    sheet = Image.new('RGB', (8 + len(ACTS) * (colw + 8), 8 + len(keys) * (H + 8)), (22, 22, 22))
    dr = ImageDraw.Draw(sheet)
    for i, k in enumerate(keys):
        for r in items:
            if r['size'] != k or r['act'] not in ACTS:
                continue
            c = ACTS.index(r['act'])
            im = Image.open(os.path.join(src, r['file'] + '.png')).convert('RGB').resize((cw[k], H), Image.LANCZOS)
            x, y = 8 + c * (colw + 8), 8 + i * (H + 8)
            sheet.paste(im, (x, y))
            bad = r.get('errors') or r.get('overflow')
            dr.text((x + 4, y + 3), f"{k} act {NAME[r['act']]}{' !' if bad else ''}", fill=(255, 96, 96) if bad else (210, 210, 210))
    sheet.save(path, quality=86)


for eng in sorted({r['engine'] for r in rows}):
    mine = [r for r in rows if r['engine'] == eng]
    zh = [r for r in mine if r['lang'] == 'zh' and r['act'] in ACTS]
    keys = []
    for r in zh:
        if r['size'] not in keys:
            keys.append(r['size'])
    grid(zh, keys, 420, os.path.join(dst, f'{eng}-v34-总览.jpg'))
    en = [r for r in mine if r['lang'] == 'en' and r['act'] in ACTS]
    if en:
        grid(en, ['390x844'], 520, os.path.join(dst, f'{eng}-v34-英文-390x844.jpg'))
    pair = {r.get('tag'): r for r in mine if r['act'] == 'song'}
    if '改前' in pair and '改后' in pair:
        a = Image.open(os.path.join(src, pair['改前']['file'] + '.png')).convert('RGB')
        b = Image.open(os.path.join(src, pair['改后']['file'] + '.png')).convert('RGB')
        sheet = Image.new('RGB', (a.width + b.width + 24, max(a.height, b.height) + 30), (22, 22, 22))
        sheet.paste(a, (8, 30))
        sheet.paste(b, (a.width + 16, 30))
        dr = ImageDraw.Draw(sheet)
        dr.text((12, 8), f"before (v3.3)  390x844  P {pair['改前']['P']}", fill=(230, 230, 230))
        dr.text((a.width + 20, 8), f"after (v3.4)  390x844  P {pair['改后']['P']}", fill=(230, 230, 230))
        sheet.save(os.path.join(dst, f'{eng}-Song那一幕-改前改后.jpg'), quality=90)
    for r in mine:
        Image.open(os.path.join(src, r['file'] + '.png')).convert('RGB').save(os.path.join(dst, '原图', r['file'] + '.jpg'), quality=90)
    print(eng, len(mine), '张')
