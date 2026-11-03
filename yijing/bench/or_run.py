#!/usr/bin/env python3
"""跑 OpenRefine 3.8.7（替补对手）。先起 OpenRefine：./refine -i 127.0.0.1 -p 3333 -m 3G
python3 or_run.py [case...]
走它的 HTTP 接口做「专家路线」：每一步都是界面上真有的操作（导入选项、改列名、GREL 转换、向下填充、删行、重排列、导出），
动手次数按下面 COST 表数（界面上要点的次数 + 打字框次数），见 比武报告.md。"""
import json, os, sys, time, requests

BASE = 'http://127.0.0.1:3333'
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
OUT = os.path.join(D, 'out')
ENG = {'facets': [], 'mode': 'row-based'}
# 界面动手次数：点击 + 输入框
COST = {
    'import': 4,        # Choose files、选文件、Next、Create project
    'ignore': 2,        # 勾「忽略开头 N 行」+ 填数字
    'noblank': 1,       # 取消「保存空行」
    'enc': 2,           # 点编码框 + 选 GBK
    'trim': 1,          # 勾「去掉首尾空白」
    'rename': 5,        # 列菜单、编辑列、重命名此列、打新名字、确定
    'transform': 5,     # 列菜单、编辑单元格、转换…、写 GREL、确定
    'add': 6,           # 列菜单、编辑列、基于此列添加列、打列名、写 GREL、确定
    'filldown': 3,      # 列菜单、编辑单元格、向下填充
    'rmrows': 7,        # 列菜单、分面、自定义文本分面 isBlank、点 true、全部菜单、编辑行、删除匹配行
    'reorder_base': 4,  # 全部菜单、编辑列、重排/删除列、确定（每个目标列另 +1 拖动）
    'export': 2,        # 导出、CSV
}


def tok(): return requests.get(BASE + '/command/core/get-csrf-token').json()['token']


def rename(a, b): return ({'op': 'core/column-rename', 'oldColumnName': a, 'newColumnName': b}, 'rename')
def tf(col, expr): return ({'op': 'core/text-transform', 'engineConfig': ENG, 'columnName': col, 'expression': 'grel:' + expr, 'onError': 'keep-original', 'repeat': False, 'repeatCount': 10}, 'transform')
def add(base, name, expr, at=0): return ({'op': 'core/column-addition', 'engineConfig': ENG, 'baseColumnName': base, 'expression': 'grel:' + expr, 'onError': 'set-to-blank', 'newColumnName': name, 'columnInsertIndex': at}, 'add')
def filldown(col): return ({'op': 'core/fill-down', 'engineConfig': ENG, 'columnName': col}, 'filldown')
def reorder(cols): return ({'op': 'core/column-reorder', 'columnNames': cols}, ('reorder', len(cols)))
def rmblank(col):
    eng = {'mode': 'row-based', 'facets': [{'type': 'list', 'name': col, 'columnName': col, 'expression': 'isBlank(value)', 'omitBlank': False, 'omitError': False,
            'selection': [{'v': {'v': True, 'l': 'true'}}], 'selectBlank': False, 'selectError': False, 'invert': False}]}
    return ({'op': 'core/row-removal', 'engineConfig': eng}, 'rmrows')


CJKNAME = 'with(value.trim(), v, if(v.find(/[a-zA-Z]/).length() > 0, {EN}, with(v.replace(" ", ""), t, if(or(t.startsWith("欧阳"), t.startsWith("司马"), t.startsWith("上官"), t.startsWith("诸葛")), {C2}, {C1}))))'
FIRST = CJKNAME.replace('{EN}', 'v.split(" ")[0]').replace('{C2}', 't.substring(2)').replace('{C1}', 't.substring(1)')
LAST = CJKNAME.replace('{EN}', 'v.split(" ")[-1]').replace('{C2}', 't.substring(0, 2)').replace('{C1}', 't.substring(0, 1)')
PHONE = ('with(value.replace(/[^0-9+]/, ""), d, if(d == "", "", if(d.startsWith("+"), d, if(cells["国家"].value == "新加坡", '
         'if(and(d.startsWith("65"), d.length() == 10), "+" + d, "+65" + d), if(and(d.startsWith("86"), d.length() == 13), "+" + d, "+86" + d)))))')
