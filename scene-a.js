// 方案一「千手法相」：千手千眼的光环。九百六十只手从禅圈里伸出来，手心各睁一只眼，隔一会儿眨一下。
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.body.classList.add('no-gl');
}

if (renderer) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x04050d, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04050d, 0.028);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);

  function glowTexture(stops) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([o, col]) => grd.addColorStop(o, col));
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  const halo = new THREE.Group();
  scene.add(halo);

  // 禅圈：缺一口的光环，套在「千手院」三个字外面
  const enso = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.09, 16, 240, Math.PI * 2 * 0.9),
    new THREE.MeshBasicMaterial({ color: 0xffc06a })
  );
  enso.rotation.z = Math.PI * 0.3;
  halo.add(enso);
  const ensoInner = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.025, 8, 240, Math.PI * 2 * 0.86),
    new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.7 })
  );
  ensoInner.rotation.z = Math.PI * 0.32;
  halo.add(ensoInner);
  const bloom = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture([[0, 'rgba(255,180,90,0.55)'], [0.35, 'rgba(255,120,40,0.22)'], [1, 'rgba(255,90,20,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  bloom.scale.set(11, 11, 1);
  halo.add(bloom);

  // 千手：五圈，一圈比一圈长、一圈比一圈靠后；单数圈顺转，双数圈逆转
  const LAYERS = [
    { n: 120, r0: 2.75, r1: 4.3, z: 0.0, tip: 0xffd28a },
    { n: 160, r0: 2.95, r1: 5.3, z: -0.6, tip: 0x9fe8ff },
    { n: 200, r0: 3.15, r1: 6.3, z: -1.2, tip: 0xffb35c },
    { n: 220, r0: 3.35, r1: 7.4, z: -1.9, tip: 0x7fd6ff },
    { n: 260, r0: 3.55, r1: 8.7, z: -2.7, tip: 0xffc77a },
  ];
  const eyeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPixel: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float aPhase; attribute float aSize; attribute vec3 aColor;
      uniform float uTime; uniform float uPixel;
      varying float vOpen; varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixel * (16.0 / -mv.z);
        float t = fract(uTime * 0.11 + aPhase);
        float shut = smoothstep(0.0, 0.015, t) * (1.0 - smoothstep(0.025, 0.045, t));
        vOpen = 1.0 - shut;
        vColor = aColor;
      }`,
    fragmentShader: `
      varying float vOpen; varying vec3 vColor;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float lid = 0.5 * (1.0 - p.x * p.x) * max(vOpen, 0.05);
        float d = abs(p.y) - lid;
        float inside = (1.0 - smoothstep(-0.05, 0.03, d)) * step(abs(p.x), 1.0);
        float rim = (1.0 - smoothstep(0.0, 0.07, abs(d))) * step(abs(p.x), 0.98);
        float r = length(p);
        float iris = 1.0 - smoothstep(0.26, 0.32, r);
        float pupil = 1.0 - smoothstep(0.1, 0.15, r);
        vec3 col = mix(vec3(1.0, 0.93, 0.82) * 0.8, vColor, iris);
        col = mix(col, vec3(0.06, 0.03, 0.01), pupil);
        float glow = exp(-r * r * 2.6) * 0.45;
        vec3 c = col * inside + vColor * rim * 1.3 + vColor * glow;
        float a = max(max(inside, rim), glow);
        if (a < 0.02) discard;
        gl_FragColor = vec4(c, a);
      }`,
  });

  const layers = [], spins = [];
  function addLayer(L, li, spin) {
    const g = new THREE.Group();
    const pos = [], col = [], eyes = [], phases = [], sizes = [], tipCols = [];
    const tip = new THREE.Color(L.tip), mid = new THREE.Color(0x8a4c16), dark = new THREE.Color(0x000000);
    for (let i = 0; i < L.n; i++) {
      const a = (i + Math.random() * 0.4) / L.n * Math.PI * 2;
      const len = L.r1 * (0.86 + Math.random() * 0.24);
      const bend = (li % 2 ? -1 : 1) * (0.05 + Math.random() * 0.05);
      const m = (L.r0 + len) / 2;
      const p0 = [L.r0 * Math.cos(a), L.r0 * Math.sin(a), L.z];
      const p1 = [m * Math.cos(a + bend), m * Math.sin(a + bend), L.z + 0.2];
      const p2 = [len * Math.cos(a + bend * 0.6), len * Math.sin(a + bend * 0.6), L.z + 0.35];
      pos.push(...p0, ...p1, ...p1, ...p2);
      col.push(dark.r, dark.g, dark.b, mid.r, mid.g, mid.b, mid.r, mid.g, mid.b, tip.r * 0.9, tip.g * 0.9, tip.b * 0.9);
      eyes.push(...p2);
      phases.push(Math.random());
      sizes.push(6.5 + li * 1.3 + Math.random() * 3);
      tipCols.push(tip.r, tip.g, tip.b);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })));
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(eyes, 3));
    eg.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    eg.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    eg.setAttribute('aColor', new THREE.Float32BufferAttribute(tipCols, 3));
    g.add(new THREE.Points(eg, eyeMat));
    halo.add(g);
    layers.push(g);
    spins.push(spin);
    return g;
  }
  LAYERS.forEach((L, li) => addLayer(L, li, 0.018 + 0.01 * li));
  // 横着的屏幕（电脑）再伸两圈长手，铺到屏幕左右两边；手机竖着用不上，藏起来
  const WIDE = [
    { n: 420, r0: 3.75, r1: 9.0, z: -3.6, tip: 0x9fe8ff },
    { n: 520, r0: 3.95, r1: 12.0, z: -4.6, tip: 0xffd28a },
  ];
  const wide = WIDE.map((L, i) => addLayer(L, LAYERS.length + i, 0.03 - 0.006 * i));

  // 满天星
  {
    const n = 1600, p = [];
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 60);
      p.push(v.x, v.y, v.z - 20);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xcfd8ff, size: 0.18, sizeAttenuation: true, transparent: true, opacity: 0.8, fog: false,
    })));
  }

  // 香火：往上飘的火星
  const EMBERS = 240;
  const emberPos = new Float32Array(EMBERS * 3), emberVel = new Float32Array(EMBERS);
  for (let i = 0; i < EMBERS; i++) {
    emberPos[i * 3] = (Math.random() - 0.5) * 20;
    emberPos[i * 3 + 1] = (Math.random() - 0.5) * 18;
    emberPos[i * 3 + 2] = -6 + Math.random() * 10;
    emberVel[i] = 0.25 + Math.random() * 0.6;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  scene.add(new THREE.Points(emberGeo, new THREE.PointsMaterial({
    map: glowTexture([[0, 'rgba(255,210,140,1)'], [0.4, 'rgba(255,140,50,0.5)'], [1, 'rgba(255,90,20,0)']]),
    size: 0.32, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // 镜头离多远：禅圈在屏幕上占多大由页面里的 qsRing() 定（「千手院」三个字也照它定大小，所以永远站在圈里）
  const TAN = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let baseZ = 14;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const f = window.qsRing ? window.qsRing() : (camera.aspect < 0.8 ? 0.2819 : 0.35);
    baseZ = camera.aspect < 0.8 ? 17.5 : 2.3 / (f * TAN);
    // 离镜头那么远、半径 r 的一圈，在屏幕上半径几像素
    const px = (r, z) => r * (h / 2) / ((baseZ - z) * TAN);
    if (camera.aspect < 0.8) {
      wide.forEach((g) => { g.visible = false; });      // 手机竖着：照旧
    } else {
      // 两圈长手：外圈手尖伸出屏幕左右边一点，里圈落在里头那团手和屏幕边中间
      const edge = 1.06 * w / 2, inner = px(8.7, -2.7);
      [(inner + edge) / 2, edge].forEach((target, i) => {
        const k = Math.max(1, target / px(WIDE[i].r1, WIDE[i].z));
        wide[i].scale.set(k, k, 1);
        wide[i].visible = true;
      });
    }
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  if (document.fonts) document.fonts.ready.then(resize);   // 字体到了「赛博禅宗」那块高度会变一点

  let tx = 0, ty = 0, rx = 0, ry = 0;
  window.addEventListener('pointermove', (e) => {
    tx = (e.clientY / window.innerHeight - 0.5) * 0.5;
    ty = (e.clientX / window.innerWidth - 0.5) * 0.7;
  }, { passive: true });

  const clock = new THREE.Clock();
  const speed = still ? 0.25 : 1;
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime * speed;
    rx += (tx - rx) * 0.05;
    ry += (ty - ry) * 0.05;
    halo.rotation.x = rx + Math.sin(t * 0.2) * 0.06;
    halo.rotation.y = ry + Math.cos(t * 0.17) * 0.05;
    layers.forEach((g, i) => { g.rotation.z = t * (i % 2 ? -1 : 1) * spins[i]; });
    enso.rotation.z = Math.PI * 0.3 + Math.sin(t * 0.35) * 0.06;
    bloom.material.opacity = 0.85 + Math.sin(t * 1.3) * 0.15;
    eyeMat.uniforms.uTime.value = t;
    for (let i = 0; i < EMBERS; i++) {
      emberPos[i * 3 + 1] += emberVel[i] * dt * speed;
      emberPos[i * 3] += Math.sin(t + i) * 0.003;
      if (emberPos[i * 3 + 1] > 9) emberPos[i * 3 + 1] = -9;
    }
    emberGeo.attributes.position.needsUpdate = true;
    const s = Math.min(window.scrollY / window.innerHeight, 2);
    camera.position.set(0, -s * 1.4, baseZ + s * 5);
    camera.lookAt(0, -s * 0.8, 0);
    renderer.render(scene, camera);
  }
  frame();
}
