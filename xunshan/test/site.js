// 巡山僧测试网站：价格、库存、公告会变，有脚本渲染页、登录页、验证码页。
// node site.js [port]   AUTO=1 时价格和公告每 20 秒自己变一次。
const http = require('http');
const S = { price: 1299, stock: '缺货', news: ['10/28 双十一预售规则公布', '10/20 会员积分翻倍'], seats: 0, lamp: 459, redesign: 0, hits: {} };
const PRICES = [1299, 1249, 1199, 1099, 999, 899];
if (process.env.AUTO) setInterval(() => {
  S.price = PRICES[(PRICES.indexOf(S.price) + 1) % PRICES.length];
  S.stock = S.stock === '缺货' ? '有货' : '缺货';
}, 20000);

const css = `body{margin:0;font:15px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#fafafa;color:#222}
header{background:#1a1a1a;color:#fff;padding:14px 32px;font-weight:700;letter-spacing:.05em}header small{font-weight:400;opacity:.6;margin-left:12px}
main{max-width:980px;margin:32px auto;display:grid;grid-template-columns:420px 1fr;gap:40px;padding:0 24px}
.pic{height:380px;border-radius:12px;background:linear-gradient(135deg,#e8ecf3,#c9d3e3);display:grid;place-items:center;font-size:90px}
h1{font-size:26px;margin:0 0 10px}.price{font-size:34px;color:#e4393c;font-weight:700}.was{color:#999;text-decoration:line-through;margin-left:10px}
.stock{display:inline-block;margin-top:14px;padding:4px 12px;border-radius:6px;background:#f0f0f0}.stock.ok{background:#e7f6ec;color:#1a7f37}
.rec{margin-top:30px;color:#888;font-size:13px}button.buy{margin-top:20px;padding:12px 40px;border:0;border-radius:8px;background:#e4393c;color:#fff;font-size:16px}
ul.news{max-width:720px;margin:32px auto;background:#fff;border-radius:12px;padding:8px 24px;list-style:none;box-shadow:0 1px 3px rgba(0,0,0,.06)}ul.news li{padding:14px 0;border-bottom:1px solid #eee}`;
const page = (title, body) => `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body><header>山货铺<small>测试商店 · 不卖真东西</small></header>${body}</body></html>`;

function shop() {
  return page('山货铺 · 降噪耳机 Pro', `<main><div class="pic">🎧</div><div>
  <h1>降噪耳机 Pro（第二代）</h1>
  <div id="buy-box"><div class="price-row"><span class="price">¥${S.price.toLocaleString('en-US')}.00</span><span class="was">¥1,499.00</span></div>
  <div class="stock ${S.stock === '有货' ? 'ok' : ''}" id="stock">${S.stock}</div></div>
  <button class="buy">加入购物车</button>
  <p class="rec">已有 ${Math.floor(Math.random() * 900 + 100)} 人在看 · 刷新时间 ${new Date().toLocaleTimeString()}</p></div></main>`);
}
function spa() {
  return page('山货铺 · 限量款', `<main><div class="pic">⌚</div><div><h1>限量款手表</h1><div id="app">加载中…</div></div></main>
  <script>setTimeout(()=>fetch('/api/stock').then(r=>r.json()).then(d=>{document.getElementById('app').innerHTML='<div class="seats">剩余名额：<b id="seats">'+d.seats+'</b></div>'}),500)</script>`);
}
// 台灯：可以一键「改版」，结构全变、类名还在
function lamp() {
  const p = '¥' + S.lamp + '.00';
  return S.redesign
    ? page('山货铺 · 台灯', `<div class="promo">新版上线</div><main><div class="pic">💡</div><section><div class="info"><h1>护眼台灯</h1><p>限时直降</p><div class="prices"><span class="price">${p}</span></div></div></section></main>`)
    : page('山货铺 · 台灯', `<main><div class="pic">💡</div><div><h1>护眼台灯</h1><div class="price">${p}</div><div class="stock">现货</div></div></main>`);
}
function news() {
  return page('山货铺 · 公告', `<ul class="news">${S.news.map(n => `<li>${n}</li>`).join('')}</ul>`);
}
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  S.hits[u.pathname] = (S.hits[u.pathname] || 0) + 1;
  const send = (code, body, type = 'text/html; charset=utf-8', h = {}) => { res.writeHead(code, Object.assign({ 'content-type': type, 'cache-control': 'no-store' }, h)); res.end(body); };
  const cookie = req.headers.cookie || '';
  switch (u.pathname) {
    case '/': case '/shop': return send(200, shop());
    case '/spa': return send(200, spa(), undefined, { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" });
    case '/lamp': return send(200, lamp());
    case '/api/stock': return send(200, JSON.stringify({ seats: S.seats }), 'application/json');
    case '/news': return send(200, news());
    case '/member':
      if (!/sid=ok/.test(cookie)) return send(302, '', 'text/plain', { location: '/login' });
      return send(200, page('会员中心', `<main><div></div><div><h1>会员专享价</h1><div class="price" id="vip">¥${(S.price * 0.9).toFixed(0)}</div></div></main>`));
    case '/login':
      if (u.searchParams.get('go')) return send(302, '', 'text/plain', { location: '/member', 'set-cookie': 'sid=ok; Path=/; SameSite=Lax' });
      return send(200, page('登录', `<main><div></div><div><h1>请登录</h1><a id="go" href="/login?go=1">一键登录</a></div></main>`));
    case '/captcha': return send(200, page('验证', `<main><div></div><div><h1>请完成人机验证</h1><div class="g-recaptcha">captcha</div></div></main>`));
    case '/_set':
      for (const [k, v] of u.searchParams) {
        if (k === 'price') S.price = +v;
        if (k === 'stock') S.stock = v;
        if (k === 'seats') S.seats = +v;
        if (k === 'news') S.news.unshift(v);
        if (k === 'lamp') S.lamp = +v;
        if (k === 'redesign') S.redesign = +v;
      }
      return send(200, JSON.stringify(S), 'application/json');
    case '/_hits': return send(200, JSON.stringify(S.hits), 'application/json');
    default: return send(404, page('404', '<p>没有</p>'));
  }
}).listen(+process.argv[2] || 8787, () => console.log('site up', +process.argv[2] || 8787));
