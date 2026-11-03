/* 巡山僧业务：频率、条件、通知文案、自动认出那块以后默认怎么叫。 */
(function (g) {
  const QS = g.QS = g.QS || {};
  const t = (...a) => QS.t(...a);
  const IV = [1, 5, 15, 30, 60, 180, 360, 1440];
  const DEFAULTS = { defaultInterval: 30, hostGapSec: 3 };
  QS.settings && Object.assign(QS.settings.defaults, DEFAULTS);

  const fmtNum = v => v == null ? '' : (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(+v.toFixed(2)));

  // 内容变了以后，要不要叫人
  function shouldAlert(cond, prev, next) {
    const c = cond || { type: 'any' };
    const has = (s, k) => String(s || '').toLowerCase().includes(String(k || '').toLowerCase());
    switch (c.type) {
      // 只叫好消息：刚越线叫；已经在线上，只有继续往好的方向走（再降 / 再涨）才叫
      case 'below': return next.num != null && c.value != null && next.num < +c.value && (prev.num == null || prev.num >= +c.value || next.num < prev.num);
      case 'above': return next.num != null && c.value != null && next.num > +c.value && (prev.num == null || prev.num <= +c.value || next.num > prev.num);
      case 'drop': return next.num != null && prev.num != null && next.num < prev.num;
      case 'has': return !!c.value && has(next.text, c.value) && !has(prev.text, c.value);
      case 'gone': return !!c.value && !has(next.text, c.value) && has(prev.text, c.value);
      default: return true;
    }
  }
  // 数字那种能选的，文字那种能选的
  const condTypes = numeric => numeric ? ['drop', 'below', 'above', 'any'] : ['any', 'gone', 'has'];
  const needsValue = type => type === 'below' || type === 'above' || type === 'has' || type === 'gone';
  function condLabel(c) {
    if (!c || c.type === 'any') return t('condAny');
    if (c.type === 'drop') return t('condDrop');
    if (c.type === 'below') return t('lblBelow', fmtNum(+c.value));
    if (c.type === 'above') return t('lblAbove', fmtNum(+c.value));
    if (c.type === 'has') return t('lblHas', c.value);
    if (c.type === 'gone') return t('lblGone', c.value);
    return '';
  }
  function alertBody(w, next, added, prev) {
    const c = w.cond || {};
    if (!w.selector && added && (!c.type || c.type === 'any')) return clip(t('notifNew', added));
    if (c.type === 'below' || (c.type === 'drop' && (!prev || prev.num == null))) return t('notifBelow', fmtNum(next.num));
    if (c.type === 'drop') return t('notifDrop', fmtNum(prev.num), fmtNum(next.num));
    if (c.type === 'above') return t('notifAbove', fmtNum(next.num));
    if (c.type === 'has') return t('notifHas', c.value);
    if (c.type === 'gone') return t('notifGone', c.value);
    return clip(next.text);
  }
  const clip = x => { const s = String(x || '').replace(/\s+/g, ' ').trim(); return s.length > 90 ? s.slice(0, 88) + '…' : s; };
  // 「每 30 分钟」「Every 30 min」：整句一个键，英文的 Hourly / Daily 不是拼出来的
  const every = m => t('ev' + m) !== 'ev' + m ? t('ev' + m) : t('ev30').replace(/30/, m);

  // 自动起的名字是「网页标题 · 价格」，存的是当时的语言。换了语言，后半截跟着换；示例整条跟着换。用户自己改过的名字不动
  const KINDS = ['kindPrice', 'kindStock', 'kindSeats', 'kindKnown'];
  function kindWord(s) {
    for (const k of KINDS) for (const L of Object.keys(QS.STR || {})) if (QS.STR[L][k] === s) return t(k);
    return s;
  }
  function labelOf(w) {
    if (!w) return '';
    if (w.demo) return t('demoLabel');
    const s = String(w.label || ''), i = s.lastIndexOf(' · ');
    return i < 0 ? s : s.slice(0, i) + ' · ' + kindWord(s.slice(i + 3));
  }

  // 认出来的那块，人十有八九想怎么叫：价格降了叫；缺货的等它没了叫；名额是 0 的等它有了叫；别的有变就叫
  const OUT = /暂时缺货|缺货|无货|售罄|已售完|已抢光|已满|到货通知|out of stock|sold out|unavailable/i;
  function condFor(kind, text, num) {
    const s = String(text || '');
    const out = s.match(OUT);
    if (out && (kind === 'stock' || kind === 'pick' || kind === 'known')) return { type: 'gone', value: out[0] };
    if (kind === 'price') return { type: 'drop' };
    if (kind === 'seats' && num === 0) return { type: 'above', value: 0 };
    if (kind === 'pick' && num != null && /[¥￥$€£₹]|元|价/.test(s)) return { type: 'drop' };
    return { type: 'any' };
  }

  // 同一网站以前框过 / 认过的几块，新开同站的页面先按它们找（同一网站第二次不用再框）
  function knownFor(ws, url) {
    let h = ''; try { h = new URL(url).host; } catch (e) { return []; }
    const seen = new Set(), out = [];
    for (const w of Object.values(ws || {}).sort((a, b) => (b.created || 0) - (a.created || 0))) {
      if (w.demo || !w.selector) continue;
      let wh = ''; try { wh = new URL(w.url).host; } catch (e) { continue; }
      if (wh !== h || seen.has(w.selector)) continue;
      seen.add(w.selector);
      out.push({ selector: w.selector, alts: w.alts || [], anchor: w.anchor || null, numeric: !!w.numeric, kind: w.kind || 'pick', label: String(w.label || '').split(' · ').pop() });
      if (out.length >= 4) break;
    }
    return out;
  }

  QS.rules = { IV, DEFAULTS, shouldAlert, condLabel, condTypes, needsValue, alertBody, every, fmtNum, condFor, knownFor, kindWord, labelOf };
})(typeof globalThis !== 'undefined' ? globalThis : self);
