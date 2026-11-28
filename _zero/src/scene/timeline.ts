// 时间线：画面只认一个 0..7 的进度数 P（平滑后的滚动位置）和一个时钟（秒）。
// 同一个 P 永远是同一个画面（时钟只管呼吸、自转、绕行这些「活着」的小动作），倒着滑就是倒放。
// P 0..1 第一幕（开场自己放），1..2 第二幕……6..7 第七幕。这里只算数，不碰 three.js，也不碰 DOM。
import { H, W, T, Z_FRONT } from './layout';
import { ACT_HEX, CAM_D, DOOR_DEG, HZF, SKY, hexToLinear } from './tune';

export type V3 = [number, number, number];
export type Q = [number, number, number, number];

export const EYE = 1.7;
export const DC: V3 = [0, H / 2, Z_FRONT - T / 2];          // 门的正中（绕行的圆心）
const Z0 = Z_FRONT;

// —— 小工具 ——
export const cl = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ss = (a: number, b: number, x: number) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix3 = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const norm3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const qAxis = (ax: V3, ang: number): Q => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };
export const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export function qSlerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? (d = -d, b.map((v) => -v) as Q) : b;
  if (d > 0.9995) { const r = a.map((v, i) => v + (bb[i] - v) * t) as Q; const l = Math.hypot(...r); return r.map((v) => v / l) as Q; }
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb) as Q;
}
/** 四元数 → 3×3 矩阵（按列排，给 three 的 Matrix3.fromArray） */
export function qMat(q: Q): number[] {
  const [x, y, z, w] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
}
export function qRot(q: Q, v: V3): V3 {
  const m = qMat(q);
  return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
}
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];

/** 第七幕：造物离开门、去天上自己的位置——先往自己那一边甩出去，再升上去（不从门顶正上方过：那会像「门上一只眼」） */
function swing(a: V3, b: V3, k: number, side: number): V3 {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const c: V3 = [(a[0] + b[0]) / 2 + side * 320, Math.min(a[1], b[1]) + 40, (a[2] + b[2]) / 2 + 120];
  const u = 1 - k;
  return [u * u * a[0] + 2 * u * k * c[0] + k * k * b[0], u * u * a[1] + 2 * u * k * c[1] + k * k * b[1], u * u * a[2] + 2 * u * k * c[2] + k * k * b[2]];
}

function keyed(P: number, keys: [number, number][]) {
  if (P <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (P <= keys[i][0]) return mix(keys[i - 1][1], keys[i][1], ss(keys[i - 1][0], keys[i][0], P));
  }
  return keys[keys.length - 1][1];
}

/** 版面：竖屏有多「竖」（0 = 横屏电脑，1 = 手机竖着）、宽高比、竖直半视角的正切。
 *  v3.2 手机竖屏：tall = 那句话下面、页脚上面还空着够大的一截天（home.ts 量的），浑天仪落在那一截正中（band，屏幕坐标 y）；不够大就五样都摆在那句话上面 */
export interface View { narrow: number; aspect: number; tanV: number; tall?: number; band?: number }

// —— 五样造物的颜色（线性）——
export const COL = {
  white: [1, 1, 1] as V3,
  sun: hexToLinear(ACT_HEX.sun), ring: hexToLinear(ACT_HEX.ring), life: hexToLinear(ACT_HEX.life),
  fire: hexToLinear(ACT_HEX.fire), law: hexToLinear(ACT_HEX.law),
};
const ACT_COL: V3[] = [COL.white, COL.white, COL.sun, COL.ring, COL.life, COL.fire, COL.law, COL.white];

