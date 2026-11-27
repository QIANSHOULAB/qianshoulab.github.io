// 时间线：一个 0..7 的进度 P。第一幕 [0,1] 是开场自己放；往下滑走 [1,7]，是平滑后滚动位置的纯函数。
// 所有动画只读 P 和时钟：同一个 P 永远是同一个画面，倒着滑就是倒放。
import { SCROLL, DOOR, CAM_DIST, FRAME, HORIZON, MAX_ASPECT } from './config';

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const smoother = (t: number) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
/** x 在 [a,b] 里走到哪了（0..1） */
export const seg = (x: number, a: number, b: number) => clamp((x - a) / (b - a));
export const easeInOut = (t: number) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t: number) => Math.pow(clamp(t), 3);

/** 第 k 幕（1..7）的幕内进度，不截断：<0 还没到，>1 已经过了 */
export const local = (P: number, k: number) => P - (k - 1);

/** 滚动位置（从顶上量，单位：屏）→ P（1..7） */
export function pOfScroll(s: number): number {
  let x = s - SCROLL.lead;
  if (x <= 0) return 1;
  for (let i = 0; i < SCROLL.acts.length; i++) {
    const L = SCROLL.acts[i];
    if (x <= L) return 2 + i - 1 + x / L;
    x -= L;
  }
  return 7;
}

/** P → 滚动位置（屏）。点右边刻度、?act= 定格、Tab 到「进去」时用 */
export function scrollOfP(P: number): number {
  if (P <= 1) return 0;
  let s = SCROLL.lead;
  for (let i = 0; i < SCROLL.acts.length; i++) {
    const a = 1 + i;
    if (P <= a + 1) return s + (P - a) * SCROLL.acts[i];
    s += SCROLL.acts[i];
  }
  return s;
}

/** 关键帧插值：相邻两帧之间走平滑曲线（到了关键帧速度归零，石门那种沉） */
export function keyed(kf: [number, number][], x: number): number {
  if (x <= kf[0][0]) return kf[0][1];
  for (let i = 1; i < kf.length; i++) {
    if (x <= kf[i][0]) {
      const [x0, y0] = kf[i - 1], [x1, y1] = kf[i];
      return lerp(y0, y1, sstep(x0, x1, x));
    }
  }
  return kf[kf.length - 1][1];
}

export const doorDeg = (P: number) => keyed(DOOR, P);

/** 镜头离门多远：每幕走近一段（一半匀速一半缓动，幕和幕之间不完全停）；第七幕贴着水面一路往前 */
export function camDist(P: number): number {
  if (P <= 1) return CAM_DIST[1];
  if (P >= 7) return CAM_DIST[7];
  if (P >= 6) return keyed([[6, CAM_DIST[6]], [6.42, 430], [6.7, 250], [6.86, 160], [6.97, CAM_DIST[7]]], P);
  const k = Math.floor(P), t = P - k;
  return lerp(CAM_DIST[k], CAM_DIST[k + 1], 0.45 * t + 0.55 * sstep(0, 1, t));
}

/** 地平线离底边多高：首屏 0.40（竖屏 0.355）；一往下滑就降到 0.28（竖屏 0.24） */
export function horizonAt(P: number, portrait: boolean): number {
  const hero = portrait ? HORIZON.heroPortrait : HORIZON.hero;
  const acts = portrait ? HORIZON.actsPortrait : HORIZON.acts;
  return lerp(hero, acts, sstep(1.0, 1.45, P));
}

/**
 * 镜头视角（tan 半角）：要看得见这一幕那块天（FRAME）。
 * 竖屏、横屏各算各的；超宽屏按 16:9 算（多出来的两边只是地平线和黑）。第七幕视角不再跟着放大，门才会越走越高。
 */
export function tanHalfAt(P: number, aspect: number, hz: number): number {
  const portrait = aspect < 1;
  const box = (i: number) => FRAME[Math.max(0, Math.min(FRAME.length - 1, i))];
  const need = (Pq: number) => {
    const k = Math.max(1, Math.min(6, Math.floor(Pq)));
    const t = sstep(0, 1, Pq - k);
    const a = box(k), b = box(k + 1);
    const top = lerp(portrait ? a.topP : a.top, portrait ? b.topP : b.top, t);
    const half = lerp(portrait ? a.halfP : a.half, portrait ? b.halfP : b.half, t);
    const d = camDist(Pq);
    const ar = Math.min(aspect, MAX_ASPECT);
    return Math.max(top / (2 * d * (1 - hz)), half / (d * ar));
  };
  if (P <= 6) return need(Math.max(1, P));
  // 第七幕：走到门槛前，视角放开一些（站在门洞跟前），门越走越高、顶到天外
  return need(6) * (1 + 0.62 * sstep(6.3, 7, P));
}
