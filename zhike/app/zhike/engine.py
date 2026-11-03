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
from .text import T

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
        self._demo = {}
        self._batch = None
        self.started_at = clock()
        self.unclaimed_seq = 0     # 来过几封没规则管的信（Api 看它变了才重新拟规则）

    @property
    def lang(self) -> str:
        return getattr(self.store, "lang", "zh")

    # ---------- 示例（跟着界面语言：中文一套信，英文一套信） ----------
    def demo(self):
        L = self.lang
        if L not in self._demo:
            ms = samples.mails(L)
            self._demo[L] = {"mails": ms, "rules": samples.demo_rules(ms, L)}
        return self._demo[L]

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
        """普通邮箱：应用密码 / 授权码。微软登录的邮箱：现拿的令牌（过期自动续）。"""
        if acct.get("auth") == "oauth":
            from . import oauth
            try:
                return oauth.TokenStore(self.secrets).access_token(acct["id"])
            except oauth.OAuthError as e:
                if e.code == "net":
                    raise NetError(str(e))
                raise AuthError("microsoft login expired: " + str(e.detail)[:120])
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
                    # 刚开机网常常还没通：头 3 分钟里每 15 秒再试；之后 2→4→…→30 分钟退避
                    if self.clock() - self.started_at < 180 and st["fails"] <= 6:
                        wait = 15
                    else:
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
        # 一批信的 Excel 行攒到最后一次写（每封都开关一次大表太慢）；行先进排队区，崩了也不丢
        self._batch = []
        try:
            for m in mails:
                self.process(acct, m)
                if m.uid > int(st.get("last_uid", 0)):
                    st["last_uid"] = m.uid
                self.store.state.save()
        finally:
            batch, self._batch = self._batch, None
            if batch:
                r = self.flush_excel()
                if r["waiting"]:
                    for lg in batch:
                        if self._has_pending_id(lg["rule_id"]):
                            lg["excel"] = "pending"
        self._keep_samples(acct["id"], [m for m in mails if m.uid in new])
        return len(new)

    # ---------- 一封信 ----------
    def extract(self, rule, mail):
        """按规则抽字段；有 AI 钥匙时，规则没抽到的让 AI 兜底（值必须在原文里找得到）。"""
        fields = learn.extract_all(rule["fields"], mail)
        missing = [f for f in rule["fields"] if not f.get("builtin") and not fields.get(f["name"])]
        key = self.secrets.get("ai:gemini") if missing else None
        if key:
            try:
                spans = ai.extract_missing(key, mail, [f["name"] for f in missing],
                                           self.store.settings.get("ai_model", "gemini-flash-latest"), base=self.ai_base)
            except ai.AIError:
                spans = {}
            ref = None
            try:
                ref = datetime.fromisoformat(mail.date)
            except Exception:
                pass
            for f in missing:
                if f["name"] in spans:
                    s, e = spans[f["name"]]
                    raw = mail.text[s:e]
                    fields[f["name"]] = {"raw": raw, "value": learn.to_typed(f.get("type", "text"), raw, ref),
                                         "span": [s, e], "by": "ai"}
        return fields

    def _hold(self, acct, mail, rule, fields, reason):
        """像垃圾：不进表、不转发、不起草，记一笔，用户点「放行」再干。"""
        log = {"id": uuid.uuid4().hex[:10], "time": now_iso(), "acct": acct["id"], "key": mail.key(),
               "subject": mail.subject, "from": mail.from_addr, "rule": None, "held": rule["name"],
               "held_rule": rule["id"], "junk": reason,
               "fields": {k: (v or {}).get("raw", "") for k, v in fields.items()},
               "excel": None, "forward": None, "draft": None}
        held = self.store.state.data.setdefault("held", {})
        held[log["id"]] = {"acct": acct["id"], "uid": mail.uid, "rule": rule["id"],
                           "raw": base64.b64encode(mail.raw).decode()}
        for k in list(held)[:-50]:
            held.pop(k, None)
        self.store.mark_processed(mail.key())
        self._upsert_log(log)
        self.on_change("held", log)
        return log

    def catch_up(self, rule_id, keys) -> int:
        """刚收下的规则：连上以后来过、当时没规则管的那几封，照这条规则补办（进表、转发、起草）。
        连上之前的旧信不动（从连上那一刻开始盯）。返回补办了几封。"""
        with self.lock:
            un = self.store.state.data.get("unclaimed", [])
            want = {u["key"]: u["acct"] for u in un if u["key"] in set(keys)}
            if not want:
                return 0
            by = {m.key(): m for m in self.samples()}
            n = 0
            self._batch = []
            try:
                for k, aid in want.items():
                    acct = next((a for a in self.store.accounts if a["id"] == aid), None)
                    m = by.get(k)
                    if not acct or not m:
                        continue
                    if self.process(acct, m, force_rule=rule_id):
                        n += 1
            finally:
                batch, self._batch = self._batch, None
                if batch:
                    self.flush_excel()
            un[:] = [u for u in un if u["key"] not in want]
            self.store.state.save()
            return n

    def release(self, log_id):
        """被挡下的信放行：照规则正常干活。"""
        with self.lock:
            h = self.store.state.data.get("held", {}).pop(log_id, None)
            if not h:
                return None
            acct = next((a for a in self.store.accounts if a["id"] == h["acct"]), None)
            if not acct:
                return None
            mail = parse(base64.b64decode(h["raw"]), h.get("uid", 0))
            lg = self.store.state.data["log"]
            lg[:] = [e for e in lg if e.get("id") != log_id]
            res = self.process(acct, mail, force_rule=h["rule"])
            self.store.state.save()
            return res

    def process(self, acct, mail, force_rule=None):
        key = mail.key()
        retry = self.store.state.data.setdefault("retry", {})
        rkey = str(mail.uid)
        job = retry.get(rkey) if retry.get(rkey, {}).get("acct") == acct["id"] else None
        if job is None:
            if force_rule:
                rule = next((r for r in self.store.rules if r["id"] == force_rule), None)
                if not rule:
                    return None
            else:
                if self.store.is_processed(key) or mail.zhike_mark:
                    return None
                rule = R.first_match(self.store.rules, mail)
                if not rule:
                    self.store.mark_processed(key)
                    # 连上以后来的、没规则管的信记一笔：贫僧拟的规则一收下，这几封也照办（不用等下一封）
                    un = self.store.state.data.setdefault("unclaimed", [])
                    un.append({"key": key, "acct": acct["id"]})
                    self.unclaimed_seq += 1
                    del un[:-200]
                    return None
            job = {"acct": acct["id"], "rule": rule["id"], "done": [], "tries": 0, "log": None}
        else:
            rule = next((r for r in self.store.rules if r["id"] == job["rule"]), None)
            if not rule:
                retry.pop(rkey, None)
                return None
        fields = self.extract(rule, mail)
        if job["tries"] == 0 and not force_rule:
            why = R.junk_reason(mail, self.store.rules)
            if why and (why == "lookalike" or not R.complete(rule, fields)):
                return self._hold(acct, mail, rule, fields, why)
        job["tries"] += 1
        log = job["log"] or {
            "id": uuid.uuid4().hex[:10], "time": now_iso(), "acct": acct["id"], "key": key,
            "subject": mail.subject, "from": mail.from_addr, "rule": rule["name"],
            "fields": {k: (v or {}).get("raw", "") for k, v in fields.items()},
            "ai_fields": [k for k, v in fields.items() if v and v.get("by") == "ai"],
            "excel": None, "forward": None, "draft": None,
        }
        net_fail = False

        if "excel" not in job["done"]:
            row = {k: (v["value"] if v else None) for k, v in fields.items()}
            log["rule_id"] = rule["id"]
            if self._batch is not None:
                self._queue_row(rule, row)
                log["excel"] = "ok"
                self._batch.append(log)
            else:
                self._excel(rule, row)
                log["excel"] = "pending" if self._has_pending(rule) else "ok"
            job["done"].append("excel")

        fw = rule.get("forward") or {}
        if fw.get("enabled") and fw.get("to") and "forward" not in job["done"]:
            try:
                Smtp(acct, self.password(acct)).send(build_forward(mail, acct["email"], fw["to"], fw.get("note", ""), self.lang))
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
        tpl = rp.get("template") or T("tpl_default", self.lang)
        if rp.get("mode") != "template" and key:
            try:
                txt = ai.gemini(key, ai.build_prompt(mail, fields, rp.get("hint", ""), self.lang),
                                self.store.settings.get("ai_model", "gemini-flash-latest"), base=self.ai_base)
                return txt, "ai", None
            except ai.AIError as e:
                return ai.fill_template(tpl, mail, fields), "template", e.code
        return ai.fill_template(tpl, mail, fields), "template", None

    # ---------- Excel ----------
    def _has_pending(self, rule):
        return any(p["rule"] == rule["id"] for p in self.store.state.data["pending_rows"])

    def _has_pending_id(self, rid):
        return any(p["rule"] == rid for p in self.store.state.data["pending_rows"])

    def _queue_row(self, rule, row):
        self.store.state.data["pending_rows"].append({
            "rule": rule["id"], "sheet": rule["name"], "columns": R.columns(rule),
            "row": {k: _ser(v) for k, v in row.items()}, "path": self.store.settings["excel_path"]})

    def _excel(self, rule, row):
        self._queue_row(rule, row)
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
        self.started_at = self.clock()
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="zhike-engine", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._wake.set()

    def wake(self):
        self._wake.set()

    def next_wait(self) -> float:
        """下一轮等多久：平常照「多久看一次」；有邮箱在等重试（比如刚开机网没通），到点就醒。"""
        every = max(30, int(self.store.settings.get("interval_sec", 120)))
        due = [s["next_at"] for s in self.status.values() if s.get("next_at")]
        if due:
            return max(5.0, min(every, min(due) - self.clock()))
        return every

    def _loop(self):
        while not self._stop.is_set():
            try:
                self.run_once()
            except Exception as e:  # 后台线程不能死
                self.on_change("crash", {"error": repr(e)})
            self._wake.wait(self.next_wait())
            self._wake.clear()


def _ser(v):
    if isinstance(v, learn.Qty):
        return {"$q": float(v), "u": v.unit}
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
        elif isinstance(v, dict) and "$q" in v:
            out[k] = learn.Qty(v["$q"], v.get("u", ""))
        else:
            out[k] = v
    return out
