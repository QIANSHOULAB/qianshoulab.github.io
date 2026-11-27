// 首页的手：滚动 → 进度、字跟着画面走、右边七个刻度、第三幕小月的名字、第四幕标本签、首屏五条铭文和引线、
// 声音、「进去」、没有 WebGL 时的静态图。画面本身在 ../scene/genesis.ts（three.js 跟它一起异步加载）。
import * as sound from './sound';
import { SCROLL, DIVE_MS, HITSTOP_MS, SECTION_HEX, type Tier } from '../scene/tune';
import { scrollToP, pToScroll, qRot, ss, cl, type State, type V3 } from '../scene/timeline';
import type { Genesis } from '../scene/genesis';

const root = document.documentElement;
const stage = document.querySelector<HTMLElement>('[data-stage]')!;
const host = document.querySelector<HTMLElement>('[data-gl-host]')!;
const uiLayer = document.querySelector<HTMLElement>('[data-ui]')!;
const flood = document.querySelector<HTMLElement>('[data-flood]')!;
const opener = document.querySelector<HTMLElement>('[data-opener]')!;
const hero = document.querySelector<HTMLElement>('[data-hero]')!;
const acts = [...document.querySelectorAll<HTMLElement>('.act[data-act]')];
const entries = [...document.querySelectorAll<HTMLAnchorElement>('.entry')];
const leaders = [...document.querySelectorAll<SVGLineElement>('[data-leaders] .ld')];
const ticks = [...document.querySelectorAll<HTMLButtonElement>('[data-tick]')];
const moonTag = document.querySelector<HTMLAnchorElement>('[data-moon-tag]')!;
const moonName = document.querySelector<HTMLElement>('[data-mt-nm]')!;
const specTag = document.querySelector<HTMLElement>('[data-spec-tag]')!;
const still = document.querySelector<HTMLImageElement>('.still')!;
const moonsData: { href: string; en: string; zh: string }[] = JSON.parse(moonTag.dataset.moons || '[]');
const stills: { l: string[]; p: string[] } = JSON.parse(still.dataset.stills || '{"l":[],"p":[]}');

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
const lang = () => (root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en');

// —— 字：开着的才亮，换了才动 DOM ——
const on = (el: Element, v: boolean) => { if (el.classList.contains('on') !== v) el.classList.toggle('on', v); };
function textFor(p: number) {
  const a = (k: number) => cl(p - (k - 1));
  on(opener, p < 1 && p > 0.02 && p < 0.5);
  on(hero, p >= 0.86 && p < 1.1);
  root.toggleAttribute('data-opening', p < 0.86);
  root.toggleAttribute('data-scrolled', p > 1.1);
  for (const el of acts) {
    const k = Number(el.dataset.act);
    const ak = a(k);
    if (k === 7) {
      el.classList.toggle('coded', ak > 0.66);
      on(el, ak > 0.78);
      continue;
    }
    on(el.querySelector('.code')!, ak > 0.004 && ak < 0.42);
    on(el, ak > 0.52 && ak < 0.975);
  }
  const cur = p < 1.12 ? 1 : Math.min(7, Math.floor(p - 0.12) + 2);
  ticks.forEach((b) => on(b, Number(b.dataset.tick) === cur));
}

// —— 首屏：五条铭文的引线 ——
let hoverK = -1;
function setHover(k: number) {
  hoverK = k;
  entries.forEach((e, i) => on(e, i === k));
  leaders.forEach((l, i) => on(l, i === k));
  g?.setHover(k);
}
function drawLeaders() {
  if (!g || !hero.classList.contains('on')) return;
  entries.forEach((e, i) => {
    const t = e.querySelector('.tick')!.getBoundingClientRect();
    const c = g!.project(g!.clusterPoint(i));
    const l = leaders[i];
    l.setAttribute('x1', String(t.left + t.width / 2));
    l.setAttribute('y1', String(t.top - 4));
    l.setAttribute('x2', String(c.x));
    l.setAttribute('y2', String(c.y));
  });
}

// —— 第三幕的小月、第四幕的标本签 ——
let moonShown = -1;
function placeTags(s: State, p: number) {
  if (!g) return;
  let best = -1, hi = 0;
  s.moons.forEach((m, i) => { if (m.hi > hi) { hi = m.hi; best = i; } });
  const showMoon = best >= 0 && hi > 0.45 && p > 2.4 && p < 2.98 && best < moonsData.length;
  on(moonTag, showMoon);
  moonTag.tabIndex = showMoon ? 0 : -1;
  if (showMoon) {
    const sp = g.project(s.moons[best].p);
    const x = Math.max(8, Math.min(sp.x + 18, g.size.w - 230));
    moonTag.style.transform = `translate(${x}px, ${sp.y - 16}px)`;
    if (moonShown !== best || moonTag.dataset.l !== lang()) {
      moonShown = best;
      moonTag.dataset.l = lang();
      moonName.textContent = moonsData[best][lang()];
      moonTag.href = moonsData[best].href;
    }
  }
  const showSpec = s.whale.stars > 0.6 && p < 4.25;
  on(specTag, showSpec);
  if (showSpec) {
    const sp = g.project(s.whale.c);
    const w = g.size.w;
    const x = w < 600 ? 22 : Math.min(sp.x + 0.18 * w, w - 250);
    const y = w < 600 ? sp.y + 64 : sp.y - 24;
    specTag.style.transform = `translate(${x}px, ${y}px)`;
  }
}
function fillStats() {
  const el = document.querySelector<HTMLElement>('[data-spec-stats]');
  if (!el) return;
  const n = (3200).toLocaleString(lang() === 'zh' ? 'zh-CN' : 'en-US');
  el.textContent = (el.dataset[lang()] || '').replace('{n}', n);
}
fillStats();
document.addEventListener('zero:lang', () => { fillStats(); moonShown = -1; });

// —— 声音：门动一下响一声；第五幕炸开；进去 ——
let lastP = P;
function soundFor(p: number) {
  sound.setLevel(p);
  for (const m of [1.03, 2.03, 3.03, 4.03, 5.03, 6.36]) if ((lastP < m && p >= m) || (lastP > m && p <= m)) sound.thud();
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
    return s.moons.length ? s.moons[best].p : s.ring.c;
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
entries.forEach((a, i) => {
  a.addEventListener('pointerenter', () => setHover(i));
  a.addEventListener('pointerleave', () => setHover(-1));
  a.addEventListener('focus', () => setHover(i));
  a.addEventListener('blur', () => setHover(-1));
  a.addEventListener('click', (e) => {
    if (plain(e)) return;
    e.preventDefault();
    const p = g ? g.clusterPoint(i) : null;
    go(a.href, SECTION_HEX[i], p ? [p[0], p[1], p[2] + 2] : null);
  });
});
document.querySelectorAll<HTMLAnchorElement>('[data-go]').forEach((a) => {
  a.addEventListener('click', (e) => {
    if (plain(e)) return;
    e.preventDefault();
    const k = Number(a.dataset.go);
    go(a.href, SECTION_HEX[k - 2], targetFor(k));
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

function frameText(s: State | null, p: number) {
  textFor(p);
  if (s) placeTags(s, p);
  drawLeaders();
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
    frameText(null, P);
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
      host, reduced, seen, freezeP, freezeT, tier: tierQ, nMoons: moonsData.length,
      onLost: () => { g?.canvas.remove(); g = null; fallback(); },
    });
  } catch (e) { console.warn(e); fallback(); return; }
  root.setAttribute('data-gl', 'yes');
  g.onHitstop = () => setTimeout(() => sound.blast(), HITSTOP_MS);
  g.onFrame = (s, p) => {
    st = s;
    P = p;
    if (p >= 1 && !seen) { seen = true; try { sessionStorage.setItem('zero.opener', '1'); } catch { /* 无痕 */ } }
    frameText(s, p);
  };
  const feed = () => g?.setTarget(scrollP());
  feed();
  window.addEventListener('scroll', feed, { passive: true });
  window.addEventListener('resize', feed);
  // 开场的时候点一下、按个键、滚一下：快进
  const hurry = () => g?.fastForward();
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(ev, hurry, { passive: true });
  // 首屏：指着门上那撮
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
    entries[k]?.click();
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
  document.addEventListener('zero:lang', () => drawLeaders());
  // 截图、调试用
  (window as unknown as { __zero: unknown }).__zero = {
    frames: () => g?.frames ?? 0,
    dpr: () => g?.dpr ?? 0,
    tier: () => g?.tier ?? '',
    P: () => g?.P ?? P,
    state: () => g?.state,
    go: (k: number) => (k <= 1 ? entries[0]?.click() : document.querySelector<HTMLAnchorElement>(`[data-go="${k}"]`)?.click()),
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
