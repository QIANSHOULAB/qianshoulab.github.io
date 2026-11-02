/* 巡山僧后台：定时巡山、取内容、比对、叫人。 */
importScripts('lib/strings.js', 'lib/store.js', 'lib/page.js', 'core/rules.js');
const { store, page, rules, t } = self.QS;
const KEY = 'watches';
const HKEY = id => 'h:' + id;
const HMAX = 40;
const MIN = 60000;
const running = new Map(); // id → 正在进行的检查，重复请求等同一个结果

/* ---------- 闹钟 ---------- */
async function ensureAlarm() {
  if (!(await chrome.alarms.get('tick'))) chrome.alarms.create('tick', { periodInMinutes: 1, delayInMinutes: 1 });
}
chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); badge(); });
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); badge(); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'tick') runDue(); });

const hostOf = u => { try { return new URL(u).host; } catch (e) { return ''; } };
const originPat = u => { try { const x = new URL(u); return x.protocol + '//' + x.hostname + '/*'; } catch (e) { return null; } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function runDue() {
  const [ws, set] = [await store.get(KEY, {}), await QS.settings.all()];
  const now = Date.now();
  const gap = (set.siteGapSec || 60) * 1000;
  const hits = await chrome.storage.session.get('hostHits').then(o => o.hostHits || {});
  const due = Object.values(ws).filter(w => !w.paused && (w.nextCheck || 0) <= now).sort((a, b) => (a.nextCheck || 0) - (b.nextCheck || 0));
  for (const w of due) {
    const h = hostOf(w.url);
    if (hits[h] && now - hits[h] < gap) continue; // 同一网站别太勤，下一轮再说
    hits[h] = Date.now();
    await chrome.storage.session.set({ hostHits: hits });
    await check(w.id).catch(e => console.warn('check', e));
  }
}

/* ---------- 取内容 ---------- */
async function ensureOffscreen() {
  const has = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (has.length) return;
  try {
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER'], justification: 'Parse fetched page HTML to read the watched part.' });
  } catch (e) { if (!/single offscreen/i.test(e.message)) throw e; }
}
function decode(buf, ctype) {
  let cs = (/charset=([\w-]+)/i.exec(ctype || '') || [])[1];
  if (!cs) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 4096));
    cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1];
  }
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch (e) { return new TextDecoder('utf-8').decode(buf); }
}
async function viaFetch(w) {
  let res;
  try { res = await fetch(w.url, { credentials: 'include', cache: 'no-store', redirect: 'follow' }); }
  catch (e) { return { err: 'fetch', detail: 'offline' }; }
  const html = decode(await res.arrayBuffer(), res.headers.get('content-type'));
  const wall = page.detectWall(html, res.status);
  if (wall) return { err: wall };
  if (!res.ok) return { err: 'fetch', detail: res.status };
  await ensureOffscreen();
  const r = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'parse', html, selector: w.selector });
  const loginish = /login|signin|sign-in|passport|auth/i.test(res.url) && !/login|signin/i.test(w.url);
  if (r && !r.found && loginish) return { err: 'login' };
  return r || { err: 'fetch', detail: 'parse' };
}
function waitLoad(tabId, ms) {
  return new Promise(resolve => {
    const done = () => { chrome.tabs.onUpdated.removeListener(fn); clearTimeout(to); resolve(); };
    const fn = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const to = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(fn);
  });
}
// 要靠脚本渲染的页面：开一个不抢焦点的后台标签，读完就关。用的是你浏览器自己的登录。
async function viaTab(w) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url: w.url, active: false, pinned: false });
    await waitLoad(tab.id, 30000);
    let r = null;
    for (let i = 0; i < 6; i++) { // 等页面把数据渲染出来
      await new Promise(z => setTimeout(z, i ? 1000 : 1200));
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/page.js'] });
      const [o] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: sel => {
          const P = globalThis.QS.page;
          const html = document.documentElement.outerHTML;
          const wall = P.detectWall(html, 200);
          const el = sel ? document.querySelector(sel) : document.body;
          return { found: !!el, text: el ? P.readText(el) : '', title: document.title, wall, href: location.href };
        },
        args: [w.selector]
      });
      r = o && o.result;
      if (r && r.found && r.text) break;
    }
    if (!r) return { err: 'fetch', detail: 'tab' };
    if (r.wall) return { err: r.wall };
    if (!r.found && /login|signin|passport|auth/i.test(r.href)) return { err: 'login' };
    return r;
  } catch (e) {
    return { err: 'fetch', detail: 'tab' };
  } finally {
    if (tab) chrome.tabs.remove(tab.id).catch(() => {});
  }
}
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

