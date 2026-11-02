"""后台干活的那个：定时收信 → 按规则抽字段 → 进 Excel → 转发 → 起草回复（只存草稿）。

失败怎么办：
- 断网：这一轮先歇，退避重试（2 分钟起，翻倍，最多 30 分钟）；这封信没干完的步骤下一轮接着干。
- 密码错：这个邮箱停下，等用户改密码；别的邮箱照常。
- 邮箱满：存草稿失败 / 转发被退，记一笔，草稿仍留在知客僧里能复制；不重试。
- AI 钥匙额度用完 / 钥匙不对 / AI 连不上：退回模板回复，记一笔。
- Excel 被占着：行先排队，下一轮（或用户点「补写」）再写，一行不丢。
"""
from __future__ import annotations

import base64
import threading
import time
import uuid
from datetime import datetime

from . import ai, learn, rules as R, samples
from .excel import ExcelLocked, append_rows
from .mailbox import AuthError, Imap, MailError, NetError, QuotaError, Smtp, build_draft, build_forward
from .mailparse import parse

MAX_TRIES = 6
SAMPLE_KEEP = 30


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


class Engine:
    def __init__(self, store, secrets, ai_base: str = ai.GEMINI_BASE, clock=time.time, on_change=None):
        self.store, self.secrets, self.ai_base, self.clock = store, secrets, ai_base, clock
        self.on_change = on_change or (lambda *a: None)
        self.lock = threading.RLock()
        self.status = {}           # acct_id -> {state, message, last_check, next_at}
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread = None
        self._demo = None

    # ---------- 示例 ----------
    def demo(self):
        if self._demo is None:
            ms = samples.mails()
            self._demo = {"mails": ms, "rules": samples.demo_rules(ms)}
        return self._demo

    def demo_results(self):
        d = self.demo()
        out = []
        for m in d["mails"]:
            r = R.first_match(d["rules"], m)
            entry = {"key": m.key(), "rule": r["name"] if r else None, "rule_id": r["id"] if r else None}
            if r:
                entry["fields"] = learn.extract_all(r["fields"], m)
                if r["reply"]["enabled"]:
                    entry["draft"] = ai.fill_template(r["reply"]["template"], m, entry["fields"])
                if r["forward"]["enabled"]:
                    entry["forward_to"] = r["forward"]["to"]
            out.append(entry)
        return out

    # ---------- 样例（用户自己的信，只存在本机） ----------
    def samples(self):
        out = []
        for s in self.store.state.data.get("samples", []):
            try:
                out.append(parse(base64.b64decode(s["raw"]), s.get("uid", 0)))
            except Exception:
                continue
        return out

    def _keep_samples(self, acct_id, mails):
        lst = self.store.state.data.setdefault("samples", [])
        have = {s["key"] for s in lst}
        for m in mails:
            if m.key() in have:
                continue
            lst.insert(0, {"key": m.key(), "acct": acct_id, "uid": m.uid, "raw": base64.b64encode(m.raw).decode()})
        del lst[SAMPLE_KEEP:]

    def find_mail(self, key):
        for m in self.samples():
            if m.key() == key:
                return m
        for m in self.demo()["mails"]:
            if m.key() == key:
                return m
        return None

    # ---------- 账号 ----------
    def password(self, acct):
        return self.secrets.get(f"pw:{acct['id']}") or ""

    def connect_new(self, acct, recent: int = 20):
        """新加的邮箱：从现在开始盯，之前的信不处理；顺手拿最近几封当样例。"""
        with Imap(acct, self.password(acct)) as im:
            uv, _ = im.select_inbox()
            uids = im.all_uids()
            st = self.store.acct_state(acct["id"])
            st.update(uidvalidity=uv, last_uid=uids[-1] if uids else 0)
            mails = im.fetch(uids[-recent:]) if uids else []
        self._keep_samples(acct["id"], mails)
        self.status[acct["id"]] = {"state": "ok", "message": "", "last_check": now_iso(), "fails": 0}
        self.store.state.save()
        return mails

    def fetch_samples(self, acct, recent: int = 20):
        """只拿最近几封当样例，不动进度。"""
        with Imap(acct, self.password(acct)) as im:
            im.select_inbox()
            uids = im.all_uids()
            mails = im.fetch(uids[-recent:]) if uids else []
        self._keep_samples(acct["id"], mails)
        self.store.state.save()
        return mails

    # ---------- 一轮 ----------
    def run_once(self, only=None):
        with self.lock:
            res = {"new": 0, "done": 0, "errors": []}
            self.flush_excel()
            for acct in list(self.store.accounts):
                if only and acct["id"] != only:
                    continue
                if not acct.get("enabled", True):
                    continue
                st = self.status.setdefault(acct["id"], {"state": "idle", "fails": 0})
                if st.get("state") == "auth" and not only:
                    continue
                if not only and st.get("next_at") and self.clock() < st["next_at"]:
                    continue
                try:
                    n = self.poll(acct)
                    res["new"] += n
                    st.update(state="ok", message="", fails=0, next_at=None, last_check=now_iso())
                except AuthError as e:
                    st.update(state="auth", message=str(e)[:200], last_check=now_iso())
                    res["errors"].append((acct["id"], "auth"))
                except NetError as e:
                    st["fails"] = st.get("fails", 0) + 1
                    wait = min(120 * (2 ** (st["fails"] - 1)), 1800)
                    st.update(state="net", message=str(e)[:200], next_at=self.clock() + wait, last_check=now_iso(), retry_in=wait)
                    res["errors"].append((acct["id"], "net"))
                except MailError as e:
                    st.update(state="error", message=str(e)[:200], last_check=now_iso())
                    res["errors"].append((acct["id"], "error"))
            self.store.state.save()
            self.on_change("run", res)
            return res

    def poll(self, acct):
        st = self.store.acct_state(acct["id"])
        retry = self.store.state.data.setdefault("retry", {})
        with Imap(acct, self.password(acct)) as im:
            uv, _ = im.select_inbox()
            if st.get("uidvalidity") not in (None, uv):
                # 邮箱重建过（UIDVALIDITY 变了）：编号全作废，从现在重新开始，靠 Message-ID 防重复
                uids = im.all_uids()
                st.update(uidvalidity=uv, last_uid=uids[-1] if uids else 0)
                return 0
            st["uidvalidity"] = uv
            last = int(st.get("last_uid", 0))
            new = im.uids_after(last)
            again = [int(u) for u, v in retry.items() if v.get("acct") == acct["id"] and int(u) <= last]
            mails = im.fetch(sorted(set(new + again))) if (new or again) else []
        for m in mails:
            self.process(acct, m)
            if m.uid > int(st.get("last_uid", 0)):
                st["last_uid"] = m.uid
            self.store.state.save()
        self._keep_samples(acct["id"], [m for m in mails if m.uid in new])
        return len(new)

    # ---------- 一封信 ----------
    def process(self, acct, mail):
        key = mail.key()
        retry = self.store.state.data.setdefault("retry", {})
        rkey = str(mail.uid)
        job = retry.get(rkey) if retry.get(rkey, {}).get("acct") == acct["id"] else None
        if job is None:
            if self.store.is_processed(key) or mail.zhike_mark:
                return None
            rule = R.first_match(self.store.rules, mail)
            if not rule:
                self.store.mark_processed(key)
                return None
            job = {"acct": acct["id"], "rule": rule["id"], "done": [], "tries": 0, "log": None}
        else:
            rule = next((r for r in self.store.rules if r["id"] == job["rule"]), None)
            if not rule:
                retry.pop(rkey, None)
                return None
        job["tries"] += 1
        fields = learn.extract_all(rule["fields"], mail)
        log = job["log"] or {
            "id": uuid.uuid4().hex[:10], "time": now_iso(), "acct": acct["id"], "key": key,
            "subject": mail.subject, "from": mail.from_addr, "rule": rule["name"],
            "fields": {k: (v or {}).get("raw", "") for k, v in fields.items()},
            "excel": None, "forward": None, "draft": None,
        }
        net_fail = False

        if "excel" not in job["done"]:
            row = {k: (v["value"] if v else None) for k, v in fields.items()}
            self._excel(rule, row)
            log["excel"] = "pending" if self._has_pending(rule) else "ok"
            job["done"].append("excel")

        fw = rule.get("forward") or {}
        if fw.get("enabled") and fw.get("to") and "forward" not in job["done"]:
            try:
                Smtp(acct, self.password(acct)).send(build_forward(mail, acct["email"], fw["to"], fw.get("note", "")))
                log["forward"] = "ok"
                job["done"].append("forward")
            except NetError:
                log["forward"] = "net"
                net_fail = True
            except (AuthError, QuotaError, MailError) as e:
                log["forward"] = e.code
                job["done"].append("forward")

        rp = rule.get("reply") or {}
        if rp.get("enabled") and "draft" not in job["done"]:
            body, how, aierr = self._draft_text(rule, mail, fields)
            log["draft_mode"], log["ai_error"] = how, aierr
            draft = {"id": log["id"], "time": now_iso(), "to": mail.from_addr, "subject": "Re: " + mail.subject,
                     "body": body, "acct": acct["id"], "rule": rule["name"], "saved": None}
            try:
                with Imap(acct, self.password(acct)) as im:
                    im.append_draft(build_draft(mail, acct["email"], body))
                draft["saved"] = "ok"
                log["draft"] = "ok"
                job["done"].append("draft")
            except NetError:
                log["draft"] = "net"
                net_fail = True
            except (AuthError, QuotaError, MailError) as e:
                draft["saved"] = e.code
                log["draft"] = e.code
                job["done"].append("draft")
            if draft["saved"] or not net_fail or job["tries"] >= MAX_TRIES:
                ds = self.store.state.data["drafts"]
                ds.insert(0, draft)
                del ds[200:]

        job["log"] = log
        if net_fail and job["tries"] < MAX_TRIES:
            retry[rkey] = job
            log["retrying"] = True
        else:
            retry.pop(rkey, None)
            log.pop("retrying", None)
            self.store.mark_processed(key)
        self._upsert_log(log)
        self.on_change("mail", log)
        return log

    def _upsert_log(self, log):
        lg = self.store.state.data["log"]
        for i, e in enumerate(lg):
            if e.get("id") == log["id"]:
                lg[i] = log
                return
        self.store.log(log)

    def _draft_text(self, rule, mail, fields):
        rp = rule["reply"]
        key = self.secrets.get("ai:gemini")
        tpl = rp.get("template") or "{称呼}您好，\n\n来信收到，我看一下尽快回复您。\n"
        if rp.get("mode") != "template" and key:
            try:
                txt = ai.gemini(key, ai.build_prompt(mail, fields, rp.get("hint", "")),
                                self.store.settings.get("ai_model", "gemini-flash-latest"), base=self.ai_base)
                return txt, "ai", None
            except ai.AIError as e:
                return ai.fill_template(tpl, mail, fields), "template", e.code
        return ai.fill_template(tpl, mail, fields), "template", None

    # ---------- Excel ----------
    def _has_pending(self, rule):
        return any(p["rule"] == rule["id"] for p in self.store.state.data["pending_rows"])

    def _excel(self, rule, row):
        path = self.store.settings["excel_path"]
        pend = self.store.state.data["pending_rows"]
        pend.append({"rule": rule["id"], "sheet": rule["name"], "columns": R.columns(rule),
                     "row": {k: _ser(v) for k, v in row.items()}, "path": path})
        self.flush_excel()

    def flush_excel(self) -> dict:
        pend = self.store.state.data["pending_rows"]
        if not pend:
            return {"written": 0, "waiting": 0, "locked": False}
        groups = {}
        for p in pend:
            groups.setdefault((p["path"], p["sheet"]), []).append(p)
        written, left, locked = 0, [], False
        for (path, sheet), items in groups.items():
            cols = []
            for it in items:
                for c in it["columns"]:
                    if tuple(c) not in cols:
                        cols.append(tuple(c))
            try:
                append_rows(path, sheet, cols, [_deser(it["row"], dict(cols)) for it in items])
                written += len(items)
            except ExcelLocked:
                locked = True
                left.extend(items)
            except OSError:
                left.extend(items)
        pend[:] = left
        self.store.state.save()
        return {"written": written, "waiting": len(left), "locked": locked}

    # ---------- 后台线程 ----------
    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="zhike-engine", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._wake.set()

    def wake(self):
        self._wake.set()

    def _loop(self):
        while not self._stop.is_set():
            try:
                self.run_once()
            except Exception as e:  # 后台线程不能死
                self.on_change("crash", {"error": repr(e)})
            self._wake.wait(max(30, int(self.store.settings.get("interval_sec", 120))))
            self._wake.clear()


def _ser(v):
    if isinstance(v, datetime):
        return {"$dt": v.isoformat()}
    if hasattr(v, "isoformat") and not isinstance(v, str):
        return {"$d": v.isoformat()}
    return v


def _deser(row, types):
    from datetime import date
    out = {}
    for k, v in row.items():
        if isinstance(v, dict) and "$dt" in v:
            out[k] = datetime.fromisoformat(v["$dt"])
        elif isinstance(v, dict) and "$d" in v:
            out[k] = date.fromisoformat(v["$d"])
        else:
            out[k] = v
    return out
