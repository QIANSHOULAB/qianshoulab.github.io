"""xdotool 点 GPRename（20210415，apt 装）：打开场景文件夹 → 全选 → 选好页签/选项 → Preview → Rename。
用法：python gp_drive.py <输出目录> <场景> '<步骤JSON>'   步骤：[["click",x,y],["type","…"],["key","…"]]"""
import hashlib, json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
OUT, SC, STEPS = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
env = dict(os.environ, DISPLAY=":9")
x = lambda *a: subprocess.run(["xdotool", *map(str, a)], env=env, capture_output=True)  # noqa: E731
shot = lambda n: subprocess.run(["import", "-window", "root", os.path.join(OUT, n)], env=env)  # noqa: E731
ls = lambda: hashlib.md5("\n".join(sorted(os.listdir(os.path.join(OUT, SC)))).encode()).hexdigest()  # noqa: E731
subprocess.run([sys.executable, os.path.join(HERE, "gen.py"), OUT, SC], capture_output=True)
subprocess.run(["chown", "-R", "bench", os.path.join(OUT, SC)], capture_output=True)
subprocess.Popen(["runuser", "-u", "bench", "--", "env", "DISPLAY=:9", "HOME=/home/bench", "gprename", os.path.join(OUT, SC)],
                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(8)
clicks = 0
x("mousemove", 400, 150, "click", 1); x("key", "ctrl+a"); clicks += 2   # 点文件列表 + Ctrl+A 全选
for st in STEPS:
    if st[0] == "click":
        x("mousemove", st[1], st[2], "click", 1); clicks += 1
    elif st[0] == "type":
        x("key", "ctrl+a"); x("type", "--delay", 30, st[1])
    elif st[0] == "key":
        x("key", st[1])
    time.sleep(0.6)
x("mousemove", 744, 338, "click", 1); clicks += 1   # Preview
time.sleep(3)
shot(f"{SC}.gprename.ui.png")
before = ls()
x("mousemove", 744, 376, "click", 1); clicks += 1   # Rename
t1 = time.time(); last = before; tdone = None; stable = 0
while time.time() - t1 < 120:
    time.sleep(0.25)
    cur = ls()
    if cur != last:
        tdone, stable = time.time(), 0
    else:
        stable += 1
    last = cur
    if tdone and stable >= 16:
        break
    if not tdone and time.time() - t1 > 30:
        break
# 撞名时 GPRename 每个弹一个「已存在」框挡住，照真人一路点 OK（每下记一次点击）
oks = 0
for _ in range(int(os.environ.get("GP_OKS", "0"))):
    x("key", "Return"); oks += 1; time.sleep(0.4)
time.sleep(2)
shot(f"{SC}.gprename.done.png")
clicks += oks
subprocess.run(["pkill", "-f", "^/usr/bin/perl /usr/bin/gprename"])
sys.path.insert(0, HERE)
import score
s = score.score(OUT, SC)
s.update({"tool": "GPRename", "run_s": round((tdone or t1) - t1, 2), "clicks_scripted": clicks})
print(json.dumps(s, ensure_ascii=False))
