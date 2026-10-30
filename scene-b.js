// 方案二「赛博山门」：霓虹牌坊 + 五层宝塔，地上一张往脚下流的光网，天边一轮切成条的夕阳。往下滑，镜头穿过山门。
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) { /* 没有 WebGL：留着 CSS 渐变天空 */ }

if (renderer) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1a0533, 40, 150);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

  const PINK = 0xff2e88, CYAN = 0x00f0ff, VIOLET = 0xb26bff;

  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // 天边的切条夕阳
  const sunTex = canvasTexture(512, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#FFF27A'); grd.addColorStop(0.45, '#FF9A4D'); grd.addColorStop(1, '#FF2E88');
    g.fillStyle = grd;
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const y = h * (0.52 + i * 0.055), th = 3 + i * 2.4;
      g.fillRect(0, y, w, th);
    }
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(56, 56),
    new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false }));
  sun.position.set(0, 13, -150);
  scene.add(sun);

  // 往脚下流的光网
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(PINK) }, uB: { value: new THREE.Color(VIOLET) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uA; uniform vec3 uB; varying vec3 vW;
      float gridLine(float x) { float d = abs(fract(x - 0.5) - 0.5) / fwidth(x); return 1.0 - min(d / 1.3, 1.0); }
      void main(){
        vec2 p = vW.xz / 3.0; p.y += uTime * 0.9;
        float g = max(gridLine(p.x), gridLine(p.y));
        float dist = length(vW.xz - cameraPosition.xz);
        float fade = 1.0 - smoothstep(25.0, 150.0, dist);
        vec3 col = mix(uA, uB, smoothstep(-120.0, 10.0, vW.z));
        gl_FragColor = vec4(col * g * fade * 1.4 + vec3(0.035, 0.0, 0.07), 1.0);
      }`,
  }));
  grid.rotation.x = -Math.PI / 2;
  scene.add(grid);

  // 霓虹线框：亮线 + 一层淡一点、略大的「光晕」+ 深紫半透明的面挡住后面
  const faceMat = new THREE.MeshBasicMaterial({ color: 0x12032a, transparent: true, opacity: 0.82, side: THREE.DoubleSide });
  function neon(geo, color, parent, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
    const holder = new THREE.Group();
    holder.position.set(x, y, z); holder.rotation.y = ry; holder.scale.set(sx, sy, sz);
    holder.add(new THREE.Mesh(geo, faceMat));
    const edges = new THREE.EdgesGeometry(geo, 12);
    holder.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color })));
    const halo = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(1.025);
    holder.add(halo);
    parent.add(holder);
    return holder;
  }
  function roof(R, H) {          // 四角起翘的屋顶：凹面四棱锥（车床旋转 4 段）
    const pts = [
      new THREE.Vector2(0.0, H), new THREE.Vector2(R * 0.22, H * 0.74), new THREE.Vector2(R * 0.5, H * 0.42),
      new THREE.Vector2(R * 0.78, H * 0.16), new THREE.Vector2(R * 1.0, 0.0), new THREE.Vector2(R * 1.14, H * 0.16),
    ];
    return new THREE.LatheGeometry(pts, 4, Math.PI / 4);
  }

  // 五层宝塔
  const pagoda = new THREE.Group();
  pagoda.position.set(0, 0, -48);
  scene.add(pagoda);
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const w = 6.2 - i * 0.95, h = i === 0 ? 2.6 : 1.7;
    neon(new THREE.BoxGeometry(w, h, w), CYAN, pagoda, 0, y + h / 2, 0);
    y += h;
    neon(roof(w * 0.86, 1.25), PINK, pagoda, 0, y - 0.15, 0);
    y += 0.55;
  }
  neon(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), CYAN, pagoda, 0, y + 1.5, 0);
  for (let k = 0; k < 6; k++) neon(new THREE.TorusGeometry(0.42 - k * 0.05, 0.05, 6, 20), PINK, pagoda, 0, y + 0.5 + k * 0.42, 0);
  pagoda.children.slice(-6).forEach((m) => { m.rotation.x = Math.PI / 2; });
  neon(new THREE.OctahedronGeometry(0.35), 0xffffff, pagoda, 0, y + 3.4, 0);
  pagoda.scale.setScalar(1.35);

  // 山门（牌坊）+ 匾额「千手院」
  const gate = new THREE.Group();
  gate.position.set(0, 0, -6);
  scene.add(gate);
  [-4, 4].forEach((x) => neon(new THREE.BoxGeometry(0.6, 8.2, 0.6), PINK, gate, x, 4.1, 0));
  [-2.2, 2.2].forEach((x) => neon(new THREE.BoxGeometry(0.4, 6.6, 0.4), PINK, gate, x, 3.3, 0));
  neon(new THREE.BoxGeometry(10.8, 0.5, 0.7), CYAN, gate, 0, 7.0, 0);
  neon(new THREE.BoxGeometry(9.2, 0.32, 0.55), CYAN, gate, 0, 5.4, 0);
  neon(roof(2.2, 1.3), PINK, gate, 0, 7.25, 0, 0, 2.75, 1, 0.55);
  const plaqueTex = canvasTexture(512, 192, (g, w, h) => {
    g.fillStyle = '#12032a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#00F0FF'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.font = '900 112px "Noto Serif SC","Songti SC","SimSun",serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#FF2E88'; g.shadowBlur = 24; g.fillStyle = '#FFFFFF';
    g.fillText('千手院', w / 2, h / 2 + 6);
  });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.27), new THREE.MeshBasicMaterial({ map: plaqueTex }));
  plaque.position.set(0, 6.2, 0.4);
  gate.add(plaque);

  // 绕塔飘的大字
  const glyphs = [];
  '禅渡空表录算释手千院'.split('').forEach((ch, i) => {
    const color = i % 2 ? '#FF2E88' : '#00F0FF';
    const tex = canvasTexture(128, 128, (g, w, h) => {
      g.font = '900 96px "Noto Serif SC","Songti SC","SimSun",serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color;
      g.fillText(ch, w / 2, h / 2 + 4);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.userData = { a: (i / 10) * Math.PI * 2, r: 12 + (i % 3) * 3, y: 4 + (i % 4) * 3.2, sp: 0.08 + (i % 3) * 0.03 };
    s.scale.setScalar(2.2);
    scene.add(s);
    glyphs.push(s);
  });

  // 香烟：从山门脚下往上飘的紫粉色光点
  const N = 360;
  const smoke = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    smoke[i * 3] = (Math.random() - 0.5) * 30;
    smoke[i * 3 + 1] = Math.random() * 16;
    smoke[i * 3 + 2] = -60 + Math.random() * 62;
    seed[i] = Math.random() * 10;
  }
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smoke, 3));
  const dotTex = canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,200,240,1)'); grd.addColorStop(0.4, 'rgba(255,46,136,0.5)'); grd.addColorStop(1, 'rgba(255,46,136,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  });
  scene.add(new THREE.Points(smokeGeo, new THREE.PointsMaterial({
    map: dotTex, size: 0.34, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

  // 星星
  {
    const p = [];
    for (let i = 0; i < 900; i++) p.push((Math.random() - 0.5) * 400, 20 + Math.random() * 120, -200 + Math.random() * 120);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.7, fog: false })));
  }

  let narrow = false;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    narrow = camera.aspect < 0.8;
    camera.fov = narrow ? 72 : 55;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  let mx = 0, my = 0, sx = 0, sy = 0;
  window.addEventListener('pointermove', (e) => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  const hero = document.getElementById('hero');
  const clock = new THREE.Clock();
  const speed = still ? 0.2 : 1;
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime * speed;
    sx += (mx - sx) * 0.04; sy += (my - sy) * 0.04;
    grid.material.uniforms.uTime.value = t;
    pagoda.rotation.y = t * 0.12;
    glyphs.forEach((s) => {
      const u = s.userData, a = u.a + t * u.sp;
      s.position.set(Math.cos(a) * u.r, u.y + Math.sin(t * 0.8 + u.a) * 0.6, -48 + Math.sin(a) * u.r);
    });
    for (let i = 0; i < N; i++) {
      smoke[i * 3 + 1] += (0.5 + (i % 5) * 0.12) * dt * speed;
      smoke[i * 3] += Math.sin(t * 0.7 + seed[i]) * 0.01;
      if (smoke[i * 3 + 1] > 16) smoke[i * 3 + 1] = 0;
    }
    smokeGeo.attributes.position.needsUpdate = true;
    // 往下滑：镜头从山门外穿过去，停在塔前
    const s = Math.min(window.scrollY / (window.innerHeight * 1.1), 1);
    const e = s * s * (3 - 2 * s);
    const z0 = narrow ? 14 : 19;
    camera.position.set(sx * 1.2, 2.6 + e * 1.8 - sy * 0.4, z0 + e * (-26 - z0));
    camera.lookAt(sx * 0.6, (narrow ? 7 : 10.5) + e * 2, -48);
    hero.style.opacity = String(Math.max(0, 1 - s * 2.2));
    renderer.render(scene, camera);
  }
  frame();
}
