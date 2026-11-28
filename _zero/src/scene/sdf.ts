// 星尘字的字形（v3.3）：用页面上已经载好的两套细字（Zero Display = Montserrat 200、Zero Hei SC = 思源黑体 200）
// 在离屏的 canvas 上一个字一个字画出来，算成「有向距离场」（SDF）拼进一张图集：
//   - 3D 里聚好以后那份清楚的细发光字，按距离场画，远近、大小怎么变边都是锐的，光晕也从距离场里来；
//   - 碎块、星往哪聚：从同一张字形里取笔画上的点（笔画在哪，点就在哪）。
// 一个字画一次，中英两套共用一张图集；分几小段算（每段几个字），不卡开场。
// 距离场的算法是 Felzenszwalb 的一维平方距离变换（横竖各走一遍），初值用抗锯齿的覆盖率估亚像素的距离。

export const SDF = {
  em: 88,        // 字号（图集里一个 em 多少像素）：手机 30 号字 × 3 倍屏也不放大
  spread: 22,    // 字外边记多远（像素）：光晕就在这一圈里
  inMax: 4,      // 字里边记多深（细字笔画本来就细）
};
const PAD = SDF.spread + 2;
const INF = 1e20;

export interface Glyph {
  ch: string; fam: string;
  x: number; y: number; w: number; h: number;   // 在图集里的格子（像素，含边）
  adv: number;                                   // 前进多少（em）
  l: number; b: number;                          // 格子左下角离笔尖原点（基线上）多远（em，y 朝上）
  ink: Uint16Array;                              // 笔画上的像素（格子内坐标 x, y 交替）
}

export function famOf(ch: string, latin: string, cjk: string) {
  const c = ch.codePointAt(0)!;
  return c >= 0x2e80 || (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef) ? cjk : latin;
}

