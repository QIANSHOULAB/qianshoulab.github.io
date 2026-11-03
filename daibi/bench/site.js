/* 代笔僧比武测试站：一个进程 9 个端口 = 9 个不同网站（不同 origin），各放一种真实场景的表单。
 *   +0 plain  普通表单：文本/邮箱/下拉/数字/下拉城市/原生日期/多行；提交后 302 回空表单
 *   +1 react  框架管的输入框：仿 React 的 value tracker——直接改 el.value 不算数，框架还会把值改回去；fetch 提交后清空
 *   +2 dd     自定义下拉（div 模拟，像 AntD/Element），值在隐藏框里；没选就不让交
 *   +3 iframe 表单在 iframe 里（iframe 来自 +8，另一个 origin，像嵌入的第三方表单）
 *   +4 wizard 三页向导 → 成功页
 *   +5 ajax   不跳页的 Ajax 表单，交完清空、弹「已保存」
 *   +6 valid  必填校验：姓名/手机/邮箱必填，手机 11 位，备注最多 100 字
 *   +7 date   日期控件：只读文本框 + 弹出日历（像 flatpickr），只能点日历选
 *   +8 iframe 里面那张表
 *   +9..+13 真组件库（先 cd real && npm ci && node build.js）：antd · element（Element Plus）· mui · select2 · shadow（Shadow DOM）
 *           每页：联系人/姓名、产品版本（单选下拉）、所在城市（可搜下拉）、客户标签（多选下拉）、交付日期（日历控件）；shadow 页是原生控件但整张表在 shadowRoot 里
 * GET /api/log 看收到的提交；POST /api/reset 清空。端口：PORT 环境变量，默认 18800。
 */
const http = require('http');
const { URL } = require('url');
const qs = require('querystring');
const BASE = +(process.env.PORT || 18800);
const SITES = ['plain', 'react', 'dd', 'iframe', 'wizard', 'ajax', 'valid', 'date', 'inner', 'antd', 'element', 'mui', 'select2', 'shadow'];
const REAL = require('path').join(__dirname, 'real', 'build');
const TAGS = ['新客户', '老客户', '加急', '大客户', '需发票', '海外'];

let log = [];
const wiz = {};

const css = `body{font:15px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#f4f5f7;margin:0;color:#222}
.wrap{max-width:720px;margin:24px auto;background:#fff;border-radius:10px;padding:24px 28px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 4px}.sub{color:#888;margin:0 0 18px;font-size:13px}
.row{display:flex;align-items:center;gap:12px;margin:10px 0}.row>label:first-child,.row>.lab{width:110px;color:#555;flex:none}
input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select,textarea{border:1px solid #ccd;border-radius:6px;padding:6px 8px;font:inherit;min-width:260px}
textarea{height:60px}.ok{background:#e8f6ec;color:#1b7a3a;padding:8px 12px;border-radius:6px;margin-bottom:12px}
.bad{background:#fdecec;color:#b42318;padding:8px 12px;border-radius:6px;margin-bottom:12px}
button{background:#2563eb;color:#fff;border:0;border-radius:6px;padding:8px 22px;font:inherit;cursor:pointer;margin-top:12px}
.req::after{content:" *";color:#d00}
.dd{position:relative;min-width:260px;border:1px solid #ccd;border-radius:6px;padding:6px 8px;cursor:pointer;background:#fff}
.dd .ph{color:#aaa}.dd ul{position:absolute;left:-1px;right:-1px;top:100%;margin:2px 0 0;padding:4px 0;list-style:none;background:#fff;border:1px solid #ccd;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:5}
.dd li{padding:5px 10px}.dd li:hover{background:#eef3ff}
.cal{position:absolute;background:#fff;border:1px solid #ccd;border-radius:8px;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:9}
.cal .hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.cal .hd b{font-weight:600}
.cal .g{display:grid;grid-template-columns:repeat(7,32px);gap:2px}.cal .g span{text-align:center;padding:4px 0;border-radius:4px;cursor:pointer}.cal .g span:hover{background:#eef3ff}
.cal button{margin:0;padding:2px 8px;background:#eee;color:#333}
iframe{width:100%;height:330px;border:1px dashed #ccd;border-radius:8px}`;
const page = (title, body) => `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body><div class="wrap">${body}</div></body></html>`;
// 真组件页不吃上面那套全局 input/button 样式（会把组件库的样式搞乱），只留外框
const realCss = css.split('\n').filter(l => !/^(input|textarea|button|\.dd|\.cal|iframe)/.test(l)).join('\n') +
  `.plain input:not([type=hidden]),.plain select{border:1px solid #ccd;border-radius:6px;padding:6px 8px;font:inherit;min-width:260px}
.plain button{background:#2563eb;color:#fff;border:0;border-radius:6px;padding:8px 22px;font:inherit;cursor:pointer;margin-top:12px}`;
const realPage = (site, title, sub, body = '<div id="app"></div>', cssFile) => `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title><style>${realCss}</style>
  ${cssFile ? `<link rel="stylesheet" href="/real/${cssFile}">` : ''}</head><body><div class="wrap"><h1>${title}</h1><p class="sub">${sub}</p>${body}</div><script src="/real/${site}.js"></script></body></html>`;
