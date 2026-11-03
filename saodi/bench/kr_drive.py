"""用 xdotool 在 Xvfb 里点 KRename 的界面（它的 --template 命令行参数在 5.0.2 里不生效，实测）。
用法：python kr_drive.py <输出目录> <场景> <文件名模板> <扩展名模板> [find=>replace]
步骤 = 真人要做的：开 KRename 加文件 → 4.Filename → Advanced → 填模板 → (Find and Replace) → Finish。
用时从点 Finish 算到文件夹里名字不再变化（另记从启动到界面就绪的时间）。"""
import json, os, subprocess, sys, time, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT, SC, TPL, EXT = sys.argv[1:5]
FR = sys.argv[5] if len(sys.argv) > 5 else ""
env = dict(os.environ, DISPLAY=":9")


def x(*a):
    subprocess.run(["xdotool", *map(str, a)], env=env, capture_output=True)


def shot(name):
    subprocess.run(["import", "-window", "root", os.path.join(OUT, name)], env=env)


def listing():
    return hashlib.md5("\n".join(sorted(os.listdir(os.path.join(OUT, SC)))).encode()).hexdigest()


subprocess.run([sys.executable, os.path.join(HERE, "gen.py"), OUT, SC], capture_output=True)
subprocess.run(["chown", "-R", "bench", os.path.join(OUT, SC)], capture_output=True)
files = sorted(os.path.join(OUT, SC, f) for f in os.listdir(os.path.join(OUT, SC)))
t0 = time.time()
p = subprocess.Popen(["runuser", "-u", "bench", "--", "env", "DISPLAY=:9", "HOME=/home/bench", "krename", *files],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(240):
    time.sleep(0.5)
    r = subprocess.run(["xdotool", "search", "--name", "^KRename$"], env=env, capture_output=True, text=True)
    if r.stdout.strip():
        break
time.sleep(float(os.environ.get("KR_LOAD", "30")))  # 窗口出来后还在读文件列表，等它读完再点
t_ready = time.time() - t0
clicks = 0
x("mousemove", 90, 68, "click", 1); clicks += 1           # Advanced Filename
time.sleep(0.5)
x("mousemove", 230, 115, "click", "--repeat", 3, 1); clicks += 1   # 模板框
x("key", "ctrl+a"); x("type", "--delay", 30, TPL); time.sleep(0.5)
x("mousemove", 455, 115, "click", "--repeat", 3, 1); clicks += 1
x("key", "ctrl+a"); x("type", "--delay", 30, EXT); time.sleep(0.5)
if FR:
    find, rep = FR.split("=>")
    x("mousemove", 91, 201, "click", 1); clicks += 1     # Find and Replace...
    time.sleep(1.5)
    shot(f"{SC}.krename.fr1.png")
    # 对话框坐标见 fr1 截图；由调用方先看图再补（KR_FR_STEPS 环境变量：JSON 列表 [["click",x,y],["type","…"],["key","…"]]）
    for st in json.loads(os.environ.get("KR_FR_STEPS", "[]")):
        if st[0] == "click":
            x("mousemove", st[1], st[2], "click", 1); clicks += 1
        elif st[0] == "type":
            x("type", "--delay", 30, st[1].replace("{find}", find).replace("{rep}", rep))
        elif st[0] == "key":
            x("key", st[1])
        time.sleep(0.6)
    shot(f"{SC}.krename.fr2.png")
# 每敲一个字 KRename 都重算整张预览，1000 个文件要等它算完（看截图里预览列变了才算）
time.sleep(float(os.environ.get("KR_WAIT", "25")))
shot(f"{SC}.krename.ui.png")
before = listing()
x("mousemove", 418, 458, "click", 1); clicks += 1         # Finish
t1 = time.time(); last = before; tdone = None; stable = 0
for _ in range(2400):
    time.sleep(0.25)
    cur = listing()
    if cur != last:
        tdone = time.time(); stable = 0
    else:
        stable += 1
    last = cur
    if tdone and stable >= 16:
        break
    if not tdone and time.time() - t1 > 90:
        break
shot(f"{SC}.krename.done.png")
subprocess.run(["pkill", "-x", "krename"])
time.sleep(1)
sys.path.insert(0, HERE)
import score
s = score.score(OUT, SC)
s.update({"tool": "KRename", "ready_s": round(t_ready, 1), "run_s": round((tdone or t1) - t1, 2), "clicks_scripted": clicks})
print(json.dumps(s, ensure_ascii=False))
