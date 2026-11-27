// 造物之门（零肉身造物 v3）：所有能调的数都在这一个文件里。
// 颜色、每幕滑多长、镜头离门多远、地平线多高、门开多大、每幕要看得见多大一块天……改这里就够，别处不写死数。
// 进度 P：0..7。第 k 幕占 [k-1, k]；第一幕 [0,1] 是开场自己放（10 秒），往下滑走 1..7。

/** 七幕的光：Ⅰ 白、Ⅱ 琥珀金、Ⅲ 品红、Ⅳ 冷青、Ⅴ 暗红、Ⅵ 靛紫、Ⅶ 五色合回白（下标 = 幕号 - 1） */
export const ACT_HEX = ['#FFFFFF', '#FFB24A', '#FF4FA3', '#6FE7FF', '#E5382B', '#8A7BFF', '#FFFFFF'] as const;
/** 五个栏目（门上五撮，01..05）各自的颜色 = 它那一幕的光 */
export const SECTION_HEX = ACT_HEX.slice(1, 6) as unknown as readonly string[];

/** 每幕滑多长（单位：屏）。lead：首屏往下滑这么多才开始第二幕（手一碰不至于马上开造）。 */
export const SCROLL = {
  lead: 0.2,
  acts: [1.5, 1.5, 1.5, 1.5, 1.5, 1.8],   // Ⅱ Ⅲ Ⅳ Ⅴ Ⅵ Ⅶ
};
/** 整页多高（屏）= 首屏 1 屏 + lead + 六幕 */
export const PAGE_SCREENS = 1 + SCROLL.lead + SCROLL.acts.reduce((a, b) => a + b, 0);   // 10.5

export const INTRO_MS = 10000;   // 第一幕：自己放 10 秒
export const FF_MS = 1500;       // 同一次访问再回来、或者开场时碰了一下：1.5 秒快进到位
export const SMOOTH = 6.5;       // 滚动平滑（每秒），越大越跟手
export const BREATH_MS = 7000;   // 光的呼吸：7 秒一口

/** 门：两扇，合起来还是碑的比例 厚 1 : 宽 4 : 高 9；每扇 6 × 27 块 */
export const GATE = {
  H: 240,
  W: (240 * 4) / 9,
  T: 240 / 9,
  Z: -1000,          // 门正面的 z（人站在 z = 0 的水边）
  COLS: 12,
  ROWS: 27,
};
export const EYE = 1.7;            // 眼睛离水面多高
export const SRC_BACK = 46;        // 光源那个面在门背后多远

/** 镜头到门的距离：下标 = P（0..7）。Ⅰ 1000，Ⅵ 末 640，Ⅶ 末 110 */
export const CAM_DIST = [1000, 1000, 930, 862, 792, 716, 640, 110];

/** 地平线离屏幕底边多高（占屏高）：首屏 0.40（手机竖屏 0.355），进了各幕降到 0.28（手机 0.24） */
export const HORIZON = { hero: 0.4, heroPortrait: 0.355, acts: 0.28, actsPortrait: 0.24 };

/**
 * 每幕要看得见多大一块（门那个平面上，世界单位）：top = 水面以上要看到多高，half = 左右各要看到多宽。
 * 竖屏 halfP 单独定（窄屏不硬塞，环、轨道两边出框也行）。镜头视角按这块算，字和 3D 用同一把尺子。
 * 下标 = 幕号（0 = 开场黑屏，1 = 首屏）。
 */
export const FRAME: { top: number; half: number; halfP: number }[] = [
  { top: 380, half: 150, halfP: 150 },   // 0 开场
  { top: 380, half: 150, halfP: 150 },   // Ⅰ 首屏：门占屏高 38%（跟 v2 黑碑一样大）
  { top: 470, half: 220, halfP: 160 },   // Ⅱ 燃日：太阳升到门顶上，头顶要留出火舌的地方
  { top: 452, half: 260, halfP: 170 },   // Ⅲ 布环：环绕门一圈
  { top: 434, half: 270, halfP: 175 },   // Ⅳ 赋生：鲸绕门、升天成星座
  { top: 416, half: 250, halfP: 165 },   // Ⅴ 铸器：浑天仪悬在门前
  { top: 398, half: 300, halfP: 185 },   // Ⅵ 立法：轨道绕住整道门（top 一幕比一幕小：每走近一段，门大一圈）
  { top: 398, half: 300, halfP: 185 },   // Ⅶ 收工：镜头往前走（视角沿用第六幕，门越走越高）
];
/** 超宽屏：造物永远落在正中 16:9 的框里，两边多出来的只是更长的地平线和更多的黑 */
export const MAX_ASPECT = 16 / 9;

/** 门开多大（度）：[P, 角度]，中间平滑插值。Ⅰ 末 6°；Ⅱ–Ⅵ 在 6–14°；Ⅳ 鲸出来时开到 28° 再合回去；Ⅶ 末 78° */
export const DOOR: [number, number][] = [
  [0.0, 0], [0.4, 0], [0.72, 6], [1.0, 6],
  [1.12, 7.5], [2.0, 7.5], [2.12, 9], [3.0, 9],
  [3.1, 10], [3.2, 28], [3.62, 28], [3.86, 11],
  [4.1, 12], [5.0, 12], [5.1, 14], [6.0, 14],
  [6.55, 16], [6.86, 78], [7.0, 78],
];

/** 门上五撮（01..05）在第几幕离开：第 k 撮在第 k+2 幕开头松动（Ⅱ 千手院 … Ⅵ 法典） */
export const CLUSTER_ACT = [2, 3, 4, 5, 6];

/** 三档力气：石块数、要不要造物倒影、要不要光晕、分辨率倍率 */
export const TIERS = {
  high: { blocks: 1, reflect: true, glow: true, res: 1, maxDpr: 2 },
  mid: { blocks: 7 / 12, reflect: true, glow: false, res: 1, maxDpr: 2 },
  low: { blocks: 3.5 / 12, reflect: false, glow: false, res: 0.72, maxDpr: 1.5 },
} as const;
export type Tier = keyof typeof TIERS;

/** 每幕造的东西用多少块（高档的数；中档、低档按 TIERS.blocks 砍后一半——顺序打乱过，砍了形状还在） */
export const COUNTS = {
  sun: 2600,
  ring: 2900,
  moon: 72,        // 每颗小月
  whale: 2800,
  forge: 2200,     // 浑天仪本身
  debris: 1100,    // 第五幕往红点里坍缩的碎石（炸开以后变成火星落水）
};

/** 每幕的名字什么时候写（幕内进度）：造完了才写——鲸要绕完一圈、钉成星座；浑天仪要冷下来；星空要散开 */
export const NAME_AT = [0, 0, 0.62, 0.6, 0.86, 0.74, 0.84, 0.86];

/** 帧时间目标：电脑 60 帧，手机不低于 30 帧（超了就降一档，连续有余量再升） */
export const FPS_TARGET = { desk: 60, phone: 30 };

/** 截图、静态图用的进度：七幕各一张（第 k 幕造完、名字写好的那一刻） */
export const SHOT_P = [1, 2, 3, 4, 5, 6, 7];

export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return [c[0], c[1], c[2]];
}
