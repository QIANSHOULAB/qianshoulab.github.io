// 黑碑场景：一望无际的黑水，地平线正中一块 1:4:9 的碑，几百块黑石砌成；光从碑后面慢慢升起来。
// 这个文件只管画面：首页的字、铭文、引线、声音在 ../home/home.ts。three.js 跟这个文件一起异步加载，不挡首屏。
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh,
  Matrix4, Mesh, PerspectiveCamera, PlaneGeometry, Points, Raycaster, Scene, ShaderMaterial, Vector2, Vector3,
  WebGLRenderer, Box3, LinearSRGBColorSpace, Vector4,
} from 'three';
import { COMMON, FRAG, WORLD_VERT, WORLD_FRAG, MONO_VERT, MONO_FRAG, GLOW_VERT, GLOW_FRAG, DUST_VERT, DUST_FRAG } from './glsl';
import { H, W, T, DIST, Z_FRONT, CELL, clusters, blocks } from './layout';

export interface SceneOpts {
  stage: HTMLElement;        // 画布铺满它；--hzf（地平线离底多高）、--monof（碑占屏高多少）从它的 CSS 读
  reduced: boolean;          // prefers-reduced-motion：直接给天亮以后的样子，镜头不飘
  seen: boolean;             // 这次会话看过黎明了：1.5 秒快进到天亮
  freeze?: number | null;    // 调试：黎明定在某一刻（0..1）
  fixedQuality?: boolean;    // 不自动降分辨率（截图用）
}

export interface FrameInfo { p: number; light: number; done: boolean }

