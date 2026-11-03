/* 代笔僧测试站：一个进程开 4 个端口（= 4 个不同的网站），各放一种表单。
 *   PORT+0 订单录入：文本/手机/邮箱/表格布局/下拉/数字/单选/单个复选/复选组/日期/多行；提交后 302 回空表单
 *   PORT+1 报名登记：两页向导（第 1 页 → 第 2 页 → 成功页，成功页没有表单）
 *   PORT+2 Ajax 表单：不跳页，值只认 input 事件（模拟 React 受控组件），提交后清空
 *   PORT+3 带验证码的表单
 *   PORT+4 附件上传：一个藏在按钮后面的单文件框，一个多选框（multipart 提交）
 *   任意端口 /sheet.csv 模拟「表格链接」（行数可用 POST /api/sheetrows?n= 改），/private 模拟要登录的链接
 * GET /api/log 看收到的提交；POST /api/reset 清空。
 */
const http = require('http');
const { URL } = require('url');
const qs = require('querystring');

const BASE = +(process.env.PORT || 18700);
const log = [];

const css = `body{font:15px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#f4f5f7;margin:0;color:#222}
.wrap{max-width:720px;margin:24px auto;background:#fff;border-radius:10px;padding:24px 28px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 4px}.sub{color:#888;margin:0 0 18px;font-size:13px}
.row{display:flex;align-items:center;gap:12px;margin:10px 0}.row>label:first-child,.row>.lab{width:110px;color:#555;flex:none}
input[type=text],input[type=email],input[type=number],input[type=date],input:not([type]),select,textarea{border:1px solid #ccd;border-radius:6px;padding:6px 8px;font:inherit;min-width:240px}
textarea{height:60px}table td{padding:6px 0}table td:first-child{width:122px;color:#555}
fieldset{border:0;padding:0;margin:10px 0;display:flex;gap:12px;align-items:center}legend{float:left;width:110px;color:#555;padding:0}
.ok{background:#e8f6ec;color:#1b7a3a;padding:8px 12px;border-radius:6px;margin-bottom:12px}
button{background:#2563eb;color:#fff;border:0;border-radius:6px;padding:8px 22px;font:inherit;cursor:pointer;margin-top:12px}
.g-recaptcha{width:300px;height:74px;border:1px solid #ddd;border-radius:4px;background:#f9f9f9;display:flex;align-items:center;padding-left:12px;gap:10px}`;

const page = (title, body) => `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body><div class="wrap">${body}</div></body></html>`;

function orderForm(ok, extra) {
  return page('订单录入', `
  <h1>新建订单</h1><p class="sub">某某内部系统 · 订单录入</p>
  ${ok ? '<div class="ok">已保存，订单号 ' + ok + '</div>' : ''}
  <form method="post" action="/submit">
    <div class="row"><label for="cust">联系人</label><input id="cust" name="c1" required></div>
    <div class="row"><span class="lab">电话</span><input name="c2" placeholder="请输入手机号"></div>
    <div class="row"><label>电子邮箱 <input type="email" name="email"></label></div>
    <table><tr><td>公司名称</td><td><input name="field_7"></td></tr></table>
    <div class="row"><label for="ver">购买版本</label><select id="ver" name="product"><option value="">请选择</option><option value="std">标准版</option><option value="pro">专业版</option><option value="max">旗舰版</option></select></div>
    <div class="row"><label for="qty">数量（件）</label><input type="number" id="qty" name="qty" min="1"></div>
    <fieldset><legend>配送方式</legend><label><input type="radio" name="ship" value="express">快递</label><label><input type="radio" name="ship" value="pickup">自提</label><label><input type="radio" name="ship" value="local">同城</label></fieldset>
    <div class="row"><span class="lab"></span><label><input type="checkbox" name="inv" value="1"> 需要发票</label></div>
    <div class="row"><span class="lab">了解渠道</span><span><label><input type="checkbox" name="src" value="web">官网</label> <label><input type="checkbox" name="src" value="wechat">微信</label> <label><input type="checkbox" name="src" value="expo">展会</label> <label><input type="checkbox" name="src" value="friend">朋友介绍</label></span></div>
    <div class="row"><label for="due">期望交付日期</label><input type="date" id="due" name="due"></div>
    <div class="row"><label for="memo">备注</label><textarea id="memo" name="memo"></textarea></div>
    ${extra || ''}
    <button type="submit">保存订单</button>
  </form>`);
}

