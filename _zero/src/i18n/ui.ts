// 零肉身造物（Zero-Flesh Creation）· 给人看的字全在这一处。en 是门面（默认），zh 是第二语言。
// 英文不是翻译，是照英文读者的习惯重写的（_ops/文案规范.md）：字少、口气大、一本正经地冷幽默，不写免责。
// 改字只改这里；模板里用 <T k="home.tagline" /> 取，键写错了构建直接报错。
// 公司那几句（company.*）的中文是 Song 的原话，一个字都别动；英文沿用第一版。
// 改了中文标题字（wordmark、铭文、栏目名、页面大标题）以后，跑一遍 scripts/fonts/README.md 里那两行，把宋体小字库补上新字。

export const ui = {
  en: {
    site: {
      title: 'Zero-Flesh Creation · 零肉身造物',
      desc: 'One monolith, five doors: QIANSHOU LAB, the Cyber Bodega, Specimens, Artifacts and the Codex. A workshop with no carbon on the payroll.',
      skip: 'Skip to content',
    },
    home: {
      tagline: 'One set. Five subsets. No flesh involved.',
      entries: 'Five doors',
    },
    entry: {
      qianshou: { name: 'QIANSHOU LAB', line: 'A thousand monks toil while you unwind.' },
      zahuopu: { name: 'CYBER BODEGA', line: 'Small tools on the shelf. Grab one and go.' },
      specimens: { name: 'SPECIMENS', line: 'Wild projects, pinned and dissected.' },
      artifacts: { name: 'ARTIFACTS', line: 'Made in-house. Some still warm.' },
      codex: { name: 'CODEX', line: 'The laws, with knobs on.' },
    },
    nav: { label: 'Sections', home: 'Back to the monolith' },
    lang: { label: 'Language' },
    sound: { label: 'Sound', on: 'SOUND: ON', off: 'SOUND: OFF' },
    company: {
      h: '零肉身造物 | Zero-Flesh Creation',
      p1: 'A workshop that let every carbon-based employee go. Pure silicon.',
      motto: '— Give the grind to the code. Give your body back to your life.',
      addr: 'Address: Observable Universe · Laniakea Supercluster · Milky Way, Orion Arm (the quiet suburbs) · about 26,000 light-years from the galactic center · third rock from a G2V yellow dwarf. For directions, search “Earth”.',
    },
    foot: { mail: 'Send a pigeon (email)' },
    kind: { specimen: 'specimen', artifact: 'artifact', codex: 'codex', log: 'log' },
    status: { live: 'live', wip: 'in the oven' },
    specimens: {
      h1: 'Specimens',
      lede: 'Field notes on projects that ship without assets. Each one gets a file card, a live slice and a teardown.',
      read: 'Read the teardown',
    },
    specimen: {
      card: 'File card',
      id: 'ID', date: 'Archived', species: 'Species', scale: 'Scale', stack: 'Model stack', source: 'Source', live: 'Live slice',
      play: 'Play the live slice', post: 'Source post',
      back: 'All specimens',
    },
    artifacts: {
      h1: 'Artifacts',
      lede: 'Prototypes we wrote by hand, in pure code. A sandbox you can play full-screen up top, the source and the feel notes below.',
    },
    codex: {
      h1: 'Codex',
      lede: 'Rules that outlive any single project, each with a lab bench you can poke. Filed under geometry, sound and headless evolution.',
      open: 'Open the bench',
      back: 'All codex cards',
      cats: { geometry: 'Geometry', sound: 'Sound', headless: 'Headless' },
    },
    zahuopu: {
      h1: 'Cyber Bodega',
      lede: 'Small tools on the shelf. No sign-up, no cover charge, no line at the register.',
      sign: 'Open 24/7',
      menu: 'On the shelf',
      items: 'items',
      also: 'Looking for the office monks? They live at the temple.',
      alsoGo: 'QIANSHOU LAB',
    },
    bench: {
      label: 'Sound formula bench',
      slash: 'Blade swing', thud: 'Blunt hit', chant: 'Spell chant',
      fslash: 'noise → high-pass ↗ → exp decay', fthud: 'sine 150 → 30 Hz', fchant: 'FM × reverb',
      play: 'Play', code: 'Show the code', copy: 'Copy code', copied: 'Copied',
      hint: 'Tap to hear it. Turn a knob, let go, and it plays again.',
      full: 'Open the full bench',
      knobs: {
        slash: { from: 'Sweep from', to: 'Sweep to', decay: 'Decay', q: 'Resonance' },
        thud: { from: 'Start pitch', to: 'End pitch', drop: 'Drop time', decay: 'Decay' },
        chant: { carrier: 'Carrier', ratio: 'Mod ratio', index: 'Mod depth', mix: 'Reverb' },
      },
    },
  },

  zh: {
    site: {
      title: '零肉身造物 · Zero-Flesh Creation',
      desc: '零肉身造物：一块碑，五道门——千手院、赛博杂货铺、标本、文物、法典。一家没有碳基员工的作坊。',
      skip: '跳到正文',
    },
    home: {
      tagline: '一个全集，五个子集，不含肉身。',
      entries: '五道门',
    },
    entry: {
      qianshou: { name: '千手院', line: '千僧替牛马，施主自风流。' },
      zahuopu: { name: '赛博杂货铺', line: '小工具都在货架上，拿了就走。' },
      specimens: { name: '标本', line: '野生造物，钉在板上解剖。' },
      artifacts: { name: '文物', line: '自家手造，有的还烫手。' },
      codex: { name: '法典', line: '造物法则，自带旋钮。' },
    },
    nav: { label: '栏目', home: '回到黑碑' },
    lang: { label: '语言' },
    sound: { label: '声音', on: '声音：开', off: '声音：关' },
    company: {
      h: '零肉身造物 | Zero-Flesh Creation',
      p1: '一家彻底摒弃了碳基雇员的纯硅基作坊',
      motto: '——把折磨肉体的活交给代码，把肉身还给生活。',
      addr: '公司地址：可观测宇宙 · 拉尼亚凯亚超星系团 · 银河系郊区猎户座支臂 · 距银心约 2.6 万光年处 · 绕行一颗 G2V 型黄矮星的第三颗蓝色水球表面（导航请搜：地球）',
    },
    foot: { mail: '飞鸽传书（发邮件）' },
    kind: { specimen: '标本', artifact: '文物', codex: '法典', log: '日志' },
    status: { live: '已上线', wip: '炉子里' },
    specimens: {
      h1: '标本',
      lede: '野生零肉身项目的观察笔记。每个标本一张档案卡、一个实机切片、一篇拆解。',
      read: '看拆解',
    },
    specimen: {
      card: '档案卡',
      id: '编号', date: '归档日期', species: '物种形态', scale: '复杂度规模', stack: '算力包工头', source: '原始信源', live: '实机切片',
      play: '进实机切片', post: '看原帖',
      back: '全部标本',
    },
    artifacts: {
      h1: '文物',
      lede: '亲手写的纯代码原型。上面一块能全屏试玩的沙盒，下面是源码和手感复盘。',
    },
    codex: {
      h1: '法典',
      lede: '跨项目通用的常青法则，每张都带一张能上手拧的实验台。按几何捏骨、声学合成、无头演化分类归档。',
      open: '上实验台',
      back: '全部法则',
      cats: { geometry: '几何捏骨', sound: '声学合成', headless: '无头演化' },
    },
    zahuopu: {
      h1: '赛博杂货铺',
      lede: '小工具都在货架上。不用注册，不收门票，结账不用排队。',
      sign: '营业中 24/7',
      menu: '货架',
      items: '样',
      also: '找办公室那群和尚？他们住在山上的千手院。',
      alsoGo: '千手院',
    },
    bench: {
      label: '声学公式测试板',
      slash: '破空挥砍', thud: '钝器重击', chant: '法术吟唱',
      fslash: '白噪音 → 高通 ↗ → 指数衰减', fthud: '正弦 150 → 30 Hz', fchant: '调频 × 混响',
      play: '发声', code: '看代码', copy: '复制代码', copied: '复制好了',
      hint: '点一下就响。拧完旋钮一松手，再响一次。',
      full: '去整张测试板',
      knobs: {
        slash: { from: '起扫频率', to: '止扫频率', decay: '衰减', q: '共振' },
        thud: { from: '起始音高', to: '落地音高', drop: '滑落时长', decay: '衰减' },
        chant: { carrier: '载波', ratio: '调制比', index: '调制深度', mix: '混响' },
      },
    },
  },
} as const;

export type Lang = keyof typeof ui;

/** 五道门：首页五条铭文、五撮碑块、子页面顶上的栏目条都按这个顺序（Song 定的：01 千手院 … 05 法典）。 */
export const ENTRIES = [
  { key: 'qianshou', href: '/qianshou/' },
  { key: 'zahuopu', href: '/zahuopu/' },
  { key: 'specimens', href: '/specimens/' },
  { key: 'artifacts', href: '/artifacts/' },
  { key: 'codex', href: '/codex/' },
] as const;
export type EntryKey = (typeof ENTRIES)[number]['key'];

/** 按 "a.b.c" 取字；取不到就在构建时直接报错，省得线上出现空白。 */
export function t(lang: Lang, key: string): string {
  const v = key.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), ui[lang]);
  if (typeof v !== 'string') throw new Error(`i18n: 缺字 ${lang}.${key}`);
  return v;
}
export function tAny<T = unknown>(lang: Lang, key: string): T {
  const v = key.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), ui[lang]);
  if (v == null) throw new Error(`i18n: 缺字 ${lang}.${key}`);
  return v as T;
}
