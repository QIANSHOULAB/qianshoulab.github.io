/* 代笔僧后台：只负责「点工具栏图标 → 打开侧栏」。不碰任何网页、不联网。 */
const open = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onInstalled.addListener(open);
chrome.runtime.onStartup.addListener(open);
open();
