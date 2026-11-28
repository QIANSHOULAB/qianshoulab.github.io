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
  rise: [0.13, 0.76] as [number, number],    // 石头升天：第一块松开 → 最后一颗星到位
  gone: [0.22, 0.54] as [number, number],    // 门洞里那片光跟着石头走光
  fam: [0.05, 0.52] as [number, number],     // 日、环、鲸、器、轨道先离开门，升到天上各自的位置（门留给它自己裂开）
  neb: [0.3, 0.84] as [number, number],      // 五种颜色从五样造物身上散开，铺满天
  cam: [0.24, 0.94] as [number, number],     // 镜头抬头、升高、视角放宽
  camY: 330,                                 // 镜头最后升多高（门高 240）
  camD: 600,                                 // 镜头最后离门原来的位置多远
  pitchDeg: [14, 20] as [number, number],    // 最后抬头多少度：电脑、手机竖着
  peakDeg: [22, 27] as [number, number],     // 石头飞上去的时候，镜头跟着多抬一点
  tanV: [0.5, 0.8] as [number, number],      // 最后的竖直半视角（正切）：电脑、手机竖着
  horizon: [0.25, 0.26] as [number, number], // 最后地平线离底边多高（屏高的几分之几）：电脑、手机竖着
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

export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return c as [number, number, number];
}
