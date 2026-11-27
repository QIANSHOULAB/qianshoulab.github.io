// 首页的手：滚动 → 进度 P（平滑过的滚动位置的纯函数）、开场十秒、每幕的字（先打代码、造完再写名字）、右边七个刻度、
// 五条铭文（指上去门上那撮亮成它的颜色，点了直接进栏目）、每幕的「进去」、小月的名字、标本签、声音、没有 WebGL 时的静态图。
// 画面在 ../genesis/scene.ts，跟 three.js 一起异步加载；黑底和 wordmark 先出来。
import * as snd from './sound';
import type { Genesis } from '../genesis/scene';
import type { Tier } from '../genesis/config';
import { FF_MS, INTRO_MS, SECTION_HEX, SMOOTH, ACT_HEX, NAME_AT } from '../genesis/config';
import { clamp, easeInOut, horizonAt, pOfScroll, scrollOfP, seg, sstep, tanHalfAt, camDist } from '../genesis/timeline';

const root = document.documentElement;
const gx = document.querySelector<HTMLElement>('[data-gx]')!;
const stage = document.querySelector<HTMLElement>('[data-stage]')!;
const host = document.querySelector<HTMLElement>('[data-gl-host]')!;
const hero = document.querySelector<HTMLElement>('[data-hero]')!;
const intro = document.querySelector<HTMLElement>('[data-intro]')!;
const actIns = Array.from(document.querySelectorAll<HTMLElement>('[data-act-in]'));
const fin = document.querySelector<HTMLElement>('[data-fin]')!;
const ticksNav = document.querySelector<HTMLElement>('[data-ticks]')!;
const ticks = Array.from(document.querySelectorAll<HTMLButtonElement>('.tk'));
const bar = document.querySelector<HTMLElement>('[data-bar]')!;
const entries = Array.from(document.querySelectorAll<HTMLAnchorElement>('.entry'));
const goLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-go]'));
const moons = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-moon]'));
const spec = document.querySelector<HTMLElement>('[data-spec]')!;
const flood = document.querySelector<HTMLElement>('[data-flood]')!;
const still = document.querySelector<HTMLImageElement>('.still')!;

const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let freeze: number | null = params.has('act') ? clamp(parseFloat(params.get('act') || '1') || 0, 0, 7) : null;
if (params.has('still')) root.dataset.still = '';
let seen = false;
try { seen = sessionStorage.getItem('zero.genesis') === '1'; } catch { /* 无痕 */ }

// —— 一屏多高：手机地址栏收放（高度变一点点）不跟着变，转屏或者变超过 120 像素才重新量 ——
let vh = window.innerHeight, vw = window.innerWidth;
function setVh() { root.style.setProperty('--vh', `${(vh / 100).toFixed(3)}px`); }
setVh();
window.addEventListener('resize', () => {
  if (window.innerWidth !== vw || Math.abs(window.innerHeight - vh) > 120) { vw = window.innerWidth; vh = window.innerHeight; setVh(); }
});
// iPhone（带灵动岛的）滑动以后视口会往上窜：画布跟着 visualViewport 实时对齐
const vv = window.visualViewport;
if (vv) {
  const align = () => { const y = Math.round(vv.offsetTop); stage.style.transform = y ? `translate3d(0, ${y}px, 0)` : ''; };
  vv.addEventListener('resize', align);
  vv.addEventListener('scroll', align);
}

// —— 写 CSS 变量：值变了才写，省得每帧都让浏览器重排 ——
const memo = new WeakMap<HTMLElement, Record<string, string>>();
function setv(el: HTMLElement, name: string, v: number | string) {
  const s = typeof v === 'number' ? (Math.round(v * 1000) / 1000).toString() : v;
  let m = memo.get(el);
  if (!m) { m = {}; memo.set(el, m); }
  if (m[name] === s) return;
  m[name] = s;
  el.style.setProperty(name, s);
}

