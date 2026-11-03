"""贫僧拟规则：看最近收到的信，认出成批的同类信，拟好规则，等人点「收下」。

人只做一件事：收不收（外加想转给谁）。挑字段、起列名、填发件人和主题条件，程序自己来。全在本机，不问 AI。

怎么认：
- 每封信找「标签：值」和「标签  值」（HTML 表格转成文字就是这个样子）。标签按同义词表归成规范名
  （Order Number、订单编号 → 订单号；Amount Due、应付金额 → 金额），几家来信的同一个意思用同一个列名。
- 有运单号 → 物流；有发票号 → 发票；有订单号 → 订单；有产品又有数量 → 询价（谁都会来问，不限发件人）。
  不同的商店、供应商合成一条规则，列取几家都有的那几个。认不出类型的：同一个发件域名来过 ≥2 封、字段一样，也拟一条。
- 推销、中奖、推广的信不拿来拟；跟别的来信域名只差一个字母（lotus-supp1ies 冒充 lotus-supplies）的不拿来拟。
- 订单、发票、物流只收公司发的（orders@、billing@、noreply@ 这种，或名字像公司）；个人来信里提了个订单号不算。
- 已经有规则管的信不再拟。某一类已有规则，来了新的一家：拟成「归进已有规则」。
- 人点了「不要」的，记住，不再拟（来了新的发件人才再问）。
"""
from __future__ import annotations

import hashlib
import math
import re

from . import learn, rules as R

# (类型名, 认它要有的字段（规范名）, 谁都会来——不限发件人)
TYPES = [
    ("物流", ("运单号",), False),
    ("发票", ("发票号",), False),
    ("订单", ("订单号",), False),
    ("询价", ("产品", "数量"), True),
]
# 不限发件人的类型，主题里常见的说法（只给这种规则用：限了发件人的规则，主题按来信自己的写法）
TYPE_WORDS = {"询价": ["询价", "报价", "quotation", "enquiry", "inquiry"]}

_STRONG = re.compile(r"中奖|恭喜您?获得|免费领取|点击链接领取|领取奖品|推广|首页排名|排名服务"
                     r"|you(?:'ve| have) won|claim your prize|winner", re.I)
_WEAK = re.compile(r"退订|unsubscribe|大促|全场[一二三四五六七八九\d]折|优惠券|限时特惠|act now|limited time offer", re.I)
_AUTO_LOCAL = re.compile(
    r"^(?:no-?reply|do-?not-?reply|donotreply|noreply|orders?|order-?updates?|billing|bills?|invoices?|invoicing|finance"
    r"|accounts?|ar|ap|payments?|receipts?|statements?|notifications?|notify|alerts?|tracking|shipping|shipments?"
    r"|delivery|dispatch|logistics|services?|support|help|info|sales|team|hello|admin|system|mailer|auto(?:mated)?"
    r"|store|shop|cs|customer-?service|kefu|fapiao|purchasing|procurement)(?:[._+-].*)?$", re.I)
_COMPANY = re.compile(r"公司|商贸|科技|集团|快递|物流|商城|商店|超市|供应|财务|客服|银行|有限|工厂|贸易"
                      r"|\b(?:ltd|pte|inc|llc|gmbh|corp|co|express|logistics|supplies|supply|mart|store|shop"
                      r"|billing|bank|team|support|service|services|official)\b", re.I)

# 主题里的编号、日期、括号段，拿掉剩下的才是这类信的「主题说法」
_PREFIX = re.compile(r"^\s*(?:(?:fwd?|fw|re|转发|回复)\s*[:：]\s*)+", re.I)
_BRACKET = re.compile(r"【[^】]*】|\[[^\]]*\]|（[^）]*）|\([^)]*\)")
_CUT = re.compile(r"[:：|｜]|\d+\s*[年月日号]|[A-Za-z]*[-#＃]?\d[A-Za-z0-9\-#＃/._]*")
_PAIR = re.compile(r"(?m)^[ \t]*(?P<label>[^\s:：|｜\d][^\n:：|｜\d]{0,28}?)(?:[ \t]{2,}|\t)[ \t]*(?P<value>\S[^\n]*?)[ \t]*$")