/* ---------- 检查一处 ---------- */
function check(id) {
  if (running.has(id)) return running.get(id);
  const p = doCheck(id).finally(() => running.delete(id));
  running.set(id, p);
  return p;
}
async function doCheck(id) {
  {
    const w = (await store.get(KEY, {}))[id];
    if (!w) return;
    const pat = originPat(w.url);
    if (!(await chrome.permissions.contains({ origins: [pat] }))) {
      return await save(id, { err: 'perm', lastCheck: Date.now(), nextCheck: Date.now() + w.interval * MIN });
    }
    let r = w.mode === 'tab' ? await viaTab(w) : await viaFetch(w);
    let mode = w.mode || 'fetch';
    // 头一回：直接抓的结果对不上框选时看到的，就改用后台标签（适配脚本渲染的页面）
    if (w.lastText == null && mode === 'fetch' && (r.err === 'fetch' || !r.found || !r.text || (w.pickedText && norm(r.text) !== norm(w.pickedText)))) {
      const r2 = await viaTab(w);
      if (!r2.err && r2.found && r2.text) { r = r2; mode = 'tab'; }
    }
    const now = Date.now();
    if (r.err || !r.found) {
      const err = r.err || 'gone';
      const n = (w.errCount || 0) + 1;
      const back = Math.min(2 ** Math.min(n - 1, 5) * (err === 'blocked' ? 4 : 1), 1440 / w.interval); // 出错就退避，被拦更要躲远点，最多一天一次
      return await save(id, { err, errDetail: r.detail || null, errCount: n, mode, lastCheck: now, nextCheck: now + w.interval * MIN * Math.max(1, back) });
    }
    const next = { text: r.text, num: page.parseNumber(r.text) };
    const patch = { err: null, errCount: 0, mode, lastCheck: now, nextCheck: now + w.interval * MIN, lastText: next.text, lastNum: next.num };
    if (!w.label || w.label === w.title) { if (r.title && !w.selector) patch.title = r.title; }
    let hit = false;
    if (w.lastText == null) {
      await pushHist(id, { t: now, text: next.text, num: next.num, first: true });
    } else if (next.text !== w.lastText) {
      hit = rules.shouldAlert(w.cond, { text: w.lastText, num: w.lastNum }, next);
      await pushHist(id, { t: now, text: next.text, num: next.num, hit });
      patch.lastChange = now;
      if (hit) { patch.unread = true; patch.lastHit = now; }
    }
    const saved = await save(id, patch);
    if (hit && saved) notify(saved, next);
    return saved;
  }
}
async function save(id, patch) {
  let out = null;
  await store.update(KEY, ws => { if (!ws[id]) return ws; out = Object.assign(ws[id], patch); return ws; }, {});
  badge();
  return out;
}
async function pushHist(id, e) {
  await store.update(HKEY(id), h => { h.push(e); if (h.length > HMAX) h.splice(1, h.length - HMAX); return h; }, []);
}

/* ---------- 叫人 ---------- */
function notify(w, next) {
  chrome.notifications.create('w:' + w.id + ':' + Date.now(), {
    type: 'basic', iconUrl: 'icons/128.png', priority: 2,
    title: t('notifTitle', w.label || w.title || hostOf(w.url)),
    message: rules.alertBody(w, next),
    contextMessage: hostOf(w.url) + ' · ' + t('notifOpen')
  });
}
async function openWatch(id, nid) {
  const w = (await store.get(KEY, {}))[id];
  if (nid) chrome.notifications.clear(nid);
  if (!w) return;
  await save(id, { unread: false });
  const tab = await chrome.tabs.create({ url: w.url, active: true });
  if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  return tab.id;
}
chrome.notifications.onClicked.addListener(nid => { const id = nid.split(':')[1]; openWatch(id, nid); });
async function badge() {
  const ws = await store.get(KEY, {});
  const n = Object.values(ws).filter(w => w.unread).length;
  const e = Object.values(ws).some(w => w.err && !w.paused);
  chrome.action.setBadgeBackgroundColor({ color: n ? '#FF3B30' : '#8E8E93' });
  chrome.action.setBadgeText({ text: n ? String(n) : (e ? '!' : '') });
}

