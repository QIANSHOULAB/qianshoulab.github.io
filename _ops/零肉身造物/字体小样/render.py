"""零肉身造物 中文字体三个方向的小样：现在 / A 星宿字 / B 光书 / C 利落标题字。
用法：python3 -I render.py <站点字体目录> <笔画数据目录> <得意黑字体文件> <输出 png>
"""
import json, math, random, re, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

FONT_DIR, HWD_DIR, SMILEY, OUT = sys.argv[1:5]
W, PH = 1170, 860
BG_TOP, BG_BOT = (5, 7, 14), (11, 16, 30)
WORD = '零肉身造物'
ROW1, ROW2 = ['千手院', '赛博杂货铺'], ['标本', '文物', '法典']
EN = 'ZERO-FLESH CREATION'

def font(name, size):
    return ImageFont.truetype(f'{FONT_DIR}/{name}.ttf', size)

def hwd(ch):
    return json.load(open(f'{HWD_DIR}/{ch}.json', encoding='utf-8'))

# ---------- 背景：墨蓝夜空 + 稀疏星点 ----------
def background(seed):
    im = Image.new('RGB', (W, PH))
    px = im.load()
    for y in range(PH):
        t = y / (PH - 1)
        c = tuple(round(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3))
        for x in range(W):
            px[x, y] = c
    rnd = random.Random(seed)
    d = ImageDraw.Draw(im)
    for _ in range(170):
        x, y = rnd.uniform(0, W), rnd.uniform(0, PH)
        b = rnd.random() ** 3
        v = int(60 + 150 * b)
        r = 0.6 + 1.2 * b
        d.ellipse([x - r, y - r, x + r, y + r], fill=(v, v, min(255, v + 18)))
    return im

