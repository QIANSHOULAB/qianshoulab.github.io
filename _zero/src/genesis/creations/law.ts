// Ⅵ 立法：轨道。日、环、鲸座、浑天仪被轨道一样一样接住，绕门运行，各有各的周期（开普勒拿行星轨道对音程：2:3、1:2……），谁也不撞谁。
// 这里先放每样东西的轨道和「接住」的算法；轨道线、格网、星空在 buildLaw 里。
import { Vector3, Vector4 } from 'three';
import { sstep, lerp, seg } from '../timeline';
import { GATE, SECTION_HEX, TIERS, hexToLinear, type Tier } from '../config';
import { ORBIT_FN, ORBIT_LINE, ORBIT_COL, STAR_PLACE } from '../glsl/law';
import { lineMaterial, lineMesh, pointCloud, pointMaterial, type Creation, type Frame, type U } from '../kit';
import { rng } from '../layout';
import type { ForgeState } from './forge';

const ZG = GATE.Z - GATE.T / 2;
/** 四条轨道：0 日、1 环（环本身就在门上，接住 = 开始自己转）、2 鲸座、3 浑天仪。圆心在门的中轴上，各自一个倾角，前低后高 */
export const ORBITS = [
  { h: 292, R: 170, incl: 0.3, yaw: 0.35, period: 30, phase: 0.75, catchAt: 0.3 },
  { h: 120, R: 200, incl: 0.38, yaw: 0, period: 60, phase: 0, catchAt: 0.42 },
  { h: 360, R: 430, incl: 0.12, yaw: -0.5, period: 40, phase: -2.9, catchAt: 0.54 },
  { h: 104, R: 300, incl: 0.22, yaw: 0.9, period: 20, phase: -1.6, catchAt: 0.66 },
];
/** 竖屏：轨道收窄一些（窄屏不硬塞，但也别全出框） */
const PORTRAIT_R = 0.62;

/** 第七幕镜头往前走：轨道升到头顶上去（「头顶是运转着的日、环、鲸座、浑天仪」），也收紧一点，不从镜头前面横扫过去 */
let liftNow = 0;
export function setLift(P: number) { liftNow = sstep(6.0, 6.42, P); }
export const LIFT_H = 150, LIFT_R = 0.22;
export function liftOf() { return liftNow; }

/** 第 i 条轨道上、角度 th 的那一点 */
export function orbitPoint(i: number, th: number, portrait: boolean, out: Vector3) {
  const o = ORBITS[i];
  const R = o.R * (portrait ? PORTRAIT_R : 1) * (1 - LIFT_R * liftNow);
  const H = o.h + LIFT_H * liftNow;
  // 先在水平面上转一圈（th = 0 在门正前方），再绕 x 轴倾 incl（前低后高），再绕竖轴转 yaw
  const x = Math.sin(th) * R, z = Math.cos(th) * R;
  const y = -z * Math.sin(o.incl);
  const z2 = z * Math.cos(o.incl);
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  out.set(x * c + z2 * s, H + y, -x * s + z2 * c + ZG);
  return out;
}

/** 被轨道接住：从原来的地方滑上轨道，然后按自己的周期绕门转（第六幕起） */
export function orbitPos(i: number, P: number, time: number, portrait: boolean, rest: Vector3, out: Vector3) {
  const o = ORBITS[i];
  const u = P - 5;
  const w = sstep(o.catchAt, o.catchAt + 0.1, u);
  if (w <= 0) { out.copy(rest); return out; }
  const th = o.phase + (time / o.period) * Math.PI * 2;
  const p = orbitPoint(i, th, portrait, new Vector3());
  out.copy(rest).lerp(p, w);
  return out;
}

/** 第七幕全家福：都缩小了，站进门洞那道白光里（镜头走到门槛前，门洞跟前看得见的就那么一块），成了白光里的黑剪影 */
export const PORTRAIT_SCALE = [0.19, 0.068, 0.12, 0.17];
export function portraitPos(i: number, P: number, portrait: boolean, cur: Vector3, out: Vector3) {
  const w = sstep(6.45, 6.85, P);
  if (w <= 0) { out.copy(cur); return out; }
  const z = GATE.Z + 12;
  const spots = portrait
    ? [new Vector3(-19, 90, z), new Vector3(0, 68, z), new Vector3(0, 114, z), new Vector3(19, 90, z)]
    : [new Vector3(-23, 51, z), new Vector3(0, 33, z), new Vector3(0, 73, z), new Vector3(23, 51, z)];
  // 先往上、往门洞那边收，再落到自己的位置（不从镜头前面横穿过去）
  const p = spots[i];
  const mid = new Vector3().lerpVectors(cur, p, 0.5);
  mid.y += 40 * (1 - w);
  const a = new Vector3().lerpVectors(cur, mid, w), b = new Vector3().lerpVectors(mid, p, w);
  out.lerpVectors(a, b, w);
  return out;
}


// ———— 第六幕本身：轨道线、水上格网、星空 ————

function norm(c: [number, number, number]) { const m = Math.max(...c); return c.map((v) => v / m) as [number, number, number]; }
export const LAW_COL = norm(hexToLinear(SECTION_HEX[4]));
const SEGS = 180;
const NSTAR = 1400;

