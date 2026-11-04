"""界面调用的全部接口。pywebview 直接调这个类；开发时 devserver 用 HTTP 转一手，同一份代码。

返回给界面的错误都是代码（net/auth/quota/...），界面上的字在 ui/strings.js 里；托盘、气泡这几句也在那儿（zhike/text.py 读）。
"""
from __future__ import annotations

import copy
import os
import subprocess
import sys
import threading
import uuid
from pathlib import Path

from . import VERSION, ai, feedback as FB, learn, oauth, platform as P, recommend as RC, rules as R
from .engine import Engine
from .mailbox import PROVIDERS, AuthError, MailError, NetError, account_from, test_account
from .secrets import Secrets
from .store import Store, default_excel_path
from .text import T, norm


def _mail_view(m, rule=None, with_text=True, rules=()):
    d = {"key": m.key(), "from_name": m.from_name, "from_addr": m.from_addr, "subject": m.subject,
         "date": m.date, "attachments": m.attachments, "rule": None, "fields": {},
         "orig": ({"from": m.orig_from, "from_name": m.orig_from_name, "subject": m.orig_subject, "by": m.fwd_by}
                  if m.forwarded else None)}
    if with_text:
        d["text"] = m.text
        d["suggest"] = learn.suggest_fields(m.text)
    if rule:
        d["rule"] = {"id": rule["id"], "name": rule["name"]}
        ex = learn.extract_all(rule["fields"], m)
        d["fields"] = {k: ({"raw": v["raw"], "span": v["span"]} if v else None) for k, v in ex.items()}
        why = R.junk_reason(m, rules) if rules else ""
        if why and (why == "lookalike" or not R.complete(rule, ex)):
            d["junk"] = why
    return d


