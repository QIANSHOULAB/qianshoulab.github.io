/* 巡山僧业务：频率、条件、通知文案。 */
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
      case 'has': return !!c.value && has(next.text, c.value) && !has(prev.text, c.value);
      case 'gone': return !!c.value && !has(next.text, c.value) && has(prev.text, c.value);
      default: return true;
    }
  }
  function condLabel(c) {
    if (!c || c.type === 'any') return t('condAny');
    if (c.type === 'below') return t('condBelow') + ' ' + fmtNum(+c.value);
    if (c.type === 'above') return t('condAbove') + ' ' + fmtNum(+c.value);
    if (c.type === 'has') return t('condHas') + '「' + c.value + '」';
    if (c.type === 'gone') return '「' + c.value + '」' + t('condGone');
    return '';
  }
  function alertBody(w, next, added) {
    const c = w.cond || {};
    if (!w.selector && added && (!c.type || c.type === 'any')) return clip(t('notifNew', added));
    if (c.type === 'below') return t('notifBelow', fmtNum(next.num));
    if (c.type === 'above') return t('notifAbove', fmtNum(next.num));
    if (c.type === 'has') return t('notifHas', c.value);
    if (c.type === 'gone') return t('notifGone', c.value);
    return clip(next.text);
  }
  const clip = x => { const s = String(x || '').replace(/\s+/g, ' ').trim(); return s.length > 90 ? s.slice(0, 88) + '…' : s; };
  const ivLabel = m => t('iv' + m) !== 'iv' + m ? t('iv' + m) : m + ' min';

  QS.rules = { IV, DEFAULTS, shouldAlert, condLabel, alertBody, ivLabel, fmtNum };
})(typeof globalThis !== 'undefined' ? globalThis : self);