const EYE = 1.7;              // 眼睛离水面多高
const DAWN_MS = 10000;        // 黎明 10 秒
const FF_MS = 1500;           // 快进 1.5 秒
const BREATH_MS = 7000;       // 天亮以后的呼吸：7 秒一口
const ENTER_MS = 2100;        // 进门：贴着水面冲过去

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function createScene(opts: SceneOpts) {
  const { stage } = opts;
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  canvas.setAttribute('aria-hidden', 'true');

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = LinearSRGBColorSpace;     // 着色器自己转 sRGB
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = true;
  stage.prepend(canvas);

  const phone = Math.min(screen.width, screen.height) < 600 || matchMedia('(pointer: coarse)').matches;
  const maxDpr = phone ? 2 : 2;
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);

  const scene = new Scene();
  const camera = new PerspectiveCamera(33, 1, 1, 4000);
  camera.position.set(0, EYE, 0);

  // —— 共用的 uniform（几个材质指向同一批对象，改一处全改）——
  const U = {
    uTime: { value: 0 },
    uLight: { value: 0 },
    uDawn: { value: 0 },
    uCenterY: { value: -30 },
    uMono: { value: new Vector4(W / 2, H, Z_FRONT, T) },
    uExposure: { value: 0.62 },
    uHole: { value: new Vector4() },
    uHoleOpen: { value: 0 },
    uClMin: { value: new Vector3() },
    uClMax: { value: new Vector3() },
    uPixAng: { value: 0.0007 },
    uGlowScale: { value: 1 },
    uCamPos: { value: new Vector3() },
  };

  // —— 天 + 水：一个盖满屏的三角形 ——
  const worldGeo = new BufferGeometry();
  worldGeo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const worldMat = new ShaderMaterial({
    uniforms: { ...U, uInvProj: { value: new Matrix4() }, uCamWorld: { value: new Matrix4() }, uSunEl: { value: 0.004 }, uRipple: { value: 1 } },
    vertexShader: WORLD_VERT,
    fragmentShader: COMMON + FRAG + WORLD_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const world = new Mesh(worldGeo, worldMat);
  world.frustumCulled = false;
  world.renderOrder = -10;
  scene.add(world);

  // —— 碑：12 × 27 块方砖 ——
  const list = blocks();
  const boxGeo = new BoxGeometry(1, 1, 1);
  const monoMat = new ShaderMaterial({
    uniforms: { ...U, uActive: { value: -1 }, uAct: { value: 0 }, uPrev: { value: -1 }, uPrevAct: { value: 0 } },
    vertexShader: COMMON + MONO_VERT,
    fragmentShader: COMMON + FRAG + MONO_FRAG,
  });
  const mono = new InstancedMesh(boxGeo, monoMat, list.length);
  mono.frustumCulled = false;
  const aRand = new Float32Array(list.length * 4);
  const aInfo = new Float32Array(list.length * 4);
  const base: Vector3[] = [];
  const m4 = new Matrix4();
  const tmp = new Vector3();
  // 砖与砖之间不留真缝（远看会漏出碑后的光、一闪一闪），略微叠一点；缝里的光由着色器画
  const one = new Vector3(CELL * 1.004, CELL * 1.004, T);
  list.forEach((b, i) => {
    aRand.set(b.rand, i * 4);
    aInfo.set([b.cluster, b.edge, b.col, b.row], i * 4);
    const p = new Vector3(b.x, b.y, Z_FRONT - T / 2);
    base.push(p);
    m4.makeScale(one.x, one.y, one.z).setPosition(p);
    mono.setMatrixAt(i, m4);
  });
  boxGeo.setAttribute('aRand', new InstancedBufferAttribute(aRand, 4));
  boxGeo.setAttribute('aInfo', new InstancedBufferAttribute(aInfo, 4));
  mono.instanceMatrix.needsUpdate = true;
  scene.add(mono);
  const members = clusters.map((c) => list.map((b, i) => (b.cluster === c.id ? i : -1)).filter((i) => i >= 0));

  // —— 出碑那撮背后涌出来的光 ——
  const glowMat = new ShaderMaterial({
    uniforms: { ...U, uGlowHalf: { value: new Vector2(1, 1) } },
    vertexShader: GLOW_VERT,
    fragmentShader: COMMON + FRAG + GLOW_FRAG,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const glow = new Mesh(new PlaneGeometry(1, 1), glowMat);
  glow.renderOrder = 2;
  glow.visible = false;
  scene.add(glow);

  // —— 浮尘 ——
  const DUST = phone ? 380 : 700;
  const seeds = new Float32Array(DUST * 4);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(DUST * 3), 3));
  dustGeo.setAttribute('aSeed', new Float32BufferAttribute(seeds, 4));
  const dustMat = new ShaderMaterial({
    uniforms: { ...U, uBox: { value: new Vector3(34, 20, 150) }, uPxScale: { value: 800 } },
    vertexShader: COMMON + DUST_VERT,
    fragmentShader: COMMON + FRAG + DUST_FRAG,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const dust = new Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  dust.renderOrder = 3;
  scene.add(dust);

  // —— 镜头、版面 ——
  let size = { w: 1, h: 1 };
  let shift = -0.2;          // 地平线在屏幕上的位置（NDC）：镜头保持水平，用移轴把地平线压低，竖线不歪
  let fovBase = 33;
  function readVars() {
    const cs = getComputedStyle(stage);
    const hzf = parseFloat(cs.getPropertyValue('--hzf')) || 0.4;
    const monof = parseFloat(cs.getPropertyValue('--monof')) || 0.38;
    return { hzf, monof };
  }
  function applyProjection(fov: number, sh: number) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = -sh;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  function layout() {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    size = { w, h };
    const { hzf, monof } = readVars();
    shift = 2 * hzf - 1;
    const tanHalf = H / (2 * DIST * monof);
    fovBase = (2 * Math.atan(tanHalf) * 180) / Math.PI;
    camera.aspect = w / h;
    applyProjection(fovBase, shift);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    U.uPixAng.value = (2 * tanHalf) / (h * dpr);
    // 碑面那个平面上能看到多宽：电脑上约 ±470，手机竖着只有 ±180；窄了光晕就收一点
    const halfW = DIST * tanHalf * (w / h);
    U.uGlowScale.value = clamp(halfW / 470, 0.58, 1);
    dustMat.uniforms.uPxScale.value = (h * dpr) / (2 * tanHalf);
  }
  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);
  layout();

  // —— 黎明 ——
  let clock0 = -1;
  let ff: { from: number; t0: number } | null = null;
  let doneAt = -1;
  let pNow = 0;
  function dawnP(now: number) {
    if (opts.reduced) return 1;
    if (opts.freeze != null) return opts.freeze;
    let p = clamp((now - clock0) / DAWN_MS);
    if (ff) {
      const k = clamp((now - ff.t0) / FF_MS);
      p = Math.max(p, ff.from + (1 - ff.from) * easeInOutCubic(k));
    }
    return p;
  }
  function fastForward() {
    if (ff || pNow >= 1 || opts.reduced) return;
    ff = { from: pNow, t0: performance.now() };
  }

  // —— 五撮：弹簧（沉，带一点点阻尼回弹），1–1.5 秒到位 ——
  const amt = clusters.map(() => 0), vel = clusters.map(() => 0), goal = clusters.map(() => 0);
  let active = -1;
  function activate(k: number) {
    active = k;
    goal.forEach((_, i) => (goal[i] = i === k ? 1 : 0));
    if (opts.reduced) goal.forEach((g, i) => { amt[i] = g; vel[i] = 0; });
  }
  const PULL = 0.62 * 3 * CELL, FWD = 1.5 * T, SPREAD = 0.09;
  const off = new Vector3();
  function offsetOf(k: number, a: number, bi: number, out: Vector3) {
    const c = clusters[k];
    const b = list[bi];
    return out.set(
      c.dir[0] * PULL * a + (b.x - c.center[0]) * SPREAD * Math.min(a, 1.4),
      c.dir[1] * PULL * a + (b.y - c.center[1]) * SPREAD * Math.min(a, 1.4),
      FWD * a,
    );
  }
  function clusterBox(k: number, a: number, out: Box3) {
    const c = clusters[k];
    const hw = (c.c1 - c.c0 + 1) * CELL / 2, hh = (c.r1 - c.r0 + 1) * CELL / 2;
    const ex = 1 + SPREAD * Math.min(a, 1.4);
    out.min.set(c.center[0] + c.dir[0] * PULL * a - hw * ex, c.center[1] + c.dir[1] * PULL * a - hh * ex, Z_FRONT - T + FWD * a);
    out.max.set(c.center[0] + c.dir[0] * PULL * a + hw * ex, c.center[1] + c.dir[1] * PULL * a + hh * ex, Z_FRONT + FWD * a);
    return out;
  }
  const dirty = clusters.map(() => true);
  function stepClusters(dt: number) {
    const w0 = 5.4, z = 0.88;
    for (let k = 0; k < amt.length; k++) {
      if (opts.reduced) { if (amt[k] !== goal[k]) { amt[k] = goal[k]; dirty[k] = true; } continue; }
      const x = amt[k], v = vel[k];
      if (Math.abs(x - goal[k]) < 1e-4 && Math.abs(v) < 1e-4) { if (x !== goal[k]) { amt[k] = goal[k]; dirty[k] = true; } continue; }
      const a = -w0 * w0 * (x - goal[k]) - 2 * z * w0 * v;
      vel[k] = v + a * dt;
      amt[k] = x + vel[k] * dt;
      dirty[k] = true;
    }
    for (let k = 0; k < amt.length; k++) {
      if (!dirty[k]) continue;
      dirty[k] = false;
      for (const bi of members[k]) {
        offsetOf(k, amt[k], bi, off);
        tmp.copy(base[bi]).add(off);
        m4.makeScale(one.x, one.y, one.z).setPosition(tmp);
        mono.setMatrixAt(bi, m4);
      }
      mono.instanceMatrix.needsUpdate = true;
    }
    // 着色器只认两撮：开得最大的那撮（洞、光、轮廓）和正在回去的那撮（缝还亮着）
    let a1 = -1, a2 = -1;
    for (let k = 0; k < amt.length; k++) {
      if (a1 < 0 || amt[k] > amt[a1]) { a2 = a1; a1 = k; } else if (a2 < 0 || amt[k] > amt[a2]) a2 = k;
    }
    monoMat.uniforms.uActive.value = a1;
    monoMat.uniforms.uAct.value = clamp(amt[a1]);
    monoMat.uniforms.uPrev.value = a2;
    monoMat.uniforms.uPrevAct.value = clamp(amt[a2]);
    const c = clusters[a1];
    const hw = (c.c1 - c.c0 + 1) * CELL / 2, hh = (c.r1 - c.r0 + 1) * CELL / 2;
    U.uHole.value.set(c.center[0] - hw, c.center[1] - hh, c.center[0] + hw, c.center[1] + hh);
    U.uHoleOpen.value = clamp(amt[a1] * 1.7);
    const bx = clusterBox(a1, amt[a1], box);
    U.uClMin.value.copy(bx.min);
    U.uClMax.value.copy(bx.max);
    glow.visible = amt[a1] > 0.01;
    glow.position.set(c.center[0], c.center[1], Z_FRONT + 0.35);
    glow.scale.set(hw * 2 + 64, hh * 2 + 64, 1);
  }
  const box = new Box3();

  // —— 镜头：几乎不动，极慢地飘；鼠标 / 手指拖一下有一点视差 ——
  const par = new Vector2(), parGoal = new Vector2();
  function setParallax(x: number, y: number) { parGoal.set(clamp(x, -1, 1), clamp(y, -1, 1)); }

  // —— 进门 ——
  let entering: { k: number; t0: number; resolve: () => void; onProgress?: (s: number) => void } | null = null;
  function enter(k: number, onProgress?: (s: number) => void) {
    return new Promise<void>((resolve) => {
      activate(k);
      if (opts.reduced) { resolve(); return; }
      entering = { k, t0: performance.now(), resolve, onProgress };
    });
  }
  function reset() {
    entering = null;
    activate(-1);
    for (let k = 0; k < amt.length; k++) { amt[k] = 0; vel[k] = 0; dirty[k] = true; }
    U.uExposure.value = 0.62;
    layout();
  }

  // —— 指哪撮 ——
  const ray = new Raycaster();
  const ndc = new Vector2();
  const hit = new Vector3();
  function pick(clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    let best = -1, bestD = Infinity;
    for (let k = 0; k < clusters.length; k++) {
      clusterBox(k, amt[k], box);
      box.expandByScalar(CELL * 0.35);
      if (ray.ray.intersectBox(box, hit)) {
        const d = hit.distanceTo(camera.position);
        if (d < bestD) { bestD = d; best = k; }
      }
    }
    return best;
  }
  function screenOf(k: number) {
    const c = clusters[k];
    tmp.set(c.center[0] + c.dir[0] * PULL * amt[k], c.center[1] + c.dir[1] * PULL * amt[k], Z_FRONT + FWD * amt[k]).project(camera);
    return { x: ((tmp.x + 1) / 2) * size.w, y: ((1 - tmp.y) / 2) * size.h };
  }

  // —— 帧 ——
  let running = true;
  let last = -1;
  let onFrame: ((f: FrameInfo) => void) | null = null;
  const perf = { n: 0, sum: 0, drops: 0, frames: 0, t0: 0 };
  const adaptive = !opts.fixedQuality;
  const look = new Vector3();
  const startPos = new Vector3(0, EYE, 0);

  function frame(now: number) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (clock0 < 0) { clock0 = now; if (opts.seen) ff = { from: 0, t0: now }; perf.t0 = now; }
    const dt = last < 0 ? 1 / 60 : clamp((now - last) / 1000, 0, 1 / 15);
    last = now;
    const tSec = now / 1000;

    // 黎明
    const p = dawnP(now);
    pNow = p;
    if (p >= 1 && doneAt < 0) doneAt = now;
    const dawn = sstep(0, 1, p);
    let light = 0.012 + 0.988 * Math.pow(sstep(0.03, 1, p), 1.45);
    if (doneAt >= 0 && !opts.reduced) light *= 1 + 0.028 * Math.sin(((now - doneAt) / BREATH_MS) * Math.PI * 2);
    U.uTime.value = opts.reduced ? 0 : tSec % 3600;
    U.uLight.value = light;
    U.uDawn.value = dawn;
    U.uCenterY.value = lerp(-34, 0.3 * H, dawn);
    worldMat.uniforms.uSunEl.value = clamp((U.uCenterY.value - EYE) / DIST, 0.0025, 0.07);

    stepClusters(dt);

    // 镜头
    if (!opts.reduced) {
      const k = 1 - Math.exp(-dt * 1.6);
      par.lerp(parGoal, k);
    }
    const driftX = opts.reduced ? 0 : 0.32 * Math.sin(tSec * 0.031) + 0.12 * Math.sin(tSec * 0.077);
    const driftY = opts.reduced ? 0 : 0.05 * Math.sin(tSec * 0.047);
    startPos.set(driftX + par.x * 0.9, EYE + driftY + par.y * 0.22, 0);
    if (entering) {
      const s = clamp((now - entering.t0) / ENTER_MS);
      const e = s * s * s;
      const c = clusters[entering.k];
      goal[entering.k] = 1 + 1.3 * sstep(0.05, 0.7, s);    // 那撮继续往外让开，给镜头腾路
      const hx = c.center[0], hy = c.center[1];
      camera.position.set(
        lerp(startPos.x, hx, sstep(0.0, 1, e)),
        lerp(startPos.y, hy, sstep(0.25, 1, e)),
        lerp(0, Z_FRONT + 2.5, e),
      );
      // 一直看着碑面上那道口子（看的点在碑面上，离得远，镜头不会一下子仰起来）
      const aim = sstep(0.05, 0.6, s);
      look.set(lerp(camera.position.x, hx, aim), lerp(camera.position.y, hy, aim), Z_FRONT);
      camera.lookAt(look);
      applyProjection(lerp(fovBase, fovBase * 1.35, e), lerp(shift, 0, sstep(0.3, 0.95, s)));
      U.uExposure.value = 0.62 * (1 + 2.6 * e * e);
      entering.onProgress?.(s);
      if (s >= 1) { const r = entering.resolve; entering = null; r(); }
    } else {
      camera.position.copy(startPos);
      camera.rotation.set(0, 0, 0);
    }
    camera.updateMatrixWorld();
    U.uCamPos.value.copy(camera.position);
    worldMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    worldMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);

    renderer.render(scene, camera);
    onFrame?.({ p, light, done: p >= 1 });

    // 卡就降一点分辨率（最多降三次），手机上中档机也要稳在 30 帧以上
    perf.frames++;
    if (adaptive && now - perf.t0 > 1500) {
      perf.n++; perf.sum += dt;
      if (perf.n >= 90) {
        const avg = perf.sum / perf.n;
        perf.n = 0; perf.sum = 0;
        if (avg > 1 / 42 && perf.drops < 3 && dpr > 1) {
          perf.drops++;
          dpr = Math.max(1, dpr * 0.8);
          layout();
        }
      }
    }
  }
  requestAnimationFrame(frame);

  function setPaused(p: boolean) {
    if (p) { running = false; }
    else if (!running) { running = true; last = -1; requestAnimationFrame(frame); }
  }
  document.addEventListener('visibilitychange', () => setPaused(document.hidden));

  return {
    canvas,
    renderer,
    activate,
    enter,
    reset,
    pick,
    screenOf,
    fastForward,
    setParallax,
    layout,
    get p() { return pNow; },
    set onFrame(f: ((f: FrameInfo) => void) | null) { onFrame = f; },
    get frames() { return perf.frames; },
    get dpr() { return dpr; },
  };
}

export type ZeroScene = ReturnType<typeof createScene>;
