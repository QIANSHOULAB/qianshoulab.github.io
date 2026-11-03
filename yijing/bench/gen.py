#!/usr/bin/env python3
"""译经僧比武材料生成器。全是虚构数据（名字随机拼，公司是佛经词，邮箱 example.*）。

用法：python3 gen.py [输出目录] [--big]
  默认输出到 bench/data/（不进仓库）；bench/samples/ 是用同一脚本生成的小样本（进仓库）。
  --big 另出 crm_100k.csv（10 万行，约 13MB）和它的标准答案。

每个场景两份：来源文件（刁钻）+ 标准答案 truth_*.csv（目标模板该长成的样子，UTF-8）。
"""
import csv, io, os, random, sys

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'))
BIG = '--big' in sys.argv
os.makedirs(OUT, exist_ok=True)

SUR = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴', '林', '郭', '何', '高', '罗']
CSUR = ['欧阳', '司马', '上官', '诸葛']
GIV = ['子涵', '浩然', '雨桐', '思远', '晓峰', '若溪', '嘉怡', '俊杰', '梦琪', '文博', '欣然', '志强', '敏', '磊', '静', '一鸣']
EN_F = ['Alex', 'Mia', 'Ryan', 'Chloe', 'Ethan', 'Grace', 'Lucas', 'Ivy']
EN_L = ['Lim', 'Tan', 'Goh', 'Ng', 'Wong', 'Lee', 'Koh', 'Ong']
CO = ['一苇渡江科技', '不二法门咨询', '菩提树下贸易', '明镜台设计', '拈花微笑文化', '南山南物流', '山高水长传媒', '松风明月食品', 'Lotus Pond Pte Ltd', '']
JT = ['销售总监', '采购经理', '行政主管', '创始人', '财务', 'Marketing Manager', '技术负责人', '']
CITY_CN = ['上海', '北京', '深圳', '杭州', '成都', '广州', '苏州']
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def w(path, header, rows, enc='utf-8', pre=None):
    buf = io.StringIO()
    cw = csv.writer(buf, lineterminator='\r\n')
    if pre:
        for p in pre: cw.writerow(p)
    cw.writerow(header)
    for r in rows: cw.writerow(r)
    t = buf.getvalue()
    if enc == 'gbk': t = t.replace('¥', '￥').replace('—', '-')  # 真 GBK 文件里没有这两个字
    with open(os.path.join(OUT, path), 'wb') as f: f.write(t.encode(enc))


def long_note(r):
    s = '客户反馈：' + '，'.join(r.choice(['发票抬头要改', '周三下午才回消息', '要月结', '"VIP" 客户', '换了对接人, 新对接人姓周', '地址：上海市浦东新区某路 88 号 3 楼']) for _ in range(r.randint(60, 140)))
    return s + '\n（第二行备注）'


