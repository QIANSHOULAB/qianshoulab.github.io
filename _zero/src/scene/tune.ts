// 造物之门：所有能调的数都在这一个文件里（颜色、每幕滑多长、镜头多远、地平线多高、门开多大、每档多少块石头）。
// 改这里就够了，别的文件只读。数值上线前照真机再调。

/** 每幕的颜色（sRGB）。光的芯子永远发白，只有外圈带这个颜色。 */
export const ACT_HEX = {
  light: '#FFFFFF',   // Ⅰ 启光
  sun: '#FFB24A',     // Ⅱ 燃日 · 01 千手院（琥珀金）
  ring: '#FF4FA3',    // Ⅲ 布环 · 02 赛博杂货铺（品红）
  life: '#6FE7FF',    // Ⅳ 赋生 · 03 标本（冷青）
  fire: '#E5382B',    // Ⅴ 铸器 · 04 文物（暗红）
  law: '#8A7BFF',     // Ⅵ 立法 · 05 法典（靛紫）
} as const;

/** 五个栏目各自的颜色（顺序 = 五撮 = 第二到第六幕） */
export const SECTION_HEX = [ACT_HEX.sun, ACT_HEX.ring, ACT_HEX.life, ACT_HEX.fire, ACT_HEX.law] as const;

/**
 * 这个世界的暗（v3.2，Song 11-28 09:01「一开始的黑也不是纯黑，是某种颜色的深色但接近黑色」，09:13 选的 A 墨蓝）。
 * 天、水、暗角、页面底色都是它，从开场一直用到结尾；每一幕的光照旧叠在它上面（画面里没有一块纯黑 #000）。
 * 第一眼以为是黑，跟纯黑并排才看得出颜色；饱和度收着，不做成「深蓝科技风」。亮度上限 #0A0C14 那一档。
 * sky：天、页面底色、iPhone Safari 顶上底下两条（theme-color）、四个栏目页的底色。
 * water：水比天再暗一点。door：门比底色更暗——开场光还没出来的时候，门是暗里更暗的一块，轮廓读得出来。
 */
export const INK = {
  sky: '#05070E',     // 加上页面那层胶片颗粒（平均抬亮 2–3 级），眼睛看到的约 #07090F
  water: '#04060B',
  door: '#020306',
} as const;

/** 「目录」快进（v3.2）：从现在的进度快进到结尾「开天」那片天。离得远走满 maxMs，近的短些，但不短于 minMs；起步、收尾都缓 */
export const INDEX = {
  maxMs: 2800,
  minMs: 800,
  /** 快进的缓动（三次贝塞尔，跟 CSS 的 cubic-bezier 一个意思）：起步慢、中间快、收尾拖长一点，让「开天」那一段落得慢 */
  ease: [0.5, 0, 0.18, 1] as [number, number, number, number],
};

/**
 * 天上的五个名字（v3.2）：「开天」落定以后，五样造物旁边各亮起自己的名字。
 * show：进度过了这里才亮（照造出来的先后一个个亮，每个隔 stagger 毫秒）；hide：往回滑到这里以下，名字一下子收掉（造物 6.52 以下才开始飞回去，名字先走）。
 */
export const NAMES = {
  show: 6.8,
  hide: 6.7,
  stagger: 170,
};

/**
 * 展示位置（v3.3，一处说了算）：每一幕停在哪（进度 P）。首屏 1（滚动 0）；第二到第六幕 k − 0.12（这一幕走过 88%，名字聚好、画面到位）；
 * 「开天」7（往下那段页尾 tail 都算到位）。刻度、「目录」、Tab、键盘翻页、后退回来、停手以后，全用这一张表。
 */
export const REST_PS = [1, 1.88, 2.88, 3.88, 4.88, 5.88, 7] as const;
/** 第 k 幕（1..7）的展示位置 */
export function restP(k: number) { return REST_PS[Math.max(1, Math.min(7, Math.round(k))) - 1]; }

/**
 * 停手以后自己走到展示位置（v3.3，Song 11-28 10:11）。门槛按滚动的屏数算，不按 P 算（首屏那段 hold 里 P 一直是 1）。
 * 时长按距离（进度）开方：一整幕约 actMs；走进「开天」那一段按 skyW 倍距离算（约 2 秒，收尾那场戏别一闪而过）。
 */