const PROD = `<option value="">请选择</option><option value="std">标准版</option><option value="pro">专业版</option><option value="max">旗舰版</option>`;
const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '新加坡', '南京', '武汉', '西安'];
const CITY = `<option value="">--</option>` + CITIES.map(c => `<option>${c}</option>`).join('');
const banner = (ok, bad) => (ok ? `<div class="ok">已保存，编号 ${ok}</div>` : '') + (bad ? `<div class="bad">${bad}</div>` : '');

const H = {
  plain: (q) => page('订单录入', `<h1>新建订单</h1><p class="sub">某某内部系统 · 订单录入</p>${banner(q.ok)}
  <form method="post" action="/submit">
    <div class="row"><label for="f1">联系人</label><input id="f1" name="name"></div>
    <div class="row"><label for="f2">手机号码</label><input id="f2" name="phone"></div>
    <div class="row"><label for="f3">电子邮箱</label><input id="f3" type="email" name="email"></div>
    <div class="row"><label for="f4">公司名称</label><input id="f4" name="company"></div>
    <div class="row"><label for="f5">购买版本</label><select id="f5" name="product">${PROD}</select></div>
    <div class="row"><label for="f6">数量</label><input id="f6" type="number" name="qty" min="1"></div>
    <div class="row"><label for="f7">城市</label><select id="f7" name="city">${CITY}</select></div>
    <div class="row"><label for="f8">交付日期</label><input id="f8" type="date" name="due"></div>
    <div class="row"><label for="f9">备注</label><textarea id="f9" name="memo"></textarea></div>
    <button type="submit">保存订单</button></form>`),

  react: () => page('客户登记', `<h1>客户登记</h1><p class="sub">值存在框架的 state 里（仿 React 受控组件）</p>
  <div id="root"><form id="rf">
    <div class="row"><label for="r1">客户姓名</label><input id="r1" data-k="name"></div>
    <div class="row"><label for="r2">手机</label><input id="r2" data-k="phone"></div>
    <div class="row"><label for="r3">邮箱</label><input id="r3" data-k="email"></div>
    <div class="row"><label for="r4">公司</label><input id="r4" data-k="company"></div>
    <div class="row"><label for="r5">产品</label><select id="r5" data-k="product">${PROD}</select></div>
    <div class="row"><label for="r6">数量</label><input id="r6" data-k="qty"></div>
    <div id="msg"></div><button type="submit">保存</button></form></div>
  <script>
  // 仿 React：每个受控框在实例上装 value 追踪器；input/change 事件来了，值和追踪器一样就当没变，并把框里的值改回 state。
  const state={};
  document.querySelectorAll('[data-k]').forEach(el=>{
    const proto=Object.getPrototypeOf(el), d=Object.getOwnPropertyDescriptor(proto,'value');
    let tracked='';
    Object.defineProperty(el,'value',{configurable:true,get(){return d.get.call(this)},set(v){tracked=''+v;d.set.call(this,v)}});
    state[el.dataset.k]='';
    const on=()=>{ const cur=d.get.call(el); if(cur===tracked){ return; } tracked=cur; state[el.dataset.k]=cur; };
    el.addEventListener(el.tagName==='SELECT'?'change':'input',on);
    // 框架重画：值不等于 state 时改回去
    el.addEventListener('blur',()=>setTimeout(()=>{ if(d.get.call(el)!==state[el.dataset.k]) el.value=state[el.dataset.k]; },0));
  });
  rf.addEventListener('submit',async e=>{
    e.preventDefault();
    const r=await fetch('/api/react',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(state)});
    const j=await r.json();
    document.querySelectorAll('[data-k]').forEach(el=>{ state[el.dataset.k]=''; el.value=''; });
    msg.innerHTML='<div class="ok">已保存，编号 '+j.id+'</div>';
  });
  </script>`),

  dd: (q) => page('报价申请', `<h1>报价申请</h1><p class="sub">下拉是 div 做的（像 AntD / Element 的 Select）</p>${banner(q.ok, q.bad)}
  <form method="post" action="/submit" id="df">
    <div class="row"><label for="d1">联系人</label><input id="d1" name="name"></div>
    <div class="row"><span class="lab">产品版本</span><div class="dd" data-name="product" role="combobox" aria-label="产品版本"><span class="ph">请选择</span><ul hidden>
      <li data-v="std">标准版</li><li data-v="pro">专业版</li><li data-v="max">旗舰版</li></ul><input type="hidden" name="product"></div></div>
    <div class="row"><span class="lab">所在城市</span><div class="dd" data-name="city" role="combobox" aria-label="所在城市"><span class="ph">请选择</span><ul hidden>
      ${CITIES.map(c => `<li data-v="${c}">${c}</li>`).join('')}</ul><input type="hidden" name="city"></div></div>
    <button type="submit">提交申请</button></form>
  <script>
  document.querySelectorAll('.dd').forEach(dd=>{
    const ul=dd.querySelector('ul'), sh=dd.querySelector('span'), hid=dd.querySelector('input');
    dd.addEventListener('click',e=>{ const li=e.target.closest('li');
      if(li){ hid.value=li.dataset.v; sh.textContent=li.textContent; sh.className=''; ul.hidden=true; e.stopPropagation(); return; }
      document.querySelectorAll('.dd ul').forEach(u=>{ if(u!==ul) u.hidden=true; }); ul.hidden=!ul.hidden; });
  });
  document.addEventListener('click',e=>{ if(!e.target.closest('.dd')) document.querySelectorAll('.dd ul').forEach(u=>u.hidden=true); });
  df.addEventListener('submit',e=>{ if(!df.product.value||!df.city.value){ e.preventDefault(); alert('请选择产品版本和城市'); } });
  </script>`),

  iframe: () => page('合作登记', `<h1>合作伙伴登记</h1><p class="sub">下面这张表是嵌进来的（另一个网站的 iframe）</p>
  <iframe src="http://127.0.0.1:${BASE + 8}/" title="登记表"></iframe>`),

  inner: (q) => `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}.wrap{margin:0;box-shadow:none}</style></head><body><div class="wrap">${banner(q.ok)}
  <form method="post" action="/submit">
    <div class="row"><label for="i1">姓名</label><input id="i1" name="name"></div>
    <div class="row"><label for="i2">手机</label><input id="i2" name="phone"></div>
    <div class="row"><label for="i3">邮箱</label><input id="i3" type="email" name="email"></div>
    <div class="row"><label for="i4">单位</label><input id="i4" name="company"></div>
    <button type="submit">提交</button></form></div></body></html>`,

  ajax: () => page('意见反馈', `<h1>意见反馈</h1><p class="sub">不跳页，交完清空</p>
  <form id="af">
    <div class="row"><label for="a1">称呼</label><input id="a1" name="name"></div>
    <div class="row"><label for="a2">邮箱</label><input id="a2" type="email" name="email"></div>
    <div class="row"><label for="a3">公司</label><input id="a3" name="company"></div>
    <div class="row"><label for="a4">备注</label><textarea id="a4" name="memo"></textarea></div>
    <div id="msg"></div><button type="submit">发送</button></form>
  <script>
  af.addEventListener('submit',async e=>{ e.preventDefault();
    const body=new URLSearchParams(new FormData(af)).toString();
    await new Promise(r=>setTimeout(r,250));
    const r=await fetch('/api/ajax',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
    const j=await r.json(); af.reset(); msg.innerHTML='<div class="ok">已保存，编号 '+j.id+'</div>'; });
  </script>`),

  valid: (q) => page('会员注册', `<h1>会员注册</h1><p class="sub">带必填和格式校验</p>${banner(q.ok)}
  <form method="post" action="/submit">
    <div class="row"><label for="v1" class="req">姓名</label><input id="v1" name="name" required></div>
    <div class="row"><label for="v2" class="req">手机</label><input id="v2" name="phone" required pattern="1\\d{10}" title="11 位手机号"></div>
    <div class="row"><label for="v3" class="req">邮箱</label><input id="v3" type="email" name="email" required></div>
    <div class="row"><label for="v4">公司</label><input id="v4" name="company"></div>
    <div class="row"><label for="v5">备注</label><textarea id="v5" name="memo" maxlength="100"></textarea></div>
    <button type="submit">注册</button></form>`),

  date: (q) => page('预约', `<h1>预约送货</h1><p class="sub">日期只能在日历里点（只读框 + 弹出日历）</p>${banner(q.ok)}
  <form method="post" action="/submit" id="tf">
    <div class="row"><label for="t1">姓名</label><input id="t1" name="name"></div>
    <div class="row"><label for="t2">交付日期</label><input id="t2" name="due" readonly placeholder="选择日期" autocomplete="off"></div>
    <button type="submit">预约</button></form>
  <script>
  const inp=t2; let cal=null, ym=null;
  const p=n=>String(n).padStart(2,'0');
  function draw(){ const [y,m]=ym; const first=new Date(y,m,1).getDay(), days=new Date(y,m+1,0).getDate();
    cal.innerHTML='<div class="hd"><button type="button" data-d="-1">‹</button><b>'+y+'年'+(m+1)+'月</b><button type="button" data-d="1">›</button></div><div class="g">'+
      '日一二三四五六'.split('').map(x=>'<i style="text-align:center;color:#999;font-style:normal">'+x+'</i>').join('')+
      '<i></i>'.repeat(first)+Array.from({length:days},(_,i)=>'<span data-day="'+(i+1)+'">'+(i+1)+'</span>').join('')+'</div>'; }
  inp.addEventListener('click',()=>{ if(cal) return; const r=inp.getBoundingClientRect(); cal=document.createElement('div'); cal.className='cal';
    cal.style.left=r.left+scrollX+'px'; cal.style.top=r.bottom+scrollY+4+'px';
    const v=/^(\\d{4})-(\\d{2})/.exec(inp.value); ym=v?[+v[1],+v[2]-1]:[2026,10]; document.body.appendChild(cal); draw();
    cal.addEventListener('click',e=>{ e.stopPropagation(); const d=e.target.dataset;
      if(d.d){ ym[1]+=+d.d; if(ym[1]<0){ym[1]=11;ym[0]--} if(ym[1]>11){ym[1]=0;ym[0]++} draw(); }
      if(d.day){ inp.value=ym[0]+'-'+p(ym[1]+1)+'-'+p(+d.day); cal.remove(); cal=null; } }); });
  document.addEventListener('click',e=>{ if(cal&&e.target!==inp&&!cal.contains(e.target)){cal.remove();cal=null;} });
  tf.addEventListener('submit',e=>{ if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(inp.value)){ e.preventDefault(); alert('请在日历里选日期'); } });
  </script>`),
};

