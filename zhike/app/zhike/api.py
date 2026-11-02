"""界面调用的全部接口。pywebview 直接调这个类；开发时 devserver 用 HTTP 转一手，同一份代码。

返回给界面的错误都是代码（net/auth/quota/...），界面上的字在 ui/strings.js 里统一翻译。
"""
from __future__ import annotations

import copy
import os
import subprocess
import sys
import threading
import uuid
from pathlib import Path

from . import VERSION, ai, learn, platform as P, rules as R
from .engine import Engine
from .mailbox import PROVIDERS, AuthError, MailError, NetError, account_from, test_account
from .secrets import Secrets
from .store import Store


def _mail_view(m, rule=None, with_text=True):
    d = {"key": m.key(), "from_name": m.from_name, "from_addr": m.from_addr, "subject": m.subject,
         "date": m.date, "attachments": m.attachments, "rule": None, "fields": {}}
    if with_text:
        d["text"] = m.text
        d["suggest"] = learn.suggest_fields(m.text)
    if rule:
        d["rule"] = {"id": rule["id"], "name": rule["name"]}
        ex = learn.extract_all(rule["fields"], m)
        d["fields"] = {k: ({"raw": v["raw"], "span": v["span"]} if v else None) for k, v in ex.items()}
    return d


class Api:
    def __init__(self, store: Store | None = None, engine: Engine | None = None, on_quit=None, notify=None):
        self.store = store or Store()
        self.secrets = Secrets(self.store.root)
        self.engine = engine or Engine(self.store, self.secrets, on_change=self._changed)
        self.on_quit = on_quit
        self.notify = notify or (lambda *a: None)
        self._rev = 0
        self._update = None

    # ---------- 内部 ----------
    def _changed(self, kind, payload):
        self._rev += 1
        if kind == "mail" and payload:
            self.notify(payload)

    @property
    def demo(self):
        return bool(self.store.settings.get("demo", True)) and not self.store.accounts

    def _rules(self):
        return self.engine.demo()["rules"] if self.demo else self.store.rules

    def _mails(self):
        return self.engine.demo()["mails"] if self.demo else self.engine.samples()

    def _save(self):
        if not self.demo:
            self.store.config.save()
        self._rev += 1

    def _rule(self, rid):
        for r in self._rules():
            if r["id"] == rid:
                return r
        raise KeyError(rid)

    # ---------- 启动 ----------
    def boot(self):
        s = self.store.settings
        return {
            "version": VERSION,
            "demo": self.demo,
            "accounts": [{k: v for k, v in a.items()} for a in self.store.accounts],
            "providers": list(PROVIDERS.keys()),
            "rules": self._rules(),
            "settings": {"interval_sec": s.get("interval_sec", 120), "excel_path": s.get("excel_path"),
                         "autostart": P.autostart_enabled(), "ai_model": s.get("ai_model")},
            "has_ai_key": bool(self.secrets.get("ai:gemini")),
            "secret_where": self.secrets.where,
            "platform": sys.platform,
        }

    def tick(self):
        """界面每几秒问一次：后台有啥新动静。"""
        st = self.engine.status
        pend = len(self.store.state.data.get("pending_rows", []))
        return {"rev": self._rev, "status": st, "pending_rows": pend, "demo": self.demo,
                "update": self._update}

    # ---------- 邮件 ----------
    def mails(self):
        rules = self._rules()
        out = []
        for m in self._mails():
            out.append(_mail_view(m, R.first_match(rules, m)))
        out.sort(key=lambda x: x["date"], reverse=True)
        return out

    def preview_rule(self, rid):
        r = self._rule(rid)
        out = []
        for m in self._mails():
            if R.matches(r, m):
                out.append(_mail_view(m, r, with_text=False))
        return out

    # ---------- 规则 ----------
    def new_rule(self, mail_key=None, name=None):
        m = self.engine.find_mail(mail_key) if mail_key else None
        r = R.new_rule(name or (m and _short(m.subject)) or "新规则")
        if m:
            r["conditions"] = R.propose_conditions([m])
        self._rules().insert(0, r)
        self._save()
        return r

    def save_rule(self, rule):
        rules = self._rules()
        for i, r in enumerate(rules):
            if r["id"] == rule["id"]:
                rules[i] = rule
                break
        else:
            rules.insert(0, rule)
        self._save()
        return rule

    def delete_rule(self, rid):
        rules = self._rules()
        rules[:] = [r for r in rules if r["id"] != rid]
        self._save()
        return True

    def move_rule(self, rid, delta):
        rules = self._rules()
        i = next(i for i, r in enumerate(rules) if r["id"] == rid)
        j = max(0, min(len(rules) - 1, i + int(delta)))
        rules.insert(j, rules.pop(i))
        self._save()
        return [r["id"] for r in rules]

    def learn(self, rid, name, key, start, end):
        """用户在邮件里选中一段 → 归纳成字段。同名字段再选一次就是多给一个样例。"""
        r = self._rule(rid)
        m = self.engine.find_mail(key)
        if not m:
            raise KeyError(key)
        name = (name or "").strip() or "字段"
        old = next((f for f in r["fields"] if f["name"] == name and not f.get("builtin")), None)
        examples = [e for e in (old or {}).get("examples", []) if e["key"] != key]
        examples.append({"key": key, "start": int(start), "end": int(end)})
        triples = []
        for e in examples:
            mm = m if e["key"] == key else self.engine.find_mail(e["key"])
            if mm and 0 <= e["start"] < e["end"] <= len(mm.text):
                triples.append((mm.text, e["start"], e["end"]))
        spec = learn.learn_field(name, triples)
        spec["examples"] = examples[-5:]
        if old:
            r["fields"][r["fields"].index(old)] = spec
        else:
            r["fields"].append(spec)
        self._save()
        return r

    def remove_field(self, rid, name):
        r = self._rule(rid)
        r["fields"] = [f for f in r["fields"] if f["name"] != name]
        self._save()
        return r

    def add_builtin(self, rid, builtin):
        r = self._rule(rid)
        name = learn.BUILTINS[builtin]
        if not any(f.get("builtin") == builtin for f in r["fields"]):
            r["fields"].append({"name": name, "builtin": builtin,
                                "type": "datetime" if builtin == "@received" else "text"})
        self._save()
        return r

    def rename_field(self, rid, old, new):
        r = self._rule(rid)
        new = (new or "").strip()
        if new and not any(f["name"] == new for f in r["fields"]):
            for f in r["fields"]:
                if f["name"] == old:
                    f["name"] = new
        self._save()
        return r

    # ---------- 表格 ----------
    def table(self, rid):
        r = self._rule(rid)
        cols = [f["name"] for f in r["fields"]]
        if self.demo:
            rows = []
            for m in self._mails():
                if R.first_match(self._rules(), m) is r:
                    ex = learn.extract_all(r["fields"], m)
                    rows.append({k: (v["raw"] if v else "") for k, v in ex.items()})
            return {"columns": cols, "rows": rows, "path": None, "pending": 0}
        path = self.store.settings["excel_path"]
        rows = []
        try:
            from openpyxl import load_workbook
            from .excel import safe_sheet
            if Path(path).exists():
                wb = load_workbook(path, read_only=True, data_only=True)
                sn = safe_sheet(r["name"])
                if sn in wb.sheetnames:
                    it = wb[sn].iter_rows(values_only=True)
                    head = [str(h) if h is not None else "" for h in next(it, [])]
                    cols = head or cols
                    for row in it:
                        rows.append({h: _cell(v) for h, v in zip(head, row)})
                wb.close()
        except Exception:
            pass
        pend = [p["row"] for p in self.store.state.data["pending_rows"] if p["rule"] == r["id"]]
        return {"columns": cols, "rows": rows[-300:][::-1], "path": path, "pending": len(pend),
                "pending_rows": [{k: _cell(v) for k, v in p.items()} for p in pend]}

    def flush_excel(self):
        return self.engine.flush_excel()

    def open_excel(self):
        path = self.store.settings["excel_path"]
        if not Path(path).exists():
            return False
        return _open(path)

    def show_excel_folder(self):
        return _open(str(Path(self.store.settings["excel_path"]).parent))

    # ---------- 邮箱 ----------
    def guess(self, email_addr):
        return account_from(email_addr)

    def add_account(self, email_addr, password, overrides=None):
        acct = account_from(email_addr, (overrides or {}).get("provider"), **{k: v for k, v in (overrides or {}).items() if k != "provider"})
        if not acct.get("imap_host"):
            return {"ok": False, "code": "need_server"}
        acct["id"] = uuid.uuid4().hex[:8]
        acct["enabled"] = True
        password = (password or "").replace(" ", "") if acct.get("provider") in ("gmail", "qq", "163", "126") else (password or "")
        try:
            test_account(acct, password)
        except AuthError:
            return {"ok": False, "code": "auth"}
        except NetError:
            return {"ok": False, "code": "net"}
        except MailError as e:
            return {"ok": False, "code": "error", "detail": str(e)[:200]}
        was_demo = self.demo
        self.secrets.set(f"pw:{acct['id']}", password)
        self.store.accounts.append(acct)
        self.store.settings["demo"] = False
        if was_demo:
            self.store.config.data["rules"] = []
        self.store.config.save()
        try:
            n = len(self.engine.connect_new(acct))
        except MailError as e:
            n = 0
        self.engine.start()
        self._rev += 1
        return {"ok": True, "account": acct, "samples": n}

    def update_password(self, acct_id, password):
        acct = next(a for a in self.store.accounts if a["id"] == acct_id)
        try:
            test_account(acct, password)
        except AuthError:
            return {"ok": False, "code": "auth"}
        except NetError:
            return {"ok": False, "code": "net"}
        self.secrets.set(f"pw:{acct_id}", password)
        self.engine.status.pop(acct_id, None)
        self.engine.wake()
        return {"ok": True}

    def remove_account(self, acct_id):
        self.store.config.data["accounts"] = [a for a in self.store.accounts if a["id"] != acct_id]
        self.secrets.delete(f"pw:{acct_id}")
        self.engine.status.pop(acct_id, None)
        self.store.config.save()
        self._rev += 1
        return True

    def run_now(self):
        if self.demo:
            return {"new": 0, "done": 0, "errors": [], "demo": True}
        res = self.engine.run_once()
        return {"new": res["new"], "errors": res["errors"]}

    def refresh_samples(self):
        n = 0
        for a in self.store.accounts:
            try:
                n += len(self.engine.fetch_samples(a))
            except Exception:
                pass
        return n

    # ---------- 草稿 / 记录 ----------
    def drafts(self):
        if self.demo:
            out = []
            for d in self.engine.demo_results():
                if d.get("draft"):
                    m = self.engine.find_mail(d["key"])
                    out.append({"id": d["key"], "to": m.from_addr, "subject": "Re: " + m.subject,
                                "body": d["draft"], "saved": "demo", "rule": d["rule"], "time": m.date})
            return out
        return self.store.state.data["drafts"]

    def logs(self):
        if self.demo:
            out = []
            for d in self.engine.demo_results():
                m = self.engine.find_mail(d["key"])
                out.append({"time": m.date, "subject": m.subject, "from": m.from_addr, "rule": d["rule"],
                            "excel": "demo" if d["rule"] else None,
                            "forward": "demo" if d.get("forward_to") else None,
                            "forward_to": d.get("forward_to"),
                            "draft": "demo" if d.get("draft") else None})
            return out
        return self.store.state.data["log"][:200]

    # ---------- AI ----------
    def set_ai_key(self, key):
        key = (key or "").strip()
        if not key:
            self.secrets.delete("ai:gemini")
            return {"ok": True, "cleared": True}
        try:
            ai.gemini(key, "回一个字：好", self.store.settings.get("ai_model", "gemini-flash-latest"),
                      base=self.engine.ai_base, timeout=20)
        except ai.AIError as e:
            if e.code in ("key",):
                return {"ok": False, "code": "ai_key"}
            if e.code == "net":
                return {"ok": False, "code": "ai_net"}
            if e.code != "quota":     # 额度暂时用完也先存着
                return {"ok": False, "code": "ai_other", "detail": e.detail[:200]}
        self.secrets.set("ai:gemini", key)
        return {"ok": True}

    def try_draft(self, rid, key):
        r = self._rule(rid)
        m = self.engine.find_mail(key)
        fields = learn.extract_all(r["fields"], m)
        body, how, err = self.engine._draft_text(r, m, fields)
        return {"body": body, "mode": how, "ai_error": err}

    # ---------- 设置 ----------
    def set_setting(self, k, v):
        if k == "autostart":
            P.set_autostart(bool(v))
        elif k == "interval_sec":
            self.store.settings[k] = max(60, int(v))
            self.engine.wake()
        elif k == "excel_path":
            self.store.settings[k] = str(v)
        elif k == "ai_model":
            self.store.settings[k] = str(v)
        self.store.config.save()
        return self.boot()["settings"]

    def pick_excel(self):
        return None   # 由 app.py 用系统对话框覆盖

    def check_update(self):
        from .updates import check
        self._update = check()
        return self._update

    def open_url(self, url):
        if url.startswith(("https://", "mailto:")):
            import webbrowser
            webbrowser.open(url)
            return True
        return False

    def quit(self):
        if self.on_quit:
            threading.Timer(0.05, self.on_quit).start()
        return True


def _short(s):
    import re
    s = re.split(r"[#＃:：\d\[\(（【]", s, maxsplit=1)[0].strip(" -—|·")
    return (s or "新规则")[:12]


def _cell(v):
    if v is None:
        return ""
    if isinstance(v, dict) and ("$dt" in v or "$d" in v):
        return (v.get("$dt") or v.get("$d")).replace("T", " ")[:16]
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d %H:%M") if hasattr(v, "hour") and (v.hour or v.minute) else v.strftime("%Y-%m-%d")
    if isinstance(v, float):
        return f"{v:,.2f}"
    return str(v)


def _open(path):
    try:
        if sys.platform == "win32":
            os.startfile(path)  # noqa
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
        return True
    except Exception:
        return False