GENDER = 'with(value.trim().toLowercase(), g, if(inArray(["男", "m", "male", "先生"], g), "M", if(inArray(["女", "f", "female", "女士"], g), "F", "")))'
DATE = ('with(value.trim(), v, if(isNotNull(v.match(/\\d{2}\\/\\d{2}\\/\\d{4}/)), v.toDate("dd/MM/yyyy"), v.toDate("yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd", "yyyy/M/d H:mm", "yyyy/M/d", "yyyy年M月d日", "d MMM yyyy", "MMM d, yyyy", '
        '"yyyyMMdd", "yyyy.MM.dd"))).toString("yyyy-MM-dd")')
MONEY = 'value.replace(/[^0-9.\\-]/, "")'
CRM_T = ['Customer ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Gender', 'Company', 'Job Title', 'City', 'Country', 'Created Date', 'Lifetime Value', 'Notes']
CRM_OPS = [
    add('Name 姓名', 'First Name', FIRST), add('Name 姓名', 'Last Name', LAST),
    tf('E-mail', 'value.trim().toLowercase()'), tf('Mobile 手机', PHONE), tf('性别/Sex', GENDER), tf('注册日期', DATE), tf('Total Spent', MONEY),
    rename('客户ID', 'Customer ID'), rename('E-mail', 'Email'), rename('Mobile 手机', 'Phone'), rename('性别/Sex', 'Gender'), rename('公司名称', 'Company'),
    rename('职务', 'Job Title'), rename('国家', 'Country'), rename('注册日期', 'Created Date'), rename('Total Spent', 'Lifetime Value'), rename('备注 Notes', 'Notes'),
    rmblank('Customer ID'), reorder(CRM_T)]

SHOP_T = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Variant SKU', 'Variant Grams', 'Variant Inventory Qty', 'Variant Price',
          'Variant Compare At Price', 'Variant Barcode', 'Image Src', 'Status']
SHOP_OPS = [
    add('商家编码', 'Handle', 'value.toLowercase()'), add('状态', 'Published', 'if(inArray(["出售中", "在售", "上架"], value), "TRUE", "FALSE")'),
    tf('状态', 'if(inArray(["出售中", "在售", "上架"], value), "active", "draft")'),
    tf('标签', 'value.split(/[|，; ]/).join(", ")'),
    tf('重量', 'with(value.toLowercase().replace(" ", ""), w, if(or(w.endsWith("kg"), w.endsWith("千克")), (w.replace(/[^0-9.]/, "").toNumber() * 1000).round().toString(), w.replace(/[^0-9.]/, "")))'),
    tf('一口价', MONEY), tf('市场价', MONEY), tf('库存', 'value.replace(/[^0-9]/, "")'),
    rename('宝贝标题', 'Title'), rename('宝贝描述', 'Body (HTML)'), rename('品牌', 'Vendor'), rename('类目', 'Type'), rename('标签', 'Tags'), rename('商家编码', 'Variant SKU'),
    rename('重量', 'Variant Grams'), rename('库存', 'Variant Inventory Qty'), rename('一口价', 'Variant Price'), rename('市场价', 'Variant Compare At Price'),
    rename('条形码', 'Variant Barcode'), rename('主图', 'Image Src'), rename('状态', 'Status'), reorder(SHOP_T)]

SPF_T = ['商品编码', '商品名称', '分类', '品牌', '售价', '划线价', '库存', '条码', '上架状态', '商品描述', '主图链接']
SPF_OPS = [
    rmblank('Variant SKU'),  # 先删纯图片行（删之前得先向下填充 Handle 之外的列，所以顺序：填充→删）
]
SPF_OPS = [filldown('Title'), filldown('Body (HTML)'), filldown('Vendor'), filldown('Type'), filldown('Status'), filldown('Image Src'), rmblank('Variant SKU'),
           tf('Status', 'if(value.trim() == "active", "上架", "下架")'),
           rename('Variant SKU', '商品编码'), rename('Title', '商品名称'), rename('Type', '分类'), rename('Vendor', '品牌'), rename('Variant Price', '售价'),
           rename('Variant Compare At Price', '划线价'), rename('Variant Inventory Qty', '库存'), rename('Variant Barcode', '条码'), rename('Status', '上架状态'),
           rename('Body (HTML)', '商品描述'), rename('Image Src', '主图链接'), reorder(SPF_T)]

