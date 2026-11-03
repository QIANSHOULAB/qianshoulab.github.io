#!/usr/bin/env python3
"""0.3.0 起的复赛对答案：读 data/out/ours<TAG>.json（run_ours.js 写的），第一次用、第二次用的输出各对一遍，写回 结果<TAG>.json。TAG 取环境变量 YJ_TAG，默认 030。"""
import json, os, subprocess, sys
H = os.path.dirname(os.path.abspath(__file__))
TAG = os.environ.get('YJ_TAG', '030')
res = json.load(open(os.path.join(H, 'data', 'out', f'ours{TAG}.json'), encoding='utf8'))
out = {}
for k, v in res.items():
    out[k] = {}
    for u in ('first', 'second'):
        r = v[u]
        d = json.loads(subprocess.check_output([sys.executable, os.path.join(H, 'compare.py'), r['file'], r['truth'], r['key']]))
        out[k][u] = {x: r[x] for x in ('clicks', 'doubts', 'auto', 'readMs', 'readyMs', 'exportMs', 'machineMs')}
        out[k][u].update({x: d[x] for x in ('cells', 'bad_cells', 'extra_rows', 'missing_rows')})
        print(k, u, 'clicks', r['clicks'], 'auto', r['auto'], 'bad', d['bad_cells'], '/', d['cells'], 'extra', d['extra_rows'], 'missing', d['missing_rows'], 'machine', r['machineMs'], 'ms')
    out[k]['errs'] = v['errs']
json.dump(out, open(os.path.join(H, f'结果{TAG}.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
