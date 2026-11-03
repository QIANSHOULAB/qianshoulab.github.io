// 化缘僧比武 · 测试网站生成器。数据全是随机拼的假数据（固定种子，每次生成一样）。
// 用法：node huayuan/bench/gen.js [输出目录，默认 huayuan/bench/site]
// 生成：每个场景一个 html（加 json 数据文件）+ answers/<场景>.json 标准答案（该抓出的行和列）。
const fs = require('fs'), path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'site'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'answers'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'api'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
const ORIGIN = 'http://127.0.0.1:8790';

// ---------- 假数据 ----------
let seed = 20261103;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pad = (n, w) => String(n).padStart(w, '0');
const CO1 = ['青禾', '远山', '白鹭', '银杏', '北辰', '南风', '松石', '云杉', '青柠', '海盐', '赤松', '鹿角'];
const CO2 = ['科技', '贸易', '物流', '文创', '餐饮', '建材', '咨询', '医疗器械', 'Studio', 'Labs', 'Trading'];
const CITY = ['上海', '深圳', '杭州', '成都', 'Singapore', '广州', '苏州', '北京', 'Kuala Lumpur', '香港'];
const STATUS = ['Active', '待跟进', 'Closed', '谈判中', 'New'];
const FAM = ['林', '周', '叶', '沈', '温', '顾', '萧', '季'];
const NUMCN = '〇一二三四五六七八九';
const BRAND = ['Pinestone 松石', 'Sprucely 云杉', 'Lumo 鹿角', 'Brisa 南风', 'Kelp 海盐'];
const KIND = ['无线耳机', '机械键盘', 'USB-C 扩展坞', '保温杯', '双肩包', '台灯', 'Smart Watch', '降噪耳罩', '充电宝 20000mAh'];
const fakeName = (i) => FAM[i % FAM.length] + [...pad(i % 1000, 3)].map((d) => NUMCN[d]).join('') + '（样例）';
function contact(i) {
  return {
    编号: 'C-' + pad(i, 5),
    公司: pick(CO1) + pick(CO2) + (rnd() < 0.3 ? ' Co., Ltd.' : ''),
    联系人: fakeName(i),
    电话: `138-0000-${pad(int(0, 9999), 4)}`,
    邮箱: `user${pad(i, 5)}@example.com`,
    城市: pick(CITY),
    状态: pick(STATUS),
  };
}
function product(i, opt = {}) {
  const p = int(39, 2999);
  const r = {
    编号: 'SKU-' + pad(i, 5),
    名称: `${pick(BRAND).split(' ')[0]} ${pick(KIND)} ${pick(['Pro', 'Mini', 'Air', '二代', 'S', 'Max'])} ${int(1, 99)}`,
    品牌: pick(BRAND),
    价格: '¥' + p.toLocaleString('en-US'),
    原价: rnd() < (opt.noOrig ?? 0.25) ? '' : '¥' + Math.round(p * (1.1 + rnd() * 0.6)).toLocaleString('en-US'),
    评分: rnd() < (opt.noRate ?? 0.15) ? '' : (3 + rnd() * 2).toFixed(1),
    城市: pick(CITY),
    链接: `${ORIGIN}/item.html?id=${i}`,
    图片: `${ORIGIN}/img/g${i % 12}.svg`,
  };
  return r;
}
for (let k = 0; k < 12; k++) {
  const h = (k * 30) % 360;
  fs.writeFileSync(path.join(OUT, 'img', `g${k}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="hsl(${h},55%,70%)"/><circle cx="60" cy="45" r="22" fill="hsl(${h},55%,45%)"/></svg>`);
}
fs.writeFileSync(path.join(OUT, 'item.html'), '<!doctype html><meta charset="utf-8"><title>详情</title><p>详情页（测试）</p>');
const PLACE = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

const CSS = `
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#222;background:#f6f6f4}
header.site{position:sticky;top:0;z-index:5;background:#1f3b2d;color:#fff;padding:12px 24px;display:flex;gap:24px}
header.site a{color:#cfe;text-decoration:none}
nav.side{float:left;width:160px;padding:16px}nav.side a{display:block;padding:4px 0;color:#355}
main{margin-left:180px;padding:16px 24px}
footer.site{clear:both;padding:24px;color:#888;border-top:1px solid #ddd;margin-top:40px}
table.data{border-collapse:collapse;width:100%;background:#fff}
table.data th,table.data td{border-bottom:1px solid #eee;padding:6px 8px;text-align:left}
table.data thead th{position:sticky;top:46px;background:#e8efe9;z-index:2}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.card{background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 3px #0001}
.card img{width:100%;height:90px;object-fit:cover;border-radius:6px;background:#eee}
.card h3{font-size:15px;margin:8px 0 4px}.card .brand{color:#666;font-size:12px}
.card .price{color:#c33;font-weight:600}.card .orig{color:#999;text-decoration:line-through;margin-left:6px;font-size:12px}
.card .rate::before{content:"★ "}.card .sku{font:12px monospace;color:#888}
.ad-slot{background:#fff8e1;border:1px dashed #e0b400;border-radius:10px;padding:12px}
.row{display:flex;gap:16px;align-items:center;background:#fff;padding:10px 12px;border-bottom:1px solid #eee}
.row img{width:60px;height:45px}.row .nm{flex:1}
.pager{margin:16px 0;display:flex;gap:6px}.pager a,.pager button{padding:4px 10px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;color:#222;text-decoration:none}
.pager .cur{background:#1f3b2d;color:#fff}.pager [disabled]{opacity:.4}
#more{display:block;margin:20px auto;padding:10px 30px;font-size:15px}
.promo{background:#fff3f3;padding:14px;margin:8px 0;border-radius:8px}
`;
const shell = (title, body, script = '') => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title} · 测试商城</title><style>${CSS}</style></head><body>
<header class="site"><b>测试商城 TestMall</b><a href="#">首页</a><a href="#">分类</a><a href="#">活动 Sale</a><a href="#">我的</a></header>
<nav class="side"><a href="#">全部分类</a><a href="#">数码 Digital</a><a href="#">家居</a><a href="#">户外</a><a href="#">办公</a><a href="#">礼品卡</a></nav>
<main><h1>${title}</h1>${body}</main>
<footer class="site">测试站，数据均为随机生成 · <a href="#">关于</a> · <a href="#">帮助</a> · <a href="#">隐私</a></footer>
<script>${LAZY}</script>${script ? `<script>${script}</script>` : ''}</body></html>`;
// 懒加载：进视口才把 data-src 换到 src
const LAZY = `(function(){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){var i=e.target;if(i.dataset.src){i.src=i.dataset.src;i.removeAttribute('data-src');}io.unobserve(i);}});});window.__lazy=function(r){(r||document).querySelectorAll('img[data-src]').forEach(function(i){io.observe(i);});};window.__lazy();})();`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cardHtml = (r) => `<div class="card"><a href="${r.链接}"><img src="${PLACE}" data-src="${r.图片}" alt=""></a><h3><a href="${r.链接}">${esc(r.名称)}</a></h3><div class="brand">${esc(r.品牌)}</div><div><span class="price">${r.价格}</span>${r.原价 ? `<span class="orig">${r.原价}</span>` : ''}</div>${r.评分 ? `<div class="rate">${r.评分}</div>` : ''}<div class="loc">发货地：${r.城市}</div><div class="sku">${r.编号}</div></div>`;
const adCard = (k) => `<div class="ad-slot"><img src="${ORIGIN}/img/g${k % 12}.svg" alt="" style="width:100%;height:90px"><h3>【广告】${pick(['限时秒杀', '新人礼包', 'Prime 会员'])}</h3><div class="brand">Sponsored 推广</div><a href="#">立即查看 ›</a></div>`;
const rowHtml = (r) => `<div class="row"><img src="${PLACE}" data-src="${r.图片}" alt=""><span class="sku">${r.编号}</span><a class="nm" href="${r.链接}">${esc(r.名称)}</a><span class="brand">${esc(r.品牌)}</span><span class="price">${r.价格}</span><span class="rate">${r.评分 ? '评分 ' + r.评分 : ''}</span><span class="loc">${r.城市}</span></div>`;
const promo = () => `<div class="promo"><b>【广告】</b>满 300 减 50 · Free shipping over $50 <a href="#">去看看</a></div>`;
const tableHtml = (rows, cols) => `<table class="data"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c === '邮箱' ? `<a href="mailto:${r[c]}">${r[c]}</a>` : esc(r[c])}</td>`).join('')}</tr>`).join('\n')}</tbody></table>`;

const answers = {};
const ans = (name, cols, rows, note) => { answers[name] = { cols, rows: rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))), note }; };
const CCOLS = ['编号', '公司', '联系人', '电话', '邮箱', '城市', '状态'];

// A. 一页 300 行的大表格，表头吸顶
{
  const rows = Array.from({ length: 300 }, (_, i) => contact(i + 1));
  fs.writeFileSync(path.join(OUT, 'a-table300.html'), shell('客户名单 Customer List（300 条）', `<p>共 300 条，表头吸顶。</p>${tableHtml(rows, CCOLS)}`));
  ans('a-table300', CCOLS, rows, '单页大表格 300 行，表头吸顶，中英混杂');
}
// B. 卡片网格：夹广告、缺字段、懒加载图片
{
  const rows = Array.from({ length: 80 }, (_, i) => product(1000 + i));
  let html = '<div class="grid">';
  rows.forEach((r, i) => { html += cardHtml(r); if (i % 13 === 6) html += adCard(i); });
  html += '</div>';
  fs.writeFileSync(path.join(OUT, 'b-cards.html'), shell('新品 New Arrivals（80 件）', html));
  ans('b-cards', ['编号', '名称', '品牌', '价格', '原价', '评分', '城市', '链接', '图片'], rows, '卡片 80 件，中间夹 6 个广告卡，原价/评分有缺，图片懒加载（data-src）');
}
// C. 整页翻页：10 页 × 50 行（跳转 URL）
{
  const all = Array.from({ length: 500 }, (_, i) => contact(5000 + i));
  for (let p = 1; p <= 10; p++) {
    const rows = all.slice((p - 1) * 50, p * 50);
    const pager = `<div class="pager">${p > 1 ? `<a href="c-paged-${p - 1}.html">‹ 上一页</a>` : ''}${Array.from({ length: 10 }, (_, k) => `<a href="c-paged-${k + 1}.html"${k + 1 === p ? ' class="cur"' : ''}>${k + 1}</a>`).join('')}${p < 10 ? `<a href="c-paged-${p + 1}.html">下一页 ›</a>` : ''}</div>`;
    fs.writeFileSync(path.join(OUT, `c-paged-${p}.html`), shell(`经销商名单（第 ${p}/10 页）`, tableHtml(rows, CCOLS) + pager));
  }
  ans('c-paged', CCOLS, all, '整页跳转翻页 10 页 × 50 行');
}
// D. Ajax 翻页：10 页 × 50 条（列表行），换内容不换网址
{
  const all = Array.from({ length: 500 }, (_, i) => product(20000 + i, { noOrig: 1 }));
  for (let p = 1; p <= 10; p++) fs.writeFileSync(path.join(OUT, 'api', `d-${p}.json`), JSON.stringify(all.slice((p - 1) * 50, p * 50)));
  const js = `var ROW=${rowHtml.toString().replace(/\$\{PLACE\}/g, PLACE)};var esc=${esc.toString()};var PLACE=${JSON.stringify(PLACE)};var cur=1;
