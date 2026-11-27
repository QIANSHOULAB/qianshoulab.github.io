// Ⅲ 布环：环和六颗小月。小月从 src/data/tools.ts 的 shop 读，有几样工具就有几颗。
import { Vector3 } from 'three';
import { COUNTS, GATE, SECTION_HEX, TIERS, hexToLinear, type Tier } from '../config';
import { sstep, seg, lerp } from '../timeline';
import { RING_FN, RING_PLACE, MOON_PLACE } from '../glsl/ring';
import { blockMesh, stoneMaterial, type Creation, type Frame, type U } from '../kit';
import { rng, shuffle } from '../layout';
import { shop } from '../../data/tools';
import { portraitPos } from './law';

const ZG = GATE.Z - GATE.T / 2;
export const RING = { c: new Vector3(0, 120, ZG), tilt: 0.38, r0: 168, r1: 216, gap: [190, 196], moonR: 9.5, moonRho: 193 };
const MAXM = 8;
const n = Math.min(MAXM, shop.length);
const FRONT = Math.PI / 2;
const TH0 = Math.PI / 12;
const STEP = (Math.PI * 2) / n;
const TH_MAX = TH0 + (n - 1) * STEP + TH0;
/** 第 j 颗小月转到正面时，第三幕走到哪了 */
export const moonAt = (j: number) => 0.46 + 0.49 * ((TH0 + j * STEP) / TH_MAX);
const moonPh = (j: number) => FRONT - TH0 - j * STEP;

function norm(c: [number, number, number]) { const m = Math.max(...c); return c.map((v) => v / m) as [number, number, number]; }
export const RING_COL = norm(hexToLinear(SECTION_HEX[1]));

