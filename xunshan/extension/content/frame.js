/* 只在巡山僧离屏页里的那个看不见的小窗里干活：读要盯的那块，回给离屏页。
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
    let out;
    try {
      const wall = P.detectWall(document.documentElement.outerHTML, 200);
      out = Object.assign({ xs: 'part', id: e.data.id, wall, href: location.href }, wall ? { found: false, text: '' } : P.readPart(document, e.data.spec));
    } catch (x) { out = { xs: 'part', id: e.data.id, found: false, text: '' }; }
    e.source.postMessage(out, EXT);
  });
})();