function go(p){document.getElementById('list').style.opacity=.4;fetch('api/d-'+p+'.json').then(function(r){return r.json()}).then(function(d){setTimeout(function(){cur=p;document.getElementById('list').innerHTML=d.map(ROW).join('');document.getElementById('list').style.opacity=1;__lazy(document.getElementById('list'));pager();scrollTo(0,0);},400);});}
function pager(){var h='<button '+(cur==1?'disabled':'')+' onclick="go('+(cur-1)+')">‹ 上一页</button>';for(var k=1;k<=10;k++)h+='<button class="'+(k==cur?'cur':'')+'" onclick="go('+k+')">'+k+'</button>';h+='<button class="next" '+(cur==10?'disabled':'')+' onclick="go('+(cur+1)+')">下一页 ›</button>';document.getElementById('pager').innerHTML=h;}
go(1);`;
  fs.writeFileSync(path.join(OUT, 'd-ajax.html'), shell('库存清单 Inventory（Ajax 翻页 10 页）', '<div id="list"></div><div class="pager" id="pager"></div>', js));
  ans('d-ajax', ['编号', '名称', '品牌', '价格', '评分', '城市', '链接', '图片'], all, 'Ajax 翻页 10 页 × 50 条，列表行，网址不变，评分有缺');
}
// E. 「加载更多」：6 批 × 24 张卡片
{
  const all = Array.from({ length: 144 }, (_, i) => product(30000 + i));
  for (let b = 1; b <= 6; b++) fs.writeFileSync(path.join(OUT, 'api', `e-${b}.json`), JSON.stringify(all.slice((b - 1) * 24, b * 24)));
  const js = `var CARD=${cardHtml.toString()};var esc=${esc.toString()};var PLACE=${JSON.stringify(PLACE)};var b=0;
