// 首页纯代码动态几何视口（策划书 §4.2 HeroCanvas.ts）。
// 一条超级公式长出五个「物种」，每 4 秒变一次身；拖一下能转，点一下逼它提前变异。
// 无头模式一开，canvas 当场销毁；切回肉身再长出来。
import { supershape, draw, fit, smooth, reduced, headless, frameBook, type Mesh, type Super } from '../labs/wire';
import { SPECIES } from '../../data/species';
import { blip } from '../../utils/microSfx';

const U = 48, V = 24;
const HOLD = 3800, MORPH = 1600;

export function mountHero(root: HTMLElement) {
  const meshes: Mesh[] = SPECIES.map((s) => supershape(s.r1, s.r2, U, V));
  const lines = meshes[0].lines;
  const work = new Float32Array(meshes[0].pos.length);
  const hud = {
    latin: root.querySelector<HTMLElement>('[data-hud="latin"]'),
    common: root.querySelectorAll<HTMLElement>('[data-hud="common"]'),
    params: root.querySelector<HTMLElement>('[data-hud="params"]'),
    fps: root.querySelector<HTMLElement>('[data-hud="fps"]'),
    verts: root.querySelector<HTMLElement>('[data-hud="verts"]'),
  };
  const stage = root.querySelector<HTMLElement>('[data-stage]') ?? root;

  let canvas: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null;
  let raf = 0, visible = true, last = 0, fpsT = 0, fpsN = 0;
  let cur = 1, next = 1, phaseStart = 0, morphing = false;
  let yaw = 0.6, pitch = 0.42, vel = 0.00022, dragging = false, lastX = 0, lastY = 0;
  const still = reduced();

  function label(i: number) {
    const s = SPECIES[i];
    if (hud.latin) hud.latin.textContent = s.latin;
    hud.common.forEach((el) => { el.textContent = el.dataset.l === 'zh' ? s.zh : s.en; });
    const f = (p: Super) => `m ${p.m} · n ${p.n1} / ${p.n2} / ${p.n3}`;
    if (hud.params) hud.params.textContent = `r₁(${f(s.r1)})  r₂(${f(s.r2)})`;
  }

  function mutate(now = performance.now()) {
    if (morphing) return;
    next = (cur + 1) % SPECIES.length;
    if (next === 0) next = 1;                           // 零号球只在开场出现一次
    morphing = true;
    phaseStart = now;
    label(next);                                        // 一开始变身，牌子就换成要变成的那个
  }

  function frame(now: number) {
    raf = 0;
    if (!canvas || !ctx) return;
    const t0 = performance.now();
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    if (!dragging && !still) yaw += vel * dt + 0.00016 * dt;
    if (!dragging) vel *= 0.95;
    // 变身：零号球先停 1.2 秒；之后每个物种停 HOLD，再花 MORPH 变成下一个
    if (!still) {
      if (!morphing && now - phaseStart > (cur === 0 ? 1200 : HOLD)) mutate(now);
    }
    let k = 0;
    if (morphing) {
      k = smooth(Math.min(1, (now - phaseStart) / MORPH));
      const a = meshes[cur].pos, b = meshes[next].pos;
      for (let i = 0; i < work.length; i++) work[i] = a[i] + (b[i] - a[i]) * k;
      if (k >= 1) { cur = next; morphing = false; phaseStart = now; }
    } else {
      work.set(meshes[cur].pos);
    }
    const { w, h } = fit(canvas, ctx);
    ctx.clearRect(0, 0, w, h);
    // 地平线和刻度：实验记录纸上的参照线
    ctx.strokeStyle = 'rgba(230,237,243,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5);
    ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, h);
    ctx.stroke();
    draw(ctx, w, h, work, lines, { yaw, pitch, roll: -0.12, dist: 3.4, scale: w < 520 ? 0.34 : 0.4 }, { rgb: [0, 255, 157], alpha: [0.08, 0.95], width: 1 });
    const ms = performance.now() - t0;
    frameBook().add(ms);
    fpsN++;
    if (now - fpsT > 500) {
      if (hud.fps) hud.fps.textContent = String(Math.round((fpsN * 1000) / (now - fpsT)));
      fpsT = now; fpsN = 0;
    }
    if (visible && !document.hidden && !still) raf = requestAnimationFrame(frame);
  }

  function kick() { if (!raf && canvas) raf = requestAnimationFrame(frame); }

  function build() {
    if (canvas || headless()) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'hero-canvas';
    stage.appendChild(canvas);
    ctx = canvas.getContext('2d');
    frameBook().canvases++;
    last = 0; fpsT = performance.now(); fpsN = 0;
    if (!phaseStart) { phaseStart = performance.now(); cur = still ? 1 : 0; label(cur); }
    if (hud.verts) hud.verts.textContent = (U * (V + 1)).toLocaleString('en-US');
    canvas.addEventListener('pointerdown', down);
    raf = requestAnimationFrame(frame);
  }
  function destroy() {
    if (!canvas) return;
    cancelAnimationFrame(raf); raf = 0;
    canvas.removeEventListener('pointerdown', down);
    canvas.width = canvas.height = 0;            // 交还显存
    canvas.remove();
    canvas = null; ctx = null;
  }

  let moved = 0;
  function down(e: PointerEvent) {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    canvas?.setPointerCapture(e.pointerId);
    canvas?.addEventListener('pointermove', move);
    canvas?.addEventListener('pointerup', up, { once: true });
    canvas?.addEventListener('pointercancel', up, { once: true });
  }
  function move(e: PointerEvent) {
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX; lastY = e.clientY;
    yaw += dx * 0.008;
    pitch = Math.max(-1.1, Math.min(1.1, pitch + dy * 0.006));
    vel = dx * 0.0004;
    kick();
  }
  function up() {
    dragging = false;
    canvas?.removeEventListener('pointermove', move);
    if (moved < 6) { mutate(); blip('mutate'); }       // 没拖就是点：逼它变异
    kick();
  }

  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); });
  io.observe(root);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; kick(); } });
  window.addEventListener('resize', () => { if (still) kick(); });
  document.addEventListener('zero:mode', () => { headless() ? destroy() : build(); });
  document.addEventListener('zero:lang', () => label(cur));

  build();
}
