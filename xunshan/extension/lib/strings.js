/* 千手院通用：界面文字集中放这里。加英文就再加一个 en 块，t() 自动按浏览器语言挑。
   用法：QS.t('key', 参数1, 参数2) —— 文案里的 {0} {1} 会被替换。 */
(function (g) {
  const QS = g.QS = g.QS || {};
  const STR = {
    zh: {
      app: '巡山僧',
      lab: '千手院',
      slogan: '施主去睡，贫僧盯着',
      tagline: '价格、库存、公告，一变就叫你。',

      // popup
      pickPart: '框选一块',
      watchPage: '盯整页',
      openAll: '全部',
      thisPage: '这一页',
      watchingHere: '这页已盯 {0} 处',
      cantHere: '这种页面盯不了',
      cantHereSub: '浏览器自家页面和商店页不让插件碰。换个普通网页试试。',
      emptyTitle: '山里还没巡过',
      emptySub: '打开想盯的网页，点「框选一块」，圈出价格、库存或者公告那一块就行。',
      permDenied: '没给权限，贫僧进不去这个网站',
      addedPage: '整页盯上了',

      // picker
      pickHint: '点一下要盯的那块',
      pickKeys: '↑ 放大一圈 · Esc 退出',
      pickPreview: '盯这块',
      foundNum: '认出数字',
      condAny: '有变就叫',
      condBelow: '低于',
      condAbove: '高于',
      condHas: '出现',
      condGone: '消失',
      condHasPh: '比如：有货',
      condGonePh: '比如：缺货',
      every: '每',
      start: '开盯',
      reselect: '重选',
      bigger: '放大一圈',
      cancel: '取消',
      added: '盯上了。浏览器开着，贫僧就醒着。',
      emptyPick: '这块是空的，换一块',

      // intervals
      iv1: '1 分钟', iv5: '5 分钟', iv15: '15 分钟', iv30: '30 分钟', iv60: '1 小时', iv180: '3 小时', iv360: '6 小时', iv1440: '1 天',

      // states
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
      waitingFirst: '头一回去看…',
      noChange: '没动静',
      error: '没看成',
      errFetch: '网页打不开（{0}）',
      errBlocked: '被网站拦了，可能要验证码。贫僧不硬闯，你手动开一下这页。',
      errGone: '框的那块找不到了，可能网页改版。重新框一下。',
      errLogin: '像是要登录。先在浏览器里登上，下回就能看。',
      errPerm: '这个网站的权限被收回了',

      // dashboard
      all: '全部盯梢',
      count: '{0} 处',
      exportBtn: '导出',
      importBtn: '导入',
      settings: '设置',
      checkNow: '现在就看',
      pause: '暂停',
      resume: '继续',
      remove: '删除',
      open: '打开网页',
      rename: '改名',
      condition: '什么时候叫',
      frequency: '多久看一次',
      history: '变化记录',
      current: '现在',
      wholePage: '整页',
      partPage: '框选的一块',
      times: '{0} 次',
      kindPrice: '价格',
      kindStock: '库存',
      kindSeats: '名额',
      noHistory: '还没变过。没变化就是好变化。',
      before: '之前',
      after: '之后',
      shotNow: '这一刻',
      firstSeen: '开盯',
      hitTag: '叫了',
      movedTag: '网页改版，已重新找到',
      newPrefix: '新增：',
      lastCheck: '上次看 {0}',
      nextCheck: '下次 {0}',
      removeAsk: '删掉「{0}」？记录一起没。',
      confirmRemove: '删除',
      imported: '导入 {0} 处，已有的跳过 {1} 处',
      importBad: '这文件不是巡山僧的清单',
      importPerm: '导入的网站要权限，点一下放行',
      grant: '放行',
      exported: '清单已导出',
      defaultIv: '新盯梢默认',
      siteGap: '同一网站两次之间隔',
      siteGapSub: '别把人家网站盯烦了',
      sec: '{0} 秒',
      privacy: '清单和记录只在这台电脑的浏览器里，哪儿也不去。',
      selectOne: '左边挑一个',
      unreadAll: '全标已读',
      step1: '打开想盯的网页',
      step2: '点工具栏里的巡山僧 → 框选一块',
      step3: '点中价格或库存那块，按「开盯」',
      mailLine: '要新花样、嫌哪里反人类，找方丈：',
      hq: '千手院总舵',

      // notification
      notifTitle: '{0} 变了',
      notifTitleNew: '{0} 有新内容',
      notifNew: '新增：{0}',
      brokenTitle: '{0} 盯不了了',
      brokenOpen: '点一下看怎么办',
      broken_gone: '框的那块连着几回都找不到，网页大改了。去重新框一下。',
      broken_blocked: '网站连着几回要验证码。贫僧不硬闯，你手动开一下这页。',
      broken_login: '连着几回被请去登录。在浏览器里登上就好。',
      broken_perm: '这个网站的权限被收回了，去放行一下。',
      broken_fetch: '网页连着几回打不开。',
      notifBelow: '降到 {0}',
      notifAbove: '涨到 {0}',
      notifHas: '出现了「{0}」',
      notifGone: '「{0}」没了',
      notifOpen: '点一下直接去看'
    }
  };
  const lang = (g.navigator && navigator.language || 'zh').slice(0, 2);
  const dict = STR[lang] || STR.zh;
  QS.STR = STR;
  QS.t = function (k, ...a) {
    let s = dict[k] != null ? dict[k] : (STR.zh[k] != null ? STR.zh[k] : k);
    return a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i] != null ? a[i] : '') : s;
  };
  // 把 [data-t] 元素的文字换成文案
  QS.applyT = function (root) {
    (root || document).querySelectorAll('[data-t]').forEach(el => { el.textContent = QS.t(el.dataset.t); });
    (root || document).querySelectorAll('[data-t-title]').forEach(el => { el.title = QS.t(el.dataset.tTitle); el.setAttribute('aria-label', el.title); });
    (root || document).querySelectorAll('[data-t-ph]').forEach(el => { el.placeholder = QS.t(el.dataset.tPh); });
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