function more(){var btn=document.getElementById('more');btn.disabled=true;btn.textContent='加载中…';fetch('api/e-'+(b+1)+'.json').then(function(r){return r.json()}).then(function(d){setTimeout(function(){b++;var g=document.getElementById('grid');g.insertAdjacentHTML('beforeend',d.map(CARD).join(''));__lazy(g);btn.disabled=false;btn.textContent='加载更多';if(b>=6){btn.remove();document.getElementById('end').hidden=false;}},500);});}
document.getElementById('more').onclick=more;more();`;
  fs.writeFileSync(path.join(OUT, 'e-loadmore.html'), shell('好物推荐（加载更多）', '<div class="grid" id="grid"></div><button id="more">加载更多</button><p id="end" hidden>没有更多了</p>', js));
  ans('e-loadmore', ['编号', '名称', '品牌', '价格', '原价', '评分', '城市', '链接', '图片'], all, '「加载更多」按钮 6 批 × 24 张卡片');
}
// F. 无限滚动：8 批 × 25 行，每批之间夹一条广告
{
  const all = Array.from({ length: 200 }, (_, i) => product(40000 + i, { noOrig: 1 }));
  for (let b = 1; b <= 8; b++) fs.writeFileSync(path.join(OUT, 'api', `f-${b}.json`), JSON.stringify(all.slice((b - 1) * 25, b * 25)));
  const js = `var ROW=${rowHtml.toString()};var esc=${esc.toString()};var PLACE=${JSON.stringify(PLACE)};var PROMO=${JSON.stringify(promo())};var b=0,busy=false;
