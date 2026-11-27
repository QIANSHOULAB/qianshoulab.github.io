// 零资产线框引擎：一个顶点数组 + 一串折线，Canvas 2D 自己投影、自己画。没有 Three.js，没有贴图，没有网格文件。
// 用在首页取景框（HeroCanvas）、两扇门的门牌、炸货铺菜单上的小物种。

export type Mesh = {
  pos: Float32Array;          // x,y,z 连着放
  lines: Uint16Array[];       // 每条折线是一串顶点下标
};

/** 帧耗时登记：无头模式里要报「最后一帧渲染耗时」。 */
type FrameBook = { frames: number; total: number; last: number; canvases: number; add(ms: number): void };
declare global { interface Window { __zf?: FrameBook } }
export function frameBook(): FrameBook {
  if (!window.__zf) {
    window.__zf = { frames: 0, total: 0, last: 0, canvases: 0, add(ms) { this.frames++; this.total += ms; this.last = ms; } };
  }
  return window.__zf;
}

// —— 超级公式（Gielis superformula）：一条式子长出海星、海胆、鹦鹉螺 ——
export type Super = { m: number; n1: number; n2: number; n3: number; a?: number; b?: number };
function sf(phi: number, p: Super) {
  const a = p.a ?? 1, b = p.b ?? 1;
  const t1 = Math.pow(Math.abs(Math.cos((p.m * phi) / 4) / a), p.n2);
  const t2 = Math.pow(Math.abs(Math.sin((p.m * phi) / 4) / b), p.n3);
  const r = Math.pow(t1 + t2, -1 / p.n1);
  return Number.isFinite(r) ? r : 0;
}

/** 三维超级形体：经度一套参数 r1，纬度一套 r2；量到单位大小，方便互相变形。 */
export function supershape(r1: Super, r2: Super, U = 48, V = 24): Mesh {
  const pos = new Float32Array(U * (V + 1) * 3);
  let max = 0;
  for (let j = 0; j <= V; j++) {
    const phi = -Math.PI / 2 + (Math.PI * j) / V;
    const rb = sf(phi, r2);
    for (let i = 0; i < U; i++) {
      const th = -Math.PI + (2 * Math.PI * i) / U;
      const ra = sf(th, r1);
      const k = (j * U + i) * 3;
      const x = ra * Math.cos(th) * rb * Math.cos(phi);
      const y = rb * Math.sin(phi);
      const z = ra * Math.sin(th) * rb * Math.cos(phi);
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      max = Math.max(max, Math.hypot(x, y, z));
    }
  }
  if (max > 0) for (let k = 0; k < pos.length; k++) pos[k] /= max;
  const lines: Uint16Array[] = [];
  for (let j = 1; j < V; j++) {                    // 纬线（两极那一圈缩成一点，不画）
    const l = new Uint16Array(U + 1);
    for (let i = 0; i <= U; i++) l[i] = j * U + (i % U);
    lines.push(l);
  }
  for (let i = 0; i < U; i++) {                     // 经线
    const l = new Uint16Array(V + 1);
    for (let j = 0; j <= V; j++) l[j] = j * U + i;
    lines.push(l);
  }
  return { pos, lines };
}

/** 千手院门牌：一圈禅环，环上伸出 n 只手，手尖一只眼（照总舵首页那圈千手千眼，抽象成线）。 */
export function halo(n = 48): Mesh {
  const ringN = 96;
  const pts: number[] = [];
  const lines: Uint16Array[] = [];
  const ring = new Uint16Array(ringN + 1);
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2;
    pts.push(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
    ring[i] = i;
  }
  ring[ringN] = 0;
  lines.push(ring);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const tilt = (i % 2 ? 0.16 : -0.08);
    const base = pts.length / 3;
    const L = i % 3 === 0 ? 1 : 0.86;
    pts.push(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
    pts.push(Math.cos(a) * L, tilt, Math.sin(a) * L);
    lines.push(new Uint16Array([base, base + 1]));
    // 手尖的眼：一个小菱形
    const e = 0.035, cx = Math.cos(a) * (L + 0.05), cz = Math.sin(a) * (L + 0.05);
    const b2 = pts.length / 3;
    pts.push(cx, tilt + e, cz, cx + Math.cos(a) * e, tilt, cz + Math.sin(a) * e, cx, tilt - e, cz, cx - Math.cos(a) * e, tilt, cz - Math.sin(a) * e);
    lines.push(new Uint16Array([b2, b2 + 1, b2 + 2, b2 + 3, b2]));
  }
  return { pos: new Float32Array(pts), lines };
}

