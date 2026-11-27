// Ⅴ 铸器：红点、坍缩的碎石、顿帧、炸开（冲击波、火星）、浑天仪。浑天仪的三道环在第六幕放出轨道（law.ts 读这里的状态）。
import { Vector3, Vector4 } from 'three';
import { COUNTS, GATE, SECTION_HEX, TIERS, hexToLinear, type Tier } from '../config';
import { sstep, seg, lerp } from '../timeline';
import { FORGE_FN, FORGE_PLACE, DEBRIS_PLACE, SPARK_PLACE } from '../glsl/forge';
import { blockMesh, pointCloud, pointMaterial, stoneMaterial, type Creation, type Frame, type U } from '../kit';
import { rng, shuffle, SPOT_RECTS } from '../layout';
import { orbitPos, portraitPos, PORTRAIT_SCALE } from './law';

function norm(c: [number, number, number]) { const m = Math.max(...c); return c.map((v) => v / m) as [number, number, number]; }
export const FIRE_COL = norm(hexToLinear(SECTION_HEX[3]));
/** 红点悬在门前：门中段偏上，环的近边上头 */
export const FORGE_C = new Vector3(0, 134, GATE.Z + 150);
const WIN = (() => { const [x0, y0, x1, y1] = SPOT_RECTS[3]; return new Vector3((x0 + x1) / 2, (y0 + y1) / 2, GATE.Z + 2); })();

export interface ForgeState { center: Vector3; spin: number; ringSpin: Vector3; scale: number }