Object.assign(H, {
  antd: () => realPage('antd', '商机登记', 'Ant Design 5 · Select / 多选 / DatePicker（只读框，只能点日历格子）'),
  element: () => realPage('element', '订单申请', 'Element Plus · el-select / 多选 / el-date-picker', undefined, 'element.css'),
  mui: () => realPage('mui', 'Customer intake', 'MUI · Select / 多选 / DatePicker（分段输入框）'),
  select2: (q) => realPage('select2', '询价单', 'jQuery + select2：原生下拉藏起来，外面一层 select2', `${banner(q.ok)}<form method="post" action="/submit" id="sf" class="plain">
    <div class="row"><label for="s0">联系人</label><input id="s0" name="name"></div>
    <div class="row"><label for="s1">产品版本</label><select id="s1" name="product"><option></option>${PROD.replace('<option value="">请选择</option>', '')}</select></div>
    <div class="row"><label for="s2">所在城市</label><select id="s2" name="city"><option></option>${CITIES.map(c => `<option>${c}</option>`).join('')}</select></div>
    <div class="row"><label for="s3">客户标签</label><select id="s3" name="tags" multiple>${TAGS.map(c => `<option>${c}</option>`).join('')}</select></div>
    <button type="submit">提交询价</button></form>`, 'select2.css'),
  shadow: () => realPage('shadow', '活动报名', '整张表在 Web Component 的 Shadow DOM 里，「手机」再套一层', '<qs-signup></qs-signup>'),
});