/** 炸货铺门牌：一根麻花。三股面团绕着一根轴拧，每股是一根管子（管子 = 一圈圈截面 + 几条纵线）。 */
export function mahua(turns = 2.6, rings = 60, sides = 8, strands = 3): Mesh {
  const pts: number[] = [];
  const lines: Uint16Array[] = [];
  const len = 1.5, R = 0.12, tube = 0.115;
  for (let s = 0; s < strands; s++) {
    const off = (s * Math.PI * 2) / strands;
    const start = pts.length / 3;
    for (let r = 0; r <= rings; r++) {
      const u = r / rings;
      const x = -len / 2 + u * len;
      const a = u * turns * Math.PI * 2 + off;
      const taper = Math.sin(Math.PI * Math.min(1, u * 1.08 + 0.02)) * 0.35 + 0.65;   // 两头收一点
      const cy = Math.cos(a) * R, cz = Math.sin(a) * R;
      for (let k = 0; k < sides; k++) {
        const b = (k / sides) * Math.PI * 2;
        // 截面圈：法向近似取在 y-z 平面里
        pts.push(x + Math.sin(b) * tube * 0.25 * taper, cy + Math.cos(b) * tube * taper, cz + Math.sin(b) * tube * taper);
      }
    }
    for (let r = 0; r <= rings; r += 2) {          // 截面圈（隔一圈画一圈，像面团上的纹）
      const l = new Uint16Array(sides + 1);
      for (let k = 0; k <= sides; k++) l[k] = start + r * sides + (k % sides);
      lines.push(l);
    }
    for (let k = 0; k < sides; k++) {               // 纵线
      const l = new Uint16Array(rings + 1);
      for (let r = 0; r <= rings; r++) l[r] = start + r * sides + k;
      lines.push(l);
    }
  }
  return { pos: new Float32Array(pts), lines };
}

/** 字符串哈希 → 一只确定的小物种（炸货铺菜单上每样工具一只，名字一样长出来就一样）。 */
export function speciesOf(seed: string): [Super, Super] {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const m1 = [3, 4, 5, 6, 7, 8][Math.floor(rnd() * 6)];
  const m2 = [1, 2, 3, 4][Math.floor(rnd() * 4)];
  return [
    { m: m1, n1: 0.25 + rnd() * 1.6, n2: 0.6 + rnd() * 1.8, n3: 0.6 + rnd() * 1.8 },
    { m: m2, n1: 0.6 + rnd() * 1.6, n2: 0.6 + rnd() * 1.4, n3: 0.6 + rnd() * 1.4 },
  ];
}

// —— 画 ——
export type View = { yaw: number; pitch: number; roll?: number; dist?: number; scale?: number };
export type Ink = { rgb: [number, number, number]; alpha?: [number, number]; width?: number };

const BUCKETS = 5;
const paths: Path2D[] = [];

/** 投影到 canvas：按深度分五档透明度，远的淡、近的亮。pos 可以是两个网格插值出来的临时数组。 */
export function draw(ctx: CanvasRenderingContext2D, w: number, h: number, pos: Float32Array, lines: Uint16Array[], v: View, ink: Ink) {
  const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
  const cr = Math.cos(v.roll ?? 0), sr = Math.sin(v.roll ?? 0);
  const d = v.dist ?? 3.2, s = (v.scale ?? 0.42) * Math.min(w, h);
  const n = pos.length / 3;
  const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x0 = pos[i * 3], y0 = pos[i * 3 + 1], z0 = pos[i * 3 + 2];
    // 先绕 y 转（yaw），再绕 x 转（pitch），最后绕 z 歪一点（roll）
    const x1 = x0 * cy + z0 * sy, z1 = -x0 * sy + z0 * cy;
    const y2 = y0 * cp - z1 * sp, z2 = y0 * sp + z1 * cp;
    const x3 = x1 * cr - y2 * sr, y3 = x1 * sr + y2 * cr;
    const f = d / (d + z2);
    px[i] = w / 2 + x3 * s * f;
    py[i] = h / 2 - y3 * s * f;
    pz[i] = z2;
  }
  for (let b = 0; b < BUCKETS; b++) paths[b] = new Path2D();
  for (const l of lines) {
    for (let k = 1; k < l.length; k++) {
      const a = l[k - 1], c = l[k];
      const z = (pz[a] + pz[c]) * 0.5;               // -1（近）… 1（远）
      const bi = Math.max(0, Math.min(BUCKETS - 1, Math.floor(((z + 1) / 2) * BUCKETS)));
      const p = paths[bi];
      p.moveTo(px[a], py[a]);
      p.lineTo(px[c], py[c]);
    }
  }
  const [lo, hi] = ink.alpha ?? [0.12, 0.95];
  ctx.lineWidth = ink.width ?? 1;
  ctx.lineCap = 'round';
  for (let b = BUCKETS - 1; b >= 0; b--) {        // 先画远的
    const t = 1 - b / (BUCKETS - 1);
    ctx.strokeStyle = `rgba(${ink.rgb[0]},${ink.rgb[1]},${ink.rgb[2]},${(lo + (hi - lo) * t * t).toFixed(3)})`;
    ctx.stroke(paths[b]);
  }
}

/** canvas 跟着容器大小走，按屏幕倍数（最多 2 倍）画。返回 CSS 像素宽高。 */
export function fit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height };
}

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const headless = () => document.documentElement.getAttribute('data-mode') === 'headless';
