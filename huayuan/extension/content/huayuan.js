// content/huayuan.js — 化缘僧的业务：在网页里猜名单、拆字段、找下一页、滚动加载。
// 依赖 lib/page.js（QSPage）。每次调用都是无状态的：面板每次把「目标」传进来，页面刷新后重新注入也照常工作。
(() => {
  if (globalThis.Huayuan) return;
  const P = globalThis.QSPage;

  const NEXT_WORDS = /^(下一页|下一頁|下页|下一页>|后一页|下一张|next|next page|next›|nextpage|older|older posts|更多结果|›|»|>|→|>>|下一页 ›)$/i;
  const MORE_WORDS = /^(加载更多|载入更多|查看更多|显示更多|点击加载更多|展开更多|load more|show more|see more|more results|view more)$/i;
  const BAD_ZONES = 'nav,header,footer,aside,[role=navigation],[role=menu],[role=menubar],[role=tablist],[role=banner],[role=contentinfo]';
  const MAX_ROWS = 5000;

  function sig(el) {
    const cls = P.goodClasses(el).sort();
    return el.tagName + (cls.length ? '.' + cls.join('.') : '');
  }

  // ---- 猜名单：每个父元素里，长得一样的孩子最多的那组 ----
  function scan() {
    const found = [];
    const all = document.body ? document.body.getElementsByTagName('*') : [];
    for (const el of all) {
      if (el.children.length < 3 || P.SKIP.has(el.tagName) || el.tagName === 'THEAD') continue;
      const groups = new Map();
      for (const c of el.children) {
        if (P.SKIP.has(c.tagName)) continue;
        const s = sig(c);
        let g = groups.get(s); if (!g) groups.set(s, (g = []));
        g.push(c);
      }
      let best = null;
      for (const [s, arr] of groups) if (!best || arr.length > best.kids.length) best = { sig: s, kids: arr };
      if (!best || best.kids.length < 3) continue;
      const kids = best.kids.filter((k) => !isHeaderRow(k) && P.visible(k));
      if (kids.length < 3) continue;
      let area = 0, txt = 0, imgs = 0;
      for (const k of kids) {
        const r = k.getBoundingClientRect();
        area += r.width * r.height;
        txt += Math.min(300, (k.textContent || '').replace(/\s+/g, '').length);
        if (k.querySelector('img')) imgs++;
      }
      const avgTxt = txt / kids.length;
      if (avgTxt < 2 && imgs < kids.length / 2) continue;
      let score = area * Math.log2(kids.length + 1) * Math.min(1, (avgTxt + 4) / 30);
      if (el.closest(BAD_ZONES)) score *= 0.12;
      const leafy = kids.filter((k) => k.children.length === 0 || (k.children.length === 1 && k.firstElementChild.children.length === 0)).length / kids.length;
      if (leafy > 0.8) score *= 0.35;
      found.push({ el, sig: best.sig, kids, score });
    }
    found.sort((a, b) => b.score - a.score);
    // 结构越丰富（每行字段多）越像名单
    const top = found.slice(0, 24);
    for (const c of top) {
      const sample = c.kids.slice(0, 8);
      let leaves = 0;
      for (const k of sample) leaves += Object.keys(rowRecord(k, null).rec).length;
      const per = leaves / sample.length;
      c.fields = Math.round(per);
      c.score *= Math.min(2.5, 0.6 + per / 4);
    }
    top.sort((a, b) => b.score - a.score);
    const kept = [];
    for (const c of top) {
      if (kept.some((k) => k.el === c.el || (k.kids.length === c.kids.length && (k.el.contains(c.el) || c.el.contains(k.el))))) continue;
      kept.push(c);
      if (kept.length >= 8) break;
    }
    return kept;
  }

  function isHeaderRow(tr) {
    if (tr.tagName !== 'TR') return false;
    const cells = tr.cells;
    if (!cells || !cells.length) return true;
    for (const c of cells) if (c.tagName !== 'TH') return false;
    return true;
  }

  function locate(target) {
    if (!target) return null;
    const el = P.q(target.path);
    if (el) {
      const kids = [...el.children].filter((c) => sig(c) === target.sig && !isHeaderRow(c));
      if (kids.length >= 1) return { el, kids };
    }
    // 页面换了结构：找同样长相的那组
    let best = null;
    for (const c of scan()) if (c.sig === target.sig && (!best || c.kids.length > best.kids.length)) best = c;
    return best ? { el: best.el, kids: best.kids } : null;
  }

  // ---- 表头（表格） ----
  function headerMap(tbody) {
    const table = tbody.closest('table');
    if (!table) return null;
    let hr = null;
    if (table.tHead && table.tHead.rows.length) hr = table.tHead.rows[table.tHead.rows.length - 1];
    else for (const r of table.rows) { if (isHeaderRow(r)) { hr = r; break; } }
    if (!hr) return null;
    const map = [];
    for (const c of hr.cells) { const t = P.norm(c.textContent); for (let i = 0; i < (c.colSpan || 1); i++) map.push(t); }
    return map;
  }

  // ---- 拆一行：每个文字块 / 链接 / 图片一个字段，键是它在行里的结构路径 ----
  function rowRecord(row, headers) {
    const rec = {}, meta = {};
    const put = (key, v, type, hint) => {
      if (!v) return;
      if (rec[key] === undefined) { rec[key] = v; meta[key] = { type, hint }; }
      else if (type === 't' && rec[key] !== v) rec[key] += ' ' + v;
    };
    const walk = (el, path, hint, depth) => {
      if (depth > 14) return;
      const seen = {};
      let cellIdx = 0;
      for (const c of el.children) {
        if (P.SKIP.has(c.tagName)) continue;
        const cls = P.goodClasses(c);
        let step = c.tagName.toLowerCase() + (cls.length ? '.' + cls[0] : '');
        seen[step] = (seen[step] || 0) + 1;
        if (seen[step] > 1) step += '#' + seen[step];
        const p = path ? path + '>' + step : step;
        let h = hint;
        if (headers && depth === 0 && (c.tagName === 'TD' || c.tagName === 'TH')) { h = headers[cellIdx] || h; cellIdx += c.colSpan || 1; }
        h = fieldHint(c) || h;
        visit(c, p, h, depth + 1);
      }
    };
    const visit = (el, p, h, depth) => {
      if (el.tagName === 'IMG') { put(p + '|src', imgUrl(el), 'src', h); return; }
      if (el.tagName === 'A') { const href = el.getAttribute('href') || ''; if (href && !/^(javascript:|#)/i.test(href)) put(p + '|href', P.absUrl(href), 'href', h); }
      if (getComputedStyle(el).display === 'none') return;
      if (P.isTextBlock(el)) {
        put(p + '|t', P.norm(el.textContent), 't', h);
        for (const im of el.getElementsByTagName('img')) put(p + '>img|src', imgUrl(im), 'src', h);
        return;
      }
      put(p + '|t', P.ownText(el), 't', h);
      walk(el, p, h, depth);
    };
    if (row.tagName === 'IMG' || P.isTextBlock(row)) visit(row, '.', fieldHint(row), 0);
    else { put('.|t', P.ownText(row), 't', fieldHint(row)); if (row.tagName === 'A') put('.|href', P.absUrl(row.getAttribute('href') || ''), 'href', null); walk(row, '', null, 0); }
    return { rec, meta };
  }

  // 图片地址：懒加载的先看 data-src；data: 内嵌图（占位图、几 KB 的 base64）不要
  function imgUrl(im) {
    for (const u of [im.getAttribute('data-src'), im.getAttribute('data-original'), im.getAttribute('data-lazy-src'), im.currentSrc, im.getAttribute('src')]) {
      if (u && !/^data:/i.test(u)) return P.absUrl(u);
    }
    return '';
  }

  function fieldHint(el) {
    const a = el.getAttribute('itemprop') || el.getAttribute('data-field') || el.getAttribute('data-label') || el.getAttribute('data-title');
    if (a) return a;
    const cls = P.goodClasses(el);
    return cls.length ? cls[cls.length - 1] : null;
  }

  function rowsOf(loc) { return loc.kids.filter((k) => !isHeaderRow(k)).slice(0, MAX_ROWS); }

  function extract(target) {
    const loc = locate(target);
    if (!loc) return { ok: false };
    const headers = loc.kids[0].tagName === 'TR' ? headerMap(loc.el) : null;
    const keys = [], meta = {}, rows = [];
    for (const r of rowsOf(loc)) {
      const { rec, meta: m } = rowRecord(r, headers);
      let prev = null;
      for (const k in rec) {
        // 新字段插在它在这一行里前一个字段的后面，列的顺序跟页面一致
        if (!meta[k]) { meta[k] = m[k]; const at = prev ? keys.indexOf(prev) + 1 : 0; keys.splice(at, 0, k); }
        prev = k;
      }
      if (Object.keys(rec).length) rows.push(rec);
    }
    return { ok: true, keys, meta, rows, fp: fingerprintOf(loc), path: P.cssPath(loc.el) };
  }

  function fingerprintOf(loc) {
    const k = loc ? loc.kids : [];
    const s = k.length + '|' + (k[0] ? k[0].textContent : '') + '|' + (k[k.length - 1] ? k[k.length - 1].textContent : '');
    return location.href + '#' + P.hash(s);
  }
  function fingerprint(target) {
    const loc = locate(target);
    return { ok: !!loc, fp: fingerprintOf(loc), rows: loc ? loc.kids.length : 0, ready: document.readyState };
  }

  // ---- 下一页 ----
  function clickable(el) { return el.closest('a,button,[role=button],[role=link],input[type=button],input[type=submit],li,span[onclick],div[onclick]') || el; }
  function isDisabled(el) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
    for (let e = el, i = 0; e && i < 3; e = e.parentElement, i++) if (/(^|[\s_-])(disabled|inactive|is-disabled)($|[\s_-])/i.test(e.className || '')) return true;
    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (href && P.absUrl(href) === location.href && !el.onclick) return true;
    }
    return false;
  }
  function labelOf(el) {
    return P.norm(el.textContent || el.value || '') || P.norm(el.getAttribute('aria-label') || el.getAttribute('title') || '');
  }
  function findNext(loc) {
    const cands = document.querySelectorAll('a,button,[role=button],[role=link],input[type=button],input[type=submit],li[class*=next],span[class*=next],div[class*=next]');
    let best = null;
    for (const el of cands) {
      if (loc && loc.el.contains(el)) continue;
      if (!P.visible(el)) continue;
      const text = labelOf(el).replace(/\s+/g, '');
      const aria = P.norm((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
      const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
      let s = 0;
      if (el.getAttribute('rel') === 'next') s += 6;
      if (NEXT_WORDS.test(text)) s += 5;
      else if (MORE_WORDS.test(text)) s += 4;
      else if (text.length < 16 && /下一页|next/i.test(text)) s += 3;
      if (/next|下一页/.test(aria)) s += 3;
      if (/(^|[\s_-])(next|pager-next|pagination-next|load-?more)($|[\s_-])/.test(cls)) s += 2;
      if (s < 3) continue;
      if (isDisabled(el)) continue;
      if (el.closest(BAD_ZONES) && !el.closest('[class*=pag],[class*=pager]')) s -= 2;
      if (loc && (loc.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) s += 1;
      if (!best || s > best.s) best = { el, s };
    }
    return best ? best.el : null;
  }
  function resolveNext(loc, spec) {
    if (spec && spec.path) {
      const el = P.q(spec.path);
      if (el && P.visible(el) && (!spec.text || labelOf(el) === spec.text)) return isDisabled(el) ? null : el;
      if (spec.text) {
        for (const e of document.querySelectorAll('a,button,[role=button],li,span,div')) {
          if (labelOf(e) === spec.text && P.visible(e) && e.children.length <= 2) return isDisabled(e) ? null : clickable(e);
        }
      }
      return null;
    }
    return findNext(loc);
  }

  function nextInfo(loc, spec) {
    const el = resolveNext(loc, spec);
    return el ? { found: true, text: labelOf(el).slice(0, 20) || '›', path: P.cssPath(el) } : { found: false };
  }

  function clickNext(target, spec) {
    const loc = locate(target);
    const el = resolveNext(loc, spec);
    if (!el) return { ok: false, reason: 'none' };
    if (el.tagName === 'A' && el.target && el.target !== '_self') el.removeAttribute('target');
    el.scrollIntoView({ block: 'center' });
    el.click();
    return { ok: true };
  }

  // ---- 滚动加载 ----
  function scroller(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 20) return e;
    }
    return document.scrollingElement || document.documentElement;
  }
  function canScroll(target) {
    const loc = locate(target);
    const sc = scroller(loc ? loc.el : document.body);
    return sc.scrollHeight > sc.clientHeight + 200;
  }
  function scrollMore(target) {
    const loc = locate(target);
    if (!loc) return { ok: false };
    const last = loc.kids[loc.kids.length - 1];
    if (last) last.scrollIntoView({ block: 'end' });
    const sc = scroller(loc.el);
    sc.scrollTop = sc.scrollHeight;
    if (sc === document.scrollingElement || sc === document.documentElement) window.scrollTo(0, document.documentElement.scrollHeight);
    window.dispatchEvent(new Event('scroll'));
    // 有「加载更多」按钮就顺手点
    const more = findNext(loc);
    if (more && MORE_WORDS.test(labelOf(more).replace(/\s+/g, ''))) more.click();
    return { ok: true };
  }

  // 面板窗口一关（端口断开），网页上的高亮和点选状态全部清掉
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'qs-panel') return;
    port.onDisconnect.addListener(() => { P.stopPick(); P.clearMarks(); });
  });

  // ---- 给面板的接口 ----
  let cache = [];
  globalThis.Huayuan = {
    scan() {
      cache = scan();
      return {
        ok: true, host: location.hostname, title: document.title, url: location.href,
        list: cache.map((c) => ({ path: P.cssPath(c.el), sig: c.sig, rows: c.kids.length, fields: c.fields })),
      };
    },
    extract,
    fingerprint,
    probe(target, spec) {
      const loc = locate(target);
      return { next: nextInfo(loc, spec), scroll: canScroll(target) };
    },
    highlight(target, spec, focus) {
      const loc = locate(target);
      P.mark('data-qs-list', loc ? [loc.el] : []);
      P.mark('data-qs-row', loc ? loc.kids : []);
      const n = resolveNext(loc, spec);
      P.mark('data-qs-next', n ? [n] : []);
      if (focus && loc) {
        const r = loc.el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) loc.el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      return { ok: !!loc };
    },
    clear() { P.stopPick(); P.clearMarks(); return true; },
    clickNext,
    scrollMore,
    async pickNext(hint) {
      const el = await P.pick(hint, (t) => clickable(t));
      if (!el) return null;
      P.mark('data-qs-next', [el]);
      return { path: P.cssPath(el), text: labelOf(el).slice(0, 40) };
    },
  };
})();