export const SETTLE = {
  wheelQuietMs: 200,    // 滚轮、触控板多久没有新输入算停手
  scrollQuietMs: 140,   // 手指离开以后，惯性多久没再滚算停了
  endQuietMs: 70,       // 浏览器报了 scrollend：再等这么久没有新的滚动就算停了
  jitter: 0.05,         // 离起点不到这么多屏：小抖动，回原位
  overshoot: 0.25,      // 刚冲过一个展示位置不到这么多屏：退回那个
  actMs: 1200,          // 一整幕（进度 1）走多久
  skyW: 2.8,            // 「开天」那一段按几倍距离算
  minMs: 380,
  maxMs: 2600,
  ease: [0.42, 0, 0.22, 1] as [number, number, number, number],   // 起步缓、落地缓
};

/**
 * v3.4 手机竖屏（Song 11-28 14:10「手机上这两个挤在一起了」）：每一幕的展示位置上，已经造出来的东西停在屏幕哪。
 * 只管宽高比 < 0.8 的屏（跟 v3.2 换竖版静态图同一条线，平板竖着也算），≥ 0.8（电脑、平板横着）一个像素不动。
 * 每个落点 [nx, ny, d]：屏幕坐标（-1..1，y 朝上，按那一幕展示位置上的镜头算）、离镜头多远（世界单位；门在约 1000 外）。
 * 东西本身的大小不改，远近就是大小：放远一点，屏幕上就小一点。
 * 新东西诞生那一下照原样演；前面造好的东西在新一幕开头那一段（幕内 push）挪到这一幕的落点，跟 v3.2 以前日「让位」一个节奏。
 */
export const PHONE = {
  aspect: 0.8,                                 // 宽高比 < 0.8 换成这一套（一刀切）
  push: [0.02, 0.32] as [number, number],      // 前面造好的东西在新一幕的这一段（幕内进度）挪到新落点
  sun: {
    3: [-0.42, 0.52, 1150],
    4: [-0.5, 0.6, 1150],
    5: [-0.5, 0.64, 1150],
    6: [-0.5, 0.66, 1150],
  } as Record<number, [number, number, number]>,
  whale: {
    4: [0.34, 0.36, 1550],
    5: [0.38, 0.6, 1600],
    6: [0.38, 0.62, 1600],
  } as Record<number, [number, number, number]>,
  arm: {
    5: [-0.24, 0.33, 1500],
    6: [-0.3, 0.34, 1500],
  } as Record<number, [number, number, number]>,
  /** 器炸开以后从门前挪到自己的落点（幕内进度 F，炸开从 0.45 起，展示位置 0.83） */
  armGo: [0.6, 0.82] as [number, number],
  /** 环聚好以后升到门顶这一圈（世界 y，门高 240），名字就能贴着它摆在门上方；幕内这一段升上去 */
  ringY: 205,
  ringUp: [0.42, 0.8] as [number, number],
  /** 升上去以后环多大（电脑 1、手机原来 0.86；镜头往前推，第四到第六幕环要整个在屏里） */
  ringS: 0.72,
  /** 升上去以后环往前倾多少（弧度）：第三到第五幕、第六幕（电脑上是 0.24、0.44） */
  ringTilt: [0.06, 0.3] as [number, number],
  /** 第六幕三道轨道：[半径, 往前倾多少（弧度）]（器、鲸、日那三道；电脑上半径 150、240、265，倾 0.3–0.36） */
  orbits: [[205, 0.5], [235, 0.42], [265, 0.36]] as [number, number][],
  /** 第六幕：手机上日、鲸、器不挂到轨道上转（屏太窄，转着转着总要撞上），停在自己的落点；三道轨道照常从器的三道环放大出来 */
};

/**
 * 第七幕「开天」手机竖屏上五样停在天上哪（v3.2 定的摆法，v3.4 挪了一点：鲸在天上兜圈子、转着头游，兜到哪都不许撞上日和环）。
 * tall：细长的手机（那句话下面那截天够摆浑天仪，390×844 这种）；short：矮的（390×664、iPhone SE，退路 B）。
 * 日、器 [nx, ny, 半径占屏高]；鲸 [nx, ny, 体长占屏宽, 兜圈的半径占屏宽]；环 [nx, ny, 半径占屏宽]。器的 tall[1] 是在「那句话下面那截天」正中再挪多少。
 */
