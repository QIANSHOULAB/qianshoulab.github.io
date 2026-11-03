/* 千手院通用：附件袋。用户放进来的文件存在本机浏览器的 IndexedDB 里（不上传），按文件名取。
 *   await QSLib.files.add(FileList|File[])   → 存进去（同名覆盖）
 *   await QSLib.files.list()                 → [{name, type, size}]
 *   await QSLib.files.find('C:\\合同\\A.pdf') → 按文件名找（忽略路径和大小写），找不到 null
 *   await QSLib.files.toPayload(rec)         → {name, type, data(base64)}，可以跨消息传
 *   await QSLib.files.clear()
 */
(function (g) {
  'use strict';
  const DB = 'qs-files', ST = 'files';
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'name' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  async function run(mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(ST, mode), s = t.objectStore(ST);
      const req = fn(s);
      t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
      t.onerror = () => rej(t.error);
    });
  }
  async function add(files) {
    const arr = Array.from(files || []);
    for (const f of arr) {
      const buf = await f.arrayBuffer(); // 先读出来，File 句柄过会儿可能失效
      await run('readwrite', s => s.put({ name: f.name, type: f.type || '', size: f.size, blob: new Blob([buf], { type: f.type || '' }), t: Date.now() }));
    }
    return arr.length;
  }
  async function list() {
    const all = await run('readonly', s => s.getAll()) || [];
    return all.map(x => ({ name: x.name, type: x.type, size: x.size })).sort((a, b) => a.name.localeCompare(b.name));
  }
  const base = v => String(v || '').trim().replace(/^["']|["']$/g, '').split(/[\\/]/).pop();
  async function find(v) {
    const n = base(v); if (!n) return null;
    let r = await run('readonly', s => s.get(n));
    if (r) return r;
    const low = n.toLowerCase();
    const all = await run('readonly', s => s.getAll()) || [];
    return all.find(x => x.name.toLowerCase() === low) || null;
  }
  async function remove(name) { await run('readwrite', s => s.delete(name)); }
  async function clear() { await run('readwrite', s => s.clear()); }
  function toPayload(rec) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res({ name: rec.name, type: rec.type, data: String(fr.result).split(',')[1] || '' });
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(rec.blob);
    });
  }
  g.QSLib = g.QSLib || {};
  g.QSLib.files = { add, list, find, remove, clear, toPayload, base };
})(globalThis);
