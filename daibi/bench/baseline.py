# 对手「手工复制粘贴」：白领不用工具时的真实做法。Excel 和浏览器左右并排，一格一格搬。
# 动手次数按下面的规矩逐格数（不估），时间用 KLM 击键层模型估（Card, Moran & Newell）：
#   P 指向并点击 1.1+0.2=1.3 s；K 一个组合键 0.28×2≈0.56 s；M 想一下 1.35 s；打一个字 0.28 s
# 每格：
#   文本框：点 Excel 格(1) + Ctrl+C(1) + 点网页框(1) + Ctrl+V(1) = 4 下；    时间 M+P+K+P+K
#   下拉（原生或自定义）：点开(1) + 点选项(1) = 2 下；                          时间 M+P+P
#   原生日期框：点框(1) + 打 8 位数字(1) = 2 下（日期写法不一，复制粘贴进不去，只能看着打）；时间 M+P+8 字
#   日历控件：点框(1) + 翻月(平均 1) + 点日子(1) = 3 下；                       时间 M+3P（date 和 antd/element/mui 的日期框）
#   多选下拉（标签）：点开(1) + 每个选项点一下 + 点别处收起(1)；                  时间 M+(2+n)P
#   空格子：0 下，但要看一眼（M）
# 每行：点提交 1 下（向导每页 1 下）；成功页回表单 1 下（向导）；下拉里没有的值、必填空 → 这行跳过，看一眼（M）。
# 准：假定人一格不错（偏向对手的假定），所以「准」这一项我们最多打平。
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
P, K, M, CH = 1.3, 0.56, 1.35, 0.28
KIND = {'产品': 'select', '城市': 'select', '交付日期': 'date', '标签': 'multi'}
CAL = ('date', 'antd', 'element', 'mui')
PAGES = {'wizard': 3}

def cell(site, h, v):
    k = KIND.get(h, 'text')
    if site == 'dd' and k == 'select': k = 'select'
    if site in CAL and h == '交付日期': k = 'cal'
    if v == '': return 0, M
    if k == 'text': return 4, M + P + K + P + K
    if k == 'select': return 2, M + 2 * P
    if k == 'date': return 2, M + P + 8 * CH
    if k == 'cal': return 3, M + 3 * P
    if k == 'multi': n = len(v.split(',')); return 2 + n, M + (2 + n) * P

def run(n):
    ans = json.load(open(os.path.join(HERE, 'data', 'answers.json')))[str(n)]
    out = {}
    for site, rows in ans.items():
        if site.startswith('_'): continue
        acts = 0; secs = 0.0
        for a in rows:
            if a is None: secs += M; continue
            for h, v in a.items():
                x, t = cell(site, h, v); acts += x; secs += t
            pages = PAGES.get(site, 1)
            acts += pages + (1 if site == 'wizard' else 0); secs += (pages + (1 if site == 'wizard' else 0)) * (P + 1.0)  # 点完等页面 1 s
        out[site] = dict(acts=acts, secs=round(secs, 1))
    return out

if __name__ == '__main__':
    n = sys.argv[1] if len(sys.argv) > 1 else '20'
    r = run(n)
    for s, x in r.items(): print(f'{s:7s} 动手 {x["acts"]:5d} 下   估时 {x["secs"]:7.1f} s')
    json.dump(r, open(os.path.join(HERE, 'results', f'manual-{n}.json'), 'w'), ensure_ascii=False, indent=1)