export function buildRing(shared: U, stone: U) {
  const r = rng(30303);
  const N = COUNTS.ring;
  const items: number[][] = [];
  for (let i = 0; i < N; i++) {
    let rho = 0;
    do { rho = lerp(RING.r0, RING.r1, Math.pow(r(), 0.85)); } while (rho > RING.gap[0] && rho < RING.gap[1] && r() < 0.9);
    items.push([r() * Math.PI * 2, rho, (r() - 0.5) * 5 * (0.4 + 0.6 * r()), r(), r(), r(), r(), r()]);
  }
  shuffle(items, 31);
  const ringA = new Float32Array(N * 4), seedA = new Float32Array(N * 4);
  items.forEach((it, i) => { ringA.set(it.slice(0, 4), i * 4); seedA.set(it.slice(4, 8), i * 4); });

  const u = {
    uU: { value: -1 },
    uRot: { value: 0 },
    uBright: { value: 1 },
    uRingCol: { value: new Vector3(...RING_COL) },
    uSize: { value: 3.6 },
    uRingC: { value: RING.c.clone() },
    uTilt: { value: RING.tilt },
    uRingYaw: { value: 0 },
    uRingScale: { value: [1, 1] },
    uMoonR: { value: RING.moonR },
    uFlash: { value: new Array(MAXM).fill(0) },
    uMoonPh: { value: Array.from({ length: MAXM }, (_, j) => moonPh(j)) },
  };
  const mat = stoneMaterial(shared, stone, RING_FN + RING_PLACE, u);
  const ring = blockMesh(mat, { aRing: { data: ringA, size: 4 }, aSeed: { data: seedA, size: 4 } }, N);

  // 小月：每颗 COUNTS.moon 块，铺成一颗小球
  const M = COUNTS.moon;
  const moonA = new Float32Array(n * M * 4), mseed = new Float32Array(n * M * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < M; i++) {
      const y = 1 - (2 * (i + 0.5)) / M, rr = Math.sqrt(1 - y * y), th = golden * i;
      const o = (j * M + i) * 4;
      moonA.set([j, Math.cos(th) * rr, y, Math.sin(th) * rr], o);
      mseed.set([r(), r(), r(), r()], o);
    }
  }
  const mmat = stoneMaterial(shared, stone, RING_FN + MOON_PLACE, u);
  const moons = blockMesh(mmat, { aMoon: { data: moonA, size: 4 }, aSeed: { data: mseed, size: 4 } }, n * M);

  const tmp = new Vector3();
  const moonPos = Array.from({ length: n }, () => new Vector3());
  const moonVis = new Array(n).fill(0);
  let spin = 0;
  const gateLamp = new Vector3(0, GATE.H * 0.5, GATE.Z - GATE.T - 40);

  /** 环上一点（跟着色器里 ringPoint 一样算） */
  function ringPoint(ph: number, rho: number, h: number, out: Vector3) {
    const sc = u.uRingScale.value as number[];
    let x = Math.cos(ph) * rho, y = h, z = Math.sin(ph) * rho;
    // rotX(tilt)：前低后高
    const ct = Math.cos(RING.tilt), st = Math.sin(RING.tilt);
    const y2 = y * ct - z * st, z2 = y * st + z * ct;
    y = y2; z = z2;
    // rotY(yaw)
    const yaw = u.uRingYaw.value as number;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x3 = x * cy + z * sy, z3 = -x * sy + z * cy;
    out.set(x3 * sc[0], y, z3 * sc[1]).add(u.uRingC.value as Vector3);
    return out;
  }

  const creation: Creation & { moons: () => { pos: Vector3; o: number }[] } = {
    name: 'ring',
    objects: [ring, moons],
    setTier(t: Tier) {
      ring.geometry.instanceCount = Math.round(N * TIERS[t].blocks);
      moons.geometry.instanceCount = Math.round(n * M * Math.max(0.6, TIERS[t].blocks)) - (Math.round(n * M * Math.max(0.6, TIERS[t].blocks)) % 1);
    },
    update(f: Frame) {
      const P = f.P, uu = P - 2;
      const vis = uu > 0.1;
      ring.visible = moons.visible = vis;
      moonVis.fill(0);
      if (!vis) return;
      u.uU.value = uu;
      u.uRingScale.value = f.portrait ? [0.8, 0.8] : [1, 1];
      // 滑的时候环在转；第六幕被接住以后按自己的周期转（钟）
      const law = sstep(5.42, 5.56, P);
      if (!f.reduced) spin += f.dt * law * ((Math.PI * 2) / 60);
      const rot = TH_MAX * seg(uu, 0.46, 0.95) + spin;
      u.uRot.value = rot;
      u.uRingYaw.value = 0.25 * Math.sin(spin * 0.5) * law;
      // 全家福：环缩小、站进门洞那道白光里
      const pw = sstep(6.45, 6.85, P);
      if (pw > 0) {
        portraitPos(1, P, f.portrait, RING.c, tmp);
        (u.uRingC.value as Vector3).copy(tmp);
        const sc = lerp(1, 0.16, pw) * (f.portrait ? 0.8 : 1);
        u.uRingScale.value = [sc, sc];
      } else (u.uRingC.value as Vector3).copy(RING.c);
      const dim = lerp(1, 0.32, sstep(1.02, 1.22, uu));
      const bright = lerp(dim, 1, sstep(5.38, 5.52, P));
      u.uBright.value = bright;
      // 转到正面的那颗亮一下，旁边出它的名字
      for (let j = 0; j < n; j++) {
        const dj = (uu - moonAt(j)) / 0.034;
        const fl = P < 3.02 ? Math.exp(-dj * dj) : 0;
        (u.uFlash.value as number[])[j] = fl;
        ringPoint(moonPh(j) + rot, RING.moonRho, 0, moonPos[j]);
        moonVis[j] = P < 3.02 ? sstep(-1.45, -0.9, dj) * (1 - sstep(0.9, 1.45, dj)) : 0;
        if (fl > 0.02) {
          f.orbs.push({ pos: moonPos[j], col: RING_COL, i: 0.9 * fl, r: 16 });
          f.water.push({ pos: moonPos[j], col: RING_COL, i: 0.9 * fl * fl });
        }
      }
      // 环被门后的光照着：远的那半边（门后面）迎着光亮，近的这半边只有一圈背光的亮边
      const lit = sstep(0.2, 0.5, uu) * bright;
      f.keys.push({ pos: gateLamp, col: RING_COL, i: 1.3 * lit * (P < 3.3 || P > 5.38 ? 1 : 0.5) });
      if (P > 5.4) f.water.push({ pos: ringPoint(FRONT + rot, 190, 0, new Vector3()), col: RING_COL, i: 0.9 * bright });
    },
    moons: () => moonPos.map((p, j) => ({ pos: p, o: moonVis[j] })),
  };
  return creation;
}
