// 造物之门的画面：一望无际的黑水，地平线正中一道门（两扇黑石门），门后一盏光。
// 往下滑，门里一样一样往外生东西：日、环、鲸、器、律；第七幕门全开，白光盖满，万物成剪影。
// 这个文件只管画：滚动、字、声音、进去在 ../home/home.ts。three.js 跟这个文件一起异步加载，不挡首屏。
import {
  AdditiveBlending, BackSide, BoxGeometry, BufferGeometry, CustomBlending, DoubleSide, Float32BufferAttribute, FrontSide,
  InstancedBufferAttribute, InstancedBufferGeometry, LinearSRGBColorSpace, Matrix3, Matrix4, Mesh, OneFactor, PerspectiveCamera,
  PlaneGeometry, Points, Quaternion, Raycaster, Scene, ShaderMaterial, SphereGeometry, UnsignedByteType, Vector2, Vector3,
  Vector4, WebGLRenderTarget, WebGLRenderer, ZeroFactor, Box3, type Material, type Object3D,
} from 'three';
import * as G from './glsl';
import { H, W, T, DIST, Z_FRONT, CELL, clusters, blocks } from './layout';
import { TIERS, type Tier, EXPOSURE, OPENER_MS, FF_MS, SMOOTH_S, HITSTOP_MS, SECTION_HEX, hexToLinear } from './tune';
import { computeState, type State, type V3, type Q, EYE, DC, COL, WHALE_L, WHALE_R, qMat, cl, ss, mix, RING_R } from './timeline';