def subject_stem(s: str) -> str:
    """「订单确认 #SM-1」→ 订单确认；「Invoice INV-9 from X」→ Invoice；「【青石】11月服务费发票 QS-1」→ 服务费发票。"""
    s = _BRACKET.sub(" ", _PREFIX.sub("", s or ""))
    for p in _CUT.split(s):
        p = re.sub(r"\s+", " ", p).strip(" -—–|·,，.。!！?？#＃")
        if len(p) >= 2 and not p.isdigit():
            return p
    return ""


def candidates(text: str) -> list:
    """一封信里像字段的地方：「标签：值」和「标签  值」。标签换成规范名。"""
    out, seen = [], set()
    for g in learn.suggest_fields(text, limit=40):
        out.append({"label": g["name"], "start": g["start"], "end": g["end"], "value": g["value"], "type": g["type"]})
    for m in _PAIR.finditer(text):
        label, value = m.group("label").strip(), m.group("value")
        if len(label.split()) > 4 or len(value) > 60 or re.search(r"https?|www\.", label + value, re.I):
            continue
        kind = learn.infer_type(value, label)
        if kind == "text" and not learn.synonyms([label]) and learn.canonical(label) == label:
            continue          # 「标签  值」只收像值的（编号、金额、日期……）或者认得的标签，免得把正文当字段
        out.append({"label": label, "start": m.start("value"), "end": m.end("value"), "value": value, "type": kind})
    res = []
    for c in sorted(out, key=lambda c: c["start"]):
        c["name"] = learn.canonical(c["label"])
        if c["name"] in seen or not c["name"]:
            continue
        seen.add(c["name"])
        res.append(c)
    return res


def _sender(m):
    return (getattr(m, "orig_from", "") or m.from_addr or "").lower()


def _sender_name(m):
    return (getattr(m, "orig_from_name", "") if getattr(m, "orig_from", "") else m.from_name) or ""


def _domain(addr):
    return addr.rsplit("@", 1)[-1] if "@" in addr else addr


def is_company(m) -> bool:
    addr = _sender(m)
    return bool(_AUTO_LOCAL.match(addr.split("@")[0]) or _COMPANY.search(_sender_name(m)))


def _junk(m, cands) -> bool:
    hay = (m.subject or "") + "\n" + (m.text or "")[:4000]
    if _STRONG.search(hay):
        return True
    typed = [c for c in cands if c["type"] != "text"]
    return bool(_WEAK.search(hay)) and len(typed) < 2


def _fake(a, b, n):
    """两个域名只差一个字母：哪个像冒充的。差的那个位置一边是数字一边是字母，数字那边是假的；看不出来就信来得少的那边。"""
    if len(a) == len(b):
        for x, y in zip(a, b):
            if x != y:
                if x.isdigit() != y.isdigit():
                    return a if x.isdigit() else b
                break
    if n.get(a, 0) != n.get(b, 0):
        return a if n.get(a, 0) < n.get(b, 0) else b
    return None


def _type_of(names):
    for t, need, _open in TYPES:
        if all(x in names for x in need):
            return t
    return None


def _addr_cond(addr):
    d = _domain(addr)
    return addr if d in R._FREE_MAIL else "@" + d


def _dedupe_words(words):
    """主题词去重：一个词包含另一个（Request for Quotation ⊃ quotation），留短的那个就够认了。"""
    out = []
    for w in sorted({w.strip() for w in words if w and w.strip()}, key=len):
        if not any(o.lower() in w.lower() for o in out):
            out.append(w)
    return out


def _sig(kind, key, domains):
    h = hashlib.sha1(("|".join([kind, key] + sorted(domains))).encode()).hexdigest()[:10]
    return f"{kind}-{h}"


