// Ⅱ 燃日：太阳（几千块碎石）和它的一千道火舌。位置怎么走在这里算，块怎么飞在 ../glsl/sun.ts。
import { Vector3 } from 'three';
import { COUNTS, GATE, SECTION_HEX, TIERS, hexToLinear, type Tier } from '../config';
import { sstep, seg, lerp, clamp } from '../timeline';
import { SUN_PLACE, FLAME_PLACE } from '../glsl/sun';
import { blockMesh, pointCloud, pointMaterial, stoneMaterial, type Creation, type Frame, type U } from '../kit';
import { rng, shuffle } from '../layout';
import { orbitPos, portraitPos } from './law';

export const SUN_R = 42;            // 门比太阳大：直径 84 < 门宽 107
const ZG = GATE.Z - GATE.T / 2;     // 门的中面
export const SUN_REST = { land: new Vector3(0, 302, ZG), port: new Vector3(0, 352, ZG) };
const FLAMES = 1000, TRAIL = 11;

function norm(c: [number, number, number]) { const m = Math.max(...c); return c.map((v) => v / m) as [number, number, number]; }
export const SUN_COL = norm(hexToLinear(SECTION_HEX[0]));

/** 太阳球心：在门缝前鼓起来，升到门顶正上方；第六幕被轨道接住，第七幕站进全家福 */
export function sunCenter(P: number, portrait: boolean, time: number, out = new Vector3()) {
  const u = P - 1;
  const rest = portrait ? SUN_REST.port : SUN_REST.land;
  const born = new Vector3(0, 116, GATE.Z + 34);
  const t = sstep(0.3, 0.58, u);
  out.copy(born).lerp(rest, t);
  out.z += Math.sin(t * Math.PI) * 26;           // 升的路上往前鼓一点，再落回门那一面
  if (P > 5) orbitPos(0, P, time, portrait, out, out);
  if (P > 6) portraitPos(0, P, portrait, out, out);
  return out;
}

export function buildSun(shared: U, stone: U): Creation {
  // —— 块：表面 3/4 用斐波那契球面均匀铺，内层 1/4 随机填缝 ——
  const N = COUNTS.sun;
  const r = rng(5021);
  const items: number[][] = [];
  const surf = Math.round(N * 0.76);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < surf; i++) {
    const y = 1 - (2 * (i + 0.5)) / surf;
    const rr = Math.sqrt(1 - y * y);
    const th = golden * i;
    items.push([Math.cos(th) * rr, y, Math.sin(th) * rr, 0]);
  }
  for (let i = surf; i < N; i++) {
    const v = new Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
    items.push([v.x, v.y, v.z, 0.25 + 0.5 * r()]);
  }
  shuffle(items, 77);
  const seed = new Float32Array(N * 4), dir = new Float32Array(N * 4);
  items.forEach((d, i) => { dir.set(d, i * 4); seed.set([r(), r(), r(), r()], i * 4); });

  const u = {
    uU: { value: -1 },
    uSunPos: { value: new Vector3() },
    uSunRad: { value: SUN_R },
    uSpin: { value: 0 },
    uHeat: { value: 0 },
    uBright: { value: 1 },
    uSunCol: { value: new Vector3(...SUN_COL) },
    uSize: { value: 3.4 },
    uFlame: { value: 0 },
  };
  const mat = stoneMaterial(shared, stone, SUN_PLACE, u);
  const blocks = blockMesh(mat, { aSeed: { data: seed, size: 4 }, aDir: { data: dir, size: 4 } }, N);

  // —— 火舌：一千道，每道拖六个点；一圈一圈点着（先正对着人的那圈，再往外，最后是边上那圈） ——
  const T = new Float32Array(FLAMES * TRAIL * 4), S = new Float32Array(FLAMES * TRAIL * 4), TG = new Float32Array(FLAMES * TRAIL * 3);
  const tongues: number[][] = [];
  for (let i = 0; i < FLAMES; i++) {
    const d = new Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
    const any = Math.abs(d.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const tg = new Vector3().crossVectors(d, any).normalize().applyAxisAngle(d, r() * Math.PI * 2);
    const big = r() < 0.06;
    const h = big ? 0.55 + 0.45 * r() : 0.1 + 0.32 * Math.pow(r(), 1.6);
    const ring = Math.acos(clamp(d.z, -1, 1)) / Math.PI;        // 0 正对人 … 1 背面
    const ig = 0.56 + 0.3 * Math.min(1, Math.floor(ring * 9) / 6) + 0.012 * r();
    tongues.push([d.x, d.y, d.z, h, 2.6 + 3.4 * r(), r(), ig, tg.x, tg.y, tg.z]);
  }
  shuffle(tongues, 91);
  tongues.forEach((g, i) => {
    for (let k = 0; k < TRAIL; k++) {
      const o = i * TRAIL + k;
      T.set([g[0], g[1], g[2], g[3]], o * 4);
      S.set([k / (TRAIL - 1), g[4], g[5], g[6]], o * 4);
      TG.set([g[7], g[8], g[9]], o * 3);
    }
  });
  const pmat = pointMaterial(shared, FLAME_PLACE, { ...u, uPxScale: shared.uPxScale });
  const flames = pointCloud(pmat, { aT: { data: T, size: 4 }, aS: { data: S, size: 4 }, aTan: { data: TG, size: 3 } }, FLAMES * TRAIL);
  flames.renderOrder = 5;

  const center = new Vector3();
  const lampPos = new Vector3();
  return {
    name: 'sun',
    objects: [blocks, flames],
    setTier(t: Tier) {
      const f = TIERS[t].blocks;
      blocks.geometry.instanceCount = Math.round(N * f);
      flames.geometry.setDrawRange(0, Math.round(FLAMES * Math.max(0.5, f)) * TRAIL);
    },
    update(f: Frame) {
      const P = f.P, uu = P - 1;
      const vis = uu > 0.05;
      blocks.visible = flames.visible = vis;
      if (!vis) return;
      u.uU.value = uu;
      sunCenter(P, f.portrait, f.time, center);
      u.uSunPos.value.copy(center);
      const rad = SUN_R * lerp(0.55, 1, sstep(0.2, 0.5, uu)) * (P > 6 ? lerp(1, 0.8, sstep(6.3, 6.9, P)) : 1);
      u.uSunRad.value = rad;
      u.uSpin.value = f.reduced ? 0 : f.time * 0.045;
      const heat = sstep(0.46, 0.6, uu);
      u.uHeat.value = heat;
      // 造好以后退到半暗；第六幕被轨道接住时一起亮
      const dim = lerp(1, 0.12, sstep(1.02, 1.22, uu));
      const law = sstep(5.32, 5.5, P);
      const bright = lerp(dim, 1, law);
      u.uBright.value = bright;
      u.uFlame.value = 1;
      const L = heat * bright;
      if (L > 0.01) {
        lampPos.copy(center);
        f.water.push({ pos: lampPos, col: SUN_COL, i: 2.6 * L });
        f.orbs.push({ pos: lampPos, col: SUN_COL, i: 1.15 * L, r: rad * 1.25 });
        f.keys.push({ pos: lampPos, col: SUN_COL, i: 1.6 * L * (P < 2.2 ? 1 : 0.4) });
      }
      // 光刃挤出来那一段：门缝前一团金光
      const blade = sstep(0.06, 0.14, uu) * (1 - sstep(0.3, 0.42, uu));
      if (blade > 0.01) f.orbs.push({ pos: new Vector3(0, 116, GATE.Z + 20), col: SUN_COL, i: 0.9 * blade, r: 40 });
    },
  };
}