def glow_merge(base, layer, strength=(0.55, 0.35), radii=(5, 16), tint=(255, 255, 255)):
    """layer：黑底白字的 L 图。加两层光晕再叠清楚的那层。"""
    out = base.copy()
    for s, r in zip(strength, radii):
        g = layer.filter(ImageFilter.GaussianBlur(r)).point(lambda v: int(v * s))
        col = Image.merge('RGB', [g.point(lambda v, k=k: v * k // 255) for k in tint])
        out = ImageChops.add(out, col)
    col = Image.merge('RGB', [layer.point(lambda v, k=k: v * k // 255) for k in tint])
    return ImageChops.lighter(out, col)

def label(im, text, sub):
    d = ImageDraw.Draw(im)
    d.text((44, 34), text, font=font('zero-display-300', 30), fill=(200, 205, 220))
    if sub:
        d.text((44, 74), sub, font=font('zero-display-200', 22), fill=(120, 128, 150))

def draw_en(layer, y):
    d = ImageDraw.Draw(layer)
    f = font('zero-display-300', 30)
    track = 0.42 * 30
    widths = [d.textlength(c, font=f) for c in EN]
    tw = sum(widths) + track * (len(EN) - 1)
    x = (W - tw) / 2
    for c, w in zip(EN, widths):
        d.text((x, y), c, font=f, fill=210)
        x += w + track

def text_row(layer, items, f, y, track_em, gap):
    """一行若干词，按字距排开、整体居中。"""
    d = ImageDraw.Draw(layer)
    size = f.size
    words = []
    for w in items:
        ws = [d.textlength(c, font=f) for c in w]
        words.append((w, ws, sum(ws) + size * track_em * (len(w) - 1)))
    total = sum(x[2] for x in words) + gap * (len(words) - 1)
    x = (W - total) / 2
    for w, ws, tw in words:
        xx = x
        for c, cw in zip(w, ws):
            d.text((xx, y), c, font=f, fill=255)
            xx += cw + size * track_em
        x += tw + gap

# ---------- 笔画数据 ----------
def tr(pt, ox, oy, s):
    return (ox + pt[0] * s / 1024, oy + (900 - pt[1]) * s / 1024)

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    n = math.hypot(dx, dy) or 1e-9
    best, idx = -1, 0
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i]
        dist = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / n
        if dist > best:
            best, idx = dist, i
    if best > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]

def parse_path(dstr):
    toks = re.findall(r'[MLQCZ]|-?\d+(?:\.\d+)?', dstr)
    polys, cur, i, pos = [], [], 0, (0, 0)
    def num():
        nonlocal i
        v = float(toks[i]); i += 1; return v
    cmd = None
    while i < len(toks):
        t = toks[i]
        if t in 'MLQCZ':
            cmd = t; i += 1
            if t == 'Z':
                if cur: polys.append(cur); cur = []
                continue
        if cmd == 'M':
            if cur: polys.append(cur)
            pos = (num(), num()); cur = [pos]; cmd = 'L'
        elif cmd == 'L':
            pos = (num(), num()); cur.append(pos)
        elif cmd == 'Q':
            c1 = (num(), num()); p = (num(), num())
            for k in range(1, 9):
                u = k / 8
                cur.append(((1-u)**2*pos[0] + 2*(1-u)*u*c1[0] + u*u*p[0], (1-u)**2*pos[1] + 2*(1-u)*u*c1[1] + u*u*p[1]))
            pos = p
        elif cmd == 'C':
            c1 = (num(), num()); c2 = (num(), num()); p = (num(), num())
            for k in range(1, 11):
                u = k / 10
                cur.append(((1-u)**3*pos[0] + 3*(1-u)**2*u*c1[0] + 3*(1-u)*u*u*c2[0] + u**3*p[0],
                            (1-u)**3*pos[1] + 3*(1-u)**2*u*c1[1] + 3*(1-u)*u*u*c2[1] + u**3*p[1]))
            pos = p
    if cur: polys.append(cur)
    return polys

# ---------- A 星宿字 ----------
def constellation(lines_layer, stars, ch, ox, oy, s, lw, rstar):
    d = ImageDraw.Draw(lines_layer)
    nodes = []
    for med in hwd(ch)['medians']:
        key = rdp([tuple(p) for p in med], 38)
        pts = [tr(p, ox, oy, s) for p in key]
        d.line(pts, fill=225, width=lw, joint='curve')
        for p in (pts[0], pts[-1]):          # 只在一笔的起点、终点放星，拐弯不放
            if all(math.hypot(p[0]-q[0], p[1]-q[1]) > s * 0.07 for q in nodes):
                nodes.append(p)
    stars.extend((p, rstar) for p in nodes)

def draw_stars(layer, stars):
    d = ImageDraw.Draw(layer)
    for (x, y), r in stars:
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)

def word_boxes(chars, size, track, y):
    total = len(chars) * size + (len(chars) - 1) * track
    x = (W - total) / 2
    out = []
    for c in chars:
        out.append((c, x, y)); x += size + track
    return out

def row_boxes(words, size, track, gap, y):
    total = sum(len(w) * size + (len(w) - 1) * track for w in words) + gap * (len(words) - 1)
    x = (W - total) / 2
    out = []
    for w in words:
        for c in w:
            out.append((c, x, y)); x += size + track
        x += gap - track
    return out

def panel_a():
    im = background(2)
    lines = Image.new('L', (W, PH)); stars_l = Image.new('L', (W, PH)); en = Image.new('L', (W, PH))
    stars = []
    for c, x, y in word_boxes(WORD, 168, 26, 250):
        constellation(lines, stars, c, x, y, 168, 3, 4.6)
    for c, x, y in row_boxes(ROW1, 92, 12, 70, 500) + row_boxes(ROW2, 92, 12, 70, 640):
        constellation(lines, stars, c, x, y, 92, 2, 2.9)
    draw_stars(stars_l, stars)
    draw_en(en, 170)
    im = glow_merge(im, lines, strength=(0.55, 0.3), radii=(3, 11), tint=(205, 220, 255))
    im = glow_merge(im, stars_l, strength=(0.8, 0.5), radii=(4, 12))
    im = glow_merge(im, en, strength=(0.4, 0.2), radii=(4, 12))
    label(im, 'A', 'xingxiu  /  a star at each stroke end, hairlines along the stroke')
    return im

# ---------- B 光书 ----------
def brush_char(layer, ch, ox, oy, s, upto=None, frac=1.0, comet=None):
    d = ImageDraw.Draw(layer)
    data = hwd(ch)
    n = len(data['strokes']) if upto is None else upto
    for k in range(n):
        for poly in parse_path(data['strokes'][k]):
            d.polygon([tr(p, ox, oy, s) for p in poly], fill=255)
    if upto is not None and upto < len(data['strokes']):
        # 正在写的那一笔：只露出前 frac 段（沿中线画粗线当遮罩），笔头一颗亮点
        med = [tr(p, ox, oy, s) for p in data['medians'][upto]]
        seg = [math.hypot(med[i+1][0]-med[i][0], med[i+1][1]-med[i][1]) for i in range(len(med)-1)]
        L, acc, cut = sum(seg), 0, [med[0]]
        for i, sl in enumerate(seg):
            if acc + sl >= L * frac:
                u = (L * frac - acc) / sl
                cut.append((med[i][0] + (med[i+1][0]-med[i][0]) * u, med[i][1] + (med[i+1][1]-med[i][1]) * u)); break
            acc += sl; cut.append(med[i+1])
        mask = Image.new('L', layer.size); md = ImageDraw.Draw(mask)
        md.line(cut, fill=255, width=int(s * 0.16), joint='curve')
        stroke = Image.new('L', layer.size); sd = ImageDraw.Draw(stroke)
        for poly in parse_path(data['strokes'][upto]):
            sd.polygon([tr(p, ox, oy, s) for p in poly], fill=255)
        layer.paste(ImageChops.lighter(layer, ImageChops.multiply(stroke, mask)))
        if comet is not None:
            comet.append(cut[-1])

def panel_b():
    im = background(3)
    ink = Image.new('L', (W, PH)); head = Image.new('L', (W, PH)); en = Image.new('L', (W, PH))
    heads = []
    boxes = word_boxes(WORD, 168, 18, 250)
    for i, (c, x, y) in enumerate(boxes):
        if i < len(boxes) - 1:
            brush_char(ink, c, x, y, 168)
        else:
            brush_char(ink, c, x, y, 168, upto=5, frac=0.55, comet=heads)
    for c, x, y in row_boxes(ROW1, 92, 8, 70, 500) + row_boxes(ROW2, 92, 8, 70, 640):
        brush_char(ink, c, x, y, 92)
    hd = ImageDraw.Draw(head)
    for (x, y) in heads:
        for r, v in ((22, 60), (12, 140), (6, 255)):
            hd.ellipse([x - r, y - r, x + r, y + r], fill=v)
    ink = ink.point(lambda v: int(v * 0.92))
    draw_en(en, 170)
    im = glow_merge(im, ink, strength=(0.45, 0.3), radii=(4, 14), tint=(255, 236, 205))
    im = glow_merge(im, head, strength=(1.0, 0.8), radii=(8, 26), tint=(255, 245, 225))
    im = glow_merge(im, en, strength=(0.4, 0.2), radii=(4, 12))
    label(im, 'B', 'guangshu  /  written stroke by stroke by a comet (frozen mid-stroke)')
    return im

# ---------- 现在、C：直接排字 ----------
def panel_font(tag, sub, f_big, f_row, track_big, track_row, seed):
    im = background(seed)
    lay = Image.new('L', (W, PH)); en = Image.new('L', (W, PH))
    text_row(lay, [WORD], f_big, 250, track_big, 0)
    text_row(lay, ROW1, f_row, 500, track_row, 70)
    text_row(lay, ROW2, f_row, 640, track_row, 70)
    draw_en(en, 170)
    im = glow_merge(im, lay, strength=(0.45, 0.25), radii=(4, 14))
    im = glow_merge(im, en, strength=(0.4, 0.2), radii=(4, 12))
    label(im, tag, sub)
    return im

for ch in set(WORD + ''.join(ROW1 + ROW2)):
    hwd(ch)
cur_big = font('zero-hei-sc-200', 150)
cur_row = font('zero-hei-sc-300', 84)
assert all(cur_big.getmask(c).getbbox() for c in WORD), 'site subset misses a character'
now = panel_font('NOW', 'now  /  Noto Sans SC ExtraLight, letter-spacing .3-.6em', cur_big, cur_row, 0.6, 0.3, 1)
sm_big = ImageFont.truetype(SMILEY, 168)
sm_row = ImageFont.truetype(SMILEY, 92)
c = panel_font('C', 'Smiley Sans  /  normal weight, normal spacing', sm_big, sm_row, 0.06, 0.04, 4)
panels = [now, panel_a(), panel_b(), c]
gap = 10
sheet = Image.new('RGB', (W, PH * len(panels) + gap * (len(panels) - 1)), (30, 34, 46))
for i, p in enumerate(panels):
    sheet.paste(p, (0, i * (PH + gap)))
sheet.save(OUT, optimize=True)
for i, (p, n) in enumerate(zip(panels, ['now', 'a', 'b', 'c'])):
    p.save(OUT.replace('.png', f'-{n}.png'), optimize=True)
print('ok', sheet.size)
