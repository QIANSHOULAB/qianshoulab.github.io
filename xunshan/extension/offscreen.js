/* 离屏页：①把抓回来的 HTML 解析出要盯的那块；②要靠脚本渲染的页面，在这里开一个看不见的小窗读。
   同一网址多条只开一个小窗，一次读齐；变了的顺手拍照。小窗在离屏页里，用户的窗口里什么都不冒。 */
const EXT = location.origin;
let seq = 0;
const waiting = new Map(); // 请求号 → 回调

addEventListener('message', e => {
  const d = e.data;
  if (!d || d.xs !== 'part' || !waiting.has(d.id)) return;
  waiting.get(d.id)(d);
});

function ask(frame, items) {
  return new Promise(resolve => {
    const id = ++seq;
    const to = setTimeout(() => { waiting.delete(id); resolve(null); }, items.some(i => i.snap) ? 4000 : 1500);
    waiting.set(id, d => { clearTimeout(to); waiting.delete(id); resolve(d); });
    try { frame.contentWindow.postMessage({ xs: 'read', id, items }, '*'); } catch (e) { resolve(null); }
  });
}

// items: [{ k, spec, snap, prev, lines }] → { href, title, wall, parts: { k: { found, text, moved, newSel, shot } } }
async function render(url, items, maxMs) {
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
    const parts = {};
    let meta = null;
    const done = k => parts[k] && parts[k].found && parts[k].text;
    while (Date.now() - t0 < maxMs) {
      await new Promise(z => setTimeout(z, meta ? 600 : 900));
      const left = items.filter(i => !done(i.k));
      const r = await ask(f, left);
      if (r) { meta = r; Object.assign(parts, r.parts); }
      if (meta && (meta.wall || items.every(i => done(i.k)))) break;
    }
    // 小窗里抄回来的样子，在这里排版出图（小窗自己不排版，量不出尺寸）
    for (const k of Object.keys(parts)) if (parts[k] && parts[k].shot) parts[k].shot = await QS.shot.paint(parts[k].shot).catch(() => null);
    return meta ? { href: meta.href, title: meta.title, wall: meta.wall, parts } : { err: 'fetch', detail: 'frame' };
  } finally { f.remove(); }
}

// 直接抓回来的那份 HTML，原样排出来拍：跟比对用的是同一份，不会前后对不上。
// 不给 allow-scripts：网页的脚本一行都不跑；只借它的样式表。
async function snapHtml(html, url, spec) {
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-same-origin');
  f.style.cssText = 'width:1280px;height:2000px;border:0';
  const base = '<base href="' + String(url).replace(/"/g, '&quot;') + '">';
  f.srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + base) : base + html;
  const loaded = new Promise(r => { f.onload = r; setTimeout(r, 8000); });
  document.body.appendChild(f);
  try {
    await loaded;
    const doc = f.contentDocument;
    const el = doc && QS.page.locate(doc, spec).el;
    return el ? await QS.shot.paint(QS.shot.markup(el)) : null;
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
  if (msg.type === 'snapHtml') {
    snapHtml(msg.html, msg.url, msg.spec).then(reply, () => reply(null));
    return true;
  }
  if (msg.type === 'render') {
    render(msg.url, msg.items || [], msg.maxMs || 7000).then(reply, () => reply({ err: 'fetch', detail: 'frame' }));
    return true;
  }
});
