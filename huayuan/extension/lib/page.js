// lib/page.js — 千手院插件通用：读网页。注入到网页（扩展的隔离环境），挂在 globalThis.QSPage。
// 只读页面、标记高亮、让用户点选元素；不发任何网络请求。巡山僧、代笔僧也用这一份。
(() => {
  if (globalThis.QSPage) return;

  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg', 'SVG', 'HEAD', 'META', 'LINK', 'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO', 'OBJECT', 'SELECT', 'OPTION', 'TEXTAREA', 'INPUT']);
  const INLINE = new Set(['B', 'I', 'EM', 'STRONG', 'SMALL', 'SUP', 'SUB', 'BR', 'U', 'MARK', 'FONT', 'ABBR', 'CODE', 'TIME', 'WBR', 'S', 'DEL', 'INS', 'Q', 'CITE', 'BDI', 'BDO']);
  // 状态类、乱码类名不算结构
  const NOISE_CLASS = /^(active|selected|current|hover|focus|open|opened|closed|show|hidden|visible|odd|even|first|last|disabled|checked|expanded|collapsed|is-.*|has-.*|js-.*|ng-.*|v-.*|css-.*|sc-.*|jsx-.*|_.*|.*[0-9a-f]{5,}.*|.*__[a-zA-Z0-9]{5}$)$/;

  const norm = (s) => (s || '').replace(/[\s ​]+/g, ' ').trim();

  function goodClasses(el) {
    const out = [];
    for (const c of el.classList) if (c.length < 40 && !NOISE_CLASS.test(c)) out.push(c);
    return out;
  }

  function visible(el) {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function cssEsc(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'); }

  // 稳定的 CSS 路径：有唯一 id 用 id，否则逐级 tag:nth-of-type
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      if (cur.id && !/\d{3,}/.test(cur.id) && document.querySelectorAll('#' + cssEsc(cur.id)).length === 1) {
        parts.unshift('#' + cssEsc(cur.id));
        break;
      }
      const tag = cur.tagName.toLowerCase();
      let i = 1, sib = cur;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === cur.tagName) i++;
      let same = 0;
      if (cur.parentElement) for (const c of cur.parentElement.children) if (c.tagName === cur.tagName) same++;
      parts.unshift(same > 1 ? `${tag}:nth-of-type(${i})` : tag);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function q(path) { try { return path ? document.querySelector(path) : null; } catch { return null; } }

  // 元素自己的文字（不含子元素）
  function ownText(el) {
    let s = '';
    for (const n of el.childNodes) if (n.nodeType === 3) s += n.nodeValue;
    return norm(s);
  }

  // 只含行内标签的文字块，整块当一个值
  function isTextBlock(el) {
    for (const c of el.children) {
      if (INLINE.has(c.tagName)) continue;
      if (c.tagName === 'SPAN' && c.children.length === 0 && goodClasses(c).length === 0) continue;
      return false;
    }
    return true;
  }

  function absUrl(u) { try { return new URL(u, location.href).href; } catch { return u || ''; } }

  // ---- 高亮（用属性 + 一张样式表，滚动、缩放都跟着走） ----
  const STYLE_ID = 'qs-page-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
[data-qs-list]{outline:2px solid #D99A0B!important;outline-offset:3px!important;border-radius:2px}
[data-qs-row]{box-shadow:inset 0 0 0 9999px rgba(217,154,11,.08)!important}
[data-qs-next]{outline:2px dashed #D99A0B!important;outline-offset:2px!important}
[data-qs-hover]{outline:2px solid #D99A0B!important;outline-offset:2px!important;cursor:pointer!important}
#qs-pick-tip{position:fixed!important;left:50%!important;top:14px!important;transform:translateX(-50%)!important;z-index:2147483647!important;
 background:rgba(29,29,31,.92)!important;color:#F5F5F7!important;font:600 14px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif!important;
 padding:10px 16px!important;border-radius:12px!important;box-shadow:0 8px 30px rgba(0,0,0,.25)!important;pointer-events:none!important}`;
    (document.head || document.documentElement).appendChild(st);
  }
  function mark(attr, els) {
    ensureStyle();
    for (const e of document.querySelectorAll(`[${attr}]`)) e.removeAttribute(attr);
    for (const e of els || []) if (e) e.setAttribute(attr, '');
  }
  function clearMarks() {
    for (const a of ['data-qs-list', 'data-qs-row', 'data-qs-next', 'data-qs-hover'])
      for (const e of document.querySelectorAll(`[${a}]`)) e.removeAttribute(a);
  }

  // ---- 点选元素 ----
  let picking = null;
  function pick(hint, accept) {
    stopPick();
    ensureStyle();
    const tip = document.createElement('div');
    tip.id = 'qs-pick-tip';
    tip.textContent = hint;
    document.documentElement.appendChild(tip);
    let hover = null;
    const target = (e) => accept ? (accept(e.target) || e.target) : e.target;
    const move = (e) => {
      const t = target(e);
      if (t === hover) return;
      if (hover) hover.removeAttribute('data-qs-hover');
      hover = t; hover && hover.setAttribute('data-qs-hover', '');
    };
    return new Promise((resolve) => {
      const click = (e) => {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        const t = target(e); stopPick(); resolve(t);
      };
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); stopPick(); resolve(null); } };
      const block = (e) => { e.preventDefault(); e.stopPropagation(); };
      picking = () => {
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('click', click, true);
        document.removeEventListener('mousedown', block, true);
        document.removeEventListener('mouseup', block, true);
        document.removeEventListener('keydown', key, true);
        if (hover) hover.removeAttribute('data-qs-hover');
        tip.remove();
        picking = null;
      };
      document.addEventListener('mousemove', move, true);
      document.addEventListener('click', click, true);
      document.addEventListener('mousedown', block, true);
      document.addEventListener('mouseup', block, true);
      document.addEventListener('keydown', key, true);
    });
  }
  function stopPick() { if (picking) picking(); }

  // 文字指纹（判断页面有没有变）
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  globalThis.QSPage = { SKIP, norm, goodClasses, visible, cssPath, q, ownText, isTextBlock, absUrl, mark, clearMarks, pick, stopPick, hash, sleep };
})();
