// Ⅳ 赋生：巨鲸。路线、什么时候游到哪、什么时候钉成星座、标本签放哪，在这里算；身子怎么摆在 ../glsl/whale.ts。
import { Vector3, Vector4 } from 'three';
import { COUNTS, GATE, SECTION_HEX, TIERS, hexToLinear, type Tier } from '../config';
import { sstep, seg, lerp, easeInOut, horizonAt, camDist, tanHalfAt } from '../timeline';
import { MAX_ASPECT } from '../config';
import { WHALE_FN, WHALE_PLACE, WHALE_STARS, WHALE_LINE, WHALE_LINE_COL } from '../glsl/whale';
import { blockMesh, lineMaterial, lineMesh, pointCloud, pointMaterial, stoneMaterial, type Creation, type Frame, type U } from '../kit';
import { rng, shuffle } from '../layout';
import { orbitPos, portraitPos } from './law';

const ZG = GATE.Z - GATE.T / 2;
export const WHALE_L = 300;          // 比门还高（门 240）
const WH = 118;
const SEG = 133 + 439.823 + 13 + 1319.469;
function norm(c: [number, number, number]) { const m = Math.max(...c); return c.map((v) => v / m) as [number, number, number]; }
export const LIFE_COL = norm(hexToLinear(SECTION_HEX[2]));

/** 星座钉在天上哪儿：横屏在门左边那片天（头朝左上，侧身对着人），竖屏横在太阳上头 */
function spot(portrait: boolean, halfW: number) {
  if (portrait) return { K: new Vector3(-150, 532, ZG + 40), dir: new Vector3(-0.97, 0.24, 0).normalize() };
  return { K: new Vector3(-Math.min(400, Math.max(300, halfW * 0.8)), 330, ZG + 40), dir: new Vector3(-0.88, 0.47, 0).normalize() };
}

// 关节（亮成星点的地方）：part、a、b、c（跟着色器里 whalePoint 的参数一样）
const J: [number, number, number, number][] = [
  [0, 0.0, 0, 1], [0, 0.14, 0, 0], [0, 0.42, 0, 0], [5, 0.64, 1, 0], [0, 0.9, 0, 0], [3, 0, 0, 0], [3, 1, 0, 0], [4, 1, 0, 0],
  [0, 0.07, Math.PI, 0], [0, 0.42, Math.PI, 0], [1, 0, 0, 0], [1, 1, 0, 0], [2, 0, 0, 0], [2, 1, 0, 0], [0, 0.1, Math.PI / 2 + 0.35, 0],
];
const LINES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [5, 7], [0, 8], [8, 9], [9, 4], [10, 11], [12, 13], [8, 10], [8, 12]];

function bez(a: Vector3, b: Vector3, c: Vector3, d: Vector3, t: number, out = new Vector3()) {
  const s = 1 - t;
  return out.set(0, 0, 0).addScaledVector(a, s * s * s).addScaledVector(b, 3 * s * s * t).addScaledVector(c, 3 * s * t * t).addScaledVector(d, t * t * t);
}

