// lib/settings.js — 千手院插件通用：设置存在本机浏览器（chrome.storage.local），不同步、不上传。
(() => {
  const QSSettings = {
    async get(defaults) {
      try { const v = await chrome.storage.local.get(defaults); return { ...defaults, ...v }; }
      catch { return { ...defaults }; }
    },
    async set(obj) { try { await chrome.storage.local.set(obj); } catch {} },
    // 按网站记的东西（化缘僧：这个网站上次认的那块、改过的列、下一页、翻没翻全）
    async site(host) { try { const k = 'site:' + host; const v = await chrome.storage.local.get(k); return v[k] || null; } catch { return null; } },
    async setSite(host, v) { try { await chrome.storage.local.set({ ['site:' + host]: v }); } catch {} },
    async forgetSite(host) { try { await chrome.storage.local.remove('site:' + host); } catch {} },
  };
  globalThis.QSSettings = QSSettings;
})();
