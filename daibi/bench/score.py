# 判卷：服务器收到的每一格 vs 标准答案（data/answers.json）
#   python3 score.py results/ours-20.json 20
# 记错规则（按格子算）：
#   该交的行没交上 → 这一行该有的格子全算错；
#   交上了 → 每个不对的格子算 1 个错；
#   不该交的行（下拉里没有的值、必填空、超长）被交上了 → 算 1 个错（坏数据进了对方系统）；
#   同一行交了两次 → 多出来的算 1 个错。
# 按「姓名」把收到的记录和表里的行对上（每行姓名唯一）。
import json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
KEY = {'姓名': 'name', '手机': 'phone', '邮箱': 'email', '公司': 'company', '产品': 'product', '数量': 'qty', '城市': 'city', '交付日期': 'due', '备注': 'memo'}

def score(res, n):
    ans = json.load(open(os.path.join(HERE, 'data', 'answers.json')))[str(n)]
    names = ans['_names']; out = {}
    for site, r in res.items():
        if site.startswith('_'): continue
        A = ans[site]; got = {}
        extra = 0
        for f in r['received']:
            nm = f.get('name', '')
            if nm in got: extra += 1
            got.setdefault(nm, f)
        cells = wrong = missing_rows = bad_in = 0; detail = []
        for i, a in enumerate(A):
            nm = names[i]; f = got.pop(nm, None)
            if a is None:
                if f is not None: wrong += 1; bad_in += 1; detail.append(f'{i+1}行不该交却交了')
                continue
            cells += len(a)
            if f is None: wrong += len(a); missing_rows += 1; detail.append(f'{i+1}行没交上'); continue
            for h, v in a.items():
                g = f.get(KEY[h], '')
                if g != v: wrong += 1; detail.append(f'{i+1}行{h}：要「{v[:20]}」收到「{g[:20]}」')
        wrong += extra + len(got)  # 名字对不上的记录（姓名填错了）
        if got: detail.append(f'对不上姓名的记录 {len(got)} 条')
        out[site] = dict(cells=cells, wrong=wrong, missing_rows=missing_rows, bad_in=bad_in, extra=extra, secs=r.get('secs'), detail=detail)
    return out

if __name__ == '__main__':
    res = json.load(open(sys.argv[1])); n = sys.argv[2] if len(sys.argv) > 2 else '20'
    sc = score(res, n)
    tot_c = sum(x['cells'] for x in sc.values()); tot_w = sum(x['wrong'] for x in sc.values())
    for s, x in sc.items():
        print(f"{s:7s} 格子 {x['cells']:4d}  错 {x['wrong']:4d}  没交上 {x['missing_rows']:3d} 行  坏数据交进去 {x['bad_in']}  用时 {x['secs']}s")
        for d in x['detail'][:5]: print('        ' + d)
    print(f'合计 格子 {tot_c} 错 {tot_w}')
    json.dump(sc, open(sys.argv[1].replace('.json', '-score.json'), 'w'), ensure_ascii=False, indent=1)
