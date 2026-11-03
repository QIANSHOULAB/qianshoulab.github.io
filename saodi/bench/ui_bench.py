"""扫地僧界面实点：开发服务器（同一套界面 + 真 Python 核心）+ 无头 Chromium，像人一样点完每个场景，
数点击（click）和打字处（fill），量「点执行 → 弹出完成提示」的用时，截图，最后对答案。
不含「选文件夹」那一步（每家都一样要选，单独说明）。
用法：python ui_bench.py <输出目录> <截图目录>"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app")
sys.path.insert(0, HERE)
import gen  # noqa: E402
import score  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


class Counter:
    def __init__(self, page):
        self.p, self.clicks, self.typing = page, 0, 0

    def click(self, sel):
        self.p.click(sel)
        self.clicks += 1

    def fill(self, sel, text):
        self.p.click(sel)
        self.p.fill(sel, text)
        self.p.dispatch_event(sel, "input")
        self.clicks += 1
        self.typing += 1

    def select(self, sel, v):
        self.p.select_option(sel, v)
        self.clicks += 2  # 点开下拉 + 选一项


def steps(c: Counter, sc: str):
    q = lambda v: f".quick button[data-v='{v}']"  # noqa: E731
    if sc == "R1":
        c.click(q("number")); c.fill("input[data-i='0'][data-k='digits']", "4")
    elif sc == "R2":
        c.click(q("replace")); c.fill("input[data-i='0'][data-k='find']", "IMG_"); c.fill("input[data-i='0'][data-k='to']", "旅行_")
    elif sc == "R3":
        c.click(q("date"))
    elif sc == "R4":
        c.click(q("taken"))  # 0.2.1：YYYYMMDD_hhmmss 已是默认格式
    elif sc == "R5":
        c.click(q("case")); c.click(q("ext"))
    elif sc == "R6":
        c.click(q("trim"))
    elif sc == "O1":
        c.click("#nav button[data-v='sort']")
    elif sc == "O2":
        c.click("#nav button[data-v='sort']"); c.click("button.sc[data-v='p2']")


def main():
    out, shots = sys.argv[1], sys.argv[2]
    os.makedirs(shots, exist_ok=True)
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    env = dict(os.environ, SAODI_HOME=tempfile.mkdtemp(prefix="saodi-ui-"), NO_PROXY="*")
    for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        env.pop(k, None)
    proc = subprocess.Popen([sys.executable, "main.py", "--dev", str(port)], cwd=APP, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    res = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for sc in ["R1", "R2", "R3", "R4", "R5", "R6", "O1", "O2"]:
            gen.make(out, sc)
            page = b.new_page(viewport={"width": 1120, "height": 760})
            page.goto(f"http://127.0.0.1:{port}/")
            page.wait_for_selector("html[data-ready='1']")
            page.fill("#pathIn", os.path.join(out, sc)); page.press("#pathIn", "Enter")  # =「选文件夹」，不计
            page.wait_for_selector(".quick")
            c = Counter(page)
            steps(c, sc)
            btn = "#orunBtn" if sc.startswith("O") else "#runBtn"
            page.wait_for_selector(f"{btn}:not([disabled])", timeout=30000)
            page.wait_for_timeout(600)
            page.screenshot(path=os.path.join(shots, f"saodi-{sc}.png"))
            t0 = time.perf_counter()
            c.click(btn)
            page.wait_for_selector(".toast.show", timeout=120000)
            el = time.perf_counter() - t0
            r = score.score(out, sc)
            r.pop("examples")
            r.update({"tool": "扫地僧(界面)", "clicks": c.clicks, "typing": c.typing, "run_to_toast_s": round(el, 2)})
            res.append(r)
            print(json.dumps(r, ensure_ascii=False), flush=True)
            page.close()
        b.close()
    proc.terminate()
    gen.unlock_all(out)
    json.dump(res, open(os.path.join(out, "ui_saodi.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
