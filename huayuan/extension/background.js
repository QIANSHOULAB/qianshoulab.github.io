// background.js — 点工具栏图标：在这个标签页的侧边栏里打开化缘僧（每个标签页一份，切走就收起，切回来还在）。
// activeTab 在点图标那一刻生效，侧栏凭它读这个标签页；不点就什么都不读。
// 浏览器没有侧边栏（或者不让开）时，退回一个靠右的小窗口。

function openPanel(tab) {
  if (!tab || tab.id === undefined) return Promise.resolve(null);
  const path = `panel.html?tab=${tab.id}`;
  if (chrome.sidePanel && chrome.sidePanel.open) {
    // 两个调用都不能 await 在前面：sidePanel.open 必须留在点图标的那一下里
    chrome.sidePanel.setOptions({ tabId: tab.id, path, enabled: true }).catch(() => {});
    return chrome.sidePanel.open({ tabId: tab.id }).then(() => 'side', () => openWindow(tab, path));
  }
  return openWindow(tab, path);
}

async function openWindow(tab, path) {
  const { panels = {} } = await chrome.storage.session.get('panels');
  const existing = panels[tab.id];
  if (existing) {
    try { await chrome.windows.update(existing, { focused: true }); return existing; } catch { /* 窗口已关 */ }
  }
  const width = 420;
  let left, top, height = 760;
  try {
    const w = await chrome.windows.get(tab.windowId);
    left = Math.max(0, (w.left || 0) + (w.width || width) - width - 12);
    top = Math.max(0, (w.top || 0) + 72);
    height = Math.max(560, Math.min(900, (w.height || 860) - 96));
  } catch {}
  const opts = { url: chrome.runtime.getURL(path), type: 'popup', width, height, focused: true };
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
