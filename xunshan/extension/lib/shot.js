/* 千手院通用：给网页上的一块拍张照。不靠 tabs 权限、不在用户窗口里截屏。
   两步：①在看不见的小窗里把这块连同算好的样式抄一份（markup，只抄样式和字，不抄任何属性、脚本、外链）；
   ②在插件自己的离屏页里排版、塞进 SVG 的 foreignObject、画到 canvas 出 webp（paint）。
   网页自己的图片、字体不带（换成灰块、系统字），够看出前后哪变了；大小有上限。 */
(function (g) {
  const QS = g.QS = g.QS || {};
  const PROPS = ['display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
    'background-color', 'background-image', 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
    'text-align', 'text-decoration-line', 'text-decoration-color', 'text-transform', 'white-space', 'vertical-align', 'opacity', 'visibility',
    'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'justify-content', 'align-items', 'align-self', 'order', 'row-gap', 'column-gap',
    'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'justify-items', 'align-content', 'overflow-x', 'overflow-y', 'box-shadow', 'list-style-type',
    'text-overflow', 'word-break', 'overflow-wrap', 'float', 'clear'];
  // 只用这些标签，别的一律换成 div / span：不让任何网页里的东西在插件页里活过来
  const SAFE = new Set('DIV SPAN P A B I EM STRONG SMALL SUB SUP U S DEL INS MARK H1 H2 H3 H4 H5 H6 UL OL LI DL DT DD TABLE THEAD TBODY TFOOT TR TD TH CAPTION SECTION ARTICLE HEADER FOOTER NAV MAIN ASIDE FIGURE FIGCAPTION LABEL BUTTON PRE CODE BLOCKQUOTE BR HR TIME ABBR CITE Q'.split(' '));
  const DROP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'BASE', 'TITLE', 'HEAD']);
  const BOX = new Set(['IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'svg', 'AUDIO', 'MATH', 'math']);
  const MAX_NODES = 2000;
  const px = v => /^-?[\d.]+px$/.test(v || '') ? v : null;

  function styleOf(cs, root) {
    let s = '';
    for (const p of PROPS) {
      let v = cs.getPropertyValue(p);
      if (!v || /url\(/i.test(v)) continue; // 外链一律不带
      if ((p === 'width' || p === 'height') && v === 'auto') continue;
      if (p === 'position' && v === 'fixed') v = 'absolute';
      if (p === 'position' && v === 'sticky') v = 'relative';
      s += p + ':' + v + ';';
    }
    if (root) s += 'margin:0;position:relative;top:auto;left:auto;right:auto;bottom:auto;float:none;';
    return s;
  }
  function bgOf(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
    }
    return 'rgb(255, 255, 255)';
  }
  function copy(src, root, budget) {
    if (--budget.n < 0) throw new Error('too big');
    const doc = src.ownerDocument;
    const cs = getComputedStyle(src);
    const tag = src.tagName.toUpperCase();
    const inline = /^inline/.test(cs.display);
    if (BOX.has(src.tagName) || BOX.has(tag)) {
      const d = doc.createElement(inline ? 'span' : 'div');
      const w = px(cs.width) || (src.getAttribute('width') ? src.getAttribute('width') + 'px' : '64px');
      const h = px(cs.height) || (src.getAttribute('height') ? src.getAttribute('height') + 'px' : '64px');
      d.setAttribute('style', styleOf(cs, root) + `display:${inline ? 'inline-block' : cs.display};width:${w};height:${h};background-color:rgba(128,128,128,.18);border-radius:6px;`);
      return d;
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) {
      const d = doc.createElement('span');
      d.setAttribute('style', styleOf(cs, root) + 'display:inline-block;');
      d.textContent = tag === 'SELECT' ? ((src.options && src.options[src.selectedIndex]) || {}).text || '' : (src.value || '');
      return d;
    }
    const out = doc.createElement(SAFE.has(tag) ? tag.toLowerCase() : (inline ? 'span' : 'div'));
    out.setAttribute('style', styleOf(cs, root));
    for (let c = src.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) out.appendChild(doc.createTextNode(c.nodeValue));
      else if (c.nodeType === 1 && !DROP.has(c.tagName.toUpperCase())) {
        if (getComputedStyle(c).display === 'none') continue;
        out.appendChild(copy(c, false, budget));
      }
    }
    return out;
  }

  // ① 在网页里：抄一份带样式的。整页抄 body
  function markup(el) {
    if (!el || !el.ownerDocument) return null;
    const doc = el.ownerDocument;
    const whole = el === doc.body || el === doc.documentElement;
    if (whole) el = doc.body;
    const node = copy(el, true, { n: MAX_NODES });
    return { html: new XMLSerializer().serializeToString(node), whole, bg: bgOf(el) };
  }

  const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('svg')); i.src = src; });
  // ② 在插件页里：排版、量尺寸、出图。opts: maxW 出图最宽像素，maxBytes 单张上限
  async function paint(m, opts) {
    if (!m || !m.html) return null;
    const o = Object.assign({ maxW: 720, maxBytes: 90000 }, opts);
    const doc = document;
    const host = doc.createElement('div');
    host.style.cssText = `position:absolute;left:-30000px;top:0;width:${m.whole ? 1280 : 760}px;`;
    host.innerHTML = m.html;
    const node = host.firstElementChild;
    if (!node) return null;
    if (m.whole) { node.style.width = '1280px'; node.style.overflow = 'hidden'; }
    else if (!node.style.width) { node.style.width = 'fit-content'; node.style.maxWidth = '720px'; }
    doc.body.appendChild(host);
    const r = node.getBoundingClientRect();
    host.remove();
    const pad = m.whole ? 0 : 12;
    const w = Math.ceil(Math.min(r.width, 1280)), h = Math.ceil(Math.min(r.height, m.whole ? 1400 : 1000));
    if (w < 2 || h < 2) return null;
    node.style.width = w + 'px'; node.style.height = h + 'px'; node.style.overflow = 'hidden'; node.style.maxWidth = 'none';
    const W = w + pad * 2, H = h + pad * 2;
    const wrap = doc.createElement('div');
    wrap.setAttribute('style', `padding:${pad}px;background-color:${m.bg || '#fff'};width:${W}px;height:${H}px;overflow:hidden;box-sizing:border-box`);
    wrap.appendChild(node);
    const xml = new XMLSerializer().serializeToString(wrap);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${xml}</foreignObject></svg>`;
    const img = await load('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    let scale = Math.min(2, o.maxW / W), q = 0.82;
    for (let i = 0; i < 5; i++) {
      const c = doc.createElement('canvas');
      c.width = Math.max(1, Math.round(W * scale)); c.height = Math.max(1, Math.round(H * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/webp', q);
      if (url.length <= o.maxBytes) return { src: url, w: c.width, h: c.height, cw: W, ch: H };
      scale *= 0.75; q = Math.max(0.55, q - 0.1);
    }
    return null;
  }
  QS.shot = { markup, paint };
})(typeof globalThis !== 'undefined' ? globalThis : self);
