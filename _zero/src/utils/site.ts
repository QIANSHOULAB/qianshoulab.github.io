// 全站共用的一小段：EN / 中文、声音开关（只记住开没开；真正出声的是首页 ../home/sound.ts）。
// 第一帧之前的语言、声音状态由 BaseLayout 头上那段内联脚本定好（不闪），这里只管点了以后的事。

const root = document.documentElement;
const LANG_KEY = 'qianshou.lang';          // 跟千手院总舵共用：在这边选了中文，进千手院也是中文
const SOUND_KEY = 'zero.sound';

function syncLang() {
  const l = root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';
  document.querySelectorAll<HTMLButtonElement>('[data-lang-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langSet === l)));
  document.querySelectorAll<HTMLElement>('[data-aria-en]').forEach((el) => {
    const v = el.getAttribute(l === 'zh' ? 'data-aria-zh' : 'data-aria-en');
    if (v) el.setAttribute('aria-label', v);
  });
  const tt = document.querySelector<HTMLMetaElement>(`meta[name="zero:title-${l}"]`);
  if (tt) document.title = tt.content;
}
function setLang(l: 'en' | 'zh') {
  if (root.getAttribute('data-lang') === l) return;
  root.setAttribute('data-lang', l);
  root.lang = l === 'zh' ? 'zh-CN' : 'en';
  try { localStorage.setItem(LANG_KEY, l); } catch { /* 无痕模式 */ }
  syncLang();
  document.dispatchEvent(new CustomEvent('zero:lang', { detail: l }));
}

function syncSound() {
  const on = root.getAttribute('data-sound') === 'on';
  document.querySelectorAll<HTMLButtonElement>('[data-sound-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
}

syncLang();
syncSound();
document.querySelectorAll<HTMLButtonElement>('[data-lang-set]').forEach((b) =>
  b.addEventListener('click', () => setLang(b.dataset.langSet === 'zh' ? 'zh' : 'en')));
document.querySelectorAll<HTMLButtonElement>('[data-sound-toggle]').forEach((b) =>
  b.addEventListener('click', () => {
    const on = root.getAttribute('data-sound') !== 'on';
    root.setAttribute('data-sound', on ? 'on' : 'off');
    try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* 存不了就只管这一页 */ }
    syncSound();
    // 同步派发：首页的声音模块在同一次点击里拿到用户手势，iPhone 上才能出声
    document.dispatchEvent(new CustomEvent('zero:sound', { detail: on }));
  }));
// 手机上栏目条横着滑：当前这一栏滚到看得见的地方
const cur = document.querySelector<HTMLElement>('.hd-nav a[aria-current="page"]');
if (cur && cur.parentElement && cur.closest('ol')) {
  const ol = cur.closest('ol') as HTMLElement;
  if (ol.scrollWidth > ol.clientWidth) ol.scrollLeft = Math.max(0, (cur.parentElement as HTMLElement).offsetLeft - (ol.clientWidth - cur.offsetWidth) / 2);
}
// 从浏览器「后退」回来（整页缓存）时，进门那层白光别还盖着
window.addEventListener('pageshow', (e) => { if (e.persisted) root.classList.remove('from-light'); });
