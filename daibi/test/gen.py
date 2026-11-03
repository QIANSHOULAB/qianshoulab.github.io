# 生成测试用的 20 行表：一份 xlsx（真日期单元格），一份 GBK 编码 CSV（日期写成各种格式）
import openpyxl, datetime, csv, os, json
os.makedirs('data', exist_ok=True)
H = ['客户名','手机','邮箱','公司','产品','数量','配送方式','开发票','渠道','交付日期','备注','性别','城市','生日']
prods = ['标准版','专业版','旗舰版']; ships = ['快递','自提','同城']; chans = ['官网','微信','展会、朋友介绍','官网，微信','']
cities = ['北京','上海','广州','深圳','杭州','成都','新加坡','南京','武汉','西安']
rows = []
for i in range(1, 21):
    rows.append([f'样例客户{i:02d}', f'1380000{i:04d}', f'user{i:02d}@example.com', f'示例科技{i:02d}有限公司',
        prods[i % 3], i % 5 + 1, ships[i % 3], '是' if i % 2 else '否', chans[i % 5],
        datetime.date(2026, 11, i), f'第{i}单，备注写长一点，含逗号,和"引号"' if i % 4 == 0 else '',
        '男' if i % 2 else '女', cities[i % 10], datetime.date(1990 + i % 10, (i % 12) + 1, (i % 27) + 1)])
wb = openpyxl.Workbook(); ws = wb.active; ws.title = '订单'
ws.append(H)
for r in rows: ws.append(r)
for row in ws.iter_rows(min_row=2):
    row[9].number_format = 'yyyy/m/d'; row[13].number_format = 'yyyy"年"m"月"d"日"'
ws2 = wb.create_sheet('说明'); ws2.append(['这页不是数据'])
wb.save('data/订单20行.xlsx')
fmt = [lambda d: f'{d.year}/{d.month}/{d.day}', lambda d: f'{d.year}年{d.month}月{d.day}日', lambda d: d.isoformat()]
with open('data/订单20行-GBK.csv', 'w', encoding='gb18030', newline='') as f:
    w = csv.writer(f); w.writerow(H)
    for i, r in enumerate(rows):
        r = list(r); r[9] = fmt[i % 3](r[9]); r[13] = r[13].isoformat(); w.writerow(r)
# 期望值（给测试脚本核对）
json.dump([[str(x) if not isinstance(x, datetime.date) else x.isoformat() for x in r] for r in rows], open('data/expected.json', 'w'), ensure_ascii=False)
# 带一行坏数据的小表：第 2 行产品写成「企业版」，下拉里没有
with open('data/坏一行.csv', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f); w.writerow(H[:7])
    w.writerow(['坏行测试A','13900000001','a@example.com','示例A','标准版',1,'快递'])
    w.writerow(['坏行测试B','13900000002','b@example.com','示例B','企业版',1,'快递'])
    w.writerow(['坏行测试C','13900000003','c@example.com','示例C','旗舰版',2,'同城'])
print('ok')