// —— 第六幕的轨道：半径、倾角、升交点、周期（秒）、哪一段幕内进度把它画出来 ——
export interface Orbit { R: number; incl: number; node: number; period: number; from: number; to: number; ph0: number }
export const ORBITS: Orbit[] = [
  // 镜头贴着水面往上看：轨道前半圈要往下压（倾角为正），不然经过镜头前面时会冲出屏幕顶
  { R: 150, incl: 0.3, node: 0.55, period: 28, from: 0.05, to: 0.25, ph0: 0.8 },     // 器
  { R: 240, incl: 0.36, node: -0.5, period: 46, from: 0.2, to: 0.42, ph0: 2.6 },     // 鲸座
  { R: 265, incl: 0.32, node: 0.2, period: 66, from: 0.36, to: 0.58, ph0: 0.9 },     // 日
];
export const orbitQ = (o: Orbit): Q => qMul(qAxis(Y, o.node), qAxis(X, o.incl));
export function orbitPos(o: Orbit, ph: number, rScale = 1): V3 {
  return add3(DC, qRot(orbitQ(o), [o.R * rScale * Math.cos(ph), 0, o.R * rScale * Math.sin(ph)]));
}

// —— 鲸游的路：从门缝正中出来，绕门一周（左 → 门后 → 右 → 回到前面），再往上升。着色器里有一模一样的一份 ——
export const WHALE_L = 300;
export const WHALE_R = 240;
export function wPath(ph: number, R = WHALE_R): V3 {
  const k = 1.5;
  const y = 118 + 22 * Math.sin(ph * 0.8) * ss(0, 1, ph) + Math.max(ph - 6.2, 0) * 60;
  if (ph < 0) return [0, y, DC[2] + ph * R * k];
  const r = R * (1 - Math.exp(-ph * k));
  return [-r * Math.sin(ph), y, DC[2] + r * Math.cos(ph)];
}
function wSpeed(ph: number, R = WHALE_R) {
  const k = 1.5;
  if (ph < 0) return R * k;
  const r = R * (1 - Math.exp(-ph * k)), dr = R * k * Math.exp(-ph * k);
  return Math.hypot(r, dr) + 1;
}

/** 第三幕的小月：环上第 m 颗（共 n 颗）现在转到哪、出没出来 */
export const RING_R = 175;
const RING_ENTRY = Math.PI / 2, RING_TRAV = 0.18;
export function moonAngle(form: number, m: number, n: number, spin: number) {
  const age = form - (m / n) * 0.8;
  return { ang: RING_ENTRY + ((age - RING_TRAV) / (1 - RING_TRAV)) * Math.PI * 2 + spin, out: ss(RING_TRAV, RING_TRAV + 0.05, age) };
}

export interface State {
  P: number;
  a: number[];                      // a[1..7]：各幕的幕内进度
  camD: number; camY: number; hzf: number; shake: number;
  pitch: number; tanV: number;      // 第七幕：镜头抬头多少（弧度）、竖直半视角（正切）；前六幕 pitch = 0、tanV 照旧
  open: number;                     // 门开的角度（弧度）
  light: number; lightCol: V3;      // 门后那盏光
  slit: number; slitGlow: number;   // 开场：门缝从下往上亮到哪；那条缝的光晕
  horizon: number; reach: number; dawn: number;
  flood: number; floodB: number; dark: number;      // 门里的白光、整屏的白、造物压暗（v3.1 起第七幕不再用：不许变黑、不许剪影、不许白光吞屏）
  out: number[]; hole: number[]; holeWhite: number;
  sun: { vis: number; form: number; c: V3; scale: number; shape: V3; spin: number; heat: number; flare: number; ignite: number };
  ring: { vis: number; form: number; c: V3; scale: number; rot: Q; spin: number; glow: number };
  moons: { p: V3; s: number; hi: number }[];
  whale: { vis: number; swim: number; settle: number; c: V3; rot: Q; scale: number; dark: number; glow: number; stars: number; lines: number; mid: V3; wave: number; emit: number };
  arm: { vis: number; form: number; blast: number; c: V3; scale: number; heat: number; rots: Q[]; point: V3; pointI: number; flash: number };
  orbits: { c: V3; R: number; q: Q; draw: number; I: number }[];
  grid: number; gridR: number; starOn: number; starFree: number;
  shock: { c: V3; r: number; i: number };
  lights: { p: V3; c: V3; r: number; path: number }[];
  // —— 第七幕「开天」——
  sky: number;                      // 进了第七幕多少（0..1，管倒影、星怎么挂）
  crack: number;                    // 门裂开：缝里透光、轻轻抖
  rise: number;                     // 门上的石头升天走到哪（0..1）
  gone: number;                     // 门洞里那片光走了多少
  calm: number;                     // 水面平成一面镜子
  neb: number;                      // 星云铺开了多少
  fam: number;                      // 造物散到天上各自位置走了多少
  fin: Fin;                         // 最后那个镜头（星云、留暗的那块天都按它算）
}

