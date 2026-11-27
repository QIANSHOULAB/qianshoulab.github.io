// 造物之门的画面：黑水尽头一道门，门里是光。往下滑，门里一样一样往外生东西。
// 这个文件只管画：每帧拿到进度 P，把门、光、天、水、每样造物摆好，先画一遍倒影，再画正片。
// 字、刻度、声音、滚动在 ../home/genesis-page.ts。three.js 跟这个文件一起异步加载，不挡首屏。
import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, LinearSRGBColorSpace, Mesh, PerspectiveCamera, PlaneGeometry,
  Scene, ShaderMaterial, Vector3, Vector4, WebGLRenderer, WebGLRenderTarget, RGBAFormat, UnsignedByteType, LinearFilter,
  type Points,
} from 'three';
import { ACT_HEX, BREATH_MS, EYE, GATE, SECTION_HEX, SRC_BACK, TIERS, hexToLinear, type Tier } from './config';
import { camDist, clamp, doorDeg, horizonAt, lerp, seg, sstep, tanHalfAt } from './timeline';
import { COMMON, FRAG } from './glsl/common';
import { WORLD_VERT, WORLD_FRAG } from './glsl/world';
import { GATE_PLACE } from './glsl/stone';
import { GLOW_VERT, GLOW_FRAG } from './glsl/fx';
import { SPOT_RECTS, gateBlocks } from './layout';
import { additive, blockMesh, sharedUniforms, stoneMaterial, stoneUniforms, type Creation, type Frame, type Lamp } from './kit';
import { buildSun } from './creations/sun';
import { buildRing } from './creations/ring';
import { buildWhale } from './creations/whale';

export interface GenesisOpts {
  stage: HTMLElement;          // 画布铺满它
  reduced: boolean;            // prefers-reduced-motion：钟不走，每幕直接摆到位
  tier: Tier;                  // 先按设备猜的档
  fixedTier?: boolean;         // 不自动升降档（截图用）
}

const norm = (c: [number, number, number]) => { const m = Math.max(...c); return c.map((v) => v / m) as [number, number, number]; };
const ACT_COLS = ACT_HEX.map((h) => norm(hexToLinear(h)));
const SEC_COLS = SECTION_HEX.map((h) => norm(hexToLinear(h)));
const WHITE: [number, number, number] = [1, 1, 1];
const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** 这一刻门后的光是什么颜色：每幕开头从上一幕的颜色换成这一幕的；第七幕五色合回白 */
export function actColor(P: number): [number, number, number] {
  if (P <= 1) return WHITE;
  if (P >= 6) return mix3(ACT_COLS[5], WHITE, sstep(6.5, 6.86, P));
  const k = Math.floor(P);              // P 在第 k+1 幕
  const u = P - k;
  return mix3(ACT_COLS[k - 1], ACT_COLS[k], sstep(0.02, 0.16, u));
}

