// 首页的手：滚动 → 进度、字跟着画面走、右边七个刻度、声音、「进去」、没有 WebGL 时的静态图。
// 画面本身在 ../scene/genesis.ts（three.js 跟它一起异步加载）。
// v3.1：画面上只留名字——首屏 wordmark + 往下滑的小提示，第二到第六幕栏目名 + 「进去」。
// v3.2（Song 11-28 选的 C 星空目录）：
//   - 顶栏正中「目录」：世界从现在的进度快进到结尾「开天」（约 2.5–3 秒，起步收尾都缓），滚动位置跟着走，停在那片天上；途中一动就把手还给你。
//   - 天上的五个名字：落定以后挂在五样造物旁边（日千手院、环赛博杂货铺、鲸标本、器文物、轨道法典），每帧跟着造物、镜头摆；
//     点名字、或者点那样造物本身，马上冲进去（镜头扎进它、满屏它的颜色、栏目页从这个颜色里淡出）。
//   - 从栏目页按「后退」：回到离开时那片天，五个名字还在、还能点（不放开场、不回开头）。
import * as sound from './sound';
import { SCROLL, DIVE_MS, HITSTOP_MS, SECTION_HEX, INDEX, NAMES, type Tier } from '../scene/tune';
import { scrollToP, pToScroll, qRot, ss, type State, type V3 } from '../scene/timeline';
import type { Genesis, Marks } from '../scene/genesis';

const root = document.documentElement;
const stage = document.querySelector<HTMLElement>('[data-stage]')!;
const host = document.querySelector<HTMLElement>('[data-gl-host]')!;
const uiLayer = document.querySelector<HTMLElement>('[data-ui]')!;
const flood = document.querySelector<HTMLElement>('[data-flood]')!;
const hero = document.querySelector<HTMLElement>('[data-hero]')!;
const acts = [...document.querySelectorAll<HTMLElement>('.act[data-act]')];
const ticks = [...document.querySelectorAll<HTMLButtonElement>('[data-tick]')];
const ticksNav = document.querySelector<HTMLElement>('[data-ticks]')!;
const endBox = document.querySelector<HTMLElement>('[data-end]')!;
const mottoEl = document.querySelector<HTMLElement>('.motto')!;
const footEl = document.querySelector<HTMLElement>('[data-foot]')!;
const still = document.querySelector<HTMLImageElement>('.still')!;
const stills: { l: string[]; p: string[] } = JSON.parse(still.dataset.stills || '{"l":[],"p":[]}');
const nMoons = Number(stage.dataset.moons || 0);
const indexBtn = document.querySelector<HTMLButtonElement>('[data-index]');
const skyNav = document.querySelector<HTMLElement>('[data-sky]')!;
const names = [...document.querySelectorAll<HTMLAnchorElement>('[data-sky-go]')];
const lead = document.querySelector<HTMLElement>('[data-lead]')!;

const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) && Number.isFinite(parseFloat(q.get(k)!)) ? parseFloat(q.get(k)!) : null);
const freezeP = num('act');
const freezeT = num('t');
const tierQ = q.get('tier') as Tier | null;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (q.has('still')) root.setAttribute('data-still', '');
let seen = false;
try { seen = sessionStorage.getItem('zero.opener') === '1'; } catch { /* 无痕 */ }

// —— 从栏目页按「后退」回来：摆回离开时那个进度（那片天），不放开场 ——
const BACK_KEY = 'zero.back';
let backP: number | null = null;
try {
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  const isBack = nav ? nav.type === 'back_forward' : (performance as unknown as { navigation?: { type: number } }).navigation?.type === 2;
  const raw = sessionStorage.getItem(BACK_KEY);
  sessionStorage.removeItem(BACK_KEY);
  if (raw && isBack && freezeP == null) {
    const v = JSON.parse(raw) as { P?: number };
    if (typeof v.P === 'number' && v.P > 1.02) backP = Math.min(7, v.P);
  }
} catch { /* 存不了就照常从头放 */ }

// —— 滚动 → 进度 ——
const vh = () => Math.max(1, stage.clientHeight);
const scrollP = () => scrollToP(window.scrollY / vh(), SCROLL.hold, SCROLL.acts);
const scrollYFor = (p: number) => pToScroll(p, SCROLL.hold, SCROLL.acts) * vh();
const restP = (k: number) => (k <= 1 ? 1 : k === 7 ? 7 : k - 0.12);
function scrollToAct(k: number, smooth = !reduced) {
  window.scrollTo({ top: scrollYFor(restP(k)), behavior: smooth ? 'smooth' : 'auto' });
}

let g: Genesis | null = null;
let P = freezeP ?? backP ?? (reduced ? 1 : 0);
let st: State | null = null;

