// 首页的手：滚动 → 进度、停手以后自己走到展示位置（./glide.ts）、字（星尘字放进 3D，页面里的真字跟着它摆）、右边七个刻度、声音、「进去」、
// 天上的名字、「目录」、没有 WebGL 时的静态图。画面本身在 ../scene/genesis.ts（three.js 跟它一起异步加载）。
// v3.1：画面上只留名字——首屏 wordmark + 往下滑的小提示，第二到第六幕栏目名 + 「进去」。
// v3.2（Song 11-28 选的 C 星空目录）：顶栏正中「目录」快进到「开天」那片天；五个名字挂在天上五样造物旁边，点名字或造物本身就冲进去；
//   从栏目页按「后退」回到离开时那片天。
// v3.3（Song 11-28）：
//   - 10:11「每一个板块点了主动走完到到展示的位置」：停手以后页面自己走到一幕的展示位置；刻度、「目录」、天上的名字、Tab、键盘都一路走到底（glide.ts）。
//     点了「进去」一口气扎进去，中途滑、点、滚轮都不打断；从栏目页后退回来，直接就在离开时那一幕的展示位置。
//   - 10:31 选的 A 星尘字：字也是造出来的（../scene/stardust.ts、words.ts）。页面里的文字和链接照旧在 DOM 里（读屏、Tab、搜索、翻译开关都靠它），
//     只是看不见；画面上看到的是 3D 的那份，这里每帧把真字摆到 3D 那份在屏幕上的位置，两份对得上、点的位置也对得上。
import * as sound from './sound';
import { SCROLL, DIVE_MS, HITSTOP_MS, SECTION_HEX, NAMES, REST_PS, restP, DUST, type Tier } from '../scene/tune';
import { scrollToP, pToScroll, qRot, ss, type State, type V3 } from '../scene/timeline';
import type { Genesis, Marks } from '../scene/genesis';
import type { ItemDef } from '../scene/stardust';
import { COL } from '../scene/timeline';
import { createGlide, type GlideKind } from './glide';

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
const cards = new Map<number, { card: HTMLElement; h: HTMLElement; go: HTMLElement }>();
for (const el of acts) {
  const k = Number(el.dataset.act);
  const card = el.querySelector<HTMLElement>('.card'), h = el.querySelector<HTMLElement>('.act-name'), go = el.querySelector<HTMLElement>('.go');
  if (card && h && go) cards.set(k, { card, h, go });
}

const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) && Number.isFinite(parseFloat(q.get(k)!)) ? parseFloat(q.get(k)!) : null);
const freezeP = num('act');
const freezeT = num('t');
const tierQ = q.get('tier') as Tier | null;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (q.has('still')) root.setAttribute('data-still', '');
let seen = false;
try { seen = sessionStorage.getItem('zero.opener') === '1'; } catch { /* 无痕 */ }
const lang = () => (root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en') as 'en' | 'zh';

// —— 从栏目页按「后退」回来：直接就在离开时那一幕的展示位置（从天上进去的回到天上），不放开场、不演、不走 ——
const BACK_KEY = 'zero.back';
let backP: number | null = null;
try {
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  const isBack = nav ? nav.type === 'back_forward' : (performance as unknown as { navigation?: { type: number } }).navigation?.type === 2;
  const raw = sessionStorage.getItem(BACK_KEY);
  sessionStorage.removeItem(BACK_KEY);
  if (raw && isBack && freezeP == null) {
    const v = JSON.parse(raw) as { P?: number };
    if (typeof v.P === 'number' && v.P > 1.02) backP = nearestRest(v.P);
  }
} catch { /* 存不了就照常从头放 */ }
function nearestRest(p: number) { let b: number = REST_PS[0]; for (const r of REST_PS) if (Math.abs(r - p) < Math.abs(b - p)) b = r; return b; }

// —— 滚动 → 进度 ——
const vh = () => Math.max(1, stage.clientHeight);
const scrollP = () => scrollToP(window.scrollY / vh(), SCROLL.hold, SCROLL.acts);
const scrollYFor = (p: number) => pToScroll(p, SCROLL.hold, SCROLL.acts) * vh();

let g: Genesis | null = null;
let P = freezeP ?? backP ?? (reduced ? 1 : 0);
let st: State | null = null;
let going = false;

// —— 停手以后自己走（glide）——
/** 一口气走过好几幕（目录、跨幕的刻度）：路过的幕名不冒出来，门的闷响不一路响 */
let ffing = false;
const glide = createGlide({
  stage, reduced,
  driver: () => g,
  P: () => (g ? g.P : scrollP()),
  blocked: () => going || freezeP != null,
  onChange: (gl) => {
    ffing = !!gl?.pass;
    root.toggleAttribute('data-ff', gl?.kind === 'index');
    const k = gl ? REST_PS.indexOf(gl.to as (typeof REST_PS)[number]) + 1 : -1;
    g?.words.setPass(ffing, k);
    textFor(g ? P : scrollP());   // 起步、落定都马上更新一下字（没有 3D 的时候没有每帧的回调）
  },
});
const goTo = (p: number, kind: GlideKind) => { if (!going) glide.to(p, kind); };

// —— 字：开着的才亮，换了才动 DOM ——
const on = (el: Element, v: boolean) => { if (el.classList.contains('on') !== v) el.classList.toggle('on', v); };
/** 现在亮第几个刻度：跟展示位置那张表对得上（第 k 幕从它的展示位置往前 0.12 起算） */
export function tickFor(p: number) { return p < 1.12 ? 1 : Math.min(7, Math.floor(p - 0.12) + 1); }
let dustOn = false;   // 3D 的星尘字搭好了（页面里的真字只留着给读屏、Tab、搜索）
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
    // 有星尘字：名字聚得差不多了，「进去」才露出来、点得着；没有 3D：照 v3.2 的规矩
    if (dustOn && g) on(el, !ffing && g.words.f(`a${k}`) > 0.8);
    else on(el, !ffing && ak > 0.52 && ak < 0.975);
  }
  const cur = tickFor(p);
  ticks.forEach((b) => on(b, Number(b.dataset.tick) === cur));
}

