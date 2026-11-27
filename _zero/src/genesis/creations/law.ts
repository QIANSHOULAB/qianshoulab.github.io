// Ⅵ 立法：轨道。日、环、鲸座、浑天仪被轨道一样一样接住，绕门运行，各有各的周期（开普勒拿行星轨道对音程：2:3、1:2……），谁也不撞谁。
// 这里先放每样东西的轨道和「接住」的算法；轨道线、格网、星空在 buildLaw 里。
import { Vector3 } from 'three';
import { GATE } from '../config';
import { sstep, lerp } from '../timeline';

const ZG = GATE.Z - GATE.T / 2;
/** 四条轨道：0 日、1 环（环本身就在门上，接住 = 开始自己转）、2 鲸座、3 浑天仪。圆心在门的中轴上，各自一个倾角，前低后高 */
export const ORBITS = [
  { h: 286, R: 170, incl: 0.3, yaw: 0.35, period: 30, phase: 0.6, catchAt: 0.3 },
  { h: 120, R: 200, incl: 0.38, yaw: 0, period: 60, phase: 0, catchAt: 0.42 },
  { h: 352, R: 330, incl: 0.14, yaw: -0.5, period: 40, phase: 2.4, catchAt: 0.54 },
  { h: 104, R: 290, incl: 0.22, yaw: 0.9, period: 20, phase: 4.1, catchAt: 0.66 },
];
/** 竖屏：轨道收窄一些（窄屏不硬塞，但也别全出框） */
const PORTRAIT_R = 0.62;

/** 第 i 条轨道上、角度 th 的那一点 */
export function orbitPoint(i: number, th: number, portrait: boolean, out: Vector3) {
  const o = ORBITS[i];
  const R = o.R * (portrait ? PORTRAIT_R : 1);
  // 先在水平面上转一圈（th = 0 在门正前方），再绕 x 轴倾 incl（前低后高），再绕竖轴转 yaw
  const x = Math.sin(th) * R, z = Math.cos(th) * R;
  const y = -z * Math.sin(o.incl);
  const z2 = z * Math.cos(o.incl);
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  out.set(x * c + z2 * s, o.h + y, -x * s + z2 * c + ZG);
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

/** 第七幕全家福：都站到门洞前面那道白光里（镜头走到门槛前，看得见的就那么一块） */
export function portraitPos(i: number, P: number, portrait: boolean, cur: Vector3, out: Vector3) {
  const w = sstep(6.45, 6.85, P);
  if (w <= 0) { out.copy(cur); return out; }
  const spots = portrait
    ? [new Vector3(-14, 74, GATE.Z + 70), new Vector3(0, 44, GATE.Z + 60), new Vector3(16, 96, GATE.Z + 50), new Vector3(10, 30, GATE.Z + 82)]
    : [new Vector3(-34, 62, GATE.Z + 70), new Vector3(0, 40, GATE.Z + 60), new Vector3(30, 84, GATE.Z + 50), new Vector3(36, 26, GATE.Z + 84)];
  out.copy(cur).lerp(spots[i], w);
  return out;
}

export { lerp };
