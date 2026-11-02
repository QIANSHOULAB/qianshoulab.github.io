/* 离屏页：只干一件事，把抓回来的 HTML 解析出要盯的那块文字。 */
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'parse') return;
  try {
    const doc = new DOMParser().parseFromString(msg.html, 'text/html');
    let el = null;
    try { el = msg.selector ? doc.querySelector(msg.selector) : doc.body; } catch (e) {}
    reply({ found: !!el, text: el ? QS.page.readText(el) : '', title: (doc.title || '').trim() });
  } catch (e) { reply({ found: false, text: '', err: 'fetch', detail: 'parse' }); }
});