export function buildForge(shared: U, stone: U) {
  const r = rng(1200);
  // 浑天仪：三道环各 640 块（沿环一圈 × 横跨 × 厚度），极轴 100 块
  const items: number[][] = [];
  const perRing = Math.round((COUNTS.forge - 100) / 3);
  for (let k = 0; k < 3; k++) for (let i = 0; i < perRing; i++) items.push([k, r() * Math.PI * 2, r() * 2 - 1, r() * 2 - 1]);
  for (let i = 0; i < 100; i++) items.push([3, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]);
  shuffle(items, 12);
  const N = items.length;
  const A = new Float32Array(N * 4), S = new Float32Array(N * 4);
  items.forEach((it, i) => { A.set(it, i * 4); S.set([r(), r(), r(), r()], i * 4); });

  const u = {
    uU: { value: -1 },
    uBright: { value: 1 },
    uTemp: { value: 1 },
    uFc: { value: FORGE_C.clone() },
    uArm: { value: FORGE_C.clone() },
    uArmS: { value: 1 },
    uArmSpin: { value: 0 },
    uRingSpin: { value: new Vector3() },
    uWin: { value: WIN.clone() },
  };
  const mat = stoneMaterial(shared, stone, FORGE_FN + FORGE_PLACE, u);
  const arm = blockMesh(mat, { aR: { data: A, size: 4 }, aSeed: { data: S, size: 4 } }, N);

  // 碎石
  const ND = COUNTS.debris;
  const D = new Float32Array(ND * 4), DS = new Float32Array(ND * 4);
  for (let i = 0; i < ND; i++) {
    const v = new Vector3(r() * 2 - 1, (r() * 2 - 1) * 0.7, r() * 2 - 1).normalize();
    D.set([v.x, v.y, v.z, Math.pow(r(), 0.7)], i * 4);
    DS.set([r(), r(), r(), r()], i * 4);
  }
  const dmat = stoneMaterial(shared, stone, FORGE_FN + DEBRIS_PLACE, u);
  const debris = blockMesh(dmat, { aD: { data: D, size: 4 }, aSeed: { data: DS, size: 4 } }, ND);

  // 火星
  const NS = 1600;
  const V = new Float32Array(NS * 4), VS = new Float32Array(NS * 4);
  for (let i = 0; i < NS; i++) {
    const v = new Vector3(r() * 2 - 1, r() * 1.6 - 0.35, r() * 2 - 1).normalize();
    V.set([v.x, v.y, v.z, 160 + 520 * Math.pow(r(), 1.5)], i * 4);
    VS.set([r(), r(), r(), r()], i * 4);
  }
  const smat = pointMaterial(shared, FORGE_FN + SPARK_PLACE, { ...u, uPxScale: shared.uPxScale });
  const sparks = pointCloud(smat, { aV: { data: V, size: 4 }, aSeed: { data: VS, size: 4 } }, NS);
  sparks.renderOrder = 5;

  const state: ForgeState = { center: FORGE_C.clone(), spin: 0, ringSpin: new Vector3(), scale: 1 };
  let spin = 0;
  const ringSpin = new Vector3();
  const tmp = new Vector3();
  const creation: Creation & { state: () => ForgeState; shock: Vector4 } = {
    name: 'forge',
    objects: [arm, debris, sparks],
    target: () => state.center,
    shock: new Vector4(),
    setTier(t: Tier) {
      arm.geometry.instanceCount = Math.round(N * Math.max(0.55, TIERS[t].blocks));
      debris.geometry.instanceCount = Math.round(ND * TIERS[t].blocks);
      sparks.geometry.setDrawRange(0, Math.round(NS * Math.max(0.4, TIERS[t].blocks)));
    },
    update(f: Frame) {
      const P = f.P, uu = P - 4;
      const vis = uu > 0.1;
      arm.visible = debris.visible = sparks.visible = vis;
      creation.shock.set(0, 0, 0, 0);
      if (!vis) return;
      u.uU.value = uu;
      debris.visible = uu < 0.75;
      sparks.visible = uu > 0.52 && uu < 1.2;
      // 慢慢转：炸出来以后才自己动（钟），第六幕起转得更明白
      if (!f.reduced && uu > 0.57) {
        const law = sstep(5.62, 5.72, P);
        spin += f.dt * (0.12 + 0.1 * law);
        ringSpin.x += f.dt * 0.21; ringSpin.y -= f.dt * 0.13; ringSpin.z += f.dt * 0.08;
      }
      u.uArmSpin.value = spin;
      (u.uRingSpin.value as Vector3).copy(ringSpin);
      // 从白热冷到暗红（缝里的火冷得慢，着色器里另算）
      const temp = lerp(1, 0.2, sstep(0.6, 1.0, uu));
      const dim = lerp(1, 0.45, sstep(1.02, 1.2, uu));
      const law = sstep(5.62, 5.74, P);
      u.uTemp.value = lerp(temp, 0.5, law * 0.8);
      u.uBright.value = lerp(dim, 1, law);
      // 第六幕被轨道接住、第七幕站进全家福
      orbitPos(3, P, f.time, f.portrait, FORGE_C, tmp);
      portraitPos(3, P, f.portrait, tmp, tmp);
      (u.uArm.value as Vector3).copy(tmp);
      u.uArmS.value = lerp(1, PORTRAIT_SCALE[3], sstep(6.45, 6.85, P));
      state.center.copy(tmp); state.spin = spin; state.ringSpin.copy(ringSpin); state.scale = u.uArmS.value as number;
      // 光：红点（越缩越亮，白到发烫）→ 炸开那一下全场最亮 → 浑天仪的红光
      // 顿帧那一拍（0.48–0.52）：缩到最小、最亮，一切停住；0.52 炸开
      const core = sstep(0.12, 0.2, uu) * (0.5 + 6 * Math.pow(seg(uu, 0.3, 0.48), 3)) * (uu < 0.52 ? 1 : 0);
      const flash = uu >= 0.52 ? Math.exp(-(uu - 0.52) / 0.02) * 7 : 0;
      const armL = sstep(0.54, 0.62, uu) * (0.6 + 2.2 * temp) * (uu < 1 ? 1 : lerp(1, 0.5, sstep(1.02, 1.2, uu)));
      const L = core + flash + armL * (1 - 0.3 * law) + law * 0.8;
      const col = mix3(FIRE_COL, [1, 0.85, 0.7], Math.min(1, (core + flash) / 6));
      if (L > 0.02) {
        f.water.push({ pos: tmp.clone(), col, i: Math.min(6, 0.9 * L) });
        f.orbs.push({ pos: tmp.clone(), col, i: Math.min(3, 0.32 * L), r: 16 + 26 * Math.min(1, flash / 4) + 14 * sstep(0.54, 0.62, uu) });
        f.keys.push({ pos: tmp.clone(), col, i: Math.min(2.2, 0.6 * L) * (P < 5.05 ? 1 : 0.35) });
      }
      // 冲击波：贴着水面朝人扫过来，从脚下穿过去
      if (uu > 0.52 && uu < 0.84) {
        const x = (uu - 0.52) / 0.3;
        creation.shock.set(FORGE_C.x, FORGE_C.z, 1400 * Math.pow(x, 0.8), (1 - x) * (1 - x));
      }
    },
    state: () => state,
  };
  return creation;
}

function mix3(a: number[], b: number[], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