/** 第七幕最后那个镜头：升到天里、抬头、视角放宽；地平线压到屏幕下面四分之一 */
export interface Fin { pos: V3; pitch: number; tanV: number; aspect: number; shift: number }
export function finalCam(v: View): Fin {
  const n = v.narrow;
  const pitch = (mix(SKY.pitchDeg[0], SKY.pitchDeg[1], n) * Math.PI) / 180;
  const tanV = mix(SKY.tanV[0], SKY.tanV[1], n);
  const hz = mix(SKY.horizon[0], SKY.horizon[1], n);
  // 投影矩阵的移轴量：抬头 pitch 以后，地平线还要落在离底 hz 的地方
  const shift = 2 * hz - 1 + Math.tan(pitch) / tanV;
  return { pos: [0, EYE + SKY.camY, Z0 + SKY.camD], pitch, tanV, aspect: v.aspect, shift };
}
/** 最后那个镜头里，屏幕坐标（nx、ny，-1..1）上、离镜头 d 远的那个点 */
export function finAt(f: Fin, nx: number, ny: number, d: number): V3 {
  const dir = norm3([nx * f.tanV * f.aspect, (ny - f.shift) * f.tanV, -1]);
  return add3(f.pos, mul3(qRot(qAxis(X, f.pitch), dir), d));
}

/** 手机竖屏有多「手机」：竖得跟手机一样（宽高比 ≲ 0.6，iPhone Safari 工具栏展开时约 390×664 也算）才是 1；平板这种半竖的（≳ 0.68）还是 0，照 v3.1 的插法 */
const phoneOf = (n: number) => ss(0.6, 0.74, n);

/** 第七幕：每样造物在最后那个镜头里站哪（屏幕坐标、离镜头多远、占屏多大）。不挤在一起、不在门里、不压着门原来的位置，
 *  也不压着正中下面那句话（index.astro 的 .end）。电脑横屏一套、手机竖屏一套，中间的屏按竖的程度插。
 *  v3.2：手机竖屏另摆（天上要挂名字）——五样上下错开、摆满整屏：日左上、鲸右上、环右中、器落到那句话下面、贴着水面那一截天，
 *  名字各挂在各的旁边不打架。电脑、平板照 v3.1 不动。 */
function slots(f: Fin, n: number, tall: number, band: number) {
  // 比 16:9 还宽的屏（带鱼屏、手机横着）：造物还是落在正中 16:9 的那个框里，两边多出来的只是更长的地平线、更多的星云
  const a16 = Math.min(f.aspect, 16 / 9), kx = a16 / f.aspect;
  const hW = (d: number) => 2 * d * f.tanV;               // 那个距离上，一屏高是多少世界单位
  const wW = (d: number) => 2 * d * f.tanV * a16;         // 一屏宽（按 16:9 那个框算）
  const L = (k: [number, number]) => mix(k[0], k[1], n);
  const X = (k: [number, number]) => L(k) * kx;
  const sunD = 1300, whD = 1500, ringD = 1250, armD = 1100;
  // 很宽的屏（手机横着、带鱼屏）：屏矮，器和环往上让一让，别压到那句话
  const wide = cl((f.aspect - 1.65) / 0.6);
  // v3.2 手机竖屏的落点（屏幕坐标 -1..1，y 朝上）：跟 v3.1 的插值按「多像手机」再混一次；手机里再按长、矮各一套（tall 只取 0 或 1，不插：插了浑天仪会从那句话上穿过去）
  const ph = phoneOf(n), tl = tall >= 0.5 ? 1 : 0;
  const T2 = (t: number, short: number) => mix(short, t, tl);
  const P2 = (a: number, b: number) => mix(a, b, ph);
  return {
    sun: { p: finAt(f, P2(X([-0.58, -0.46]), -0.4), P2(L([0.5, 0.78]), T2(0.7, 0.72)), sunD), s: (L([0.058, 0.042]) * hW(sunD)) / 46 },
    whale: {
      p: finAt(f, P2(X([0.34, 0.14]), T2(0.2, 0.2)), P2(L([0.6, 0.5]), T2(0.42, 0.42)), whD),
      s: (P2(L([0.21, 0.46]), T2(0.46, 0.4)) * wW(whD)) / WHALE_L, R: P2(L([0.1, 0.16]), T2(0.12, 0.08)) * wW(whD),
    },
    ring: { p: finAt(f, P2(X([0.62, 0.5]), T2(0.36, 0.46)), P2(L([0.24, 0.16]) + 0.1 * wide, T2(0.12, 0.2)), ringD), s: (P2(L([0.085, 0.24]), T2(0.24, 0.19)) * wW(ringD)) / RING_R },
    arm: { p: finAt(f, P2(X([-0.74, -0.58]), T2(-0.56, -0.62)), P2(L([0.04, 0.22]) + 0.1 * wide, T2(band, 0.2)), armD), s: (L([0.068, 0.046]) * hW(armD)) / 66 },
  };
}

