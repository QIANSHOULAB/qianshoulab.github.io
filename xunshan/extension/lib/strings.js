/* 千手院通用：界面文字集中放这里。加英文就再加一个 en 块，t() 自动按浏览器语言挑。
   用法：QS.t('key', 参数1, 参数2) —— 文案里的 {0} {1} 会被替换。 */
(function (g) {
  const QS = g.QS = g.QS || {};
  const STR = {
    zh: {
      app: '巡山僧',
      lab: '千手院',
      slogan: '替你盯梢',

      // 弹窗
      onDuty: '在岗 · 盯着 {0} 处',
      onDutyIdle: '在岗，等你派活',
      onDutyHit: '在岗 · {0} 处该看了',
      openAll: '全部',
      here: '这页',
      detecting: '正在认价格和库存…',
      watchIt: '盯',
      watching: '在盯',
      pickPart: '自己框一块',
      watchPage: '盯整页',
      nothingFound: '没认出价格和库存',
      cantHere: '这种页面盯不了',
      cantHereSub: '浏览器自家页面和商店页不让插件碰，换个普通网页。',
      mine: '在盯',
      emptyTitle: '山里还没巡过',
      emptySub: '去商品页点一下贫僧，价格、库存自己认。',
      tryDemo: '用示例试试',
      batchLink: '一次贴一串网址',
      permDenied: '没给权限，贫僧进不去这个网站',
      firstLook: '看第一眼…',
      addedAuto: '盯上了{0}，有动静弹通知',
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
      condDrop: '降了就叫',
      condAny: '有变就叫',
      condBelow: '低于',
      condAbove: '高于',
      condHas: '出现',
      condGone: '消失',
      segDrop: '降了',
      segBelow: '低于',
      segAbove: '高于',
      segAny: '有变',
      segHas: '出现',
      segGone: '消失',
      condHasPh: '比如：有货',
      condGonePh: '比如：缺货',
      condNumPh: '多少',
      condCall: '就叫',
      every: '每',
      frequency: '多久看一次',

      // 频率
      iv1: '1 分钟', iv5: '5 分钟', iv15: '15 分钟', iv30: '30 分钟', iv60: '1 小时', iv180: '3 小时', iv360: '6 小时', iv1440: '1 天',

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
      errBlocked: '被网站拦了，要验证码。贫僧不硬闯，你手动开一下这页就好。',
      errGone: '框的那块找不到了，网页可能改版。重框一下。',
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
      belowAll: '低于多少叫',
      belowAllPh: '空着就是降了就叫',
      addManyGo: '盯这 {0} 个',
      addManyNone: '盯',
      addManyBusy: '正在认第 {0} / {1} 个…',
      addManyDone: '盯上 {0} 个：价格 {1}、库存 {2}、整页 {3}',
      badUrls: '这几行不像网址，跳过了：{0}',
      exportBtn: '导出',
      importBtn: '导入',
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
      movedTag: '网页改版，已重新找到',
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
      siteGap: '同一网站两次之间隔',
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
