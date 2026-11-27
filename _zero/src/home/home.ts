// 首页的手：铭文、引线、一个字一个字写出来、指哪撮那撮出来、点了冲进光里、声音。
// 画面在 ../scene/monolith.ts，跟 three.js 一起异步加载；加载不了（没有 WebGL）就换成一张天亮时的静态图 + 文字链接。
import * as snd from './sound';
import type { ZeroScene } from '../scene/monolith';

const root = document.documentElement;
const stage = document.querySelector<HTMLElement>('[data-stage]')!;
const host = document.querySelector<HTMLElement>('[data-gl-host]')!;
const entries = Array.from(document.querySelectorAll<HTMLAnchorElement>('.entry'));
const caption = document.querySelector<HTMLElement>('[data-caption]')!;
const capBox = caption.parentElement as HTMLElement;
const flood = document.querySelector<HTMLElement>('[data-flood]')!;
const svg = document.querySelector<SVGSVGElement>('[data-leaders]')!;
const rest = Array.from(svg.querySelectorAll<SVGLineElement>('.ld'));
const onLine = svg.querySelector<SVGLineElement>('.ld-on')!;
const dot = svg.querySelector<SVGRectElement>('.ld-dot')!;
const grad = svg.querySelector<SVGLinearGradientElement>('#ld-fade')!;
const still = document.querySelector<HTMLImageElement>('.still')!;

const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
let seen = false;
try { seen = sessionStorage.getItem('zero.dawn') === '1'; } catch { /* 无痕 */ }
const freeze = params.has('dawn') ? clamp(parseFloat(params.get('dawn') || '1') || 0) : params.has('still') ? 1 : null;
if (params.has('still')) root.dataset.still = '';

let scene: ZeroScene | null = null;
let active = -1;
let activeFrom: 'entry' | 'gl' | 'focus' | 'tap' | null = null;
let going = false;
let lastPointer = 'mouse';
let lastDownAt = -1e9;
let drawT0 = 0;

// —— 一个字一个字写出来 ——
function write(el: HTMLElement, text: string, step: number) {
  el.textContent = '';
  const f = document.createDocumentFragment();
  Array.from(text).forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'lt';
    s.textContent = ch;
    s.style.animationDelay = `${Math.round(i * step)}ms`;
    f.appendChild(s);
  });
  el.appendChild(f);
}
const lang = () => (root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en');
function writeEntry(k: number) {
  const el = entries[k];
  el.querySelectorAll<HTMLElement>('.nm').forEach((nm) => {
    if (nm.dataset.l !== lang()) { nm.textContent = nm.dataset.text || ''; return; }
    write(nm, nm.dataset.text || '', lang() === 'zh' ? 90 : 42);
  });
  const line = el.dataset[lang() === 'zh' ? 'lineZh' : 'lineEn'] || '';
  capBox.classList.remove('out');
  write(caption, line, lang() === 'zh' ? 60 : 24);
}
function restEntry(k: number) {
  entries[k].querySelectorAll<HTMLElement>('.nm').forEach((nm) => { nm.textContent = nm.dataset.text || ''; });
}

// —— 指哪道门 ——
function setActive(k: number, from: typeof activeFrom = null) {
  if (k === active) { if (k >= 0) activeFrom = from ?? activeFrom; return; }
  const prev = active;
  active = k;
  activeFrom = k >= 0 ? from : null;
  if (prev >= 0) { entries[prev].classList.remove('on'); restEntry(prev); }
  scene?.activate(k);
  svg.classList.toggle('has-on', k >= 0);
  if (k >= 0) {
    entries[k].classList.add('on');
    writeEntry(k);
    drawT0 = performance.now();
    snd.thud();
  } else {
    capBox.classList.add('out');
  }
}
document.addEventListener('zero:lang', () => { if (active >= 0) writeEntry(active); });

// —— 进门：贴着水面冲向那道光，白光吞屏，再走 ——
function prefetch(href: string) {
  const l = document.createElement('link');
  l.rel = 'prefetch'; l.href = href;
  document.head.appendChild(l);
}
function go(k: number) {
  if (going) return;
  going = true;
  const href = entries[k].href;
  prefetch(href);
  setActive(k, activeFrom ?? 'entry');
  snd.swell();
  try { sessionStorage.setItem('zero.arrive', '1'); } catch { /* 无痕 */ }
  const leave = () => location.assign(href);
  if (!scene || reduced) {
    flood.style.transition = 'opacity .32s linear';
    flood.style.opacity = '1';
    setTimeout(leave, 340);
    return;
  }
  stage.classList.add('entering');
  scene.enter(k, (s) => { flood.style.opacity = String(sstep(0.72, 1, s)); }).then(() => {
    flood.style.opacity = '1';
    setTimeout(leave, 40);
  });
}
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  going = false;
  stage.classList.remove('entering');
  flood.style.transition = '';
  flood.style.opacity = '0';
  scene?.reset();
  setActive(-1);
});

