/* 离屏页：①把抓回来的 HTML 解析出要盯的那块；②要靠脚本渲染的页面，在这里开一个看不见的小窗读。
   小窗在离屏页里，用户的窗口里什么都不冒。 */
const EXT = location.origin;
let seq = 0;
const waiting = new Map(); // 请求号 → 回调

addEventListener('message', e => {
  const d = e.data;
  if (!d || d.xs !== 'part' || !waiting.has(d.id)) return;
  waiting.get(d.id)(d);
});

function ask(frame, spec) {
  return new Promise(resolve => {
    const id = ++seq;
    const to = setTimeout(() => { waiting.delete(id); resolve(null); }, 1500);
    waiting.set(id, d => { clearTimeout(to); waiting.delete(id); resolve(d); });
    try { frame.contentWindow.postMessage({ xs: 'read', id, spec }, '*'); } catch (e) { resolve(null); }
  });
}

async function render(url, spec, maxMs) {
  const f = document.createElement('iframe');
  // 不给 allow-top-navigation：网页的「跳出框架」脚本动不了离屏页
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  f.style.cssText = 'width:1280px;height:2000px;border:0';
  const loaded = new Promise(r => { f.onload = r; setTimeout(r, 30000); });
  f.src = url;
  document.body.appendChild(f);
  try {
    await loaded;
    const t0 = Date.now();
    let r = null;
    while (Date.now() - t0 < maxMs) {
      await new Promise(z => setTimeout(z, r ? 600 : 900));
      r = await ask(f, spec) || r;
      if (r && (r.wall || (r.found && r.text))) break;
    }
    return r ? { found: r.found, text: r.text, title: r.title, wall: r.wall, href: r.href, moved: r.moved, newSel: r.newSel } : { err: 'fetch', detail: 'frame' };
  } finally { f.remove(); }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'parse') {
    try {
      const doc = new DOMParser().parseFromString(msg.html, 'text/html');
      reply(QS.page.readPart(doc, msg.spec));
    } catch (e) { reply({ found: false, text: '', err: 'fetch', detail: 'parse' }); }
    return;
  }
  if (msg.type === 'render') {
    render(msg.url, msg.spec, msg.maxMs || 7000).then(reply, () => reply({ err: 'fetch', detail: 'frame' }));
    return true;
  }
});
