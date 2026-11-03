// 巡山僧比武测试网站。node site.js [port]
// /_step?k=N 切到剧本第 N 步；/_fast?i=&v= 改测速页的价格；/hook/<名字> 收对手的通知（记时间）。
const http = require('http');
const { S, NEWS } = require('./scenario');
let K = 0;
let SLOW = 0; // /slow 这一页故意慢（截「看第一眼…」那一刻用）：/_slow?ms=
// /_lang?l=en 把这家店换成英文店（只给英文版截图用：商品名、货币、库存字样换成英文网站的样子；比武剧本不用）
let EN = false;
const EN_WORDS = [
  ['山货铺是比武用的假网站，所有商品和数字都是编的。', 'Hill Store is a fake shop for testing. Every product and number is made up.'],
  ['测试商店 · 不卖真东西', 'Test shop · nothing is for sale'],
  ['山货铺', 'Hill Store'], ['降噪耳机 Pro', 'Noise-Cancelling Headphones Pro'], ['降噪耳机', 'Headphones'],
  ['加入购物车', 'Add to cart'], ['轻量登山包 28L', 'Ultralight Daypack 28L'], ['登山包', 'Daypack'],
  ['限量款手表', 'Limited Edition Watch'], ['限量款', 'Limited Edition'], ['剩余名额：', 'Spots left: '], ['加载中…', 'Loading…'],
  ['店铺公告', 'Store News'], ['公告', 'News'], ['人在看', 'viewing now'], ['现在 ', 'Now '],
  ['10/20 会员积分翻倍', '10/20 Double points for members'], ['10/28 双十一预售规则公布', '10/28 Singles’ Day pre-sale rules are out'],
  ['11/01 新增顺丰包邮', '11/01 Free express shipping'], ['11/02 退换货政策更新', '11/02 Returns policy updated'],
  ['护眼台灯（新版）', 'Desk Lamp (new page)'], ['护眼台灯', 'Eye-Care Desk Lamp'], ['台灯', 'Desk Lamp'],
  ['新版商品页上线 · 双 11 满 300 减 40', 'New product pages are live · $40 off $300'], ['限时直降', 'Limited-time price cut'],
  ['请完成安全验证', 'Please verify you are human'], ['访问太频繁，请拖动滑块完成验证。', 'Too many requests. Drag the slider to continue.'], ['安全验证', 'Security check'],
  ['电热水壶 1.7L', 'Electric Kettle 1.7L'], ['电热水壶', 'Electric Kettle'], ['收纳小物', 'Storage Box No.'], ['小物', 'Box'], [' 号', ''],
  ['机械键盘 87 键', 'Mechanical Keyboard TKL'], ['机械键盘', 'Mechanical Keyboard'],
  ['我的订单', 'My Orders'], ['订单 A-0001 · 保温杯', 'Order A-0001 · Travel Mug'], ['待发货', 'Preparing'], ['已发货', 'Shipped'], ['派送中', 'Out for delivery'],
  ['一键登录（测试）', 'Sign in (test)'], ['请登录', 'Please sign in'], ['登录', 'Sign in'],
  ['仅剩 3 件', 'Only 3 left'], ['缺货', 'Out of stock'], ['有货', 'In stock'], ['现货', 'In stock'],
  ['lang="zh"', 'lang="en"'], ['¥', '$']
];
const enOf = html => EN_WORDS.reduce((h, [a, b]) => h.split(a).join(b), html);
const FAST = { 0: 300, 1: 300, 2: 300, 3: 300, 4: 300, 5: 300, 6: 300, 7: 300, 8: 300 };
const hooks = [];   // 对手发来的通知 [{t, name, body}]
const changes = []; // 测速页每次改价的时间