// —— 字：开着的才亮，换了才动 DOM ——
const on = (el: Element, v: boolean) => { if (el.classList.contains('on') !== v) el.classList.toggle('on', v); };
/** 「目录」快进途中：每一幕的名字和「进去」先收起来，别一串字闪过去 */
let ffing = false;
/** 现在亮第几个刻度：第一幕 P 0..1，第 k 幕（k ≥ 2）P k−1..k；跟「滑到哪幕」差一点点提前量，跟刻度点过去停的位置（restP）对得上 */
export function tickFor(p: number) { return p < 1.12 ? 1 : Math.min(7, Math.floor(p - 0.12) + 1); }
function textFor(p: number) {
  const a = (k: number) => Math.min(1, Math.max(0, p - (k - 1)));
  on(hero, !ffing && p >= 0.86 && p < 1.1);
  root.toggleAttribute('data-opening', p < 0.86);
  root.toggleAttribute('data-scrolled', p > 1.1);
  root.toggleAttribute('data-sky', p > 6.45);
  for (const el of acts) {
    const k = Number(el.dataset.act);
    const ak = a(k);
    if (k === 7) { on(el, ak > 0.86); continue; }
    on(el, !ffing && ak > 0.52 && ak < 0.975);
  }
  const cur = tickFor(p);
  ticks.forEach((b) => on(b, Number(b.dataset.tick) === cur));
}

// —— 第七幕：那句话那块天要留暗。告诉画面它在屏幕上哪（量的是排好版的位置，没亮也量得到）——
function markEnd() {
  if (!g) return;
  const r = endBox.getBoundingClientRect();
  const W = Math.max(1, innerWidth), H = Math.max(1, vh());
  g.setTextBox((r.left + r.right) / 2 / W, (r.top + r.bottom) / 2 / H, r.width / W, r.height / H);
}

// —— 声音：门动一下响一声；第五幕炸开；第七幕石头升天（只加这一声）；进去。「目录」快进时不一路响，只留石头升天那一声 ——
let lastP = P;
function soundFor(p: number) {
  sound.setLevel(p);
  if (!ffing) for (const m of [1.03, 2.03, 3.03, 4.03, 5.03, 6.05]) if ((lastP < m && p >= m) || (lastP > m && p <= m)) sound.thud();
  if (lastP < 6.2 && p >= 6.2) sound.rise();
  lastP = p;
}