/* ---------- 消息 ---------- */
const handlers = {
  async add({ watch }) {
    const set = await QS.settings.all();
    const id = uid();
    const w = Object.assign({
      id, url: watch.url, title: watch.title || hostOf(watch.url), label: watch.label || '',
      selector: watch.selector || null, pickedText: watch.pickedText || null,
      interval: watch.interval || set.defaultInterval, cond: watch.cond || { type: 'any' },
      mode: 'fetch', paused: false, created: Date.now(), nextCheck: Date.now(), lastText: null
    });
    await store.update(KEY, ws => { ws[id] = w; return ws; }, {});
    const host = hostOf(w.url);
    const hits = (await chrome.storage.session.get('hostHits')).hostHits || {};
    hits[host] = Date.now(); await chrome.storage.session.set({ hostHits: hits });
    const done = await check(id);
    return done || w;
  },
  async checkNow({ id }) { await save(id, { checkingSince: Date.now() }); const r = await check(id); await save(id, { checkingSince: null }); return r; },
  async patch({ id, patch }) {
    const allow = ['label', 'interval', 'cond', 'paused', 'unread'];
    const p = {}; for (const k of allow) if (k in patch) p[k] = patch[k];
    if ('interval' in p || p.paused === false) {
      const w = (await store.get(KEY, {}))[id];
      if (w) p.nextCheck = (w.lastCheck || Date.now()) + (p.interval || w.interval) * MIN;
    }
    return save(id, p);
  },
  async remove({ id }) { await store.update(KEY, ws => { delete ws[id]; return ws; }, {}); await store.remove(HKEY(id)); badge(); return true; },
  async markAllRead() { await store.update(KEY, ws => { for (const w of Object.values(ws)) w.unread = false; return ws; }, {}); badge(); return true; },
  async open({ id }) { return openWatch(id); },
  async import({ data }) {
    if (!data || data.app !== 'xunshan' || !Array.isArray(data.watches)) return { err: 'bad' };
    let added = 0, skipped = 0;
    const cur = await store.get(KEY, {});
    const sig = w => w.url + '|' + (w.selector || '');
    const seen = new Set(Object.values(cur).map(sig));
    for (const x of data.watches) {
      if (!x || !/^https?:/.test(x.url) || seen.has(sig(x))) { skipped++; continue; }
      const id = uid();
      const w = {
        id, url: x.url, title: x.title || hostOf(x.url), label: x.label || '', selector: x.selector || null, pickedText: null,
        interval: rules.IV.includes(+x.interval) ? +x.interval : 30, cond: x.cond || { type: 'any' }, mode: x.mode === 'tab' ? 'tab' : 'fetch',
        paused: !!x.paused, created: x.created || Date.now(), nextCheck: Date.now() + added * 5000,
        lastText: x.lastText != null ? x.lastText : null, lastNum: x.lastNum != null ? x.lastNum : null, lastChange: x.lastChange || null
      };
      await store.update(KEY, ws => { ws[id] = w; return ws; }, {});
      if (Array.isArray(x.history)) await store.set(HKEY(id), x.history.slice(-HMAX));
      seen.add(sig(x)); added++;
    }
    badge();
    return { added, skipped };
  },
  async export() {
    const ws = await store.get(KEY, {});
    const list = [];
    for (const w of Object.values(ws)) {
      const { id, checkingSince, unread, err, errCount, errDetail, nextCheck, lastCheck, pickedText, ...keep } = w;
      keep.history = await store.get(HKEY(id), []);
      list.push(keep);
    }
    return { app: 'xunshan', v: 1, exported: new Date().toISOString(), watches: list };
  },
  async tick() { await runDue(); return true; }
};
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.target === 'offscreen' || !handlers[msg.type]) return;
  handlers[msg.type](msg).then(reply, e => reply({ err: String(e && e.message || e) }));
  return true;
});