const css = `body{margin:0;font:15px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#fafafa;color:#222}
header{background:#1a1a1a;color:#fff;padding:14px 32px;font-weight:700}header small{font-weight:400;opacity:.6;margin-left:12px}
main{max-width:980px;margin:32px auto;display:grid;grid-template-columns:360px 1fr;gap:40px;padding:0 24px}
.pic{height:300px;border-radius:12px;background:linear-gradient(135deg,#e8ecf3,#c9d3e3);display:grid;place-items:center;font-size:80px}
h1{font-size:24px;margin:0 0 10px}.price,.amount{font-size:32px;color:#e4393c;font-weight:700}
.tag{display:inline-block;margin-top:12px;padding:4px 12px;border-radius:6px;background:#f0f0f0}
.ad{background:#fff3cd;padding:10px 16px;border-radius:8px;margin:0 0 16px}.promo{background:#e7f1ff;padding:8px 14px;border-radius:8px;margin-bottom:12px}
.meta{color:#888;font-size:13px;margin-top:24px}ul.news{list-style:none;padding:0}ul.news li{padding:10px 0;border-bottom:1px solid #eee}
footer{max-width:980px;margin:40px auto;padding:0 24px;color:#aaa;font-size:12px}`;
const page0 = (title, body, extra = '') => `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title><style>${css}</style>${extra}</head><body><header>山货铺<small>测试商店 · 不卖真东西</small></header>${body}<footer>山货铺是比武用的假网站，所有商品和数字都是编的。</footer></body></html>`;
const page = (...a) => EN ? enOf(page0(...a)) : page0(...a);
const yuan = v => '¥' + Number(v).toLocaleString('en-US') + '.00';
const nowStr = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
const viewers = () => Math.floor(Math.random() * 900 + 100);