// —— 进去：镜头扎进那样造物本身，满屏变成它的颜色，再落到栏目页 ——
let going = false;
function prefetch(href: string) {
  if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'prefetch';
  l.href = href;
  document.head.appendChild(l);
}
function targetFor(k: number): V3 | null {
  if (!g || !st || k <= 1) return null;
  const s = st;
  if (k === 2) return s.sun.c;
  if (k === 3) {
    let best = 0;
    s.moons.forEach((m, i) => { if (m.hi > s.moons[best].hi) best = i; });
    return s.moons.length && s.moons[best].hi > 0.05 ? s.moons[best].p : s.ring.c;
  }
  if (k === 4) return s.whale.c;
  if (k === 5) return s.arm.c;
  const o = s.orbits[2];
  const f = qRot(o.q, [0, 0, o.R]);
  return [o.c[0] + f[0], o.c[1] + f[1], o.c[2] + f[2]];
}
/** 记下现在的进度：从栏目页按「后退」回来摆回这里 */
function saveBack() {
  try { sessionStorage.setItem(BACK_KEY, JSON.stringify({ P: g ? g.P : P })); } catch { /* 存不了就算了 */ }
}
async function go(href: string, color: string, target: V3 | null, hotK = -1) {
  if (going) return;
  going = true;
  cancelFF();
  saveBack();
  if (hotK >= 0) { g?.setHot(hotK); names[hotK]?.classList.add('hot'); }   // 点的那样先亮一下：马上看得见
  sound.swell();
  prefetch(href);
  try { sessionStorage.setItem('zero.arrive', color); } catch { /* 存不了就不淡出 */ }
  flood.style.background = color;
  root.setAttribute('data-diving', '');
  if (!g || reduced || !target) {
    flood.style.transition = 'opacity .5s ease';
    flood.style.opacity = '1';
    setTimeout(() => { location.href = href; }, 520);
    return;
  }
  await g.enter(target, DIVE_MS, (s) => { flood.style.opacity = String(ss(0.5, 0.96, s)); });
  location.href = href;
}
window.addEventListener('pagehide', saveBack);
// 按「后退」回来、页面是从缓存里整页拿回来的：颜色、镜头、名字都复位，还是离开时那片天
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  going = false;
  flood.style.opacity = '0';
  flood.style.transition = '';
  root.removeAttribute('data-diving');
  names.forEach((a) => a.classList.remove('hot'));
  labelK = -1; focusK = -1;
  g?.setHot(-1);
  cancelFF();
  g?.reset();
});
const plain = (e: MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
document.querySelectorAll<HTMLAnchorElement>('[data-go]').forEach((a) => {
  a.addEventListener('click', (e) => {
    if (plain(e)) return;
    e.preventDefault();
    const k = Number(a.dataset.go);
    go(a.href, SECTION_HEX[k - 2], targetFor(k));
  });
});
// 兜底那一排（没有 WebGL 时才看得见）：照样先满屏它的颜色再进
document.querySelectorAll<HTMLAnchorElement>('[data-end-go]').forEach((a) => {
  a.addEventListener('click', (e) => {
    if (plain(e)) return;
    e.preventDefault();
    const i = Number(a.dataset.endGo);
    go(a.href, SECTION_HEX[i], targetFor(i + 2));
  });
});

// ———————————— 天上的五个名字（目录）————————————
// 0 日 · 千手院｜1 环 · 赛博杂货铺｜2 鲸 · 标本｜3 器 · 文物｜4 轨道 · 法典（跟 ENTRIES、SECTION_HEX 一个顺序）
// 版面两种：sky = 名字挂在天上（电脑、平板、细长的手机）；list = 退路 B（Song 点过头的）：矮的手机竖屏、手机横着，天上挂不下五个名字——
//   点「目录」画面压暗，五个名字竖着一列，点哪个直接进；天上不挂名字，结尾照旧露着那一排五个名字。
let mode: 'sky' | 'list' = 'sky';
let namesOn = false;
let focusK = -1, labelK = -1;
let hoverXY: [number, number] | null = null;
const PAD_X = 12, PAD_Y = 14;                     // .nm 的内边距：点得到的范围大，字本身小
let sizes: { w: number; h: number }[] = [];
let obst = { W: 1, H: 1, top: 56, ticks: null as Box | null, motto: null as Box | null, foot: null as Box | null };
interface Box { x: number; y: number; w: number; h: number }
const boxes: (Box | null)[] = [null, null, null, null, null];
const dirs: (string | null)[] = [null, null, null, null, null];
/** 法典挂在哪：第 j 道轨道上一个固定的点（世界坐标 X），名字在它 dir 那一边，一根很短的细线连过去。
 *  轨道只画大半圈、绕自己的轴慢慢转：挑一个刚画上不久的点，要过很久缺口才转到它；快转到了，名字先淡出、换个刚画上的点再亮 */
let law: { j: number; X: V3; dir: string } | null = null;
let lawAway = 0;
let leadAt: { x: number; y: number; j: number; X: V3 } | null = null;
let collide = 0;
const LEAD = 26;   // 细线多长（像素）

function measureNames() {
  root.toggleAttribute('data-bmode', false);   // 先按「挂在天上」量名字的大小
  sizes = names.map((a) => ({ w: a.offsetWidth, h: a.offsetHeight }));
  root.toggleAttribute('data-bmode', mode === 'list');
  const ur = uiLayer.getBoundingClientRect();
  const rel = (r: DOMRect): Box => ({ x: r.left - ur.left, y: r.top - ur.top, w: r.width, h: r.height });
  const hd = document.querySelector<HTMLElement>('.hd-row');
  obst = {
    W: Math.max(1, ur.width), H: Math.max(1, ur.height),
    top: hd ? hd.getBoundingClientRect().bottom - ur.top - 4 : 56,
    ticks: rel(ticksNav.getBoundingClientRect()),
    motto: rel(mottoEl.getBoundingClientRect()),
    foot: rel(footEl.getBoundingClientRect()),
  };
}
const grow = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
const inner = (b: Box): Box => ({ x: b.x + PAD_X, y: b.y + PAD_Y, w: Math.max(1, b.w - 2 * PAD_X), h: Math.max(1, b.h - 2 * PAD_Y) });
const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function boxCircle(b: Box, cx: number, cy: number, r: number) {
  const dx = Math.max(b.x - cx, 0, cx - (b.x + b.w)), dy = Math.max(b.y - cy, 0, cy - (b.y + b.h));
  return Math.max(0, r - Math.hypot(dx, dy)) / Math.max(r, 1);   // 0 = 不碰；越往里越大
}
function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
  return Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
}
function polyDist(x: number, y: number, pts: number[], closed: boolean) {
  let d = 1e9;
  const n = pts.length / 2;
  for (let i = 0; i < n - 1 + (closed ? 1 : 0); i++) {
    const j = (i + 1) % n;
    d = Math.min(d, segDist(x, y, pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1]));
  }
  return d;
}
function inPoly(x: number, y: number, pts: number[]) {
  let c = false;
  for (let i = 0, n = pts.length / 2, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** 定版面：手机竖着的时候量一下那句话下面、页脚上面还空着多大一截天——够摆浑天仪（≥ 84 像素）就挂在天上，不够就退回 B 的列表 */
function decideMode() {
  const o = obst;
  const phonePortrait = o.W < 600 && o.W < o.H;
  const shortLandscape = o.H < 500 && o.W > o.H;
  let tall = true, band = -0.33;
  if (phonePortrait && o.motto && o.foot) {
    const y0 = o.motto.y + o.motto.h, y1 = o.foot.y;
    tall = y1 - y0 >= 84;
    band = 1 - ((y0 + y1) / o.H);
  }
  g?.setPhone(tall, band);
  const m = (phonePortrait && !tall) || shortLandscape || q.has('list') ? 'list' : 'sky';
  if (m !== mode) {
    mode = m;
    root.toggleAttribute('data-bmode', m === 'list');
    closeList();
    if (m === 'list') { namesOn = false; root.removeAttribute('data-names'); names.forEach((a) => { a.style.transform = ''; a.classList.remove('ok'); }); }
  }
}
/** 造物在屏幕上的「身子」：中心、横竖半径（名字贴着它的外沿放） */
function bodyOf(m: Marks, k: number) {
  if (k === 0) return { cx: m.sun.x, cy: m.sun.y, rx: m.sun.r, ry: m.sun.r };
  if (k === 3) return { cx: m.arm.x, cy: m.arm.y, rx: m.arm.r, ry: m.arm.r };
  if (k === 1) {
    const p = m.ring.pts ?? [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2 + 4, ry: (y1 - y0) / 2 + 4 };
  }
  const w = m.whale;
  const x0 = Math.min(w.ax!, w.bx!) - w.r, x1 = Math.max(w.ax!, w.bx!) + w.r, y0 = Math.min(w.ay!, w.by!) - w.r, y1 = Math.max(w.ay!, w.by!) + w.r;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 };
}
// 每样造物的名字往哪边放（先试的在前）：电脑横屏、平板竖着、手机竖屏各一套
const PREF: Record<'wide' | 'tab' | 'tall', string[][]> = {
  tab: [['E', 'SE', 'NE', 'S', 'W'], ['S', 'SW', 'SE', 'W', 'N'], ['S', 'N', 'SW', 'SE', 'E', 'W'], ['E', 'NE', 'SE', 'N', 'S'], []],
  wide: [['E', 'SE', 'NE', 'S', 'W'], ['S', 'SW', 'W', 'N', 'E'], ['S', 'SE', 'SW', 'N', 'E', 'W'], ['E', 'NE', 'SE', 'N', 'S'], []],
  tall: [['E', 'SE', 'NE', 'S', 'W'], ['W', 'SW', 'NW', 'N', 'S', 'E'], ['S', 'N', 'SW', 'SE', 'E', 'W'], ['E', 'NE', 'SE', 'N', 'S'], []],
};
const DIR: Record<string, [number, number]> = { E: [1, 0], SE: [0.72, 0.72], S: [0, 1], SW: [-0.72, 0.72], W: [-1, 0], NW: [-0.72, -0.72], N: [0, -1], NE: [0.72, -0.72] };
function candidate(dir: string, b: { cx: number; cy: number; rx: number; ry: number }, w: number, h: number, gap = 7): Box {
  const [dx, dy] = DIR[dir];
  const ax = b.cx + dx * (b.rx + gap), ay = b.cy + dy * (b.ry + gap);
  const iw = w - 2 * PAD_X, ih = h - 2 * PAD_Y;
  const ix = dx > 0.3 ? ax : dx < -0.3 ? ax - iw : ax - iw / 2;
  const iy = dy > 0.3 ? ay : dy < -0.3 ? ay - ih : ay - ih / 2;
  return { x: ix - PAD_X, y: iy - PAD_Y, w, h };
}
/** 这个位置放名字有多糟：0 = 挺好；≥ 500 = 压到别的名字、那句话、顶栏、出屏 */
function badness(bx: Box, k: number, m: Marks): number {
  const o = obst, t = inner(bx);
  let c = 0;
  if (t.x < 8 || t.x + t.w > o.W - 8 || t.y < o.top || t.y + t.h > o.H - 8) c += 1000;
  if (o.ticks && hits(grow(t, 6), o.ticks)) c += 1000;
  if (o.motto && hits(grow(t, 10), o.motto)) c += 1000;
  if (o.foot && hits(grow(t, 8), o.foot)) c += 1000;
  for (let j = 0; j < 5; j++) if (j !== k && boxes[j] && hits(grow(bx, -3), boxes[j]!)) c += 500;
  // 别压着别的造物（压一点点还行）
  for (let j = 0; j < 4; j++) {
    if (j === k) continue;
    const b = bodyOf(m, j);
    c += 80 * boxCircle(t, b.cx, b.cy, Math.min(b.rx, b.ry) * 0.9);
  }
  return c;
}
/** 轨道 j 上的世界坐标点 X，现在落在这道轨道的哪个参数上（0..1 一圈；画出来的是 0..draw 那一截） */
function arcU(j: number, X: V3) {
  const o = st!.orbits[j];
  const v = qRot([-o.q[0], -o.q[1], -o.q[2], o.q[3]], [X[0] - o.c[0], X[1] - o.c[1], X[2] - o.c[2]]);
  const a = Math.atan2(v[2], v[0]) / (Math.PI * 2);
  return a - Math.floor(a);
}
const LAW_DIRS = ['SE', 'SW', 'NE', 'NW', 'S', 'N', 'E', 'W'];
/** 给法典挑一个落点：画出来的轨道上、刚画上不久的点（u 小），名字往哪边放都不压别的；离别的造物远一点（别像是那样东西的名字） */
function chooseLaw(m: Marks, w: number, h: number) {
  if (!g || !st) return null;
  let best: { j: number; X: V3; dir: string } | null = null, bestC = 1e9;
  for (const a of m.arcs) {
    const draw = st.orbits[a.j].draw;
    for (let i = 0; i < a.u.length; i += 2) {
      const u = a.u[i];
      if (u > 0.38 * draw) continue;
      const x = a.pts[i * 2], y = a.pts[i * 2 + 1];
      for (const dir of LAW_DIRS) {
        const bx = candidate(dir, { cx: x, cy: y, rx: LEAD, ry: LEAD * 0.8 }, w, h, 0);
        let c = badness(bx, 4, m) + u * 30;
        const t = inner(bx), cx = t.x + t.w / 2, cy = t.y + t.h / 2;
        for (let j = 0; j < 4; j++) {
          const b = bodyOf(m, j);
          const d = Math.hypot(cx - b.cx, cy - b.cy) - Math.max(b.rx, b.ry);
          if (d < 70) c += (70 - d) * 1.2;
        }
        for (let j = 0; j < 4; j++) {
          const o = boxes[j];
          if (!o) continue;
          const dx = Math.max(o.x - (bx.x + bx.w), bx.x - (o.x + o.w), 0), dy = Math.max(o.y - (bx.y + bx.h), bx.y - (o.y + o.h), 0);
          if (Math.hypot(dx, dy) < 40) c += 40 - Math.hypot(dx, dy);
        }
        if (cy < obst.top + 34) c += (obst.top + 34 - cy) * 2;     // 别贴着顶栏
        if (cx < 70 || cx > obst.W - 70) c += 25;                    // 也别贴着屏幕两边
        if (c < bestC) { bestC = c; best = { j: a.j, X: g.orbitPoint(a.j, u) as V3, dir }; }
      }
    }
  }
  return best && bestC < 500 ? best : null;
}
function placeNames(m: Marks) {
  const o = obst;
  const tall = o.W / o.H < 0.64 ? 'tall' : o.W / o.H < 0.9 ? 'tab' : 'wide';
  collide = 0;
  // 先放不动的（日、器、环），再放鲸（它在游）和法典
  for (const k of [0, 3, 1, 2]) {
    const b = bodyOf(m, k);
    const { w, h } = sizes[k] ?? { w: 0, h: 0 };
    if (!w) continue;
    let pick: Box | null = null, pickC = 1e9, pickD: string | null = null;
    const prefs = PREF[tall][k];
    if (dirs[k]) {
      const bx = candidate(dirs[k]!, b, w, h);
      const c = badness(bx, k, m);
      if (c < 40) { pick = bx; pickC = c; pickD = dirs[k]; }
    }
    if (!pick) {
      prefs.forEach((d, i) => {
        const bx = candidate(d, b, w, h);
        const c = badness(bx, k, m) + i * 6;
        if (c < pickC) { pickC = c; pick = bx; pickD = d; }
      });
    }
    boxes[k] = pick; dirs[k] = pickD;
    if (pickC >= 500) collide++;
  }
  // 法典：挂在轨道上一个固定的点旁边；这个点快转进缺口了（或者位置压到别的了），名字先淡出，换个点再亮
  const { w, h } = sizes[4] ?? { w: 0, h: 0 };
  const now = performance.now();
  if (w && st) {
    if (law) {
      const draw = st.orbits[law.j].draw;
      const u = arcU(law.j, law.X);
      const a = g!.project(law.X)!;
      const bad = !a.front || u > draw - 0.025 || badness(candidate(law.dir, { cx: a.x, cy: a.y, rx: LEAD, ry: LEAD * 0.8 }, w, h, 0), 4, m) >= 500;
      if (bad && !lawAway) lawAway = now;
    }
    if (!law || (lawAway && now - lawAway > 380)) { law = chooseLaw(m, w, h); lawAway = 0; }
  }
  leadAt = null;
  boxes[4] = null;
  if (law && w) {
    const a = g!.project(law.X)!;
    const bx = candidate(law.dir, { cx: a.x, cy: a.y, rx: LEAD, ry: LEAD * 0.8 }, w, h, 0);
    boxes[4] = bx;
    if (badness(bx, 4, m) >= 500) collide++;
    // 细线：从字框边上（最靠近那个点的地方）连到轨道上那个点
    const t = grow(inner(bx), 5);
    const x0 = Math.max(t.x, Math.min(a.x, t.x + t.w)), y0 = Math.max(t.y, Math.min(a.y, t.y + t.h));
    const len = Math.hypot(a.x - x0, a.y - y0);
    if (len >= 4) {
      leadAt = { x: a.x, y: a.y, j: law.j, X: law.X };
      lead.style.width = `${len.toFixed(1)}px`;
      lead.style.transform = `translate3d(${x0.toFixed(1)}px, ${y0.toFixed(1)}px, 0) rotate(${Math.atan2(a.y - y0, a.x - x0)}rad)`;
    }
  }
  names[4].classList.toggle('away', !!lawAway);
  lead.classList.toggle('on', !!leadAt && !lawAway);
  names.forEach((a, k) => {
    const bx = boxes[k];
    if (!bx) { a.classList.remove('ok'); return; }
    a.style.transform = `translate3d(${Math.round(bx.x)}px, ${Math.round(bx.y)}px, 0)`;
    a.classList.add('ok');
  });
}

/** 天上：(x, y) 这一点落在哪样造物身上（-1 = 哪样都不是）。手指比鼠标粗，放宽一点 */
function hitTest(x: number, y: number, touch: boolean) {
  if (!g || (mode === 'sky' ? !namesOn : (g.P < NAMES.show || root.hasAttribute('data-list')))) return -1;
  const m = g.marks;
  if (!m.ok) return -1;
  const tol = touch ? 14 : 4;
  if (Math.hypot(x - m.sun.x, y - m.sun.y) <= m.sun.r + tol) return 0;
  const w = m.whale;
  if (segDist(x, y, w.ax!, w.ay!, w.bx!, w.by!) <= w.r * 1.5 + tol) return 2;
  if (Math.hypot(x - m.arm.x, y - m.arm.y) <= m.arm.r + tol) return 3;
  if (m.ring.pts && (inPoly(x, y, m.ring.pts) || polyDist(x, y, m.ring.pts, true) <= tol + 10)) return 1;
  for (const a of m.arcs) if (a.pts.length >= 4 && polyDist(x, y, a.pts, false) <= tol + 7) return 4;
  return -1;
}
function setHotK(k: number, fromSky: boolean) {
  g?.setHot(k);
  names.forEach((a, i) => a.classList.toggle('hot', i === k));
  root.toggleAttribute('data-hot', fromSky && k >= 0);
}
function updateHot() {
  if (going) return;
  let k = focusK >= 0 ? focusK : labelK;
  let fromSky = false;
  if (k < 0 && hoverXY) { k = hitTest(hoverXY[0], hoverXY[1], false); fromSky = k >= 0; }
  setHotK(namesOn || mode === 'list' ? k : -1, fromSky);
}
/** 冲进第 i 样：法典扎进细线连着的那一截轨道；退路列表里点的、那样东西这会儿不在屏幕上：不扎镜头，直接满屏它的颜色 */
function skyTarget(i: number): V3 | null {
  if (!g || !st) return null;
  if (i === 4 && leadAt) return leadAt.X;
  const t = targetFor(i + 2);
  if (!t || mode === 'sky') return t;
  const a = g.project(t);
  return a && a.front && a.x > 0 && a.x < obst.W && a.y > 0 && a.y < obst.H && (i < 4 ? g.P >= i + 1.5 : g.P >= 5.5) ? t : null;
}
function diveSky(i: number) { go(names[i].href, SECTION_HEX[i], skyTarget(i), i); }
names.forEach((a, i) => {
  a.addEventListener('click', (e) => {
    if (plain(e)) return;
    e.preventDefault();
    diveSky(i);
  });
  a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { labelK = i; updateHot(); } });
  a.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { labelK = -1; updateHot(); } });
  a.addEventListener('focus', () => { focusK = i; if (mode === 'sky') root.setAttribute('data-names-now', ''); updateHot(); });
  a.addEventListener('blur', () => { focusK = -1; updateHot(); });
});
// 点造物本身：手指（或鼠标）按下去、没怎么动、很快抬起来，就算点了一下（滑动不算）
let downAt: { x: number; y: number; t: number; id: number; sy: number } | null = null;
const onUi = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('a, button, input, select, textarea, label');
window.addEventListener('pointerdown', (e) => {
  downAt = e.button === 0 && !onUi(e.target) ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, sy: window.scrollY } : null;
}, { passive: true });
window.addEventListener('pointercancel', () => { downAt = null; }, { passive: true });
window.addEventListener('pointerup', (e) => {
  const d = downAt;
  downAt = null;
  if (!d || d.id !== e.pointerId || going) return;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12 || performance.now() - d.t > 800 || Math.abs(window.scrollY - d.sy) > 6) return;
  const k = hitTest(e.clientX, e.clientY, e.pointerType !== 'mouse');
  if (k >= 0) diveSky(k);
}, { passive: true });
window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') hoverXY = [e.clientX, e.clientY]; }, { passive: true });
document.addEventListener('mouseleave', () => { hoverXY = null; });

