/* 只在巡山僧离屏页里的那个看不见的小窗里干活：读要盯的那几块（同一网址多条共用这一个小窗），变了就顺手抄一份带样式的（离屏页拿去出图），回给离屏页。
   在普通网页里（用户自己逛的时候）一进来就退，什么都不做。 */
(function () {
  const EXT = 'chrome-extension://' + chrome.runtime.id;
  let mine = false;
  try { mine = window !== top && window.parent === top && location.ancestorOrigins && location.ancestorOrigins[0] === EXT; } catch (e) {}
  if (!mine || window.__xsFrame) return;
  window.__xsFrame = true;
  addEventListener('message', e => {
    if (e.origin !== EXT || !e.data || e.data.xs !== 'read') return;
    const P = globalThis.QS.page;
    const out = { xs: 'part', id: e.data.id, href: location.href, title: (document.title || '').trim(), parts: {} };
    try { out.wall = P.detectWall(document.documentElement.outerHTML, 200); } catch (x) { out.wall = null; }
    for (const q of e.data.items || []) {
      let r;
      try {
        if (out.wall) r = { found: false, text: '' };
        else if (q.detect) r = { found: true, cands: globalThis.QS.detect.serialize(document, q.known || []) };
        else {
          r = P.readPart(document, q.spec, true);
          const el = r.el; delete r.el;
          // 要拍照：头一回、强制，或者字变了（整页只认新增的行）
          const changed = q.prev == null || (q.lines ? P.newLines(q.prev, r.text).length > 0 : r.text !== q.prev);
          if (q.snap && r.found && r.text && (q.snap === 'force' || changed)) { try { r.shot = globalThis.QS.shot.markup(el); } catch (x) { r.shot = null; } }
        }
      } catch (x) { r = { found: false, text: '' }; }
      out.parts[q.k] = r;
    }
    e.source.postMessage(out, EXT);
  });
})();
