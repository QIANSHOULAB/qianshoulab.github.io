// Shadow DOM：整张表在 <qs-signup> 的 shadowRoot 里；「手机」再套一层 <qs-field>（自己的 shadowRoot，像 Shoelace / Lit 组件）。
// 交完不跳页，清空；值从组件里取（qs-field 的 .value）。
import { PROD, CITIES } from './data.js';
const css = `:host{display:block}form{display:grid;gap:12px}label.r{display:flex;align-items:center;gap:12px}label.r>span{width:96px;color:#555}
input,select{border:1px solid #ccd;border-radius:6px;padding:6px 8px;font:inherit;min-width:260px}button{justify-self:start;background:#2563eb;color:#fff;border:0;border-radius:6px;padding:8px 22px;font:inherit}
.ok{background:#e8f6ec;color:#1b7a3a;padding:8px 12px;border-radius:6px}`;
class QsField extends HTMLElement {
  constructor() {
    super();
    const s = this.attachShadow({ mode: 'open' });
    s.innerHTML = `<style>${css}</style><label class="r" part="base"><span>${this.getAttribute('label')}</span><input part="input"></label>`;
    this._i = s.querySelector('input');
    this._i.addEventListener('input', () => this.dispatchEvent(new CustomEvent('qs-input', { bubbles: true, composed: true })));
  }
  get value() { return this._i.value; }
  set value(v) { this._i.value = v; }
}
customElements.define('qs-field', QsField);
class QsSignup extends HTMLElement {
  constructor() {
    super();
    const s = this.attachShadow({ mode: 'open' });
    s.innerHTML = `<style>${css}</style><form id="f">
      <div id="msg"></div>
      <label class="r"><span>姓名</span><input name="name" required></label>
      <qs-field label="手机号码" id="phone"></qs-field>
      <label class="r"><span>产品版本</span><select name="product" required><option value="">请选择</option>${PROD.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}</select></label>
      <label class="r"><span>城市</span><select name="city" required><option value="">--</option>${CITIES.map(c => `<option>${c}</option>`).join('')}</select></label>
      <label class="r"><span>交付日期</span><input type="date" name="due" required></label>
      <button type="submit">提交</button></form>`;
    const f = s.getElementById('f');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const body = { name: f.name.value, phone: s.getElementById('phone').value, product: f.product.value, city: f.city.value, due: f.due.value };
      const r = await fetch('/api/shadow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      f.reset(); s.getElementById('phone').value = '';
      s.getElementById('msg').innerHTML = '<div class="ok">已保存，编号 ' + j.id + '</div>';
    });
  }
}
customElements.define('qs-signup', QsSignup);
