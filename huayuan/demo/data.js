// 示例站（一个假后台，给化缘僧练手，也是测试站）的字和数据。数据全是随机拼的假数据，不对应任何真人、真公司。
// 默认英文；网址带 ?lang=zh|en 就听网址并记下来（跟介绍页同一个键 huayuan.lang），翻页、换页面都照这个。
// 中文那套的字、数据、页面结构跟 0.3.0 一模一样（测试和跑分拿它比）。
(function(){
  const LK = 'huayuan.lang';
  let lang = null;
  try { lang = new URLSearchParams(location.search).get('lang'); } catch (e) {}
  if (lang === 'zh' || lang === 'en') { try { localStorage.setItem(LK, lang); } catch (e) {} }
  else { try { lang = localStorage.getItem(LK); } catch (e) {} if (lang !== 'zh') lang = 'en'; }

  const TEXT = {
    zh: {
      html: 'zh-CN', admin: '示例后台',
      nav: ['客户', '线索', '商品', '报表', '设置'],
      side: ['客户名单', '销售线索', '商品列表', '合同', '回款', '工单', '团队'],
      foot: '示例后台 · 数据全是随机生成的假数据 · 给 <a href="../">化缘僧</a> 练手用',
      tableTitle: '客户名单', tableCols: ['编号', '公司', '联系人', '电话', '邮箱', '城市', '跟进阶段', '建档日期', '操作'], edit: '编辑', prev: '上一页', next: '下一页',
      cardsTitle: '销售线索', cardPrev: '‹ 上一页', cardNext: '下一页 ›', phoneL: '电话：', emailL: '邮箱：', cityL: '城市：', score: '意向分 {s}',
      scrollTitle: '商品列表', more: '往下滚，加载更多', loading: '加载中…', end: '到底了', price: '¥{p}', sold: '已售 {n}', rating: '{r} 分', item: '{adj}{g} {n} 代',
      idxTitle: '化缘僧示例页', idxLead: '打开任意一页，点浏览器右上角的化缘僧。数据全是随机拼的假数据。',
      idx: [['客户名单', '表格 · 5 页，点「下一页」整页跳转 · 100 行'], ['销售线索', '卡片 · 4 页，不刷新换页 · 48 条'], ['商品列表', '无限滚动 · 往下滚自动加载 · 120 件']],
      back: '← 回化缘僧',
    },
    en: {
      html: 'en', admin: 'Sample Admin',
      nav: ['Clients', 'Leads', 'Products', 'Reports', 'Settings'],
      side: ['Client list', 'Sales leads', 'Products', 'Contracts', 'Payments', 'Tickets', 'Team'],
      foot: 'Sample Admin · all data is randomly made up · a practice ground for <a href="../">Huayuan</a>',
      tableTitle: 'Client list', tableCols: ['ID', 'Company', 'Contact', 'Phone', 'Email', 'City', 'Stage', 'Created', 'Actions'], edit: 'Edit', prev: 'Previous', next: 'Next',
      cardsTitle: 'Sales leads', cardPrev: '‹ Prev', cardNext: 'Next ›', phoneL: 'Phone: ', emailL: 'Email: ', cityL: 'City: ', score: 'Score: {s}',
      scrollTitle: 'Products', more: 'Scroll for more', loading: 'Loading…', end: 'No more items', price: '${p}', sold: '{n} sold', rating: '★ {r}', item: '{adj} {g}, Gen {n}',
      idxTitle: 'Huayuan sample pages', idxLead: 'Open any page, then click Huayuan in the browser toolbar. Everything here is made up.',
      idx: [['Client list', 'Table · 5 pages, “Next” reloads the page · 100 rows'], ['Sales leads', 'Cards · 4 pages, no reload · 48 leads'], ['Products', 'Infinite scroll · loads as you scroll · 120 items']],
      back: '← Back to Huayuan',
    },
  };
  const POOL = {
    zh: {
      A: ['青禾','远山','白鹭','银杏','北辰','南风','松石','云杉','星野','鹿鸣','清溪','长桥','微光','木棉','橙子','蓝鲸','雪松','听雨','半夏','知秋'],
      B: ['科技','贸易','物流','文创','餐饮','建材','咨询','医疗器械','教育','供应链','电子','食品','设计','环保'],
      fam: ['张','王','李','陈','林','黄','周','吴','郑','孙','赵','何','高','罗'],
      giv: ['小一','小二','小三','小四','小五','小六','小七','小八','小九','十一','十二','十三'],
      city: ['上海','深圳','杭州','成都','新加坡','广州','苏州','北京','武汉','厦门','南京','西安'],
      stage: ['初次接触','已报价','谈判中','已成交','搁置'],
      role: ['采购经理','运营总监','创始人','市场负责人','财务主管','IT 主管','行政经理'],
      tags: ['展会','官网询价','老客户介绍','电话拓展','线上活动','合作伙伴'],
      goods: ['保温杯','机械键盘','蓝牙耳机','办公椅','台灯','双肩包','收纳盒','咖啡豆','笔记本','护手霜','跑步鞋','数据线'],
      adj: ['轻量','加厚','静音','大容量','便携','经典款','升级版','极简','商务','复古'],
      shops: ['示例旗舰店','示例优选','示例小铺','示例工厂店','示例自营'],
      company: (a, b) => a + b + '（示例）', person: (f, g) => f + g, phone: (r) => '138-0000-' + String(Math.floor(r * 9000) + 1000),
    },
    en: {
      A: ['Bluegrass','Copperleaf','Harbor','Pinecrest','Saltmarsh','Juniper','Stonebridge','Silverline','Redwood','Larkspur','Fernhill','Driftwood','Oakmont','Brightwater','Maple','Kestrel','Tidewater','Cobalt','Meadow','Ember'],
      B: ['Tech','Trading','Logistics','Studio','Foods','Supply','Consulting','Medical','Learning','Electronics','Design','Labs','Partners','Outfitters'],
      fam: ['Ava','Leo','Mia','Noah','Zoe','Ethan','Ruby','Owen','Ivy','Liam','Nora','Eli','Maya','Sam'],
      giv: ['Chen','Park','Wong','Tan','Lim','Ng','Lee','Goh','Patel','Kim','Silva','Reyes'],
      city: ['Singapore','Austin','London','Sydney','Toronto','Berlin','Seattle','Dublin','Denver','Boston','Melbourne','Auckland'],
      stage: ['First contact','Quoted','Negotiating','Won','On hold'],
      role: ['Purchasing Manager','Head of Ops','Founder','Marketing Lead','Finance Lead','IT Lead','Office Manager'],
      tags: ['Trade show','Website inquiry','Referral','Cold call','Webinar','Partner'],
      goods: ['Travel Mug','Mechanical Keyboard','Wireless Earbuds','Office Chair','Desk Lamp','Backpack','Storage Box','Coffee Beans','Notebook','Hand Cream','Running Shoes','USB-C Cable'],
      adj: ['Lightweight','Heavy-duty','Quiet','XL','Portable','Classic','Pro','Minimal','Business','Retro'],
      shops: ['Sample Flagship','Sample Picks','Sample Corner','Sample Outlet','Sample Direct'],
      company: (a, b) => a + ' ' + b + ' (sample)', person: (f, g) => f + ' ' + g, phone: (r) => '+1 555-01' + String(Math.floor(r * 90) + 10),
    },
  };
  const T = TEXT[lang], P = POOL[lang];
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);

  let seed = 20261102;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const company = () => P.company(pick(P.A), pick(P.B));
  const person = () => P.person(pick(P.fam), pick(P.giv));
  const phone = () => P.phone(rnd());
  const mail = (i) => 'contact' + i + '@example.com';
  const date = () => '2026-' + String(1 + Math.floor(rnd() * 10)).padStart(2, '0') + '-' + String(1 + Math.floor(rnd() * 28)).padStart(2, '0');
  const avatar = (t, h) => 'avatar.svg?h=' + h;
  const product = (t, h) => 'goods.svg?h=' + h;

  const customers = []; for (let i = 1; i <= 100; i++) customers.push({ id: 'C' + String(i).padStart(4, '0'), company: company(), contact: person(), phone: phone(), email: mail(i), city: pick(P.city), stage: pick(P.stage), since: date() });
  const leads = []; for (let i = 1; i <= 48; i++) { const p = person(); leads.push({ name: p, role: pick(P.role), company: company(), phone: phone(), email: 'lead' + i + '@example.com', city: pick(P.city), tag: pick(P.tags), score: 40 + Math.floor(rnd() * 60), avatar: avatar(p[0], Math.floor(rnd() * 360)) }); }
  const items = []; for (let i = 1; i <= 120; i++) { const g = pick(P.goods); items.push({ sku: 'SKU-' + (10000 + i), title: fill(T.item, { adj: pick(P.adj), g, n: i % 7 + 1 }), price: (Math.floor(rnd() * 900) + 19) + '.' + pick(['00','90','99']), sold: Math.floor(rnd() * 20000), shop: pick(P.shops), rating: (3.5 + rnd() * 1.5).toFixed(1), img: product(g, Math.floor(rnd() * 360)) }); }

  // 页面骨架：顶栏（右上角 EN / 中文）、左栏、页脚。on = 当前是第几个（0 客户 1 线索 2 商品）
  const HREF = ['table.html', 'cards.html', 'scroll.html', 'index.html', 'index.html'];
  const SIDE_HREF = ['table.html', 'cards.html', 'scroll.html', 'index.html', 'index.html', 'index.html', 'index.html'];
  const langSwitch = '<span class="lang"><a href="?lang=en"' + (lang === 'en' ? ' class=on' : '') + '>EN</a> / <a href="?lang=zh"' + (lang === 'zh' ? ' class=on' : '') + '>中文</a></span>';
  function frame(on, title) {
    document.documentElement.lang = T.html;
    document.title = title + ' · ' + T.admin;
    const top = '<header class="topnav"><b>' + T.admin + '</b>' + T.nav.map((t, i) => '<a href="' + HREF[i] + '"' + (i === on ? ' class=on' : '') + '>' + t + '</a>').join('') + langSwitch + '</header>';
    const side = '<aside class="side"><ul>' + T.side.map((t, i) => '<li><a href="' + SIDE_HREF[i] + '"' + (i === on ? ' class=on' : '') + '>' + t + '</a></li>').join('') + '</ul></aside>';
    return { top, side, foot: '<footer class="foot">' + T.foot + '</footer>' };
  }
  window.DEMO = { lang, T, fill, frame, langSwitch, customers, leads, items };
})();