/** 天上那片：名字什么时候亮、什么时候收；亮着就每帧跟着造物摆 */
function frameNames(p: number) {
  if (!g) return;
  const m = g.marks;
  if (mode === 'list') { updateHot(); return; }
  const want = m.ok && !q.has('still') && (namesOn ? p >= NAMES.hide : p >= NAMES.show);
  if (want !== namesOn) {
    namesOn = want;
    root.toggleAttribute('data-names', want);
    if (!want) root.removeAttribute('data-names-now');
  }
  // 往回滑：名字跟着进度一起暗下去（造物 6.52 以下才开始飞回去，名字先走）
  skyNav.style.opacity = p >= NAMES.show ? '' : String(Math.max(0, Math.min(1, (p - (NAMES.hide - 0.12)) / 0.12)));
  if (m.ok && p >= NAMES.hide - 0.25) placeNames(m);
  updateHot();
}
function pulseNames() {
  names.forEach((a) => { a.classList.remove('pulse'); void a.offsetWidth; a.classList.add('pulse'); });
  setTimeout(() => names.forEach((a) => a.classList.remove('pulse')), 1700);
}

// ———————————— 「目录」：快进到「开天」那片天 ————————————
let wantIndex = false;
function cancelFF() {
  if (!ffing) return;
  ffing = false;
  root.removeAttribute('data-ff');
  g?.land();
}
// —— 退路 B：「目录」压暗、五个名字竖着一列 ——
function openList(byKey: boolean) {
  root.setAttribute('data-list', '');
  indexBtn?.setAttribute('aria-expanded', 'true');
  if (byKey) names[0]?.focus({ preventScroll: true });
}
function closeList() {
  if (!root.hasAttribute('data-list')) return;
  root.removeAttribute('data-list');
  indexBtn?.setAttribute('aria-expanded', 'false');
}
skyNav.addEventListener('click', (e) => { if (mode === 'list' && e.target === skyNav) closeList(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeList(); });
window.addEventListener('wheel', () => closeList(), { passive: true });

function toIndex(byKey = false) {
  if (going) return;
  if (mode === 'list') { if (root.hasAttribute('data-list')) closeList(); else openList(byKey); return; }
  if (!g) {
    if (root.dataset.gl === 'no') window.scrollTo(0, Math.ceil(scrollYFor(7)));   // 没有 WebGL：滚到结尾那张静态图和那一排名字
    else wantIndex = true;                                                          // 3D 还在路上：起来了马上走
    return;
  }
  const p = g.P;
  if (7 - p < 0.03) { pulseNames(); return; }                  // 已经在天上：不动地方，五个名字轻轻亮一下
  if (reduced || freezeP != null) { window.scrollTo(0, Math.ceil(scrollYFor(7))); return; }   // 减少动效：直接到结尾
  const dist = 7 - p;
  const ms = Math.min(INDEX.maxMs + 200, Math.max(INDEX.minMs, INDEX.maxMs * Math.sqrt(dist / 6)));
  ffing = true;
  root.setAttribute('data-ff', '');
  g.fly(7, ms);
}
indexBtn?.addEventListener('click', (e) => toIndex(e.detail === 0));
indexBtn?.setAttribute('aria-expanded', 'false');
// 快进途中用户一动（滑、点、滚轮、按键）：马上把手还给他
for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) window.addEventListener(ev, () => cancelFF(), { passive: true, capture: true });

