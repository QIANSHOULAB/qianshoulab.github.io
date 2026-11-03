/* 巡山僧后台：定时巡山、取内容、比对、叫人。 */
importScripts('lib/strings.js', 'lib/store.js', 'lib/page.js', 'core/rules.js');
const { store, page, rules, t } = self.QS;
const KEY = 'watches';
const HKEY = id => 'h:' + id;
const HMAX = 40;
const MIN = 60000;
const SKEY = id => 'shot:' + id;
const SHOT_KEEP = 12;          // 每条最多留几张照（开盯那张一直留着）
const SHOT_BUDGET = 4e6;       // 全部照片加起来的上限（字节），超了从最旧的删
const BATCH_WIN = 90 * 1000;   // 同一网站到期时间差不到这么多的，并成一批
const running = new Map(); // id → 正在进行的检查，重复请求等同一个结果

/* ---------- 闹钟 ---------- */
// 每 30 秒醒一次（Chrome 120 起闹钟最短 30 秒）
async function ensureAlarm() {
  const a = await chrome.alarms.get('tick');
  if (!a || a.periodInMinutes !== 0.5) chrome.alarms.create('tick', { periodInMinutes: 0.5, delayInMinutes: 0.5 });
}
chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); badge(); syncFrameRules(); ensureFrameScript(); });
// 工具栏图标的提示字跟右上角选的语言走（manifest 里那个跟浏览器语言走，这里盖掉）
const actionTitle = () => chrome.action.setTitle({ title: t('appFull') }).catch(() => {});
QS.langReady.then(actionTitle); QS.onLang(actionTitle);
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); badge(); syncFrameRules(); ensureFrameScript(); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'tick') runDue(); });

