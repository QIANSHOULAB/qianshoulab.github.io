/* 代笔僧：在网页里干活的那只手。由侧栏按需注入（只在你授权过的网站），不常驻。
 * 消息：scan / fill / submit / values / pick / flash / cancelPick
 */
(function () {
  'use strict';
  if (window.__daibiHand) return;
  window.__daibiHand = true;
  const P = QSLib.page;

  /* ---------- 值的规整 ---------- */
  const key = s => String(s ?? '').toLowerCase().replace(/[\s\-_.,，。:：;；/\\|()（）[\]【】"'“”‘’*＊·•]/g, '');
  const YES = /^(是|y|yes|true|1|√|✓|✔|x|on|勾|对|有|要|同意|checked|已选|选中)$/i;
  const NO = /^(否|n|no|false|0|off|无|不|不要|不同意|×|未选)$/i;
  const pad = n => String(n).padStart(2, '0');

  function toDate(v) {
    v = String(v).trim();
    let m;
    if ((m = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?:[ T]+(\d{1,2})[:：](\d{2}))?/.exec(v))) return { y: +m[1], mo: +m[2], d: +m[3], h: m[4], mi: m[5] };
    if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?$/.exec(v))) {
      let a = +m[1], b = +m[2];
      const [mo, d] = a > 12 ? [b, a] : [a, b];
      return { y: +m[3], mo, d, h: m[4], mi: m[5] };
    }
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(v))) return { y: +m[1], mo: +m[2], d: +m[3] };
    if (/^\d{5}(\.\d+)?$/.test(v) && +v > 20000 && +v < 80000) { // Excel 序列号
      const dt = new Date(Math.round((+v - 25569) * 864e5));
      return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes() };
    }
    return null;
  }
  function toTime(v) {
    const m = /(\d{1,2})\s*[:：时]\s*(\d{1,2})/.exec(String(v));
    return m ? pad(+m[1]) + ':' + pad(+m[2]) : null;
  }
  function dateFor(kind, v) {
    if (kind === 'time') return toTime(v);
    const d = toDate(v); if (!d || d.mo < 1 || d.mo > 12 || d.d < 1 || d.d > 31) return null;
    const D = `${d.y}-${pad(d.mo)}-${pad(d.d)}`;
    if (kind === 'date') return D;
    if (kind === 'month') return `${d.y}-${pad(d.mo)}`;
    if (kind === 'datetime-local') return `${D}T${d.h != null ? pad(+d.h) : '00'}:${d.mi != null ? pad(+d.mi) : '00'}`;
    if (kind === 'week') { const t = new Date(Date.UTC(d.y, d.mo - 1, d.d)); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${pad(Math.ceil(((t - y0) / 864e5 + 1) / 7))}`; }
    return D;
  }

  function matchOption(opts, v) {
    const raw = String(v).trim(), k = key(raw);
    let i = opts.findIndex(o => o.value === raw); if (i >= 0) return i;
    i = opts.findIndex(o => o.text === raw); if (i >= 0) return i;
    i = opts.findIndex(o => key(o.text) === k || key(o.value) === k); if (i >= 0) return i;
    if (k.length >= 1) {
      const hits = opts.map((o, j) => [j, key(o.text)]).filter(([, t]) => t && (t.includes(k) || (k.includes(t) && t.length >= 2)));
      if (hits.length === 1) return hits[0][0];
      if (hits.length > 1) { hits.sort((a, b) => Math.abs(a[1].length - k.length) - Math.abs(b[1].length - k.length)); return hits[0][0]; }
    }
    return -1;
  }

  /* ---------- 写进去：照顾 React / Vue 之类的框架 ---------- */
  function setNative(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    d && d.set ? d.set.call(el, v) : (el.value = v);
  }
  const fire = (el, ...types) => types.forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
  function typeIn(el, v) {
    try { el.focus({ preventScroll: true }); } catch (e) {}
    setNative(el, v);
    fire(el, 'input', 'change');
    try { el.blur(); } catch (e) {}
  }
  function setChecked(el, on) {
    if (el.checked === on) return;
    el.click(); // 走真点击，网站自己的监听都会触发
    if (el.checked !== on) { el.checked = on; fire(el, 'input', 'change'); }
  }

  function fillOne(it) {
    const v = it.v == null ? '' : String(it.v);
    if (v.trim() === '') return { col: it.col, skip: 'empty' };
    const found = P.find(it.sel);
    if (!found) return { col: it.col, skip: 'absent' };
    const els = [].concat(found);
    const el = els[0];
    if (!P.visible(el) && !(el.type === 'radio' || el.type === 'checkbox')) return { col: it.col, skip: 'absent' };
    const kind = P.describe(el).kind;
    try {
      if (kind === 'file') {
        const files = it.files || [];
        if (!files.length) return { col: it.col, skip: 'empty' };
        if (files.length > 1 && !el.multiple) return { col: it.col, err: 'ONE_FILE', v };
        const dt = new DataTransfer();
        files.forEach(f => {
          const bin = atob(f.data), u8 = new Uint8Array(bin.length);
          for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
          dt.items.add(new File([u8], f.name, { type: f.type || 'application/octet-stream' }));
        });
        el.files = dt.files;
        fire(el, 'input', 'change');
        if (el.files.length !== files.length) return { col: it.col, err: 'FAILED', v };
      } else if (kind === 'select') {
        const opts = Array.from(el.options).map(o => ({ value: o.value, text: o.text.trim() }));
        const i = matchOption(opts, v);
        if (i < 0) return { col: it.col, err: 'NO_OPTION', v };
        try { el.focus({ preventScroll: true }); } catch (e) {}
        el.selectedIndex = i; fire(el, 'input', 'change');
      } else if (kind === 'multiselect') {
        const opts = Array.from(el.options).map(o => ({ value: o.value, text: o.text.trim() }));
        const parts = v.split(/[,，;；、|\/]+/).map(s => s.trim()).filter(Boolean);
        const idx = parts.map(p => matchOption(opts, p));
        if (idx.some(i => i < 0)) return { col: it.col, err: 'NO_OPTION', v: parts[idx.findIndex(i => i < 0)] };
        Array.from(el.options).forEach((o, j) => o.selected = idx.includes(j)); fire(el, 'input', 'change');
      } else if (kind === 'radio') {
        const opts = els.map(x => P.describe(x)).map((d, j) => ({ value: els[j].value, text: (els[j].labels && els[j].labels[0] ? els[j].labels[0].textContent : '').trim() || els[j].value }));
        const i = matchOption(opts, v);
        if (i < 0) return { col: it.col, err: 'NO_OPTION', v };
        setChecked(els[i], true);
      } else if (kind === 'checkbox' && els.length === 1) {
        if (YES.test(v.trim())) setChecked(el, true);
        else if (NO.test(v.trim())) setChecked(el, false);
        else return { col: it.col, err: 'NOT_BOOL', v };
      } else if (kind === 'checkbox' || kind === 'checkgroup') {
        const opts = els.map(x => ({ value: x.value, text: (x.labels && x.labels[0] ? x.labels[0].textContent : '').trim() || x.value }));
        const parts = v.split(/[,，;；、|\/]+/).map(s => s.trim()).filter(Boolean);
        const idx = parts.map(p => matchOption(opts, p));
        const bad = idx.findIndex(i => i < 0);
        if (bad >= 0) return { col: it.col, err: 'NO_OPTION', v: parts[bad] };
        els.forEach((x, j) => setChecked(x, idx.includes(j)));
      } else if (['date', 'datetime-local', 'time', 'month', 'week'].includes(kind)) {
        const s = dateFor(kind, v);
        if (!s) return { col: it.col, err: 'BAD_DATE', v };
        typeIn(el, s);
        if (el.value !== s) return { col: it.col, err: 'BAD_DATE', v };
      } else if (kind === 'editable') {
        el.focus(); el.textContent = v; fire(el, 'input', 'change');
      } else {
        let s = v;
        if (el.type === 'number') { s = v.replace(/[,，\s¥￥$€£]/g, ''); if (s !== '' && isNaN(+s)) return { col: it.col, err: 'NOT_NUMBER', v }; }
        if (el.maxLength > 0 && s.length > el.maxLength) return { col: it.col, err: 'TOO_LONG', v, max: el.maxLength };
        typeIn(el, s);
      }
    } catch (e) {
      return { col: it.col, err: 'FAILED', v, msg: String(e && e.message || e) };
    }
    return { col: it.col, ok: true, sel: it.sel };
  }

  /* ---------- 提交按钮 ---------- */
  const SUBMIT_TXT = /^(提交|下一步|下一页|保存|确定|确认|完成|发送|报名|登记|创建|添加|新增|submit|next|continue|save|send|create|add|register|sign\s*up|apply|confirm|done|ok)/i;
  function btnText(b) { return (b.value || b.textContent || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(); }
  function findSubmit(sels) {
    const els = sels.map(s => [].concat(P.find(s) || [])[0]).filter(Boolean);
    const form = els.map(e => e.form || e.closest('form')).find(Boolean);
    const vis = b => b.getClientRects().length && !b.disabled;
    if (form) {
      const cands = Array.from(form.querySelectorAll('button,input[type=submit],input[type=image]'))
        .concat(form.id ? Array.from(document.querySelectorAll(`[form="${CSS.escape(form.id)}"]`)) : [])
        .filter(vis).filter(b => b.tagName !== 'BUTTON' || (b.type || 'submit') === 'submit');
      const named = cands.find(b => SUBMIT_TXT.test(btnText(b)));
      if (named || cands[0]) return { btn: named || cands[0], form };
    }
    const scope = form || document;
    const any = Array.from(scope.querySelectorAll('button,[role=button],input[type=button],a.btn,a.button')).filter(vis).filter(b => SUBMIT_TXT.test(btnText(b)));
    return { btn: any[any.length - 1] || null, form };
  }

  function firstInvalid(form) {
    const root = form || document;
    const bad = Array.from(root.querySelectorAll('input,select,textarea')).find(el => el.willValidate && !el.checkValidity() && P.visible(el));
    if (!bad) return null;
    const d = P.describe(bad);
    return { label: d.label || d.name || d.placeholder, msg: bad.validationMessage, sel: d.sel };
  }

  /* ---------- 记住用户自己点提交 ---------- */
  let lastSent = 0;
  function told() {
    const now = Date.now(); if (now - lastSent < 800) return; lastSent = now;
    try { chrome.runtime.sendMessage({ type: 'daibi:submitted', url: location.href }); } catch (e) {}
  }
  document.addEventListener('submit', told, true);
  document.addEventListener('click', e => {
    if (!e.isTrusted) return;
    const b = e.target.closest && e.target.closest('button,input[type=submit],input[type=button],[role=button]');
    if (b && SUBMIT_TXT.test(btnText(b))) setTimeout(told, 0);
  }, true);

  function valuesOf(sels) {
    return sels.map(s => {
      const f = P.find(s); if (!f) return null;
      const els = [].concat(f);
      if (els[0].type === 'radio' || els[0].type === 'checkbox') return els.filter(e => e.checked).map(e => e.value).join(',');
      if (els[0].type === 'file') return Array.from(els[0].files || []).map(f => f.name).join(',');
      return els[0].value ?? els[0].textContent;
    });
  }

  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (!m || typeof m.type !== 'string' || !m.type.startsWith('daibi:')) return;
    const t = m.type.slice(6);
    if (t === 'ping') { reply({ ok: true }); return; }
    if (t === 'scan') {
      const fields = P.fields();
      const present = (m.sels || []).filter(s => { const f = P.find(s); return f && [].concat(f).some(x => P.visible(x)); });
      reply({ url: location.href, title: document.title, fields, present, captcha: P.captcha() });
      return;
    }
    if (t === 'fill') {
      const out = (m.items || []).map(fillOne);
      reply({ items: out, captcha: P.captcha(), url: location.href });
      return;
    }
    if (t === 'values') { reply({ values: valuesOf(m.sels || []) }); return; }
    if (t === 'check') {
      const { form } = findSubmit(m.sels || []);
      reply({ invalid: firstInvalid(form), captcha: P.captcha() });
      return;
    }
    if (t === 'submit') {
      let btn = m.btn ? [].concat(P.find(m.btn) || [])[0] : null;
      let form = null;
      if (!btn) ({ btn, form } = findSubmit(m.sels || []));
      else form = btn.form;
      const inv = firstInvalid(form);
      if (inv) { reply({ ok: false, err: 'INVALID', invalid: inv }); return; }
      if (!btn) { reply({ ok: false, err: 'NO_BUTTON' }); return; }
      reply({ ok: true, label: btnText(btn) });
      lastSent = Date.now(); // 自己点的，不当成用户点的
      setTimeout(() => btn.click(), 30);
      return;
    }
    if (t === 'pick') {
      P.pick({ hint: m.hint, accept: m.button ? (el => el.closest && el.closest('button,input[type=submit],input[type=button],[role=button],a')) : undefined })
        .then(el => reply(el ? (m.button ? { sel: P.selectorOf(el), label: btnText(el) } : P.describe(el)) : null));
      return true;
    }
    if (t === 'cancelPick') { P.cancelPick(); reply({ ok: true }); return; }
    if (t === 'flash') { const f = P.find(m.sel); P.flash(f); reply({ ok: !!f }); return; }
  });
})();