export function buildLaw(shared: U, forge: () => ForgeState) {
  const u = {
    uOrb: { value: ORBITS.map((o) => new Vector4(o.h, o.R, o.incl, o.yaw)) },
    uOrbDraw: { value: [0, 0, 0, 0] },
    uOrbGrow: { value: [0, 0, 0, 0] },
    uNarrowO: { value: 1 },
    uArmC: { value: new Vector3() },
    uArmSc: { value: 1 },
    uArmSp: { value: 0 },
    uRingSp: { value: new Vector3() },
    uOrbLum: { value: 1 },
    uLawCol: { value: new Vector3(...LAW_COL) },
    uWidth: { value: 1.25 },
  };
  const segs: number[][] = [];
  for (let i = 0; i < 4; i++) for (let k = 0; k < SEGS; k++) segs.push([i, k / SEGS, 0, 0, i, (k + 1) / SEGS, 0, 0]);
  const lmat = lineMaterial(shared, ORBIT_FN + ORBIT_LINE, ORBIT_COL, u);
  const orbits = lineMesh(lmat, segs);
  orbits.renderOrder = 6;

  // 星：格网交点（门脚为圆心的放射线 × 同心圆），按离门脚远近一颗一颗亮
  const r = rng(6006);
  const G = new Float32Array(NSTAR * 4), Sd = new Float32Array(NSTAR * 4);
  const pts: number[][] = [];
  for (let ring = 1; ring <= 26; ring++) {
    for (let k = -35; k <= 35; k++) {
      const th = (k * Math.PI) / 36;
      const rad = ring * 60;
      pts.push([Math.sin(th) * rad, ZG_LAW + Math.cos(th) * rad, rad]);   // 门前那半边（朝人）
      if (ring % 2 === 0 && Math.abs(k) % 2 === 0) pts.push([Math.sin(th) * rad, ZG_LAW - Math.cos(th) * rad, rad + 30]);
    }
  }
  for (let i = 0; i < NSTAR; i++) {
    const p = pts[Math.floor(r() * pts.length)];
    const order = Math.min(1, p[2] / 1600) * 0.85 + 0.15 * r();
    G.set([p[0], order, p[1], r()], i * 4);
    // 天上的方向：多数在中低空（地平线上头那一片最密），少数在头顶
    const az = (r() * 2 - 1) * Math.PI;
    const el = Math.asin(0.03 + 0.97 * Math.pow(r(), 1.8));
    Sd.set([Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el), Math.pow(r(), 2.2)], i * 4);
  }
  const su = { uU: { value: -1 }, uStarsOn: { value: 1 }, uCamP: { value: new Vector3() } };
  const smat = pointMaterial(shared, STAR_PLACE, { ...su, uPxScale: shared.uPxScale });
  const stars = pointCloud(smat, { aG: { data: G, size: 4 }, aS: { data: Sd, size: 4 } }, NSTAR);
  stars.renderOrder = 3;

  const tgt = new Vector3();
  let portraitNow = false;
  const creation: Creation & { grid: number } = {
    name: 'law',
    objects: [orbits, stars],
    grid: 0,
    // 顺着一条轨道滑走：扎向浑天仪那条轨道朝人的那一段
    target: () => orbitPoint(3, 0.35, portraitNow, tgt),
    setTier(t: Tier) { stars.geometry.setDrawRange(0, Math.round(NSTAR * Math.max(0.5, TIERS[t].blocks))); },
    update(f: Frame) {
      const P = f.P, uu = P - 5;
      const vis = uu > 0.04;
      orbits.visible = vis;
      stars.visible = uu > 0.6;
      creation.grid = vis ? seg(uu, 0.06, 0.52) : 0;
      if (!vis) return;
      portraitNow = f.portrait;
      const fs = forge();
      (u.uArmC.value as Vector3).copy(fs.center);
      u.uArmSc.value = fs.scale;
      u.uArmSp.value = fs.spin;
      (u.uRingSp.value as Vector3).copy(fs.ringSpin);
      u.uNarrowO.value = f.portrait ? PORTRAIT_R : 1;
      for (let i = 0; i < 4; i++) {
        const o = ORBITS[i], lift = liftOf();
        (u.uOrb.value[i] as Vector4).set(o.h + LIFT_H * lift, o.R * (1 - LIFT_R * lift), o.incl, o.yaw);
        const a = 0.08 + 0.1 * i;
        u.uOrbGrow.value[i] = seg(uu, a, a + 0.16);
        u.uOrbDraw.value[i] = seg(uu, a + 0.02, a + 0.18);
      }
      // 第七幕：白光里轨道也成了黑剪影（光收掉），最后跟着白光一起暗下去
      u.uOrbLum.value = 1 - 0.9 * sstep(6.5, 6.8, P);
      su.uU.value = uu;
      su.uStarsOn.value = 1 - sstep(6.55, 6.75, P) * 0.92;
      (su.uCamP.value as Vector3).copy(f.cam);
      // 轨道自己也是光：照水
      const L = seg(uu, 0.1, 0.4) * (1 - 0.8 * sstep(6.5, 6.8, P));
      if (L > 0.02) f.water.push({ pos: new Vector3(0, 60, ZG_LAW + 200), col: LAW_COL, i: 0.7 * L });
    },
  };
  return creation;
}
const ZG_LAW = GATE.Z - GATE.T / 2;
