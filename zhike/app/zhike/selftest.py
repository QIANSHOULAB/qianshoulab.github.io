"""冒烟自测：exe 打包出来后在 GitHub Actions 的 Windows 机器上跑一遍。
起本地假邮箱 → 投示例信 → 跑一轮 → 查 Excel / 转发 / 草稿 / 密码保管。不碰任何真邮箱。"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import traceback


def run(out_path=None) -> int:
    res = {"ok": False, "steps": {}}
    try:
        tmp = tempfile.mkdtemp(prefix="zhike-selftest-")
        os.environ["ZHIKE_HOME"] = tmp
        from . import VERSION, samples
        from .engine import Engine
        from .fakeservers import FakeImap, FakeSmtp, account_for
        from .secrets import Secrets
        from .store import Store
        from openpyxl import load_workbook

        res["version"] = VERSION
        imap, smtp = FakeImap().start(), FakeSmtp().start()
        store = Store()
        sec = Secrets(store.root)
        res["steps"]["secret_backend"] = sec.where
        sec.set("selftest", "密码✓")
        assert sec.get("selftest") == "密码✓"
        sec.delete("selftest")
        res["steps"]["secrets"] = "ok"

        store.settings["excel_path"] = os.path.join(tmp, "out", "知客僧.xlsx")
        acct = account_for(imap, smtp)
        store.accounts.append(acct)
        sec.set("pw:t1", imap.password)
        rules = samples.demo_rules()
        rules[0]["forward"]["to"] = ["boss@test.local"]
        store.config.data["rules"] = rules
        eng = Engine(store, sec, ai_base="http://127.0.0.1:9/v1beta")
        eng.connect_new(acct)
        for raw in samples.raw_samples():
            imap.deliver(raw)
        t0 = time.time()
        r = eng.run_once()
        res["steps"]["run_once_sec"] = round(time.time() - t0, 2)
        assert r["new"] == 6 and not r["errors"], r
        wb = load_workbook(store.settings["excel_path"])
        res["steps"]["sheets"] = {ws.title: ws.max_row - 1 for ws in wb.worksheets}
        assert res["steps"]["sheets"] == {"订单": 3, "发票": 1, "询价": 1}, res["steps"]["sheets"]
        assert len(smtp.sent) == 3
        assert len(imap.drafts) == 1
        res["steps"]["forwards"] = len(smtp.sent)
        res["steps"]["drafts"] = len(imap.drafts)
        if sys.platform == "win32":
            import webview  # noqa: F401  打包时有没有漏掉
            import pystray  # noqa: F401
            res["steps"]["gui_imports"] = "ok"
        imap.stop()
        smtp.stop()
        res["ok"] = True
    except Exception:
        res["error"] = traceback.format_exc()
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=1)
    else:
        print(json.dumps(res, ensure_ascii=False, indent=1))
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    sys.exit(run(sys.argv[1] if len(sys.argv) > 1 else None))