const W = [
  () => `<div class="row"><label for="w1">姓名</label><input id="w1" name="name" required></div>
         <div class="row"><label for="w2">手机号</label><input id="w2" name="phone"></div>`,
  () => `<div class="row"><label for="w3">公司名称</label><input id="w3" name="company"></div>
         <div class="row"><label for="w4">选购产品</label><select id="w4" name="product" required>${PROD}</select></div>
         <div class="row"><label for="w5">购买数量</label><input id="w5" type="number" name="qty"></div>`,
  () => `<div class="row"><label for="w6">收货城市</label><select id="w6" name="city" required>${CITY}</select></div>
         <div class="row"><label for="w7">交付日期</label><input id="w7" type="date" name="due"></div>
         <div class="row"><label for="w8">备注</label><textarea id="w8" name="memo"></textarea></div>`,
];
const wizPage = (n, tok) => page(`开户 ${n}/3`, `<h1>开户申请</h1><p class="sub">第 ${n} 步，共 3 步</p>
  <form method="post" action="/w/${n}">${tok ? `<input type="hidden" name="tok" value="${tok}">` : ''}${W[n - 1]()}
  <button type="submit">${n < 3 ? '下一步' : '提交申请'}</button></form>`);

const send = (res, code, body, type = 'text/html; charset=utf-8', hd = {}) => { res.writeHead(code, { 'content-type': type, ...hd }); res.end(body); };
const body = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
const norm = o => { const x = {}; for (const [k, v] of Object.entries(o)) x[k] = String(Array.isArray(v) ? v.join(',') : v).replace(/\r\n/g, '\n'); return x; };
const rec = (site, f) => { const id = log.length + 1; log.push({ site, t: Date.now(), f: norm(f) }); return id; };