export function computeState(P: number, clock: number, v: View, nMoons: number): State {
  const a = [0, 0, 0, 0, 0, 0, 0, 0].map((_, k) => (k === 0 ? 0 : cl(P - (k - 1))));
  const n = v.narrow;
  const a7 = a[7];
  const fin = finalCam(v);
  const fam = slots(fin, n, v.tall ?? 1, v.band ?? -0.33);
  const toFam = ss(SKY.fam[0], SKY.fam[1], a7);
  const camK = ss(SKY.cam[0], SKY.cam[1], a7);

  // —— 镜头 ——
  let camD = CAM_D[0];
  for (let k = 2; k <= 6; k++) {
    if (P > k - 1) camD = mix(CAM_D[k - 1], CAM_D[k], ss(0.0, 1.0, a[k]));
  }
  camD *= 1 + 0.16 * n * ss(1, 1.4, P);
  // 第七幕：门推开的时候走近一点，然后停在那儿往上升
  if (P > 6) camD = mix(camD, SKY.camD, ss(0.0, 0.3, a7));
  const hzHero = mix(HZF.hero, HZF.heroPhone, n), hzAct = mix(HZF.act, HZF.actPhone, n);
  let hzf = mix(hzHero, hzAct, ss(1.0, 1.32, P));
  hzf = mix(hzf, (fin.shift + 1) / 2, camK);
  // 第六幕：镜头升起来往下看（律要从上面看才看得清）；第七幕一进来先贴回水面，等石头飞起来，再跟着一路升进天里
  let camY = EYE + 64 * ss(5.04, 5.42, P) * (1 - ss(6.0, 6.14, P));
  camY += SKY.camY * ss(0.3, 0.95, a7);
  // 抬头：跟着往上飞的石头多抬一点，最后落回能看见整片天和下面那面镜子的角度
  const peak = (mix(SKY.peakDeg[0], SKY.peakDeg[1], n) * Math.PI) / 180;
  const pitch = mix(0, peak, ss(0.2, 0.56, a7)) * (1 - ss(0.6, 0.94, a7)) + fin.pitch * ss(0.6, 0.94, a7);
  const tanV = mix(v.tanV, fin.tanV, camK);

  // —— 第七幕「开天」的几条进度（幕内 0..1）——
  const sky = ss(0.02, 0.3, a7);
  const crack = ss(SKY.crack[0], SKY.crack[1], a7);
  const rise = cl((a7 - SKY.rise[0]) / (SKY.rise[1] - SKY.rise[0]));
  const gone = ss(SKY.gone[0], SKY.gone[1], a7);
  const calm = ss(0.3, 0.8, a7);
  const neb = cl((a7 - SKY.neb[0]) / (SKY.neb[1] - SKY.neb[0]));

  // —— 门、光 ——
  const open = (keyed(P, DOOR_DEG) * Math.PI) / 180;
  const o = a[1];
  let light = 0.012 + 0.988 * Math.pow(ss(0.38, 0.72, o), 1.3);
  for (let k = 2; k <= 6; k++) light += 0.22 * ss(0.02, 0.12, a[k]) * (1 - ss(0.18, 0.45, a[k]));
  // 第七幕：石头把光带上天，门洞里的光跟着走光
  light *= mix(1, 0.1, gone);
  let lightCol: V3 = [1, 1, 1];
  for (let k = 2; k <= 6; k++) {
    const s = ss(k - 1 + 0.01, k - 1 + 0.13, P) * (1 - ss(k - 0.08, k + 0.02, P));
    if (s > 0) lightCol = mix3([1, 1, 1], ACT_COL[k], s * 0.86);
  }
  // 第七幕：门里的光是暖的（白里带一点金），不是灰白
  if (a7 > 0) lightCol = mix3(lightCol, [1, 0.8, 0.58], 0.55 * ss(0.0, 0.1, a7));
  const slit = ss(0.14, 0.4, o);
  const slitGlow = ss(0.13, 0.2, o) * mix(1, 0.55, ss(0.5, 0.8, o)) * (1 - gone);
  const horizon = ss(0.48, 0.76, o), reach = ss(0.58, 0.9, o), dawn = ss(0.4, 0.92, o);
  // v3 第七幕的白光吞屏、剪影都不要了（Song 11-28：「不许变黑，不许剪影，不许白光吞屏」）
  const flood = 0, floodB = 0, dark = 0;

  const out = [0, 1, 2, 3, 4].map((k) => ss(k + 1.0, k + 1.16, P));
  const hole = [0, 1, 2, 3, 4].map((k) => ss(k + 1.05, k + 1.22, P) * (1 - crack));
  const holeWhite = 0;

  // —— Ⅱ 燃日 ——
  const a2 = a[2];
  // 升起来以后偏到左上：日正压在门顶的中轴上，会让人想到「门上一只眼」那种符号
  const S1: V3 = [mix(-105, -34, n), mix(312, 345, n), Z0 + 25];
  const SP: V3 = [mix(-215, -62, n), mix(282, 430, n), Z0 - 60];
  const park2 = ss(2.02, 2.32, P);
  const sunCatch = ss(ORBITS[2].to - 0.08, ORBITS[2].to + 0.04, a[6]);
  const phSun = ORBITS[2].ph0 + (clock / ORBITS[2].period) * Math.PI * 2;
  const rS = mix(1, 0.62, n);
  let sunC = mix3([0, 120, Z0 + 4], S1, ss(0.1, 0.5, a2));
  sunC = mix3(sunC, SP, park2);
  sunC = mix3(sunC, orbitPos(ORBITS[2], phSun, rS), sunCatch);
  sunC = swing(sunC, fam.sun.p, toFam, -1);
  let sunScale = mix(0.42, 1, ss(0.06, 0.42, a2)) * mix(1, 0.78, park2);
  sunScale = mix(sunScale, 0.6, sunCatch);
  sunScale = mix(sunScale, fam.sun.s, toFam);
  let sunHeat = mix(1, 0.3, park2);
  sunHeat = mix(sunHeat, 0.8, ss(0.3, 0.55, a[6]));
  sunHeat = mix(sunHeat, 1, toFam);
  const sun = {
    vis: ss(0.015, 0.04, a2), form: cl(a2 / 0.56), c: sunC, scale: sunScale,
    shape: mix3([0.13, 2.1, 0.13], [1, 1, 1], ss(0.07, 0.34, a2)),
    spin: clock * 0.045 + a2 * 0.9, heat: sunHeat, flare: sunHeat * sunHeat, ignite: ss(0.44, 0.96, a2),
  };

  // —— Ⅲ 布环 ——
  const a3 = a[3];
  const ringForm = a3 * 1.9;
  const ringSpin = clock * 0.025;
  let ringQ = qMul(qAxis(X, 0.24), qAxis(Z, 0.06));
  ringQ = qSlerp(ringQ, qMul(qAxis(X, 0.44), qAxis(Z, -0.12)), ss(5.3, 5.52, P));
  // 天上那道环：差不多水平，从下面仰着看是一个张开的椭圆（不是一条线）
  ringQ = qSlerp(ringQ, qMul(qAxis(Z, mix(0.28, 0.2, n)), qAxis(X, mix(-0.22, -0.06, n))), toFam);
  const ringScale = mix(mix(1, 0.86, n), fam.ring.s, toFam);
  const ringC = swing(DC, fam.ring.p, toFam, 1);
  const ring = {
    vis: ss(0.005, 0.03, a3), form: ringForm, c: ringC, scale: ringScale, rot: ringQ, spin: ringSpin,
    glow: mix(mix(mix(1, 0.32, ss(3.02, 3.3, P)), 0.85, ss(5.3, 5.5, P)), 1.15, toFam),
  };
  const moons: State['moons'] = [];
  const rq = ringQ;
  for (let m = 0; m < nMoons; m++) {
    const { ang, out: mo } = moonAngle(ringForm, m, nMoons, ringSpin);
    const rr = RING_R * ringScale;
    const p = add3(ringC, qRot(rq, [rr * Math.cos(ang), 0, rr * Math.sin(ang)]));
    let d = ((ang - Math.PI / 2) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    const hi = Math.exp(-(d * d) / (2 * 0.2 * 0.2)) * ss(0.45, 0.55, a3) * (1 - ss(0.97, 1.0, a3));
    moons.push({ p, s: mo * ringScale, hi });
  }

  // —— Ⅳ 赋生 ——
  const a4 = a[4];
  const swim = mix(-1.1, Math.PI * 2 + 0.55, ss(0.03, 0.74, a4));
  const settle = ss(0.66, 0.86, a4);
  const WF: V3 = [mix(46, 0, n), mix(368, 470, n), Z0 - 230];
  const whaleCatch = ss(ORBITS[1].to - 0.08, ORBITS[1].to + 0.04, a[6]);
  const phW = ORBITS[1].ph0 + (clock / ORBITS[1].period) * Math.PI * 2;
  let wC = mix3(WF, orbitPos(ORBITS[1], phW, mix(1, 0.6, n)), whaleCatch);
  // 第七幕：在星云里游——绕着自己那块天兜一个很大的圈（水平的圈，从下面看是扁的），头朝着游的方向
  // （起点挑过：时钟 5 秒——截图那一刻——它正往左游，跟第六幕挂在轨道上的朝向一样，换位置的时候不用掉头）
  const phSky = 3.44 + (clock / 110) * Math.PI * 2;
  const wSky = add3(fam.whale.p, [fam.whale.R * Math.sin(phSky), fam.whale.R * 0.05 * Math.sin(phSky * 2), fam.whale.R * 0.55 * Math.cos(phSky)]);
  wC = swing(wC, wSky, toFam, Math.sign(wSky[0]) || 1);
  let wQ = qAxis(Y, Math.PI);
  wQ = qSlerp(wQ, qAxis(Y, Math.PI - (phW - ORBITS[1].ph0) * 0.0 + 0.35), whaleCatch);
  const headY = Math.atan2(0.55 * Math.sin(phSky), Math.cos(phSky));
  wQ = qSlerp(wQ, qMul(qAxis(Y, headY), qAxis(X, -0.1)), toFam);
  const wScale = mix(mix(1, 0.72, n), fam.whale.s, toFam);
  const sp = wSpeed(swim);
  const midPath = wPath(swim - (0.4 * WHALE_L) / sp);
  const mid = mix3(midPath, wC, settle);
  const whale = {
    vis: ss(0.005, 0.03, a4), swim, settle, c: wC, rot: wQ, scale: wScale,
    dark: ss(0.84, 0.95, a4) * 0.8 * (1 - toFam), glow: mix(mix(1, 0.3, ss(0.86, 1, a4)), 1.1, toFam),
    stars: ss(0.84, 0.96, a4), lines: ss(0.88, 1.0, a4) * mix(1, 0.35, toFam), mid,
    wave: mix(0.25, 0.85, toFam), emit: 0.5 * toFam,
  };

  // —— Ⅴ 铸器（滑到一半那一拍定住：幕内 0.45..0.5 画面不动）——
  const a5 = a[5];
  const F = a5 < 0.45 ? a5 : a5 < 0.5 ? 0.45 : a5 - 0.05;
  const bt = Math.max(F - 0.45, 0);
  const CA: V3 = [0, 128, Z0 + 75];
  const armCatch = ss(ORBITS[0].to - 0.08, ORBITS[0].to + 0.04, a[6]);
  const phA = ORBITS[0].ph0 + (clock / ORBITS[0].period) * Math.PI * 2;
  let aC = mix3(CA, orbitPos(ORBITS[0], phA, mix(1, 0.62, n)), armCatch);
  aC = swing(aC, fam.arm.p, toFam, -1);
  const armScale = mix(mix(1, 0.9, n) * mix(1, 0.78, armCatch), fam.arm.s, toFam);
  // 浑天仪：赤道、子午、黄道三道环；整架往镜头倾一点、绕极轴慢慢转，三道环永远是三个不同的椭圆
  const q0 = qSlerp(qMul(qAxis(Y, 0.65 + clock * 0.06), qAxis(X, 0.6)), qMul(qAxis(Z, 0.5), qMul(qAxis(Y, 0.4 + clock * 0.05), qAxis(X, 1.05))), toFam);
  const rots: Q[] = [
    q0,
    qMul(q0, qMul(qAxis(Y, 0.9 + clock * 0.13), qAxis(X, Math.PI / 2))),
    qMul(q0, qAxis(Z, 0.41)),
  ];
  let armHeat = mix(1.7, 0.4, ss(0.12, 0.5, bt));
  armHeat = mix(armHeat, 0.28, ss(5.02, 5.3, P));
  armHeat = mix(armHeat, 0.55, ss(5.05, 5.25, P));
  armHeat = mix(armHeat, 1.05, toFam);
  const arm = {
    vis: ss(0.05, 0.1, F), form: cl((F - 0.06) / 0.39), blast: bt, c: aC, scale: armScale, heat: armHeat, rots,
    point: mix3([0, 120, Z0 + 2], CA, ss(0.0, 0.13, F)),
    pointI: (bt > 0 ? 0 : ss(0.0, 0.05, F) * (0.6 + 5 * ss(0.2, 0.45, F))),
    flash: bt > 0 ? Math.exp(-bt * 26) : 0,
  };
  const shake = bt > 0 ? Math.exp(-bt * 16) : 0;
  const shock = { c: [CA[0], 0, CA[2]] as V3, r: 1700 * Math.pow(cl(bt / 0.38), 0.72), i: bt > 0 ? 1 - ss(0.04, 0.38, bt) : 0 };

  // —— Ⅵ 立法：器的三道环放大成轨道；第七幕三道轨道再放大，散成满天的大椭圆 ——
  const a6 = a[6];
  // 天上三道轨道：各占一块天、斜着，只画大半圈，绕自己的轴慢慢转（像带着尾巴的星在走）
  const SKY_ORB: { nx: [number, number]; ny: [number, number]; d: number; R: [number, number]; z: number; x: number; per: number; phone: [number, number, number] }[] = [
    // phone：v3.2 手机竖屏的落点（nx、ny、半径）
    { nx: [-0.5, -0.42], ny: [0.66, 0.9], d: 1700, R: [430, 300], z: 0.42, x: 1.12, per: 70, phone: [-0.3, 0.62, 330] },
    { nx: [0.5, 0.36], ny: [0.78, 0.96], d: 2000, R: [620, 420], z: -0.3, x: 1.2, per: 90, phone: [0.4, 0.94, 420] },
    { nx: [0.0, 0.0], ny: [1.05, 1.18], d: 2600, R: [1700, 1000], z: 0.06, x: 0.42, per: 140, phone: [0, 1.18, 1000] },
  ];
  const ph = phoneOf(n);
  const orbits = ORBITS.map((ob, j) => {
    const g = ss(ob.from, ob.to, a6);
    const ringR = (66 - j * 7) * armScale;
    let q = qSlerp(rots[j], orbitQ(ob), g);
    let c = mix3(aC, DC, g), R = mix(ringR, ob.R * mix(1, 0.62, n), g);
    const so = SKY_ORB[j];
    const k = ss(SKY.fam[0] + 0.05 * j, SKY.fam[1] + 0.05 * j, a7);
    q = qSlerp(q, qMul(qMul(qAxis(Z, so.z), qAxis(X, so.x)), qAxis(Y, (clock / so.per) * Math.PI * 2)), k);
    const onx = mix(mix(so.nx[0], so.nx[1], n) * Math.min(fin.aspect, 16 / 9) / fin.aspect, so.phone[0], ph);
    c = mix3(c, finAt(fin, onx, mix(mix(so.ny[0], so.ny[1], n), so.phone[1], ph), so.d), k);
    R = mix(R, mix(mix(so.R[0], so.R[1], n), so.phone[2], ph), k);
    const draw = ss(ob.from, ob.from + (ob.to - ob.from) * 0.85, a6) * mix(1, 0.72, k);
    return { c, R, q, draw, I: mix(1, 0.5, k) };
  });
  const grid = ss(0.08, 0.36, a6) * (1 - ss(6.06, 6.3, P));
  const gridR = mix(0, 2800, ss(0.08, 0.55, a6));
  const starOn = ss(0.62, 0.8, a6), starFree = ss(0.8, 0.985, a6);

  // —— 光：门后一盏 + 每样造物一盏（水面上的光路最多六条）——
  const lights: State['lights'] = [
    { p: [0, H * 0.46, Z0 - 40], c: mul3(lightCol, light), r: 400, path: 1 - gone },
    { p: sun.c, c: mul3(COL.sun, 2.6 * sun.heat * sun.vis), r: 150 * sun.scale, path: 0.55 * sun.vis },
    { p: mix3(moons.length ? moons.reduce((b, m) => (m.hi > b.hi ? m : b), moons[0]).p : DC, ringC, toFam), c: mul3(COL.ring, 1.2 * ring.glow * ring.vis), r: 200 * mix(1, ringScale, toFam), path: 0.4 * ring.vis },
    { p: mid, c: mul3(COL.life, 0.9 * whale.glow * whale.vis), r: 260 * mix(1, wScale, toFam), path: 0.35 * whale.vis },
    { p: arm.vis > 0 ? aC : arm.point, c: mul3(COL.fire, (1.4 * arm.heat * arm.vis + 2 * arm.pointI + 18 * arm.flash)), r: 150 * mix(1, armScale, toFam), path: 0.6 * Math.max(arm.vis, ss(0, 0.05, F)) },
    { p: [0, 40, Z0 + 60], c: mul3(COL.law, 1.1 * grid), r: 150, path: 0.5 * grid },
  ];

  return {
    P, a, camD, camY, hzf, shake, pitch, tanV, open, light, lightCol, slit, slitGlow, horizon, reach, dawn, flood, floodB, dark,
    out, hole, holeWhite, sun, ring, moons, whale, arm, orbits, grid, gridR, starOn, starFree, shock, lights,
    sky, crack, rise, gone, calm, neb, fam: toFam, fin,
  };
}

/** 滚动位置（屏）→ P：首屏停一小段，然后每幕一段，均匀 */
export function scrollToP(u: number, hold: number, acts: number[]) {
  if (u <= hold) return 1;
  let x = u - hold;
  for (let k = 0; k < acts.length; k++) {
    if (x <= acts[k]) return 1 + k + x / acts[k];
    x -= acts[k];
  }
  return 7;
}
/** P → 滚动位置（屏）：点刻度、Tab 到某一幕时用 */
export function pToScroll(P: number, hold: number, acts: number[]) {
  if (P <= 1) return 0;
  let u = hold;
  for (let k = 0; k < acts.length; k++) {
    const f = cl(P - 1 - k);
    u += f * acts[k];
    if (f < 1) break;
  }
  return u;
}

export { W, H, T };