def recommend(mails: list, rules: list, dismissed=(), limit: int = 8) -> list:
    """mails：最近收到的信（Mail）；rules：已有规则。返回拟好的规则（还没收）。"""
    pool = []
    for m in mails:
        if m.zhike_mark or R.first_match(rules, m):
            continue
        if rules and R.junk_reason(m, rules) == "lookalike":
            continue
        cands = candidates(m.text or "")
        if _junk(m, cands):
            continue
        fields = {c["name"]: c for c in cands}
        if len(fields) < 1:
            continue
        pool.append({"m": m, "fields": fields, "type": _type_of(fields), "addr": _sender(m),
                     "domain": _domain(_sender(m)), "company": is_company(m)})
    # 冒充：同一批信里两个域名只差一个字母
    n = {}
    for p in pool:
        n[p["domain"]] = n.get(p["domain"], 0) + 1
    fakes = set()
    doms = sorted(n)
    for i, a in enumerate(doms):
        for b in doms[i + 1:]:
            if R._dist1(a, b):
                f = _fake(a, b, n)
                fakes |= {f} if f else {a, b}
    pool = [p for p in pool if p["domain"] not in fakes]

    groups = {}
    for p in pool:
        t = p["type"]
        opened = next((o for x, _n, o in TYPES if x == t), False)
        if t and (opened or p["company"] or n.get(p["domain"], 0) >= 2):
            groups.setdefault(("type", t), []).append(p)
        elif p["company"] or n.get(p["domain"], 0) >= 2:
            typed = frozenset(k for k, c in p["fields"].items() if c["type"] != "text")
            if len(typed) >= 2:
                groups.setdefault(("other", p["domain"], typed), []).append(p)

    out = []
    for key, ps in groups.items():
        if key[0] == "other" and len(ps) < 2:
            continue
        rec = _build(key, ps, rules)
        if rec and rec["id"] not in set(dismissed):
            out.append(rec)
    out.sort(key=lambda r: (-r["count"], r["name"]))
    return out[:limit]


def _fields_of(ps):
    """几家来信都有的字段（一家的就全要），按第一封信里的先后。"""
    by_sender = {}
    for p in ps:
        by_sender.setdefault(p["addr"] if p["type"] == "询价" else p["domain"], set()).update(p["fields"])
    sets = list(by_sender.values())
    need = len(sets) if len(sets) <= 2 else max(2, math.ceil(0.6 * len(sets)))
    keep = {k for k in set().union(*sets) if sum(k in s for s in sets) >= need}
    order = []
    for p in ps:
        for k in sorted(p["fields"], key=lambda k: p["fields"][k]["start"]):
            if k in keep and k not in order:
                order.append(k)
    return order


def _build(key, ps, rules):
    t = key[1] if key[0] == "type" else None
    opened = next((o for x, _n, o in TYPES if x == t), False)
    names = _fields_of(ps)
    if not names:
        return None
    if not opened and not any(p["company"] for p in ps):
        opened = True
    mails = [p["m"] for p in ps]
    senders, seen = [], {}
    for p in ps:
        k = p["addr"] if opened else p["domain"]
        if k not in seen:
            seen[k] = {"who": _sender_name(p["m"]) or p["addr"], "addr": p["addr"], "n": 0}
            senders.append(seen[k])
        seen[k]["n"] += 1
    # 条件
    if opened:
        frm = []
        words = [subject_stem(getattr(m, "orig_subject", "") or m.subject) for m in mails] + TYPE_WORDS.get(t, [])
        subj = _dedupe_words(words)
    else:
        frm = []
        for p in ps:
            c = _addr_cond(p["addr"])
            if c not in frm:
                frm.append(c)
        stems = {}
        for p in ps:
            stems.setdefault(p["domain"], []).append(subject_stem(getattr(p["m"], "orig_subject", "") or p["m"].subject))
        subj = []
        for d, ss in stems.items():
            s = ss[0] if len(set(ss)) == 1 else _common(ss)
            if not s:
                subj = []          # 有一家的主题说不出共同的词：不靠主题，只认发件人
                break
            subj.append(s)
        subj = _dedupe_words(subj)
    cond = {"from": frm, "subject": subj, "body": [], "exclude": []}
    fields = []
    for nm in names:
        ex = [(p["m"], p["fields"][nm]) for p in ps if nm in p["fields"]]
        fields.append({"name": nm, "type": learn.infer_type(ex[0][1]["value"], ex[0][1]["label"]),
                       "examples": [{"key": m.key(), "start": c["start"], "end": c["end"], "raw": c["value"]} for m, c in ex]})
    atts = all(m.attachments for m in mails)
    name = t or _short(mails[0])
    target = _existing(t, frm, rules) if t else None
    kind = "extend" if target else "new"
    rec = {"id": _sig(kind, (target or {}).get("id", "") + (t or "|".join(names)), [_domain(x["addr"]) for x in senders] if not opened else []),
           "kind": kind, "type": t, "name": target["name"] if target else name, "rule_id": target["id"] if target else None,
           "open": opened, "count": len(mails), "mails": [m.key() for m in mails], "senders": senders,
           "conditions": cond, "fields": fields, "attachments": atts,
           "att_example": mails[0].attachments[0] if atts else ""}
    # 拟出来的条件必须认得这批信，认不得就放宽（不靠主题）
    probe = to_rule(rec, {m.key(): m for m in mails})
    if not all(R.matches(probe, m) for m in mails):
        rec["conditions"]["subject"] = []
    return rec


