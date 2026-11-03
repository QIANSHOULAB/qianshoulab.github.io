/* 千手院通用：本机存储。只用 chrome.storage.local，数据不出这台电脑的浏览器。
 *   await QSLib.store.get('key', 默认值) / set('key', 值) / del('key')
 *   QSLib.store.settings(定义) → 设置项读写（带默认值），给设置页用
 */
(function (g) {
  'use strict';
  const area = () => chrome.storage.local;
  async function get(k, dflt) { const o = await area().get(k); return o[k] === undefined ? dflt : o[k]; }
  async function set(k, v) { await area().set({ [k]: v }); }
  async function del(k) { await area().remove(k); }

  /* 设置页：schema = [{key, type:'bool'|'number'|'choice', def, label, choices}]
   * render(container, schema, values, onChange) 画一组 iOS 风格的设置行 */
  function settings(ns, schema) {
    const key = ns + ':settings';
    return {
      schema,
      async load() { const v = await get(key, {}); const out = {}; schema.forEach(s => out[s.key] = v[s.key] ?? s.def); return out; },
      async save(vals) { await set(key, vals); }
    };
  }

  function renderSettings(container, schema, vals, onChange, t) {
    container.innerHTML = '';
    schema.forEach(s => {
      const row = document.createElement('label'); row.className = 'qs-set';
      const name = document.createElement('span'); name.className = 'qs-set-l'; name.textContent = t(s.label);
      row.appendChild(name);
      if (s.hint) { const h = document.createElement('span'); h.className = 'qs-set-h'; h.textContent = t(s.hint); name.appendChild(h); }
      let input;
      if (s.type === 'bool') {
        input = document.createElement('input'); input.type = 'checkbox'; input.className = 'qs-switch'; input.role = 'switch';
        input.checked = !!vals[s.key];
        input.addEventListener('change', () => onChange(s.key, input.checked));
      } else if (s.type === 'choice') {
        input = document.createElement('select'); input.className = 'qs-sel';
        s.choices.forEach(c => { const o = document.createElement('option'); o.value = c.v; o.textContent = t(c.label); input.appendChild(o); });
        input.value = vals[s.key];
        input.addEventListener('change', () => onChange(s.key, isNaN(+input.value) ? input.value : +input.value));
      }
      input.id = 'set-' + s.key;
      row.appendChild(input);
      container.appendChild(row);
    });
  }

  g.QSLib = g.QSLib || {};
  g.QSLib.store = { get, set, del, settings, renderSettings };
})(globalThis);