export interface GenesisOpts {
  host: HTMLElement;             // 画布铺满它；--monof（门占屏高多少）从它的 CSS 读
  reduced: boolean;              // prefers-reduced-motion：不放开场，每幕直接摆到位
  seen: boolean;                 // 这次会话看过开场了：1.5 秒快进
  freezeP?: number | null;       // 调试 / 截图：进度定在这里（?act=）
  freezeT?: number | null;       // 调试 / 截图：时钟定在这里（?t=）
  tier?: Tier | null;            // 调试 / 截图：力气定在这一档（?tier=）
  nMoons: number;                // 环上几颗小月（= 杂货铺货架上几样工具）
  onLost?: () => void;           // 3D 丢了、又建不回来
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 猜这台机器有多大力气：独显、新 Mac → 高；核显、手机 → 中；软件渲染、老核显 → 低 */
function guessTier(renderer: WebGLRenderer, phone: boolean): Tier {
  let r = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { /* 拿不到就按中档 */ }
  if (/swiftshader|llvmpipe|software|basic render|lavapipe/i.test(r)) return 'low';
  if (phone) return /mali-[gt]?[1-6]\d\b|adreno.*\b[1-5]\d\d\b|powervr/i.test(r) ? 'low' : 'mid';
  if (/nvidia|geforce|quadro|radeon|rx ?\d|apple m\d|apple gpu|arc\b/i.test(r)) return 'high';
  if (/intel/i.test(r)) return /iris|xe\b|arc/i.test(r) ? 'mid' : 'low';
  return 'mid';
}

export function createGenesis(opts: GenesisOpts) {
  const { host } = opts;
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  host.prepend(canvas);

  const phone = Math.min(screen.width, screen.height) < 600 || matchMedia('(pointer: coarse)').matches;
  const guessed = guessTier(renderer, phone);
  let tier: Tier = opts.tier ?? guessed;
  let dpr = Math.min(window.devicePixelRatio || 1, TIERS[tier].dprMax);

  const scene = new Scene();
  const camera = new PerspectiveCamera(33, 1, 1, 6000);
  camera.position.set(0, EYE, 0);

  const holeD = clusters.map((c) => new Vector4(-W / 2 + c.c0 * CELL, c.r0 * CELL, -W / 2 + (c.c1 + 1) * CELL, (c.r1 + 1) * CELL));
  const secCol = SECTION_HEX.map((h) => hexToLinear(h));

  // —— 共用的 uniform（几个材质指向同一批对象，改一处全改）——
  const U = {
    uTime: { value: 0 },
    uLight: { value: 0 },
    uLightCol: { value: new Vector3(1, 1, 1) },
    uExposure: { value: EXPOSURE },
    uPixAng: { value: 0.0007 },
    uCamPos: { value: new Vector3() },
    uMirror: { value: 0 },
    uOpen: { value: 0 },
    uDawn: { value: 0 },
    uFlood: { value: 0 },
    uDark: { value: 0 },
    uHole: { value: clusters.map(() => new Vector4()) },
    uHoleCol: { value: clusters.map(() => new Vector4()) },
    uLights: { value: [0, 1, 2, 3, 4, 5].map(() => new Vector4(0, 0, 0, 1)) },
    uLightC: { value: [0, 1, 2, 3, 4, 5].map(() => new Vector4()) },
  };
  const COMMON = G.COMMON, FRAGC = G.COMMON + G.FRAG;
  const additive = (m: ShaderMaterial) => {
    m.transparent = true;
    m.depthWrite = false;
    m.blending = CustomBlending;
    m.blendSrc = OneFactor; m.blendDst = OneFactor;
    m.blendSrcAlpha = ZeroFactor; m.blendDstAlpha = OneFactor;
    m.side = DoubleSide;
    return m;
  };

  // —— 天 + 水 ——
  const worldGeo = new BufferGeometry();
  worldGeo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const reflRT = new WebGLRenderTarget(4, 4, { type: UnsignedByteType, depthBuffer: true });
  const worldMat = new ShaderMaterial({
    uniforms: {
      ...U, uInvProj: { value: new Matrix4() }, uCamWorld: { value: new Matrix4() }, uRes: { value: new Vector2(1, 1) },
      uRefl: { value: reflRT.texture }, uReflOn: { value: 1 }, uHorizon: { value: 0 }, uReach: { value: 0 },
      uShock: { value: new Vector4() }, uShockI: { value: 0 }, uGrid: { value: 0 }, uGridR: { value: 0 },
      uGridCol: { value: new Vector3(...COL.law) }, uGap: { value: 0 }, uFloodB: { value: 0 },
    },
    vertexShader: G.WORLD_VERT,
    fragmentShader: FRAGC + G.WORLD_FRAG,
    depthTest: false, depthWrite: false,
  });
  const world = new Mesh(worldGeo, worldMat);
  world.frustumCulled = false;
  world.renderOrder = -10;
  scene.add(world);

  // —— 门 ——
  const box = new BoxGeometry(1, 1, 1);
  const instGeo = () => {
    const g = new InstancedBufferGeometry();
    g.setIndex(box.getIndex());
    g.setAttribute('position', box.getAttribute('position'));
    g.setAttribute('normal', box.getAttribute('normal'));
    return g;
  };
  const list = blocks();
  const doorGeo = instGeo();
  const aRand = new Float32Array(list.length * 4), aInfo = new Float32Array(list.length * 4);
  list.forEach((b, i) => { aRand.set(b.rand, i * 4); aInfo.set([b.cluster, b.edge, b.col, b.row], i * 4); });
  doorGeo.setAttribute('aRand', new InstancedBufferAttribute(aRand, 4));
  doorGeo.setAttribute('aInfo', new InstancedBufferAttribute(aInfo, 4));
  doorGeo.instanceCount = list.length;
  const doorMat = new ShaderMaterial({
    uniforms: {
      ...U, uOut: { value: [0, 0, 0, 0, 0] }, uOutTo: { value: clusters.map(() => new Vector3()) },
      uHoleD: { value: holeD }, uHover: { value: -1 }, uHoverAmt: { value: 0 }, uHoverCol: { value: new Vector3() },
      uSeam: { value: 0 }, uSlitI: { value: 0 },
    },
    vertexShader: COMMON + G.DOOR_VERT,
    fragmentShader: FRAGC + G.DOOR_FRAG,
  });
  const door = new Mesh(doorGeo, doorMat);
  door.frustumCulled = false;
  scene.add(door);

  // —— 造物的碎石 ——
  const r = rng(20261127);
  function chipGeo(N: number, extra?: (g: InstancedBufferGeometry) => void) {
    const g = instGeo();
    const seed = new Float32Array(N * 4), idx = new Float32Array(N);
    const perm = Array.from({ length: N }, (_, i) => i);
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < N; i++) { seed.set([r(), r(), r(), r()], i * 4); idx[i] = perm[i] / N; }
    g.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4));
    g.setAttribute('aIdx', new InstancedBufferAttribute(idx, 1));
    g.instanceCount = N;
    extra?.(g);
    return g;
  }
  function chipMat(body: string, N: number, glow: V3, hot: number, more: Record<string, { value: unknown }> = {}) {
    return new ShaderMaterial({
      uniforms: {
        ...U, uN: { value: N }, uForm: { value: 0 }, uC: { value: new Vector3() }, uScale: { value: 1 },
        uGlowCol: { value: new Vector3(...glow) }, uGlow: { value: 0 }, uHot: { value: hot }, uCDark: { value: 0 }, uEmit: { value: 0 }, ...more,
      },
      vertexShader: COMMON + G.CHIP_HEAD + body + G.CHIP_MAIN,
      fragmentShader: FRAGC + G.CHIP_FRAG,
    });
  }
  const NMAX = TIERS.high;
  const sunMat = chipMat(G.SUN_CHIP, NMAX.sun, COL.sun, 1, { uShape: { value: new Vector3(1, 1, 1) }, uSpin: { value: 0 } });
  const sunChips = new Mesh(chipGeo(NMAX.sun), sunMat);
  const ringMat = chipMat(G.RING_CHIP, NMAX.ring, COL.ring, 0, { uRot: { value: new Matrix3() }, uSpin: { value: 0 } });
  const ringChips = new Mesh(chipGeo(NMAX.ring), ringMat);
  const whaleMat = chipMat(G.WHALE_CHIP, NMAX.whale, COL.life, 0, {
    uSwim: { value: -1 }, uSettle: { value: 0 }, uWRot: { value: new Matrix3() }, uDC: { value: new Vector3(...DC) }, uWR: { value: WHALE_R },
  });
  const whale = new Mesh(chipGeo(NMAX.whale), whaleMat);
  const armMat = chipMat(G.ARM_CHIP, NMAX.arm, COL.fire, 1, {
    uBlast: { value: 0 }, uRA: { value: new Matrix3() }, uRB: { value: new Matrix3() }, uRC: { value: new Matrix3() }, uHeatA: { value: 1 },
  });
  const arm = new Mesh(chipGeo(NMAX.arm), armMat);
  // 小月：每颗 26 块（3×3×3 去掉正中那块）
  const nM = Math.max(0, Math.min(8, opts.nMoons));
  const moonCells: number[] = [];
  for (let m = 0; m < nM; m++) for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) moonCells.push(m, x, y, z);
  const moonGeo = instGeo();
  moonGeo.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(moonCells), 4));
  moonGeo.setAttribute('aIdx', new InstancedBufferAttribute(new Float32Array(moonCells.length / 4), 1));
  moonGeo.instanceCount = moonCells.length / 4;
  const moonMat = chipMat(G.MOON_CHIP, 1, COL.ring, 0, {
    uMoon: { value: Array.from({ length: 8 }, () => new Vector4()) }, uMoonHi: { value: new Array(8).fill(0) },
  });
  const moons = new Mesh(moonGeo, moonMat);
  // 太阳的芯子
  const coreMat = new ShaderMaterial({
    uniforms: { ...U, uC: sunMat.uniforms.uC, uScale: sunMat.uniforms.uScale, uShape: sunMat.uniforms.uShape, uHeat: { value: 1 }, uGlowCol: { value: new Vector3(...COL.sun) } },
    vertexShader: COMMON + G.CORE_VERT,
    fragmentShader: FRAGC + G.CORE_FRAG,
  });
  const core = new Mesh(new SphereGeometry(1, 40, 24), coreMat);
  const chipMeshes = [sunChips, ringChips, whale, arm, moons, core];
  for (const m of chipMeshes) { m.frustumCulled = false; m.visible = false; scene.add(m); }

  // —— 火舌（一千道）——
  const quad = (() => {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    return g;
  })();
  const flareGeo = new InstancedBufferGeometry();
  flareGeo.setIndex(quad.getIndex());
  flareGeo.setAttribute('position', quad.getAttribute('position'));
  {
    const N = NMAX.flares, seed = new Float32Array(N * 4), idx = new Float32Array(N);
    for (let i = 0; i < N; i++) { seed.set([r(), r(), r(), r()], i * 4); idx[i] = i / N; }
    flareGeo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4));
    flareGeo.setAttribute('aIdx', new InstancedBufferAttribute(idx, 1));
    flareGeo.instanceCount = N;
  }
  const flareMat = additive(new ShaderMaterial({
    uniforms: {
      ...U, uN: { value: NMAX.flares }, uC: sunMat.uniforms.uC, uScale: sunMat.uniforms.uScale, uSpin: sunMat.uniforms.uSpin,
      uIgnite: { value: 0 }, uFlare: { value: 0 }, uGlowCol: { value: new Vector3(...COL.sun) },
    },
    vertexShader: COMMON + G.FLARE_VERT,
    fragmentShader: FRAGC + G.FLARE_FRAG,
  }));
  const flares = new Mesh(flareGeo, flareMat);
  flares.frustumCulled = false;
  flares.visible = false;
  flares.renderOrder = 4;
  scene.add(flares);

  // —— 线：三道轨道 + 鲸的星座 ——
  const res = new Vector2(1, 1);
  function lineGeo(segs: [V3, V3, number][]) {
    const A: number[] = [], B: number[] = [], Tt: number[] = [], S: number[] = [], Uu: number[] = [], idx: number[] = [];
    segs.forEach(([a, b, u], i) => {
      for (const [t, s] of [[0, -1], [0, 1], [1, -1], [1, 1]] as const) { A.push(...a); B.push(...b); Tt.push(t); S.push(s); Uu.push(u); }
      const o = i * 4;
      idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(A, 3));
    g.setAttribute('aA', new Float32BufferAttribute(A, 3));
    g.setAttribute('aB', new Float32BufferAttribute(B, 3));
    g.setAttribute('aT', new Float32BufferAttribute(Tt, 1));
    g.setAttribute('aSide', new Float32BufferAttribute(S, 1));
    g.setAttribute('aU', new Float32BufferAttribute(Uu, 1));
    g.setIndex(idx);
    return g;
  }
  function lineMat(col: V3, width: number) {
    return additive(new ShaderMaterial({
      uniforms: { ...U, uM: { value: new Matrix4() }, uRes: { value: res }, uWidth: { value: width }, uLineCol: { value: new Vector3(...col) }, uLineI: { value: 0 }, uDraw: { value: 0 } },
      vertexShader: COMMON + G.LINE_VERT,
      fragmentShader: FRAGC + G.LINE_FRAG,
    }));
  }
  const circle: [V3, V3, number][] = [];
  const NS = 220;
  for (let i = 0; i < NS; i++) {
    const a0 = (i / NS) * Math.PI * 2, a1 = ((i + 1) / NS) * Math.PI * 2;
    circle.push([[Math.cos(a0), 0, Math.sin(a0)], [Math.cos(a1), 0, Math.sin(a1)], i / NS]);
  }
  const orbitG = lineGeo(circle);
  const orbitLines = [0, 1, 2].map(() => {
    const m = new Mesh(orbitG, lineMat(COL.law, 1));
    m.frustumCulled = false; m.visible = false; m.renderOrder = 5;
    scene.add(m);
    return m;
  });
  // 星座：鲸最后那个姿势上的十二个点（跟着色器里 spine() 停下来那一支同一个公式）
  const wRad = (u: number) => 0.088 * Math.sqrt(ss(0, 0.16, u)) * mix(1, 0.1, ss(0.36, 0.9, u));
  const sp = (u: number, up: number): V3 => {
    const L = WHALE_L;
    return [L * (0.5 - u), L * (0.035 * Math.sin(Math.PI * u) - 0.02 * u * u) + up * wRad(u) * L, 0];
  };
  const J: V3[] = [
    sp(0, 0), sp(0.1, 0.9), sp(0.2, 1), sp(0.42, 1), [sp(0.7, 1)[0], sp(0.7, 1)[1] + WHALE_L * 0.03, 0], sp(0.88, 1),
    [sp(1, 0)[0] - 6, sp(1, 0)[1] + WHALE_L * 0.07, 0], [sp(1, 0)[0] - 6, sp(1, 0)[1] - WHALE_L * 0.06, 0],
    sp(0.62, -0.9), [sp(0.4, -1)[0] - 18, sp(0.4, -1)[1] - WHALE_L * 0.11, 0], sp(0.24, -0.95), sp(0.07, -0.8),
  ];
  const JL: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [5, 7], [5, 8], [8, 10], [10, 9], [10, 11], [11, 0]];
  const constLine = new Mesh(lineGeo(JL.map(([a, b], i) => [J[a], J[b], i / JL.length])), lineMat(COL.life, 0.8));
  constLine.frustumCulled = false; constLine.visible = false; constLine.renderOrder = 5;
  scene.add(constLine);
  const jointGeo = new BufferGeometry();
  jointGeo.setAttribute('position', new Float32BufferAttribute(J.flat(), 3));
  jointGeo.setAttribute('aOrd', new Float32BufferAttribute(J.map((_, i) => i / J.length), 1));
  const jointMat = additive(new ShaderMaterial({
    uniforms: { ...U, uM: constLine.material instanceof ShaderMaterial ? (constLine.material as ShaderMaterial).uniforms.uM : { value: new Matrix4() }, uReveal: { value: 0 }, uPx: { value: 7 }, uJointCol: { value: new Vector3(...COL.life) } },
    vertexShader: COMMON + G.JOINT_VERT,
    fragmentShader: FRAGC + G.JOINT_FRAG,
  }));
  const joints = new Points(jointGeo, jointMat);
  joints.frustumCulled = false; joints.visible = false; joints.renderOrder = 6;
  scene.add(joints);

  // —— 星：先排在水上格网的交点上，再各自松开，散成一片真的星空 ——
  const starGeo = new BufferGeometry();
  {
    const N = NMAX.stars, seed = new Float32Array(N * 4);
    for (let i = 0; i < N * 4; i++) seed[i] = r();
    starGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(N * 3), 3));
    starGeo.setAttribute('aSeed', new Float32BufferAttribute(seed, 4));
  }
  const starMat = additive(new ShaderMaterial({
    uniforms: { ...U, uStarOn: { value: 0 }, uStarFree: { value: 0 }, uGridC: { value: new Vector3(0, 0, Z_FRONT - T / 2) }, uPxScale: { value: 900 }, uNarrowR: { value: 0 }, uStarCol: { value: new Vector3(...COL.law) } },
    vertexShader: COMMON + G.STAR_VERT,
    fragmentShader: FRAGC + G.STAR_FRAG,
  }));
  const stars = new Points(starGeo, starMat);
  stars.frustumCulled = false; stars.visible = false; stars.renderOrder = 3;
  scene.add(stars);

  // —— 光晕贴片 ——
  const glowGeo = new InstancedBufferGeometry();
  const pq = new PlaneGeometry(1, 1);
  glowGeo.setIndex(pq.getIndex());
  glowGeo.setAttribute('position', pq.getAttribute('position'));
  glowGeo.setAttribute('aId', new InstancedBufferAttribute(new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]), 1));
  glowGeo.instanceCount = 8;
  const gP = Array.from({ length: 8 }, () => new Vector4()), gC = Array.from({ length: 8 }, () => new Vector4()), gS = Array.from({ length: 8 }, () => new Vector2(1, 1));
  const glowMat = additive(new ShaderMaterial({
    uniforms: { ...U, uGP: { value: gP }, uGC: { value: gC }, uGS: { value: gS } },
    vertexShader: COMMON + G.GLOW_VERT,
    fragmentShader: FRAGC + G.GLOW_FRAG,
  }));
  const glows = new Mesh(glowGeo, glowMat);
  glows.frustumCulled = false; glows.renderOrder = 7;
  scene.add(glows);

  // —— 浮尘 ——
  const dustGeo = new BufferGeometry();
  {
    const N = NMAX.dust, seed = new Float32Array(N * 4);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N * 4; i++) seed[i] = rnd();
    dustGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(N * 3), 3));
    dustGeo.setAttribute('aSeed', new Float32BufferAttribute(seed, 4));
  }
  const dustMat = additive(new ShaderMaterial({
    uniforms: { ...U, uBox: { value: new Vector3(34, 20, 150) }, uPxScale: { value: 800 } },
    vertexShader: COMMON + G.DUST_VERT,
    fragmentShader: FRAGC + G.DUST_FRAG,
  }));
  dustMat.blending = AdditiveBlending;
  const dust = new Points(dustGeo, dustMat);
  dust.frustumCulled = false; dust.renderOrder = 8;
  scene.add(dust);

  // —— 档位 ——
  function applyTier() {
    const t = TIERS[tier];
    (sunChips.geometry as InstancedBufferGeometry).instanceCount = t.sun;
    (ringChips.geometry as InstancedBufferGeometry).instanceCount = t.ring;
    (whale.geometry as InstancedBufferGeometry).instanceCount = t.whale;
    (arm.geometry as InstancedBufferGeometry).instanceCount = t.arm;
    flareGeo.instanceCount = t.flares;
    starGeo.setDrawRange(0, t.stars);
    dustGeo.setDrawRange(0, t.dust);
    dpr = Math.min(window.devicePixelRatio || 1, t.dprMax);
  }
  applyTier();

  // —— 版面 ——
  let size = { w: 1, h: 1 };
  let tanHero = 0.3, tanAct = 0.3, aspect = 1, narrow = 0;
  function readMonof() {
    const v = parseFloat(getComputedStyle(host).getPropertyValue('--monof'));
    return v > 0 ? v : 0.38;
  }
  function layout(force = false) {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    // iPhone 地址栏收放只改几十像素高：不重建画布（只在宽变了、或者高变了 120 像素以上时重排）
    if (!force && w === size.w && Math.abs(h - size.h) < 120) return;
    size = { w, h };
    aspect = w / h;
    narrow = clamp((1 - aspect) / (1 - 0.46));
    const monof = readMonof();
    tanHero = H / (2 * DIST * monof);
    // 竖着的手机：各幕把视角放宽一点，环、轨道别太出屏
    tanAct = Math.max(tanHero, (175 / (900 * aspect)) * 0.86);
    camera.aspect = aspect;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    worldMat.uniforms.uRes.value.set(bw, bh);
    res.set(bw, bh);
    const s = TIERS[tier].refl;
    reflRT.setSize(Math.max(2, Math.round(bw * s)), Math.max(2, Math.round(bh * s)));
    starMat.uniforms.uNarrowR.value = narrow;
  }
  const ro = new ResizeObserver(() => layout());
  ro.observe(host);
  window.addEventListener('orientationchange', () => setTimeout(() => layout(true), 250));
  layout(true);

  // —— 进度：开场（时间）+ 滚动（平滑）+ 顿帧 ——
  let target = 1;
  let ps = 1;
  let opener = opts.reduced || opts.freezeP != null ? 1 : 0;
  let openT0 = -1;
  let ff: { from: number; t0: number } | null = null;
  let hitUntil = 0;
  let clock = opts.freezeT ?? 3;
  let P = opts.freezeP ?? (opts.reduced ? 1 : 0);
  let st: State = computeState(P, clock, { narrow, aspect, tanV: tanHero }, nM);
  let breathT0 = -1;
  function setTarget(p: number) { target = clamp(p, 1, 7); if (opener < 1 && target > 1.02) fastForward(); }
  function fastForward() { if (ff || opener >= 1) return; ff = { from: opener, t0: performance.now() }; }
  function snapReduced(p: number) {
    const k = Math.round(p);
    return k <= 1 ? 1 : k >= 7 ? 7 : k - 0.06;
  }

  // —— 视差、进去 ——
  const par = new Vector2(), parGoal = new Vector2();
  function setParallax(x: number, y: number) { parGoal.set(clamp(x, -1, 1), clamp(y, -1, 1)); }
  let dive: { to: Vector3; t0: number; ms: number; hold: number; resolve: () => void; onProgress?: (s: number) => void } | null = null;
  function enter(to: V3, ms: number, onProgress?: (s: number) => void, hold = 1) {
    return new Promise<void>((resolve) => {
      if (opts.reduced) { resolve(); return; }
      dive = { to: new Vector3(...to), t0: performance.now(), ms, hold, resolve, onProgress };
    });
  }
  function reset() { dive = null; U.uExposure.value = EXPOSURE; }

  // —— 首屏：指着门上哪撮 ——
  let hover = -1, hoverAmt = 0, hoverShown = -1;
  function setHover(k: number) { hover = k; if (k >= 0) hoverShown = k; }
  const ray = new Raycaster();
  const ndc = new Vector2();
  const hit = new Vector3();
  const bx = new Box3();
  function pick(clientX: number, clientY: number) {
    if (P > 1.15) return -1;
    const rc = canvas.getBoundingClientRect();
    ndc.set(((clientX - rc.left) / rc.width) * 2 - 1, -((clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    let best = -1;
    for (let k = 0; k < clusters.length; k++) {
      const d = holeD[k];
      bx.min.set(d.x - CELL * 0.35, d.y - CELL * 0.35, Z_FRONT - T);
      bx.max.set(d.z + CELL * 0.35, d.w + CELL * 0.35, Z_FRONT + 1);
      if (ray.ray.intersectBox(bx, hit)) best = k;
    }
    return best;
  }
  const tmp = new Vector3();
  function project(p: V3) {
    tmp.set(p[0], p[1], p[2]).project(camera);
    return { x: ((tmp.x + 1) / 2) * size.w, y: ((1 - tmp.y) / 2) * size.h, front: tmp.z < 1 };
  }
  function clusterPoint(k: number): V3 {
    const d = holeD[k];
    return [(d.x + d.z) / 2, (d.y + d.w) / 2, Z_FRONT];
  }

  // —— 把一帧的状态放进 uniform ——
  const m4 = new Matrix4(), m4b = new Matrix4(), qq = new Quaternion(), v3 = new Vector3(), v3b = new Vector3();
  const setM3 = (m: Matrix3, q: Q) => m.fromArray(qMat(q));
  function trs(out: Matrix4, c: V3, q: Q, s: number) {
    qq.set(q[0], q[1], q[2], q[3]);
    return out.compose(v3.set(c[0], c[1], c[2]), qq, v3b.set(s, s, s));
  }
  // 门上那撮的窗跟着门扇转，再投回门面那个平面（天上那层光按它画窗里的颜色）
  function holeOnPlane(k: number, out: Vector4) {
    const d = holeD[k];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const e = camera.position;
    for (const [x, y] of [[d.x, d.y], [d.z, d.y], [d.x, d.w], [d.z, d.w]]) {
      const side = x < 0 ? -1 : 1;
      const a = -side * U.uOpen.value;
      const hx = side * W / 2;
      const rx = hx + Math.cos(a) * (x - hx), rz = Z_FRONT - Math.sin(a) * (x - hx);
      const t = (Z_FRONT - e.z) / (rz - e.z);
      const qx = e.x + (rx - e.x) * t, qy = e.y + (y - e.y) * t;
      x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
    }
    out.set(x0, y0, x1, y1);
  }

  function apply(s: State, now: number) {
    const brk = breathT0 >= 0 && !opts.reduced ? 1 + 0.028 * Math.sin(((now - breathT0) / 7000) * Math.PI * 2) : 1;
    U.uLight.value = s.light * brk;
    U.uLightCol.value.set(...s.lightCol);
    U.uOpen.value = s.open;
    U.uDawn.value = s.dawn;
    U.uFlood.value = s.flood;
    U.uDark.value = s.dark;
    for (let i = 0; i < 6; i++) {
      const L = s.lights[i];
      U.uLights.value[i].set(L.p[0], L.p[1], L.p[2], Math.max(1, L.r));
      U.uLightC.value[i].set(L.c[0], L.c[1], L.c[2], L.path);
    }
    for (let k = 0; k < 5; k++) {
      holeOnPlane(k, U.uHole.value[k]);
      const c = secCol[k];
      const w = s.holeWhite;
      U.uHoleCol.value[k].set(mix(c[0], 1, w), mix(c[1], 1, w), mix(c[2], 1, w), s.hole[k]);
      doorMat.uniforms.uOut.value[k] = s.out[k];
    }
    const outTo = doorMat.uniforms.uOutTo.value as Vector3[];
    outTo[0].set(...s.sun.c);
    outTo[1].set(DC[0], 90, DC[2] + RING_R * 0.9);
    outTo[2].set(0, 150, Z_FRONT + 60);
    outTo[3].set(...s.arm.point);
    outTo[4].set(0, 60, Z_FRONT + 90);
    doorMat.uniforms.uSeam.value = s.slit;
    doorMat.uniforms.uSlitI.value = s.slitGlow * (s.a[1] < 1 ? 1 : 0.5);
    hoverAmt += ((hover >= 0 && P < 1.15 ? 1 : 0) - hoverAmt) * 0.12;
    doorMat.uniforms.uHover.value = hoverShown;
    doorMat.uniforms.uHoverAmt.value = hoverAmt;
    if (hoverShown >= 0) doorMat.uniforms.uHoverCol.value.set(...secCol[hoverShown]);

    const wu = worldMat.uniforms;
    wu.uHorizon.value = s.horizon;
    wu.uReach.value = s.reach;
    wu.uShock.value.set(s.shock.c[0], s.shock.c[1], s.shock.c[2], s.shock.r);
    wu.uShockI.value = s.shock.i;
    wu.uGrid.value = s.grid;
    wu.uGridR.value = s.gridR;
    wu.uGap.value = (W / 2) * (1 - Math.cos(s.open)) + 0.3;
    wu.uFloodB.value = s.floodB;

    // 日
    const sv = s.sun.vis > 0.001;
    sunChips.visible = core.visible = sv;
    flares.visible = sv && s.sun.ignite > 0.001 && s.sun.flare > 0.01;
    if (sv) {
      sunMat.uniforms.uForm.value = s.sun.form;
      sunMat.uniforms.uC.value.set(...s.sun.c);
      sunMat.uniforms.uScale.value = s.sun.scale;
      sunMat.uniforms.uShape.value.set(...s.sun.shape);
      sunMat.uniforms.uSpin.value = s.sun.spin;
      sunMat.uniforms.uGlow.value = 0.6;
      coreMat.uniforms.uHeat.value = s.sun.heat * s.sun.vis * ss(0.0, 0.25, s.sun.form);
      flareMat.uniforms.uIgnite.value = s.sun.ignite;
      flareMat.uniforms.uFlare.value = s.sun.flare;
    }
    // 环
    ringChips.visible = moons.visible = s.ring.vis > 0.001;
    if (ringChips.visible) {
      ringMat.uniforms.uForm.value = s.ring.form;
      ringMat.uniforms.uC.value.set(...s.ring.c);
      ringMat.uniforms.uScale.value = s.ring.scale;
      setM3(ringMat.uniforms.uRot.value, s.ring.rot);
      ringMat.uniforms.uSpin.value = s.ring.spin;
      ringMat.uniforms.uGlow.value = 0.55 * s.ring.glow;
      ringMat.uniforms.uEmit.value = 0.5 * s.ring.glow;
      moonMat.uniforms.uGlow.value = 0.9 * s.ring.glow;
      moonMat.uniforms.uEmit.value = 0.35 * s.ring.glow;
      const mv = moonMat.uniforms.uMoon.value as Vector4[];
      const mh = moonMat.uniforms.uMoonHi.value as number[];
      s.moons.forEach((m, i) => { mv[i].set(m.p[0], m.p[1], m.p[2], m.s); mh[i] = m.hi * 1.4; });
    }
    // 鲸
    whale.visible = s.whale.vis > 0.001;
    const wl = s.whale.lines > 0.001 || s.whale.stars > 0.001;
    constLine.visible = joints.visible = whale.visible && wl;
    if (whale.visible) {
      const wu2 = whaleMat.uniforms;
      wu2.uSwim.value = s.whale.swim;
      wu2.uSettle.value = s.whale.settle;
      wu2.uC.value.set(...s.whale.c);
      wu2.uScale.value = s.whale.scale;
      setM3(wu2.uWRot.value, s.whale.rot);
      wu2.uGlow.value = 0.75 * s.whale.glow;
      wu2.uCDark.value = s.whale.dark;
      const lm = (constLine.material as ShaderMaterial).uniforms;
      trs(lm.uM.value, s.whale.c, s.whale.rot, s.whale.scale);
      lm.uDraw.value = s.whale.lines;
      lm.uLineI.value = 0.9;
      lm.uWidth.value = 0.75 * dpr;
      jointMat.uniforms.uReveal.value = s.whale.stars;
      jointMat.uniforms.uPx.value = 9 * dpr * clamp(Math.sqrt(s.whale.scale), 0.5, 1.2);
    }
    // 器
    arm.visible = s.arm.vis > 0.001;
    if (arm.visible) {
      const au = armMat.uniforms;
      au.uForm.value = s.arm.form;
      au.uBlast.value = s.arm.blast;
      au.uC.value.set(...s.arm.c);
      au.uScale.value = s.arm.scale;
      au.uHeatA.value = s.arm.heat;
      au.uGlow.value = 0.35;
      setM3(au.uRA.value, s.arm.rots[0]);
      setM3(au.uRB.value, s.arm.rots[1]);
      setM3(au.uRC.value, s.arm.rots[2]);
    }
    // 轨道
    s.orbits.forEach((o, i) => {
      const L = orbitLines[i];
      L.visible = o.draw > 0.001 && o.I > 0.001;
      if (!L.visible) return;
      const u = (L.material as ShaderMaterial).uniforms;
      trs(u.uM.value, o.c, o.q, o.R);
      u.uDraw.value = o.draw;
      u.uLineI.value = o.I * 1.1;
      u.uWidth.value = 0.85 * dpr;
    });
    // 星
    stars.visible = s.starOn > 0.001;
    starMat.uniforms.uStarOn.value = s.starOn;
    starMat.uniforms.uStarFree.value = s.starFree;
    starMat.uniforms.uPxScale.value = (size.h * dpr) / (2 * tanAct);

    // 光晕贴片：0 门缝，1 日冕，2 红点 / 炸开，3 正对着的那颗小月，4 刚开的那扇窗
    const seamTop = H * clamp(s.slit);
    gP[0].set(0, seamTop / 2, Z_FRONT + 2, seamTop / 2 + 10);
    gS[0].set(40 / Math.max(seamTop / 2 + 10, 1), 1);
    const lc = s.lightCol;
    const si = s.slitGlow * 1.6 + s.light * 0.35 * ss(0.02, 0.2, s.open);
    gC[0].set(mix(lc[0], 1, 0.6) * si, mix(lc[1], 1, 0.6) * si, mix(lc[2], 1, 0.6) * si, 1);
    gP[1].set(...s.sun.c, sv ? 46 * s.sun.scale * 2.3 : 0);
    gS[1].set(1, 1);
    const hs = 1.6 * s.sun.heat * s.sun.vis * (1 - s.dark);
    gC[1].set(COL.sun[0] * hs, COL.sun[1] * hs, COL.sun[2] * hs, 2);
    const pi = s.arm.pointI + s.arm.flash * 4;
    gP[2].set(...(s.arm.blast > 0 ? s.arm.c : s.arm.point), pi > 0.002 ? 14 + 22 * s.arm.pointI + 230 * s.arm.flash : 0);
    gS[2].set(1, 1);
    gC[2].set(mix(COL.fire[0], 1, 0.35) * pi, mix(COL.fire[1], 1, 0.35) * pi, mix(COL.fire[2], 1, 0.35) * pi, 0);
    let best = -1, bh = 0;
    s.moons.forEach((m, i) => { if (m.hi > bh) { bh = m.hi; best = i; } });
    if (best >= 0 && bh > 0.01) {
      const m = s.moons[best];
      gP[3].set(...m.p, 30 * m.s);
      gC[3].set(COL.ring[0] * bh * 1.2, COL.ring[1] * bh * 1.2, COL.ring[2] * bh * 1.2, 0);
    } else gP[3].w = 0;
    let lastHole = -1;
    for (let k = 0; k < 5; k++) if (s.hole[k] > 0.01) lastHole = k;
    if (lastHole >= 0 && s.P < lastHole + 2.2) {
      const hd = U.uHole.value[lastHole];
      const hk = s.hole[lastHole] * (1 - ss(lastHole + 1.6, lastHole + 2.2, s.P)) * 0.9;
      const c = secCol[lastHole];
      gP[4].set((hd.x + hd.z) / 2, (hd.y + hd.w) / 2, Z_FRONT + 1.5, 46);
      gC[4].set(c[0] * hk, c[1] * hk, c[2] * hk, 0);
    } else gP[4].w = 0;
  }

  // —— 帧 ——
  let running = true;
  let last = -1;
  let frames = 0;
  let onFrame: ((s: State, P: number) => void) | null = null;
  const perf = { n: 0, sum: 0, drops: 0, t0: 0 };
  const adaptive = opts.tier == null && !navigator.webdriver && !/[?&]hq\b/.test(location.search);
  const boxMats: ShaderMaterial[] = [doorMat, sunMat, ringMat, whaleMat, armMat, moonMat, coreMat];
  const mainOnly: Object3D[] = [world, flares, dust];

  function frame(now: number) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (openT0 < 0) { openT0 = now; if (opts.seen) ff = { from: 0, t0: now }; perf.t0 = now; }
    const dt = last < 0 ? 1 / 60 : clamp((now - last) / 1000, 0, 0.5);
    last = now;

    // 开场（自己放）
    if (opener < 1) {
      let o = clamp((now - openT0) / OPENER_MS);
      if (ff) o = Math.max(o, ff.from + (1 - ff.from) * ss(0, 1, (now - ff.t0) / FF_MS));
      opener = o;
      if (opener >= 1 && breathT0 < 0) breathT0 = now;
    } else if (breathT0 < 0) breathT0 = now;
    // 滚动：平滑地追；第五幕炸开前那一拍，真实时间里停一下
    let rate = 1;
    if (opts.freezeP != null) P = opts.freezeP;
    else if (opts.reduced) P = snapReduced(target);
    else if (opener < 1) P = opener;
    else {
      if (now < hitUntil) { rate = 0; }
      else {
        const prev = ps;
        ps += (target - ps) * (1 - Math.exp(-dt / SMOOTH_S));
        if (Math.abs(target - ps) < 1e-4) ps = target;
        if (prev < 4.45 && ps >= 4.45 && target > 4.45) { ps = 4.4501; hitUntil = now + HITSTOP_MS; rate = 0; onHitstop?.(); }
      }
      P = ps;
    }
    if (P > 4.45 && P < 4.5) rate = 0;
    if (opts.freezeT != null) clock = opts.freezeT;
    else if (!opts.reduced) clock += dt * rate;

    const view = { narrow, aspect, tanV: mix(tanHero, tanAct, ss(1, 1.3, P)) };
    st = computeState(P, clock, view, nM);
    U.uTime.value = clock;

    // 镜头
    if (!opts.reduced) par.lerp(parGoal, 1 - Math.exp(-dt * 1.6));
    const t = clock;
    const driftX = opts.reduced ? 0 : 0.32 * Math.sin(t * 0.031) + 0.12 * Math.sin(t * 0.077);
    const driftY = opts.reduced ? 0 : 0.05 * Math.sin(t * 0.047);
    const shake = st.shake * Math.sin(now * 0.09) * 1.4;
    const tanV = view.tanV;
    const shift = 2 * st.hzf - 1;
    camera.position.set(driftX + par.x * 0.9, st.camY + driftY + par.y * 0.22 + shake, Z_FRONT + st.camD);
    camera.rotation.set(0, 0, 0);
    let fov = (2 * Math.atan(tanV) * 180) / Math.PI;
    let sh = shift;
    if (dive) {
      const k = Math.min(clamp((now - dive.t0) / dive.ms), dive.hold);
      const e = k * k * k;
      const from = camera.position.clone();
      camera.position.lerpVectors(from, dive.to, ss(0, 1, e) * 0.985);
      const aim = ss(0.02, 0.5, k);
      camera.lookAt(mix(camera.position.x, dive.to.x, aim), mix(camera.position.y, dive.to.y, aim), Math.min(dive.to.z, camera.position.z - 1));
      fov *= mix(1, 1.4, e);
      sh = mix(shift, 0, ss(0.2, 0.9, k));
      U.uExposure.value = EXPOSURE * (1 + 3 * e * e);
      dive.onProgress?.(k);
      if (k >= 1) { const rs = dive.resolve; dive = null; rs(); }
    }
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = -sh;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
    U.uCamPos.value.copy(camera.position);
    U.uPixAng.value = (2 * Math.tan((fov * Math.PI) / 360)) / (size.h * dpr);
    worldMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    worldMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    dustMat.uniforms.uPxScale.value = (size.h * dpr) / (2 * tanV);

    apply(st, now);

    // 倒影：门和造物沿水面翻过来再画一遍（低档只画门）
    const tierCfg = TIERS[tier];
    const saved = mainOnly.map((o) => o.visible);
    const savedChips = chipMeshes.map((o) => o.visible);
    const lineVis = [...orbitLines, constLine].map((o) => o.visible);
    mainOnly.forEach((o) => (o.visible = false));
    if (!tierCfg.creationRefl) { chipMeshes.forEach((o) => (o.visible = false)); [...orbitLines, constLine].forEach((o) => (o.visible = false)); }
    for (const m of boxMats) m.side = BackSide;
    U.uMirror.value = 1;
    renderer.setRenderTarget(reflRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1);
    U.uMirror.value = 0;
    for (const m of boxMats) m.side = FrontSide;
    mainOnly.forEach((o, i) => (o.visible = saved[i]));
    chipMeshes.forEach((o, i) => (o.visible = savedChips[i]));
    [...orbitLines, constLine].forEach((o, i) => (o.visible = lineVis[i]));
    renderer.render(scene, camera);
    frames++;
    onFrame?.(st, P);

    // 卡了就降：先降分辨率，再降一档；目标电脑 60 帧、手机 30 帧以上
    if (adaptive && now - perf.t0 > 1800) {
      perf.n++; perf.sum += dt;
      if (perf.n >= 90) {
        const avg = perf.sum / perf.n;
        perf.n = 0; perf.sum = 0;
        const budget = phone ? 1 / 30 : 1 / 45;
        if (avg > budget && perf.drops < 4) {
          perf.drops++;
          if (dpr > 1.05) dpr = Math.max(1, dpr * 0.8);
          else if (tier !== 'low') { tier = tier === 'high' ? 'mid' : 'low'; applyTier(); dpr = Math.min(dpr, TIERS[tier].dprMax); }
          layout(true);
        }
      }
    }
  }
  let onHitstop: (() => void) | null = null;
  requestAnimationFrame(frame);

  function setPaused(p: boolean) {
    if (p) running = false;
    else if (!running) { running = true; last = -1; requestAnimationFrame(frame); }
  }
  document.addEventListener('visibilitychange', () => setPaused(document.hidden));
  // 切到后台再回来、3D 丢了：等浏览器还回来就接着画；还不回来就换静态图
  let lostTimer = 0;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    lostTimer = window.setTimeout(() => opts.onLost?.(), 3000);
  });
  canvas.addEventListener('webglcontextrestored', () => { clearTimeout(lostTimer); layout(true); setPaused(false); });

  return {
    canvas,
    renderer,
    setTarget,
    fastForward,
    setParallax,
    setHover,
    pick,
    project,
    clusterPoint,
    enter,
    reset,
    layout: () => layout(true),
    get P() { return P; },
    get state() { return st; },
    get opener() { return opener; },
    set onFrame(f: ((s: State, P: number) => void) | null) { onFrame = f; },
    set onHitstop(f: (() => void) | null) { onHitstop = f; },
    get frames() { return frames; },
    get dpr() { return dpr; },
    get tier() { return tier; },
    get size() { return size; },
  };
}

export type Genesis = ReturnType<typeof createGenesis>;
export { cl };
