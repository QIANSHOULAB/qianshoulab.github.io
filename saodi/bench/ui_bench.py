"""扫地僧界面实点：开发服务器（同一套界面 + 真 Python 核心）+ 无头 Chromium，像人一样点完每个场景，
数点击（click）和打字处（fill），量「点执行 → 弹出完成提示」的用时，截图，最后对答案。
不含「选文件夹」那一步（每家都一样要选，单独说明）。
用法：python ui_bench.py <输出目录> <截图目录> [程序目录 app/，默认本仓库的；比旧版就给 git archive 出来的旧 app]
0.3.0 起多记一个「页面里从点下去到提示条出来」的毫秒数（MutationObserver 记，不含 Playwright 自己轮询的延迟）。"""
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
        c.click("#nav button[data-v='sort']")
        if c.p.query_selector(".row[data-act='scheme']"):  # 0.3.0：一文件夹照片，自己先勾上「照片按拍摄月份」，勾上了就不用点
            c.p.wait_for_selector("#orunBtn:not([disabled])")
            if not c.p.query_selector(".row[data-act='scheme'][data-v='p2'] .chk svg"):
                c.click(".row[data-act='scheme'][data-v='p2']")
        else:
            c.click("button.sc[data-v='p2']")


def main():
    global APP
    out, shots = sys.argv[1], sys.argv[2]
    if len(sys.argv) > 3:
        APP = os.path.abspath(sys.argv[3])
    os.makedirs(shots, exist_ok=True)
    res = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for sc in ["R1", "R2", "R3", "R4", "R5", "R6", "O1", "O2"]:
            gen.make(out, sc)
            # 每个场景一个新装的程序（0.3.0 会记住上回的改法，比武按第一次用算，跟 0.2.x 一样）
            s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
            env = dict(os.environ, SAODI_HOME=tempfile.mkdtemp(prefix="saodi-ui-"), NO_PROXY="*")
            for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "SAODI_DOWNLOADS"):
                env.pop(k, None)
            proc = subprocess.Popen([sys.executable, "main.py", "--dev", str(port)], cwd=APP, env=env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(1.5)
            page = b.new_page(viewport={"width": 1180, "height": 780})
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
            page.evaluate("""() => { window.__m = {}; document.addEventListener('click', () => { window.__m.click = window.__m.click || performance.now(); }, true);
              new MutationObserver(() => { if (document.querySelector('.toast.show') && !window.__m.toast) window.__m.toast = performance.now(); })
                .observe(document.querySelector('#toast'), {attributes: true}); }""")
            t0 = time.perf_counter()
            c.click(btn)
            page.wait_for_selector(".toast.show", timeout=120000)
            el = time.perf_counter() - t0
            m = page.evaluate("window.__m")
            r = score.score(out, sc)
            r.pop("examples")
            r.update({"tool": "扫地僧(界面)", "clicks": c.clicks, "typing": c.typing, "run_to_toast_s": round(el, 2),
                      "click_to_toast_ms": round(m["toast"] - m["click"]) if m.get("toast") and m.get("click") else None})
            res.append(r)
            print(json.dumps(r, ensure_ascii=False), flush=True)
            page.close()
            proc.terminate()
        b.close()
    gen.unlock_all(out)
    json.dump(res, open(os.path.join(out, "ui_saodi.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