export function buildWhale(shared: U, stone: U) {
  const r = rng(1001);
  const items: number[][] = [];
  const NB = Math.round(COUNTS.whale * 0.69), NF = Math.round(COUNTS.whale * 0.09), NT = Math.round(COUNTS.whale * 0.055), ND = 60;
  const bodyF = (s: number) => {
    if (s < 0.03) return 0.45 * Math.sqrt(s / 0.03);
    if (s < 0.28) return lerp(0.45, 1, sstep(0.03, 0.28, s));
    if (s < 0.6) return lerp(1, 0.74, sstep(0.28, 0.6, s));
    if (s < 0.9) return lerp(0.74, 0.12, sstep(0.6, 0.9, s));
    return lerp(0.12, 0.07, sstep(0.9, 1, s));
  };
  // 身子：越粗的地方块越多（按表面积撒）
  while (items.filter((x) => x[0] === 0).length < NB) {
    const s = r();
    if (r() > bodyF(s) * 1.05 + 0.04) continue;
    items.push([0, s, r() * Math.PI * 2, r() < 0.8 ? 0 : 0.3 + 0.4 * r()]);
  }
  for (const part of [1, 2]) for (let i = 0; i < NF; i++) items.push([part, Math.pow(r(), 1.25), r() * 2 - 1, 0]);
  for (const part of [3, 4]) for (let i = 0; i < NT; i++) items.push([part, Math.pow(r(), 0.9), r() * 2 - 1, 0]);
  for (let i = 0; i < ND; i++) items.push([5, 0.59 + 0.1 * r(), r(), 0]);
  shuffle(items, 47);
  const N = items.length;
  const W = new Float32Array(N * 4), S = new Float32Array(N * 4);
  items.forEach((it, i) => { W.set(it, i * 4); S.set([r(), r(), r(), r()], i * 4); });

  const u = {
    uHead: { value: 0 },
    uWL: { value: WHALE_L },
    uWH: { value: WH },
    uSwimT: { value: 0 },
    uSwimA: { value: 9 },
    uNarrow: { value: 1 },
    uB1: { value: new Vector3() },
    uB2: { value: new Vector3() },
    uK: { value: new Vector3() },
    uLb: { value: 500 },
    uPivot: { value: new Vector3() },
    uMoveT: { value: new Vector3() },
    uMoveYaw: { value: 0 },
    uMoveS: { value: 1 },
    uBright: { value: 1 },
    uLifeCol: { value: new Vector3(...LIFE_COL) },
    uGhost: { value: 0 },
    uSize: { value: 5.3 },
    uRoll: { value: 0 },
    uFront: { value: GATE.Z },
    uStar: { value: 0 },
    uLines: { value: 0 },
    uJ: { value: Array.from({ length: 16 }, (_, i) => new Vector4(...(J[i] ?? [0, 0, 0, 0]))) },
  };
  const mat = stoneMaterial(shared, stone, WHALE_FN + WHALE_PLACE, u);
  const body = blockMesh(mat, { aW: { data: W, size: 4 }, aSeed: { data: S, size: 4 } }, N);

  // 星点
  const sj = new Float32Array(J.length * 4), si = new Float32Array(J.length);
  J.forEach((j, i) => { sj.set(j, i * 4); si[i] = i / J.length; });
  const smat = pointMaterial(shared, WHALE_FN + WHALE_STARS, { ...u, uPxScale: shared.uPxScale });
  const stars = pointCloud(smat, { aJ: { data: sj, size: 4 }, aIdx: { data: si, size: 1 } }, J.length);
  stars.renderOrder = 6;
  // 星座的线
  const lmat = lineMaterial(shared, WHALE_FN + WHALE_LINE, WHALE_LINE_COL, { ...u, uWidth: { value: 1.2 } });
  const lines = lineMesh(lmat, LINES.map(([a, b], i) => [a, 0, 0, i / LINES.length, b, 0, 0, 0]));
  lines.renderOrder = 6;

  const K = new Vector3(), dir = new Vector3(), B1 = new Vector3(), B2 = new Vector3(), F = new Vector3();
  const pivot = new Vector3(), moved = new Vector3(), tmp = new Vector3();
  let Lb = 500, aTotal = SEG + 500;
  let lastKey = '';
  function route(portrait: boolean, aspect: number) {
    // 第四幕末尾门那一面上左右各看得见多宽：星座放在左边那片天里，别出框
    const hz = horizonAt(4, portrait);
    const halfW = camDist(4) * tanHalfAt(4, aspect, hz) * Math.min(aspect, MAX_ASPECT);
    const key = `${portrait}|${Math.round(halfW)}`;
    if (key === lastKey) return;
    lastKey = key;
    const sp = spot(portrait, halfW);
    K.copy(sp.K); dir.copy(sp.dir);
    F.set(0, WH, ZG + 280);
    B1.copy(F).add(new Vector3(-200, 30, -60));
    B2.copy(K).addScaledVector(dir, -220);
    // 量一下贝塞尔有多长（身子按路线上的长度排）
    let len = 0;
    const prev = F.clone(), cur = new Vector3();
    for (let i = 1; i <= 96; i++) { bez(F, B1, B2, K, i / 96, cur); len += cur.distanceTo(prev); prev.copy(cur); }
    Lb = len;
    aTotal = SEG + Lb;
    u.uB1.value.copy(B1); u.uB2.value.copy(B2); u.uK.value.copy(K); u.uLb.value = Lb;
    // 星座的中心（第六幕绕它转）：身子中段落在贝塞尔上的那一点
    let acc = 0;
    prev.copy(F);
    for (let i = 1; i <= 96; i++) { bez(F, B1, B2, K, i / 96, cur); acc += cur.distanceTo(prev); prev.copy(cur); if (acc >= Lb - WHALE_L * 0.45) break; }
    pivot.copy(cur);
    u.uPivot.value.copy(pivot);
  }

  const labelAt = new Vector3();
  let vis = false, labelO = 0;
  const creation: Creation & { label: () => { pos: Vector3; o: number } } = {
    name: 'whale',
    objects: [body, stars, lines],
    setTier(t: Tier) { body.geometry.instanceCount = Math.round(N * TIERS[t].blocks); },
    update(f: Frame) {
      const P = f.P, uu = P - 3;
      vis = uu > 0.12;
      body.visible = stars.visible = lines.visible = vis;
      if (!vis) return;
      route(f.portrait, f.aspect);
      u.uNarrow.value = f.portrait ? 0.6 : 1;
      // 从门缝里游出来、绕门一周、升到天上停住（慢慢出来，绕得快一点，升上去慢慢停）
      const t = seg(uu, 0.14, 0.84);
      u.uHead.value = aTotal * (0.5 * t + 0.5 * easeInOut(t)) + 0.0001;
      const pin = sstep(0.82, 0.9, uu);
      u.uSwimA.value = 9 * (1 - pin);
      u.uRoll.value = -0.5 * pin;
      u.uSwimT.value = f.reduced ? 0 : f.time;
      u.uGhost.value = sstep(0.86, 0.95, uu);
      u.uStar.value = seg(uu, 0.85, 0.94);
      u.uLines.value = seg(uu, 0.9, 0.98);
      // 造好以后退到半暗；第六幕被轨道接住时一起亮
      const dim = lerp(1, 0.38, sstep(1.02, 1.2, uu));
      const bright = lerp(dim, 1, sstep(5.5, 5.64, P));
      u.uBright.value = bright;
      // 第六幕：整个星座被轨道接住，绕门转；第七幕缩小，站进全家福
      orbitPos(2, P, f.time, f.portrait, pivot, moved);
      portraitPos(2, P, f.portrait, moved, moved);
      u.uMoveT.value.copy(moved).sub(pivot);
      const caught = sstep(5.54, 5.64, P);
      u.uMoveYaw.value = caught * ((f.time / 40) * Math.PI * 2 * 0.25) % (Math.PI * 2);
      u.uMoveS.value = lerp(1, 0.2, sstep(6.45, 6.85, P));
      // 游的时候自带一盏青光（照水）；钉成星座以后天上一团淡淡的光
      const swim = sstep(0.16, 0.3, uu) * (1 - pin);
      if (swim > 0.01) f.water.push({ pos: tmp.set(0, WH, ZG + 200), col: LIFE_COL, i: 0.5 * swim });
      if (pin > 0.01) f.orbs.push({ pos: moved.clone(), col: LIFE_COL, i: 0.22 * pin * bright, r: 90 });
      // 标本签：星座下方
      labelAt.copy(moved).add(f.portrait ? new Vector3(-110, 78, 0) : new Vector3(-60, -112, 0));
      labelO = sstep(0.93, 0.98, uu) * (1 - sstep(1.03, 1.1, uu));
    },
    label: () => ({ pos: labelAt, o: vis ? labelO : 0 }),
  };
  return creation;
}
