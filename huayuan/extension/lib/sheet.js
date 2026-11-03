// lib/sheet.js — 千手院插件通用：一张表的数据模型。
// 收行、去重、自动起列名、自动收起没用的列；用户改名、删列、拖顺序都记在这里。不碰网页、不碰界面。
(() => {
  const T = (k, v) => globalThis.QSStrings.t(k, v);

  const RE = {
    email: /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/,
    phone: /^\+?[\d\s\-()]{7,20}$/,
    url: /^https?:\/\/\S+$/i,
    price: /^([¥￥$€£]|RMB|USD|S\$)\s?[\d,.]+|^[\d,.]+\s?(元|块|万元)$/i,
    date: /^\d{4}[-/.年]\d{1,2}([-/.月]\d{1,2}日?)?(\s+\d{1,2}:\d{2}(:\d{2})?)?$/,
    percent: /^-?[\d.]+\s?%$/,
    label: /^(.{1,10}?)\s*[:：]$/,
    prefix: /^([^\d\s:：,，]{1,8})\s*[:：]\s*/,
    // 「评分 4.0」「销量 1200」：空格隔开的中文标签 + 数字
    spacePrefix: /^([㐀-鿿]{1,6})\s+(?=[-+]?[¥￥$€£]?\s?[\d,.]+\s?(%|分|星|件|元|人|条|次)?$)/,
    cjk: /[㐀-鿿]/,
    word: /^[a-z][a-z-]{2,20}$/i,
  };

  // mailto:/tel: 链接跟文字列比时去掉前缀
  const bare = (v) => { v = v || ''; if (!/^(mailto|tel|sms):/i.test(v)) return v; v = v.replace(/^(mailto|tel|sms):/i, '').split('?')[0]; try { return decodeURIComponent(v); } catch { return v; } };

  class QSSheet {
    constructor() { this.reset(); }
    reset() {
      this.keys = []; this.meta = {}; this.rows = []; this.seen = new Set(); this.dupes = 0;
      this.user = {};      // key -> { name?, hidden? }
      this.order = null;   // 用户拖过之后的列顺序
      this._auto = null;
    }

    // 收一批：{ keys, meta, rows }，返回新增几行
    add(batch) {
      if (!batch || !batch.rows) return 0;
      let prev = null;
      for (const k of batch.keys) {
        if (!this.meta[k]) {
          this.meta[k] = batch.meta[k];
          const at = prev ? this.keys.indexOf(prev) + 1 : this.keys.length && !prev ? 0 : this.keys.length;
          this.keys.splice(at, 0, k);
          if (this.order) { const oi = prev ? this.order.indexOf(prev) + 1 : 0; this.order.splice(oi, 0, k); }
        }
        prev = k;
      }
      // 去重。滚动加载、「加载更多」时旧行还留在页面上，再读到不算重复；
      // 只有同一屏里重复、或换了一页又出现的才记进「去掉重复 N 行」。
      let added = 0;
      const sigOf = (r) => Object.keys(r).sort().map((k) => k + '\u0001' + r[k]).join('\u0002');
      const appendStyle = batch.rows.length > 0 && this.seen.has(sigOf(batch.rows[0]));
      const here = new Set();
      for (const r of batch.rows) {
        const sig = sigOf(r);
        if (here.has(sig)) { this.dupes++; continue; }
        here.add(sig);
        if (this.seen.has(sig)) { if (!appendStyle) this.dupes++; continue; }
        this.seen.add(sig); this.rows.push(r); added++;
      }
      this._auto = null;
      return added;
    }

    // ---- 自动判断：列名、收起哪些列、去掉值里的「电话：」前缀 ----
    auto() {
      if (this._auto) return this._auto;
      const n = this.rows.length;
      const info = {};
      const keys = this.orderedKeys();
      for (const k of keys) {
        const vals = []; for (const r of this.rows) if (r[k]) vals.push(r[k]);
        const m = this.meta[k] || {};
        const a = { name: null, hide: null, strip: null, vals };
        const distinct = new Set(vals.slice(0, 400));
        if (m.type === 't' && n >= 3 && vals.length >= n * 0.6 && distinct.size === 1) {
          const v = vals[0];
          const lab = v.match(RE.label);
          if (lab) a.label = lab[1];
          if (lab || n >= 4) a.hide = 'const';
        }
        if (!a.hide && m.type === 't' && vals.length >= 2) {
          for (const re of [RE.prefix, RE.spacePrefix]) {
            const pre = {}; let best = null;
            for (const v of vals.slice(0, 300)) { const mm = v.match(re); if (mm) { pre[mm[1]] = (pre[mm[1]] || 0) + 1; if (!best || pre[mm[1]] > pre[best]) best = mm[1]; } }
            if (best && pre[best] >= Math.min(vals.length, 300) * 0.8) { a.strip = best; a.stripRe = re; a.name = best; break; }
          }
        }
        if (!a.hide && n >= 20 && vals.length < n * 0.05) a.hide = 'sparse';
        info[k] = a;
      }
      // 「电话：」这种标签列：名字给下一列
      for (let i = 0; i < keys.length; i++) {
        const a = info[keys[i]];
        if (!a.label) continue;
        for (let j = i + 1; j < keys.length; j++) {
          const b = info[keys[j]];
          if (b.hide) continue;
          if (!b.name) b.name = a.label;
          break;
        }
      }
      // 跟前面某列一模一样的列收起
      const shown = [];
      for (const k of keys) {
        const a = info[k];
        if (a.hide) continue;
        const same = shown.find((s) => this.rows.every((r) => bare(r[s]) === bare(r[k])));
        if (same) a.hide = 'dup'; else shown.push(k);
      }
      // 起名
      const used = {};
      let field = 0;
      for (const k of keys) {
        const a = info[k], m = this.meta[k] || {};
        let base = a.name || this.guessName(m, a.vals);
        // 拿不准的名字：只能叫「字段N」，或者只能照抄网页里的英文 class
        a.weak = !a.name && (!base || (base === (m.hint || '').trim() && !RE.cjk.test(base)));
        if (!base) base = T('colField') + (++field);
        a.name = base;
      }
      for (const k of keys) {
        const nm = (this.user[k] && this.user[k].name) || info[k].name;
        if (info[k].hide && !(this.user[k] && this.user[k].hidden === false)) continue;
        used[nm] = (used[nm] || 0) + 1;
        if (used[nm] > 1 && !(this.user[k] && this.user[k].name)) info[k].name = nm + used[nm];
      }
      this._auto = info;
      return info;
    }

    guessName(m, vals) {
      const hint = (m.hint || '').trim();
      let base = null;
      if (hint && RE.cjk.test(hint) && hint.length <= 12) base = hint;
      if (!base && hint) {
        const h = hint.toLowerCase();
        for (const [re, nm] of globalThis.QSStrings.hintWords) if (re.test(h)) { base = nm; break; }
      }
      if (m.type === 'href') return base ? base + T('colLink') : T('colLink');
      if (m.type === 'src') return base ? base + T('colImage') : T('colImage');
      if (!base && vals.length) {
        const s = vals.slice(0, 50);
        const share = (re) => s.filter((v) => re.test(v)).length / s.length;
        if (share(RE.email) > 0.6) base = T('colEmail');
        else if (share(RE.url) > 0.6) base = T('colUrl');
        else if (share(RE.date) > 0.6) base = T('colDate');
        else if (share(RE.price) > 0.6) base = T('colPrice');
        else if (share(RE.percent) > 0.6) base = T('colPercent');
        else if (s.filter((v) => RE.phone.test(v) && (v.match(/\d/g) || []).length >= 7).length / s.length > 0.6) base = T('colPhone');
      }
      if (!base && hint && RE.word.test(hint)) base = hint;
      return base;
    }

    orderedKeys() {
      if (!this.order) {
        const rank = (k) => ({ href: 1, src: 2 }[(this.meta[k] || {}).type] || 0);
        return this.keys.map((k, i) => [k, i]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map((x) => x[0]);
      }
      const rest = this.keys.filter((k) => !this.order.includes(k));
      return this.order.filter((k) => this.meta[k]).concat(rest);
    }

    // 显示顺序里的全部列
    columns() {
      const info = this.auto();
      return this.orderedKeys().map((k) => {
        const u = this.user[k] || {};
        const a = info[k];
        const hidden = u.hidden !== undefined ? u.hidden : !!a.hide;
        return { key: k, name: u.name || a.name, hidden, why: a.hide, weak: !u.name && !!a.weak, strip: a.strip, stripRe: a.stripRe, type: (this.meta[k] || {}).type };
      });
    }
    visible() { return this.columns().filter((c) => !c.hidden); }

    value(row, col) {
      let v = row[col.key] || '';
      if (col.strip && v.startsWith(col.strip)) v = v.replace(col.stripRe || RE.prefix, '');
      return v;
    }

    rename(key, name) { name = (name || '').trim(); (this.user[key] ||= {}).name = name || undefined; this._auto = null; }
    hide(key) { (this.user[key] ||= {}).hidden = true; }
    showAll() { for (const c of this.columns()) if (c.hidden) (this.user[c.key] ||= {}).hidden = false; }
    move(key, beforeKey) {
      const o = this.orderedKeys().filter((k) => k !== key);
      const i = beforeKey ? o.indexOf(beforeKey) : -1;
      o.splice(i < 0 ? o.length : i, 0, key);
      this.order = o; this._auto = null;
    }

    // 用户的改法（改名、删列、拖顺序）：存起来，下回同一个网站同一块名单直接照办
    prefs() {
      const user = {};
      for (const [k, u] of Object.entries(this.user)) if (u && (u.name || u.hidden !== undefined)) user[k] = { ...u };
      return { user, order: this.order ? [...this.order] : null };
    }
    applyPrefs(p) {
      this.user = {}; this.order = null;
      if (p && p.user) for (const [k, u] of Object.entries(p.user)) this.user[k] = { ...u };
      if (p && Array.isArray(p.order)) this.order = [...p.order];
      this._auto = null;
    }
    // 改了几处：{ rename, hide, order }
    edits() {
      let rename = 0, hide = 0;
      for (const u of Object.values(this.user)) { if (u.name) rename++; if (u.hidden === true) hide++; }
      return { rename, hide, order: !!this.order };
    }

    // 导出用：二维数组，第一行是列名
    toAOA() {
      const cols = this.visible();
      const out = [cols.map((c) => c.name)];
      for (const r of this.rows) {
        const line = cols.map((c) => this.value(r, c));
        if (line.some((v) => v)) out.push(line);
      }
      return out;
    }
  }

  globalThis.QSSheet = QSSheet;
})();
