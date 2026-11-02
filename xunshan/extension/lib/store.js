/* 千手院通用：本地存储。全部在 chrome.storage.local，不出这台电脑。 */
(function (g) {
  const QS = g.QS = g.QS || {};
  const area = () => chrome.storage.local;
  let chain = Promise.resolve();
  QS.store = {
    async get(key, dflt) {
      const o = await area().get(key);
      return o[key] === undefined ? dflt : o[key];
    },
    async getMany(keys) { return area().get(keys); },
    set(key, val) { return area().set({ [key]: val }); },
    remove(keys) { return area().remove(keys); },
    // 串行读-改-写，防止后台和页面同时改丢数据
    update(key, fn, dflt) {
      const run = async () => {
        const cur = await QS.store.get(key, dflt);
        const next = await fn(cur);
        if (next !== undefined) await QS.store.set(key, next);
        return next;
      };
      const p = chain.then(run, run);
      chain = p.catch(() => {});
      return p;
    },
    onChange(fn) {
      chrome.storage.onChanged.addListener((ch, a) => { if (a === 'local') fn(ch); });
    }
  };

  // 设置：带默认值
  QS.settings = {
    defaults: {},
    async all() { return Object.assign({}, QS.settings.defaults, await QS.store.get('settings', {})); },
    async set(patch) { return QS.store.update('settings', s => Object.assign({}, s, patch), {}); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
