// 示例数据：全是随机拼的假数据，不对应任何真人、真公司。
(function(){
  let seed = 20261102;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const A = ['青禾','远山','白鹭','银杏','北辰','南风','松石','云杉','星野','鹿鸣','清溪','长桥','微光','木棉','橙子','蓝鲸','雪松','听雨','半夏','知秋'];
  const B = ['科技','贸易','物流','文创','餐饮','建材','咨询','医疗器械','教育','供应链','电子','食品','设计','环保'];
  const fam = ['张','王','李','陈','林','黄','周','吴','郑','孙','赵','何','高','罗'];
  const giv = ['小一','小二','小三','小四','小五','小六','小七','小八','小九','十一','十二','十三'];
  const city = ['上海','深圳','杭州','成都','新加坡','广州','苏州','北京','武汉','厦门','南京','西安'];
  const stage = ['初次接触','已报价','谈判中','已成交','搁置'];
  const role = ['采购经理','运营总监','创始人','市场负责人','财务主管','IT 主管','行政经理'];
  const tags = ['展会','官网询价','老客户介绍','电话拓展','线上活动','合作伙伴'];
  const goods = ['保温杯','机械键盘','蓝牙耳机','办公椅','台灯','双肩包','收纳盒','咖啡豆','笔记本','护手霜','跑步鞋','数据线'];
  const adj = ['轻量','加厚','静音','大容量','便携','经典款','升级版','极简','商务','复古'];
  const shops = ['示例旗舰店','示例优选','示例小铺','示例工厂店','示例自营'];
  const company = () => pick(A) + pick(B) + '（示例）';
  const person = () => pick(fam) + pick(giv);
  const phone = () => '138-0000-' + String(Math.floor(rnd() * 9000) + 1000);
  const mail = (i) => 'contact' + i + '@example.com';
  const date = () => '2026-' + String(1 + Math.floor(rnd() * 10)).padStart(2, '0') + '-' + String(1 + Math.floor(rnd() * 28)).padStart(2, '0');
  const avatar = (t, h) => 'avatar.svg?h=' + h;
  const product = (t, h) => 'goods.svg?h=' + h;

  const customers = []; for (let i = 1; i <= 100; i++) customers.push({ id: 'C' + String(i).padStart(4, '0'), company: company(), contact: person(), phone: phone(), email: mail(i), city: pick(city), stage: pick(stage), since: date() });
  const leads = []; for (let i = 1; i <= 48; i++) { const p = person(); leads.push({ name: p, role: pick(role), company: company(), phone: phone(), email: 'lead' + i + '@example.com', city: pick(city), tag: pick(tags), score: 40 + Math.floor(rnd() * 60), avatar: avatar(p[0], Math.floor(rnd() * 360)) }); }
  const items = []; for (let i = 1; i <= 120; i++) { const g = pick(goods); items.push({ sku: 'SKU-' + (10000 + i), title: pick(adj) + g + ' ' + (i % 7 + 1) + ' 代', price: (Math.floor(rnd() * 900) + 19) + '.' + pick(['00','90','99']), sold: Math.floor(rnd() * 20000), shop: pick(shops), rating: (3.5 + rnd() * 1.5).toFixed(1), img: product(g, Math.floor(rnd() * 360)) }); }
  window.DEMO = { customers, leads, items };
})();
