/* 千手院通用：文案。每尊罗汉用 QSLib.i18n.add('zh', {...}) 注册自己的字，界面里用 data-t="key" 或 t('key')。
 * 以后加英文：add('en', {...}) 再 setLang('en')。没翻的字自动回落到中文。
 */
(function (g) {
  'use strict';
  const S = {
    zh: {
      'common.lab': '千手院',
      'common.contact': '找方丈',
      'common.email': 'oilsongchengmin@gmail.com',
      'common.home': '千手院总舵',
      'common.homeUrl': 'https://qianshoulab.github.io/'
    }
  };
  let lang = 'zh';
  function add(l, dict) { S[l] = Object.assign(S[l] || {}, dict); }
  function setLang(l) { lang = l; if (g.document) document.documentElement.lang = l === 'zh' ? 'zh-CN' : l; }
  function t(k, vars) {
    let s = (S[lang] && S[lang][k]) ?? S.zh[k] ?? k;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '');
    return s;
  }
  function apply(root) {
    (root || document).querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    (root || document).querySelectorAll('[data-t-title]').forEach(el => { el.title = t(el.dataset.tTitle); });
    (root || document).querySelectorAll('[data-t-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.tAria)); });
    (root || document).querySelectorAll('[data-t-ph]').forEach(el => { el.placeholder = t(el.dataset.tPh); });
  }
  g.QSLib = g.QSLib || {};
  g.QSLib.i18n = { add, setLang, t, apply, get lang() { return lang; } };
})(globalThis);
