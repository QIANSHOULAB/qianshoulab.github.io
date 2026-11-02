// lib/settings.js — 千手院插件通用：设置存在本机浏览器（chrome.storage.local），不同步、不上传。
(() => {
  const QSSettings = {
    async get(defaults) {
      try { const v = await chrome.storage.local.get(defaults); return { ...defaults, ...v }; }
      catch { return { ...defaults }; }
    },
    async set(obj) { try { await chrome.storage.local.set(obj); } catch {} },
  };
  globalThis.QSSettings = QSSettings;
})();
