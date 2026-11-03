#!/usr/bin/env python3
"""对答案：python3 compare.py 输出.csv|xlsx 标准答案.csv 主键列名
数规矩：按主键对行；每格去首尾空格比；两边都是纯数字按数值比；Gender/Published/Status/上架状态 不分大小写。
输出 JSON：错格数、错格按列分布、多出行、缺少行、前 8 个错例。"""
import csv, io, json, sys, collections

def load(p):
    if p.endswith('.xlsx'):
        import openpyxl
        ws = openpyxl.load_workbook(p, read_only=True).active
        rows = [[('' if v is None else str(v)) for v in r] for r in ws.iter_rows(values_only=True)]
    else:
        b = open(p, 'rb').read()
        for enc in ('utf-8-sig', 'gb18030'):
            try: t = b.decode(enc); break
            except UnicodeDecodeError: pass
        rows = list(csv.reader(io.StringIO(t)))
    return rows[0], rows[1:]

def num(x):
    try:
        if x.strip() and all(c in '0123456789.-' for c in x.strip()): return float(x)
    except ValueError: pass
    return None

CI = {'gender', 'published', 'status', '上架状态'}

def same(a, b, col):
    a, b = a.strip(), b.strip()
    if a == b: return True
    na, nb = num(a), num(b)
    if na is not None and nb is not None: return abs(na - nb) < 1e-9
    if col.lower() in CI: return a.lower() == b.lower()
    return False

def compare(out, truth, key):
    oh, orows = load(out); th, trows = load(truth)
    ok = oh.index(key); tk = th.index(key)
    T = collections.OrderedDict((r[tk], r) for r in trows)
    seen, bad, bycol, ex, extra = set(), 0, collections.Counter(), [], 0
    for r in orows:
        if not any(c.strip() for c in r): extra += 1; continue
        k = r[ok].strip() if ok < len(r) else ''
        if k not in T or k in seen: extra += 1; continue
        seen.add(k); t = T[k]
        for j, col in enumerate(th):
            oj = oh.index(col) if col in oh else None
            v = r[oj] if oj is not None and oj < len(r) else ''
            if not same(v, t[j], col):
                bad += 1; bycol[col] += 1
                if len(ex) < 8: ex.append([k, col, v[:40], t[j][:40]])
    miss = len([k for k in T if k not in seen])
    return {'cells': len(trows) * len(th), 'bad_cells': bad + miss * len(th), 'bad_by_col': dict(bycol), 'extra_rows': extra, 'missing_rows': miss, 'examples': ex}

if __name__ == '__main__':
    print(json.dumps(compare(*sys.argv[1:4]), ensure_ascii=False, indent=1))
