// lib/strings.js — 千手院插件通用：所有给人看的字都放这里。
// 加英文：在 STR 里加一个 en 块，键名照抄，QSStrings.lang 设成 'en' 即可。
(() => {
  const STR = {
    zh: {
      // 通用（几尊插件共用）
      brand: '千手院',
      footMail: '找方丈：',
      footHome: '千手院总舵',
      exportXlsx: '导出 Excel',
      exportCsv: '导出 CSV',
      copy: '复制',
      copied: '已复制 {n} 行，去表格里粘贴',
      exported: '已导出 {file}',
      cancel: '取消',
      done: '好',
      settings: '设置',

      // 化缘僧
      hyName: '化缘僧',
      hyTag: '点一下，你去玩，贫僧挨页化缘',
      hyFoot: '千手院 · 化缘僧',
      looking: '正在看这页…',
      block: '第 {i}/{n} 块',
      blockOnly: '只找到 1 块',
      sizeLine: '{rows} 行 · {cols} 列',
      switchBlock: '换一块',
      modeNext: '翻页',
      modeScroll: '滚动',
      modeOne: '只这页',
      nextFound: '下一页：{text}',
      nextNone: '没找到下一页',
      nextEnd: '到最后一页了',
      nextPick: '指定下一页',
      nextRepick: '换一个',
      pickHint: '点一下网页上的「下一页」按钮 · Esc 取消',
      pickWait: '去网页上点「下一页」…',
      scrollHint: '往下滚到底，边滚边收',
      oneHint: '这页就这些，直接导出',
      start: '开始',
      stop: '停',
      again: '接着化',
      running: '第 {p} 页 · 已收 {rows} 行',
      runningScroll: '第 {p} 屏 · 已收 {rows} 行',
      finished: '化完了：{p} {unit}，{rows} 行',
      finishedStop: '停了：{p} {unit}，{rows} 行',
      unitPage: '页',
      unitScreen: '屏',
      dupes: '去掉重复 {n} 行',
      hiddenCols: '收起了 {n} 列',
      restore: '放出来',
      moreRows: '预览前 {shown} 行，导出是全部 {rows} 行',
      delCol: '删掉这列',
      dragTip: '拖动换位置，点名字改名',
      noAccess: '这页贫僧进不去',
      noAccessSub: '浏览器自带页面和扩展商店不让化缘。换个有列表的网页，再点一下化缘僧。',
      noList: '这页没找到像名单的东西',
      noListSub: '换个有列表、表格的网页，再点一下化缘僧。',
      demoBadge: '示例',
      demoTitle: '在有列表的网页上点一下，就是这样',
      demoOpen: '打开示例页',
      tabGone: '那个网页已经关了',
      needPerm: '翻到下一页后，浏览器要你再点一下才让贫僧进门',
      grant: '允许这个网站',
      settingDelay: '每页等几秒',
      settingMax: '最多翻几页',
      demoUrl: 'https://qianshoulab.github.io/huayuan/demo/',
      // 列名猜测
      colField: '字段',
      colLink: '链接',
      colImage: '图片',
      colEmail: '邮箱',
      colPhone: '电话',
      colUrl: '网址',
      colPrice: '价格',
      colDate: '日期',
      colPercent: '百分比',
    },
  };
  const QSStrings = {
    lang: 'zh',
    t(key, vars) {
      const pack = STR[QSStrings.lang] || STR.zh;
      let s = pack[key] ?? STR.zh[key] ?? key;
      if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
      return s;
    },
    // class/属性里的英文词 → 列名
    hintWords: [
      [/e-?mail|mail/, '邮箱'], [/phone|tel|mobile/, '电话'], [/price|cost/, '价格'],
      [/company|corp|org(?!in)|firm/, '公司'], [/contact|person/, '联系人'],
      [/addr|address|location/, '地址'], [/city/, '城市'], [/title|headline/, '标题'],
      [/name/, '名称'], [/desc|summary|intro|excerpt/, '简介'], [/date|time/, '时间'],
      [/rating|score|star/, '评分'], [/review|comment/, '评论'], [/author|user/, '作者'],
      [/status|state/, '状态'], [/role|position|job|post/, '职位'], [/shop|store|seller|merchant/, '店铺'], [/amount|total|revenue|budget/, '金额'], [/tag|label|badge|chip|category/, '标签'],
      [/stock|inventory/, '库存'], [/sale|sold/, '销量'], [/industry/, '行业'], [/source/, '来源'],
      [/owner|sales/, '负责人'], [/stage/, '阶段'], [/brand/, '品牌'], [/sku|code|id$/, '编号'],
    ],
  };
  globalThis.QSStrings = QSStrings;
})();