// —— 刻度、键盘：Tab 到哪一幕的「进去」，页面跟着滚到那一幕 ——
ticks.forEach((b) => b.addEventListener('click', () => scrollToAct(Number(b.dataset.tick))));
acts.forEach((el) => el.addEventListener('focusin', (e) => {
  if (mode === 'list' && (e.target as Element).closest?.('[data-sky]')) return;   // 退路 B 的列表：就地挑，不滚
  const k = Number(el.dataset.act);
  const p = g ? g.P : scrollP();
  if (Math.abs(p - restP(k)) > 0.3) scrollToAct(k, false);
}));
hero.addEventListener('focusin', () => { if (window.scrollY > 4) window.scrollTo({ top: 0 }); });

// —— 声音开关 ——
document.addEventListener('zero:sound', (e) => sound.setOn(Boolean((e as CustomEvent).detail)));
sound.armOnGesture();

function frameText(p: number) {
  textFor(p);
  soundFor(p);
}

// —— 没有 WebGL：每幕一张静态图，字和链接照常 ——
function fallback() {
  root.setAttribute('data-gl', 'no');
  const pick = () => {
    const p = freezeP ?? scrollP();
    const k = Math.max(0, Math.min(6, p < 1.3 ? 0 : Math.round(p) - 1));
    const src = (innerWidth / innerHeight < 0.8 ? stills.p : stills.l)[k];
    if (src && still.getAttribute('src') !== src) still.src = src;
    P = Math.max(1, p);
    frameText(P);
  };
  pick();
  window.addEventListener('scroll', pick, { passive: true });
  window.addEventListener('resize', pick);
  if (wantIndex) { wantIndex = false; toIndex(); }
}
function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

