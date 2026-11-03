"""扫地僧比武：造假文件夹 + 标准答案。

用法：python gen.py <输出目录> <场景> [--seed 7]
场景：R1 加序号 / R2 替换文字 / R3 加日期 / R4 照片按拍摄时间 / R5 大小写 / R6 去多余空格
      O1 按类型分 / O2 照片按拍摄月份分 / ALL（全部造一遍）
每个场景造出 <输出目录>/<场景>/（只放在这里，跑完就扔）和 <输出目录>/<场景>.answer.json：
  {"files": {"原相对路径": {"want": ["可接受的结果相对路径", ...], "kind": "普通|撞名|占用|跳过|无EXIF|超长"}}}
want 里 "*bump*" 表示「原目标名加任意避让后缀都算对」，"*same*" 表示保持原样也算对。
标准答案是这里自己算的（不调扫地僧的代码），规则写在每个场景函数的注释里。
假数据：文件名里的人名公司名全是编的，内容只有一行编号。
"""
from __future__ import annotations

import datetime as dt
import json
import os
import random
import re
import shutil
import subprocess
import sys
import unicodedata

PIL_OK = True
try:
    from PIL import Image
except ImportError:  # pragma: no cover
    PIL_OK = False

BASE_T = dt.datetime(2024, 1, 1, 9, 0, 0)

CN_WORDS = ["报告", "会议纪要", "合同", "发票", "春节", "旅行", "方案", "预算", "周报", "简历", "海报", "说明书",
            "第一季度", "项目计划", "采购单", "报价", "年会", "培训", "客户回访", "产品图"]
FAKE_PEOPLE = ["张三", "李四", "王五", "赵六", "小明", "小红"]  # 通用占位名，不是真人
SPECIAL = ["#1", "&", "%20", "(终版)", "【草稿】", "[v2]", "@home", "+", "~", "!", "'单引号'", "，逗号", "😀", "é", "ß"]


