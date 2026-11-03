/* 巡山僧：自己认出网页上的价格、库存、名额那一块，不用人框。
   活页面（弹窗注入）、DOMParser 解析的页面（离屏页）、看不见的小窗里都能用；要先有 lib/page.js。
   QS.detect.find(doc, known) → [{ kind, el, text, num, score, label }]
   QS.detect.serialize(doc, known) → 同上但换成能存的 { kind, text, num, selector, alts, anchor, label }
   known：同一网站以前盯过的几块（selector/alts/anchor/numeric/kind/label），先按它们找——同一网站第二次不用再框。 */
(function (g) {
  const QS = g.QS = g.QS || {};
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|IFRAME|OBJECT|CANVAS|HEAD|TITLE|META|LINK|OPTION|SELECT|TEXTAREA|INPUT|QIANSHOU-.*)$/;
  const CUR = /(?:[¥￥$€£₹]|RM|S\$|HK\$|NT\$|US\$|USD|SGD|CNY|RMB)\s?-?\d|\d\s?(?:元|円)(?!\s*\/)/i;
  const PRICE_ATTR = /price|amount|cost|jiage/i;
  const BAD_ATTR = /(^|[-_\s])(was|old|orig|original|list|strike|del|before|market|msrp|save|saving|discount|coupon|unit|per|ship|shipping|tax|installment|monthly|rating|review|count|qty|quantity)([-_\s]|$)|oldprice|listprice|originalprice|price-?was|price-?old/i;
  const BAD_TEXT = /%|满\s?\d|减\s?\d|券|省\s?\d|运费|邮费|分期|\/\s?月|每月|评价|销量|已售\s?\d|人付款|月销|起$/;
  const STOCK_TEXT = /暂时缺货|缺货|无货|有货|现货|售罄|已售完|已抢光|到货通知|仅剩\s?\d+|库存\s?\d*|in stock|out of stock|sold out|unavailable|available|pre-?order|预售/i;
  const STOCK_ATTR = /stock|inventory|avail/i;
  const SEAT_TEXT = /名额|余票|余位|席位|空位|剩余\s*[:：]?\s*\d|seats?\b|tickets? left|slots? left|places? left/i;

  const attrs = el => [el.id, typeof el.className === 'string' ? el.className : (el.getAttribute('class') || ''), el.getAttribute('itemprop') || '', el.getAttribute('data-testid') || '']
    .concat(Array.from(el.attributes || []).filter(a => /^data-/.test(a.name)).map(a => a.name)).join(' ');
  const numbers = s => (String(s).match(/\d[\d,，]*(?:\.\d+)?/g) || []).length;

  // 页面里结构化数据写的价格（很多商店都有），用来给对上的那个元素加分
  function ldPrice(doc) {
    try {
      for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
        const m = /"price"\s*:\s*"?(\d+(?:\.\d+)?)/.exec(s.textContent || '');
        if (m) return +m[1];
      }
      const meta = doc.querySelector('meta[itemprop="price"],meta[property="product:price:amount"],meta[property="og:price:amount"]');
      if (meta) { const v = parseFloat(meta.getAttribute('content')); if (Number.isFinite(v)) return v; }
    } catch (e) {}
    return null;
  }

  function find(doc, known) {
    const P = QS.page;
    const body = doc && doc.body;
    if (!body || !P) return [];
    const live = !!(doc.defaultView && doc.defaultView.getComputedStyle);
    const lp = ldPrice(doc);
    const out = [];
    const all = body.querySelectorAll('*');
    let idx = 0;
    const textOf = new Map();
    const tx = el => { if (!textOf.has(el)) textOf.set(el, P.readText(el)); return textOf.get(el); };
    for (const el of all) {
      idx++;
      if (SKIP.test(el.tagName)) continue;
      const raw = el.textContent || '';
      if (!raw.trim() || raw.length > 160) continue;
      if (el.closest('[hidden],[aria-hidden="true"],qianshou-picker,script,style,template,noscript')) continue;
      const t = tx(el);
      if (!t || t.length > 60) continue;
      // 里面有一层字一模一样的，留给里面那层
      let same = false;
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (tx(c) === t) { same = true; break; }
      if (same) continue;
      let fs = 0;
      if (live) {
        if (!el.getClientRects().length) continue;
        const cs = doc.defaultView.getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        fs = parseFloat(cs.fontSize) || 0;
      }
      const a = attrs(el), pa = el.parentElement ? attrs(el.parentElement) : '';
      const num = P.parseNumber(t);
      const struck = !!el.closest('del,s,strike');
      const order = -idx * 1e-4;
      // 价格
      if (num != null) {
        let s = 0;
        if (CUR.test(t)) s += 5;
        if (el.getAttribute('itemprop') === 'price') s += 8;
        if (el.hasAttribute('data-price')) s += 3;
        if (PRICE_ATTR.test(a)) s += 4; else if (PRICE_ATTR.test(pa)) s += 1;
        if (BAD_ATTR.test(a)) s -= 8;
        if (struck) s -= 10;
        if (BAD_TEXT.test(t)) s -= 5;
        if (numbers(t) > 1) s -= 3;
        if (t.length <= 14) s += 2; else if (t.length > 30) s -= 2;
        if (lp != null && num === lp) s += 4;
        if (fs) s += Math.max(-2, Math.min(4, (fs - 15) / 4));
        if (s >= 5 && !SEAT_TEXT.test(t)) out.push({ kind: 'price', el, text: t, num, score: s + order });
      }
      // 库存
      if ((t.length <= 16 && STOCK_TEXT.test(t) && !/\d+\s?\/\s?\d+/.test(t)) || (STOCK_ATTR.test(a) && t.length <= 20) || el.getAttribute('itemprop') === 'availability') {
        let s = 0;
        if (STOCK_TEXT.test(t)) s += 5;
        if (STOCK_ATTR.test(a)) s += 4;
        if (el.getAttribute('itemprop') === 'availability') s += 6;
        if (t.length <= 12) s += 2;
        if (CUR.test(t)) s -= 3;
        if (/^(BUTTON|A)$/.test(el.tagName) && !/到货通知/.test(t)) s -= 3;
        if (s >= 5) out.push({ kind: 'stock', el, text: t, num, score: s + order });
      }
      // 名额、余票
      if (num != null && t.length <= 40 && SEAT_TEXT.test(t)) {
        let s = 5;
        if (/seat|slot|ticket|quota/i.test(a)) s += 3;
        if (t.length <= 16) s += 2;
        if (CUR.test(t)) s -= 4;
        if (s >= 5) out.push({ kind: 'seats', el, text: t, num, score: s + order });
      }
    }
    // 每种只要最像的那个
    const best = {};
    for (const c of out) if (!best[c.kind] || c.score > best[c.kind].score) best[c.kind] = c;
    let list = Object.values(best);
    // 同一网站以前盯过的那几块：按以前的找法找，找到了排最前、替掉同种的
    const mem = [];
    for (const k of known || []) {
      if (!k || !k.selector) continue;
      let r = null;
      try { r = P.locate(doc, k); } catch (e) {}
      if (!r || !r.el) continue;
      const t = P.readText(r.el);
      if (!t || t.length > 200) continue;
      if (k.anchor && k.anchor.shape && P.shape(t) !== k.anchor.shape && k.numeric && P.parseNumber(t) == null) continue;
      if (mem.some(m => m.el === r.el)) continue;
      mem.push({ kind: /^(price|stock|seats)$/.test(k.kind) ? k.kind : 'known', el: r.el, text: t, num: P.parseNumber(t), score: 100, label: k.label || '' });
    }
    list = list.filter(c => !mem.some(m => m.el === c.el || m.kind === c.kind));
    list = mem.concat(list.sort((a, b) => b.score - a.score));
    // 一块套着另一块的（库存那块把价格也包进去了），留分高的
    return list.filter((c, i) => !list.some((d, j) => j < i && (d.el.contains(c.el) || c.el.contains(d.el)))).slice(0, 3);
  }

  function serialize(doc, known) {
    const P = QS.page;
    return find(doc, known).map(c => {
      const selector = P.cssPath(c.el);
      if (!selector) return null;
      return { kind: c.kind, text: c.text.slice(0, 200), num: c.num, selector, alts: P.altSelectors(c.el), anchor: P.anchorOf(c.el), label: c.label || '' };
    }).filter(Boolean);
  }

  QS.detect = { find, serialize };
})(typeof globalThis !== 'undefined' ? globalThis : self);