/** 一维平方距离变换（下包络线），f 原地改成结果 */
function edt1d(f: Float64Array, off: number, stride: number, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 0; q < n; q++) d[q] = f[off + q * stride];
  for (let q = 1, k = 0; q < n; q++) {
    let s: number;
    do {
      const r = v[k];
      s = (d[q] - d[r] + q * q - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    f[off + q * stride] = d[r] + (q - r) * (q - r);
  }
}
function edt2d(g: Float64Array, w: number, h: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  for (let x = 0; x < w; x++) edt1d(g, x, w, h, d, v, z);
  for (let y = 0; y < h; y++) edt1d(g, y * w, 1, w, d, v, z);
}

export class Atlas {
  readonly W = 2048;
  H = 256;
  data = new Uint8Array(this.W * this.H);
  glyphs = new Map<string, Glyph>();
  version = 0;
  private cx: CanvasRenderingContext2D;
  private shelf = { x: 0, y: 0, h: 0 };
  private bufs = { o: new Float64Array(1), i: new Float64Array(1), d: new Float64Array(1), v: new Int32Array(1), z: new Float64Array(1) };
  private kernCache = new Map<string, number>();
  constructor(public weight = 200) {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 220;
    this.cx = c.getContext('2d', { willReadFrequently: true })!;
  }
  key(fam: string, ch: string) { return fam + '\u0000' + ch; }
  has(fam: string, ch: string) { return this.glyphs.has(this.key(fam, ch)); }
  private font(fam: string, px = SDF.em) { return `${this.weight} ${px}px "${fam}"`; }
  /** 一对拉丁字母之间的字距调整（em）：整串量出来减去各自量出来的 */
  kern(fam: string, a: string, b: string) {
    const k = fam + a + b;
    let v = this.kernCache.get(k);
    if (v == null) {
      const cx = this.cx;
      cx.font = this.font(fam);
      v = (cx.measureText(a + b).width - cx.measureText(a).width - cx.measureText(b).width) / SDF.em;
      if (Math.abs(v) < 1e-4) v = 0;
      this.kernCache.set(k, v);
    }
    return v;
  }
  advance(fam: string, ch: string) {
    const g = this.glyphs.get(this.key(fam, ch));
    if (g) return g.adv;
    this.cx.font = this.font(fam);
    return this.cx.measureText(ch).width / SDF.em;
  }
  /** 画一个字、算距离场、放进图集 */
  add(fam: string, ch: string) {
    const key = this.key(fam, ch);
    if (this.glyphs.has(key)) return;
    const cx = this.cx, E = SDF.em;
    cx.font = this.font(fam);
    const m = cx.measureText(ch);
    const adv = m.width / E;
    const L = Math.ceil(Math.max(0, m.actualBoundingBoxLeft) + 1), R = Math.ceil(Math.max(0, m.actualBoundingBoxRight) + 1);
    const A = Math.ceil(Math.max(0, m.actualBoundingBoxAscent) + 1), D = Math.ceil(Math.max(0, m.actualBoundingBoxDescent) + 1);
    if (ch.trim() === '' || L + R <= 2 || A + D <= 2) {
      this.glyphs.set(key, { ch, fam, x: 0, y: 0, w: 0, h: 0, adv, l: 0, b: 0, ink: new Uint16Array(0) });
      return;
    }
    const w = L + R + 2 * PAD, h = A + D + 2 * PAD;
    if (cx.canvas.width < w || cx.canvas.height < h) { cx.canvas.width = Math.max(cx.canvas.width, w); cx.canvas.height = Math.max(cx.canvas.height, h); cx.font = this.font(fam); }
    cx.clearRect(0, 0, w, h);
    cx.fillStyle = '#fff';
    cx.textBaseline = 'alphabetic';
    cx.textAlign = 'left';
    cx.fillText(ch, PAD + L, PAD + A);
    const img = cx.getImageData(0, 0, w, h).data;
    const n = w * h;
    const b = this.bufs;
    if (b.o.length < n) { b.o = new Float64Array(n); b.i = new Float64Array(n); }
    const len = Math.max(w, h);
    if (b.d.length < len) { b.d = new Float64Array(len); b.v = new Int32Array(len); b.z = new Float64Array(len + 1); }
    const ink: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = img[i * 4 + 3] / 255;
      if (a >= 0.999) { b.o[i] = 0; b.i[i] = INF; }
      else if (a <= 0.001) { b.o[i] = INF; b.i[i] = 0; }
      else { const d = Math.max(0, 0.5 - a); b.o[i] = d * d; const e = Math.max(0, a - 0.5); b.i[i] = e * e; }
      if (a > 0.45) ink.push(i % w, (i / w) | 0);
    }
    edt2d(b.o, w, h, b.d, b.v, b.z);
    edt2d(b.i, w, h, b.d, b.v, b.z);
    // 放进图集：一排一排往下摆
    const s = this.shelf;
    if (s.x + w > this.W) { s.x = 0; s.y += s.h + 1; s.h = 0; }
    if (s.y + h > this.H) this.grow(s.y + h);
    const ax = s.x, ay = s.y;
    s.x += w + 1; s.h = Math.max(s.h, h);
    const span = SDF.spread + SDF.inMax;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const d = Math.sqrt(b.o[i]) - Math.sqrt(b.i[i]);          // 正 = 在字外
        const v = (SDF.spread - d) / span;                          // 字外 spread 处 0，字里 inMax 处 1
        this.data[(ay + y) * this.W + ax + x] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
    }
    // 格子左下角离笔尖原点多远（em，y 朝上）：画的时候笔尖在 (PAD + L, PAD + A)
    this.glyphs.set(key, { ch, fam, x: ax, y: ay, w, h, adv, l: -(PAD + L) / E, b: -(h - PAD - A) / E, ink: Uint16Array.from(ink) });
    this.version++;
  }
  private grow(need: number) {
    let H = this.H;
    while (H < need) H *= 2;
    const d = new Uint8Array(this.W * H);
    d.set(this.data);
    this.data = d;
    this.H = H;
  }
}