// —— 开场：十秒，自己放；同一次访问再回来 1.5 秒快进到位；开场时碰一下（点、滑、按键）也快进 ——
let t0 = -1;
let ff: { from: number; t0: number } | null = null;
let piNow = 0;
function introP(now: number) {
  if (reduced) return 1;
  if (t0 < 0) { t0 = now; if (seen) ff = { from: 0, t0: now }; }
  let p = clamp((now - t0) / INTRO_MS);
  if (ff) p = Math.max(p, ff.from + (1 - ff.from) * easeInOut((now - ff.t0) / FF_MS));
  return p;
}
function hurry() { if (!ff && piNow < 1 && !reduced) ff = { from: piNow, t0: performance.now() }; }
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => window.addEventListener(t, hurry, { passive: true, capture: true }));

// —— 滚动 → P ——
let sSmooth = window.scrollY / vh;
let P = 0, last = -1;
const portraitNow = () => stage.clientWidth / Math.max(1, stage.clientHeight) < 1;
function currentAct(p: number) { return Math.max(1, Math.min(7, Math.ceil(p - 0.02))); }

let scene: Genesis | null = null;
let going = false;
let markedSeen = seen;

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = last < 0 ? 1 / 60 : clamp((now - last) / 1000, 0, 0.25);
  last = now;
  const sTarget = window.scrollY / vh;
  sSmooth += (sTarget - sSmooth) * (1 - Math.exp(-dt * SMOOTH));
  if (Math.abs(sTarget - sSmooth) < 1e-4) sSmooth = sTarget;
  const Ps = pOfScroll(sSmooth);
  const Pi = introP(now);
  piNow = Pi;
  if (Pi >= 1 && !markedSeen) { markedSeen = true; try { sessionStorage.setItem('zero.genesis', '1'); } catch { /* 无痕 */ } }
  let p = Pi + Math.max(0, Ps - 1) * sstep(0.85, 1, Pi);
  // 减少动效：不跟手指做过渡，每幕直接摆到位
  if (reduced) p = Ps < 1.25 ? 1 : Math.min(7, Math.ceil(Ps - 0.25));
  let sEff = sSmooth;
  if (freeze != null) { p = freeze; sEff = scrollOfP(p); }
  P = p;
  if (scene) scene.frame(P, now);
  updateDom(P, sEff, Pi);
  snd.update(P, dt);
}