async function boot() {
  if (q.has('nogl') || !hasWebGL2()) { fallback(); return; }
  let mod: typeof import('../scene/genesis');
  try { mod = await import('../scene/genesis'); } catch { fallback(); return; }
  try {
    g = mod.createGenesis({
      host, reduced, seen, freezeP, freezeT, startP: backP, tier: tierQ, nMoons,
      onLost: () => { g?.canvas.remove(); g = null; fallback(); },
    });
  } catch (e) { console.warn(e); fallback(); return; }
  root.setAttribute('data-gl', 'yes');
  // 从栏目页按「后退」回来：滚动位置摆回去，名字不用一个个再亮一遍
  if (backP != null) {
    window.scrollTo(0, Math.ceil(scrollYFor(backP)));
    root.setAttribute('data-names-now', '');
  }
  const relayout = () => { markEnd(); measureNames(); decideMode(); };
  relayout();
  window.addEventListener('resize', relayout);
  document.fonts?.ready.then(relayout).catch(() => { /* 字体没载到也照样 */ });
  document.addEventListener('zero:lang', relayout);
  g.onHitstop = () => setTimeout(() => sound.blast(), HITSTOP_MS);
  g.onFrame = (s, p) => {
    st = s;
    P = p;
    if (p >= 1 && !seen) { seen = true; try { sessionStorage.setItem('zero.opener', '1'); } catch { /* 无痕 */ } }
    // 「目录」快进途中：滚动位置跟着进度走（快进完正好停在结尾，往上滑照样倒放）
    if (ffing && g) {
      const y = scrollYFor(p);
      window.scrollTo(0, g.flying ? Math.round(y) : Math.ceil(y));
      if (!g.flying) { ffing = false; root.removeAttribute('data-ff'); }
    }
    frameText(p);
    frameNames(p);
  };
  const feed = () => g?.setTarget(scrollP());
  feed();
  window.addEventListener('scroll', feed, { passive: true });
  window.addEventListener('resize', feed);
  // 开场的时候点一下、按个键、滚一下：快进
  const hurry = () => { if (!ffing) g?.fastForward(); };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(ev, hurry, { passive: true });
  // 鼠标动一动，镜头跟着有一点点视差
  window.addEventListener('pointermove', (e) => {
    if (!g || e.pointerType === 'touch') return;
    g.setParallax((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
  }, { passive: true });
  document.addEventListener('mouseleave', () => { g?.setParallax(0, 0); });
  // iPhone：画布跟着可见视口对齐（带灵动岛的机型，滑动以后视口会往上窜）
  const vv = window.visualViewport;
  if (vv) {
    const align = () => {
      const dy = vv.scale > 1.01 ? 0 : Math.round(vv.offsetTop);
      const tf = dy ? `translateY(${dy}px)` : '';
      stage.style.transform = tf;
      uiLayer.style.transform = tf;
    };
    vv.addEventListener('resize', align);
    vv.addEventListener('scroll', align);
  }
  if (wantIndex) { wantIndex = false; toIndex(); }
  // 截图、验收、调试用
  (window as unknown as { __zero: unknown }).__zero = {
    frames: () => g?.frames ?? 0,
    dpr: () => g?.dpr ?? 0,
    tier: () => g?.tier ?? '',
    P: () => g?.P ?? P,
    state: () => g?.state,
    tick: () => tickFor(g?.P ?? P),
    flying: () => !!g?.flying,
    names: () => ({ mode, on: namesOn, boxes: boxes.map((b) => (b ? { ...b } : null)), dirs: [...dirs], lead: leadAt, collide, obst }),
    marks: () => g?.marks,
    project: (p: V3) => g?.project(p),
    orbitPoint: (j: number, u: number) => g?.orbitPoint(j, u),
    go: (k: number) => document.querySelector<HTMLAnchorElement>(`[data-go="${Math.max(2, k)}"]`)?.click(),
    hold: (k: number, s: number) => {
      const target = k <= 1 && g ? g.clusterPoint(0) : k >= 7 ? skyTarget(k - 7) : targetFor(k);
      if (!g || !target) return;
      root.setAttribute('data-diving', '');
      flood.style.background = SECTION_HEX[k >= 7 ? k - 7 : Math.max(0, k - 2)];
      void g.enter(target, DIVE_MS, (x) => { flood.style.opacity = String(ss(0.5, 0.96, x)); }, s);
    },
  };
}
void boot();
