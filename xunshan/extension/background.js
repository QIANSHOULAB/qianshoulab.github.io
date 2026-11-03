/* 巡山僧后台：定时巡山、取内容、比对、叫人。 */
importScripts('lib/strings.js', 'lib/store.js', 'lib/page.js', 'core/rules.js');
const { store, page, rules, t } = self.QS;
const KEY = 'watches';
const HKEY = id => 'h:' + id;
const HMAX = 40;
const MIN = 60000;
const running = new Map(); // id → 正在进行的检查，重复请求等同一个结果

/* ---------- 闹钟 ---------- */
// 每 30 秒醒一次（Chrome 120 起闹钟最短 30 秒）
async function ensureAlarm() {
  const a = await chrome.alarms.get('tick');
  if (!a || a.periodInMinutes !== 0.5) chrome.alarms.create('tick', { periodInMinutes: 0.5, delayInMinutes: 0.5 });
}
chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); badge(); syncFrameRules(); ensureFrameScript(); });
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); badge(); syncFrameRules(); ensureFrameScript(); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'tick') runDue(); });

const hostOf = u => { try { return new URL(u).host; } catch (e) { return ''; } };
const originPat = u => { try { const x = new URL(u); return x.protocol + '//' + x.hostname + '/*'; } catch (e) { return null; } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 一轮巡山 ----------
   到期的按网站分组：不同网站一起查（最多 4 个），同一网站挨个查、中间隔几秒；同一网址这一轮只抓一次。 */
let roundBusy = false;
async function runDue() {
  if (roundBusy) return;
  roundBusy = true;
  try {
    const [ws, set] = [await store.get(KEY, {}), await QS.settings.all()];
    const now = Date.now();
    const gap = Math.max(1, +set.hostGapSec || 3) * 1000;
    const due = Object.values(ws).filter(w => !w.paused && (w.nextCheck || 0) <= now).sort((a, b) => (a.nextCheck || 0) - (b.nextCheck || 0));
    if (!due.length) return;
    const groups = new Map();
    for (const w of due) { const h = hostOf(w.url); if (!groups.has(h)) groups.set(h, []); groups.get(h).push(w); }
    const cache = new Map();
    const queue = [...groups.values()];
    const worker = async () => {
      for (let list = queue.shift(); list; list = queue.shift()) {
        let last = 0;
        for (const w of list) {
          if (last && !cache.has(w.url)) await sleep(Math.max(0, gap - (Date.now() - last)));
          await check(w.id, cache).catch(e => console.warn('check', e));
          last = Date.now();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  } finally { roundBusy = false; }
}

/* ---------- 看不见的小窗：只对插件自己发起、只对用户加过的网站，去掉「不许被嵌」的响应头 ---------- */
async function syncFrameRules() {
  try {
    const ws = await store.get(KEY, {});
    const hosts = [...new Set(Object.values(ws).filter(w => w.mode === 'frame' || w.mode === 'tab' || w.lastText == null).map(w => { try { return new URL(w.url).hostname; } catch (e) { return null; } }).filter(Boolean))];
    const old = (await chrome.declarativeNetRequest.getSessionRules()).map(r => r.id);
    const rules = hosts.length ? [{
      id: 1, priority: 1,
      action: { type: 'modifyHeaders', responseHeaders: ['x-frame-options', 'content-security-policy', 'content-security-policy-report-only'].map(header => ({ header, operation: 'remove' })) },
      condition: { requestDomains: hosts, resourceTypes: ['sub_frame'], tabIds: [chrome.tabs.TAB_ID_NONE], initiatorDomains: [chrome.runtime.id] }
    }] : [];
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: old, addRules: rules });
  } catch (e) { console.warn('rules', e); }
}
async function ensureFrameScript() {
  try {
    const has = await chrome.scripting.getRegisteredContentScripts({ ids: ['xs-frame'] });
    if (has.length) return;
    await chrome.scripting.registerContentScripts([{ id: 'xs-frame', matches: ['http://*/*', 'https://*/*'], js: ['lib/page.js', 'content/frame.js'], allFrames: true, runAt: 'document_idle', persistAcrossSessions: true }]);
  } catch (e) { console.warn('frame script', e); }
}
syncFrameRules(); ensureFrameScript(); ensureAlarm();

/* ---------- 取内容 ---------- */
async function ensureOffscreen() {
  const has = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (has.length) return;
  try {
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER', 'IFRAME_SCRIPTING'], justification: 'Parse fetched pages and read script-rendered pages the user chose to watch, without opening tabs.' });
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
const specOf = w => ({ selector: w.selector, alts: w.alts || [], anchor: w.anchor || null, numeric: !!w.numeric || /^(below|above)$/.test((w.cond || {}).type) });
async function grab(url) {
  try {
    const res = await fetch(url, { credentials: 'include', cache: 'no-store', redirect: 'follow' });
    return { status: res.status, ok: res.ok, url: res.url, html: decode(await res.arrayBuffer(), res.headers.get('content-type')) };
  } catch (e) { return { err: 'fetch', detail: 'offline' }; }
}
async function viaFetch(w, cache) {
  let p = cache && cache.get(w.url);
  if (!p) { p = grab(w.url); if (cache) cache.set(w.url, p); }
  const res = await p;
  if (res.err) return res;
  const wall = page.detectWall(res.html, res.status);
  if (wall) return { err: wall };
  if (!res.ok) return { err: 'fetch', detail: res.status };
  await ensureOffscreen();
  const r = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'parse', html: res.html, spec: specOf(w) });
  const loginish = /login|signin|sign-in|passport|auth/i.test(res.url) && !/login|signin/i.test(w.url);
  if (r && !r.found && loginish) return { err: 'login' };
  return r || { err: 'fetch', detail: 'parse' };
}
// 要靠脚本渲染的页面：在离屏页里开一个看不见的小窗，等脚本跑完再读。用的是你浏览器自己的登录。
async function viaFrame(w) {
  await syncFrameRules();
  await ensureOffscreen();
  const r = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'render', url: w.url, spec: specOf(w), maxMs: 7000 });
  if (!r) return { err: 'fetch', detail: 'frame' };
  if (r.err) return r;
  if (r.wall) return { err: r.wall };
  if (!r.found && /login|signin|passport|auth/i.test(r.href || '')) return { err: 'login' };
  return r;
}
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