// —— 每帧的字 ——
let lastStill = -1;
function updateDom(p: number, s: number, pi: number) {
  const portrait = portraitNow();
  const hz = scene ? scene.horizon : horizonAt(p, portrait);
  const tanHalf = scene ? scene.tanHalf : tanHalfAt(p, stage.clientWidth / Math.max(1, stage.clientHeight), hz);
  setv(gx, '--hz', hz);
  // 门顶以上那块天：wordmark 和那句话放在这里（跟画面同一把尺子）
  const gateFrac = 240 / (2 * camDist(Math.max(1, p)) * tanHalf);
  setv(hero, '--title-h', Math.max(18, (1 - hz - gateFrac) * 100));

  // Ⅰ 首屏
  const heroIn = p < 1 ? sstep(0.78, 0.98, p) : 1;
  const heroOut = 1 - sstep(0.02, 0.2, freeze != null ? (p > 1 ? 1 : 0) : s);
  const ho = heroIn * heroOut;
  setv(hero, '--hero', ho);
  setv(hero, '--hero-v', ho > 0.002 ? 'visible' : 'hidden');
  // 开场那两行代码
  setv(intro, "--intro-o", p < 1 ? sstep(0, 0.02, p) * (1 - sstep(0.34, 0.46, p)) : 0);
  setv(intro, '--c1', seg(p, 0.02, 0.12));
  setv(intro, '--c2', seg(p, 0.13, 0.19));

  // Ⅱ–Ⅵ：先打出一行代码；造完了名字才一个字一个字写出来；下一幕一开头就退下
  actIns.forEach((el, i) => {
    const k = i + 2, u = p - (k - 1);
    const o = sstep(0.04, 0.07, u) * (1 - sstep(1.0, 1.05, u));
    setv(el, '--o', o);
    setv(el, '--v', o > 0.002 ? 'visible' : 'hidden');
    setv(el, '--cw', seg(u, 0.06, 0.18));
    setv(el, '--caret', u > 0.05 && u < 0.32 ? 1 : 0);
    const na = NAME_AT[k];
    setv(el, '--w', seg(u, na, Math.min(0.97, na + 0.18)));
    const go = sstep(Math.min(0.9, na + 0.12), Math.min(0.97, na + 0.2), u);
    setv(el, '--go', go);
    setv(el, '--go-pe', go > 0.5 && o > 0.5 ? 'auto' : 'none');
  });
  // Ⅶ 收工
  const u7 = p - 6;
  const fo = sstep(0.04, 0.08, u7);
  setv(fin, '--fo', fo);
  setv(fin, '--fv', fo > 0.002 ? 'visible' : 'hidden');
  setv(fin, '--fc', seg(u7, 0.06, 0.1));
  setv(fin, '--fw', seg(u7, 0.86, 0.95));
  const fm = sstep(0.93, 1, u7);
  setv(fin, '--fm', fm);
  setv(fin, '--fpe', fm > 0.5 ? 'auto' : 'none');

  // 右边七个刻度
  const cur = currentAct(p);
  setv(ticksNav, '--ticks', sstep(0.85, 1, Math.max(pi, freeze != null ? 1 : 0)));
  setv(bar, '--ticks', sstep(0.85, 1, Math.max(pi, freeze != null ? 1 : 0)));
  setv(bar, '--prog', clamp((p - 1) / 6));
  ticks.forEach((b, i) => b.classList.toggle('on', i + 1 === cur));

  // 小月的名字、标本签：跟着画面里的那样东西走
  const tags = scene ? (scene as unknown as { tags?: () => { moons: { x: number; y: number; o: number }[]; spec: { x: number; y: number; o: number } } }).tags?.() : null;
  moons.forEach((m, j) => {
    const t = tags?.moons[j];
    const o = t ? t.o : 0;
    setv(m, '--mo', o);
    setv(m, '--mpe', o > 0.6 ? 'auto' : 'none');
    if (t && o > 0) { setv(m, '--mx', `${Math.round(t.x)}px`); setv(m, '--my', `${Math.round(t.y)}px`); }
  });
  const sp = tags?.spec;
  setv(spec, '--so', sp ? sp.o : 0);
  if (sp && sp.o > 0) { setv(spec, '--sx', `${Math.round(sp.x)}px`); setv(spec, '--sy', `${Math.round(sp.y)}px`); }

  // 没有 WebGL：七幕各一张静态图
  if (root.dataset.gl === 'no') {
    const k = Math.max(1, Math.min(7, Math.round(p)));
    if (k !== lastStill) {
      lastStill = k;
      const set = JSON.parse(still.dataset.stills || '{"land":[],"port":[]}') as { land: string[]; port: string[] };
      const list = portrait ? set.port : set.land;
      if (list[k - 1]) still.src = list[k - 1];
    }
  }
}

// —— 五条铭文：指上去门上那撮亮成它的颜色；点了直接进栏目 ——
entries.forEach((el, k) => {
  const on = () => { scene?.setHover(k); el.classList.add('on'); snd.thud(0.4); };
  const off = () => { scene?.setHover(-1); el.classList.remove('on'); };
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') on(); });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') off(); });
  el.addEventListener('focus', on);
  el.addEventListener('blur', off);
  el.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    leave(el.href, SECTION_HEX[k], k, 'gate');
  });
});

// —— 每幕的「进去」：镜头扎进那样造物本身，满屏变成它的颜色，再落到栏目页 ——
goLinks.forEach((a) => {
  const k = Number(a.dataset.go);
  a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    leave(a.href, SECTION_HEX[k - 2], k, 'creation');
  });
  // 键盘：Tab 到这一幕的「进去」，页面跟着滚到这一幕
  a.addEventListener('focus', () => { if (currentAct(P) !== k) jump(k, false); });
});
moons.forEach((m) => m.addEventListener('focus', () => { if (currentAct(P) !== 3) jump(3, false); }));
fin.querySelectorAll('a').forEach((a) => a.addEventListener('focus', () => { if (currentAct(P) !== 7) jump(7, false); }));
entries.forEach((a) => a.addEventListener('focus', () => { if (P > 1.2) jump(1, false); }));

