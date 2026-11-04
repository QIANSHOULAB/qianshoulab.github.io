/* 千手院通用：文案。每尊罗汉用 QSLib.i18n.add('en', {...}) / add('zh', {...}) 注册自己的字，界面里用 data-t="key" 或 t('key')。
 * 默认英文，第二语言中文（Song 11-03 22:19）：不跟浏览器语言走，右上角 EN / 中文 切换，选过记住（记在哪由各尊自己定）。
 * 没写的字先回落英文、再回落中文。
 *   t('k', {n: 3})              {n} 换成值
 *   '{n} {n:row|rows}'          n 是 1 用前一个，否则用后一个（英文单复数）
 *   data-t / data-th（innerHTML，只放自己写的字）/ data-t-title / data-t-aria / data-t-ph / data-t-alt / data-t-content
 */
(function (g) {
  'use strict';
  const S = {
    en: {
      'common.lab': 'QIANSHOU LAB',
      'common.contact': 'Email the abbot',
      'common.email': 'oilsongchengmin@gmail.com',
      'common.home': 'More tools at QIANSHOU LAB',
      'common.homeUrl': 'https://qianshoulab.github.io/',
      'common.lang': 'Language',
      'common.colN': 'Column {n}',
      'common.pasted': 'Pasted table'
    },
    zh: {
      'common.lab': '千手院',
      'common.contact': '找方丈',
      'common.email': 'oilsongchengmin@gmail.com',
      'common.home': '千手院总舵',
      'common.homeUrl': 'https://qianshoulab.github.io/',
      'common.lang': '语言',
      'common.colN': '列{n}',
      'common.pasted': '粘贴的表格'
    }
  };
  const LANGS = [{ code: 'en', label: 'EN', html: 'en' }, { code: 'zh', label: '中文', html: 'zh-CN' }];
  let lang = 'en';
  function add(l, dict) { S[l] = Object.assign(S[l] || {}, dict); }
  function norm(l) { return l === 'zh' || l === 'en' ? l : 'en'; }
  function setLang(l) { lang = norm(l); if (g.document) document.documentElement.lang = LANGS.find(x => x.code === lang).html; }
  function has(k) { return !!((S[lang] && k in S[lang]) || k in S.en || k in S.zh); }
  function t(k, vars) {
    let s = (S[lang] && S[lang][k]) ?? S.en[k] ?? S.zh[k] ?? k;
    if (vars) {
      s = s.replace(/\{(\w+):([^|{}]*)\|([^{}]*)\}/g, (_, n, one, many) => (+vars[n] === 1 ? one : many));
      s = s.replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '');
    }
    return s;
  }
  function apply(root, vars) { // vars：页面上共用的值（比如版本号 {v}）
    const R = root || document, T = k => t(k, vars);
    R.querySelectorAll('[data-t]').forEach(el => { el.textContent = T(el.dataset.t); });
    R.querySelectorAll('[data-th]').forEach(el => { el.innerHTML = T(el.dataset.th); });
    R.querySelectorAll('[data-t-title]').forEach(el => { el.title = T(el.dataset.tTitle); });
    R.querySelectorAll('[data-t-aria]').forEach(el => { el.setAttribute('aria-label', T(el.dataset.tAria)); });
    R.querySelectorAll('[data-t-ph]').forEach(el => { el.placeholder = T(el.dataset.tPh); });
    R.querySelectorAll('[data-t-alt]').forEach(el => { el.alt = T(el.dataset.tAlt); });
    R.querySelectorAll('[data-t-content]').forEach(el => { el.content = T(el.dataset.tContent); });
  }
  /* 右上角 EN / 中文：画一个两格的分段控件，点了回调 onPick(code) */
  function toggle(box, onPick) {
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', t('common.lang'));
    box.innerHTML = LANGS.map(x => `<button type="button" data-l="${x.code}" lang="${x.html}" aria-pressed="${x.code === lang}">${x.label}</button>`).join('');
    if (!box.__qsBound) { box.__qsBound = 1; box.addEventListener('click', e => { const b = e.target.closest('button[data-l]'); if (b && b.dataset.l !== lang) onPick(b.dataset.l); }); }
  }
  g.QSLib = g.QSLib || {};
  g.QSLib.i18n = { add, setLang, t, has, apply, toggle, norm, LANGS, get lang() { return lang; } };
})(globalThis);
