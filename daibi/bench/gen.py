# 代笔僧比武：生成测试表 + 标准答案
#   python3 gen.py            → data/表20.xlsx（入库的小样本）、data/表100.xlsx（不入库）、data/answers.json
# 刁钻的地方：中文、空格子、只有空格的格子、日期写法不一（真日期单元格/斜杠/年月日/点/月日年/8 位数字）、
#             下拉里没有的值（企业版、拉萨）、超长备注（多行）、带千分位的数量；
#             0.2.2 加「标签」列给多选下拉：分隔符混用（、，; 和逗号），也有选项里没有的（VIP）。
# 名字是随机拼的假名字，公司是「示例××」，邮箱都在 example.com。
import openpyxl, datetime, json, os, random
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, 'data'); os.makedirs(D, exist_ok=True)
H = ['姓名', '手机', '邮箱', '公司', '产品', '数量', '城市', '交付日期', '备注', '标签']
TAGS = ['新客户', '老客户', '加急', '大客户', '需发票', '海外']
TAGV = ['加急、大客户', '新客户', '', '需发票, 海外', '老客户；加急；需发票', '大客户', '加急、VIP', '海外']
SUR = '林陈黄周吴郑王冯何吕施孔曹严华金魏陶姜谢邹喻苏潘葛范彭郎鲁韦昌马苗凤花方俞任袁柳'
GIV = '晓一子文宇思嘉若安亦可清明远星禾川岚舟言知夏秋'
PROD = ['标准版', '专业版', '旗舰版']; PCODE = {'标准版': 'std', '专业版': 'pro', '旗舰版': 'max'}
CITY = ['北京', '上海', '广州', '深圳', '杭州', '成都', '新加坡', '南京', '武汉', '西安']
LONG = ('客户要求分两批发货，第一批先发样品，第二批等确认后再发；发票抬头和公司名称一致，'
        '收货时间工作日 9:00-18:00，周末不收。联系人如不在，可交给前台代收并拍照回传。') * 3 + '\n第二段：结尾。'

def make(n, seed):
    rnd = random.Random(seed); used = set(); rows = []
    for i in range(1, n + 1):
        while True:
            nm = rnd.choice(SUR) + rnd.choice(GIV) + rnd.choice(GIV)
            if nm not in used: used.add(nm); break
        d = datetime.date(2026, 11, 1) + datetime.timedelta(days=(i * 3) % 60)
        k = i % 6
        date = [d, f'{d.year}/{d.month}/{d.day}', f'{d.year}年{d.month}月{d.day}日', f'{d.year}.{d.month:02d}.{d.day:02d}',
                f'{d.month:02d}/{d.day:02d}/{d.year}', f'{d.year}{d.month:02d}{d.day:02d}'][k]
        if k == 4 and d.day <= 12: date = f'{d.year}-{d.month}-{d.day}'   # 月日能对调的不用 月/日/年，免得有歧义
        rows.append({
            '姓名': nm,
            '手机': '' if i % 9 == 0 else f'1{rnd.randint(3, 9)}{rnd.randint(0, 999999999):09d}',
            '邮箱': f'user{i:03d}@example.com',
            '公司': '' if i % 7 == 0 else ('   ' if i % 17 == 0 else f'示例{rnd.choice(GIV)}{rnd.choice(GIV)}科技有限公司'),
            '产品': '企业版' if i % 11 == 0 else PROD[i % 3],
            '数量': '1,200' if i % 13 == 0 else rnd.randint(1, 50),
            '城市': '拉萨' if i % 19 == 0 else CITY[i % 10],
            '交付日期': date, '_iso': d.isoformat(),
            '备注': [ '', '加急', LONG, '', '电话先联系，再送货', '含"引号"和,逗号'][i % 6],
            '标签': TAGV[i % 8],
        })
    return rows

def save(rows, fn):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = '客户'
    ws.append(H)
    for r in rows: ws.append([r[h] for h in H])
    for row in ws.iter_rows(min_row=2):
        if isinstance(row[7].value, datetime.date): row[7].number_format = 'yyyy/m/d'
    ws.column_dimensions['H'].width = 14
    wb.save(os.path.join(D, fn))

# 每个网站要哪些格子、服务器该收到什么；None = 这行不该提交（该报错让人看）
txt = lambda v: '' if v is None else str(v).strip()
def qty(v): return str(v).replace(',', '')
SITES = {
    'plain':  ['姓名', '手机', '邮箱', '公司', '产品', '数量', '城市', '交付日期', '备注'],
    'react':  ['姓名', '手机', '邮箱', '公司', '产品', '数量'],
    'dd':     ['姓名', '产品', '城市'],
    'iframe': ['姓名', '手机', '邮箱', '公司'],
    'wizard': ['姓名', '手机', '公司', '产品', '数量', '城市', '交付日期', '备注'],
    'ajax':   ['姓名', '邮箱', '公司', '备注'],
    'valid':  ['姓名', '手机', '邮箱', '公司', '备注'],
    'date':   ['姓名', '交付日期'],
    # 0.2.2 真组件库
    'antd':    ['姓名', '产品', '城市', '标签', '交付日期'],
    'element': ['姓名', '产品', '城市', '标签', '交付日期'],
    'mui':     ['姓名', '产品', '城市', '标签', '交付日期'],
    'select2': ['姓名', '产品', '城市', '标签'],
    'shadow':  ['姓名', '手机', '产品', '城市', '交付日期'],
}
import re
def answer(site, r):
    a = {}
    for h in SITES[site]:
        v = r[h]
        if h == '产品':
            if v not in PCODE: return None
            a[h] = PCODE[v]
        elif h == '城市':
            if v not in CITY: return None
            a[h] = v
        elif h == '数量': a[h] = qty(v)
        elif h == '标签':                    # 多选：顺序不计，判卷时排序比
            t = [x.strip() for x in re.split(r'[、，,；;|/]+', v) if x.strip()]
            if any(x not in TAGS for x in t): return None
            a[h] = ','.join(t)
        elif h == '交付日期': a[h] = r['_iso']
        else: a[h] = txt(v)
    if site == 'valid':                      # 必填：姓名、手机、邮箱；备注最多 100 字
        if not a['手机'] or len(a['备注']) > 100: return None
    return a

if __name__ == '__main__':
    out = {}
    for n, seed in ((20, 20), (100, 100)):
        rows = make(n, seed); save(rows, f'表{n}.xlsx')
        out[str(n)] = {s: [answer(s, r) for r in rows] for s in SITES}
        out[str(n)]['_names'] = [r['姓名'] for r in rows]
    json.dump(out, open(os.path.join(D, 'answers.json'), 'w'), ensure_ascii=False, indent=0)
    for n in ('20', '100'):
        print(n, {s: sum(1 for x in out[n][s] if x) for s in SITES})