const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '新加坡', '南京', '武汉', '西安'];
function wiz1() {
  return page('报名 1/2', `<h1>活动报名</h1><p class="sub">第 1 步，共 2 步</p>
  <form method="post" action="/wizard/1">
    <div class="row"><label for="n">姓名</label><input id="n" name="name" required></div>
    <div class="row"><label for="m">邮箱</label><input id="m" type="email" name="mail" required></div>
    <fieldset><legend>性别</legend><label><input type="radio" name="sex" value="M">男</label><label><input type="radio" name="sex" value="F">女</label></fieldset>
    <button type="submit">下一步</button></form>`);
}
function wiz2(token) {
  return page('报名 2/2', `<h1>活动报名</h1><p class="sub">第 2 步，共 2 步</p>
  <form method="post" action="/wizard/2"><input type="hidden" name="token" value="${token}">
    <div class="row"><label for="city">所在城市</label><select id="city" name="city"><option value="">--</option>${CITIES.map(c => `<option>${c}</option>`).join('')}</select></div>
    <div class="row"><label for="bd">出生日期</label><input type="date" id="bd" name="bd"></div>
    <div class="row"><label for="msg">留言</label><textarea id="msg" name="msg"></textarea></div>
    <button type="submit">提交报名</button></form>`);
}
const ajaxPage = () => page('Ajax 表单', `<h1>客户登记（不跳页）</h1><p class="sub">值只从 input 事件里取，像 React 受控组件</p>
  <div id="app">
    <div class="row"><label for="a1">客户名</label><input id="a1" data-k="name"></div>
    <div class="row"><label for="a2">手机号码</label><input id="a2" data-k="phone"></div>
    <div class="row"><label for="a3">公司</label><input id="a3" data-k="company"></div>
    <div class="row"><label for="a4">产品</label><select id="a4" data-k="product"><option value="">选择</option><option>标准版</option><option>专业版</option><option>旗舰版</option></select></div>
    <div id="msg"></div>
    <button id="save" type="button">保存</button>
  </div>
  <script>
  const state={};
  document.querySelectorAll('[data-k]').forEach(el=>{
    el.value='';
    const ev = el.tagName==='SELECT' ? 'change' : 'input';
    el.addEventListener(ev,()=>{ state[el.dataset.k]=el.value; });
  });
  document.getElementById('save').onclick=async()=>{
    if(!state.name){document.getElementById('msg').textContent='客户名必填';return;}
    await fetch('/api/ajax',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(state)});
    setTimeout(()=>{document.querySelectorAll('[data-k]').forEach(el=>{el.value='';});for(const k in state)delete state[k];
    document.getElementById('msg').textContent='已保存';},300);
  };
  </script>`);
const captchaPage = () => page('带验证码', `<h1>意见反馈</h1>
  <form method="post" action="/captcha"><div class="row"><label for="x1">姓名</label><input id="x1" name="name"></div>
  <div class="row"><label for="x2">邮箱</label><input id="x2" name="mail" type="email"></div>
  <div class="row"><span class="lab"></span><div class="g-recaptcha"><input type="checkbox" id="robot"> 我不是机器人</div></div>
  <button type="submit">提交</button></form>`);

function body(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); }); }
const tokens = {};
let sheetRows = 5;
function multipart(buf, ct) {
  const bd = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct); if (!bd) return {};
  const sep = Buffer.from('--' + (bd[1] || bd[2]));
  const out = {}; let pos = buf.indexOf(sep);
  while (pos >= 0) {
    const next = buf.indexOf(sep, pos + sep.length); if (next < 0) break;
    const part = buf.slice(pos + sep.length + 2, next - 2);
    const he = part.indexOf('\r\n\r\n');
    const head = part.slice(0, he).toString('utf8'), body = part.slice(he + 4);
    const name = /name="([^"]*)"/.exec(head)[1], fn = /filename="([^"]*)"/.exec(head);
    const v = fn ? { fn: fn[1], size: body.length } : body.toString('utf8');
    if (fn && !fn[1]) { pos = next; continue; }
    if (out[name] !== undefined) out[name] = [].concat(out[name], v); else out[name] = v;
    pos = next;
  }
  return out;
}
function rawBody(req) { return new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); }); }
const uploadPage = () => page('附件上传', `<h1>合同归档</h1><p class="sub">上传框藏在按钮后面，另一个能多选</p>
  <form method="post" action="/upload" enctype="multipart/form-data">
    <div class="row"><label for="u1">客户名称</label><input id="u1" name="name" required></div>
    <div class="row"><span class="lab">合同扫描件</span><label style="background:#eef2ff;color:#2563eb;padding:6px 14px;border-radius:6px;cursor:pointer">选择文件<input type="file" name="contract" accept=".pdf" style="display:none"></label></div>
    <div class="row"><label for="more">补充材料</label><input type="file" id="more" name="more" multiple></div>
    <button type="submit">提交归档</button></form>`);