// —— 铭文：鼠标指上去 / Tab 到它 = 那撮出来；点 / 回车 = 进门；手机第一下出来、第二下进门 ——
let leaveTimer = 0;
entries.forEach((el, k) => {
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { clearTimeout(leaveTimer); setActive(k, 'entry'); } });
  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => { if (active === k && activeFrom === 'entry' && document.activeElement !== el) setActive(-1); }, 160);
  });
  el.addEventListener('focus', () => {
    // 手机上点一下会先聚焦再 click：这时交给 click 去判断「第一下出来、第二下进门」
    if (lastPointer !== 'mouse' && performance.now() - lastDownAt < 800) return;
    setActive(k, 'focus');
  });
  el.addEventListener('blur', () => {
    setTimeout(() => {
      if (going) return;
      const f = document.activeElement;
      if (active === k && !entries.includes(f as HTMLAnchorElement) && activeFrom === 'focus') setActive(-1);
    }, 0);
  });
  el.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;     // 新标签页打开之类：交给浏览器
    if (!scene) return;                                                                    // 没有画面：直接走
    e.preventDefault();
    if (lastPointer !== 'mouse' && e.detail > 0 && active !== k) { setActive(k, 'tap'); return; }
    go(k);
  });
});
window.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; lastDownAt = performance.now(); }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active >= 0) setActive(-1); });

// —— 引线：五根细线从小桩升到碑上那撮；平时到地平线就淡没了（碑看着还是一整块），指到的那根一直连上去 ——
let anchors: { x: number; y: number }[] = [];
let hzY = 0;
function measure() {
  const sr = stage.getBoundingClientRect();
  anchors = entries.map((el) => {
    const r = (el.querySelector('.tick') as HTMLElement).getBoundingClientRect();
    return { x: r.left + r.width / 2 - sr.left, y: r.top - sr.top };
  });
  const hzf = parseFloat(getComputedStyle(stage).getPropertyValue('--hzf')) || 0.4;
  hzY = (1 - hzf) * sr.height;
  svg.setAttribute('viewBox', `0 0 ${sr.width} ${sr.height}`);
  const y0 = anchors.length ? anchors[0].y : hzY + 100;
  grad.setAttribute('y1', String(y0));
  grad.setAttribute('y2', String(hzY - 2));
}
function drawLines() {
  if (!scene || !anchors.length) return;
  for (let k = 0; k < rest.length; k++) {
    const c = scene.screenOf(k), a = anchors[k];
    rest[k].setAttribute('x1', a.x.toFixed(1)); rest[k].setAttribute('y1', a.y.toFixed(1));
    rest[k].setAttribute('x2', c.x.toFixed(1)); rest[k].setAttribute('y2', c.y.toFixed(1));
  }
  if (active >= 0) {
    const c = scene.screenOf(active), a = anchors[active];
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    const p = reduced ? 1 : sstep(0, 1, (performance.now() - drawT0) / 750);
    onLine.setAttribute('x1', a.x.toFixed(1)); onLine.setAttribute('y1', a.y.toFixed(1));
    onLine.setAttribute('x2', c.x.toFixed(1)); onLine.setAttribute('y2', c.y.toFixed(1));
    onLine.setAttribute('stroke-dasharray', `${len.toFixed(1)} ${len.toFixed(1)}`);
    onLine.setAttribute('stroke-dashoffset', (len * (1 - p)).toFixed(1));
    dot.setAttribute('x', (c.x - 3.5).toFixed(1)); dot.setAttribute('y', (c.y - 3.5).toFixed(1));
    dot.style.opacity = p > 0.98 ? '' : '0';
  }
}

