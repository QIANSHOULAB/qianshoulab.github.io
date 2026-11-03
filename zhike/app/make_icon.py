"""生成 exe 图标 zhike.ico（同时是窗口图标；仓库里不放二进制，打包时现画）。图形跟总舵首页卡片一样，见 zhike/icon.py。"""
from zhike.icon import save_ico

print(save_ico("zhike.ico"))