def crm(n, seed, title=True, empty_rows=True):
    r = random.Random(seed)
    H = ['客户ID', 'Name 姓名', '性别/Sex', 'Mobile 手机', 'Tel 座机', 'E-mail', '国家', '公司名称', '职务', 'City', '注册日期', 'Total Spent', '备注 Notes']
    T = ['Customer ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Gender', 'Company', 'Job Title', 'City', 'Country', 'Created Date', 'Lifetime Value', 'Notes']
    src, tru = [], []
    for i in range(n):
        cid = f'C{100001 + i}'
        sg = r.random() < 0.18
        if r.random() < 0.15:
            first, last = r.choice(EN_F), r.choice(EN_L); name = f'{first} {last}'
        else:
            last = r.choice(CSUR) if r.random() < 0.06 else r.choice(SUR); first = r.choice(GIV)
            name = last + first if r.random() < 0.92 else f'{last} {first}'
        g = r.choice(['M', 'F'])
        gsrc = r.choice({'M': ['男', '男', '男', 'M', 'Male', '先生', 'male'], 'F': ['女', '女', '女', 'F', 'Female', '女士', 'f']}[g])
        if r.random() < 0.05: gsrc, g = r.choice(['', '未知']), ''
        # 电话
        if r.random() < 0.06:
            ph_src, ph = '', ''
        elif sg:
            d = r.choice('89') + ''.join(r.choice('0123456789') for _ in range(7))
            ph = '+65' + d
            ph_src = r.choice([f'+65 {d[:4]} {d[4:]}', d, f'{d[:4]} {d[4:]}', f'65{d}', f'(+65) {d}'])
        else:
            d = '1' + r.choice('3456789') + ''.join(r.choice('0123456789') for _ in range(9))
            ph = '+86' + d
            ph_src = r.choice([d, d, f'{d[:3]}-{d[3:7]}-{d[7:]}', f'{d[:3]} {d[3:7]} {d[7:]}', f'+86 {d}', f'86{d}', f'+86-{d}'])
        tel = r.choice(['', '', '', f'021-6{r.randint(100, 999)} {r.randint(1000, 9999)}'])
        mail_user = (first + '.' + last if not any('一' <= c <= '鿿' for c in name) else f'u{i}').lower()
        email = f'{mail_user}{i}@example.{r.choice(["com", "cn", "sg"])}'
        mail_src = r.choice([email, email, email.upper() if r.random() < .3 else email.capitalize(), ' ' + email + ' '])
        co, jt = r.choice(CO), r.choice(JT)
        city = r.choice(CITY_CN) if not sg else '新加坡'
        country = '新加坡' if sg else '中国'
        y, m, dd = r.randint(2019, 2026), r.randint(1, 12), r.randint(1, 28)
        hh, mi = r.randint(0, 23), r.randint(0, 59)
        dt = f'{y}-{m:02d}-{dd:02d}'
        ds = r.choice([dt, f'{y}/{m}/{dd}', f'{y}/{m}/{dd} {hh}:{mi:02d}', f'{y}年{m}月{dd}日', f'{dd:02d}/{m:02d}/{y}', f'{dd} {MON[m-1]} {y}',
                       f'{MON[m-1]} {dd}, {y}', f'{y}{m:02d}{dd:02d}', f'{y}.{m:02d}.{dd:02d}', f'{dt} {hh:02d}:{mi:02d}:00'])
        cents = r.randint(0, 9_000_000)
        amt = f'{cents/100:.2f}'
        a = cents / 100
        asrc = r.choice([f'¥{a:,.2f}', f'{a:,.2f}', f'{a:.2f}', f'RMB {a:,.2f}', f'S${a:,.2f}', f'{a:,.2f} 元', f'￥ {a:,.2f}'])
        if r.random() < 0.05: asrc, amt = '', ''
        note = long_note(r) if r.random() < 0.03 else r.choice(['', '', '', '老客户', '要发票, 抬头见邮件', '说"下周再联系"'])
        src.append([cid, name, gsrc, ph_src, tel, mail_src, country, co, jt, city, ds, asrc, note])
        tru.append([cid, first, last, email, ph, g, co, jt, city, country, dt, amt, note])
    rows = list(src)
    if empty_rows:
        for k in sorted(r.sample(range(len(rows)), max(1, n // 40)), reverse=True):
            rows.insert(k, [''] * len(H) if r.random() < .6 else [' '] + [''] * (len(H) - 1))
    pre = [['客户导出（旧 CRM） 导出时间 2026-10-31 18:02'], []] if title else None
    return H, rows, T, tru, pre


def shop_cn(n, seed):
    r = random.Random(seed)
    H = ['商家编码', '宝贝标题', '类目', '品牌', '一口价', '市场价', '库存', '条形码', '状态', '标签', '重量', '宝贝描述', '主图']
    T = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Variant SKU', 'Variant Grams', 'Variant Inventory Qty', 'Variant Price', 'Variant Compare At Price', 'Variant Barcode', 'Image Src', 'Status']
    cats = ['女装/连衣裙', '茶叶', '家居/收纳', '数码配件', '文具']
    brands = ['竹林', '山泉', '无相', '一叶']
    adj = ['夏季', '新品', '纯棉', '复古', '加厚', '便携', '限量']
    src, tru = [], []
    for i in range(n):
        sku = f'{r.choice(["TS", "CY", "JJ", "SM"])}-{2024 + i % 3}-{i + 1:03d}'
        title = f'{r.choice(brands)}{r.choice(adj)}{r.choice(["连衣裙", "龙井 250g", "收纳盒", "数据线 1m", "笔记本 A5"])} {r.choice(["S", "M", "L", "", "两件套"])}'.strip()
        cat, br = r.choice(cats), r.choice(brands)
        p = r.randint(990, 129900) / 100
        cp = round(p * r.choice([1.2, 1.5, 2]), 2) if r.random() < .6 else None
        psrc = r.choice([f'¥{p:,.2f}', f'{p:.2f}', f'￥{p:,.2f}', f'{p:,.2f}元', f'{p:g}'])
        cpsrc = '' if cp is None else r.choice([f'¥{cp:,.2f}', f'{cp:.2f}'])
        stock = r.randint(0, 5000)
        ssrc = r.choice([str(stock), f'{stock:,}', f'{stock} 件'])
        bc = r.choice(['690', '693', '069']) + ''.join(r.choice('0123456789') for _ in range(10))
        on = r.random() < .7
        st = r.choice(['出售中', '在售', '上架']) if on else r.choice(['仓库中', '已下架', '下架'])
        tags = r.sample(adj, r.randint(0, 3))
        tsrc = r.choice(['|', '，', ';', ' ']).join(tags)
        gm = r.choice([150, 250, 500, 800, 1200, 2350])
        wsrc = r.choice([f'{gm}g', f'{gm/1000:g}kg', f'{gm}', f'{gm/1000:g} 千克', f'{gm} 克'])
        desc = '<p>' + '，'.join(r.choice(['面料舒适', '支持七天无理由', '颜色以实物为准, 拍照有色差', '"爆款"回归', '产地：杭州']) for _ in range(r.randint(300, 400) if r.random() < .05 else r.randint(3, 12))) + '</p>\n<p>注意事项见详情</p>'
        img = f'https://img.example.com/p/{sku.lower()}.jpg'
        src.append([sku, title, cat, br, psrc, cpsrc, ssrc, bc, st, tsrc, wsrc, desc, img])
        tru.append([sku.lower(), title, desc, br, cat, ', '.join(tags), 'TRUE' if on else 'FALSE', sku, str(gm), str(stock), f'{p:.2f}', '' if cp is None else f'{cp:.2f}', bc, img, 'active' if on else 'draft'])
    return H, src, T, tru


def shopify(n, seed):
    r = random.Random(seed)
    H = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Grams',
         'Variant Inventory Qty', 'Variant Price', 'Variant Compare At Price', 'Variant Barcode', 'Image Src', 'Image Position', 'Status']
    T = ['商品编码', '商品名称', '分类', '品牌', '售价', '划线价', '库存', '条码', '上架状态', '商品描述', '主图链接']
    src, tru = [], []
    for i in range(n):
        h = f'linen-shirt-{i + 1}'
        title = f'Linen Shirt No.{i + 1} — "Monk" edition'
        vendor = r.choice(['Bamboo Grove', 'Still Water', 'Lotus & Co.'])
        typ = r.choice(['Shirts', 'Tea', 'Home'])
        body = f'<p>Soft linen, relaxed fit.</p><p>Wash cold, hang dry, {i}.</p>'
        stt = r.choice(['active', 'active', 'active', 'draft', 'archived'])
        imgs = [f'https://cdn.example.com/s/{h}-{k}.jpg' for k in range(1, r.randint(1, 4) + 1)]
        nvar = r.randint(1, 3)
        for v in range(nvar):
            sku = f'LS{i + 1:03d}-{"SML"[v]}'
            p = r.randint(1500, 25000) / 100
            cp = '' if r.random() < .5 else f'{p * 1.3:.2f}'
            q = r.randint(-3, 300)
            bc = '0' + ''.join(r.choice('0123456789') for _ in range(11))
            first = v == 0
            src.append([h, title if first else '', body if first else '', vendor if first else '', 'Apparel & Accessories' if first else '', typ if first else '',
                        'linen, summer' if first else '', ('true' if stt == 'active' else 'false') if first else '', 'Size' if first else '', 'SML'[v], sku, '300', str(q),
                        f'{p:.2f}', cp, bc, imgs[0] if first else '', '1' if first else '', stt if first else ''])
            tru.append([sku, title, typ, vendor, f'{p:.2f}', cp, str(q), bc, '上架' if stt == 'active' else '下架', body, imgs[0]])
        for k, im in enumerate(imgs[1:], 2):
            src.append([h] + [''] * 15 + [im, str(k), ''])
    return H, src, T, tru


COA = [
    ('1001', '库存现金', '资产', '借'), ('1002', '银行存款', '资产', '借'), ('1002.01', '工商银行', '资产', '借'), ('1002.02', '招商银行', '资产', '借'),
    ('1012', '其他货币资金', '资产', '借'), ('1101', '交易性金融资产', '资产', '借'), ('1121', '应收票据', '资产', '借'), ('1122', '应收账款', '资产', '借'),
    ('1123', '预付账款', '资产', '借'), ('1221', '其他应收款', '资产', '借'), ('1231', '坏账准备', '资产', '贷'), ('1403', '原材料', '资产', '借'),
    ('1405', '库存商品', '资产', '借'), ('1601', '固定资产', '资产', '借'), ('1602', '累计折旧', '资产', '贷'), ('1701', '无形资产', '资产', '借'),
    ('2001', '短期借款', '负债', '贷'), ('2201', '应付票据', '负债', '贷'), ('2202', '应付账款', '负债', '贷'), ('2203', '预收账款', '负债', '贷'),
    ('2211', '应付职工薪酬', '负债', '贷'), ('2221', '应交税费', '负债', '贷'), ('2221.01', '应交增值税', '负债', '贷'), ('2241', '其他应付款', '负债', '贷'),
    ('4001', '实收资本', '所有者权益', '贷'), ('4002', '资本公积', '所有者权益', '贷'), ('4101', '盈余公积', '所有者权益', '贷'), ('4103', '本年利润', '所有者权益', '贷'),
    ('4104', '利润分配', '所有者权益', '贷'), ('5001', '生产成本', '成本', '借'), ('5101', '制造费用', '成本', '借'), ('6001', '主营业务收入', '损益', '贷'),
    ('6051', '其他业务收入', '损益', '贷'), ('6111', '投资收益', '损益', '贷'), ('6301', '营业外收入', '损益', '贷'), ('6401', '主营业务成本', '损益', '借'),
    ('6402', '其他业务成本', '损益', '借'), ('6403', '税金及附加', '损益', '借'), ('6601', '销售费用', '损益', '借'), ('6602', '管理费用', '损益', '借'),
    ('6602.01', '办公费', '损益', '借'), ('6602.02', '差旅费', '损益', '借'), ('6603', '财务费用', '损益', '借'), ('6711', '营业外支出', '损益', '借'), ('6801', '所得税费用', '损益', '借'),
]


def coa(seed):
    r = random.Random(seed)
    H = ['科目代码', '科目名称', '类别', '余额方向', '期初余额', '科目全名']
    T = ['Code', 'Name', 'Type', 'Description', 'Opening Balance']
    EN = {'资产': 'Asset', '负债': 'Liability', '所有者权益': 'Equity', '成本': 'Expense'}
    src, tru = [], []
    names = {c: n for c, n, *_ in COA}
    for code, name, cat, d in COA:
        sub = '.' in code
        full = (names[code.split('.')[0]] + '_' + name) if sub else name
        if cat == '损益':
            typ = 'Revenue' if code[:2] == '60' or code in ('6111', '6301') else 'Expense'
        else:
            typ = EN[cat]
        bal = 0 if code[0] in '56' else r.randint(-50_000_00, 3_000_000_00) / 100
        if code in ('1231', '1602'): bal = -abs(bal) if bal else -1000
        bsrc = '' if bal == 0 and r.random() < .5 else (f'({abs(bal):,.2f})' if bal < 0 and r.random() < .6 else f'{bal:,.2f}')
        btru = '' if bsrc == '' else f'{bal:.2f}'
        src.append([code, ('    ' if sub else '') + name, cat, d, bsrc, full])
        tru.append([code, name, typ, full, btru])
    pre = [['科目表'], ['账套：测试账套（虚构）', '', '', '', '币别：人民币']]
    return H, src, T, tru, pre


# 0.2.1 加：英文网店表，标签整列用空格分隔、里面有多词标签（summer sale）；single=True 时每格只有一个标签（多词也不许拆）
EN_ADJ = ['linen', 'cotton', 'organic', 'vintage', 'handmade', 'gift', 'bestseller', 'eco']
EN_PHR = ['summer sale', 'new arrival', 'back to school', 'limited edition', 'free shipping', 'gift set']


def shop_en(n, seed, single=False):
    r = random.Random(seed)
    H = ['SKU', 'Product Name', 'Category', 'Brand', 'Price', 'Compare Price', 'Stock', 'Barcode', 'Status', 'Tags', 'Weight', 'Description', 'Image']
    T = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Variant SKU', 'Variant Grams', 'Variant Inventory Qty', 'Variant Price', 'Variant Compare At Price', 'Variant Barcode', 'Image Src', 'Status']
    cats = ['Dresses', 'Tea', 'Storage', 'Cables', 'Stationery']
    brands = ['Bamboo Grove', 'Still Water', 'Lotus & Co.', 'One Leaf']
    src, tru = [], []
    for i in range(n):
        sku = f'{r.choice(["DR", "TE", "ST", "CB"])}-{2024 + i % 3}-{i + 1:03d}'
        title = f'{r.choice(brands)} {r.choice(["Linen Dress", "Longjing 250g", "Storage Box", "USB-C Cable 1m", "A5 Notebook"])} {r.choice(["S", "M", "L", ""])}'.strip()
        cat, br = r.choice(cats), r.choice(brands)
        p = r.randint(990, 29900) / 100
        cp = round(p * r.choice([1.2, 1.5, 2]), 2) if r.random() < .6 else None
        stock = r.randint(0, 5000)
        bc = r.choice(['690', '693', '069']) + ''.join(r.choice('0123456789') for _ in range(10))
        on = r.random() < .7
        st = r.choice(['Active', 'active', 'Published']) if on else r.choice(['Draft', 'draft', 'Hidden'])
        if single:
            tags = [r.choice(EN_PHR + EN_ADJ)] if r.random() < .85 else []
        else:
            tags = r.sample(EN_ADJ + EN_PHR, r.choice([0, 1, 2, 2, 3, 3, 4]))
        tsrc = ' '.join(tags)
        gm = r.choice([150, 250, 500, 800, 1200, 2350])
        wsrc = r.choice([f'{gm}g', f'{gm/1000:g}kg', f'{gm} g', f'{gm/1000:g} kg'])
        desc = '<p>' + ', '.join(r.choice(['Soft and breathable', '30-day returns', 'Colour may vary, "as is"', 'Made in Hangzhou']) for _ in range(r.randint(3, 10))) + '</p>'
        img = f'https://img.example.com/p/{sku.lower()}.jpg'
        src.append([sku, title, cat, br, f'${p:,.2f}', '' if cp is None else f'{cp:.2f}', str(stock), bc, st, tsrc, wsrc, desc, img])
        tru.append([sku.lower(), title, desc, br, cat, ', '.join(tags), 'TRUE' if on else 'FALSE', sku, str(gm), str(stock), f'{p:.2f}', '' if cp is None else f'{cp:.2f}', bc, img, 'active' if on else 'draft'])
    return H, src, T, tru


def main():
    H, S, T, R, pre = crm(300, 1)
    w('crm_src.csv', H, S, pre=pre); w('truth_crm.csv', T, R)
    H, S, T, R, pre = crm(300, 1)
    w('crm_src_gbk.csv', H, S, enc='gbk', pre=pre)
    H, S, T, R = shop_cn(120, 2)
    w('shop_cn_src.csv', H, S); w('truth_shop_cn2shopify.csv', T, R)
    H, S, T, R = shopify(60, 3)
    w('shopify_src.csv', H, S); w('truth_shopify2shop_cn.csv', T, R)
    H, S, T, R, pre = coa(4)
    w('coa_src_gbk.csv', H, S, enc='gbk', pre=pre); w('truth_coa.csv', T, R)
    # 0.2.1 加：Shopify 导出把行顺序打乱（同一商品的变体行、图片行不再挨着）
    H, S, T, R = shopify(60, 3)
    S = S[:]; random.Random(5).shuffle(S)
    w('shopify_shuf_src.csv', H, S)
    H, S, T, R = shop_en(120, 6)
    w('shop_en_src.csv', H, S); w('truth_shop_en2shopify.csv', T, R)
    H, S, T, R = shop_en(120, 7, single=True)
    w('shop_en1_src.csv', H, S); w('truth_shop_en12shopify.csv', T, R)
    if BIG:
        H, S, T, R, pre = crm(100_000, 9, title=False, empty_rows=False)
        w('crm_100k.csv', H, S); w('truth_crm_100k.csv', T, R)
    for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(os.path.join(OUT, f)))


if __name__ == '__main__':
    main()