export const SKY_PHONE = {
  sun: { tall: [-0.42, 0.72, 0.042], short: [-0.5, 0.74, 0.04] },
  whale: { tall: [0.2, 0.5, 0.32, 0.03], short: [0.06, 0.54, 0.28, 0.03] },
  ring: { tall: [0.42, 0.13, 0.21], short: [0.56, 0.22, 0.15] },
  arm: { tall: [-0.56, 0, 0.046], short: [-0.62, 0.2, 0.046] },
  /** 鲸的体长、环的半径最多占屏高几成（手机上按屏宽算出来的都在这以下；平板竖着那种宽一点的竖屏才用得上） */
  capH: [0.15, 0.1] as [number, number],
};

/** 滚动长度（单位：一屏高）。首屏停一小段，第二到第七幕各滑这么多，最后再留一点。全程约十屏半。 */
export const SCROLL = {
  hold: 0.35,
  acts: [1.5, 1.5, 1.7, 1.5, 1.7, 1.9],   // Ⅱ Ⅲ Ⅳ Ⅴ Ⅵ Ⅶ
  tail: 0.45,
};

/** 镜头到门的距离（世界单位，门高 240）：P = 0..7 每幕结束时 */
export const CAM_D = [1000, 1000, 950, 890, 820, 790, 760, 330];

/** 地平线离底边多高（屏高的几分之几）：首屏、各幕；手机竖着另一套 */
export const HZF = { hero: 0.40, act: 0.28, end: 0.31, heroPhone: 0.355, actPhone: 0.24, endPhone: 0.27 };

/** 门开多大（度）：[P, 角度]，中间平滑过渡。Ⅰ 末 6°；Ⅱ–Ⅵ 6°–14°；Ⅳ 鲸出来时 28°；Ⅶ 一进来最后推一次，推到全开（84°），然后门自己裂开 */
export const DOOR_DEG: [number, number][] = [
  [0, 0], [0.42, 0], [0.7, 6], [1, 6],
  [1.04, 6], [1.16, 13], [1.5, 13], [1.85, 8],
  [2.04, 8], [2.14, 14], [2.6, 12], [2.95, 9],
  [3.02, 9], [3.14, 28], [3.42, 28], [3.64, 12], [3.95, 10],
  [4.02, 10], [4.1, 14], [4.4, 9], [4.47, 9], [4.53, 17], [4.8, 11], [4.97, 11],
  [5.02, 11], [5.5, 14], [6.02, 14],
  [6.15, 84], [7, 84],
];

/**
 * 第七幕「开天」（v3.1，Song 11-28 选的 A）：门推到全开 → 门自己裂开，几百块石头一块块松开、往上飞，飞的时候被光点亮，
 * 到了天上炸成满天的星 → 五种颜色从五样造物身上散开，铺成整片星云 → 镜头从贴着水面慢慢抬头、升高，水面落到下面成一面镜子。
 * 下面的数都是第七幕的幕内进度（0..1，P = 6 + 它）。
 */
export const SKY = {
  crack: [0.08, 0.18] as [number, number],   // 缝里透光、门轻轻抖
  rise: [0.14, 0.86] as [number, number],    // 石头升天：第一块松开 → 最后一颗星到位（6.5 正是满天石头往上飞的时候）
  gone: [0.24, 0.6] as [number, number],     // 门洞里那片光跟着石头走光
  fam: [0.05, 0.52] as [number, number],     // 日、环、鲸、器、轨道先离开门，升到天上各自的位置（门留给它自己裂开）
  neb: [0.4, 0.86] as [number, number],      // 五种颜色从五样造物身上散开，铺满天（石头飞得最欢的时候星云才刚冒头，不抢戏）
  cam: [0.24, 0.94] as [number, number],     // 镜头抬头、升高、视角放宽
  camY: 330,                                 // 镜头最后升多高（门高 240）
  camD: 600,                                 // 镜头最后离门原来的位置多远
  pitchDeg: [14, 20] as [number, number],    // 最后抬头多少度：电脑、手机竖着
  peakDeg: [22, 27] as [number, number],     // 石头飞上去的时候，镜头跟着多抬一点
  tanV: [0.5, 0.8] as [number, number],      // 最后的竖直半视角（正切）：电脑、手机竖着
  horizon: [0.25, 0.26] as [number, number], // 最后地平线离底边多高（屏高的几分之几）：电脑、手机竖着
};

