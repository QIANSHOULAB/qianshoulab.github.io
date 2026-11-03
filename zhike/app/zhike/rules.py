"""规则：哪些邮件归这条规则管（条件），抽哪些字段，然后干什么（进表 / 转发 / 起草回复）。"""
from __future__ import annotations

import os
import re
import uuid


def new_rule(name: str | None = None, lang: str = "zh") -> dict:
    """新规则：自带「收到时间」「发件人」两列（列名跟着当前语言，进了 Excel 就是表头）。"""
    from .text import T
    return {
        "id": uuid.uuid4().hex[:10],
        "name": name or T("rule_new", lang),
        "enabled": True,
        "conditions": {"from": [], "subject": [], "body": [], "exclude": []},
        "fields": [
            {"name": T("b_received", lang), "builtin": "@received", "type": "datetime"},
            {"name": T("b_from", lang), "builtin": "@from", "type": "email"},
        ],
        "forward": {"enabled": False, "to": [], "note": ""},
        "reply": {"enabled": False, "mode": "auto", "template": "", "hint": ""},
    }


def _hit(needles, *hay):
    needles = [n.strip().lower() for n in needles or [] if n and n.strip()]
    if not needles:
        return None
    h = " ".join(x or "" for x in hay).lower()
    return any(n in h for n in needles)


def matches(rule: dict, mail) -> bool:
    """条件：发件人 / 主题 / 正文三行，行内任一词对上就算，填了的行都要对上；「不管」那行任一词出现就不算。
    转发信（同事转来的）：发件人和主题也看最里面那层原信的。"""
    if not rule.get("enabled", True) or mail.zhike_mark:
        return False
    c = rule.get("conditions") or {}
    orig_from = getattr(mail, "orig_from", "")
    orig_name = getattr(mail, "orig_from_name", "")
    orig_subj = getattr(mail, "orig_subject", "")
    if _hit(c.get("exclude"), mail.subject, orig_subj, mail.text):
        return False
    results = [
        _hit(c.get("from"), mail.from_addr, mail.from_name) or _hit(c.get("from"), orig_from, orig_name) if orig_from
        else _hit(c.get("from"), mail.from_addr, mail.from_name),
        _hit(c.get("subject"), mail.subject, orig_subj),
        _hit(c.get("body"), mail.text),
    ]
    results = [r for r in results if r is not None]
    return bool(results) and all(results)


def _learned(rule):
    return [f for f in rule.get("fields", []) if not f.get("builtin")]


def looks_like(rule: dict, mail) -> bool:
    """按内容认：发件人不限的规则（比如询价，谁都可能来问），主题没对上，
    但学过的字段在正文里抽到了一大半（至少 2 个），也算它的。限了发件人的规则不走这条。"""
    from . import learn
    c = rule.get("conditions") or {}
    if not rule.get("enabled", True) or mail.zhike_mark or [x for x in c.get("from") or [] if x.strip()]:
        return False
    if _hit(c.get("exclude"), mail.subject, getattr(mail, "orig_subject", ""), mail.text):
        return False
    fs = [f for f in _learned(rule) if f.get("labels")]
    if len(fs) < 2:
        return False
    got = sum(1 for f in fs if learn.extract(f, mail))
    return got >= 2 and got * 2 > len(fs)


def first_match(rules: list, mail):
    for r in rules:
        if matches(r, mail):
            return r
    for r in rules:
        if looks_like(r, mail):
            return r
    return None


# ---------- 垃圾 / 推销：对上了规则也先挡一下 ----------
_JUNK = re.compile(r"退订|unsubscribe|推广|首页排名|排名服务|中奖|恭喜您?获得|免费领取|点击链接领取|领取奖品|大促|全场[一二三四五六七八九\d]折"
                   r"|优惠券|限时特惠|you(?:'ve| have) won|claim your prize|act now|limited time offer", re.I)


def _dist1(a: str, b: str) -> bool:
    """两个域名只差一个字母（lotus-supp1ies 冒充 lotus-supplies）。"""
    if a == b or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    s, l = sorted((a, b), key=len)
    return any(l[:i] + l[i + 1:] == s for i in range(len(l)))


def junk_reason(mail, rules: list) -> str:
    """像垃圾就返回原因代码：lookalike（冒充熟人域名）/ promo（推销、中奖、退订）；不像返回空。"""
    dom = (getattr(mail, "orig_from", "") or mail.from_addr).rsplit("@", 1)[-1].lower()
    for r in rules:
        for x in (r.get("conditions") or {}).get("from") or []:
            d = x.strip().lower().lstrip("@").rsplit("@", 1)[-1]
            if d and "." in d and _dist1(dom, d):
                return "lookalike"
    if _JUNK.search((mail.subject or "") + "\n" + (mail.text or "")[:4000]):
        return "promo"
    return ""


def complete(rule: dict, fields: dict) -> bool:
    """学过的字段是不是全抽到了。推销信常常主题对上了，但关键字段对不上。"""
    fs = _learned(rule)
    return all(fields.get(f["name"]) for f in fs)


def propose_conditions(mails: list) -> dict:
    """从样例邮件猜条件：同一个发件域名 + 主题共同的开头。"""
    if not mails:
        return {"from": [], "subject": [], "body": [], "exclude": []}
    sender = lambda m: getattr(m, "orig_from", "") or m.from_addr  # noqa: E731  转发信按原发件人
    doms = {sender(m).rsplit("@", 1)[-1] for m in mails if "@" in sender(m)}
    cond = {"from": [], "subject": [], "body": [], "exclude": []}
    if len(doms) == 1:
        d = doms.pop()
        cond["from"] = [sender(mails[0])] if d in _FREE_MAIL else ["@" + d]
    subs = [getattr(m, "orig_subject", "") or m.subject for m in mails]
    if len(subs) == 1:
        s = subs[0]
        # 一封样例：取主题里第一个数字/编号之前那段当关键字
        import re
        cut = re.split(r"[#＃:：\d\[\(（【]", s, maxsplit=1)[0].strip(" -—|·")
        if len(cut) >= 2:
            cond["subject"] = [cut]
    else:
        pre = os.path.commonprefix(subs).strip(" -—|·#:：")
        if len(pre) >= 2:
            cond["subject"] = [pre]
    return cond


_FREE_MAIL = {"gmail.com", "qq.com", "163.com", "126.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "foxmail.com", "live.com"}


def columns(rule: dict) -> list:
    return [(f["name"], f.get("type", "text")) for f in rule.get("fields", [])]