/* ---------- 检查一处 ---------- */
function check(id, cache) {
  if (running.has(id)) return running.get(id);
  const p = doCheck(id, cache).finally(() => running.delete(id));
  running.set(id, p);
  return p;
}
const BROKEN_AFTER = 3; // 连着几回没看成，就发通知说这条坏了
async function doCheck(id, cache) {
  const w = (await store.get(KEY, {}))[id];
  if (!w) return;
  const now0 = Date.now();
  const pat = originPat(w.url);
  if (!(await chrome.permissions.contains({ origins: [pat] }))) return await fail(w, { err: 'perm' });
  let mode = w.mode === 'tab' ? 'frame' : (w.mode || 'fetch');
  let r = mode === 'frame' ? await viaFrame(w) : await viaFetch(w, cache);
  // 头一回：直接抓的结果对不上框选时看到的，就改用看不见的小窗（适配脚本渲染的页面）
  if (w.lastText == null && mode === 'fetch' && (r.err === 'fetch' || !r.found || !r.text || (w.pickedText && norm(r.text) !== norm(w.pickedText)))) {
    const r2 = await viaFrame(w);
    if (!r2.err && r2.found && r2.text) { r = r2; mode = 'frame'; }
  }
  if (r.err || !r.found) return await fail(w, { err: r.err || 'gone', detail: r.detail, mode });
  const now = Date.now();
  const next = { text: r.text, num: page.parseNumber(r.text) };
  const patch = { err: null, errCount: 0, errNotified: false, mode, lastCheck: now, nextCheck: now0 + w.interval * MIN, lastText: next.text, lastNum: next.num };
  if (!w.selector && r.title) patch.title = r.title;
  if (r.moved && r.newSel) patch.selector = r.newSel;
  let hit = false;
  if (w.lastText == null) {
    await pushHist(id, { t: now, text: next.text, num: next.num, first: true });
  } else if (next.text !== w.lastText || r.moved) {
    const changed = next.text !== w.lastText;
    let fresh = [];
    if (!w.selector && changed) fresh = page.newLines(w.lastText, next.text);
    // 整页、有变就叫：只有新增内容才算数，只变了数字、时间的不记不叫
    const noise = !w.selector && (!w.cond || w.cond.type === 'any') && changed && !fresh.length;
    if (!noise) {
      if (changed) {
        hit = !w.selector && (!w.cond || w.cond.type === 'any') ? fresh.length > 0 : rules.shouldAlert(w.cond, { text: w.lastText, num: w.lastNum }, next);
        if (!w.selector) patch.lastNew = fresh.slice(0, 3).join(' · ') || null;
        patch.lastChange = now;
        if (hit) { patch.unread = true; patch.lastHit = now; } else patch.fresh = true;
      }
      await pushHist(id, Object.assign({ t: now, text: next.text, num: next.num, hit }, r.moved ? { moved: true } : {}, fresh.length ? { added: fresh.slice(0, 5) } : {}));
    }
  }
  const saved = await save(id, patch);
  if (hit && saved) notify(saved, next, patch.lastNew);
  if (mode === 'frame' && w.mode !== 'frame') syncFrameRules();
  return saved;
}
async function fail(w, { err, detail, mode }) {
  const now = Date.now();
  const n = (w.errCount || 0) + 1;
  const iv = w.interval * MIN;
  const back = err === 'perm' ? 1 : Math.min(2 ** Math.min(n - 1, 5) * (err === 'blocked' ? 4 : 1), 1440 * MIN / iv); // 出错就退避，被拦更要躲远点，最多一天一次
  const patch = { err, errDetail: detail || null, errCount: n, lastCheck: now, nextCheck: now + iv * Math.max(1, back) };
  if (mode) patch.mode = mode;
  const tell = n >= BROKEN_AFTER && !w.errNotified && !w.paused;
  if (tell) patch.errNotified = true;
  const saved = await save(w.id, patch);
  if (tell && saved) notifyBroken(saved);
  return saved;
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
function notify(w, next, added) {
  chrome.notifications.create('w:' + w.id + ':' + Date.now(), {
    type: 'basic', iconUrl: 'icons/128.png', priority: 2,
    title: t(w.selector ? 'notifTitle' : 'notifTitleNew', w.label || w.title || hostOf(w.url)),
    message: rules.alertBody(w, next, added),
    contextMessage: hostOf(w.url) + ' · ' + t('notifOpen')
  });
}
function notifyBroken(w) {
  chrome.notifications.create('e:' + w.id + ':' + Date.now(), {
    type: 'basic', iconUrl: 'icons/128.png', priority: 1,
    title: t('brokenTitle', w.label || w.title || hostOf(w.url)),
    message: t('broken_' + w.err) !== 'broken_' + w.err ? t('broken_' + w.err) : t('broken_fetch'),
    contextMessage: hostOf(w.url) + ' · ' + t('brokenOpen')
  });
}
async function openWatch(id, nid) {
  const w = (await store.get(KEY, {}))[id];
  if (nid) chrome.notifications.clear(nid);
  if (!w) return;
  await save(id, { unread: false, fresh: false });
  const tab = await chrome.tabs.create({ url: w.url, active: true });
  if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  return tab.id;
}
chrome.notifications.onClicked.addListener(nid => {
  const [kind, id] = nid.split(':');
  if (kind === 'e') { chrome.notifications.clear(nid); chrome.tabs.create({ url: chrome.runtime.getURL('app.html#' + id) }); return; }
  openWatch(id, nid);
});
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
      alts: Array.isArray(watch.alts) ? watch.alts.slice(0, 6) : [], anchor: watch.anchor || null,
      numeric: !!watch.selector && page.parseNumber(watch.pickedText) != null, // 框的时候是数字（价格、名额），找的时候就认数字
      interval: watch.interval || set.defaultInterval, cond: watch.cond || { type: 'any' },
      mode: 'fetch', paused: false, created: Date.now(), nextCheck: Date.now(), lastText: null
    });
    await store.update(KEY, ws => { ws[id] = w; return ws; }, {});
    const done = await check(id);
    return done || w;
  },
  async checkNow({ id }) { await save(id, { checkingSince: Date.now() }); const r = await check(id); await save(id, { checkingSince: null }); return r; },
  async patch({ id, patch }) {
    const allow = ['label', 'interval', 'cond', 'paused', 'unread', 'fresh'];
    const p = {}; for (const k of allow) if (k in patch) p[k] = patch[k];
    if ('interval' in p || p.paused === false) {
      const w = (await store.get(KEY, {}))[id];
      if (w) p.nextCheck = (w.lastCheck || Date.now()) + (p.interval || w.interval) * MIN;
    }
    return save(id, p);
  },
  async remove({ id }) { await store.update(KEY, ws => { delete ws[id]; return ws; }, {}); await store.remove(HKEY(id)); badge(); return true; },
  async markAllRead() { await store.update(KEY, ws => { for (const w of Object.values(ws)) { w.unread = false; w.fresh = false; } return ws; }, {}); badge(); return true; },
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
        numeric: !!x.numeric, alts: Array.isArray(x.alts) ? x.alts.slice(0, 6) : [],
        anchor: x.anchor && typeof x.anchor === 'object' ? { shape: String(x.anchor.shape || ''), before: String(x.anchor.before || '') } : null,
        interval: rules.IV.includes(+x.interval) ? +x.interval : 30, cond: x.cond || { type: 'any' }, mode: x.mode === 'tab' || x.mode === 'frame' ? 'frame' : 'fetch',
        paused: !!x.paused, created: x.created || Date.now(), nextCheck: Date.now() + added * 5000,
        lastText: x.lastText != null ? x.lastText : null, lastNum: x.lastNum != null ? x.lastNum : null, lastChange: x.lastChange || null
      };
      await store.update(KEY, ws => { ws[id] = w; return ws; }, {});
      if (Array.isArray(x.history)) await store.set(HKEY(id), x.history.slice(-HMAX));
      seen.add(sig(x)); added++;
    }
    badge(); syncFrameRules();
    return { added, skipped };
  },
  async export() {
    const ws = await store.get(KEY, {});
    const list = [];
    for (const w of Object.values(ws)) {
      const { id, checkingSince, unread, fresh, err, errCount, errDetail, errNotified, nextCheck, lastCheck, pickedText, ...keep } = w;
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