function jump(k: number, smooth = true) {
  const y = Math.round(scrollOfP(k) * vh);
  window.scrollTo({ top: y, behavior: smooth && !reduced ? 'smooth' : 'auto' });
}
ticks.forEach((b) => b.addEventListener('click', () => jump(Number(b.dataset.k))));

function leave(href: string, hex: string, k: number, kind: 'gate' | 'creation') {
  if (going) return;
  try { sessionStorage.setItem('zero.arrive', hex); } catch { /* 无痕 */ }
  snd.swell();
  const go = () => location.assign(href);
  const sc = scene as unknown as { enter?: (kind: string, k: number, onP: (s: number) => void) => Promise<void> } | null;
  flood.style.setProperty('--flood', hex);
  if (!sc?.enter || reduced) {
    flood.style.transition = 'opacity .36s linear';
    flood.style.opacity = '1';
    setTimeout(go, 380);
    return;
  }
  going = true;
  gx.classList.add('entering');
  sc.enter(kind, k, (s) => { flood.style.opacity = String(sstep(0.7, 1, s)); }).then(() => { flood.style.opacity = '1'; setTimeout(go, 40); });
}
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  going = false;
  gx.classList.remove('entering');
  flood.style.transition = '';
  flood.style.opacity = '0';
  (scene as unknown as { reset?: () => void } | null)?.reset?.();
});

// —— 声音 ——
document.addEventListener('zero:sound', (e) => snd.setOn(Boolean((e as CustomEvent).detail)));
snd.armOnGesture();

// —— 没有 WebGL：七幕各一张静态图，字和链接原样，照样能滑、能点 ——
function fallback(why: string) {
  root.dataset.gl = 'no';
  lastStill = -1;
  if (why) console.info('零肉身造物：换成静态图（' + why + '）');
}
function hasGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}
/** 先按设备猜一档：独显、新 Mac、插着电的掌机 → 高；核显、手机 → 中；软件渲染、老机器 → 低 */
function guessTier(): Tier {
  const q = params.get('tier');
  if (q === 'high' || q === 'mid' || q === 'low') return q;
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    gpu = String((ext && gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl?.getParameter(gl.RENDERER) || '');
  } catch { /* 拿不到就按中档 */ }
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render|softpipe/.test(g)) return 'low';
  const phone = Math.min(screen.width, screen.height) < 600 || matchMedia('(pointer: coarse)').matches;
  if (phone) return 'mid';
  if (/nvidia|geforce|rtx|gtx|radeon|amd|apple m\d|apple gpu/.test(g)) return 'high';
  if (/intel|iris|uhd|adreno|mali/.test(g)) return 'mid';
  return 'mid';
}

async function boot() {
  if (!hasGL2()) { fallback('这台浏览器没有 WebGL 2'); return; }
  try {
    const { createGenesis } = await import('../genesis/scene');
    scene = createGenesis({ stage: host, reduced, tier: guessTier(), fixedTier: params.has('tier') || navigator.webdriver });
  } catch (err) {
    fallback(String(err));
    return;
  }
  root.dataset.gl = 'yes';
  const canvas = scene.canvas as HTMLCanvasElement;
  // 切到后台再回来，3D 丢了就自动重建；重建不了换静态图
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    const dead = scene;
    scene = null;
    setTimeout(() => {
      try { dead?.dispose(); canvas.remove(); } catch { /* 已经坏了 */ }
      if (!hasGL2()) { fallback('WebGL 上下文丢了'); return; }
      boot();
    }, 300);
  });
}

// 给截图、验收留的口子（只读状态 + 把进度定在某一刻）
(window as unknown as { __zero: unknown }).__zero = {
  p: () => P,
  frames: () => scene?.frames ?? 0,
  gl: () => root.dataset.gl || '',
  tier: () => scene?.tier ?? '',
  dpr: () => scene?.dpr ?? 0,
  setP: (x: number | null) => { freeze = x; },
  act: () => currentAct(P),
};

root.style.setProperty('--act-col', ACT_HEX[0]);
boot();
requestAnimationFrame(frame);
