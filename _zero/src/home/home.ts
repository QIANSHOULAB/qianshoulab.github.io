// 首页的手：滚动 → 进度、字跟着画面走、右边七个刻度、声音、「进去」、没有 WebGL 时的静态图。
// 画面本身在 ../scene/genesis.ts（three.js 跟它一起异步加载）。
// v3.1：画面上只留名字——首屏 wordmark + 往下滑的小提示，第二到第六幕栏目名 + 「进去」，第七幕那句话 + 五个栏目名 + 页脚。
import * as sound from './sound';
import { SCROLL, DIVE_MS, HITSTOP_MS, SECTION_HEX, type Tier } from '../scene/tune';
import { scrollToP, pToScroll, qRot, ss, type State, type V3 } from '../scene/timeline';
import type { Genesis } from '../scene/genesis';

const root = document.documentElement;
const stage = document.querySelector<HTMLElement>('[data-stage]')!;
const host = document.querySelector<HTMLElement>('[data-gl-host]')!;
const uiLayer = document.querySelector<HTMLElement>('[data-ui]')!;
const flood = document.querySelector<HTMLElement>('[data-flood]')!;
const hero = document.querySelector<HTMLElement>('[data-hero]')!;
const acts = [...document.querySelectorAll<HTMLElement>('.act[data-act]')];
const ticks = [...document.querySelectorAll<HTMLButtonElement>('[data-tick]')];
const endBox = document.querySelector<HTMLElement>('[data-end]')!;
const still = document.querySelector<HTMLImageElement>('.still')!;
const stills: { l: string[]; p: string[] } = JSON.parse(still.dataset.stills || '{"l":[],"p":[]}');
const nMoons = Number(stage.dataset.moons || 0);
// 五个栏目的网址（顺序 = 门上五撮 = 第二到第六幕）
const sectionHref = (i: number) => document.querySelector<HTMLAnchorElement>(`[data-go="${i + 2}"]`)?.href ?? '/zero/';

const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) && Number.isFinite(parseFloat(q.get(k)!)) ? parseFloat(q.get(k)!) : null);
const freezeP = num('act');
const freezeT = num('t');
const tierQ = q.get('tier') as Tier | null;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (q.has('still')) root.setAttribute('data-still', '');
let seen = false;
try { seen = sessionStorage.getItem('zero.opener') === '1'; } catch { /* 无痕 */ }

// —— 滚动 → 进度 ——
const vh = () => Math.max(1, stage.clientHeight);
const scrollP = () => scrollToP(window.scrollY / vh(), SCROLL.hold, SCROLL.acts);
const restP = (k: number) => (k <= 1 ? 1 : k === 7 ? 7 : k - 0.12);
function scrollToAct(k: number, smooth = !reduced) {
  window.scrollTo({ top: pToScroll(restP(k), SCROLL.hold, SCROLL.acts) * vh(), behavior: smooth ? 'smooth' : 'auto' });
}

let g: Genesis | null = null;
let P = freezeP ?? (reduced ? 1 : 0);
let st: State | null = null;

