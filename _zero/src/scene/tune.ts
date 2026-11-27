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

/** 门开多大（度）：[P, 角度]，中间平滑过渡。Ⅰ 末 6°；Ⅱ–Ⅵ 6°–14°；Ⅳ 鲸出来时 28°；Ⅶ 末 78° */
export const DOOR_DEG: [number, number][] = [
  [0, 0], [0.42, 0], [0.7, 6], [1, 6],
  [1.04, 6], [1.16, 13], [1.5, 13], [1.85, 8],
  [2.04, 8], [2.14, 14], [2.6, 12], [2.95, 9],
  [3.02, 9], [3.14, 28], [3.42, 28], [3.64, 12], [3.95, 10],
  [4.02, 10], [4.1, 14], [4.4, 9], [4.47, 9], [4.53, 17], [4.8, 11], [4.97, 11],
  [5.02, 11], [5.5, 14], [6.02, 14],
  [6.3, 20], [6.72, 78], [7, 78],
];

/** 开场（第一幕）自己放多久；同一次访问再回来快进多久 */
export const OPENER_MS = 10000;
export const FF_MS = 1500;
/** 滚动跟手的平滑（秒）：越小越跟手 */
export const SMOOTH_S = 0.14;
/** 第五幕顿帧：滑过那一拍时，真实时间里停多久（毫秒） */
export const HITSTOP_MS = 240;

/** 三档力气：每样造物最多多少块石头（实例顺序打乱过，砍掉后一半形状还在） */
export const TIERS = {
  high: { sun: 2600, flares: 1000, ring: 2600, whale: 3200, arm: 1900, stars: 1800, dust: 700, dprMax: 2, refl: 0.5, creationRefl: true },
  mid: { sun: 1600, flares: 600, ring: 1600, whale: 2000, arm: 1200, stars: 1100, dust: 420, dprMax: 1.6, refl: 0.42, creationRefl: true },
  low: { sun: 800, flares: 300, ring: 800, whale: 1000, arm: 600, stars: 600, dust: 220, dprMax: 1.25, refl: 0.33, creationRefl: false },
} as const;
export type Tier = keyof typeof TIERS;

/** 胶片曲线的曝光 */
export const EXPOSURE = 0.62;

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
