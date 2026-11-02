"""生成 exe 图标 zhike.ico（不在仓库里放二进制图片）。"""
from app import tray_image

img = tray_image().resize((256, 256))
img.save("zhike.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("zhike.ico")