SITES.forEach((site, k) => {
  http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const q = Object.fromEntries(u.searchParams);
    if (u.pathname === '/api/log') return send(res, 200, JSON.stringify(log), 'application/json');
    if (u.pathname === '/api/reset' && req.method === 'POST') { log = []; return send(res, 200, '{}', 'application/json'); }
    if (u.pathname === '/favicon.ico') return send(res, 204, '');
    if (u.pathname.startsWith('/real/')) {
      const f = require('path').join(REAL, require('path').basename(u.pathname));
      if (!require('fs').existsSync(f)) return send(res, 404, '先 cd real && npm ci && node build.js');
      return send(res, 200, require('fs').readFileSync(f), f.endsWith('.css') ? 'text/css' : 'text/javascript; charset=utf-8');
    }
    if (req.method === 'POST' && /^\/api\/(antd|element|mui|shadow)$/.test(u.pathname)) { const id = rec(u.pathname.slice(5), JSON.parse(await body(req))); return send(res, 200, JSON.stringify({ id }), 'application/json'); }
    if (req.method === 'POST' && u.pathname === '/api/react') { const id = rec('react', JSON.parse(await body(req))); return send(res, 200, JSON.stringify({ id }), 'application/json'); }
    if (req.method === 'POST' && u.pathname === '/api/ajax') { const id = rec('ajax', qs.parse(await body(req))); return send(res, 200, JSON.stringify({ id }), 'application/json'); }
    if (site === 'wizard') {
      const m = /^\/w\/(\d)$/.exec(u.pathname);
      if (req.method === 'POST' && m) {
        const n = +m[1], f = qs.parse(await body(req));
        const tok = f.tok || Math.random().toString(36).slice(2); delete f.tok;
        wiz[tok] = Object.assign(wiz[tok] || {}, f);
        if (n < 3) return send(res, 302, '', undefined, { location: `/w/${n + 1}?tok=${tok}` });
        const id = rec('wizard', wiz[tok]); delete wiz[tok];
        return send(res, 302, '', undefined, { location: `/done?id=${id}` });
      }
      if (u.pathname === '/done') return send(res, 200, page('完成', `<h1>申请已提交</h1><p>编号 ${q.id}。<a href="/w/1">再填一份</a></p>`));
      const g = /^\/w\/(\d)$/.exec(u.pathname);
      if (g) return send(res, 200, wizPage(+g[1], q.tok));
      return send(res, 302, '', undefined, { location: '/w/1' });
    }
    if (req.method === 'POST' && u.pathname === '/submit') {
      const id = rec(site, qs.parse(await body(req)));
      return send(res, 302, '', undefined, { location: `/?ok=${id}` });
    }
    if (H[site]) return send(res, 200, H[site](q));
    send(res, 404, 'not found');
  }).listen(BASE + k, '127.0.0.1');
});
console.log(`比武站：${SITES.map((s, k) => `${s}=:${BASE + k}`).join(' ')}`);
