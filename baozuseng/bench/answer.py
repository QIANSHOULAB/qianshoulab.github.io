"""独立算标准答案：只照规则写，不读 index.html 的代码。
规则（见 docs/设计记录.md）：
  天数：入住日、住到那天都算；当月天数 D。
  房租：住满整月 = 月租；否则 月租 × 住的天数 ÷ D，四舍五入到分（.5 进位）。
  电费：全屋按「人天」分。总人天 = 每位房客当月住的天数之和 + 二房东自住则 + D。
        分摊电费的人付 电费 × 他的天数 ÷ 总人天，四舍五入到分；包电的人那份、二房东自己那份、凑整差额都归二房东。
  收入 = 各人房租 + 各人电费；支出 = 电费账单 + 交大房东 + 其他支出；净赚 = 收入 − 支出。
  欠租：本月标欠的人，下个月起显示「之前欠」，计入欠租合计。
用法：python3 -I answer.py > answer.json
"""
import json, sys, os, calendar
from fractions import Fraction as F
from math import floor

here = os.path.dirname(os.path.abspath(__file__))
sc = json.load(open(os.path.join(here, 'scenario.json'), encoding='utf-8'))

def cents(x): return int(round(F(str(x)) * 100))
def r2(fr): return floor(fr + F(1, 2))  # half-up, all values here are >= 0

def days(p, ym):
    y, m = map(int, ym.split('-')); D = calendar.monthrange(y, m)[1]
    a, b = f'{ym}-01', f'{ym}-{D:02d}'
    lo = max(a, p.get('from') or a); hi = min(b, p.get('to') or b)
    return 0 if lo > hi else int(hi[8:]) - int(lo[8:]) + 1, D

out = {}
people = {h['key']: {} for h in sc['houses']}
owes = {h['key']: [] for h in sc['houses']}
for ym in sorted(sc['months']):
    ev = sc['months'][ym]
    out[ym] = {}
    for h in sc['houses']:
        k = h['key']
        if ym < h['start']: continue
        e = ev.get(k, {})
        roster = people[k]
        for a in e.get('add', []): roster[a['name']] = dict(a)
        for d in e.get('dates', []): roster[d['name']].update({x: d[x] for x in ('from', 'to') if x in d})
        for r in e.get('rent', []): roster[r['name']]['rent'] = r['rent']
        live = [(n, p) for n, p in roster.items() if days(p, ym)[0] > 0]
        D = days({}, ym)[1]
        tot = sum(days(p, ym)[0] for _, p in live) + (D if h['self'] else 0)
        elec = cents(e['elec'])
        rows = {}
        for n, p in live:
            d = days(p, ym)[0]
            rent = cents(p['rent']) if d == D else r2(F(cents(p['rent']) * d, D))
            el = r2(F(elec * d, tot)) if p['share'] else 0
            rows[n] = {'days': d, 'rent': rent, 'elec': el, 'due': rent + el}
        inc = sum(r['due'] for r in rows.values())
        exp = elec + cents(h['head']) + sum(cents(f[1]) for f in h['fixed']) + sum(cents(x[1]) for x in e.get('exp', []))
        prev = sum(o for (m2, o) in owes[k] if m2 < ym)
        for o in e.get('owe', []): owes[k].append((ym, cents(o['amt'])))
        out[ym][k] = {'D': D, 'personDays': tot, 'rows': rows, 'in': inc, 'out': exp, 'net': inc - exp,
                      'elecIn': sum(r['elec'] for r in rows.values()), 'landlordElec': elec - sum(r['elec'] for r in rows.values()),
                      'prevOwed': prev}
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