// —— 第七幕：那句话那块天要留暗。告诉画面它在屏幕上哪（量的是排好版的位置，没亮也量得到）——
function markEnd() {
  if (!g) return;
  const r = mottoEl.getBoundingClientRect();
  const W = Math.max(1, innerWidth), H = Math.max(1, vh());
  g.setTextBox((r.left + r.right) / 2 / W, (r.top + r.bottom) / 2 / H, r.width / W, r.height / H);
}

// —— 声音：门动一下响一声；第五幕炸开；第七幕石头升天（只加这一声）；进去。一口气快进时不一路响，只留石头升天那一声 ——
let lastP = P;
function soundFor(p: number) {
  sound.setLevel(p);
  if (!ffing) for (const m of [1.03, 2.03, 3.03, 4.03, 5.03, 6.05]) if ((lastP < m && p >= m) || (lastP > m && p <= m)) sound.thud();
  if (lastP < 6.2 && p >= 6.2) sound.rise();
  lastP = p;
}

// —— 进去：镜头扎进那样造物本身，满屏变成它的颜色，再落到栏目页。一口气：中途滑、点、滚轮都不打断，镜头不乱动 ——
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
/** 记下回来时该在的展示位置（离开时那一幕的；从天上进去的回到天上） */
let backTo: number | null = null;
function saveBack(p?: number) {
  const v = p ?? backTo ?? nearestRest(g ? g.P : P);
  try { sessionStorage.setItem(BACK_KEY, JSON.stringify({ P: v })); } catch { /* 存不了就算了 */ }
}
// 往里扎的时候：滚轮、手指滑、翻页键都拦下来（只在这时候挂着，平时不挡滚动）
const blockEv = (e: Event) => { if (going) e.preventDefault(); };
const blockKey = (e: KeyboardEvent) => { if (going && [' ', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key)) e.preventDefault(); };
function lockDive(onIt: boolean) {
  const f = onIt ? window.addEventListener : window.removeEventListener;
  f.call(window, 'wheel', blockEv as EventListener, { passive: false } as AddEventListenerOptions);
  f.call(window, 'touchmove', blockEv as EventListener, { passive: false } as AddEventListenerOptions);
  f.call(window, 'keydown', blockKey as EventListener, { capture: true } as AddEventListenerOptions);
}
async function go(href: string, color: string, target: V3 | null, hotK = -1, rest?: number) {
  if (going) return;
  going = true;
  glide.stop();
  lockDive(true);
  backTo = rest ?? nearestRest(g ? g.P : P);
  saveBack(backTo);
  g?.drive(g.P);                    // 进度定住：镜头只管往里扎，不跟着滚动乱动
  g?.words.setDiving(true);
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
  flood.style.opacity = '1';   // 栏目页来得慢：就停在满屏颜色上等，不露出半截画面
  location.href = href;
}
window.addEventListener('pagehide', () => saveBack());
// 按「后退」回来、页面是从缓存里整页拿回来的：颜色、镜头、名字都复位，直接摆在离开时那一幕的展示位置
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  const rest = backTo ?? nearestRest(g ? g.P : P);
  going = false;
  lockDive(false);
  flood.style.opacity = '0';
  flood.style.transition = '';
  root.removeAttribute('data-diving');
  names.forEach((a) => a.classList.remove('hot'));
  labelK = -1; focusK = -1;
  g?.setHot(-1);
  glide.stop();
  g?.reset();
  glide.setScroll(Math.ceil(scrollYFor(rest)));
  g?.jump(rest);
  g?.words.setDiving(false);
  g?.words.snap();
  if (rest >= 7) root.setAttribute('data-names-now', '');
});
const plain = (e: MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
document.querySelectorAll<HTMLAnchorElement>('[data-go]').forEach((a) => {
  a.addEventListener('click', (e) => {
    if (plain(e)) return;
    e.preventDefault();
    const k = Number(a.dataset.go);
    go(a.href, SECTION_HEX[k - 2], targetFor(k), -1, restP(k));
  });
});
// 兜底那一排（没有 WebGL 时才看得见）：照样先满屏它的颜色再进
document.querySelectorAll<HTMLAnchorElement>('[data-end-go]').forEach((a) => {
  a.addEventListener('click', (e) => {
    if (plain(e)) return;
    e.preventDefault();
    const i = Number(a.dataset.endGo);
    go(a.href, SECTION_HEX[i], targetFor(i + 2), -1, 7);
  });
});

// ———————————— 天上的五个名字（目录）————————————
// 0 日 · 千手院｜1 环 · 赛博杂货铺｜2 鲸 · 标本｜3 器 · 文物｜4 轨道 · 法典（跟 ENTRIES、SECTION_HEX 一个顺序）
// 版面两种：sky = 名字挂在天上（电脑、平板、细长的手机）；list = 退路 B（Song 点过头的）：矮的手机竖屏、手机横着，天上挂不下五个名字——
//   点「目录」画面压暗，五个名字竖着一列，点哪个直接进；天上不挂名字，结尾照旧露着那一排五个名字。
// v3.3：名字贴着它自己那样东西（碎块从哪来、字就在哪）：候选位置都从那样东西在屏幕上的外沿出发；
//   点的判定放宽：点在名字刚才 0.3 秒内待过的地方也算点中（巨鲸在游，名字跟着走）。
let mode: 'sky' | 'list' = 'sky';
let namesOn = false;
let focusK = -1, labelK = -1;
let hoverXY: [number, number] | null = null;
const PAD_X = 12, PAD_Y = 14;                     // .nm 的内边距：点得到的范围大，字本身小
let sizes: { w: number; h: number }[] = [];
let obst = { W: 1, H: 1, top: 56, ticks: null as Box | null, motto: null as Box | null, foot: null as Box | null };
interface Box { x: number; y: number; w: number; h: number }
const boxes: (Box | null)[] = [null, null, null, null, null];
const picks: (string | null)[] = [null, null, null, null, null];   // 上一帧挑的那个候选（不来回跳）
/** 每个名字刚才 0.3 秒内待过的框：点在那儿也算点中 */
const trail: { t: number; b: Box }[][] = [[], [], [], [], []];
const TRAIL_MS = 300;
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
const inBox = (x: number, y: number, b: Box) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
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
  // ?list 当退路 B、?sky 硬挂在天上（截「打架」的图用）
  const m = q.has('sky') ? 'sky' : (phonePortrait && !tall) || shortLandscape || q.has('list') ? 'list' : 'sky';
  if (m !== mode) {
    mode = m;
    root.toggleAttribute('data-bmode', m === 'list');
    closeList();
    if (m === 'list') { namesOn = false; root.removeAttribute('data-names'); names.forEach((a) => { a.style.transform = ''; a.classList.remove('ok'); }); }
  }
}
/** 造物在屏幕上的「身子」：中心、横竖半径 */
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
/** 贴着造物外沿的候选落点：(ax, ay) 外沿上一点（再往外 gap），(nx, ny) 往外的方向 */
interface Cand { id: string; ax: number; ay: number; nx: number; ny: number; pref: number }
function outline(m: Marks, k: number, tall: string): Cand[] {
  const out: Cand[] = [];
  // 往哪边放先试（越小越先）：右、右下、下、左下、左、左上、上、右上
  const PREFS: Record<string, number[][]> = {
    wide: [[0, 2, 4, 6, 3, 5, 9, 1], [4, 2, 0, 3, 6, 9, 9, 5], [3, 1, 0, 2, 5, 7, 9, 6], [0, 2, 5, 7, 4, 6, 8, 1], []],
    tab: [[0, 2, 4, 6, 3, 5, 9, 1], [4, 1, 0, 2, 5, 7, 9, 6], [3, 1, 0, 2, 5, 7, 4, 6], [0, 2, 5, 7, 4, 6, 3, 1], []],
    tall: [[0, 2, 4, 6, 3, 5, 9, 1], [6, 4, 3, 2, 0, 1, 5, 7], [3, 1, 0, 2, 5, 7, 4, 6], [0, 2, 5, 7, 4, 6, 3, 1], []],
  };
  const PREF = PREFS[tall]?.[k] ?? [];
  const dirPref = (nx: number, ny: number) => {
    const a = Math.atan2(ny, nx);
    const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;   // 0 右 1 右下 2 下 3 左下 4 左 5 左上 6 上 7 右上
    return (PREF[i] ?? 5) * 5;
  };
  if (k === 0 || k === 3) {
    const b = k === 0 ? m.sun : m.arm;
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2, nx = Math.cos(t), ny = Math.sin(t);
      out.push({ id: `c${i}`, ax: b.x + nx * b.r, ay: b.y + ny * b.r, nx, ny, pref: dirPref(nx, ny) });
    }
  } else if (k === 1) {
    const p = m.ring.pts ?? [];
    const n = p.length / 2;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += p[i * 2]; cy += p[i * 2 + 1]; }
    cx /= Math.max(1, n); cy /= Math.max(1, n);
    for (let i = 0; i < n; i++) {
      let nx = p[i * 2] - cx, ny = p[i * 2 + 1] - cy;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      out.push({ id: `r${i}`, ax: p[i * 2] + nx * 6, ay: p[i * 2 + 1] + ny * 6, nx, ny, pref: dirPref(nx, ny) });
    }
  } else if (k === 2) {
    const w = m.whale;
    const ax = w.ax!, ay = w.ay!, bx = w.bx!, by = w.by!;
    let tx = bx - ax, ty = by - ay;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const px = -ty, py = tx;
    for (let i = 0; i <= 6; i++) {
      const u = i / 6, x = ax + (bx - ax) * u, y = ay + (by - ay) * u;
      for (const sgn of [1, -1]) {
        const nx = px * sgn, ny = py * sgn;
        out.push({ id: `w${i}${sgn}`, ax: x + nx * w.r * 1.05, ay: y + ny * w.r * 1.05, nx, ny, pref: dirPref(nx, ny) });
      }
    }
    out.push({ id: 'wh', ax: ax - tx * w.r, ay: ay - ty * w.r, nx: -tx, ny: -ty, pref: dirPref(-tx, -ty) + 10 });
    out.push({ id: 'wt', ax: bx + tx * w.r, ay: by + ty * w.r, nx: tx, ny: ty, pref: dirPref(tx, ty) + 10 });
  }
  return out;
}
function candidate(c: Cand, w: number, h: number, gap = 7): Box {
  const ax = c.ax + c.nx * gap, ay = c.ay + c.ny * gap;
  const iw = w - 2 * PAD_X, ih = h - 2 * PAD_Y;
  const ix = c.nx > 0.38 ? ax : c.nx < -0.38 ? ax - iw : ax - iw / 2;
  const iy = c.ny > 0.38 ? ay : c.ny < -0.38 ? ay - ih : ay - ih / 2;
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
  // 别压着别的造物（压一点点还行）；也别压着自己
  for (let j = 0; j < 4; j++) {
    const b = bodyOf(m, j);
    if (j === k) { if (j === 0 || j === 3) c += 300 * boxCircle(t, b.cx, b.cy, Math.min(b.rx, b.ry) * 0.92); continue; }
    c += 80 * boxCircle(t, b.cx, b.cy, Math.min(b.rx, b.ry) * 0.9);
  }
  if (k === 1 && m.ring.pts) { const p = m.ring.pts; for (let i = 0; i < p.length; i += 2) if (inBox(p[i], p[i + 1], grow(t, 2))) c += 40; }
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
const DIR: Record<string, [number, number]> = { E: [1, 0], SE: [0.72, 0.72], S: [0, 1], SW: [-0.72, 0.72], W: [-1, 0], NW: [-0.72, -0.72], N: [0, -1], NE: [0.72, -0.72] };
const lawBox = (dir: string, x: number, y: number, w: number, h: number) => { const [nx, ny] = DIR[dir]; return candidate({ id: dir, ax: x, ay: y, nx, ny, pref: 0 }, w, h, LEAD * 0.9); };
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
        const bx = lawBox(dir, x, y, w, h);
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
    const { w, h } = sizes[k] ?? { w: 0, h: 0 };
    if (!w) continue;
    const cands = outline(m, k, tall);
    let pick: Box | null = null, pickC = 1e9, pickId: string | null = null;
    for (const cd of cands) {
      const bx = candidate(cd, w, h);
      const c = badness(bx, k, m) + cd.pref;
      if (c < pickC) { pickC = c; pick = bx; pickId = cd.id; }
    }
    // 上一帧挑的那个还够好就不换（不来回跳）：明显更好（省 25 分以上）才挪
    const prev = picks[k] ? cands.find((c) => c.id === picks[k]) : null;
    if (prev && prev.id !== pickId) {
      const bx = candidate(prev, w, h);
      const c = badness(bx, k, m) + prev.pref;
      if (c < 500 && c < pickC + 25) { pick = bx; pickC = c; pickId = prev.id; }
    }
    const pk = pick as Box | null;
    if (pk) pick = { ...pk, x: Math.max(0, Math.min(pk.x, obst.W - pk.w)) };
    boxes[k] = pick; picks[k] = pickId;
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
      const bad = !a.front || u > draw - 0.025 || badness(lawBox(law.dir, a.x, a.y, w, h), 4, m) >= 500;
      if (bad && !lawAway) lawAway = now;
    }
    if (!law || (lawAway && now - lawAway > 380)) { law = chooseLaw(m, w, h); lawAway = 0; }
  }
  leadAt = null;
  boxes[4] = null;
  if (law && w) {
    const a = g!.project(law.X)!;
    const b0 = lawBox(law.dir, a.x, a.y, w, h);
    const bx = { ...b0, x: Math.max(0, Math.min(b0.x, obst.W - b0.w)) };
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
    // 记下这 0.3 秒里名字待过的地方
    const tr = trail[k];
    tr.push({ t: now, b: { ...bx } });
    while (tr.length && now - tr[0].t > TRAIL_MS) tr.shift();
  });
}