function handler(kind) {
  return async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, html, headers) => { res.writeHead(code, Object.assign({ 'content-type': 'text/html; charset=utf-8' }, headers || {})); res.end(html); };
    if (u.pathname === '/api/log') return send(200, JSON.stringify(log), { 'content-type': 'application/json' });
    if (u.pathname === '/api/reset' && req.method === 'POST') { log.length = 0; return send(200, '{}'); }
    if (u.pathname === '/favicon.ico') return send(204, '');
    if (u.pathname === '/api/sheetrows' && req.method === 'POST') { sheetRows = +u.searchParams.get('n'); return send(200, '{}'); }
    if (u.pathname === '/sheet.csv') {
      const H = ['客户名', '手机', '邮箱', '公司', '产品'];
      const rows = Array.from({ length: sheetRows }, (_, k) => [`链接客户${String(k + 1).padStart(2, '0')}`, `1370000${String(k + 1).padStart(4, '0')}`, `l${k + 1}@example.com`, '链接公司', '标准版']);
      return send(200, [H, ...rows].map(r => r.join(',')).join('\n'), { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': "attachment; filename*=UTF-8''" + encodeURIComponent('线上订单表.csv') });
    }
    if (u.pathname === '/private') return send(302, '', { location: '/login' });
    if (u.pathname === '/login') return send(200, page('登录', '<h1>请先登录</h1>'));
    if (kind === 'upload') {
      if (u.pathname === '/') return send(200, uploadPage());
      if (u.pathname === '/upload' && req.method === 'POST') {
        log.push({ site: 'upload', f: multipart(await rawBody(req), req.headers['content-type'] || ''), t: Date.now() });
        return send(302, '', { location: '/' });
      }
    }
    if (kind === 'order') {
      if (u.pathname === '/' || u.pathname === '/order') return send(200, orderForm(u.searchParams.get('ok')));
      if (u.pathname === '/submit' && req.method === 'POST') {
        const f = qs.parse(await body(req));
        log.push({ site: 'order', f, t: Date.now() });
        return send(302, '', { location: '/order?ok=A' + String(log.length).padStart(4, '0') });
      }
    }
    if (kind === 'wizard') {
      if (u.pathname === '/' || u.pathname === '/wizard/1' && req.method === 'GET') return send(200, wiz1());
      if (u.pathname === '/wizard/1' && req.method === 'POST') {
        const f = qs.parse(await body(req)); const tk = 't' + Math.random().toString(36).slice(2, 8); tokens[tk] = f;
        return send(302, '', { location: '/wizard/2?token=' + tk });
      }
      if (u.pathname === '/wizard/2' && req.method === 'GET') return send(200, wiz2(u.searchParams.get('token')));
      if (u.pathname === '/wizard/2' && req.method === 'POST') {
        const f = qs.parse(await body(req)); log.push({ site: 'wizard', f: Object.assign({}, tokens[f.token], f), t: Date.now() });
        return send(302, '', { location: '/wizard/done' });
      }
      if (u.pathname === '/wizard/done') return send(200, page('报名成功', '<h1>报名成功</h1><p>我们会发邮件给你。</p><p><a href="/wizard/1">再报一个</a></p>'));
    }
    if (kind === 'ajax') {
      if (u.pathname === '/') return send(200, ajaxPage());
      if (u.pathname === '/api/ajax') { log.push({ site: 'ajax', f: JSON.parse(await body(req)), t: Date.now() }); return send(200, '{}', { 'content-type': 'application/json' }); }
    }
    if (kind === 'captcha') {
      if (u.pathname === '/') return send(200, captchaPage());
      if (u.pathname === '/captcha') { log.push({ site: 'captcha', f: qs.parse(await body(req)), t: Date.now() }); return send(302, '', { location: '/' }); }
    }
    send(404, page('404', '没有这页'));
  };
}

['order', 'wizard', 'ajax', 'captcha', 'upload'].forEach((k, i) => http.createServer(handler(k)).listen(BASE + i, '127.0.0.1'));
console.log('test site on', BASE, '..', BASE + 4);
