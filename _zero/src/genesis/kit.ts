// 搭场景用的几样小工具：共用的 uniform、石块材质、点材质、线材质、加法混合、每帧的「灯」登记表。
import {
  AddEquation, BoxGeometry, BufferGeometry, CustomBlending, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, OneFactor, Points, ShaderMaterial, Vector3, Vector4, ZeroFactor, type IUniform, type Material,
} from 'three';
import { COMMON, FRAG } from './glsl/common';
import { STONE_VERT_HEAD, STONE_VERT_MAIN, STONE_FRAG } from './glsl/stone';
import { POINT_HEAD, POINT_MAIN, POINT_FRAG, LINE_VERT, LINE_MAIN, LINE_FRAG } from './glsl/fx';
import { GATE } from './config';
import type { Tier } from './config';

export type U = Record<string, IUniform>;

/** 所有材质共用的 uniform（几个材质指向同一批对象，改一处全改） */
export function sharedUniforms() {
  return {
    uTime: { value: 0 },
    uP: { value: 0 },
    uExposure: { value: 0.72 },
    uCamPos: { value: new Vector3() },
    uMirror: { value: 1 },
    uLight: { value: 0 },
    uActCol: { value: new Vector3(1, 1, 1) },
    uGate: { value: new Vector4(GATE.W / 2, GATE.H, GATE.Z, GATE.T) },
    uPixAng: { value: 0.0007 },
    uPortrait: { value: 0 },
  };
}

/** 石块、窗、门后的光：门、造物的片元着色器都要读 */
export function stoneUniforms() {
  return {
    uKey: { value: new Vector4(0, 0, 0, 0) },
    uKeyCol: { value: new Vector3(1, 1, 1) },
    uBack: { value: new Vector3(0, GATE.H * 0.5, GATE.Z - GATE.T - 46) },
    uWinRect: { value: [0, 1, 2, 3, 4].map(() => new Vector4()) },
    uWinCol: { value: [0, 1, 2, 3, 4].map(() => new Vector3(1, 1, 1)) },
    uWinOn: { value: [0, 0, 0, 0, 0] },
    uHalo: { value: 0 },
    uWhite: { value: 0 },
  };
}

export const additive = {
  transparent: true,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const;

/** 石块材质：门和造物共用一个片元着色器；顶点那头每样东西写自己的 place() */
export function stoneMaterial(shared: U, stone: U, place: string, extra: U) {
  return new ShaderMaterial({
    uniforms: { ...shared, ...stone, ...extra },
    vertexShader: COMMON + STONE_VERT_HEAD + place + STONE_VERT_MAIN,
    // 沿水面翻过来画倒影时三角形的绕向也翻了：两面都画，片元里扔掉朝里的那面
    fragmentShader: COMMON + FRAG + STONE_FRAG.replace('void main() {', 'void main() {\n  if ((gl_FrontFacing ? 1. : -1.) * uMirror < 0.) discard;'),
    side: DoubleSide,
  });
}

/** 一堆实例化的方块：块的位置全在着色器里算，这里只给每块的种子 */
export function blockMesh(material: Material, attrs: Record<string, { data: Float32Array; size: number }>, count: number) {
  const box = new BoxGeometry(1, 1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = box.index;
  geo.setAttribute('position', box.getAttribute('position'));
  geo.setAttribute('normal', box.getAttribute('normal'));
  for (const [k, a] of Object.entries(attrs)) geo.setAttribute(k, new InstancedBufferAttribute(a.data, a.size));
  geo.instanceCount = count;
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}

export function pointMaterial(shared: U, place: string, extra: U) {
  return new ShaderMaterial({
    uniforms: { ...shared, ...extra },
    vertexShader: COMMON + POINT_HEAD + place + POINT_MAIN,
    fragmentShader: COMMON + FRAG + POINT_FRAG,
    ...additive,
  });
}

export function pointCloud(material: Material, attrs: Record<string, { data: Float32Array; size: number }>, count: number) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
  for (const [k, a] of Object.entries(attrs)) geo.setAttribute(k, new Float32BufferAttribute(a.data, a.size));
  geo.setDrawRange(0, count);
  const pts = new Points(geo, material);
  pts.frustumCulled = false;
  return pts;
}

/** 细线：一串点连成的折线（可以闭合），每段在屏幕上撑成一条细带子 */
export function lineMaterial(shared: U, place: string, color: string, extra: U) {
  return new ShaderMaterial({
    uniforms: { uView: { value: [1, 1] }, ...shared, uWidth: { value: 1.3 }, ...extra },
    vertexShader: COMMON + LINE_VERT + place + LINE_MAIN,
    fragmentShader: COMMON + FRAG + color + LINE_FRAG,
    ...additive,
    side: DoubleSide,
  });
}

/** segs：每段两头 [ax,ay,az,sa, bx,by,bz,sb] */
export function lineMesh(material: Material, segs: number[][]) {
  const n = segs.length;
  const A = new Float32Array(n * 4 * 4), B = new Float32Array(n * 4 * 4), S = new Float32Array(n * 4), E = new Float32Array(n * 4);
  const idx: number[] = [];
  segs.forEach((g, i) => {
    for (let v = 0; v < 4; v++) {
      const o = (i * 4 + v) * 4;
      A.set(g.slice(0, 4), o);
      B.set(g.slice(4, 8), o);
      S[i * 4 + v] = v % 2 === 0 ? -1 : 1;
      E[i * 4 + v] = v < 2 ? 0 : 1;
    }
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(n * 4 * 3), 3));
  geo.setAttribute('aA', new Float32BufferAttribute(A, 4));
  geo.setAttribute('aB', new Float32BufferAttribute(B, 4));
  geo.setAttribute('aSide', new Float32BufferAttribute(S, 1));
  geo.setAttribute('aEnd', new Float32BufferAttribute(E, 1));
  geo.setIndex(idx);
  const m = new Mesh(geo, material);
  m.frustumCulled = false;
  return m;
}

/** 每帧的灯：造物把自己的光登记进来，场景挑出来交给着色器（水面高光最多 6 盏，天上光团最多 4 团，石头上的主灯 1 盏） */
export interface Lamp { pos: Vector3; col: [number, number, number]; i: number; r?: number }
export interface Frame {
  P: number;
  time: number;        // 世界的钟（秒，顿帧那一拍停）
  real: number;        // 真实时间（毫秒）
  dt: number;
  portrait: boolean;
  aspect: number;
  tier: Tier;
  cam: Vector3;
  reduced: boolean;
  water: Lamp[];
  orbs: Lamp[];
  keys: Lamp[];
}

/** 造物：一组要画的东西 + 每帧按进度摆好 */
export interface Creation {
  name: string;
  objects: (Mesh | Points)[];
  update(f: Frame): void;
  setTier?(t: Tier): void;
}