/** 天上：(x, y) 这一点落在哪样造物身上、或者哪个名字刚才 0.3 秒内待过的地方（-1 = 哪样都不是）。手指比鼠标粗，放宽一点 */
function hitTest(x: number, y: number, touch: boolean) {
  if (!g || (mode === 'sky' ? !namesOn : (g.P < NAMES.show || root.hasAttribute('data-list')))) return -1;
  if (mode === 'sky') {
    const now = performance.now();
    for (let k = 0; k < 5; k++) for (const e of trail[k]) if (now - e.t <= TRAIL_MS && inBox(x, y, e.b)) return k;
  }
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
function diveSky(i: number) { go(names[i].href, SECTION_HEX[i], skyTarget(i), i, mode === 'sky' || (g?.P ?? 0) > 6.9 ? 7 : undefined); }
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
// 点造物本身（或者名字刚才待过的地方）：手指（或鼠标）按下去、没怎么动、很快抬起来，就算点了一下（滑动不算）
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

/** 天上那片：名字什么时候亮、什么时候收；亮着就每帧跟着造物摆（3D 的星尘字按这些框放进去） */
function frameNames(p: number) {
  if (!g) return;
  const m = g.marks;
  if (mode === 'list') {
    updateHot();
    g.words.setSky([null, null, null, null, null], false);
    g.words.setList(listRows(), root.hasAttribute('data-list'));
    g.stardust.setVeil(root.hasAttribute('data-list') && dustOn ? 0.8 * listVeil() : 0);
    return;
  }
  g.words.setList(null, false);
  g.stardust.setVeil(0);
  if (going) return;   // 正在往里扎：名字跟着整层字一起淡掉，位置不用再摆
  const want = m.ok && !q.has('still') && (namesOn ? p >= NAMES.hide : p >= NAMES.show);
  if (want !== namesOn) {
    namesOn = want;
    root.toggleAttribute('data-names', want);
    if (!want) root.removeAttribute('data-names-now');
  }
  // 往回滑：名字跟着进度一起暗下去（造物 6.52 以下才开始飞回去，名字先走）
  skyNav.style.opacity = p >= NAMES.show ? '' : String(Math.max(0, Math.min(1, (p - (NAMES.hide - 0.12)) / 0.12)));
  if (m.ok && p >= NAMES.hide - 0.25) placeNames(m);
  g.words.setSky(boxes.map((b) => (b ? inner(b) : null)), m.ok && p >= NAMES.hide - 0.25);
  updateHot();
}
let veilT0 = 0;
function listVeil() { return reduced ? 1 : Math.min(1, (performance.now() - veilT0) / 300); }
function listRows(): (Box | null)[] {
  const ur = uiLayer.getBoundingClientRect();
  return names.map((a) => {
    const r = a.getBoundingClientRect();
    if (!r.width) return null;
    return { x: r.left - ur.left + PAD_X * 2, y: r.top - ur.top + PAD_Y, w: r.width - PAD_X * 4, h: r.height - PAD_Y * 2 };
  });
}
function pulseNames() {
  names.forEach((a) => { a.classList.remove('pulse'); void a.offsetWidth; a.classList.add('pulse'); });
  setTimeout(() => names.forEach((a) => a.classList.remove('pulse')), 1700);
}

// ———————————— 「目录」：一路走到「开天」那片天（v3.2 的快进，现在是 glide 的一种走法）————————————
let wantIndex = false;
let namesMs = 0;   // 每帧摆天上名字花多少毫秒（滑动平均，验收看）
// —— 退路 B：「目录」压暗、五个名字竖着一列 ——
function openList(byKey: boolean) {
  root.setAttribute('data-list', '');
  indexBtn?.setAttribute('aria-expanded', 'true');
  veilT0 = performance.now();
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
  if (!g && root.dataset.gl !== 'no') { wantIndex = true; return; }   // 3D 还在路上：起来了马上走
  const p = g ? g.P : scrollP();
  if (7 - p < 0.03 && !glide.gliding) { pulseNames(); return; }      // 已经在天上：不动地方，五个名字轻轻亮一下
  if (freezeP != null) return;
  goTo(7, 'index');
  textFor(p);   // 首屏的 wordmark、这一幕的「进去」马上收起来（不等下一帧）
}
indexBtn?.addEventListener('click', (e) => toIndex(e.detail === 0));
indexBtn?.setAttribute('aria-expanded', 'false');

// —— 刻度、键盘、Tab：都走到展示位置 ——
ticks.forEach((b) => b.addEventListener('click', () => goTo(restP(Number(b.dataset.tick)), 'tick')));
acts.forEach((el) => el.addEventListener('focusin', (e) => {
  if (mode === 'list' && (e.target as Element).closest?.('[data-sky]')) return;   // 退路 B 的列表：就地挑，不滚
  const k = Number(el.dataset.act);
  const p = g ? g.P : scrollP();
  const to = restP(k);
  if (Math.abs(p - to) > 0.02 && !(glide.gliding && glide.target === to)) goTo(to, 'focus');
}));
hero.addEventListener('focusin', () => { if (window.scrollY > 4) goTo(1, 'focus'); });
// ↓、空格、PageDown：下一个展示位置；↑、PageUp：上一个；Home、End：首屏、开天
document.addEventListener('keydown', (e) => {
  if (going || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || freezeP != null) return;
  const t = e.target as Element | null;
  if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  let dir = 0, to: number | null = null;
  switch (e.key) {
    case 'ArrowDown': case 'PageDown': dir = 1; break;
    case 'ArrowUp': case 'PageUp': dir = -1; break;
    case ' ': case 'Spacebar': if (t?.closest?.('button, summary')) return; dir = e.shiftKey ? -1 : 1; break;
    case 'Home': to = 1; break;
    case 'End': to = 7; break;
    default: return;
  }
  if (mode === 'list' && root.hasAttribute('data-list')) return;
  e.preventDefault();
  if (to == null) to = glide.nextFrom(dir);
  if (to != null) goTo(to, 'key');
});

// —— 声音开关 ——
document.addEventListener('zero:sound', (e) => sound.setOn(Boolean((e as CustomEvent).detail)));
sound.armOnGesture();

function frameText(p: number) {
  textFor(p);
  soundFor(p);
}

// ———————————— 星尘字：3D 那份在屏幕上哪，页面里的真字就摆到哪 ————————————
const nmText = (el: Element | null | undefined, l: 'en' | 'zh') => (el?.querySelector(`[data-l="${l}"]`)?.textContent ?? '').trim();
const pxOf = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) || 16 : 16);
const hexLin = [COL.sun, COL.ring, COL.life, COL.fire, COL.law];
function textDefs(): ItemDef[] {
  const defs: ItemDef[] = [];
  const wmEnA = document.querySelector('.wm-a[data-l="en"]'), wmZhA = document.querySelector('.wm-a[data-l="zh"]');
  const wmEnB = document.querySelector('.wm-b[data-l="en"]'), wmZhB = document.querySelector('.wm-b[data-l="zh"]');
  const t = (el: Element | null) => (el?.textContent ?? '').trim();
  defs.push({ id: 'wmA', lines: { en: [t(wmEnA)], zh: [t(wmZhA)] }, ls: { en: 0.46, zh: 0.72 }, lh: 1, scale: { en: 1, zh: pxOf(wmZhA) / pxOf(wmEnA) }, src: -1, count: 0, glow: [1, 1, 1], hot: false, emit: 0 });
  defs.push({ id: 'wmB', lines: { en: [t(wmEnB)], zh: [t(wmZhB)] }, ls: { en: 1.1, zh: 0.5 }, lh: 1, scale: { en: 1, zh: pxOf(wmZhB) / pxOf(wmEnB) }, src: -1, count: 0, glow: [1, 1, 1], hot: false, emit: 0 });
  for (let k = 2; k <= 6; k++) {
    const nm = names[k - 2];
    defs.push({ id: `a${k}`, lines: { en: [nmText(nm, 'en')], zh: [nmText(nm, 'zh')] }, ls: { en: 0.28, zh: 0.48 }, lh: 1, src: k - 2, count: DUST.actN, glow: hexLin[k - 2], hot: k === 2 || k === 5, emit: k === 6 ? 1.1 : k === 3 ? 0.55 : 0.4 });
  }
  for (let j = 0; j < 5; j++) {
    const nm = names[j];
    defs.push({ id: `s${j}`, lines: { en: [nmText(nm, 'en')], zh: [nmText(nm, 'zh')] }, ls: { en: 0.26, zh: 0.42 }, lh: 1, scale: { en: 1, zh: skyPx('zh') / skyPx('en') }, src: j, count: DUST.skyN, glow: hexLin[j], hot: j === 0 || j === 3, emit: j === 4 ? 1.1 : j === 1 ? 0.55 : 0.4 });
  }
  const halves = (l: 'en' | 'zh') => [...mottoEl.querySelectorAll(`[data-l="${l}"] .mh`)].map((e) => (e.textContent ?? '').trim()).filter(Boolean);
  defs.push({ id: 'motto', lines: { en: halves('en'), zh: halves('zh') }, ls: { en: 0.06, zh: 0.2 }, lh: 1.5, scale: { en: 1, zh: mottoPx('zh') / mottoPx('en') }, src: 5, count: 2600, glow: [1, 1, 1], hot: false, emit: 0 });
  return defs;
}
/** 天上名字、那句话的字号（照 CSS 的；中英可能不一样） */
function skyPx(l: 'en' | 'zh') {
  const was = root.getAttribute('data-lang');
  if (was !== l) root.setAttribute('data-lang', l);
  const v = pxOf(names[0]);
  if (was !== l) root.setAttribute('data-lang', was!);
  return v;
}
function mottoPx(l: 'en' | 'zh') {
  const was = root.getAttribute('data-lang');
  if (was !== l) root.setAttribute('data-lang', l);
  const v = pxOf(mottoEl);
  if (was !== l) root.setAttribute('data-lang', was!);
  return v;
}
/** 版面变了（转屏、改窗口、换语言、字体载好）：告诉 3D 那份页面上该在哪、多大、避开什么 */
function relayoutText() {
  if (!g || !dustOn) return;
  const ur = uiLayer.getBoundingClientRect();
  const rel = (el: Element | null): Box | null => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left - ur.left, y: r.top - ur.top, w: r.width, h: r.height } : null; };
  const l = lang();
  // wordmark 的位置照英文那份量（中文那份按字号比例放在同一个正中）
  const was = root.getAttribute('data-lang');
  root.setAttribute('data-lang', 'en');
  const hd = hero.style.cssText;
  const a = rel(document.querySelector('.wm-a[data-l="en"]')), b = rel(document.querySelector('.wm-b[data-l="en"]'));
  const motto = rel(mottoEl);
  const pa = pxOf(document.querySelector('.wm-a[data-l="en"]')), pb = pxOf(document.querySelector('.wm-b[data-l="en"]'));
  const mp = mottoPx('en'), sp = skyPx('en');
  root.setAttribute('data-lang', was ?? l);
  hero.style.cssText = hd;
  const hdr = document.querySelector('.hd-row');
  const W = obst.W, H = obst.H;
  const phone = W < 600 && W < H;
  g.words.setObstacles({ top: hdr ? hdr.getBoundingClientRect().bottom - ur.top + 4 : 64, ticks: rel(ticksNav), bottom: phone ? 108 : 36 });
  g.words.setFixed({ wm: a && b ? { a, b } : null, wmPx: { a: pa, b: pb }, motto: motto ? { box: motto, lines: 2 } : null, mottoPx: mp, skyPx: sp, listPx: 19 });
  // 天上名字、退路列表：点得到的框照 3D 那份字的大小（字本身看不见）
  names.forEach((nm, j) => {
    const it = g!.stardust.items.get(`s${j}`);
    if (!it?.lay.en || !it.lay.zh) return;
    const lay = it.lay[l]!;
    nm.style.setProperty('--tw', `${(lay.w * sp).toFixed(1)}px`);
    nm.style.setProperty('--th', `${Math.max(lay.h * sp, 12).toFixed(1)}px`);
  });
  measureNames();
}
const cardAt = new Map<number, number[]>();
/** 每帧：页面里的真字（看不见）摆到 3D 那份在屏幕上的位置；「进去」跟在名字下面 */
function syncText() {
  if (!g || !dustOn) return;
  const l = lang();
  for (const [k, c] of cards) {
    if (k > 6) continue;
    const f = g.words.f(`a${k}`);
    if (f < 0.01) continue;
    const b = g.words.screenBox(`a${k}`, g.camera, l);
    if (!b) continue;
    // 整像素、动了一个像素以上才挪（镜头那一点点漂移不让「进去」一直抖）
    const prev = cardAt.get(k);
    const x = Math.round(b.x), y = Math.round(b.y), w = Math.round(b.w), h = Math.round(b.h);
    if (prev && Math.abs(prev[0] - x) < 1.5 && Math.abs(prev[1] - y) < 1.5 && Math.abs(prev[2] - w) < 1.5 && Math.abs(prev[3] - h) < 1.5) continue;
    cardAt.set(k, [x, y, w, h]);
    c.card.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    c.h.style.width = `${w}px`;
    c.h.style.height = `${h}px`;
  }
}
/** 字体载好：搭 3D 的星尘字（载不到也不等太久：用系统的细黑顶上） */
async function startText() {
  if (!g || q.has('still')) return;
  try {
    const fonts = document.fonts;
    const wait = fonts ? Promise.all([fonts.load('200 88px "Zero Display"', 'AZaz'), fonts.load('200 88px "Zero Hei SC"', '零造物')]) : Promise.resolve();
    await Promise.race([wait, new Promise((r) => setTimeout(r, 4000))]);
    await g.buildText(textDefs());
    dustOn = true;
    root.setAttribute('data-dust', 'yes');
    g.words.setLang(lang(), false);
    if (backP != null) g.words.snap();
    relayoutText();
    relayoutText();
  } catch (e) {
    console.warn(e);
    root.setAttribute('data-dust', 'no');
    g?.setTextOn(false);
  }
}