export function createGenesis(opts: GenesisOpts) {
  const { stage } = opts;
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = LinearSRGBColorSpace;       // 着色器自己转 sRGB
  renderer.setClearColor(0x000000, 1);
  stage.prepend(canvas);

  let tier: Tier = opts.tier;
  const camera = new PerspectiveCamera(33, 1, 1, 6000);
  const scene = new Scene();

  // —— 共用的 uniform ——
  const U = sharedUniforms();
  const S = stoneUniforms();
  const px = { uPxScale: { value: 800 }, uView: { value: [1, 1] } };
  const shared = { ...U, ...px };

  // —— 天 + 水 ——
  const worldGeo = new BufferGeometry();
  worldGeo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const W = {
    uInvProj: { value: camera.projectionMatrixInverse },
    uCamWorld: { value: camera.matrixWorld },
    uRefl: { value: null as unknown },
    uReflOn: { value: 0 },
    uRes: { value: [1, 1] },
    uLens: { value: [0.3, 1.6] },
    uRipple: { value: 1 },
    uCorona: { value: 0 },
    uReach: { value: 0 },
    uPath: { value: 0 },
    uLightPos: { value: [0, 1, 2, 3, 4, 5].map(() => new Vector4()) },
    uLightCol: { value: [0, 1, 2, 3, 4, 5].map(() => new Vector3(1, 1, 1)) },
    uGrid: { value: 0 },
    uGridCol: { value: new Vector3(...ACT_COLS[5]) },
    uShock: { value: new Vector4() },
    uSrcBack: { value: SRC_BACK },
    uOrb: { value: [0, 1, 2, 3].map(() => new Vector4()) },
    uOrbCol: { value: [0, 1, 2, 3].map(() => new Vector3(1, 1, 1)) },
    uOrbI: { value: [0, 0, 0, 0] },
  };
  const worldMat = new ShaderMaterial({
    uniforms: { ...U, ...S, ...W },
    vertexShader: WORLD_VERT,
    fragmentShader: COMMON + FRAG + WORLD_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const world = new Mesh(worldGeo, worldMat);
  world.frustumCulled = false;
  world.renderOrder = -10;
  scene.add(world);

  // —— 门：两扇，各 6 × 27 块 ——
  const gb = gateBlocks();
  const G = {
    uDoor: { value: 0 },
    uOut: { value: [0, 0, 0, 0, 0] },
    uHov: { value: [0, 0, 0, 0, 0] },
    uSecCol: { value: SEC_COLS.map((c) => new Vector3(...c)) },
    uSeamBase: { value: 1 },
  };
  const gateMat = stoneMaterial(shared, S, GATE_PLACE, G);
  const gate = blockMesh(gateMat, { aCell: { data: gb.cell, size: 4 }, aRand: { data: gb.rand, size: 4 } }, gb.count);
  scene.add(gate);

  // —— 门缝、窗里漏出来的光（贴在门正面前面一点点） ——
  const GL = {
    uSlit: { value: 0 },
    uSlitGrow: { value: 0 },
    uGap: { value: 0 },
    uHovGlow: { value: [0, 0, 0, 0, 0] },
    uSecCol: G.uSecCol,
  };
  const glowMat = new ShaderMaterial({
    uniforms: { ...U, ...S, ...GL },
    vertexShader: COMMON + GLOW_VERT,
    fragmentShader: COMMON + FRAG + GLOW_FRAG,
    ...additive,
    side: DoubleSide,
  });
  const glow = new Mesh(new PlaneGeometry(1, 1), glowMat);
  glow.scale.set(GATE.W + 150, GATE.H + 120, 1);
  glow.position.set(0, GATE.H / 2 + 20, GATE.Z + 0.6);
  glow.renderOrder = 4;
  glow.frustumCulled = false;
  scene.add(glow);

  // —— 造物 ——
  const ringC = buildRing(shared, S);
  const whaleC = buildWhale(shared, S);
  const creations: Creation[] = [buildSun(shared, S), ringC, whaleC];
  for (const c of creations) for (const o of c.objects) scene.add(o);

  // —— 倒影：门和造物沿水面翻过来画在一张贴图上，水面按行错位地取 ——
  const rt = new WebGLRenderTarget(4, 4, { format: RGBAFormat, type: UnsignedByteType, depthBuffer: true, minFilter: LinearFilter, magFilter: LinearFilter });
  W.uRefl.value = rt.texture;

  // —— 版面：镜头、移轴 ——
  let size = { w: 1, h: 1 };
  let dpr = 1;
  let aspect = 1;
  let portrait = false;
  function maxDpr() { return Math.min(window.devicePixelRatio || 1, TIERS[tier].maxDpr) * TIERS[tier].res; }
  function layout() {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    size = { w, h };
    aspect = w / h;
    portrait = aspect < 1;
    dpr = maxDpr();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    W.uRes.value = [bw, bh];
    px.uView.value = [bw, bh];
    const rs = tier === 'high' ? 0.5 : 0.4;
    rt.setSize(Math.max(2, Math.round(bw * rs)), Math.max(2, Math.round(bh * rs)));
    U.uPortrait.value = portrait ? 1 : 0;
  }
  let lastHz = 0.4, lastTan = 0.3;
  function applyCamera(P: number) {
    const hz = horizonAt(P, portrait);
    const tanHalf = tanHalfAt(P, aspect, hz);
    lastHz = hz; lastTan = tanHalf;
    const d = camDist(P);
    camera.position.set(0, EYE, GATE.Z + d);
    camera.rotation.set(0, 0, 0);
    camera.fov = (2 * Math.atan(tanHalf) * 180) / Math.PI;
    camera.aspect = aspect;
    camera.near = Math.max(0.5, Math.min(4, d * 0.01));
    camera.far = 9000;
    camera.updateProjectionMatrix();
    // 移轴：镜头保持水平，用投影矩阵把地平线压到离底边 hz 的地方，竖线不歪
    camera.projectionMatrix.elements[9] = 1 - 2 * hz;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
    U.uPixAng.value = (2 * tanHalf) / (size.h * dpr);
    W.uLens.value = [tanHalf, aspect];
    px.uPxScale.value = (size.h * dpr) / (2 * tanHalf);
    U.uCamPos.value.copy(camera.position);
  }

  // —— 档位 ——
  function setTier(t: Tier) {
    tier = t;
    for (const c of creations) c.setTier?.(t);
    layout();
  }
  setTier(tier);

  // —— 每帧：按 P 把东西摆好 ——
  const tmpV = new Vector3();
  const frameInfo: Frame = { P: 0, time: 0, real: 0, dt: 0, portrait: false, aspect: 1, tier, cam: camera.position, reduced: opts.reduced, water: [], orbs: [], keys: [] };
  let hover = [0, 0, 0, 0, 0], hoverGoal = [0, 0, 0, 0, 0];
  let worldTime = 0, lastReal = -1;

  function windowRects(door: number) {
    // 门开了一个角度：窗跟着门扇往里转。把窗那块（门扇正面上）的四个角，顺着视线投回门正面那个平面
    const out: [number, number, number, number][] = [];
    const cam = camera.position;
    for (const [x0, y0, x1, y1] of SPOT_RECTS) {
      let mnx = Infinity, mxx = -Infinity;
      for (const x of [x0, x1]) {
        const left = (x0 + x1) / 2 < 0;
        const hx = left ? -GATE.W / 2 : GATE.W / 2;
        const ph = left ? door : -door;
        const lx = x - hx;
        const wx = hx + lx * Math.cos(ph), wz = GATE.Z - lx * Math.sin(ph);
        // 从镜头看过去，投到 z = 门正面
        const t = (GATE.Z - cam.z) / (wz - cam.z);
        const px2 = cam.x + (wx - cam.x) * t;
        mnx = Math.min(mnx, px2); mxx = Math.max(mxx, px2);
      }
      out.push([mnx, y0, mxx, y1]);
    }
    return out;
  }

  function frame(P: number, nowMs: number) {
    const dt = lastReal < 0 ? 1 / 60 : clamp((nowMs - lastReal) / 1000, 0, 0.25);
    lastReal = nowMs;
    // 世界的钟：第五幕滑到一半那一拍（顿帧），万物停一拍
    const hit = Math.abs(P - 4.5) < 0.018 ? 0 : 1;
    if (!opts.reduced) worldTime += dt * hit;
    const time = worldTime;

    applyCamera(P);
    const f = frameInfo;
    f.P = P; f.time = time; f.real = nowMs; f.dt = dt; f.portrait = portrait; f.aspect = aspect; f.tier = tier;
    f.water.length = 0; f.orbs.length = 0; f.keys.length = 0;
    U.uTime.value = opts.reduced ? 0 : time % 3600;
    U.uP.value = P;

    // —— Ⅰ 启光：全黑 → 一条发丝细的竖光从下往上亮 → 门推开一线，光涌出来，地平线从门脚往两边划开 ——
    let light = P >= 1 ? 1 : Math.pow(sstep(0.2, 0.8, P), 1.25);
    if (P >= 1 && !opts.reduced) light *= 1 + 0.026 * Math.sin((nowMs / BREATH_MS) * Math.PI * 2);
    const door = (doorDeg(P) * Math.PI) / 180;
    G.uDoor.value = door;
    const gap = GATE.W * (1 - Math.cos(door));
    GL.uGap.value = gap;
    GL.uSlit.value = sstep(0.18, 0.3, P) * (1 - sstep(6.7, 6.9, P)) * (0.85 + 0.15 * light);
    GL.uSlitGrow.value = sstep(0.2, 0.4, P);
    const opened = sstep(0.38, 0.72, P);
    U.uLight.value = light * Math.max(opened, 0.0);
    S.uHalo.value = opened * (1 + 1.2 * sstep(6.6, 6.92, P));
    W.uCorona.value = sstep(0.42, 0.7, P) * (1 - 0.6 * sstep(6.7, 6.95, P));
    W.uReach.value = sstep(0.48, 0.82, P);
    W.uPath.value = sstep(0.5, 0.86, P);
    const col = actColor(P);
    U.uActCol.value.set(col[0], col[1], col[2]);
    U.uExposure.value = 0.72;

    // —— 门上的五撮：哪一幕开始，哪一撮松动、离开，留下一个透光的缺口（缺口里是那一幕的颜色） ——
    const rects = windowRects(door);
    for (let k = 0; k < 5; k++) {
      const uk = P - (k + 1);                 // 第 k+2 幕的幕内进度
      G.uOut.value[k] = seg(uk, 0.03, 0.42);
      const open = sstep(0.06, 0.3, uk);
      const current = 1 - sstep(1.05, 1.25, uk);
      const merge = 1 - sstep(6.5, 6.86, P);  // 第七幕：五种颜色从缺口里收回来，合成白光
      const law = sstep(5.3, 5.5, P) * (1 - current);   // 第六幕：造好的一起亮
      S.uWinOn.value[k] = open * lerp(0.5, 1, Math.max(current, law)) * merge;
      S.uWinRect.value[k].set(...rects[k]);
      S.uWinCol.value[k].set(...SEC_COLS[k]);
      hover[k] += (hoverGoal[k] - hover[k]) * (1 - Math.exp(-dt * 7));
      G.uHov.value[k] = hover[k] * (1 - sstep(1.0, 1.2, P));
      GL.uHovGlow.value[k] = G.uHov.value[k];
    }

    // —— 造物 ——
    for (const c of creations) c.update(f);

    // 门后那盏主光也照水：门缝正中那条光路
    const gateLamp: Lamp = { pos: tmpV.set(0, GATE.H * 0.42, GATE.Z - GATE.T - 10), col: col, i: 1.6 * U.uLight.value * W.uPath.value };
    const water = [gateLamp, ...f.water].sort((a, b) => b.i - a.i).slice(0, 6);
    for (let i = 0; i < 6; i++) {
      const l = water[i];
      if (l) { W.uLightPos.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.i); W.uLightCol.value[i].set(...l.col); }
      else W.uLightPos.value[i].w = 0;
    }
    const orbs = f.orbs.sort((a, b) => b.i - a.i).slice(0, 4);
    for (let i = 0; i < 4; i++) {
      const o = orbs[i];
      if (o) { W.uOrb.value[i].set(o.pos.x, o.pos.y, o.pos.z, o.r ?? 40); W.uOrbCol.value[i].set(...o.col); W.uOrbI.value[i] = o.i; }
      else W.uOrbI.value[i] = 0;
    }
    const key = f.keys.sort((a, b) => b.i - a.i)[0];
    if (key) { S.uKey.value.set(key.pos.x, key.pos.y, key.pos.z, key.i); S.uKeyCol.value.set(...key.col); }
    else S.uKey.value.w = 0;

    // —— 先画倒影，再画正片 ——
    const reflOn = U.uLight.value > 0.002 || GL.uSlit.value > 0.01;
    if (reflOn) {
      U.uMirror.value = -1;
      world.visible = false;
      const showCreations = TIERS[tier].reflect;
      const hidden: (Mesh | Points)[] = [];
      if (!showCreations) for (const c of creations) for (const o of c.objects) if (o.visible) { o.visible = false; hidden.push(o); }
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.setClearColor(0x000000, 1);
      for (const o of hidden) o.visible = true;
      world.visible = true;
      U.uMirror.value = 1;
    }
    W.uReflOn.value = reflOn ? 1 : 0;
    renderer.render(scene, camera);
    perfTick(dt);
  }

  // —— 帧数：开头两秒量一下，不够就降一档；连续有余量再升 ——
  const perf = { t: 0, n: 0, sum: 0, frames: 0, ups: 0, downs: 0, warm: 0, good: 0 };
  let onTier: ((t: Tier) => void) | null = null;
  const phone = Math.min(screen.width, screen.height) < 600 || matchMedia('(pointer: coarse)').matches;
  const budget = 1 / (phone ? 30 : 60);
  function perfTick(dt: number) {
    perf.frames++;
    if (opts.fixedTier || document.hidden) return;
    perf.warm += dt;
    if (perf.warm < 0.6) return;            // 头一下编着色器，不算
    perf.n++; perf.sum += dt; perf.t += dt;
    if (perf.t < 2) return;
    const avg = perf.sum / perf.n;
    perf.n = 0; perf.sum = 0; perf.t = 0;
    const order: Tier[] = ['low', 'mid', 'high'];
    const i = order.indexOf(tier);
    if (avg > budget * 1.25 && i > 0) { perf.good = 0; perf.downs++; setTier(order[i - 1]); onTier?.(tier); }
    else if (avg < budget * 0.62 && i < 2 && perf.downs === 0) {
      perf.good++;
      if (perf.good >= 3) { perf.good = 0; perf.ups++; setTier(order[i + 1]); onTier?.(tier); }
    } else perf.good = 0;
  }

  /** 小月的名字、标本签：跟着画面里那样东西走（画布上的像素 + 现在该不该看得见） */
  function tags() {
    const moons = ringC.moons().map((m) => {
      const q = project(m.pos);
      return { x: q.x + 14, y: q.y, o: q.front ? m.o : 0 };
    });
    const wl = whaleC.label();
    const q = project(wl.pos);
    const spec = { x: q.x, y: q.y, o: q.front ? wl.o : 0 };
    return { moons, spec };
  }

  /** 世界坐标 → 画布上的像素（小月的名字、标本签跟着它走） */
  function project(v: Vector3) {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * size.w, y: ((1 - p.y) / 2) * size.h, front: p.z < 1 };
  }

  const ro = new ResizeObserver(() => {
    const w = stage.clientWidth, h = stage.clientHeight;
    // 手机地址栏收放（高度变一点点）不重建；转屏、高度变超过 120 像素才重设
    if (w === size.w && Math.abs(h - size.h) < 120) return;
    layout();
  });
  ro.observe(stage);
  layout();

  return {
    canvas,
    renderer,
    frame,
    layout,
    project,
    tags,
    setTier,
    get tier() { return tier; },
    set onTier(f: ((t: Tier) => void) | null) { onTier = f; },
    setHover(k: number) { hoverGoal = hoverGoal.map((_, i) => (i === k ? 1 : 0)); },
    get frames() { return perf.frames; },
    get dpr() { return dpr; },
    get horizon() { return lastHz; },
    get tanHalf() { return lastTan; },
    dispose() { ro.disconnect(); renderer.dispose(); rt.dispose(); },
  };
}

export type Genesis = ReturnType<typeof createGenesis>;