def _common(ss):
    import os
    p = os.path.commonprefix([s for s in ss if s]).strip(" -—|·#：:")
    return p if len(p) >= 2 else ""


def _short(m):
    from .api import _short as s
    return s(getattr(m, "orig_subject", "") or m.subject)


def _existing(t, frm, rules):
    """同一类已经有规则了（名字一样，或者认它的字段都在）：新来的这家拟成「归进去」。"""
    need = next((n for x, n, _o in TYPES if x == t), ())
    for r in rules:
        names = {f["name"] for f in r.get("fields", [])}
        if r.get("name") == t or (need and all(x in names for x in need)):
            return r
    return None


def to_rule(rec: dict, mails: dict, name: str | None = None, forward=None) -> dict:
    """拟好的 → 真规则：字段用这批信里的位置学（和人手点选走同一条路）。mails：key → Mail。"""
    r = R.new_rule((name or rec["name"]).strip()[:24] or rec["name"])
    r["conditions"] = {k: list(v) for k, v in rec["conditions"].items()}
    for f in rec["fields"]:
        r["fields"].append(_learned(f, mails))
    if rec.get("attachments"):
        r["fields"].append({"name": "附件", "builtin": "@attachments", "type": "text"})
    fw = [x.strip() for x in forward or [] if x and x.strip()]
    r["forward"] = {"enabled": bool(fw), "to": fw, "note": ""}
    r["from_rec"] = rec["id"]
    return r


def _learned(f, mails):
    ex = [e for e in f["examples"] if e["key"] in mails]
    spec = learn.learn_field(f["name"], [(mails[e["key"]].text, e["start"], e["end"]) for e in ex])
    spec["examples"] = [{"key": e["key"], "start": e["start"], "end": e["end"]} for e in ex][-5:]
    return spec


def extend(rule: dict, rec: dict, mails: dict, forward=None) -> dict:
    """「归进已有规则」：加上新的发件人、主题说法，字段多学一种写法（老写法一个不丢）。返回改好的规则（新对象）。"""
    import copy
    r = copy.deepcopy(rule)
    c = r.setdefault("conditions", {"from": [], "subject": [], "body": [], "exclude": []})
    if c.get("from"):
        for x in rec["conditions"]["from"]:
            if x not in c["from"]:
                c["from"].append(x)
    if c.get("subject") and rec["conditions"].get("subject"):
        for x in rec["conditions"]["subject"]:
            if x not in c["subject"]:
                c["subject"].append(x)
    elif c.get("subject") and not rec["conditions"].get("subject"):
        c["subject"] = []          # 新来的这家主题没有固定说法：只靠发件人
    by = {f["name"]: f for f in r.get("fields", []) if not f.get("builtin")}
    for f in rec["fields"]:
        new = _learned(f, mails)
        if f["name"] in by:
            old = by[f["name"]]
            merged = learn.merge_specs(old, new)
            merged["examples"] = (old.get("examples") or []) + new["examples"]
            merged["examples"] = merged["examples"][-5:]
            r["fields"][r["fields"].index(old)] = merged
    fw = [x.strip() for x in forward or [] if x and x.strip()]
    if fw:
        r["forward"] = {"enabled": True, "to": list(dict.fromkeys((r.get("forward") or {}).get("to", []) + fw)),
                        "note": (r.get("forward") or {}).get("note", "")}
    return r