COA_T = ['Code', 'Name', 'Type', 'Description', 'Opening Balance']
COA_OPS = [
    tf('科目名称', 'value.trim()'),
    tf('类别', 'if(value == "资产", "Asset", if(value == "负债", "Liability", if(value == "所有者权益", "Equity", if(value == "成本", "Expense", '
              'if(or(cells["科目代码"].value.startsWith("60"), cells["科目代码"].value == "6111", cells["科目代码"].value == "6301"), "Revenue", "Expense")))))'),
    tf('期初余额', 'with(value.trim(), v, if(v == "", "", if(v.startsWith("("), "-" + v.replace(/[^0-9.]/, ""), v.replace(/[^0-9.\\-]/, ""))))'),
    rename('科目代码', 'Code'), rename('科目名称', 'Name'), rename('类别', 'Type'), rename('科目全名', 'Description'), rename('期初余额', 'Opening Balance'), reorder(COA_T)]

CASES = {
    'crm': ('crm_src.csv', {'ignoreLines': 2, 'trimStrings': True}, ['import', 'ignore', 'noblank', 'trim'], CRM_OPS),
    'crm_gbk': ('crm_src_gbk.csv', {'ignoreLines': 2, 'encoding': 'GBK', 'trimStrings': True}, ['import', 'ignore', 'noblank', 'enc', 'trim'], CRM_OPS),
    'shop_cn2shopify': ('shop_cn_src.csv', {}, ['import'], SHOP_OPS),
    'shopify2shop_cn': ('shopify_src.csv', {'trimStrings': True}, ['import', 'trim'], SPF_OPS),
    'coa': ('coa_src_gbk.csv', {'ignoreLines': 2, 'encoding': 'GBK'}, ['import', 'ignore', 'enc'], COA_OPS),
    'crm_100k': ('crm_100k.csv', {}, ['import', 'noblank'], CRM_OPS),
}


def cost(tag):
    if isinstance(tag, tuple): return COST['reorder_base'] + tag[1]
    return COST[tag]


def run(name, f, opt, imp, ops):
    t = tok()
    o = {'encoding': '', 'separator': ',', 'ignoreLines': -1, 'headerLines': 1, 'skipDataLines': 0, 'limit': -1, 'storeBlankRows': False, 'guessCellValueTypes': False,
         'processQuotes': True, 'quoteCharacter': '"', 'storeBlankCellsAsNulls': True, 'includeFileSources': False, 'trimStrings': False}
    o.update(opt)
    T0 = time.time()
    with open(os.path.join(D, f), 'rb') as fh:
        r = requests.post(f'{BASE}/command/core/create-project-from-upload?csrf_token={t}',
                          files={'project-file': (f, fh)}, data={'project-name': 'bench-' + name, 'format': 'text/line-based/*sv', 'options': json.dumps(o)}, allow_redirects=False)
    pid = r.headers['Location'].split('project=')[1]
    T1 = time.time()
    r = requests.post(f'{BASE}/command/core/apply-operations?project={pid}&csrf_token={tok()}', data={'operations': json.dumps([x[0] for x in ops])})
    assert r.json().get('code') in ('ok', 'pending'), r.text[:300]
    while requests.get(f'{BASE}/command/core/get-processes?project={pid}').json().get('processes'): time.sleep(.2)
    T2 = time.time()
    r = requests.post(f'{BASE}/command/core/export-rows', data={'project': pid, 'format': 'csv', 'engine': json.dumps(ENG), 'csrf_token': tok()})
    out = os.path.join(OUT, f'or_{name}.csv'); open(out, 'wb').write(r.content)
    T3 = time.time()
    clicks = sum(COST[k] for k in imp) + sum(cost(x[1]) for x in ops) + COST['export']
    grel = sum(1 for x in ops if x[1] in ('transform', 'add'))
    return {'clicks': clicks, 'grel': grel, 'importMs': round((T1 - T0) * 1000), 'opsMs': round((T2 - T1) * 1000), 'exportMs': round((T3 - T2) * 1000), 'totalMs': round((T3 - T0) * 1000), 'file': out}


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:]
    res = {}
    for k, (f, opt, imp, ops) in CASES.items():
        if only and k not in only: continue
        res[k] = run(k, f, opt, imp, ops); print(k, res[k], flush=True)
    json.dump(res, open(os.path.join(OUT, 'or.json'), 'w'), indent=1)
