"""比武打分：所有选手的输出都先归一化成同一个样子，再和标准答案比。

预测格式（每个选手的 run_*.py 产出 pred.json）：
  {"m001.eml": {"rule": "订单" | null, "fields": {"订单号": "原文", ...}, "forward": ["finance@ourco.example"]}, ...}
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import date, datetime

from gen_mails import RULES

MON = {m.lower(): i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def norm_money(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    s = str(v)
    m = re.search(r"-?\d[\d,]*(?:\.\d+)?", s)
    return round(float(m.group().replace(",", "")), 2) if m else None


def norm_date(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip()
    m = re.search(r"(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})", s)
    if m:
        y, mo, d = map(int, m.groups())
    elif re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", s):          # 新加坡习惯：日/月/年
        d, mo, y = map(int, re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", s).groups())
    elif re.search(r"(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})", s):
        g = re.search(r"(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})", s).groups()
        d, mo, y = int(g[0]), MON.get(g[1].lower()), int(g[2])
    elif re.search(r"([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})", s):
        g = re.search(r"([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})", s).groups()
        mo, d, y = MON.get(g[0].lower()), int(g[1]), int(g[2])
    elif re.search(r"(\d{1,2})月(\d{1,2})日", s):
        mo, d = map(int, re.search(r"(\d{1,2})月(\d{1,2})日", s).groups())
        y = 2026
    else:
        return None
    try:
        return date(y, mo, d).isoformat()
    except Exception:
        return None


def norm(kind, v):
    if v is None or v == "":
        return None
    if kind == "money":
        return norm_money(v)
    if kind == "date":
        return norm_date(v)
    if kind == "qty":
        m = re.search(r"\d+", str(v))
        return int(m.group()) if m else None
    if kind == "phone":
        return re.sub(r"\D", "", str(v)) or None
    return re.sub(r"\s+", " ", str(v)).strip().strip(".,，。;；") or None


def score(truth: dict, pred: dict) -> dict:
    T = truth["test"]
    out = {"mails": len(T), "field_total": 0, "field_err": 0, "rule_err": 0, "junk_rows": 0,
           "fwd_should": 0, "fwd_err": 0, "fwd_missed": 0, "fwd_wrong": 0,
           "by_kind": Counter(), "by_field": Counter(), "examples": []}
    for name, t in T.items():
        p = pred.get(name) or {"rule": None, "fields": {}, "forward": []}
        want_fw = {t["forward"]} if t["forward"] else set()
        got_fw = set(p.get("forward") or [])
        out["fwd_should"] += bool(want_fw)
        if want_fw != got_fw:
            out["fwd_err"] += 1
            out["fwd_missed" if want_fw and not got_fw else "fwd_wrong"] += 1
            out["by_kind"][t["kind"] + "·转发"] += 1
            if len(out["examples"]) < 400:
                out["examples"].append([name, t["kind"], "转发", sorted(want_fw), sorted(got_fw)])
        if t["rule"] is None:
            if p.get("rule"):
                out["junk_rows"] += 1
                out["by_kind"][t["kind"] + "·误进表"] += 1
                out["examples"].append([name, t["kind"], "误进表", None, p.get("rule")])
            continue
        if p.get("rule") != t["rule"]:
            out["rule_err"] += 1
        for f, tv in t["fields"].items():
            if tv is None:
                continue
            kind = RULES[t["rule"]][f]
            out["field_total"] += 1
            got = (p.get("fields") or {}).get(f) if p.get("rule") == t["rule"] else None
            if norm(kind, got) != norm(kind, tv):
                out["field_err"] += 1
                out["by_kind"][t["kind"]] += 1
                out["by_field"][t["rule"] + "·" + f] += 1
                out["examples"].append([name, t["kind"], f, tv, got])
    out["field_acc"] = round(1 - out["field_err"] / max(1, out["field_total"]), 4)
    out["by_kind"] = dict(out["by_kind"].most_common())
    out["by_field"] = dict(out["by_field"].most_common())
    return out


if __name__ == "__main__":
    truth = json.load(open(sys.argv[1], encoding="utf-8"))
    pred = json.load(open(sys.argv[2], encoding="utf-8"))
    s = score(truth, pred)
    ex = s.pop("examples")
    print(json.dumps(s, ensure_ascii=False, indent=1))
    for e in ex[:40]:
        print(e)