const hostOf = u => { try { return new URL(u).host; } catch (e) { return ''; } };
const originPat = u => { try { const x = new URL(u); return x.protocol + '//' + x.hostname + '/*'; } catch (e) { return null; } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 一轮巡山 ----------
   到期的按网站分组：不同网站一起查（最多 4 个），同一网站挨个查、中间隔几秒；同一网址这一轮只抓一次（小窗也只开一个）。
   临近到期提前抓：同一网站到期时间相近的并成一批，提前「排队要花的时间」开工，让最后一条也在它到期那一刻查完。
   不等 30 秒一跳的闹钟：算好下一批开工的时刻，掐着点醒。 */
let roundBusy = false, again = false, wakeTimer = null;
// 一个网站这一批：到期最早那条 + 跟它差不到 BATCH_WIN（且不超过各自间隔四分之一）的；开工时刻 = 最早到期 − 排队时间
function planHost(list, gap, now) {
  const first = list[0];
  const ref = Math.max(first.nextCheck || 0, now); // 已经过点的全算进这一批
  const batch = list.filter(w => (w.nextCheck || 0) <= ref + Math.min(BATCH_WIN, w.interval * MIN / 4));
  const fetches = new Set(batch.map(w => w.url)).size;
  const lead = Math.min(gap * (fetches - 1), first.interval * MIN / 4);
  return { batch, start: (first.nextCheck || 0) - lead };
}
function plan(ws, gap, now = Date.now()) {
  const groups = new Map();
  for (const w of Object.values(ws)) {
    if (w.paused) continue;
    const h = hostOf(w.url);
    if (!groups.has(h)) groups.set(h, []);
    groups.get(h).push(w);
  }
  return [...groups.values()].map(list => planHost(list.sort((a, b) => (a.nextCheck || 0) - (b.nextCheck || 0)), gap, now));
}
function wakeAt(t) {
  clearTimeout(wakeTimer); wakeTimer = null;
  const d = t - Date.now();
  if (d < 45000) wakeTimer = setTimeout(runDue, Math.max(0, d) + 50); // 远的交给闹钟；近的掐着点
}
async function runDue() {
  if (roundBusy) { again = true; return; }
  roundBusy = true; again = false;
  let gap = 3000;
  try {
    const set = await QS.settings.all();
    gap = Math.max(1, +set.hostGapSec || 3) * 1000;
    const now = Date.now();
    const plans = plan(await store.get(KEY, {}), gap, now).filter(p => p.start <= now);
    if (!plans.length) return;
    const cache = new Map();
    // 小窗模式：同一网址这一轮要读的几条，交给同一个小窗一次读齐
    for (const p of plans) for (const w of p.batch) if (w.mode === 'frame' || w.mode === 'tab') {
      const k = 'F:' + w.url;
      if (!cache.has(k)) cache.set(k, { items: [] });
      cache.get(k).items.push(frameItem(w));
    }
    const queue = plans.map(p => p.batch);
    const shared = w => cache.has('U:' + w.url) || !!(cache.get('F:' + w.url) || {}).p;
    const worker = async () => {
      for (let list = queue.shift(); list; list = queue.shift()) {
        let last = 0;
        for (const w of list) {
          if (last && !shared(w)) await sleep(Math.max(0, gap - (Date.now() - last)));
          await check(w.id, cache).catch(e => console.warn('check', e));
          last = Date.now();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  } finally {
    roundBusy = false;
    if (again) runDue();
    else {
      const ps = plan(await store.get(KEY, {}), gap);
      if (ps.length) wakeAt(Math.min(...ps.map(p => p.start)));
    }
  }
}

/* ---------- 看不见的小窗：只对插件自己发起、只对用户加过的网站，去掉「不许被嵌」的响应头 ---------- */
async function syncFrameRules(extra) {
  try {
    const ws = await store.get(KEY, {});
    // 小窗要读、要拍照的网站：就是盯梢里的这些网站
    const hosts = [...new Set(Object.values(ws).map(w => w.url).concat(extra || []).map(u => { try { return new URL(u).hostname; } catch (e) { return null; } }).filter(Boolean))];
    const old = (await chrome.declarativeNetRequest.getSessionRules()).map(r => r.id);
    const rules = hosts.length ? [{
      id: 1, priority: 1,
      action: { type: 'modifyHeaders', responseHeaders: ['x-frame-options', 'content-security-policy', 'content-security-policy-report-only'].map(header => ({ header, operation: 'remove' })) },
      condition: { requestDomains: hosts, resourceTypes: ['sub_frame'], tabIds: [chrome.tabs.TAB_ID_NONE], initiatorDomains: [chrome.runtime.id] }
    }] : [];
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: old, addRules: rules });
  } catch (e) { console.warn('rules', e); }
}
let frameScriptP = null;
function ensureFrameScript() { return frameScriptP || (frameScriptP = registerFrameScript().finally(() => { frameScriptP = null; })); }
async function registerFrameScript() {
  try {
    const js = ['lib/page.js', 'lib/detect.js', 'lib/shot.js', 'content/frame.js'];
    const has = await chrome.scripting.getRegisteredContentScripts({ ids: ['xs-frame'] });
    if (has.length && JSON.stringify(has[0].js) === JSON.stringify(js)) return;
    if (has.length) await chrome.scripting.unregisterContentScripts({ ids: ['xs-frame'] });
    await chrome.scripting.registerContentScripts([{ id: 'xs-frame', matches: ['http://*/*', 'https://*/*'], js, allFrames: true, runAt: 'document_idle', persistAcrossSessions: true }]);
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
  if (r) Object.defineProperty(r, 'html', { value: res.html, enumerable: false }); // 留着给拍照用
  const loginish = /login|signin|sign-in|passport|auth/i.test(res.url) && !/login|signin/i.test(w.url);
  if (r && !r.found && loginish) return { err: 'login' };
  return r || { err: 'fetch', detail: 'parse' };
}
// 要靠脚本渲染的页面：在离屏页里开一个看不见的小窗，等脚本跑完再读。用的是你浏览器自己的登录。
// 同一网址这一轮有几条，就一个小窗一次读齐；字变了的顺手拍照。
const frameItem = (w, snap) => ({ k: w.id, spec: specOf(w), snap: snap || true, prev: w.lastText, lines: !w.selector && (!w.cond || w.cond.type === 'any') });
async function render(url, items) {
  await syncFrameRules([url]);
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'render', url, items, maxMs: 7000 });
}
async function viaFrame(w, cache) {
  let ent = cache && cache.get('F:' + w.url);
  if (!ent || !ent.items.some(i => i.k === w.id)) ent = { items: [frameItem(w)] };
  if (!ent.p) ent.p = render(w.url, ent.items).catch(() => null);
  const R = await ent.p;
  if (!R) return { err: 'fetch', detail: 'frame' };
  if (R.err) return R;
  if (R.wall) return { err: R.wall };
  const r = R.parts && R.parts[w.id];
  if (!r) return { err: 'fetch', detail: 'frame' };
  if (!r.found && /login|signin|passport|auth/i.test(R.href || '')) return { err: 'login' };
  return Object.assign({ title: R.title }, r);
}

/* ---------- 截图：变了、叫了的那一刻，拍下所盯的那块，存在本机 ---------- */
let snapChain = Promise.resolve();
// 直接抓的那种：拿抓回来的同一份 HTML 在离屏页里排出来拍；排着队一张张来，不跟巡山抢
function snapLater(w, t, html) {
  snapChain = snapChain.then(async () => {
    await ensureOffscreen();
    const shot = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'snapHtml', html, url: w.url, spec: specOf(w) }).catch(() => null);
    if (shot) await saveShot(w.id, t, shot);
  }).catch(e => console.warn('snap', e));
  return snapChain;
}
async function saveShot(id, t, shot) {
  if (!shot || !shot.src) return;
  const ws = await store.get(KEY, {});
  if (!ws[id]) return;
  await store.update(SKEY(id), m => {
    m[t] = shot;
    const ts = Object.keys(m).map(Number).sort((a, b) => a - b);
    for (const x of ts.slice(1, Math.max(1, ts.length - (SHOT_KEEP - 1)))) delete m[x]; // 留开盯那张 + 最近几张
    return m;
  }, {});
  await trimShots(Object.keys(ws));
}
// 全部照片超了上限，从最旧的删（每条最新那张留着）
async function trimShots(ids) {
  const keys = ids.map(SKEY);
  let used = await chrome.storage.local.getBytesInUse(keys);
  if (used <= SHOT_BUDGET) return;
  const all = await chrome.storage.local.get(keys);
  const list = [];
  for (const k of Object.keys(all)) {
    const ts = Object.keys(all[k]).map(Number).sort((a, b) => a - b);
    for (const t of ts.slice(0, -1)) list.push({ k, t, n: JSON.stringify(all[k][t]).length });
  }
  list.sort((a, b) => a.t - b.t);
  const touched = new Set();
  for (const x of list) {
    if (used <= SHOT_BUDGET * 0.9) break;
    delete all[x.k][x.t]; used -= x.n; touched.add(x.k);
  }
  for (const k of touched) await store.update(k, () => all[k], {});
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
  if (!w || w.demo) return w;
  const now0 = Date.now();
  const pat = originPat(w.url);
  if (!(await chrome.permissions.contains({ origins: [pat] }))) return await fail(w, { err: 'perm' });
  let mode = w.mode === 'tab' ? 'frame' : (w.mode || 'fetch');
  let r = mode === 'frame' ? await viaFrame(w, cache) : await viaFetch(w, cache);
  // 头一回：直接抓的结果对不上框选时看到的，就改用看不见的小窗（适配脚本渲染的页面）
  if (w.lastText == null && mode === 'fetch' && (r.err === 'fetch' || !r.found || !r.text || (w.pickedText && norm(r.text) !== norm(w.pickedText)))) {
    const r2 = await viaFrame(w);
    if (!r2.err && r2.found && r2.text) { r = r2; mode = 'frame'; }
  }
  if (r.err || !r.found) return await fail(w, { err: r.err || 'gone', detail: r.detail, mode });
  const now = Date.now();
  const next = { text: r.text, num: page.parseNumber(r.text) };
  // 闹钟对齐：下次 = 这次该查的时刻 + 间隔，不按实际开查时刻算，就不会一轮轮往后漂；提前抓的也不改节奏
  const iv = w.interval * MIN, due = w.nextCheck || now0;
  const base = due > now0 - iv && due <= now0 + iv / 2 ? due : now0;
  const patch = { err: null, errCount: 0, errNotified: false, mode, lastCheck: now, nextCheck: base + iv, lastText: next.text, lastNum: next.num };
  if (!w.selector && r.title) patch.title = r.title;
  if (r.moved && r.newSel) patch.selector = r.newSel;
  let hit = false, logged = false;
  if (w.lastText == null) {
    await pushHist(id, { t: now, text: next.text, num: next.num, first: true });
    logged = true;
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
      logged = true;
    }
  }
  const saved = await save(id, patch);
  if (hit && saved) notify(saved, next, patch.lastNew, { text: w.lastText, num: w.lastNum });
  // 记了一笔就配一张照：小窗读的时候已经拍了；直接抓的另排队拍
  if (logged && saved) { if (r.shot) await saveShot(id, now, r.shot); else if (mode === 'fetch' && r.html) snapLater(saved, now, r.html); }
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

