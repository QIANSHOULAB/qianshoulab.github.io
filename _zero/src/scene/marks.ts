// v3.4：造物在屏幕上占多大（「外圈」），两两之间隔多远。只算数，不碰 three.js、不碰 DOM：
// 页面上（genesis.ts 的 marksAt、验收脚本 v34-check.mjs）和本地推版面的小程序用的是同一份。
// 每样东西用几段「胶囊」表示（一条线段 + 半径；圆是两端重合的胶囊）：
//   日：一个圆（本体 46 × scale，火舌再往外 1.25 倍）；器（浑天仪）：一个圆（最外那道环 66 × scale × 1.08）；
//   鲸：从头到尾一根轴、半径约体长的 0.1；环：沿着环的中线一圈 32 段，半径 = 环带的一半宽（30 × scale，含碎块大小）。
// 轨道（法典）是线，不算「外圈」：线从别的东西身上、门前面经过本来就是它的样子（电脑上一样）。
import { WHALE_L, RING_R, qRot, type State, type V3 } from './timeline';

export type Proj = (p: V3) => { x: number; y: number; front: boolean };
/** 世界里 c 那一点、半径 rw 的球，在屏幕上多大（CSS 像素） */
export type Rad = (c: V3, rw: number) => number;

/** 一段胶囊：线段 (ax, ay) → (bx, by)，半径 r（CSS 像素） */
export interface Cap { ax: number; ay: number; bx: number; by: number; r: number }
export interface Foot { id: 'sun' | 'ring' | 'whale' | 'arm'; vis: number; front: boolean; caps: Cap[]; box: { x0: number; y0: number; x1: number; y1: number } }

export const FOOT_IDS = ['sun', 'ring', 'whale', 'arm'] as const;

function boxOf(caps: Cap[]) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of caps) {
    x0 = Math.min(x0, c.ax - c.r, c.bx - c.r); x1 = Math.max(x1, c.ax + c.r, c.bx + c.r);
    y0 = Math.min(y0, c.ay - c.r, c.by - c.r); y1 = Math.max(y1, c.ay + c.r, c.by + c.r);
  }
  return { x0, y0, x1, y1 };
}

/** 这一帧四样东西在屏幕上的外圈（看不见的 vis = 0，也照样算出来） */
export function footprints(s: State, project: Proj, rad: Rad): Foot[] {
  const out: Foot[] = [];
  const pt = (c: V3, r: number): Cap => { const a = project(c); return { ax: a.x, ay: a.y, bx: a.x, by: a.y, r }; };
  // 日
  {
    const a = project(s.sun.c);
    const caps = [pt(s.sun.c, rad(s.sun.c, 46 * s.sun.scale * 1.25))];
    out.push({ id: 'sun', vis: s.sun.vis, front: a.front, caps, box: boxOf(caps) });
  }
  // 环：一圈 32 个点，相邻两点一段。环带在环的平面里宽 ±26 × scale（着色器 RING_CHIP），每一点把环带里外两头投到屏幕上：
  // 胶囊走两头正中，半径 = 两头隔开的一半 + 碎块上下的那点厚（4 × scale）。两边那截环带横着摊开、宽；前后那截压扁、窄
  {
    const caps: Cap[] = [];
    const N = 32, rr = RING_R * s.ring.scale, half = 26 * s.ring.scale, thick = 4 * s.ring.scale;
    const P: { x: number; y: number; r: number }[] = [];
    let front = true;
    const at = (rad0: number, t: number): V3 => {
      const v = qRot(s.ring.rot, [rad0 * Math.cos(t), 0, rad0 * Math.sin(t)]);
      return [s.ring.c[0] + v[0], s.ring.c[1] + v[1], s.ring.c[2] + v[2]];
    };
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const wi = at(rr - half, t), wo = at(rr + half, t), wm = at(rr, t);
      const qi = project(wi), qo = project(wo);
      front = front && qi.front && qo.front;
      P.push({ x: (qi.x + qo.x) / 2, y: (qi.y + qo.y) / 2, r: Math.hypot(qo.x - qi.x, qo.y - qi.y) / 2 + rad(wm, thick) });
    }
    for (let i = 0; i < N; i++) {
      const a = P[i], b = P[(i + 1) % N];
      caps.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, r: Math.max(a.r, b.r) });
    }
    out.push({ id: 'ring', vis: s.ring.vis, front, caps, box: boxOf(caps) });
  }
  // 鲸：游的时候身子沿着路弯（着色器里那样），中段在 mid；落定以后是一根直的
  {
    const L = WHALE_L * s.whale.scale;
    const c = s.whale.settle > 0.5 ? s.whale.c : s.whale.mid;
    const h = qRot(s.whale.rot, [L * 0.5, 0, 0]);
    const a = project([c[0] + h[0], c[1] + h[1], c[2] + h[2]]), b = project([c[0] - h[0], c[1] - h[1], c[2] - h[2]]);
    const caps = [{ ax: a.x, ay: a.y, bx: b.x, by: b.y, r: rad(c, L * 0.1) }];
    out.push({ id: 'whale', vis: s.whale.vis, front: a.front && b.front, caps, box: boxOf(caps) });
  }
  // 器
  {
    const a = project(s.arm.c);
    const caps = [pt(s.arm.c, rad(s.arm.c, 66 * s.arm.scale * 1.08))];
    out.push({ id: 'arm', vis: s.arm.vis, front: a.front, caps, box: boxOf(caps) });
  }
  return out;
}

