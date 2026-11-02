/* 巡山僧弹窗：当前页一键框选/盯整页 + 最近的盯梢。 */
const { t, ui, store, rules } = QS;
const $ = s => document.querySelector(s);
QS.applyT();
$('#pick').innerHTML = ui.ICON.crop + '<span>' + t('pickPart') + '</span>';
$('#whole').innerHTML = ui.ICON.page + '<span>' + t('watchPage') + '</span>';

const qp = new URLSearchParams(location.search);
let tab = null;
const okUrl = u => /^https?:\/\//.test(u || '') && !/^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com|microsoftedge\.microsoft\.com\/addons)/.test(u);
const originPat = u => { const x = new URL(u); return x.protocol + '//' + x.hostname + '/*'; };

async function getTab() {
  if (qp.get('tab')) return chrome.tabs.get(+qp.get('tab'));
  const [x] = await chrome.tabs.query({ active: true, currentWindow: true });
  return x;
}

function statusOf(w) {
  if (w.paused) return `<span class="pill off">${t('paused')}</span>`;
  if (w.err) return `<span class="pill err">${t('error')}</span>`;
  if (w.unread) return `<span class="pill hit">${t('changed')}</span>`;
  return '';
}
function valueOf(w) {
  if (w.lastText == null) return t('waitingFirst');
  if (w.selector && w.lastNum != null && String(w.lastText).length < 60) return `<span class="num">${ui.esc(w.lastText.replace(/\s+/g, ' '))}</span>`;
  return ui.esc(String(w.lastText).replace(/\s+/g, ' ').slice(0, 80));
}

async function render() {
  const ws = Object.values(await store.get('watches', {}));
  $('#allN').textContent = ws.length || '';
  ws.sort((a, b) => (b.unread - a.unread) || ((b.lastChange || b.created) - (a.lastChange || a.created)));
  const shown = ws.slice(0, 6);
  $('#list').innerHTML = shown.map(w => `
    <button class="it" data-id="${w.id}">
      ${ui.avatar(w.url)}
      <div class="it-m"><div class="it-t">${ui.esc(w.label || w.title || ui.host(w.url))}</div><div class="it-s">${valueOf(w)}</div></div>
      <div class="it-r">${statusOf(w)}<span>${ui.ago(w.lastChange || w.lastCheck)}</span></div>
    </button>`).join('') + (ws.length > shown.length ? `<a class="more" href="app.html" target="_blank">${t('openAll')} ${ws.length} ›</a>` : '');
  $('#empty').hidden = ws.length > 0;
  if (tab && okUrl(tab.url)) {
    const n = ws.filter(w => w.url === tab.url).length;
    $('#hereNote').hidden = !n;
    $('#hereNote').textContent = n ? t('watchingHere', n) : '';
  }
}

async function needPerm() {
  // 只要当前这个网站的权限，用户点按钮时现要
  const pat = originPat(tab.url);
  if (await chrome.permissions.contains({ origins: [pat] })) return true;
  return chrome.permissions.request({ origins: [pat] });
}

$('#pick').addEventListener('click', async () => {
  const ok = await needPerm().catch(() => false);
  if (!ok) return ui.toast(t('permDenied'));
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/strings.js', 'lib/page.js', 'lib/picker.js', 'core/rules.js', 'content/pick.js'] });
  if (!qp.get('tab')) window.close();
});
$('#whole').addEventListener('click', async () => {
  const ok = await needPerm().catch(() => false);
  if (!ok) return ui.toast(t('permDenied'));
  $('#whole').disabled = true;
  ui.toast(t('addedPage'));
  await chrome.runtime.sendMessage({ type: 'add', watch: { url: tab.url, title: tab.title, selector: null } });
  $('#whole').disabled = false;
  render();
});
$('#list').addEventListener('click', e => {
  const b = e.target.closest('.it'); if (!b) return;
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html#' + b.dataset.id) });
  if (!qp.get('tab')) window.close();
});

(async () => {
  tab = await getTab().catch(() => null);
  if (tab && okUrl(tab.url)) {
    $('#hereAv').innerHTML = ui.avatar(tab.url);
    $('#hereTitle').textContent = tab.title || ui.host(tab.url);
    $('#hereHost').textContent = ui.host(tab.url);
  } else {
    $('#here').classList.add('cant');
    $('#hereTitle').textContent = t('cantHere');
    $('#hereHost').textContent = t('cantHereSub');
    $('#hereHost').style.whiteSpace = 'normal';
  }
  render();
  store.onChange(ch => { if (ch.watches) render(); });
})();
