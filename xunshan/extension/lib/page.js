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
    const s = String(html || '').slice(0, 60000).toLowerCase();
    if (status === 429 || /captcha|recaptcha|hcaptcha|turnstile|cf-challenge|challenge-platform|are you a robot|verify you are human|人机验证|滑动验证|安全验证/.test(s)) return 'blocked';
    if (status === 401) return 'login';
    if (status === 403) return /cloudflare|access denied|forbidden/.test(s) ? 'blocked' : 'login';
    return null;
  }

  QS.page = { readText, parseNumber, cssPath, detectWall };
})(typeof globalThis !== 'undefined' ? globalThis : self);
