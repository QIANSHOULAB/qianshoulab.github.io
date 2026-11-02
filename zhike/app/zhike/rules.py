"""规则：哪些邮件归这条规则管（条件），抽哪些字段，然后干什么（进表 / 转发 / 起草回复）。"""
from __future__ import annotations

import os
import uuid


def new_rule(name: str = "新规则") -> dict:
    return {
        "id": uuid.uuid4().hex[:10],
        "name": name,
        "enabled": True,
        "conditions": {"from": [], "subject": [], "body": []},
        "fields": [
            {"name": "收到时间", "builtin": "@received", "type": "datetime"},
            {"name": "发件人", "builtin": "@from", "type": "email"},
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
    if not rule.get("enabled", True) or mail.zhike_mark:
        return False
    c = rule.get("conditions") or {}
    results = [
        _hit(c.get("from"), mail.from_addr, mail.from_name),
        _hit(c.get("subject"), mail.subject),
        _hit(c.get("body"), mail.text),
    ]
    results = [r for r in results if r is not None]
    return bool(results) and all(results)


def first_match(rules: list, mail):
    for r in rules:
        if matches(r, mail):
            return r
    return None


def propose_conditions(mails: list) -> dict:
    """从样例邮件猜条件：同一个发件域名 + 主题共同的开头。"""
    if not mails:
        return {"from": [], "subject": [], "body": []}
    doms = {m.from_addr.rsplit("@", 1)[-1] for m in mails if "@" in m.from_addr}
    cond = {"from": [], "subject": [], "body": []}
    if len(doms) == 1:
        d = doms.pop()
        cond["from"] = [m_addr for m_addr in {mails[0].from_addr}] if d in _FREE_MAIL else ["@" + d]
    subs = [m.subject for m in mails]
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
