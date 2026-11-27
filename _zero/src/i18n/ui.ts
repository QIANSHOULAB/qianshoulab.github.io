// 零肉身造物（Zero-Flesh Creation）· 给人看的字全在这一处。en 是门面（默认），zh 是第二语言。
// 英文不是翻译，是照英文读者的习惯重写的（_ops/文案规范.md）。
// 改字只改这里；模板里用 <T k="home.h1" /> 取，键写错了构建直接报错。
// 公司那张卡（company.*）的中文是 Song 的原话，一个字都别动；英文沿用千手院总舵上那版。

export const ui = {
  en: {
    site: {
      title: 'Zero-Flesh Creation · 零肉身造物',
      desc: 'A lab for digital species built from pure math: procedural geometry, live Web Audio synthesis and headless simulation. No meshes, no samples, no bitmaps. Home of QIANSHOU LAB and the Cyber Bodega.',
      skip: 'Skip to content',
    },
    nav: { label: 'Sections', home: 'Observatory', specimens: 'Specimens', artifacts: 'Artifacts', codex: 'Codex' },
    lang: { label: 'Language' },
    mode: { label: 'Render or headless', render: 'Render', headless: 'Headless' },
    sfx: { label: 'Interface sounds' },
    home: {
      kicker: 'Observatory',
      h1: 'No meshes. No samples. Just math.',
      lede: 'A lab for digital species grown from formulas, live-synthesized sound and headless simulation. Nothing on this site was drawn, recorded or downloaded.',
      vp: { name: 'viewport/01 · superformula', drag: 'drag to turn', species: 'species' },
      doorsLabel: 'Two doors',
      qianshou: {
        name: 'QIANSHOU LAB', alt: '千手院',
        sub: 'A thousand monks toil while you unwind.',
        meta: '10 cyber monks on duty · office grunt work',
        go: 'Enter',
      },
      zahuopu: {
        name: 'Cyber Bodega', alt: '赛博杂货铺',
        sub: 'Small tools on the shelf. Grab one and go.',
        meta: '{n} on the shelf · phone-sized jobs',
        go: 'Browse the shelf',
      },
      cta: 'Dissect Specimen 001', toHeadless: 'Go headless', toRender: 'Restore render',
      lab: { no: '§01', t: 'The lab', sub: 'Three drawers. One rule: no assets.' },
      latest: { no: '§02', t: 'Latest', all: 'All', empty: 'Nothing in this drawer yet. It’s still in the oven.' },
      manifesto: {
        no: '§03', t: 'Manifesto',
        rules: [
          ['0 × .fbx / .glb', 'No meshes. Bodies are stacked primitives; joints bend by sine and cosine.'],
          ['0 × .mp3 / .wav', 'No samples. Every swing, thud and chant is synthesized the millisecond it lands.'],
          ['0 × .png / keyframes', 'No bitmaps, no keyframes. Shaders repaint the pixels, formulas strike the poses.'],
          ['∞ × headless fights', 'Balance by brute force: thousands of AI duels with the renderer switched off.'],
        ],
        quote: 'Humans stop hauling pixels. We write the laws of physics and run the prison where the algorithms fight.',
        principle: 'Practice what we preach: this site ships no images, no font files and no audio. The footer counts every request, live.',
      },
    },
    company: {
      h: '零肉身造物 | Zero-Flesh Creation',
      p1: 'A workshop that let every carbon-based employee go. Pure silicon.',
      motto: '— Give the grind to the code. Give your body back to your life.',
      addr: 'Address: Observable Universe · Laniakea Supercluster · Milky Way, Orion Arm (the quiet suburbs) · about 26,000 light-years from the galactic center · third rock from a G2V yellow dwarf. For directions, search “Earth”.',
    },
    cols: {
      specimens: { name: 'Specimens', desc: 'Teardowns of zero-asset projects in the wild. We pull the formulas out and pin them to the board.' },
      artifacts: { name: 'Artifacts', desc: 'Pure-code prototypes we built ourselves. Playable on top, source and post-mortem below.' },
      codex: { name: 'Codex', desc: 'Evergreen techniques with knobs on: geometry, sound, headless evolution.' },
      latest: 'Latest',
      none: 'Still in the oven',
    },
    kind: { specimen: 'specimen', artifact: 'artifact', codex: 'codex', log: 'log' },
    status: { live: 'live', wip: 'in the oven' },
    specimens: {
      kicker: '/specimens',
      h1: 'Specimens',
      lede: 'Field notes on projects that ship without assets. Each one gets a file card, a live slice and a teardown.',
      read: 'Read the teardown',
    },
    specimen: {
      card: 'File card',
      id: 'ID', date: 'Archived', species: 'Species', scale: 'Scale', stack: 'Model stack', source: 'Source', live: 'Live slice',
      play: 'Play the live slice', post: 'Source post',
      back: 'All specimens',
      chars: 'chars',
    },
    artifacts: {
      kicker: '/artifacts',
      h1: 'Artifacts',
      lede: 'Prototypes we wrote by hand, in pure code. A sandbox you can play full-screen up top, the source and the feel notes below.',
    },
    codex: {
      kicker: '/codex',
      h1: 'Codex',
      lede: 'Rules that outlive any single project, each with a lab bench you can poke. Filed under geometry, sound and headless evolution.',
      open: 'Open the bench',
      back: 'All codex cards',
    },
    zahuopu: {
      kicker: '/zahuopu',
      h1: 'Cyber Bodega',
      lede: 'Small tools on the shelf. No sign-up, no cover charge, no line at the register.',
      sign: 'open 24/7',
      menu: 'On the shelf',
      also: 'Looking for the office monks? They live at the temple.',
      alsoGo: 'QIANSHOU LAB',
    },
    foot: {
      qianshou: 'QIANSHOU LAB',
      zahuopu: 'Cyber Bodega',
      mail: 'Send a pigeon (email)',
      purity: 'Purity check',
      pass: 'clean · no flesh detected',
      fail: 'flesh detected',
      scanning: 'scanning…',
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
    hl: {
      title: 'HEADLESS MODE · renderer destroyed',
      canvas: 'canvases destroyed',
      frame: 'last render frame',
      now: 'frames now',
      tree: 'text structure',
      chars: 'chars',
      none: 'no render loop ran on this page',
    },
  },

  zh: {
    site: {
      title: '零肉身造物 · Zero-Flesh Creation',
      desc: '零肉身造物：用纯数学公式、Web Audio 实时合成和无头模拟造数字物种的实验室。零网格、零采样、零位图。千手院和赛博杂货铺的家。',
      skip: '跳到正文',
    },
    nav: { label: '栏目', home: '观测台', specimens: '样本档案', artifacts: '自研造物', codex: '造物法则' },
    lang: { label: '语言' },
    mode: { label: '肉身还是无头', render: '肉身', headless: '无头' },
    sfx: { label: '界面音效' },
    home: {
      kicker: '观测台',
      h1: '不要皮囊，只要公式。',
      lede: '用公式捏骨，用振荡器发声，让 AI 在黑盒里互殴调平：这里是数字物种的造物实验室。本站一张图、一个字体包、一秒录音都没有。',
      vp: { name: 'viewport/01 · superformula', drag: '拖一下能转', species: '物种' },
      doorsLabel: '两扇门',
      qianshou: {
        name: '千手院', alt: 'QIANSHOU LAB',
        sub: '千僧替牛马，施主自风流。',
        meta: '在岗罗汉 10 尊 · 专治办公苦活',
        go: '进山门',
      },
      zahuopu: {
        name: '赛博杂货铺', alt: 'Cyber Bodega',
        sub: '小工具都在货架上，拿了就走。',
        meta: '货架上 {n} 样 · 手机上的小活',
        go: '逛货架',
      },
      cta: '解剖样本 001', toHeadless: '切换无头态', toRender: '恢复肉身渲染',
      lab: { no: '§01', t: '实验室', sub: '三个抽屉，一条规矩：不准有资产。' },
      latest: { no: '§02', t: '最新归档', all: '全部', empty: '这格还空着，东西在炉子里。' },
      manifesto: {
        no: '§03', t: '造物宣言',
        rules: [
          ['0 × .fbx / .glb', '不要网格。躯干拿几何原语拼，关节拿三角函数掰。'],
          ['0 × .mp3 / .wav', '不要采样。挥砍、重击、吟唱，在攻击判定那一毫秒当场捏出来。'],
          ['0 × .png / 关键帧', '不要位图和关键帧。着色器直接改像素，公式直接摆姿势。'],
          ['∞ × 无头死斗', '平衡靠黑盒：关掉画面，让 AI 互殴几千场，胜率自己收敛。'],
        ],
        quote: '人类不再扮演搬运像素的苦力，只负责制定物理法则与充当算法互殴的典狱长。',
        principle: '知行合一：本站自己也是一具零肉身造物，没有图片、字体包和音频。页脚实时清点每一个请求，不信你看。',
      },
    },
    company: {
      h: '零肉身造物 | Zero-Flesh Creation',
      p1: '一家彻底摒弃了碳基雇员的纯硅基作坊',
      motto: '——把折磨肉体的活交给代码，把肉身还给生活。',
      addr: '公司地址：可观测宇宙 · 拉尼亚凯亚超星系团 · 银河系郊区猎户座支臂 · 距银心约 2.6 万光年处 · 绕行一颗 G2V 型黄矮星的第三颗蓝色水球表面（导航请搜：地球）',
    },
    cols: {
      specimens: { name: '样本档案', desc: '拆解野生的零肉身标杆，把背后的公式抠出来，钉上标本板。' },
      artifacts: { name: '自研造物', desc: '自己手搓的纯代码原型：上面能玩，下面是源码和手感复盘。' },
      codex: { name: '造物法则', desc: '常青法则，自带旋钮：几何捏骨、声学合成、无头演化。' },
      latest: '最新',
      none: '还在炉子里',
    },
    kind: { specimen: '样本', artifact: '自研', codex: '法则', log: '日志' },
    status: { live: '已上线', wip: '炉子里' },
    specimens: {
      kicker: '/specimens',
      h1: '样本档案',
      lede: '野生零肉身项目的观察笔记。每个样本一张档案卡、一个实机切片、一篇拆解。',
      read: '看拆解',
    },
    specimen: {
      card: '档案卡',
      id: '编号', date: '归档日期', species: '物种形态', scale: '复杂度规模', stack: '算力包工头', source: '原始信源', live: '实机切片',
      play: '进实机切片', post: '看原帖',
      back: '全部样本',
      chars: '字',
    },
    artifacts: {
      kicker: '/artifacts',
      h1: '自研造物',
      lede: '亲手写的纯代码原型。上面一块能全屏试玩的沙盒，下面是源码和手感复盘。',
    },
    codex: {
      kicker: '/codex',
      h1: '造物法则',
      lede: '跨项目通用的常青法则，每张都带一张能上手拧的实验台。按几何捏骨、声学合成、无头演化分类归档。',
      open: '上实验台',
      back: '全部法则',
    },
    zahuopu: {
      kicker: '/zahuopu',
      h1: '赛博杂货铺',
      lede: '小工具都在货架上。不用注册，不收门票，结账不用排队。',
      sign: '营业中 24/7',
      menu: '货架',
      also: '找办公室那群和尚？他们住在山上的千手院。',
      alsoGo: '千手院',
    },
    foot: {
      qianshou: '千手院',
      zahuopu: '赛博杂货铺',
      mail: '飞鸽传书（发邮件）',
      purity: '纯洁度检疫',
      pass: '干净 · 未检出肉身',
      fail: '检出肉身',
      scanning: '扫描中…',
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
    hl: {
      title: '无头模式 · 渲染器已销毁',
      canvas: '画布已销毁',
      frame: '最后一帧渲染耗时',
      now: '当前帧数',
      tree: '纯文本结构树',
      chars: '字',
      none: '这一页没有跑过渲染循环',
    },
  },
} as const;

export type Lang = keyof typeof ui;

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
