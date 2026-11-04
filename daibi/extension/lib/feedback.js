/* lib/feedback.js — 千手院插件通用：「提意见」。化缘僧、巡山僧、代笔僧同一份，改了三处一起改。
 * 拼一个填好的 mailto：收件人、标题、正文都有，正文最后一行自动带版本和设备（系统、浏览器，简写，比如「0.4.1 · Windows 11 · Chrome 130」），人不用自己打。
 * 不接第三方表单，不收任何数据，不要新权限：插件页里用 <a target="_blank">（浏览器自己交给默认邮件程序），介绍页直接 href。
 *   QSFeedback.href({ subject, body, version })   → 'mailto:…'（标题、正文 encodeURIComponent；换行照 RFC 6068 写 CRLF）
 *   QSFeedback.wire(a, () => ({ subject, body, version }))   接上一个 <a>：先填一次，设备细查完再填，按下 / 聚焦 / 点的那一下照当时的语言再填
 *   QSFeedback.device()   → 'Windows 11 · Chrome 130'
 */
(function (g) {
  'use strict';
  const TO = ['oilsongchengmin', 'gmail.com'].join('@');   // 拼起来写，少招点爬邮箱的
  const nav = g.navigator || {};

  // 先拿 UA 字符串猜（Firefox、Safari 只有这个）。Windows 10 和 11 的 UA 一模一样，这一步只写 Windows
  const OS_UA = [[/Windows/, 'Windows'], [/iPhone|iPad|iPod/, 'iOS'], [/Android/, 'Android'], [/CrOS/, 'ChromeOS'], [/Mac OS X|Macintosh/, 'macOS'], [/Linux/, 'Linux']];
  const BR_UA = [[/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'], [/OPR\/(\d+)/, 'Opera'], [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'], [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'], [/Version\/(\d+)[\d.]*(?: Mobile\/\S+)? Safari\//, 'Safari']];
  function fromUA(u) {
    const os = (OS_UA.find(([re]) => re.test(u)) || [null, ''])[1];
    let br = '';
    for (const [re, name] of BR_UA) { const m = u.match(re); if (m) { br = name + ' ' + m[1]; break; } }
    return { os, br };
  }
  const dev = fromUA(nav.userAgent || '');

  // Chrome / Edge 有 userAgentData：牌子认得准（Brave、Opera 不冒充 Chrome），再细查一次系统版本（Windows 11 / 10、macOS 14）
  const BRANDS = [['Microsoft Edge', 'Edge'], ['Opera', 'Opera'], ['Brave', 'Brave'], ['Vivaldi', 'Vivaldi'], ['YaBrowser', 'Yandex'], ['Google Chrome', 'Chrome'], ['Chromium', 'Chromium']];
  const uad = nav.userAgentData;
  if (uad) {
    const hit = BRANDS.map(([k, name]) => [name, (uad.brands || []).find((b) => b.brand === k)]).find((x) => x[1]);
    if (hit) dev.br = hit[0] + ' ' + hit[1].version;
    if (uad.platform) dev.os = uad.platform === 'Chrome OS' ? 'ChromeOS' : uad.platform;
  }
  const ready = !(uad && uad.getHighEntropyValues) ? Promise.resolve() : uad.getHighEntropyValues(['platformVersion']).then((h) => {
    const major = parseInt(h.platformVersion, 10);
    if (dev.os === 'Windows') dev.os = major >= 13 ? 'Windows 11' : major > 0 ? 'Windows 10' : 'Windows';
    else if ((dev.os === 'macOS' || dev.os === 'Android') && major > 0) dev.os += ' ' + major;
  }, () => {});

  const device = () => [dev.os, dev.br].filter(Boolean).join(' · ');
  // 正文：三行空着的提示照原样，空两行，「——」下面一行是版本 · 系统 · 浏览器
  const body = (text, version) => String(text || '').replace(/\r?\n/g, '\r\n') + '\r\n\r\n\r\n——\r\n' + [version, dev.os, dev.br].filter(Boolean).join(' · ');
  const href = (o) => 'mailto:' + TO + '?subject=' + encodeURIComponent(o.subject) + '&body=' + encodeURIComponent(body(o.body, o.version));
  function wire(a, get) {
    const set = () => { try { a.href = href(get()); } catch (e) {} };
    set(); ready.then(set);
    ['pointerdown', 'focus', 'click'].forEach((ev) => a.addEventListener(ev, set));
    return set;
  }
  g.QSFeedback = { to: TO, device, body, href, wire, ready };
})(typeof globalThis !== 'undefined' ? globalThis : self);