def touch(path, data: bytes, mtime: dt.datetime | None = None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    if mtime:
        ts = mtime.timestamp()
        os.utime(path, (ts, ts))


def body(i: int, ext: str) -> bytes:
    return f"SAODI-BENCH #{i} {ext}\n".encode()


def jpeg(path, i: int, taken: dt.datetime | None, model="FakeCam X1", mtime=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = Image.new("RGB", (16, 12), ((i * 37) % 255, (i * 91) % 255, (i * 53) % 255))
    if taken:
        ex = Image.Exif()
        ex[0x010F] = "FakeMaker"
        ex[0x0110] = model
        ex[0x0132] = (taken + dt.timedelta(days=3)).strftime("%Y:%m:%d %H:%M:%S")  # DateTime（修改时间）故意跟拍摄不一样
        ifd = ex.get_ifd(0x8769)
        ifd[0x9003] = taken.strftime("%Y:%m:%d %H:%M:%S")
        ifd[0x9004] = taken.strftime("%Y:%m:%d %H:%M:%S")
        im.save(path, "JPEG", exif=ex.tobytes(), comment=f"id{i}".encode())
    else:
        im.save(path, "JPEG", comment=f"id{i}".encode())
    if mtime:
        os.utime(path, (mtime.timestamp(), mtime.timestamp()))


def natural_key(s: str):
    return [(0, int(t), "") if t.isdigit() else (1, 0, t) for t in re.split(r"(\d+)", s.casefold()) if t != ""]


def splitext(n: str):
    i = n.rfind(".")
    if i <= 0:
        return n, ""
    return n[:i], n[i:]


def fit255(name: str) -> str:
    """Linux 单个名字 255 字节；超了截主名。答案里用前缀匹配，不卡死截法。"""
    if len(name.encode()) <= 255:
        return name
    s, e = splitext(name)
    b = s.encode()[: 255 - len(e.encode())]
    return b.decode("utf-8", "ignore") + e


def lock(path):
    """模拟「文件被占用」：chattr +i，连 root 都改不了名。跑完 cleanup 解开。"""
    r = subprocess.run(["chattr", "+i", path], capture_output=True)
    return r.returncode == 0


class Ans:
    def __init__(self):
        self.files = {}

    def add(self, rel, want, kind="普通"):
        self.files[rel] = {"want": want if isinstance(want, list) else [want], "kind": kind}


def mixed_names(rng, n, prefix=""):
    """n 个互不相同、带刁钻字符的主名（不含扩展名）。"""
    out, seen = [], set()
    k = 0
    while len(out) < n:
        k += 1
        w = rng.choice(CN_WORDS)
        style = k % 9
        if style == 0:
            s = f"{w}{rng.choice(SPECIAL)}{k}"
        elif style == 1:
            s = f"第{k}章 {w}"
        elif style == 2:
            s = f"Scan_{k:04d}"
        elif style == 3:
            s = f"{rng.choice(FAKE_PEOPLE)}的{w} {k}"
        elif style == 4:
            s = f"{w}（{k}）"
        elif style == 5:
            s = f"photo {k}"
        elif style == 6:
            s = f"{w}_v{k}.final"   # 主名里有点
        elif style == 7:
            s = f"Doc{k}"
        else:
            s = f"{w}-{k}"
        s = prefix + s
        if s.casefold() not in seen:
            seen.add(s.casefold())
            out.append(s)
    return out


EXTS = [".docx", ".pdf", ".xlsx", ".txt", ".jpg", ".png", ".pptx", ".zip", ".mp3", ".csv"]


# ------------------------------------------------------------------ 改名场景
def R1(root, rng):
    """加序号：1000 个文件，按资源管理器的自然顺序（第2章 在 第10章 前，不分大小写）排，
    名字前加 4 位序号和「-」：0001-原名.扩展名。含 1 个被占用文件、2 个接近 255 字节的长名。
    被占用的照样占一个序号（用户在预览里看到的就是这样），保持原名算对。"""
    a = Ans()
    # 名字分 10 家：「字母 + 固定中文/特殊字符 + 数字 + 尾巴」。同家前缀相同，顺序只看数字（2 在 10 前），
    # 家与家靠开头的 ASCII 大写字母定序 —— 避开拼音/笔画排序的地区差异，标准答案没有争议。
    fams = ["A 报告#", "B 会议纪要 第", "C Scan_", "D 小明的方案（", "E photo ", "F 预算&", "G 【草稿】合同", "H 发票_v", "J 年会 😀 ", "K Doc"]
    names = []
    for i in range(997):
        f = fams[i % 10]
        tail = rng.choice(["", " 终版", "）", " (2)", ".final"])
        names.append(f"{f}{i // 10 + 1}{tail}{EXTS[i % len(EXTS)]}")
    names += ["X" + "长" * 82 + ".txt", "Y" + "超长名字测试" * 13 + "测试.docx"]  # 251 字节（加序号就超 255）、246 字节
    names.append("Z 被占用的周报.docx")
    order = sorted(names, key=natural_key)
    for i, n in enumerate(names):
        touch(os.path.join(root, n), body(i, n), BASE_T + dt.timedelta(minutes=i))
    for k, n in enumerate(order):
        want = fit255(f"{k + 1:04d}-{n}")
        if "被占用" in n:
            a.add(n, [n], "占用")
            lock(os.path.join(root, n))
        elif len(n.encode()) > 248:
            a.add(n, ["*prefix*" + f"{k + 1:04d}-", n], "超长")
        else:
            a.add(n, want)
    return a


def R2(root, rng):
    """替换文字：主名里的「IMG_」（大写，区分大小写）换成「旅行_」。
    300 个 IMG_ 文件；其中 20 个的目标名已被文件夹里现成的「旅行_xxx.jpg」占着 → 必须避让，绝不覆盖；
    现成的那 20 个保持不动；另有 30 个不含 IMG_ 的文件不动；扩展名里的字不算。"""
    a = Ans()
    for i in range(300):
        tail = rng.choice(["", " 春节", " #3", "（副本）", "_海边&日落", " 小明拍"])
        n = f"IMG_{i:04d}{tail}.jpg"
        touch(os.path.join(root, n), body(i, n))
        target = n.replace("IMG_", "旅行_", 1)
        if i < 20:
            touch(os.path.join(root, target), body(1000 + i, target))
            a.add(target, target, "撞名原主")
            a.add(n, ["*bump*" + target], "撞名")
        else:
            a.add(n, target)
    for i in range(30):
        n = f"说明_{i}.IMG_"  # 扩展名里有 IMG_，不该动
        touch(os.path.join(root, n), body(2000 + i, n))
        a.add(n, n)
    return a


def R3(root, rng):
    """加日期：主名前加文件修改日期 YYYY-MM-DD 和一个空格。300 个文件，修改时间散在 2023-2025，
    其中 5 个跨午夜（23:59:59 / 00:00:00），按本机时区算。"""
    a = Ans()
    stems = mixed_names(rng, 300)
    for i, s in enumerate(stems):
        n = s + EXTS[i % len(EXTS)]
        if i < 5:
            t = dt.datetime(2024, 12, 31, 23, 59, 59) if i % 2 == 0 else dt.datetime(2025, 1, 1, 0, 0, 0)
        else:
            t = dt.datetime(2023, 1, 1) + dt.timedelta(hours=rng.randrange(0, 3 * 365 * 24), seconds=rng.randrange(3600))
        touch(os.path.join(root, n), body(i, n), t)
        a.add(n, f"{t:%Y-%m-%d} {n}")
    return a


def R4(root, rng):
    """照片按拍摄时间改名：YYYYMMDD_HHMMSS.jpg（拍摄时间 = EXIF DateTimeOriginal）。
    400 张带 EXIF（其中 10 对同一秒拍的 → 第二张避让）；100 张没 EXIF 的 jpg、50 张 png：
    保持原名算对，用修改时间命名也接受（记「降级」）。EXIF 里的 DateTime（修改时间）故意不同，用错就错。
    文件修改时间故意设成导入时间（2025-06-01），用错也错。"""
    a = Ans()
    imp = dt.datetime(2025, 6, 1, 12, 0, 0)
    for i in range(400):
        pair = i < 20
        taken = dt.datetime(2024, 5, 1, 8, 0, 0) + dt.timedelta(minutes=37 * (i // 2 if pair else i), seconds=(i // 2 if pair else i) % 60)
        n = f"DSC{i:05d}.JPG" if i % 3 else f"微信图片_{i}.jpg"
        jpeg(os.path.join(root, n), i, taken, mtime=imp + dt.timedelta(seconds=i))
        ext = splitext(n)[1]
        want = f"{taken:%Y%m%d_%H%M%S}"
        if pair and i % 2 == 1:
            a.add(n, ["*bump*" + want + ext, "*bump*" + want + ext.lower()], "撞名")
        else:
            a.add(n, [want + ext, want + ext.lower()] + (["*bump*" + want + ext, "*bump*" + want + ext.lower()] if pair else []),
                  "撞名" if pair else "普通")
    for i in range(100):
        n = f"截图_{i}.jpg"
        m = imp + dt.timedelta(hours=i)
        jpeg(os.path.join(root, n), 500 + i, None, mtime=m)
        a.add(n, [n, "*bump*" + f"{m:%Y%m%d_%H%M%S}.jpg"], "无EXIF")
    for i in range(50):
        n = f"表情包 {i}.png"
        m = imp + dt.timedelta(days=1, hours=i)
        p = os.path.join(root, n)
        os.makedirs(root, exist_ok=True)
        Image.new("RGB", (8, 8), (i, 0, 0)).save(p, "PNG")
        os.utime(p, (m.timestamp(), m.timestamp()))
        a.add(n, [n, "*bump*" + f"{m:%Y%m%d_%H%M%S}.png"], "无EXIF")
    return a


def R5(root, rng):
    """大小写：整个文件名（含扩展名）改小写。300 个文件，其中 15 对「只差大小写」的名字
    （ABC.TXT 和 abc.txt 同时在，Windows 上不可能，Linux/网盘/U 盘拷来会有）→ 小写后撞名必须避让；
    中文、全角字母不动，Ä→ä。"""
    a = Ans()
    stems = mixed_names(rng, 270)
    up_exts = [".DOCX", ".PDF", ".Jpg", ".TXT", ".XlsX", ".png"]
    for i, s in enumerate(stems):
        s2 = s.upper() if i % 3 == 0 else s.title() if i % 3 == 1 else s
        if i % 10 == 0:
            s2 += " ÄÖÜ Ｆｕｌｌ"
        n = s2 + up_exts[i % len(up_exts)]
        touch(os.path.join(root, n), body(i, n))
        a.add(n, n.lower())
    for i in range(15):
        lo = f"pair{i}.txt"
        hi = f"PAIR{i}.TXT"
        touch(os.path.join(root, lo), body(500 + i, lo))
        touch(os.path.join(root, hi), body(600 + i, hi))
        a.add(lo, [lo, "*bump*" + lo], "撞名")
        a.add(hi, ["*bump*" + lo], "撞名")
    return a


def R6(root, rng):
    """去多余空格：主名首尾空格去掉、中间连续空格（含全角空格、Tab）并成一个半角空格；扩展名不动。
    200 个文件；10 对「整理后撞名」（a  b.txt 与 a b.txt）→ 避让；全角空格算空格。"""
    a = Ans()
    stems = mixed_names(rng, 200)
    for i, s in enumerate(stems):
        w = s.replace(" ", rng.choice(["  ", "   ", "　", " 　 "]))
        if i % 4 == 0:
            w = "  " + w
        if i % 4 == 1:
            w = w + "   "
        if i % 4 == 2:
            w = w.replace(w[:2], w[:2] + "  ", 1) if len(w) > 2 else w + " "
        n = w + EXTS[i % len(EXTS)]
        touch(os.path.join(root, n), body(i, n))
        want = re.sub(r"[ \t　]+", " ", splitext(n)[0]).strip() + splitext(n)[1]
        a.add(n, want if want != n else n)
    for i in range(10):
        clean = f"会议 纪要 {i}.docx"
        messy = f"会议  纪要　{i}.docx"
        touch(os.path.join(root, clean), body(800 + i, clean))
        touch(os.path.join(root, messy), body(900 + i, messy))
        a.add(clean, clean, "撞名原主")
        a.add(messy, ["*bump*" + clean], "撞名")
    return a


# ------------------------------------------------------------------ 分文件夹场景
TYPE_MAP = {
    "图片": "jpg jpeg png gif bmp webp heic tif tiff",
    "文档": "pdf doc docx txt rtf md wps",
    "表格": "xls xlsx csv",
    "演示": "ppt pptx key",
    "压缩包": "zip rar 7z tar gz tgz",
    "音频": "mp3 wav flac m4a aac",
    "视频": "mp4 mov avi mkv",
    "安装包": "exe msi dmg apk",
}
EXT2TYPE = {"." + e: k for k, v in TYPE_MAP.items() for e in v.split()}


def O1(root, rng):
    """按类型分：第一层的文件按扩展名（不分大小写）挪进 图片/文档/表格/演示/压缩包/音频/视频/安装包，
    认不出的（含无扩展名）进「其他」。1500 个文件 + 刁钻：
      - 目标子文件夹里已有同名文件（30 个）→ 避让，绝不覆盖；
      - .JPG/.Pdf 大写扩展名；a.tar.gz 算压缩包；
      - 下载中的 .part/.crdownload、Office 临时 ~$xxx.docx、隐藏 .xxx → 不该动；
      - 1 个被占用 → 不动；
      - 子文件夹里的文件不动（只分第一层），其中一条 300+ 字符的超长路径。"""
    a = Ans()
    stems = mixed_names(rng, 1440)
    pool = [".jpg", ".JPG", ".png", ".pdf", ".Pdf", ".docx", ".txt", ".xlsx", ".csv", ".pptx", ".zip", ".tar.gz",
            ".mp3", ".mp4", ".exe", ".heic", ".7z", ".md", ".dat", ".psd2", ""]
    for i, s in enumerate(stems):
        ext = pool[i % len(pool)]
        n = s + ext
        if ext == ".zip":  # 真压缩包，里面带中文名
            import zipfile
            os.makedirs(root, exist_ok=True)
            with zipfile.ZipFile(os.path.join(root, n), "w") as z:
                z.writestr(f"{s}/说明.txt", body(i, n))
        else:
            touch(os.path.join(root, n), body(i, n))
        e = ".gz" if ext == ".tar.gz" else ext.lower()
        cat = EXT2TYPE.get(e, "其他")
        a.add(n, f"{cat}/{n}")
    for i in range(30):
        n = f"重名文件{i}.pdf"
        touch(os.path.join(root, n), body(3000 + i, n))
        touch(os.path.join(root, "文档", n), body(3100 + i, n))
        a.add(f"文档/{n}", f"文档/{n}", "撞名原主")
        a.add(n, ["*bump*文档/" + n], "撞名")
    for n in ["季度报告.docx.part", "安装包.exe.crdownload", "~$会议纪要.docx", ".隐藏配置", "desktop.ini", "Thumbs.db"]:
        touch(os.path.join(root, n), body(4000, n))
        a.add(n, n, "跳过")
    n = "正在编辑的预算.xlsx"
    touch(os.path.join(root, n), body(4100, n))
    lock(os.path.join(root, n))
    a.add(n, [n], "占用")
    deep = os.path.join(root, "旧资料", *(["很深的文件夹名字很长很长很长很长" * 2] * 6))
    for i in range(5):
        n = f"深处的文件{i}.pdf"
        touch(os.path.join(deep, n), body(4200 + i, n))
        rel = os.path.relpath(os.path.join(deep, n), root)
        a.add(rel, rel, "超长")
    return a


def O2(root, rng):
    """照片按拍摄月份分：照片挪进 YYYY/YYYY-MM（EXIF 拍摄时间）。
    600 张带 EXIF（拍摄时间散在 2022-2025，含月底 23:59:59）；150 张没 EXIF 的 jpg：
    按修改时间分也算对、留在原地也算对（记「降级」）；50 个非照片文件（pdf/docx）不动；
    目标月份文件夹里已有同名照片 10 张 → 避让。"""
    a = Ans()
    for i in range(600):
        if i < 6:
            taken = dt.datetime(2023, 1 + i, 28, 23, 59, 59) + dt.timedelta(days=3 if i % 2 else 0)
        else:
            taken = dt.datetime(2022, 1, 1) + dt.timedelta(minutes=rng.randrange(0, 4 * 365 * 24 * 60))
        n = f"IMG_{i:04d}.jpg" if i % 2 else f"P{i:05d}.JPG"
        jpeg(os.path.join(root, n), i, taken, mtime=dt.datetime(2025, 9, 9, 9, 9, 9))
        d = f"{taken:%Y}/{taken:%Y-%m}"
        if i < 10:
            jpeg(os.path.join(root, d, n), 5000 + i, taken)
            a.add(f"{d}/{n}", f"{d}/{n}", "撞名原主")
            a.add(n, ["*bump*" + f"{d}/{n}"], "撞名")
        else:
            a.add(n, f"{d}/{n}")
    for i in range(150):
        n = f"Screenshot_{i}.jpg"
        m = dt.datetime(2025, 3, 1) + dt.timedelta(days=i)
        jpeg(os.path.join(root, n), 700 + i, None, mtime=m)
        a.add(n, [n, f"{m:%Y}/{m:%Y-%m}/{n}"], "无EXIF")
    for i in range(50):
        n = f"合同_{i}.pdf" if i % 2 else f"说明_{i}.docx"
        touch(os.path.join(root, n), body(900 + i, n))
        a.add(n, n)
    return a


SCENARIOS = {"R1": R1, "R2": R2, "R3": R3, "R4": R4, "R5": R5, "R6": R6, "O1": O1, "O2": O2}


def unlock_all(root):
    subprocess.run(["chattr", "-R", "-i", root], capture_output=True)


def make(out, name, seed=7):
    root = os.path.join(out, name)
    if os.path.exists(root):
        unlock_all(root)
        shutil.rmtree(root)
    os.makedirs(root)
    rng = random.Random(f"{seed}-{name}")
    ans = SCENARIOS[name](root, rng)
    inodes = {rel: os.lstat(os.path.join(root, rel)).st_ino for rel in ans.files}
    with open(os.path.join(out, name + ".answer.json"), "w", encoding="utf-8") as f:
        json.dump({"scenario": name, "doc": SCENARIOS[name].__doc__, "files": ans.files, "inodes": inodes}, f, ensure_ascii=False, indent=0)
    return root, ans


if __name__ == "__main__":
    out, which = sys.argv[1], sys.argv[2]
    names = list(SCENARIOS) if which == "ALL" else which.split(",")
    for n in names:
        root, ans = make(out, n)
        print(n, len(ans.files), "files ->", root)