// —— 字：开着的才亮，换了才动 DOM ——
const on = (el: Element, v: boolean) => { if (el.classList.contains('on') !== v) el.classList.toggle('on', v); };
/** 现在亮第几个刻度：第一幕 P 0..1，第 k 幕（k ≥ 2）P k−1..k；跟「滑到哪幕」差一点点提前量，跟刻度点过去停的位置（restP）对得上 */
export function tickFor(p: number) { return p < 1.12 ? 1 : Math.min(7, Math.floor(p - 0.12) + 1); }
function textFor(p: number) {
  const a = (k: number) => Math.min(1, Math.max(0, p - (k - 1)));
  on(hero, p >= 0.86 && p < 1.1);
  root.toggleAttribute('data-opening', p < 0.86);
  root.toggleAttribute('data-scrolled', p > 1.1);
  root.toggleAttribute('data-sky', p > 6.45);
  for (const el of acts) {
    const k = Number(el.dataset.act);
    const ak = a(k);
    if (k === 7) { on(el, ak > 0.86); continue; }
    on(el, ak > 0.52 && ak < 0.975);
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

// —— 首屏：指着门上哪撮（没有字，只有那撮亮成它的颜色；点了进那个栏目）——
let hoverK = -1;
function setHover(k: number) {
  hoverK = k;
  g?.setHover(k);
}

// —— 声音：门动一下响一声；第五幕炸开；第七幕石头升天（只加这一声）；进去 ——
let lastP = P;
function soundFor(p: number) {
  sound.setLevel(p);
  for (const m of [1.03, 2.03, 3.03, 4.03, 5.03, 6.05]) if ((lastP < m && p >= m) || (lastP > m && p <= m)) sound.thud();
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
async function go(href: string, color: string, target: V3 | null) {
  if (going) return;
  going = true;
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
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  going = false;
  flood.style.opacity = '0';
  flood.style.transition = '';
  root.removeAttribute('data-diving');
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
// 第七幕那排栏目名：造物这时候散在天上，镜头扎进它自己那样造物
document.querySelectorAll<HTMLAnchorElement>('[data-end-go]').forEach((a) => {
  a.addEventListener('click', (e) => {
    if (plain(e)) return;
    e.preventDefault();
    const i = Number(a.dataset.endGo);
    go(a.href, SECTION_HEX[i], targetFor(i + 2));
  });
});

// —— 刻度、键盘：Tab 到哪一幕的「进去」，页面跟着滚到那一幕 ——
ticks.forEach((b) => b.addEventListener('click', () => scrollToAct(Number(b.dataset.tick))));
acts.forEach((el) => el.addEventListener('focusin', () => {
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
      host, reduced, seen, freezeP, freezeT, tier: tierQ, nMoons,
      onLost: () => { g?.canvas.remove(); g = null; fallback(); },
    });
  } catch (e) { console.warn(e); fallback(); return; }
  root.setAttribute('data-gl', 'yes');
  markEnd();
  window.addEventListener('resize', markEnd);
  document.fonts?.ready.then(markEnd).catch(() => { /* 字体没载到也照样 */ });
  document.addEventListener('zero:lang', markEnd);
  g.onHitstop = () => setTimeout(() => sound.blast(), HITSTOP_MS);
  g.onFrame = (s, p) => {
    st = s;
    P = p;
    if (p >= 1 && !seen) { seen = true; try { sessionStorage.setItem('zero.opener', '1'); } catch { /* 无痕 */ } }
    frameText(p);
  };
  const feed = () => g?.setTarget(scrollP());
  feed();
  window.addEventListener('scroll', feed, { passive: true });
  window.addEventListener('resize', feed);
  // 开场的时候点一下、按个键、滚一下：快进
  const hurry = () => g?.fastForward();
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(ev, hurry, { passive: true });
  // 首屏：指着门上那撮，那撮亮成它的颜色；点了进那个栏目（手机上第一下先亮，第二下才进）
  g.canvas.addEventListener('pointermove', (e) => {
    if (!g || e.pointerType === 'touch') return;
    const k = g.pick(e.clientX, e.clientY);
    if (k !== hoverK) setHover(k);
    g.canvas.style.cursor = k >= 0 ? 'pointer' : '';
    g.setParallax((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
  });
  g.canvas.addEventListener('pointerleave', () => { setHover(-1); g?.setParallax(0, 0); });
  g.canvas.addEventListener('click', (e) => {
    if (!g) return;
    const k = g.pick(e.clientX, e.clientY);
    if (k < 0) return;
    if ((e as PointerEvent).pointerType === 'touch' && hoverK !== k) { setHover(k); return; }
    const p = g.clusterPoint(k);
    go(sectionHref(k), SECTION_HEX[k], [p[0], p[1], p[2] + 2]);
  });
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
  // 截图、调试用
  (window as unknown as { __zero: unknown }).__zero = {
    frames: () => g?.frames ?? 0,
    dpr: () => g?.dpr ?? 0,
    tier: () => g?.tier ?? '',
    P: () => g?.P ?? P,
    state: () => g?.state,
    tick: () => tickFor(g?.P ?? P),
    go: (k: number) => document.querySelector<HTMLAnchorElement>(`[data-go="${Math.max(2, k)}"]`)?.click(),
    hold: (k: number, s: number) => {
      const target = k <= 1 && g ? g.clusterPoint(0) : targetFor(k);
      if (!g || !target) return;
      root.setAttribute('data-diving', '');
      flood.style.background = SECTION_HEX[Math.max(0, k - 2)];
      void g.enter(target, DIVE_MS, (x) => { flood.style.opacity = String(ss(0.5, 0.96, x)); }, s);
    },
  };
}
void boot();