/**
 * 星尘字（v3.3，Song 11-28 10:31 选的 A）：字也是造出来的。
 * 聚的过程跟着进度走：第 k 幕的名字从这一段 actF[0] 开始聚，到 actF[1]（展示位置 0.88 之前）聚好；往前走过 actOut 散回去。
 * 碎块预算（高档每份多少块；中档、低档按 tierK 打折；低档少用碎块、多靠清楚的字淡进来）。
 */
export const DUST = {
  actF: [0.5, 0.86] as [number, number],
  actOut: [0.92, 0.995] as [number, number],
  motto: [6.6, 6.95] as [number, number],       // 那句话：门上飞上天的星，其中一部分聚成它
  sky: [6.74, 6.92] as [number, number],        // 天上五个名字（照造出来的先后，每个晚 skyStagger）
  skyStagger: 0.035,
  smooth: 0.22,          // 显示出来的「聚到哪了」按真实时间追（秒）：一下子跳过去也看得见聚
  langMs: 600,           // 换语言：散开、重新聚
  actN: 1100,            // 每个栏目名多少块碎块（高档）
  skyN: 340,             // 天上每个名字
  mottoEvery: [2, 5] as [number, number],   // 那句话：天上的星每 5 颗里 2 颗去聚它
  mote: 0.035,           // 聚好以后留下来慢慢飘的光点（占碎块的几成）
  tierK: { high: 1, mid: 0.62, low: 0.26 },
  textDprMax: { high: 3, mid: 3, low: 2 },  // 清楚的字按原生分辨率画（画面本身照档位降）
  actPx: [26, 38, 0.025] as [number, number, number],   // 栏目名字号：电脑 clamp(26px, 2.5vw, 38px)
  actPxPhone: 23,
  mottoDepth: 1900,      // 那句话离镜头多远（星在 2600 那个球上）
  listDepth: 1400,       // 退路 B 的列表排在天上这个深度
};

/** 开场（第一幕）自己放多久；同一次访问再回来快进多久 */
export const OPENER_MS = 10000;
export const FF_MS = 1500;
/** 滚动跟手的平滑（秒）：越小越跟手 */
export const SMOOTH_S = 0.14;
/** 第五幕顿帧：滑过那一拍时，真实时间里停多久（毫秒） */
export const HITSTOP_MS = 240;

/** 三档力气：每样造物最多多少块石头（实例顺序打乱过，砍掉后一半形状还在）。
 *  skyStars：第七幕门上的石头炸成多少颗星；nebula：星云几层（2 = 云 + 丝 + 尘，1 = 云 + 尘，少一层丝；样子不变，只是糙一点） */
export const TIERS = {
  high: { sun: 2600, flares: 1000, ring: 2600, whale: 3200, arm: 1900, stars: 1800, dust: 700, skyStars: 2600, nebula: 2, dprMax: 2, refl: 0.5, creationRefl: true },
  mid: { sun: 1600, flares: 600, ring: 1600, whale: 2000, arm: 1200, stars: 1100, dust: 420, skyStars: 1600, nebula: 2, dprMax: 1.6, refl: 0.42, creationRefl: true },
  low: { sun: 800, flares: 300, ring: 800, whale: 1000, arm: 600, stars: 600, dust: 220, skyStars: 800, nebula: 1, dprMax: 1.25, refl: 0.33, creationRefl: false },
} as const;
export type Tier = keyof typeof TIERS;

/** 胶片曲线的曝光 */
export const EXPOSURE = 0.62;
/** 第七幕星云多亮（全片最亮、最满的一刻，但不许白光吞屏） */
export const NEB_I = 1.0;

/** 每幕「进去」以后多久跳到栏目页（毫秒） */
export const DIVE_MS = 1700;

/** #RRGGBB → [r, g, b]（0..1，还是 sRGB 的值，不转线性）：着色器里「暗」是在显示空间里垫的 */
export function hexToUnit(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
/** #RRGGBB → "r, g, b"（给 CSS 的 rgba(var(--night-rgb), a) 用） */
export function hexToRgbList(hex: string) {
  return hexToUnit(hex).map((v) => Math.round(v * 255)).join(', ');
}

export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return c as [number, number, number];
}
