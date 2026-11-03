/* 千手院通用：读页面。选择器生成、取文字、认数字、识别拦路页。
   在内容脚本、离屏页、后台都能用（后台没有 DOM，只用纯函数部分）。 */
(function (g) {
  const QS = g.QS = g.QS || {};
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME', 'OBJECT', 'CANVAS']);
  const BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TBODY|TD|TFOOT|TH|THEAD|TR|UL|OPTION)$/;

  // 不靠排版的取文字：活页面和 DOMParser 解析出来的结果一致，避免两种检查方式互相打架
  function readText(root) {
    if (!root) return '';
    const out = [];
    (function walk(n) {
      if (n.nodeType === 3) { out.push(n.nodeValue); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toUpperCase();
      if (SKIP.has(tag) || n.hidden || n.getAttribute('aria-hidden') === 'true') return;
      if (tag === 'INPUT' && /^(text|number|search)?$/i.test(n.type || '') && n.value) out.push(' ' + n.value + ' ');
      if (tag === 'IMG' && n.alt) out.push(' ' + n.alt + ' ');
      const b = BLOCK.test(tag);
      if (b) out.push('\n');
      for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
      if (b) out.push('\n');
      else if (tag === 'TD' || tag === 'TH') out.push(' ');
    })(root);
    return out.join('')
      .replace(/[ \t\f\v ​]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim()
      .slice(0, 20000);
  }

  // 第一个像样的数字：¥1,299.00 / S$ 12.90 / 库存 3 件 / 1.299,00 €
  function parseNumber(text) {
    if (!text) return null;
    const m = String(text).replace(/ /g, ' ').match(/-?\d{1,3}(?:[,，]\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const v = parseFloat(m[0].replace(/[,，]/g, ''));
    return Number.isFinite(v) ? v : null;
  }

  function esc(s) { return (g.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^\w-]/g, c => '\\' + c); }
  const looksRandom = s => /\d{4,}|[a-f0-9]{8,}|^(css|sc|jsx|ember|react)-|__/i.test(s);

  // 生成尽量稳的选择器：能用 id 用 id，不然从最近的 id 祖先往下数第几个
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return null;
    const doc = el.ownerDocument;
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== doc.documentElement) {
      if (n.id && !looksRandom(n.id) && doc.querySelectorAll('#' + esc(n.id)).length === 1) {
        parts.unshift('#' + esc(n.id));
        break;
      }
      const tag = n.tagName.toLowerCase();
      let seg = tag;
      const p = n.parentElement;
      if (p) {
        const same = Array.from(p.children).filter(c => c.tagName === n.tagName);
        if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      }
      parts.unshift(seg);
      if (tag === 'body') break;
      n = p;
    }
    const sel = parts.join(' > ');
    try { if (doc.querySelector(sel) === el) return sel; } catch (e) {}
    return null;
  }

  // 拦路页识别：验证码、人机检查、登录墙。只识别，不绕。
  function detectWall(html, status) {
    const s = String(html || '').slice(0, 200000).toLowerCase();
    // 只看人眼看得见的字：很多正常页面为了评论区、登录框引了 recaptcha 脚本，不能当成被拦
    const vis = s.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
    if (status === 429 || /cf-challenge|challenge-platform|cf_chl_/.test(s) || /captcha|are you a robot|verify you are human|人机验证|滑动验证|安全验证/.test(vis)) return 'blocked';
    if (status === 401) return 'login';
    if (status === 403) return /cloudflare|access denied|forbidden/.test(s) ? 'blocked' : 'login';
    return null;
  }

  // ---------- 改版不丢：框选时多记几条路，找的时候按顺序兜底 ----------
  const okCls = c => c && c.length < 40 && !looksRandom(c) && /^[a-zA-Z][\w-]*$/.test(c);
  // 类名、itemprop、data-testid 这类改版也常留着的记号，只收全页唯一能指回这个元素的
  function altSelectors(el) {
    if (!el || el.nodeType !== 1) return [];
    const doc = el.ownerDocument, out = [];
    const uniq = s => { try { const a = doc.querySelectorAll(s); return a.length === 1 && a[0] === el; } catch (e) { return false; } };
    const add = s => { if (s && !out.includes(s) && uniq(s)) out.push(s); };
    for (const a of ['itemprop', 'data-testid', 'data-test', 'data-qa', 'data-field', 'name']) {
      const v = el.getAttribute(a); if (v && v.length < 60) add(`[${a}="${v.replace(/"/g, '\\"')}"]`);
    }
    const cls = Array.from(el.classList || []).filter(okCls);
    cls.forEach(c => add('.' + esc(c)));
    if (cls.length > 1) add('.' + cls.map(esc).join('.'));
    const tag = el.tagName.toLowerCase();
    cls.forEach(c => add(tag + '.' + esc(c)));
    // 往上一层借个类名：.info .price
    const p = el.parentElement;
    if (p && cls.length) Array.from(p.classList || []).filter(okCls).forEach(pc => cls.forEach(c => add('.' + esc(pc) + ' .' + esc(c))));
    return out.slice(0, 6);
  }
  // 文字的「长相」：数字换成 #，¥459.00 → ¥#
  const shape = s => String(s || '').replace(/\d[\d,.，]*/g, '#').replace(/\s+/g, ' ').trim();
  // 元素前面最近的几个字（标题、标签），当锚
  function textBefore(el, n) {
    const doc = el.ownerDocument, body = doc.body;
    if (!body) return '';
    const tw = doc.createTreeWalker(body, 4);
    let acc = '';
    const parts = [];
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (el.contains(t)) break;
      if (el.compareDocumentPosition(t) & 4) break;
      const pe = t.parentElement;
      if (pe && SKIP.has(pe.tagName.toUpperCase())) continue;
      const v = t.nodeValue.replace(/\s+/g, ' ').trim();
      if (v) parts.push(v);
      if (parts.length > 6) parts.shift();
    }
    acc = parts.join(' ');
    return acc.slice(-(n || 24));
  }
  function anchorOf(el) {
    const tx = readText(el);
    if (!tx || tx.length > 200) return null;
    return { shape: shape(tx), before: textBefore(el, 24) };
  }
  function byAnchor(doc, a) {
    if (!a || !a.shape || !doc.body) return null;
    const key = a.before ? a.before.slice(-8) : '';
    let best = null;
    for (const el of doc.body.querySelectorAll('*')) {
      if (SKIP.has(el.tagName.toUpperCase())) continue;
      const raw = el.textContent || '';
      if (raw.length > 400) continue;
      if (shape(readText(el)) !== a.shape) continue;
      if (key && !textBefore(el, 40).endsWith(key)) continue;
      if (!best || best.contains(el)) best = el; // 要最里面那层
    }
    return best;
  }
  // 按顺序找：原路径 → 备用选择器 → 文字锚点。spec: { selector, alts, anchor, numeric }
  function locate(doc, spec) {
    if (!spec || !spec.selector) return { el: doc.body, via: 'page' };
    const good = el => { if (!el) return false; const tx = readText(el); return !!tx && (!spec.numeric || parseNumber(tx) != null) && (!spec.anchor || !spec.anchor.shape || tx.length < 400); };
    let el = null;
    try { el = doc.querySelector(spec.selector); } catch (e) {}
    if (good(el)) return { el, via: 'sel' };
    for (const s of spec.alts || []) {
      let all = [];
      try { all = Array.from(doc.querySelectorAll(s)); } catch (e) {}
      const pick = all.length === 1 ? all[0] : all.find(x => spec.anchor && shape(readText(x)) === spec.anchor.shape);
      if (good(pick)) return { el: pick, via: 'alt' };
    }
    const first = el && readText(el) ? el : null; // 原路径还在、只是不像数字了（比如「暂无报价」），兜底找不到更像的就还用它
    el = byAnchor(doc, spec.anchor);
    if (good(el)) return { el, via: 'anchor' };
    return first ? { el: first, via: 'sel' } : { el: null, via: null };
  }
  // 读一块：给离屏页、后台标签、网页小窗共用
  function readPart(doc, spec, withEl) {
    const r = locate(doc, spec);
    const out = { found: !!r.el, text: r.el ? readText(r.el) : '', title: (doc.title || '').trim() };
    if (r.el && (r.via === 'alt' || r.via === 'anchor')) { out.moved = r.via; out.newSel = cssPath(r.el); }
    if (withEl) out.el = r.el;
    return out;
  }

  // ---------- 整页去噪：只看新增的行，只变数字、时间的行不算 ----------
  function newLines(prev, next) {
    const seen = new Set(String(prev || '').split('\n').map(shape).filter(Boolean));
    const out = [];
    for (const l of String(next || '').split('\n')) {
      const k = shape(l);
      if (!k || seen.has(k) || !/[^\s#:：/.\-·,，|]/.test(k)) continue;
      seen.add(k); out.push(l.trim());
    }
    return out;
  }

  QS.page = { readText, parseNumber, cssPath, detectWall, altSelectors, anchorOf, locate, readPart, newLines, shape };
})(typeof globalThis !== 'undefined' ? globalThis : self);
