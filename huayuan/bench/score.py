#!/usr/bin/env python3
"""化缘僧比武 · 打分：拿导出的 xlsx 对标准答案。
用法：python3 score.py <site/answers 目录> <工具输出目录（里面有 run.json 和 <场景>.xlsx）>
口径：
  行：按「编号」认行（编号在该行任一格里出现即算这一行）。漏行 = 答案里有、表里没有；
      重复 = 同一编号出现第二次起每次算一处；多余 = 认不出编号的行（广告、杂行）。
  列：答案每一列，在表里找命中率最高的一列（只看认出的行）。值相等，或去掉 ≤6 字的标签前缀（「发货地：」「评分 」）后相等，算对。
      命中率 < 98% 记一处「错列」，同时报这列错了几格。答案里是空值的格子：表里也得空，或者整列都没对上时不另算。
  列名：对上的那一列，表头跟答案列名一样（或同义：城市≈地区/发货地，链接≈名称链接）算「名字对」。多出来的列（答案里没有）记「杂列」。
"""
import sys, json, os, re, openpyxl

def norm(v):
    if v is None: return ''
    if isinstance(v, float) and v.is_integer(): v = int(v)
    return re.sub(r'\s+', ' ', str(v)).strip()

def same(out, want):
    if out == want: return True
    try:  # xlsx 里存成数字的（4.0 → 4）按数值比
        if want and float(out) == float(want): return True
    except ValueError: pass
    if want and out.endswith(want) and len(out) - len(want) <= 6:
        pre = out[: len(out) - len(want)]
        return bool(re.search(r'[:：\s]$', pre))
    return False

SYN = {'城市': {'地区', '发货地'}, '链接': {'名称链接'}}

def score(ans, xlsx):
    wb = openpyxl.load_workbook(xlsx, read_only=True)
    rows = [[norm(c) for c in r] for r in wb.active.iter_rows(values_only=True)]
    head, body = rows[0], [r for r in rows[1:] if any(r)]
    truth = {r['编号']: r for r in ans['rows']}
    idre = re.compile(r'(?:C|SKU)-\d{5}')
    seen, dup, extra, matched = {}, 0, 0, []
    for r in body:
        ids = [m for c in r for m in idre.findall(c) if m in truth]
        if not ids: extra += 1; continue
        k = ids[0]
        if k in seen: dup += 1; continue
        seen[k] = 1; matched.append((k, r))
    miss = len(truth) - len(seen)
    cols = []
    for c in ans['cols']:
        best, bi = -1, None
        for j in range(len(head)):
            ok = sum(1 for k, r in matched if same(r[j] if j < len(r) else '', truth[k][c]))
            if ok > best: best, bi = ok, j
        n = len(matched)
        rate = best / n if n else 0
        cols.append({'col': c, 'hit': best, 'of': n, 'rate': round(rate, 4), 'outCol': head[bi] if bi is not None and bi < len(head) else None, 'bad': n - best})
    wrong = [c for c in cols if c['rate'] < 0.98]
    named = sum(1 for c in cols if c['outCol'] == c['col'] or c['outCol'] in SYN.get(c['col'], ()))
    used = {c['outCol'] for c in cols}
    return {'rowsOut': len(body), 'rowsWant': len(truth), 'miss': miss, 'dup': dup, 'extra': extra,
            'colsOut': len(head), 'colsWant': len(ans['cols']), 'wrongCols': len(wrong),
            'wrongColNames': [f"{c['col']}({c['bad']}格)" for c in wrong], 'namedOk': named, 'extraCols': len([h for h in head if h not in used]), 'badCells': sum(c['bad'] for c in cols), 'header': head}

if __name__ == '__main__':
    adir, odir = sys.argv[1], sys.argv[2]
    run = json.load(open(os.path.join(odir, 'run.json')))
    if isinstance(run, dict): run = run['results']
    out = []
    for r in run:
        a = json.load(open(os.path.join(adir, r['scene'] + '.json')))
        s = score(a, r['file']) if r.get('file') and os.path.exists(r['file']) else None
        out.append({**r, 'score': s})
        if s: print(f"{r['scene']:12} 点{r['clicks']} {r['ms']/1000:6.1f}s  出{s['rowsOut']}/{s['rowsWant']}行 漏{s['miss']} 重{s['dup']} 多{s['extra']}  列{s['colsOut']}/{s['colsWant']} 错列{s['wrongCols']} 名字对{s['namedOk']}/{s['colsWant']} 杂列{s['extraCols']} {s['wrongColNames']}  表头={s['header']}")
        else: print(r['scene'], '无文件', r.get('note'))
    json.dump(out, open(os.path.join(odir, 'score.json'), 'w'), ensure_ascii=False, indent=1)
