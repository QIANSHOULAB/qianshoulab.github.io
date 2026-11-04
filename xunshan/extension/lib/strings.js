/* 巡山僧 0.4.0：给人看的字全在这一个文件里，英文一套、中文一套。插件（弹窗、总览、框选面板、通知）和介绍页 xunshan/index.html 共用。
   英文是照英文用户的习惯重写的，不是翻译（_ops/文案规范.md）；网页上的内容（价格、商品名、库存字样）一个字不翻，原样显示。
   默认英文，第二语言中文（Song 11-03 22:19）：右上角 EN / 中文 切换，选过就记住，下次打开直接是上次选的；不跟浏览器语言走。
     插件里记在 chrome.storage.local 的 lang（后台通知、弹窗、总览、框选面板一起换）；介绍页记在 localStorage 的 xunshan.lang，?lang=zh|en 只管这一次。
   用法：QS.t('key', 参数…)：文案里的 {0} {1} 换成参数；文案也可以是函数（英文单复数）。商店名字和简介在 extension/_locales/。 */
(function (g) {
  const QS = g.QS = g.QS || {};
  const n1 = (n, one, many) => (+n === 1 ? one : many);

  const STR = {
    en: {
      htmlLang: 'en',
      app: 'Xunshan',
      appFull: 'Xunshan · Price Watch',
      lab: 'Qianshou Lab',
      slogan: 'Stares at the page so you don’t have to.',
      langLabel: 'Language',
      close: 'Close',

      // 弹窗
      onDuty: 'Watching {0}',
      onDutyIdle: 'Awaiting orders',
      onDutyHit: n => n1(n, '1 needs a look', n + ' need a look'),
      openAll: 'All',
      here: 'This page',
      detecting: 'Looking for price and stock…',
      watchIt: 'Watch',
      pickPart: 'Pick an area',
      watchPage: 'Watch whole page',
      nothingFound: 'No price or stock found',
      cantHere: 'Can’t watch this page',
      cantHereSub: 'Browser pages and extension stores are off-limits. Try a regular site.',
      mine: 'Watching',
      emptyTitle: 'Nothing to watch. Very zen.',
      emptySub: 'Open a product page and click Xunshan. It finds the price and stock on its own.',
      tryDemo: 'Try a demo',
      batchLink: 'Paste URLs',
      permDenied: 'No permission, no entry.',
      firstLook: 'Taking a first look…',
      undo: 'Undo',
      undone: 'Undone',

      // 框选
      pickHint: 'Click the part to watch',
      pickKeys: '↑ bigger · Esc to exit',
      added: 'Watching',
      bigger: 'Bigger',
      reselect: 'Pick again',
      emptyPick: 'Nothing in there. Try another spot.',

      // 条件
      condWhen: 'Alert me',
      condAny: 'Any change',
      condDrop: 'Any drop',
      lblBelow: 'Below {0}',
      lblAbove: 'Above {0}',
      lblHas: '“{0}” appears',
      lblGone: '“{0}” disappears',
      segDrop: 'Drops',
      segBelow: 'Below',
      segAbove: 'Above',
      segAny: 'Changes',
      segHas: 'Appears',
      segGone: 'Gone',
      condHasPh: 'e.g. In stock',
      condGonePh: 'e.g. Sold out',
      condNumPh: 'Amount',
      frequency: 'How often',

      // 频率
      ev1: 'Every minute', ev5: 'Every 5 min', ev15: 'Every 15 min', ev30: 'Every 30 min',
      ev60: 'Hourly', ev180: 'Every 3 hours', ev360: 'Every 6 hours', ev1440: 'Daily',

      // 状态
      justNow: 'just now',
      minsAgo: '{0} min ago',
      hoursAgo: '{0} hr ago',
      daysAgo: n => n1(n, 'yesterday', n + ' days ago'),
      inMins: 'in {0} min',
      inHours: 'in {0} hr',
      soon: 'any second',
      paused: 'Paused',
      changed: 'Changed',
      hitPill: 'Alert',
      checking: 'Checking…',
      waitingFirst: 'Taking a first look…',
      error: 'Stuck',
      errFetch: 'Page won’t load ({0}). Will try again in a bit.',
      errBlocked: 'Captcha wall. Open the page yourself once; we don’t pick locks.',
      errGone: 'Lost the part you picked (redesign?). Pick it again.',
      errLogin: 'Got a login page. Log in with this browser; the next check gets through.',
      errPerm: 'Access to this site was taken back.',
      fixOpen: 'Open page',
      fixGrant: 'Allow',

      // 总览
      all: 'All watches',
      count: n => n1(n, '1 watch', n + ' watches'),
      addMany: 'Add a batch',
      addManyTitle: 'Watch a pile of URLs',
      addManySub: 'One per line. It finds the price or stock itself; if it can’t, it watches the whole page.',
      addManyPh: 'https://…\nhttps://…',
      urlsLabel: 'URLs',
      belowAll: 'Alert below',
      belowAllPh: 'Blank = any drop',
      addManyGo: n => n1(n, 'Watch 1', 'Watch all ' + n),
      addManyNone: 'Watch',
      addManyBusy: 'Checking {0} of {1}…',
      addManyDone: 'Watching {0}. Price: {1} · Stock: {2} · Whole page: {3}',
      badUrls: 'Skipped, not URLs: {0}',
      listSep: ', ',
      exportBtn: 'Export',
      importBtn: 'Import',
      exportName: 'xunshan-watchlist',
      settings: 'Settings',
      checkNow: 'Check now',
      pause: 'Pause',
      remove: 'Delete',
      removed: 'Deleted “{0}”',
      open: 'Open page',
      rename: 'Rename',
      history: 'History',
      current: 'Now',
      wholePage: 'Whole page',
      partPage: 'Picked area',
      autoPart: '{0} (found automatically)',
      times: n => n1(n, '1 change', n + ' changes'),
      kindPrice: 'Price',
      kindStock: 'Stock',
      kindSeats: 'Spots left',
      kindKnown: 'Same spot as last time',
      noHistory: 'No changes yet. No news is good news.',
      before: 'Before',
      after: 'After',
      shotNow: 'Now',
      firstSeen: 'Started',
      hitTag: 'Alerted',
      movedTag: 'Page redesigned, found it again',
      newPrefix: 'New: ',
      lastCheck: 'Checked {0}',
      nextCheck: 'next {0}',
      imported: 'Imported {0}, skipped {1} already here',
      importBad: 'That’s not a Xunshan watchlist',
      importPerm: 'The imported sites need your OK',
      grant: 'Allow',
      exported: 'Watchlist exported',
      defaultIv: 'New watches check',
      defaultIvSub: 'Whatever you picked last time',
      siteGap: 'Pause between checks on one site',
      siteGapSub: 'Be polite. Sites notice.',
      sec: '{0} s',
      privacy: 'Your watchlist and history stay in this browser. Nothing leaves.',
      selectOne: 'Pick one on the left',
      unreadAll: 'Mark all read',
      demoChip: 'Demo',
      demoLabel: 'Demo · Headphones price',
      demoNote: 'Just a demo. Nothing gets checked. Delete it and it’s gone.',
      mailLine: 'Want a feature, or something annoying you? Email the abbot: ',
      hq: 'Qianshou Lab',
      fb: 'Feedback',
      fbSubject: '[QIANSHOU feedback] Xunshan · Price Watch {0}',
      fbBody: 'What’s not working:\n\nWhat you wish it did:\n\nAnything else:',

      // 通知
      notifTitle: 'Change spotted: {0}',
      notifTitleNew: 'New on {0}',
      notifNew: 'New: {0}',
      brokenTitle: 'Lost sight of {0}',
      brokenOpen: 'Click for the fix',
      broken_gone: 'The part you picked has been missing for a few checks. Big redesign, probably. Pick it again.',
      broken_blocked: 'The site keeps asking for a captcha. We don’t pick locks; open the page yourself.',
      broken_login: 'It keeps landing on a login page. Log in with your browser and it’s fixed.',
      broken_perm: 'Access to this site was taken back. Allow it again.',
      broken_fetch: 'The page wouldn’t load a few times in a row.',
      notifBelow: 'Down to {0}',
      notifAbove: 'Up to {0}',
      notifDrop: '{0} → {1}',
      notifHas: '“{0}” just showed up',
      notifGone: '“{0}” is gone',
      notifOpen: 'Click to open',

      // 介绍页 xunshan/index.html
      iTitle: 'Xunshan · Price Watch',
      iDesc: 'A Chrome / Edge extension that watches pages for price drops, restocks and new posts, and pings you the moment something moves. Free. Your list never leaves your browser.',
      iHome: 'Qianshou Lab',
      iInstall: 'Install',
      iTagline: 'Price drops, restocks, new posts. It keeps an eye on the page and pings you the second something moves.',
      iDownload: 'Download',
      iHowTo: 'How to install',
      iMeta: '{0} · Chrome / Edge 120+ · Free',
      iAltApp: 'Xunshan overview: a price went from 1,099 to 899, with the change highlighted',
      iS1T: 'One click. Watching.',
      iS1P: 'Price, stock, spots left: it finds them on its own. Prices alert on any drop, sold-out items when they’re back. Want a threshold? Click Below and type a number. Can’t find it? Pick it yourself.',
      iAltPopup: 'Xunshan popup: found the price and the stock, one click on the price row and it’s watching',
      iS2T: 'A whole list,\none paste.',
      iS2P: 'Ten products from the same store? Paste the links, set one “below” price, done. Picked a spot on that site before? It looks there again.',
      iAltBatch: 'Eight URLs pasted at once, alert below 100',
      iS3T: 'It calls.\nWith receipts.',
      iS3P: 'You get a system notification; click it and you’re on the page. It snaps a picture the moment things change, before and after side by side. Hard to argue with.',
      iAltCompare: 'History: price 1,099 down to 899, before and after snapshots side by side',
      iMore: 'What else',
      iG: [
        ['Good news only', 'Alerts when it crosses your line or drops further. Price goes back up? Silence.'],
        ['Quiet on busy pages', 'Ticking clocks and viewer counts don’t count. Only new content does.'],
        ['Survives redesigns', 'Page got a makeover? It finds your spot again.'],
        ['Script-heavy pages too', 'Reads them in an invisible frame. No surprise tabs.'],
        ['Behind a login too', 'Uses the login already in your browser.'],
        ['On duty with your browser', 'Nothing to start, nothing to click. It speaks up when it matters.'],
        ['Says when it’s stuck', 'Can’t check a page a few times in a row? You get a heads-up.'],
        ['Undo for slips', 'Watched the wrong thing, deleted the right one? Undo.'],
        ['Stays put', 'Your list and history live in your browser and nowhere else.']
      ],
      iInstT: 'Install',
      iInstSub: 'Not in the store yet. Manual install, two minutes.',
      iSteps: [
        'Download <a href="{zip}" download>{zipName}</a> and unzip it into a folder.',
        'Go to <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>).',
        'Turn on Developer mode (top right in Chrome, bottom left in Edge).',
        'Click Load unpacked and pick that folder.',
        'Click the puzzle icon in the toolbar and pin Xunshan. Open a product page and click it.'
      ],
      iLater: 'It’s on duty whenever your browser is open. The first time you watch a site, the browser asks once for permission.',
      iFootName: 'Qianshou Lab · Xunshan',
      iFootMail: 'Email the abbot: '
    },

    zh: {
      htmlLang: 'zh-CN',
      app: '巡山僧',
      appFull: '巡山僧',
      lab: '千手院',
      slogan: '替你盯梢',
      langLabel: '语言',
      close: '关闭',

      // 弹窗
      onDuty: '在岗 · 盯着 {0} 处',
      onDutyIdle: '在岗，等你派活',
      onDutyHit: '在岗 · {0} 处该看了',
      openAll: '全部',
      here: '这页',
      detecting: '正在认价格和库存…',
      watchIt: '盯',
      pickPart: '自己框一块',
      watchPage: '盯整页',
      nothingFound: '没认出价格和库存',
      cantHere: '这种页面盯不了',
      cantHereSub: '浏览器自家页面和商店页不让插件碰，换个普通网页。',
      mine: '在盯',
      emptyTitle: '山里还没巡过',
      emptySub: '去商品页点一下贫僧，价格、库存自己认。',
      tryDemo: '用示例试试',
      batchLink: '贴网址',
      permDenied: '没给权限，贫僧进不去这个网站',
      firstLook: '看第一眼…',
      undo: '撤销',
      undone: '撤了',

      // 框选
      pickHint: '点一下要盯的那块',
      pickKeys: '↑ 放大一圈 · Esc 退出',
      added: '盯上了',
      bigger: '放大一圈',
      reselect: '重框',
      emptyPick: '这块是空的，换一块',

      // 条件
      condWhen: '什么时候叫',
      condAny: '有变就叫',
      condDrop: '降了就叫',
      lblBelow: '低于 {0} 就叫',
      lblAbove: '高于 {0} 就叫',
      lblHas: '出现「{0}」就叫',
      lblGone: '「{0}」没了就叫',
      segDrop: '降了',
      segBelow: '低于',
      segAbove: '高于',
      segAny: '有变',
      segHas: '出现',
      segGone: '没了',
      condHasPh: '比如：有货',
      condGonePh: '比如：缺货',
      condNumPh: '多少',
      frequency: '多久看一次',

      // 频率
      ev1: '每分钟', ev5: '每 5 分钟', ev15: '每 15 分钟', ev30: '每 30 分钟',
      ev60: '每小时', ev180: '每 3 小时', ev360: '每 6 小时', ev1440: '每天',

      // 状态
      justNow: '刚刚',
      minsAgo: '{0} 分钟前',
      hoursAgo: '{0} 小时前',
      daysAgo: '{0} 天前',
      inMins: '{0} 分钟后',
      inHours: '{0} 小时后',
      soon: '马上',
      paused: '歇着',
      changed: '变了',
      hitPill: '该看了',
      checking: '正在看…',
      waitingFirst: '看第一眼…',
      error: '没看成',
      errFetch: '网页打不开（{0}），贫僧过会儿再去。',
      errBlocked: '网站要验证码。贫僧不硬闯，你手动开一下这页就好。',
      errGone: '框的那块找不到了，八成是网页改版。重框一下。',
      errLogin: '像是要登录。在浏览器里登上，下回就能看。',
      errPerm: '这个网站的权限被收回了。',
      fixOpen: '打开这页',
      fixGrant: '放行',

      // 总览
      all: '全部盯梢',
      count: '{0} 处',
      addMany: '加一串',
      addManyTitle: '一次盯一串网址',
      addManySub: '一行一个。价格、库存贫僧自己认，认不出的盯整页。',
      addManyPh: 'https://…\nhttps://…',
      urlsLabel: '网址',
      belowAll: '低于多少叫',
      belowAllPh: '空着就是降了就叫',
      addManyGo: '盯这 {0} 个',
      addManyNone: '盯',
      addManyBusy: '正在认第 {0} / {1} 个…',
      addManyDone: '盯上 {0} 个：价格 {1}、库存 {2}、整页 {3}',
      badUrls: '这几行不像网址，跳过了：{0}',
      listSep: '、',
      exportBtn: '导出',
      importBtn: '导入',
      exportName: '巡山僧清单',
      settings: '设置',
      checkNow: '现在就看',
      pause: '歇着',
      remove: '删除',
      removed: '删了「{0}」',
      open: '打开网页',
      rename: '改名',
      history: '变化记录',
      current: '现在',
      wholePage: '整页',
      partPage: '框选的一块',
      autoPart: '自动认出的{0}',
      times: '{0} 次',
      kindPrice: '价格',
      kindStock: '库存',
      kindSeats: '名额',
      kindKnown: '上回盯的那块',
      noHistory: '还没变过。没变化就是好变化。',
      before: '之前',
      after: '之后',
      shotNow: '这一刻',
      firstSeen: '开盯',
      hitTag: '叫了',
      movedTag: '网页改版了，又找着了',
      newPrefix: '新增：',
      lastCheck: '上次看 {0}',
      nextCheck: '下次 {0}',
      imported: '导入 {0} 处，已有的跳过 {1} 处',
      importBad: '这文件不是巡山僧的清单',
      importPerm: '导入的网站要放行一下',
      grant: '放行',
      exported: '清单导出了',
      defaultIv: '新盯梢多久看一次',
      defaultIvSub: '跟你上回选的一样',
      siteGap: '同一网站隔几秒再看下一条',
      siteGapSub: '别把人家网站盯烦了',
      sec: '{0} 秒',
      privacy: '清单和记录只在这台电脑的浏览器里，哪儿也不去。',
      selectOne: '左边挑一个',
      unreadAll: '全标已读',
      demoChip: '示例',
      demoLabel: '示例 · 降噪耳机价格',
      demoNote: '这是示例，贫僧不会真去看。删了就没。',
      mailLine: '要新花样、嫌哪里反人类，找方丈：',
      hq: '千手院总舵',
      fb: '提意见',
      fbSubject: '[千手院反馈] 巡山僧 {0}',
      fbBody: '哪里不好用：\n\n想要什么：\n\n别的：',

      // 通知
      notifTitle: '{0} 变了',
      notifTitleNew: '{0} 有新内容',
      notifNew: '新增：{0}',
      brokenTitle: '{0} 盯不了了',
      brokenOpen: '点一下看怎么办',
      broken_gone: '框的那块连着几回都找不到，网页大改了。去重框一下。',
      broken_blocked: '网站连着几回要验证码。贫僧不硬闯，你手动开一下这页。',
      broken_login: '连着几回被请去登录。在浏览器里登上就好。',
      broken_perm: '这个网站的权限被收回了，去放行一下。',
      broken_fetch: '网页连着几回打不开。',
      notifBelow: '降到 {0}',
      notifAbove: '涨到 {0}',
      notifDrop: '{0} → {1}',
      notifHas: '出现了「{0}」',
      notifGone: '「{0}」没了',
      notifOpen: '点一下直接去看',

      // 介绍页 xunshan/index.html
      iTitle: '巡山僧 · 替你盯梢',
      iDesc: '网页降价、补货、上新，贫僧 24 小时蹲守，风吹草动立刻通报。Chrome / Edge 插件，免费，数据只在你自己的浏览器里。',
      iHome: '千手院',
      iInstall: '怎么装',
      iTagline: '网页降价、补货、上新，贫僧 24 小时蹲守，风吹草动立刻通报。',
      iDownload: '下载插件',
      iHowTo: '怎么装',
      iMeta: '{0} · Chrome / Edge 120 起 · 免费',
      iAltApp: '巡山僧总览：价格从 1,099 降到 899，红绿对比显示改了哪',
      iS1T: '点一下，就盯上。',
      iS1P: '价格、库存、剩余名额，贫僧自己认，不用你框。默认降价就叫，缺货的等到货再叫；要设线，点「低于」打个数。认不出的，自己框一块。',
      iAltPopup: '巡山僧弹窗：认出价格和库存，点价格那行就盯上了',
      iS2T: '一串网址，\n一次贴。',
      iS2P: '同一家店十个商品，贴进来，填一个「低于多少」，一下全盯上。同一个网站上回框过哪块，这回照着认。',
      iAltBatch: '一次贴 8 个网址，低于 100 就叫',
      iS3T: '变了就叫，\n还留了照。',
      iS3P: '弹系统通知，点一下直接打开那一页。变的那一刻顺手拍一张，之前、之后并排摆着，赖不掉。',
      iAltCompare: '变化记录：价格 1,099 降到 899，之前之后两张截图并排',
      iMore: '还能干啥',
      iG: [
        ['只叫好消息', '到线叫、再降再叫，涨回去闭嘴'],
        ['整页不吵', '只变时钟、人数的不算，有新内容才叫'],
        ['改版不丢', '网页大改，自己把那块重新找回来'],
        ['脚本页也行', '看不见的小窗里读，不在你窗口里冒标签'],
        ['要登录的也行', '用你浏览器里现成的登录'],
        ['开浏览器就在岗', '不用打开、不用点开始，有事才叫你'],
        ['坏了会说', '连着几回看不成，发一条告诉你'],
        ['手滑能撤', '盯错了、删错了，点「撤销」'],
        ['哪儿也不去', '清单和记录只存在你自己的浏览器']
      ],
      iInstT: '怎么装',
      iInstSub: '还没上商店，先手动装，两分钟。',
      iSteps: [
        '下载 <a href="{zip}" download>{zipName}</a>，解压成一个文件夹。',
        '地址栏打开 <code>chrome://extensions</code>；Edge 用 <code>edge://extensions</code>。',
        '打开「开发者模式」（Chrome 在右上角，Edge 在左下）。',
        '点「加载已解压的扩展程序」（Edge：「加载解压缩的扩展」），选刚才那个文件夹。',
        '点工具栏的拼图图标，把巡山僧钉出来。去想盯的商品页，点它。'
      ],
      iLater: '浏览器开着贫僧就醒着。第一次盯某个网站，浏览器会问一次这个网站的权限。',
      iFootName: '千手院 · 巡山僧',
      iFootMail: '找方丈：'
    }
  };

  const LANGS = [{ code: 'en', label: 'EN' }, { code: 'zh', label: '中文' }];
  const DEFAULT = 'en';
  const KEY = 'lang';                 // 插件：chrome.storage.local
  const WEB_KEY = 'xunshan.lang';     // 介绍页：localStorage
  const hasStore = !!(g.chrome && g.chrome.storage && g.chrome.storage.local);
  let lang = DEFAULT;
  const subs = [];
  function use(l) {
    if (!STR[l] || l === lang) return false;
    lang = l;
    subs.slice().forEach(f => { try { f(l); } catch (e) {} });
    return true;
  }

  QS.STR = STR;
  QS.LANGS = LANGS;
  QS.lang = () => lang;
  QS.onLang = f => { subs.push(f); };
  QS.setLang = l => {
    if (!STR[l]) return;
    use(l);
    if (hasStore) chrome.storage.local.set({ [KEY]: l }).catch(() => {});
    else try { localStorage.setItem(WEB_KEY, l); } catch (e) {}
  };
  if (hasStore) {
    QS.langReady = chrome.storage.local.get(KEY).then(o => { use(o[KEY]); return lang; }, () => lang);
    if (!QS.__langWired && chrome.storage.onChanged) {
      QS.__langWired = true;
      chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch[KEY]) use(ch[KEY].newValue || DEFAULT); });
    }
  } else {
    let q = null, s = null;
    try { q = (g.location && (g.location.search.match(/[?&]lang=(zh|en)\b/) || [])[1]) || null; } catch (e) {}
    try { s = g.localStorage && g.localStorage.getItem(WEB_KEY); } catch (e) {}
    use(q || s || DEFAULT);
    QS.langReady = Promise.resolve(lang);
  }

  QS.t = function (k, ...a) {
    let s = STR[lang][k];
    if (s == null) s = STR[DEFAULT][k];
    if (s == null) return k;
    if (typeof s === 'function') return s(...a);
    if (typeof s !== 'string') return s;
    return a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i] != null ? a[i] : '') : s;
  };
  // 把 [data-t] 元素的文字换成文案
  QS.applyT = function (root) {
    (root || document).querySelectorAll('[data-t]').forEach(el => { el.textContent = QS.t(el.dataset.t); });
    (root || document).querySelectorAll('[data-t-title]').forEach(el => { el.title = QS.t(el.dataset.tTitle); el.setAttribute('aria-label', el.title); });
    (root || document).querySelectorAll('[data-t-ph]').forEach(el => { el.placeholder = QS.t(el.dataset.tPh); });
    (root || document).querySelectorAll('[data-t-aria]').forEach(el => { el.setAttribute('aria-label', QS.t(el.dataset.tAria)); });
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
