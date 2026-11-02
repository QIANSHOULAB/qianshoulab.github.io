// background.js — 点工具栏图标：给这个标签页开一个化缘僧窗口（已经开着就叫到前面）。
// activeTab 在点图标那一刻生效，面板窗口凭它读这个标签页；不点就什么都不读。

async function openPanel(tab) {
  if (!tab || tab.id === undefined) return;
  const { panels = {} } = await chrome.storage.session.get('panels');
  const existing = panels[tab.id];
  if (existing) {
    try { await chrome.windows.update(existing, { focused: true }); return existing; } catch { /* 窗口已关 */ }
  }
  let left, top, height = 680;
  try {
    const w = await chrome.windows.get(tab.windowId);
    const width = 880;
    left = Math.max(0, (w.left || 0) + (w.width || width) - width - 24);
    top = Math.max(0, (w.top || 0) + 72);
    height = Math.max(520, Math.min(760, (w.height || 760) - 96));
  } catch {}
  const opts = { url: chrome.runtime.getURL(`panel.html?tab=${tab.id}`), type: 'popup', width: 880, height, focused: true };
  let win;
  try { win = await chrome.windows.create({ ...opts, left, top }); }
  catch { win = await chrome.windows.create(opts); } // 位置超出屏幕（多显示器等）就让浏览器自己摆
  panels[tab.id] = win.id;
  await chrome.storage.session.set({ panels });
  return win.id;
}

chrome.action.onClicked.addListener((tab) => { openPanel(tab); });

chrome.windows.onRemoved.addListener(async (winId) => {
  const { panels = {} } = await chrome.storage.session.get('panels');
  let changed = false;
  for (const k of Object.keys(panels)) if (panels[k] === winId) { delete panels[k]; changed = true; }
  if (changed) await chrome.storage.session.set({ panels });
});

globalThis.openPanel = openPanel; // 测试脚本用