// —— 距离 ——
function segSeg(a: Cap, b: Cap) {
  // 两条线段之间最近的距离（2D）
  const d1x = a.bx - a.ax, d1y = a.by - a.ay, d2x = b.bx - b.ax, d2y = b.by - b.ay;
  const rx = a.ax - b.ax, ry = a.ay - b.ay;
  const A = d1x * d1x + d1y * d1y, E = d2x * d2x + d2y * d2y, F = d2x * rx + d2y * ry;
  let s = 0, t = 0;
  if (A < 1e-9 && E < 1e-9) return Math.hypot(rx, ry);
  if (A < 1e-9) { t = Math.min(1, Math.max(0, F / E)); }
  else {
    const C = d1x * rx + d1y * ry;
    if (E < 1e-9) { s = Math.min(1, Math.max(0, -C / A)); }
    else {
      const B = d1x * d2x + d1y * d2y, den = A * E - B * B;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (B * F - C * E) / den)) : 0;
      t = (B * s + F) / E;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -C / A)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (B - C) / A)); }
    }
  }
  const px = a.ax + d1x * s - (b.ax + d2x * t), py = a.ay + d1y * s - (b.ay + d2y * t);
  return Math.hypot(px, py);
}

/** 两样东西外圈之间最窄的缝（像素；负数 = 叠进去多深） */
export function gap(a: Foot, b: Foot) {
  // 先用外框粗筛：框都隔得远，就不用逐段算
  const bx = Math.max(a.box.x0 - b.box.x1, b.box.x0 - a.box.x1, 0), by = Math.max(a.box.y0 - b.box.y1, b.box.y0 - a.box.y1, 0);
  if (Math.hypot(bx, by) > 80) return Math.hypot(bx, by);
  let g = 1e9;
  for (const p of a.caps) for (const q of b.caps) g = Math.min(g, segSeg(p, q) - p.r - q.r);
  return g;
}

/** 一个矩形（名字、「进去」、门）跟一样东西外圈的缝（像素；负数 = 压上了） */
export function gapBox(f: Foot, b: { x: number; y: number; w: number; h: number }) {
  let g = 1e9;
  for (const c of f.caps) {
    // 线段到矩形的距离：取线段上离矩形最近的点（细分几下够用，胶囊都不长）
    const n = Math.max(1, Math.ceil(Math.hypot(c.bx - c.ax, c.by - c.ay) / 6));
    for (let i = 0; i <= n; i++) {
      const x = c.ax + ((c.bx - c.ax) * i) / n, y = c.ay + ((c.by - c.ay) * i) / n;
      const dx = Math.max(b.x - x, 0, x - (b.x + b.w)), dy = Math.max(b.y - y, 0, y - (b.y + b.h));
      const inside = dx === 0 && dy === 0 ? -Math.min(x - b.x, b.x + b.w - x, y - b.y, b.y + b.h - y) : Math.hypot(dx, dy);
      g = Math.min(g, inside - c.r);
    }
  }
  return g;
}

/** v3.4 验收：从 from 到 to 每 step 一格（每格再按 clocks 里的几个时钟量：第七幕鲸在天上兜圈子，转到哪都不许撞），
 *  造好了的东西（BUILT）两两之间的缝；小于 minGap 的记下来（P、时钟、谁跟谁、缝多宽） */
export function scan(at: (P: number, t: number) => Foot[], o: { from: number; to: number; step: number; clocks: number[]; built: Record<string, number>; minGap: number; maxFails?: number }) {
  const fails: { P: number; t: number; a: string; b: string; gap: number }[] = [];
  let cells = 0, worst = 1e9, worstAt = '';
  const n = Math.round((o.to - o.from) / o.step);
  for (let i = 0; i <= n; i++) {
    const P = +(o.from + i * o.step).toFixed(4);
    for (const t of o.clocks) {
      const f = at(P, t).filter((x) => x.vis > 0.5 && P >= (o.built[x.id] ?? 99));
      cells++;
      for (let a = 0; a < f.length; a++) for (let b = a + 1; b < f.length; b++) {
        const g = gap(f[a], f[b]);
        if (g < worst) { worst = g; worstAt = `P ${P}、时钟 ${t}：${f[a].id}–${f[b].id}`; }
        if (g < o.minGap && fails.length < (o.maxFails ?? 400)) fails.push({ P, t, a: f[a].id, b: f[b].id, gap: +g.toFixed(1) });
      }
    }
  }
  return { cells, grid: n + 1, clocks: o.clocks.length, worst: +worst.toFixed(1), worstAt, fails };
}