// —— 碑上那几撮也能直接指、直接点 ——
function onGlMove(e: PointerEvent) {
  if (!scene || going) return;
  const r = stage.getBoundingClientRect();
  if (e.pointerType === 'mouse') {
    scene.setParallax(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    const k = scene.pick(e.clientX, e.clientY);
    (scene.canvas as HTMLCanvasElement).style.cursor = k >= 0 ? 'pointer' : '';
    if (k >= 0) setActive(k, 'gl');
    else if (activeFrom === 'gl') setActive(-1);
  }
}
let drag: { x: number; px: number } | null = null;
function onGlDown(e: PointerEvent) {
  if (e.pointerType !== 'mouse') drag = { x: e.clientX, px: 0 };
}
function onGlDrag(e: PointerEvent) {
  if (!drag || !scene || e.pointerType === 'mouse') return;
  const dx = (e.clientX - drag.x) / (stage.clientWidth * 0.5);
  scene.setParallax(clamp(dx, -1, 1), 0);
}
function onGlUp() { if (drag && scene) { scene.setParallax(0, 0); } drag = null; }
function onGlClick(e: MouseEvent) {
  if (!scene || going) return;
  const k = scene.pick(e.clientX, e.clientY);
  if (lastPointer === 'mouse') { if (k >= 0) go(k); return; }
  if (k < 0) { setActive(-1); return; }
  if (active === k) go(k); else setActive(k, 'tap');
}

// —— 碰一下（点、滑、按键）黎明就快进到天亮 ——
function hurry() { scene?.fastForward(); }
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => window.addEventListener(t, hurry, { passive: true, capture: true }));

// —— 声音 ——
document.addEventListener('zero:sound', (e) => snd.setOn(Boolean((e as CustomEvent).detail)));
snd.armOnGesture();

// —— 没有 WebGL：一张天亮时的静态图 + 文字链接 ——
function fallback(why: string) {
  root.dataset.gl = 'no';
  stage.style.setProperty('--dawn', '1');
  const portrait = stage.clientWidth / Math.max(1, stage.clientHeight) < 1;
  still.src = (portrait ? still.dataset.stillP : still.dataset.stillL) || '';
  if (why) console.info('零肉身造物：换成静态图（' + why + '）');
}
function hasGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

async function boot() {
  if (!hasGL2()) { fallback('这台浏览器没有 WebGL 2'); return; }
  try {
    const { createScene } = await import('../scene/monolith');
    scene = createScene({ stage: host, reduced, seen, freeze, fixedQuality: navigator.webdriver || params.has('hq') });
  } catch (err) {
    fallback(String(err));
    return;
  }
  root.dataset.gl = 'yes';
  const canvas = scene.canvas as HTMLCanvasElement;
  canvas.addEventListener('pointermove', onGlMove);
  canvas.addEventListener('pointerdown', onGlDown);
  canvas.addEventListener('pointermove', onGlDrag);
  window.addEventListener('pointerup', onGlUp);
  window.addEventListener('pointercancel', onGlUp);
  canvas.addEventListener('click', onGlClick);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); canvas.remove(); fallback('WebGL 上下文丢了'); scene = null; });
  canvas.addEventListener('mouseleave', () => { scene?.setParallax(0, 0); if (activeFrom === 'gl') setActive(-1); });
  let lastDawn = -1;
  let marked = seen;
  scene.onFrame = (f) => {
    const d = Math.round(sstep(0.05, 0.75, f.p) * 50) / 50;
    if (d !== lastDawn) { lastDawn = d; stage.style.setProperty('--dawn', String(d)); }
    if (f.done && !marked) { marked = true; try { sessionStorage.setItem('zero.dawn', '1'); } catch { /* 无痕 */ } }
    snd.setLevel(f.light);
    drawLines();
  };
  measure();
  new ResizeObserver(() => measure()).observe(stage);
  if (document.fonts) document.fonts.ready.then(measure);
  // 给线上验收留的口子：量帧数、点哪撮
  (window as unknown as { __zero: unknown }).__zero = {
    frames: () => scene?.frames ?? 0,
    dpr: () => scene?.dpr ?? 0,
    p: () => scene?.p ?? 0,
    activate: (k: number) => setActive(k, 'entry'),
    go,
    // 验收截图：冲向第 k 撮的那道光，停在半路（不跳转）
    hold: (k: number, s = 0.55) => {
      setActive(k, 'entry');
      stage.classList.add('entering');
      scene?.enter(k, (x) => { flood.style.opacity = String(sstep(0.72, 1, x)); }, s);
    },
  };
}
if (fine) stage.classList.add('fine');
stage.style.setProperty('--dawn', reduced || seen ? '1' : '0');
boot();