/* ---------- 叫人 ----------
   通知用右上角选的语言（默认英文）；后台刚醒时先等读到语言再发 */
async function notify(w, next, added, prev) {
  await QS.langReady;
  chrome.notifications.create('w:' + w.id + ':' + Date.now(), {
    type: 'basic', iconUrl: 'icons/128.png', priority: 2,
    title: t(w.selector ? 'notifTitle' : 'notifTitleNew', rules.labelOf(w) || w.title || hostOf(w.url)),
    message: rules.alertBody(w, next, added, prev),
    contextMessage: hostOf(w.url) + ' · ' + t('notifOpen')
  });
}
async function notifyBroken(w) {
  await QS.langReady;
  chrome.notifications.create('e:' + w.id + ':' + Date.now(), {
    type: 'basic', iconUrl: 'icons/128.png', priority: 1,
    title: t('brokenTitle', rules.labelOf(w) || w.title || hostOf(w.url)),
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
// 放行了某个网站：等着权限的那几条马上去看第一眼
chrome.permissions.onAdded.addListener(async p => {
  const ok = new Set(p.origins || []);
  for (const w of Object.values(await store.get(KEY, {}))) if (w.lastText == null && (w.err === 'perm' || !w.err) && ok.has(originPat(w.url))) check(w.id);
});
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
  // 加一处。没给条件就按认出来的是啥定默认（价格降了叫、缺货等它没了叫……）；频率跟上回选的一样
  async add({ watch, wait, hold }) {
    const set = await QS.settings.all();
    const id = uid();
    const kind = watch.kind || (watch.selector ? 'pick' : 'page');
    const w = Object.assign({
      id, url: watch.url, title: watch.title || hostOf(watch.url), label: watch.label || '', kind,
      selector: watch.selector || null, pickedText: watch.pickedText || null,
      alts: Array.isArray(watch.alts) ? watch.alts.slice(0, 6) : [], anchor: watch.anchor || null,
      numeric: !!watch.selector && page.parseNumber(watch.pickedText) != null, // 框的时候是数字（价格、名额），找的时候就认数字
      interval: watch.interval || set.defaultInterval,
      cond: watch.cond || (watch.selector ? rules.condFor(kind, watch.pickedText, page.parseNumber(watch.pickedText)) : { type: 'any' }),
      mode: 'fetch', paused: false, created: Date.now(), nextCheck: Date.now() + (hold ? 60000 : 0), lastText: null
    });
    await store.update(KEY, ws => { ws[id] = w; return ws; }, {});
    if (hold) return w; // 还在等人点「允许」：放行了再看（permissions.onAdded）
    if (wait === false) { check(id); return w; }
    const done = await check(id);
    return done || w;
  },
  // 一次加一串网址：每个网址抓回来自己认价格、库存（同一网站以前盯过的那块优先），认不出的盯整页
  async addMany({ urls, below }) {
    const out = [];
    const lim = page.parseNumber(below);
    for (const url of urls) {
      const ws = await store.get(KEY, {});
      const known = rules.knownFor(ws, url);
      let cands = [], title = '';
      const res = await grab(url);
      if (!res.err && res.ok && !page.detectWall(res.html, res.status)) {
        await ensureOffscreen();
        const r = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'detect', html: res.html, known }).catch(() => null);
        if (r) { cands = r.cands || []; title = r.title || ''; }
      }
      if (!cands.length) {
        // 靠脚本出字的页面：在看不见的小窗里认
        const R = await render(url, [{ k: 'd', detect: true, known, spec: {} }]).catch(() => null);
        const p = R && R.parts && R.parts.d;
        if (p && p.cands) { cands = p.cands; title = R.title || title; }
      }
      const c = cands.find(x => x.kind === 'price' && lim != null) || cands[0];
      const kindName = k => ({ price: t('kindPrice'), stock: t('kindStock'), seats: t('kindSeats') }[k] || '');
      const base = (title || hostOf(url)).replace(/\s+/g, ' ').trim().slice(0, 50);
      const watch = c ? {
        url, title, kind: c.kind === 'known' ? 'pick' : c.kind, label: kindName(c.kind) ? base + ' · ' + kindName(c.kind) : (c.label || base),
        selector: c.selector, alts: c.alts, anchor: c.anchor, pickedText: c.text,
        cond: c.kind === 'price' && lim != null ? { type: 'below', value: lim } : undefined
      } : { url, title, selector: null, label: base };
      const w = await handlers.add({ watch, wait: false });
      out.push({ url, id: w.id, kind: c ? c.kind : 'page', text: c ? c.text : '' });
    }
    syncFrameRules();
    return { added: out };
  },
  // 示例：一条已经降了价的盯梢，一点就看到结果长啥样。不会真去看
  async demo() {
    const ws = await store.get(KEY, {});
    const old = Object.values(ws).find(w => w.demo);
    if (old) return old;
    const id = uid(), now = Date.now();
    const w = {
      id, demo: true, url: 'https://qianshoulab.github.io/xunshan/', title: t('demoLabel'), label: t('demoLabel'), kind: 'price',
      selector: '.price', alts: [], anchor: null, numeric: true, interval: 30, cond: { type: 'below', value: 1000 },
      mode: 'fetch', paused: true, created: now - 3 * 3600e3, lastCheck: now - 60e3, lastText: '¥899.00', lastNum: 899,
      lastChange: now - 60e3, lastHit: now - 60e3, unread: true
    };
    await store.update(KEY, x => { x[id] = w; return x; }, {});
    await store.set(HKEY(id), [
      { t: now - 3 * 3600e3, text: '¥1,299.00', num: 1299, first: true },
      { t: now - 2 * 3600e3, text: '¥1,099.00', num: 1099, hit: false },
      { t: now - 60e3, text: '¥899.00', num: 899, hit: true }
    ]);
    badge();
    notify(w, { text: w.lastText, num: 899 }, null, { num: 1099 });
    return w;
  },
  async checkNow({ id }) { await save(id, { checkingSince: Date.now() }); const r = await check(id); await save(id, { checkingSince: null }); return r; },
  async patch({ id, patch }) {
    const allow = ['label', 'interval', 'cond', 'paused', 'unread', 'fresh'];
    const p = {}; for (const k of allow) if (k in patch) p[k] = patch[k];
    if ('interval' in p || p.paused === false) {
      const w = (await store.get(KEY, {}))[id];
      if (w) p.nextCheck = (w.lastCheck || Date.now()) + (p.interval || w.interval) * MIN;
    }
    if ('interval' in p) await QS.settings.set({ defaultInterval: p.interval }); // 记住：下回新加的也这么勤
    return save(id, p);
  },
  // 删：把删掉的整条（含记录、照片）交回去，界面上点「撤销」原样放回来
  async remove({ id }) {
    let gone = null;
    await store.update(KEY, ws => { gone = ws[id] || null; delete ws[id]; return ws; }, {});
    const keep = await store.getMany([HKEY(id), SKEY(id)]);
    await store.remove([HKEY(id), SKEY(id)]); badge(); syncFrameRules();
    return gone ? { w: gone, h: keep[HKEY(id)] || [], s: keep[SKEY(id)] || null } : true;
  },
  async restore({ snap }) {
    if (!snap || !snap.w || !snap.w.id) return false;
    const id = snap.w.id;
    await store.update(KEY, ws => { ws[id] = snap.w; return ws; }, {});
    await store.set(HKEY(id), snap.h || []);
    if (snap.s) await store.set(SKEY(id), snap.s);
    badge(); syncFrameRules();
    return true;
  },
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
        id, url: x.url, title: x.title || hostOf(x.url), label: x.label || '', kind: x.kind || (x.selector ? 'pick' : 'page'), selector: x.selector || null, pickedText: null,
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
      if (w.demo) continue;
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
