"""盯「下载」比准（0.3.0 起默认在岗，这场专门比它）：照各家下载工具真实的落盘方式造文件，
每 2 秒那一眼用 tick() 代替（不真等），看最后每个文件落在哪、有没有挪了不该挪的。

用法：python watch_bench.py <程序目录 app/> <版本> <输出 json>
  0.2.1：git archive <提交> saodi | tar -x -C /tmp/old ，程序目录给 /tmp/old/saodi/app

10 个场景（各在一个新的「下载」里，方案都是默认的「按类型」）：
  1 Chrome     Unconfirmed 123.crdownload → 报价单.pdf.crdownload → 报价单.pdf
  2 Firefox    先放 0 字节的「合同.docx」占位 + 合同.docx.part，下完 .part 盖过去
  3 aria2      直接写「电影.mp4」+ 电影.mp4.aria2 控制文件（默认 60 秒才存一次，中间不动），下完删控制文件
  4 迅雷        安装包.exe.xltd + 安装包.exe.xltd.cfg，下完改名、删 cfg
  5 百度网盘    资料.zip.baiduyun.p.downloading → 资料.zip
  6 系统/临时    ~$周报.docx、.DS_Store、desktop.ini、Thumbs.db 冒出来 —— 都不该动
  7 挪回来      分走的「报价单.pdf」人又挪回「下载」—— 不该再分走
  8 撤销        撤销自动分的那一批 —— 回来的不该再分走
  9 关着时来的  程序关着时下了「昨晚的.pdf」，再开 —— 该补分
  10 普通       一下写完的「截图.png」—— 进图片
Linux 上没有「被占用」：Windows 上下载工具开着正在写的文件，两版都会等（in_use），所以这里让正在下的文件每一眼都在长，
不拿「写到一半停了」去难为 0.2.1；只算 Windows 上也会出的错（占位、控制文件、cfg 不是开着的）。
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile

app, ver, out = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, os.path.abspath(app))
os.environ["SAODI_HOME"] = tempfile.mkdtemp(prefix="saodi-wb-home-")
from saodi import ops, organize, watch  # noqa: E402

ROOT = tempfile.mkdtemp(prefix="saodi-wb-")
NEW = ver != "0.2.1"


def mk(folder, state=None):
    if NEW:
        return watch.Watcher(folder, organize.PRESETS[0], state_path=state)
    return watch.Watcher(folder, organize.PRESETS[0])


def put(path, data):
    with open(path, "ab") as f:
        f.write(data)


def rm(path):
    """下载工具删自己的控制文件；被盯梢挪走了就删不着（它留在别处，算错）。"""
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def mv(a, b):
    try:
        os.replace(a, b)
    except FileNotFoundError:
        pass


def ticks(w, n=1):
    done = []
    for _ in range(n):
        done += w.tick()
    return done


def tree(d):
    out = []
    for sub, _, files in os.walk(d):
        for f in files:
            p = os.path.join(sub, f)
            out.append((os.path.relpath(p, d).replace("\\", "/"), os.path.getsize(p)))
    return sorted(out)


def case(name):
    d = os.path.join(ROOT, name)
    os.makedirs(d)
    return d


def forgive(w, u):
    if NEW:
        w.forgive(u.get("paths", []))  # Api.undo 做的事（0.3.0 起）


RES = []


def judge(name, d, want, note):
    got = tree(d)
    ok = got == sorted(want)
    RES.append({"case": name, "ok": ok, "note": note, "got": got, "want": sorted(want)})


# 1 Chrome
d = case("1-chrome")
w = mk(d)
put(os.path.join(d, "Unconfirmed 123.crdownload"), b"a" * 1000)
ticks(w)
os.replace(os.path.join(d, "Unconfirmed 123.crdownload"), os.path.join(d, "报价单.pdf.crdownload"))
for _ in range(3):
    put(os.path.join(d, "报价单.pdf.crdownload"), b"a" * 1000)
    ticks(w)
ticks(w, 3)  # 卡住不动（.crdownload 无论如何不碰）
os.replace(os.path.join(d, "报价单.pdf.crdownload"), os.path.join(d, "报价单.pdf"))
ticks(w, 3)
judge("1 Chrome", d, [("文档/报价单.pdf", 4000)], "下完改名后才分")

# 2 Firefox：0 字节占位 + .part
d = case("2-firefox")
w = mk(d)
put(os.path.join(d, "合同.docx"), b"")
put(os.path.join(d, "合同.docx.part"), b"f" * 2000)
ticks(w, 3)  # 网慢，.part 一会儿没长（占位一直 0 字节）
put(os.path.join(d, "合同.docx.part"), b"f" * 2000)
ticks(w)
mv(os.path.join(d, "合同.docx.part"), os.path.join(d, "合同.docx"))
ticks(w, 3)
judge("2 Firefox 占位", d, [("文档/合同.docx", 4000)], "占位不该被挪；不该出现 合同 (2).docx")

# 3 aria2：控制文件
d = case("3-aria2")
w = mk(d)
put(os.path.join(d, "电影.mp4.aria2"), b"ctl" * 50)
for _ in range(4):
    put(os.path.join(d, "电影.mp4"), b"m" * 5000)  # 正在写（Windows 上开着，两版都会等）
    ticks(w)
rm(os.path.join(d, "电影.mp4.aria2"))
ticks(w, 3)
judge("3 aria2 控制文件", d, [("视频/电影.mp4", 20000)], ".aria2 被挪走 aria2 就续不了")

# 4 迅雷：.xltd + .xltd.cfg
d = case("4-thunder")
w = mk(d)
put(os.path.join(d, "安装包.exe.xltd.cfg"), b"cfg" * 30)
for _ in range(4):
    put(os.path.join(d, "安装包.exe.xltd"), b"x" * 3000)
    ticks(w)
mv(os.path.join(d, "安装包.exe.xltd"), os.path.join(d, "安装包.exe"))
rm(os.path.join(d, "安装包.exe.xltd.cfg"))
ticks(w, 3)
judge("4 迅雷 .xltd.cfg", d, [("安装包/安装包.exe", 12000)], ".cfg 被挪走迅雷就续不了")

# 5 百度网盘
d = case("5-baidu")
w = mk(d)
for _ in range(3):
    put(os.path.join(d, "资料.zip.baiduyun.p.downloading"), b"z" * 3000)
    ticks(w)
mv(os.path.join(d, "资料.zip.baiduyun.p.downloading"), os.path.join(d, "资料.zip"))
ticks(w, 3)
judge("5 百度网盘", d, [("压缩包/资料.zip", 9000)], "下完改名后才分")

# 6 系统、临时、隐藏
d = case("6-junk")
w = mk(d)
for n in ["~$周报.docx", ".DS_Store", "desktop.ini", "Thumbs.db"]:
    put(os.path.join(d, n), b"j" * 10)
ticks(w, 4)
judge("6 临时/隐藏/系统", d, [("~$周报.docx", 10), (".DS_Store", 10), ("desktop.ini", 10), ("Thumbs.db", 10)], "都不该动")

# 7 挪回来
d = case("7-moveback")
w = mk(d)
put(os.path.join(d, "报价单.pdf"), b"p" * 500)
ticks(w, 3)
mv(os.path.join(d, "文档", "报价单.pdf"), os.path.join(d, "报价单.pdf"))
ticks(w, 3)
judge("7 人挪回来", d, [("报价单.pdf", 500)], "人挪回来的不该再分走（文档 文件夹空了留着）")

# 8 撤销
d = case("8-undo")
w = mk(d)
put(os.path.join(d, "合同.pdf"), b"c" * 600)
put(os.path.join(d, "图.png"), b"g" * 700)
done = ticks(w, 3)
batch = next(r["batch"] for r in done if r.get("batch"))
u = ops.undo(batch)
forgive(w, u)
ticks(w, 3)
judge("8 撤销", d, [("合同.pdf", 600), ("图.png", 700)], "撤销回来的不该再分走")

# 9 关着时来的
d = case("9-catchup")
st = os.path.join(os.environ["SAODI_HOME"], "w9.json")
put(os.path.join(d, "老的.pdf"), b"o" * 100)
w = mk(d, st)
ticks(w, 2)
if NEW:
    w.stop()
put(os.path.join(d, "昨晚的.pdf"), b"y" * 300)
w = mk(d, st)
ticks(w, 3)
judge("9 关着时来的", d, [("老的.pdf", 100), ("文档/昨晚的.pdf", 300)], "再开该补分；开盯前就在的不碰")

# 10 普通
d = case("10-plain")
w = mk(d)
put(os.path.join(d, "截图.png"), b"s" * 800)
ticks(w, 3)
judge("10 普通", d, [("图片/截图.png", 800)], "一下写完的进图片")

res = {"version": ver, "cases": RES, "errors": sum(1 for r in RES if not r["ok"]), "total": len(RES)}
with open(out, "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
for r in RES:
    print(("对 " if r["ok"] else "错 ") + r["case"], "" if r["ok"] else f"得到 {r['got']}")
print(f"{ver}: 错 {res['errors']}/{res['total']}")
shutil.rmtree(ROOT, ignore_errors=True)
