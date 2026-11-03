#!/usr/bin/env python3
"""0.3.0 复赛汇总：vs-old.sh 跑出来的 r1..r3/{old,ours} 逐个打分，按场景取用时中位数，写 results/vs-old-0.3.0.json。
用法：python3 huayuan/bench/vs-old-sum.py <vs-old.sh 的输出目录>
"""
import sys, os, json, statistics
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from score import score  # noqa: E402

base = sys.argv[1]
out = {}
for ver in ('old', 'ours'):
    rows = {}
    for r in sorted(d for d in os.listdir(base) if d.startswith('r') and os.path.isdir(os.path.join(base, d))):
        run = json.load(open(os.path.join(base, r, ver, 'run.json')))['results']
        for x in run:
            a = json.load(open(os.path.join(HERE, 'site', 'answers', x['scene'] + '.json')))
            f = x.get('file') and os.path.join(base, r, ver, os.path.basename(x['file']))  # 目录挪过，按文件名在 run.json 旁边找
            s = score(a, f) if f and os.path.exists(f) else None
            rows.setdefault(x['scene'], []).append({'ms': x['ms'], 'clicks': x['clicks'], 'steps': x['steps'], 's': s})
    v = {}
    for sc, lst in rows.items():
        s = lst[0]['s']
        same = all(json.dumps(l['s'], sort_keys=True) == json.dumps(s, sort_keys=True) for l in lst)
        v[sc] = {'ms': [l['ms'] for l in lst], 'msMedian': statistics.median(l['ms'] for l in lst), 'clicks': lst[0]['clicks'], 'steps': lst[0]['steps'],
                 'rows': f"{s['rowsOut']}/{s['rowsWant']}", 'miss': s['miss'], 'dup': s['dup'], 'extra': s['extra'], 'wrongCols': s['wrongCols'],
                 'named': f"{s['namedOk']}/{s['colsWant']}", 'extraCols': s['extraCols'], 'sameEveryRound': same}
    out['0.2.1' if ver == 'old' else '0.3.0'] = v
for ver, v in out.items():
    tot = sum(x['msMedian'] for x in v.values())
    print(ver, '合计中位数 %.1f 秒' % (tot / 1000), '点击', sum(x['clicks'] for x in v.values()))
    for sc, x in v.items():
        print('  %-11s %s 漏%d 重%d 多%d 错列%d 名%s 杂%d 点%d %s 秒 一致=%s' % (sc, x['rows'], x['miss'], x['dup'], x['extra'], x['wrongCols'], x['named'], x['extraCols'], x['clicks'], ['%.2f' % (m / 1000) for m in x['ms']], x['sameEveryRound']))
json.dump(out, open(os.path.join(HERE, 'results', 'vs-old-0.3.0.json'), 'w'), ensure_ascii=False, indent=1)