class Api:
    def __init__(self, store: Store | None = None, engine: Engine | None = None, on_quit=None, notify=None):
        self.store = store or Store()
        self.secrets = Secrets(self.store.root)
        self.engine = engine or Engine(self.store, self.secrets, on_change=self._changed)
        self.on_quit = on_quit
        self.notify = notify or (lambda title, body: None)     # 托盘气泡：只在有事要人管的时候
        self._rev = 0
        self._update = None
        self.on_restart = None
        self._undo = None
        self._recs = (None, [])
        self._run_logs = []
        self._told = {"auth": set(), "excel": False}
        self._un_seen = 0
        self.on_lang = None        # app.py 挂上：换了语言，窗口标题、托盘菜单跟着换

    @property
    def lang(self) -> str:
        return self.store.lang

    # ---------- 内部 ----------
    def _changed(self, kind, payload):
        self._rev += 1
        if kind in ("mail", "held") and payload:
            self._run_logs.append(payload)
        elif kind == "run":
            logs, self._run_logs = self._run_logs, []
            try:
                self._tell(logs)
            except Exception:
                pass

    def _tell(self, logs):
        """有事才叫人：回信草稿备好了、拟了新规则、邮箱密码不对、Excel 被占着。进表、转发这种照常的事不吵。"""
        L = self.lang
        app = T("app", L)
        drafts = [lg for lg in logs if lg.get("draft") == "ok"]
        if drafts:
            self.notify(app, T("n_drafts", L, n=len(drafts)))
        for aid, st in self.engine.status.items():
            if st.get("state") == "auth" and aid not in self._told["auth"]:
                self._told["auth"].add(aid)
                who = next((a["email"] for a in self.store.accounts if a["id"] == aid), "")
                self.notify(app, T("n_auth", L, who=who))
            elif st.get("state") == "ok":
                self._told["auth"].discard(aid)
        pend = len(self.store.state.data.get("pending_rows", []))
        if pend and not self._told["excel"]:
            self._told["excel"] = True
            self.notify(app, T("n_excel", L, n=pend))
        elif not pend:
            self._told["excel"] = False
        # 这一轮来了没规则管的信，才值得重新拟一遍（都有规则管的话，拟稿不会变）
        seq = getattr(self.engine, "unclaimed_seq", 0)
        if seq == self._un_seen:
            return
        self._un_seen = seq
        told = self.store.state.data.setdefault("rec_told", [])
        fresh = [r for r in self.recs() if r["id"] not in told]
        if fresh:
            told.extend(r["id"] for r in fresh)
            del told[:-200]
            self.store.state.save()
            self.notify(app, T("n_recs", L, n=len(fresh), r=T("sep", L).join(r["name"] for r in fresh[:3])))

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
            "samples": 0 if self.demo else len(self.store.state.data.get("samples", [])),
            "settings": {"interval_sec": s.get("interval_sec", 120), "excel_path": s.get("excel_path"),
                         "autostart": P.autostart_enabled(), "ai_model": s.get("ai_model")},
            "has_ai_key": bool(self.secrets.get("ai:gemini")),
            "ms_login": oauth.available(),
            "secret_where": self.secrets.where,
            "platform": sys.platform,
            "lang": self.lang,
        }

    def tick(self):
        """界面每几秒问一次：后台有啥新动静。"""
        st = self.engine.status
        pend = len(self.store.state.data.get("pending_rows", []))
        return {"rev": self._rev, "status": st, "pending_rows": pend, "demo": self.demo,
                "update": self._update, "recs": len(self.recs())}

    # ---------- 邮件 ----------
    def mails(self):
        rules = self._rules()
        of = {k: {"id": r["id"], "name": r["name"], "kind": r["kind"]} for r in self.recs() for k in r["mails"]}
        out = []
        for m in self._mails():
            v = _mail_view(m, R.first_match(rules, m), rules=rules)
            v["rec"] = of.get(v["key"])
            out.append(v)
        out.sort(key=lambda x: x["date"], reverse=True)
        return out

    # ---------- 贫僧拟的规则 ----------
    def recs(self):
        """看最近的信拟好的规则（还没收）。示例模式没有。同一个版本号内不重算。"""
        if self.demo:
            return []
        if self._recs[0] == (self._rev, self.lang):
            return self._recs[1]
        out = RC.recommend(self.engine.samples(), self.store.rules, self.store.config.data.get("dismissed", []), lang=self.lang)
        self._recs = ((self._rev, self.lang), out)
        return out

    def accept_recs(self, items, skipped=()):
        """收下：items = [{"id", "name"?, "forward"?: [地址]}]；skipped = 关掉的那几条（记住，不再拟）。
        返回 {"created": n, "extended": n, "undo": 撤销用的号}。"""
        recs = {r["id"]: r for r in self.recs()}
        mails = {m.key(): m for m in self.engine.samples()}
        token = self._snapshot()
        made = ext = 0
        todo = []
        for it in items or []:
            r = recs.get(it.get("id"))
            if not r:
                continue
            if r["kind"] == "extend":
                rules = self.store.rules
                i = next((i for i, x in enumerate(rules) if x["id"] == r["rule_id"]), None)
                if i is None:
                    continue
                rules[i] = RC.extend(rules[i], r, mails, it.get("forward"))
                todo.append((rules[i]["id"], r["mails"]))
                ext += 1
            else:
                rule = RC.to_rule(r, mails, it.get("name"), it.get("forward"))
                self.store.rules.append(rule)
                todo.append((rule["id"], r["mails"]))
                made += 1
        d = self.store.config.data.setdefault("dismissed", [])
        for x in skipped or []:
            if x in recs and x not in d:
                d.append(x)
        del d[:-300]
        self.store.config.save()
        # 连上以后来过、当时没规则管的那几封：照刚收下的规则补办，不用等下一封（连上之前的旧信不动）
        caught = 0
        if not self.demo:
            for rid, keys in todo:
                try:
                    caught += self.engine.catch_up(rid, keys)
                except Exception:
                    pass
        self._rev += 1
        self.engine.wake()
        return {"created": made, "extended": ext, "caught_up": caught, "undo": token}

    def dismiss_recs(self, ids):
        token = self._snapshot()
        d = self.store.config.data.setdefault("dismissed", [])
        for x in ids or []:
            if x not in d:
                d.append(x)
        self.store.config.save()
        self._rev += 1
        return {"undo": token}

    def _snapshot(self, extra=None):
        token = uuid.uuid4().hex[:8]
        self._undo = {"token": token, "rules": copy.deepcopy(self._rules()),
                      "dismissed": list(self.store.config.data.get("dismissed", [])), "extra": extra}
        return token

    def undo(self, token):
        """撤销上一下（收下拟好的规则、删规则、移除邮箱）。只认最近那一下。"""
        u = self._undo
        if not u or u["token"] != token:
            return False
        self._undo = None
        self._rules()[:] = u["rules"]
        self.store.config.data["dismissed"] = u["dismissed"]
        ex = u.get("extra") or {}
        if ex.get("account"):
            self.store.accounts.append(ex["account"])
            for k, v in (ex.get("secrets") or {}).items():
                if v:
                    self.secrets.set(k, v)
            self.engine.start()
        self._save()
        self.engine.wake()
        return True

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
        r = R.new_rule(name or (m and _short(m.orig_subject or m.subject, self.lang)) or None, self.lang)
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
        """删规则不问「确定吗」，给「撤销」。"""
        token = self._snapshot()
        rules = self._rules()
        rules[:] = [r for r in rules if r["id"] != rid]
        self._save()
        return {"undo": token}

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
        name = (name or "").strip() or T("field_default", self.lang)
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
        name = T("b_" + builtin.lstrip("@"), self.lang) if builtin in learn.BUILTINS else builtin
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
                    types = {f["name"]: f.get("type") for f in r["fields"]}
                    for row in it:
                        rows.append({h: _cell(v, types.get(h)) for h, v in zip(head, row)})
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
        self.secrets.set(f"pw:{acct['id']}", password)
        return self._added(acct)

    def _added(self, acct):
        was_demo = self.demo
        first = not self.store.accounts
        self.store.accounts.append(acct)
        self.store.settings["demo"] = False
        if was_demo:
            self.store.config.data["rules"] = []
        self.store.config.save()
        try:
            n = len(self.engine.connect_new(acct))
        except MailError:
            n = 0
        self.engine.start()
        # 头一个邮箱连上：开机自己跑（登录 Windows 就进托盘、自己连这个邮箱）。界面上当场说一句，一下能关。
        auto = False
        if first and self.store.settings.get("autostart", True):
            try:
                auto = P.set_autostart(True)
                self.store.state.data["autostart_set"] = True
                self.store.state.save()
            except Exception:
                auto = False
        self._rev += 1
        return {"ok": True, "account": acct, "samples": n, "autostart": bool(auto), "recs": len(self.recs())}

    def add_microsoft(self, email_addr):
        """Outlook / Hotmail / Microsoft 365：打开浏览器走微软登录，不要密码。"""
        if not oauth.available():
            return {"ok": False, "code": "ms_soon"}
        acct = account_from(email_addr, "outlook")
        acct.update(id=uuid.uuid4().hex[:8], enabled=True, auth="oauth")
        try:
            tok = oauth.login(email_addr, open_browser=self._browser, lang=self.lang)
        except oauth.OAuthError as e:
            return {"ok": False, "code": {"net": "net", "timeout": "ms_timeout", "denied": "ms_denied"}.get(e.code, "ms_other"),
                    "detail": e.detail[:200]}
        oauth.TokenStore(self.secrets).save(acct["id"], tok)
        try:
            test_account(acct, tok["access_token"])
        except AuthError:
            self.secrets.delete(f"ms:{acct['id']}")
            return {"ok": False, "code": "ms_imap"}
        except NetError:
            self.secrets.delete(f"ms:{acct['id']}")
            return {"ok": False, "code": "net"}
        except MailError as e:
            self.secrets.delete(f"ms:{acct['id']}")
            return {"ok": False, "code": "error", "detail": str(e)[:200]}
        return self._added(acct)

    def relogin_microsoft(self, acct_id):
        acct = next(a for a in self.store.accounts if a["id"] == acct_id)
        try:
            tok = oauth.login(acct["email"], open_browser=self._browser, lang=self.lang)
        except oauth.OAuthError as e:
            return {"ok": False, "code": {"net": "net", "timeout": "ms_timeout", "denied": "ms_denied"}.get(e.code, "ms_other")}
        oauth.TokenStore(self.secrets).save(acct_id, tok)
        self.engine.status.pop(acct_id, None)
        self.engine.wake()
        return {"ok": True}

    def _browser(self, url):
        import webbrowser
        webbrowser.open(url)

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
        """移除邮箱不问「确定吗」，给「撤销」（密码先在内存里留着，撤销时放回去）。"""
        acct = next((a for a in self.store.accounts if a["id"] == acct_id), None)
        keep = {k: self.secrets.get(k) for k in (f"pw:{acct_id}", f"ms:{acct_id}")}
        token = self._snapshot({"account": acct, "secrets": keep} if acct else None)
        self.store.config.data["accounts"] = [a for a in self.store.accounts if a["id"] != acct_id]
        self.secrets.delete(f"pw:{acct_id}")
        self.secrets.delete(f"ms:{acct_id}")
        self.engine.status.pop(acct_id, None)
        self.store.config.save()
        self._rev += 1
        return {"undo": token}

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

    def release(self, log_id):
        """被当垃圾挡下的信：放行，照规则干活。"""
        res = self.engine.release(log_id)
        self._rev += 1
        return bool(res)

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
    def set_lang(self, lang):
        """EN / 中文：选了就记住（config.json），下次打开直接是这套。已经收下的规则名、列名不动（Excel 里的表头不能说改就改）；
        新拟的规则、示例、托盘、气泡换成新语言。"""
        old, new = self.lang, norm(lang)
        s = self.store.settings
        s["lang"] = new
        # Excel 还在默认的地方、还没写过：文件名跟着换（知客僧.xlsx ↔ Zhike.xlsx）
        if old != new and s.get("excel_path") == default_excel_path(old) and not Path(s["excel_path"]).exists():
            s["excel_path"] = default_excel_path(new)
        self.store.config.save()
        self._rev += 1
        if self.on_lang:
            try:
                self.on_lang(new)
            except Exception:
                pass
        return new

    def set_setting(self, k, v):
        if k == "autostart":
            P.set_autostart(bool(v))
            self.store.settings["autostart"] = bool(v)
            self.store.state.data["autostart_set"] = True
            self.store.state.save()
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

    def check_update(self, download=True):
        """查新版；打包版有新版就在后台下好，下次启动自动换上（或点「重启」马上换）。"""
        from . import updates
        info = updates.check()
        if info and info.get("newer") and info.get("can_self") and download:
            ready = updates.pending() == info["latest"] or updates.download(info)
            info["ready"] = bool(ready)
        self._update = info
        self._rev += 1
        return info

    def restart_update(self):
        if self.on_restart:
            threading.Timer(0.05, self.on_restart).start()
            return True
        return False

    def open_url(self, url):
        if url.startswith(("https://", "mailto:")):
            import webbrowser
            webbrowser.open(url)
            return True
        return False

    def feedback(self):
        """设置「关于」里的「提意见」：拼好 mailto（标题、三行提示、版本 · 系统 · 程序），用系统默认的邮件程序打开。
        打不开（没装邮件程序）就回 ok: False，界面把地址复制给人。"""
        url = FB.mailto(self.lang, VERSION)
        return {"ok": FB.launch(url), "url": url, "to": FB.TO}

    def quit(self):
        if self.on_quit:
            threading.Timer(0.05, self.on_quit).start()
        return True


def _short(s, lang="zh"):
    import re
    s = re.sub(r"^\s*(?:(?:fwd?|fw|re|转发|回复)\s*[:：]\s*)+", "", s or "", flags=re.I)
    s = re.split(r"[#＃:：\d\[\(（【]", s, maxsplit=1)[0].strip(" -—|·")
    return (s or T("rule_new", lang))[:24 if lang == "en" else 12]


def _cell(v, kind=None):
    if v is None:
        return ""
    if isinstance(v, dict) and "$q" in v:
        n = v["$q"]
        return (f"{n:,.0f}" if float(n).is_integer() else f"{n:,.2f}") + (" " + v["u"] if v.get("u") else "")
    if kind in ("qty", "number") and isinstance(v, (int, float)):
        return f"{v:,.0f}" if float(v).is_integer() else f"{v:,.2f}"
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
