# v3.3 交货图拼成总览：每个内核一张，行 = 尺寸 × 语言，列 = 七个展示位置 + 两张半路（v33-shots.mjs 截的）。
# 再把录屏（webm）转成 gif（有 ffmpeg 才转）。
# 跑法：python3 scripts/v33-sheet.py <截图目录> <输出目录> [录屏目录]    要 Pillow
import json, os, subprocess, sys
from PIL import Image, ImageDraw

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
rep_p = os.path.join(src, 'v33.json')
if os.path.exists(rep_p):
    rep = json.load(open(rep_p, encoding='utf-8'))
    rows = [r for r in rep['rows'] if r.get('file') and os.path.exists(os.path.join(src, r['file']))]
    COLS = ['1-首屏', '2-千手院', '3-赛博杂货铺', '4-标本', '5-文物', '6-法典', '7-开天', '半路-第三幕名字聚到一半', '半路-开天那句话聚到一半']
    TAG = ['1', '2', '3', '4', '5', '6', '7', 'half-3', 'half-7']
    for eng in sorted({r['engine'] for r in rows}):
        mine = [r for r in rows if r['engine'] == eng]
        keys = []
        for r in mine:
            k = (r['size'], r['lang'])
            if k not in keys:
                keys.append(k)
        H = 300
        cw = {k: round(H * int(k[0].split('x')[0]) / int(k[0].split('x')[1])) for k in keys}
        colw = max(cw.values())
        sheet = Image.new('RGB', (8 + len(COLS) * (colw + 8), 8 + len(keys) * (H + 8)), (22, 22, 22))
        dr = ImageDraw.Draw(sheet)
        for i, k in enumerate(keys):
            for r in mine:
                if (r['size'], r['lang']) != k or r['shot'] not in COLS:
                    continue
                c = COLS.index(r['shot'])
                im = Image.open(os.path.join(src, r['file'])).convert('RGB').resize((cw[k], H), Image.LANCZOS)
                x, y = 8 + c * (colw + 8), 8 + i * (H + 8)
                sheet.paste(im, (x, y))
                bad = r.get('errors')
                dr.text((x + 4, y + 3), f"{k[0]} {k[1]} {TAG[c]}{' !' if bad else ''}", fill=(255, 96, 96) if bad else (210, 210, 210))
        sheet.save(os.path.join(dst, f'{eng}-v33-总览.jpg'), quality=84)
        print(eng, len(mine), '张')

# 录屏 → gif（宽 360，12 帧/秒，调色板两遍：颜色不脏）
if len(sys.argv) > 3 and os.path.isdir(sys.argv[3]):
    vd = sys.argv[3]
    for f in sorted(os.listdir(vd)):
        if not f.endswith('.webm'):
            continue
        a = os.path.join(vd, f)
        b = os.path.join(dst, f[:-5] + '.gif')
        try:
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', a, '-vf',
                            'fps=12,scale=360:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4', b], check=True)
            print('gif', b, os.path.getsize(b) // 1024, 'KB')
        except Exception as e:  # 没有 ffmpeg：留着 webm
            print('gif 没转成', f, e)
