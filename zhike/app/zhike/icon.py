"""知客僧的图标：跟总舵首页那张卡同一个图形同一个颜色（赭色渐变圆角方块 + 白信封）。

exe 图标（zhike.ico，同时是窗口图标）、托盘图标都从这儿画；介绍页的 favicon 是同一个图形的 SVG（zhike/icon.svg）。
用 Pillow 先画 1024 再缩，边缘是平的。仓库里不放 .ico，打包时现画。
"""
from __future__ import annotations

TOP, BOTTOM = (240, 154, 107), (194, 85, 42)     # #F09A6B → #C2552A，首页卡片的渐变
INK = (194, 85, 42, 255)                          # 信封盖的线：#C2552A

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F09A6B"/><stop offset="1" stop-color="#C2552A"/></linearGradient></defs>
<rect width="64" height="64" rx="15" fill="url(#g)"/>
<rect x="11" y="19" width="42" height="28" rx="4.5" fill="#fff"/>
<path d="M13.5 22.5L32 35.5l18.5-13" stroke="#C2552A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
"""


def draw(size: int = 256, pad: float = 0.0):
    """画一张 size×size 的图标（RGBA）。pad：四周留白的比例（托盘图标不留白，窗口图标也不留）。"""
    from PIL import Image, ImageDraw
    S = 1024
    u = S / 64.0
    grad = Image.new("RGBA", (1, S))
    for y in range(S):
        t = y / (S - 1)
        grad.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)) + (255,))
    grad = grad.resize((S, S))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=round(15 * u), fill=255)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((11 * u, 19 * u, 53 * u, 47 * u), radius=round(4.5 * u), fill=(255, 255, 255, 255))
    pts = [(13.5 * u, 22.5 * u), (32 * u, 35.5 * u), (50.5 * u, 22.5 * u)]
    w = round((3 if size >= 40 else 4.5) * u)      # 托盘、任务栏那几个小尺寸：信封盖的线加粗一点，16 像素也看得清
    d.line(pts, fill=INK, width=w, joint="curve")
    for x, y in (pts[0], pts[-1]):        # 圆头
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=INK)
    if pad:
        inner = round(S * (1 - 2 * pad))
        small = img.resize((inner, inner), Image.Resampling.LANCZOS)
        img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        img.paste(small, ((S - inner) // 2, (S - inner) // 2), small)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def save_ico(path: str):
    img = draw(256)
    sizes = [(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)]
    frames = [draw(w) for w, _ in sizes[:-1]]
    img.save(path, sizes=sizes, append_images=frames)
    return path