const R = {
  '/price': () => page('山货铺 · 降噪耳机', `<main><div class="pic">🎧</div><div><h1>降噪耳机 Pro</h1><div class="price-row"><span class="price">${yuan(S.price[K])}</span></div><button>加入购物车</button></div></main>`),
  '/stock': () => page('山货铺 · 登山包', `<main><div class="pic">🎒</div><div><h1>轻量登山包 28L</h1><div class="price">${yuan(399)}</div><div class="tag" id="stock">${S.stock[K]}</div></div></main>`),
  '/spa': () => page('山货铺 · 限量款', `<main><div class="pic">⌚</div><div><h1>限量款手表</h1><div id="app">加载中…</div></div></main>
<script>setTimeout(()=>fetch('/api/seats').then(r=>r.json()).then(d=>{document.getElementById('app').innerHTML='<div class="seats">剩余名额：<b>'+d.seats+'</b></div>'}),600)</script>`),
  '/api/seats': () => JSON.stringify({ seats: S.seats[K] }),
  '/live': () => page('山货铺 · 公告', `<main><div class="pic">📢</div><div><h1>店铺公告</h1>
<div class="meta">现在 ${nowStr()} · ${viewers()} 人在看</div><ul class="news">${NEWS.slice(0, S.news[K]).reverse().map(n => `<li>${n}</li>`).join('')}</ul></div></main>`),
  '/deal': () => {
    const ads = ['双 11 主会场 满 300 减 40', '新人专享 首单立减 20', '会员日 全场 9 折'];
    const a = Math.floor(Math.random() * 3);
    return page('山货铺 · 咖啡机', `<main><div class="pic">☕</div><div><div class="ad" id="ad">${ads[a]}</div><h1>半自动咖啡机</h1><div class="price">${yuan(S.deal[K])}</div>
<div class="meta">评论区 · 发表评论前需要验证</div></div></main>
<script src="/static/recaptcha/api.js" async></script>
<script>const ads=${JSON.stringify(ads)};let i=${a};setInterval(()=>{i=(i+1)%3;document.getElementById('ad').textContent=ads[i]},1500)</script>`);
  },
  '/static/recaptcha/api.js': () => '/* 评论区的人机验证脚本（假的） */',
  '/item': () => S.redesign[K]
    ? page('山货铺 · 台灯（新版）', `<div class="promo">新版商品页上线 · 双 11 满 300 减 40</div><main><div class="pic">💡</div><section><div class="info"><div class="promo">限时直降</div><h1>护眼台灯</h1><div class="prices"><span class="price">${yuan(S.item[K])}</span></div></div></section></main>`)
    : page('山货铺 · 台灯', `<main><div class="pic">💡</div><div><h1>护眼台灯</h1><div class="price">${yuan(S.item[K])}</div><div class="tag">现货</div></div></main>`),
  '/guard': () => S.guard[K] === 'CAPTCHA'
    ? page('安全验证', `<main><div></div><div><h1>请完成安全验证</h1><p>访问太频繁，请拖动滑块完成验证。</p><div class="g-recaptcha">captcha</div></div></main>`)
    : page('山货铺 · 电热水壶', `<main><div class="pic">🫖</div><div><h1>电热水壶 1.7L</h1><div class="price">${yuan(S.guard[K])}</div></div></main>`)
};
for (let i = 1; i <= 8; i++) R['/shop/' + i] = () => page('山货铺 · 小物 ' + i, `<main><div class="pic">📦</div><div><h1>收纳小物 ${i} 号</h1><div class="price">${yuan(S.shop[i - 1][K])}</div></div></main>`);
for (let i = 0; i <= 8; i++) R['/fast/' + i] = () => page('山货铺 · 测速 ' + i, `<main><div class="pic">⏱</div><div><h1>测速商品 ${i} 号</h1><div class="price">${yuan(FAST[i])}</div></div></main>`);

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, body, type = 'text/html; charset=utf-8', h = {}) => { res.writeHead(code, Object.assign({ 'content-type': type, 'cache-control': 'no-store' }, h)); res.end(body); };
  const p = u.pathname;
  if (p.startsWith('/hook/')) {
    let b = ''; req.on('data', d => b += d); req.on('end', () => { hooks.push({ t: Date.now(), name: decodeURIComponent(p.slice(6)), body: b.slice(0, 400) }); send(200, 'ok', 'text/plain'); });
    return;
  }
  if (p === '/_step') { K = +u.searchParams.get('k'); return send(200, JSON.stringify({ k: K }), 'application/json'); }
  if (p === '/_fast') { const i = +u.searchParams.get('i'); FAST[i] = +u.searchParams.get('v'); changes.push({ t: Date.now(), i, v: FAST[i] }); return send(200, '{}', 'application/json'); }
  if (p === '/_lang') { EN = u.searchParams.get('l') === 'en'; return send(200, '{}', 'application/json'); }
  if (p === '/_slow') { SLOW = +u.searchParams.get('ms') || 0; return send(200, '{}', 'application/json'); }
  if (p === '/slow') return setTimeout(() => send(200, page('山货铺 · 机械键盘', `<main><div class="pic">⌨️</div><div><h1>机械键盘 87 键</h1><div class="price">${yuan(699)}</div><div class="tag" id="stock">有货</div></div></main>`)), SLOW);
  if (p === '/_hooks') return send(200, JSON.stringify(hooks), 'application/json');
  if (p === '/_changes') return send(200, JSON.stringify(changes), 'application/json');
  if (p === '/orders') {
    if (!/sid=ok/.test(req.headers.cookie || '')) return send(302, '', 'text/plain', { location: '/login?next=/orders' });
    return send(200, page('山货铺 · 我的订单', `<main><div class="pic">🚚</div><div><h1>我的订单</h1><p>订单 A-0001 · 保温杯</p><div class="tag" id="status">${S.order[K]}</div></div></main>`));
  }
  if (p === '/login') {
    if (u.searchParams.get('go')) return send(302, '', 'text/plain', { location: '/orders', 'set-cookie': 'sid=ok; Path=/; Max-Age=86400; SameSite=Lax' });
    return send(200, page('登录', `<main><div></div><div><h1>请登录</h1><a id="go" href="/login?go=1">一键登录（测试）</a></div></main>`));
  }
  // 脚本渲染页另外不许被别人嵌进框里（很多大站都这样），还带一段「跳出框架」脚本
  if (p === '/spa') return send(200, R[p]().replace('<script>', '<script>if(top!==self)try{top.location=location.href}catch(e){}\n'), undefined, { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" });
  if (R[p]) return send(200, R[p](), p.startsWith('/api/') ? 'application/json' : p.endsWith('.js') ? 'text/javascript' : undefined);
  send(404, 'not found', 'text/plain');
}).listen(+process.argv[2] || 8790, () => console.log('bench site on', +process.argv[2] || 8790));
