// 门牌和菜单上的小物种：全是 wire.ts 现算现画的线框。
// data-emblem="halo"（千手院：一圈千手千眼）、"assorted"（杂货铺：一架子杂货）、"species:<名字>"（货架上每样工具一只）。
import { halo, assorted, supershape, speciesOf, draw, fit, reduced, headless, frameBook, type Mesh, type View, type Ink } from './wire';

type Spec = { mesh: Mesh; view: (t: number) => View; ink: Ink; spin: boolean };

function parse(s?: string) {
  const v = (s || '').split(',').map(Number);
  return v.length === 4 && v.every(Number.isFinite) ? { m: v[0], n1: v[1], n2: v[2], n3: v[3] } : null;
}

function specFor(kind: string, box: HTMLElement): Spec {
  if (kind === 'halo') {
    return { mesh: halo(56), ink: { rgb: [255, 176, 0], alpha: [0.1, 0.95] }, spin: true,
      view: (t) => ({ yaw: t * 0.00018, pitch: 0.42 + Math.sin(t * 0.0004) * 0.05, roll: 0.06, dist: 3.2, scale: 0.55 }) };
  }
  if (kind === 'assorted') {
    // 货架慢慢左右转一点：像在店门口往里瞄
    return { mesh: assorted(), ink: { rgb: [0, 255, 157], alpha: [0.1, 0.95] }, spin: true,
      view: (t) => ({ yaw: Math.sin(t * 0.0004) * 0.45, pitch: 0.3, roll: 0, dist: 3.6, scale: 0.56 }) };
  }
  const seed = kind.replace(/^species:/, '');
  const given = [parse(box.dataset.r1), parse(box.dataset.r2)];
  const [r1, r2] = given[0] && given[1] ? [given[0], given[1]] : speciesOf(seed);
  return { mesh: supershape(r1, r2, 28, 14), ink: { rgb: [0, 255, 157], alpha: [0.1, 0.9] }, spin: false,
    view: (t) => ({ yaw: 0.7 + t * 0.0003, pitch: 0.5, roll: -0.1, dist: 3.2, scale: 0.36 }) };
}

export function mountEmblems(scope: ParentNode = document) {
  const still = reduced();
  scope.querySelectorAll<HTMLElement>('[data-emblem]').forEach((box) => {
    const spec = specFor(box.dataset.emblem || '', box);
    let canvas: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null;
    let raf = 0, inView = false, hover = false, t = 0, last = 0;

    const paint = (now: number) => {
      raf = 0;
      if (!canvas || !ctx) return;
      const t0 = performance.now();
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      t += dt * (hover ? 3 : 1);
      const { w, h } = fit(canvas, ctx);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h, spec.mesh.pos, spec.mesh.lines, spec.view(t), spec.ink);
      frameBook().add(performance.now() - t0);
      if (!still && inView && !document.hidden && (spec.spin || hover)) raf = requestAnimationFrame(paint);
    };
    const kick = () => { if (!raf && canvas) { last = 0; raf = requestAnimationFrame(paint); } };
    const build = () => {
      if (canvas || headless()) return;
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      box.prepend(canvas);
      ctx = canvas.getContext('2d');
      frameBook().canvases++;
      t = 4000 + (box.dataset.emblem || '').length * 777;  // 每只停在不一样的角度
      kick();
    };
    const destroy = () => {
      if (!canvas) return;
      cancelAnimationFrame(raf); raf = 0;
      canvas.width = canvas.height = 0;
      canvas.remove();
      canvas = null; ctx = null;
    };
    const host = box.closest('a, .card') as HTMLElement | null;
    host?.addEventListener('pointerenter', (e) => { if ((e as PointerEvent).pointerType === 'mouse') { hover = true; kick(); } });
    host?.addEventListener('pointerleave', () => { hover = false; });
    new IntersectionObserver((es) => { inView = es[0].isIntersecting; if (inView) kick(); }).observe(box);
    window.addEventListener('resize', kick);
    document.addEventListener('visibilitychange', kick);
    document.addEventListener('zero:mode', () => { headless() ? destroy() : build(); });
    build();
  });
}