// —— 没有 WebGL：每幕一张静态图，字和链接照常（新字体的普通文字）——
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
  glide.detach();
  if (backP != null) glide.setScroll(Math.ceil(scrollYFor(backP)));
  if (wantIndex) { wantIndex = false; toIndex(); }
  // 截图、验收用（没有 3D 的时候只有滚动这一份）
  (window as unknown as { __zero: unknown }).__zero = {
    frames: () => 0, P: () => scrollP(), tick: () => tickFor(scrollP()), rest: () => [...REST_PS],
    flying: () => glide.gliding, gliding: () => ({ on: glide.gliding, kind: glide.kind, to: glide.target, pass: glide.pass }),
    glide: () => glide.debug(), ffHold: (onIt: boolean, at?: number) => glide.hold(onIt, at), ffHeld: () => glide.held,
    to: (p: number, kind: GlideKind = 'tick') => goTo(p, kind),
    dust: () => ({ on: false }), names: () => ({ mode, on: false, boxes: [] }),
  };
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
      onLost: () => { g?.canvas.remove(); g = null; glide.detach(); fallback(); },
    });
  } catch (e) { console.warn(e); fallback(); return; }
  root.setAttribute('data-gl', 'yes');
  glide.attach();
  g.onPreFrame = (now) => glide.tick(now);
  // 从栏目页按「后退」回来：滚动位置摆回那一幕的展示位置，名字不用一个个再亮一遍
  if (backP != null) {
    glide.setScroll(Math.ceil(scrollYFor(backP)));
    if (backP >= 7) root.setAttribute('data-names-now', '');
  }
  const relayout = () => { markEnd(); measureNames(); decideMode(); relayoutText(); };
  relayout();
  window.addEventListener('resize', relayout);
  document.fonts?.ready.then(relayout).catch(() => { /* 字体没载到也照样 */ });
  document.addEventListener('zero:lang', () => { g?.words.setLang(lang(), true); relayout(); });
  g.onHitstop = () => setTimeout(() => sound.blast(), HITSTOP_MS);
  g.onPlace = (s, p) => {
    st = s;
    const n0 = performance.now();
    frameNames(p);
    namesMs += (performance.now() - n0 - namesMs) * 0.05;
  };
  g.onFrame = (s, p) => {
    st = s;
    P = p;
    if (p >= 1 && !seen) { seen = true; try { sessionStorage.setItem('zero.opener', '1'); } catch { /* 无痕 */ } }
    frameText(p);
    syncText();
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
  void startText();
  // 截图、验收、调试用
  (window as unknown as { __zero: unknown }).__zero = {
    frames: () => g?.frames ?? 0,
    dpr: () => g?.dpr ?? 0,
    textDpr: () => g?.textDpr ?? 0,
    tier: () => g?.tier ?? '',
    P: () => g?.P ?? P,
    state: () => g?.state,
    tick: () => tickFor(g?.P ?? P),
    rest: () => [...REST_PS],
    flying: () => glide.gliding,
    gliding: () => ({ on: glide.gliding, kind: glide.kind, to: glide.target, pass: glide.pass }),
    glide: () => glide.debug(),
    ffHold: (onIt: boolean, at?: number) => glide.hold(onIt, at),
    ffHeld: () => glide.held,
    to: (p: number, kind: GlideKind = 'tick') => goTo(p, kind),
    cost: () => ({ measure: g?.measureMs ?? 0, names: namesMs, words: g?.wordsMs ?? 0 }),
    names: () => ({ mode, on: namesOn, boxes: boxes.map((b) => (b ? { ...b } : null)), dirs: [...picks], lead: leadAt, collide, obst }),
    dust: () => ({
      on: dustOn, rt: g?.rt ?? false, lang: g?.words.lang ?? 0,
      f: Object.fromEntries(['wmA', 'wmB', 'a2', 'a3', 'a4', 'a5', 'a6', 'motto', 's0', 's1', 's2', 's3', 's4'].map((id) => [id, +(g?.words.f(id) ?? 0).toFixed(3)])),
      boxes: Object.fromEntries(['wmA', 'wmB', 'a2', 'a3', 'a4', 'a5', 'a6', 'motto', 's0', 's1', 's2', 's3', 's4'].map((id) => [id, g ? g.words.screenBox(id, g.camera, lang()) : null])),
      glyphs: g?.stardust.atlas.glyphs.size ?? 0,
      place: g?.words.debug(),
      atlas: g ? [g.stardust.atlas.W, g.stardust.atlas.H] : null,
    }),
    marks: () => g?.marks,
    project: (p: V3) => g?.project(p),
    orbitPoint: (j: number, u: number) => g?.orbitPoint(j, u),
    go: (k: number) => document.querySelector<HTMLAnchorElement>(`[data-go="${Math.max(2, k)}"]`)?.click(),
    hold: (k: number, s: number) => {
      const target = k <= 1 && g ? g.clusterPoint(0) : k >= 7 ? skyTarget(k - 7) : targetFor(k);
      if (!g || !target) return;
      root.setAttribute('data-diving', '');
      g.words.setDiving(true);
      flood.style.background = SECTION_HEX[k >= 7 ? k - 7 : Math.max(0, k - 2)];
      void g.enter(target, DIVE_MS, (x) => { flood.style.opacity = String(ss(0.5, 0.96, x)); }, s);
    },
  };
}
void boot();
