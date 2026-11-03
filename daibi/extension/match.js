/* 代笔僧：表头 ↔ 网页字段 自动配对。看 label、placeholder、name/id，再拿这一列的样本值验一验。 */
(function (g) {
  'use strict';
  const key = s => String(s ?? '').toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[\s\-_.,，。:：;；/\\|()（）[\]【】"'“”‘’*＊·•?？!！]/g, '')
    .replace(/^(请输入|请填写|请选择|输入|填写|选择|您的|你的|your|enter|please|select)/, '');

  const GROUPS = [
    ['姓名', '名字', '联系人', '收件人', '收货人', '客户姓名', '客户名', '真实姓名', 'name', 'fullname', 'yourname', 'contactname', 'contact'],
    ['名', 'firstname', 'givenname', 'fname'],
    ['姓', 'lastname', 'surname', 'familyname', 'lname'],
    ['电话', '手机', '手机号', '手机号码', '电话号码', '联系电话', '联系方式', '移动电话', 'phone', 'mobile', 'tel', 'telephone', 'cell', 'phonenumber', 'mobilephone'],
    ['邮箱', '电子邮件', '电子邮箱', '邮件', '电邮', 'email', 'mail', 'emailaddress', 'e-mail'],
    ['地址', '收货地址', '详细地址', '联系地址', '街道', 'address', 'street', 'addr', 'address1', 'streetaddress'],
    ['城市', '所在城市', '市', 'city', 'town'],
    ['省', '省份', '州', '地区', 'state', 'province', 'region'],
    ['邮编', '邮政编码', 'zip', 'zipcode', 'postcode', 'postalcode'],
    ['国家', '国家地区', 'country'],
    ['公司', '公司名称', '单位', '单位名称', '企业', '企业名称', '机构', 'company', 'companyname', 'organization', 'organisation', 'org', 'employer'],
    ['部门', 'department', 'dept'],
    ['职位', '职务', '岗位', 'title', 'jobtitle', 'position', 'role'],
    ['日期', '时间', 'date'],
    ['生日', '出生日期', 'birthday', 'birthdate', 'dob', 'dateofbirth'],
    ['性别', 'gender', 'sex'],
    ['年龄', 'age'],
    ['数量', '件数', '个数', 'qty', 'quantity', 'count', 'num'],
    ['金额', '价格', '单价', '总价', '费用', 'price', 'amount', 'total', 'cost'],
    ['备注', '说明', '留言', '描述', '附言', 'note', 'notes', 'remark', 'remarks', 'comment', 'comments', 'message', 'description', 'memo'],
    ['产品', '商品', '品名', '货品', '产品名称', '商品名称', 'product', 'item', 'sku', 'goods'],
    ['网址', '网站', '主页', 'website', 'url', 'homepage', 'site'],
    ['用户名', '账号', '帐号', 'username', 'account', 'login', 'userid'],
    ['身份证', '证件号', '证件号码', 'idcard', 'idnumber'],
    ['订单号', '单号', 'orderno', 'ordernumber', 'orderid'],
    ['类型', '类别', '分类', 'type', 'category', 'kind'],
    ['渠道', '来源', 'source', 'channel'],
    ['付款方式', '支付方式', 'payment', 'paymentmethod', 'paymethod'],
    ['配送方式', '快递', '物流', 'shipping', 'delivery', 'shippingmethod']
  ].map(gp => gp.map(key));
  const groupOf = {};
  GROUPS.forEach((gp, i) => gp.forEach(k => { if (!(k in groupOf)) groupOf[k] = i; }));

  function bigrams(s) { const o = []; for (let i = 0; i < s.length - 1; i++) o.push(s.slice(i, i + 2)); return o; }
  function dice(a, b) {
    if (a.length < 2 || b.length < 2) return 0;
    const A = bigrams(a), B = bigrams(b).slice(); let hit = 0;
    A.forEach(x => { const j = B.indexOf(x); if (j >= 0) { hit++; B.splice(j, 1); } });
    return 2 * hit / (A.length + bigrams(b).length);
  }

  function sim(a, b) {
    const x = key(a), y = key(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (groupOf[x] != null && groupOf[x] === groupOf[y]) return 0.92;
    const [s, l] = x.length <= y.length ? [x, y] : [y, x];
    const minLen = /[一-鿿]/.test(s) ? 2 : 3;
    if (s.length >= minLen && l.includes(s)) {
      // 「联系电话」包含「电话」；长的那个也可能属于同义组
      let v = 0.62 + 0.3 * (s.length / l.length);
      return Math.min(v, 0.9);
    }
    // 去掉常见后缀再比一次同义组
    const strip = t => t.replace(/(名称|号码|地址|信息|名|号)$/, '');
    if (groupOf[strip(x)] != null && groupOf[strip(x)] === groupOf[y]) return 0.85;
    if (groupOf[x] != null && groupOf[x] === groupOf[strip(y)]) return 0.85;
    return dice(x, y) * 0.75;
  }

  const SPLIT = /[,，;；、|\/]+/;
  const isEmail = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
  const isDate = v => /^\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}/.test(v) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(v);
  const isBool = v => /^(是|否|y|n|yes|no|true|false|1|0|√|✓|x|×|对|有|无)$/i.test(v.trim());

  function optHit(opts, v) {
    const k = key(v);
    return opts.some(o => o.value === v || key(o.text) === k || key(o.value) === k || (k.length >= 1 && key(o.text).includes(k)));
  }

  function score(header, samples, f) {
    const cands = [[f.label, 1], [f.placeholder, 0.95], [f.title, 0.9], [f.groupLabel, 0.9], [f.name, 0.88], [f.id, 0.85], [f.autocomplete, 0.8]];
    let s = 0;
    for (const [txt, w] of cands) if (txt) s = Math.max(s, sim(header, txt) * w);
    const vals = samples.filter(v => v !== '');
    if (vals.length) {
      if (f.options && f.options.length) {
        const parts = f.kind === 'checkgroup' || f.kind === 'multiselect' ? vals.flatMap(v => v.split(SPLIT)) : vals;
        const r = parts.filter(v => optHit(f.options, v.trim())).length / parts.length;
        if (r >= 0.8) s += 0.15; else if (r < 0.3) s -= 0.25;
      }
      if (f.type === 'email') s += vals.every(isEmail) ? 0.1 : -0.2;
      if (['date', 'datetime-local', 'month'].includes(f.kind)) s += vals.every(isDate) ? 0.1 : -0.2;
      if (f.kind === 'checkbox') s += vals.every(isBool) ? 0.1 : -0.3;
      if (f.type === 'number') s += vals.every(v => !isNaN(+v.replace(/[,，¥￥$]/g, ''))) ? 0.05 : -0.3;
    }
    return Math.max(0, Math.min(1, s));
  }

  /* headers: 表头；rows: 前几行做样本；fields: 页面字段；keep: 已有绑定（手动的不动）
   * → {header: {sel, label, kind, conf:'sure'|'maybe', score}} */
  function autoMatch(headers, rows, fields, keep, onlyNew) {
    keep = keep || {};
    const out = {};
    const taken = new Set();
    const here = new Set(fields.map(f => f.sel));
    // 手动绑的、别的页上的（多页表单）、或者只补新的时候：原样留着
    Object.entries(keep).forEach(([h, b]) => {
      if (b && headers.includes(h) && (onlyNew || b.conf === 'manual' || !here.has(b.sel))) { out[h] = b; taken.add(b.sel); }
    });
    const pairs = [];
    headers.forEach((h, ci) => {
      if (out[h]) return;
      const samples = rows.slice(0, 8).map(r => String(r[ci] ?? '').trim());
      fields.forEach(f => { if (!taken.has(f.sel)) { const sc = score(h, samples, f); if (sc >= 0.5) pairs.push([sc, h, f]); } });
    });
    pairs.sort((a, b) => b[0] - a[0]);
    pairs.forEach(([sc, h, f]) => {
      if (out[h] || taken.has(f.sel)) return;
      out[h] = { sel: f.sel, label: f.label || f.placeholder || f.name, kind: f.kind, conf: sc >= 0.75 ? 'sure' : 'maybe', score: +sc.toFixed(2) };
      taken.add(f.sel);
    });
    return out;
  }

  g.DaibiMatch = { autoMatch, sim, score, key };
})(globalThis);