function load(){if(busy||b>=8)return;busy=true;document.getElementById('spin').hidden=false;fetch('api/f-'+(b+1)+'.json').then(function(r){return r.json()}).then(function(d){setTimeout(function(){b++;var l=document.getElementById('list');l.insertAdjacentHTML('beforeend',(b>1?PROMO:'')+d.map(ROW).join(''));__lazy(l);busy=false;document.getElementById('spin').hidden=true;if(b>=8)document.getElementById('end').hidden=false;check();},500);});}
function check(){if(innerHeight+scrollY>document.body.scrollHeight-300)load();}
addEventListener('scroll',check);load();`;
  fs.writeFileSync(path.join(OUT, 'f-infinite.html'), shell('动态 Feed（无限滚动 200 条）', '<div id="list"></div><p id="spin">加载中…</p><p id="end" hidden>— 到底了 —</p>', js));
  ans('f-infinite', ['编号', '名称', '品牌', '价格', '评分', '城市', '链接', '图片'], all, '无限滚动 8 批 × 25 行，批间夹广告条');
}
for (const [k, v] of Object.entries(answers)) fs.writeFileSync(path.join(OUT, 'answers', k + '.json'), JSON.stringify(v, null, 1));
fs.writeFileSync(path.join(OUT, 'index.html'), shell('比武场景', '<ul>' + ['a-table300', 'b-cards', 'c-paged-1', 'd-ajax', 'e-loadmore', 'f-infinite'].map((s) => `<li><a href="${s}.html">${s}</a></li>`).join('') + '</ul>'));
console.log('生成完毕 →', OUT, Object.keys(answers).map((k) => `${k}:${answers[k].rows.length}`).join(' '));
