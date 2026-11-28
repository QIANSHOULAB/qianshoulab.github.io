// v3.3（Song 11-28 10:11「每一个板块点了主动走完到到展示的位置……不是停留在中间」）：
// 停手以后，页面自己缓缓走到一幕的展示位置；点刻度、「目录」、天上的名字、Tab 到某一幕、键盘翻页，也都用这一套一路走到底。
//   - 停手 = 手指离开屏幕、惯性也停了；滚轮、触控板约 200 毫秒没有新输入；浏览器有 scrollend 就用它。
//   - 往前滑 → 去前面最近的那个展示位置（轻轻一推，下一幕自己演完、停好）；往后同理。刚冲过一个展示位置不到 0.25 屏 → 退回那个；
//     离起点不到 0.05 屏的小抖动 → 回原位。门槛按滚动的屏数算（首屏那段 hold 里 P 一直是 1，按 P 看不出动没动）。
//   - 逐帧自己滚（rAF 每帧 scrollTo），不用原生 smooth、不用 scroll-snap：要能被打断、知道什么时候到、到了要准。
//     按进度 P 走：每一帧按当时的屏高把 P 换算成滚动位置，走到一半地址栏伸缩、转屏、改窗口大小照样落准；停好以后屏高再变，也按记住的 P 摆回去。
//   - 一有新输入（手指按下、滚轮、触控板、方向键、空格、翻页键）马上停下，把手还给用户；自己滚出来的 scroll 不当用户输入；
//     Mac 触控板的惯性（一串又小又递减的滚轮事件）不当新输入，也不在它还没完的时候接管。
//   - v3.2「目录」快进也是这一套（kind = 'index'，缓动、时长照 v3.2），不再另写一套。
// 画面只认进度：有 3D 的时候每帧把 P 交给画面（driver.drive），没有 WebGL 的时候只滚页面（静态图照样一幕一张）。
import { SCROLL, SETTLE, INDEX, REST_PS, HITSTOP_MS } from '../scene/tune';
import { scrollToP, pToScroll } from '../scene/timeline';

export type GlideKind = 'settle' | 'index' | 'tick' | 'key' | 'focus';
/** 画面那一头（genesis）：现在的进度、逐帧把进度交过去（null = 还给滚动）、一下子摆到某个进度、第五幕顿帧 */
export interface Driver { readonly P: number; drive(p: number | null): void; jump(p: number): void; hitstop(): void }

/** 三次贝塞尔缓动（跟 CSS cubic-bezier 一个意思） */
export function bezier([x1, y1, x2, y2]: [number, number, number, number]) {
  const bx = (t: number) => 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t;
  const by = (t: number) => 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 26; i++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; }
    return by(t);
  };
}
const easeSettle = bezier(SETTLE.ease);
const easeIndex = bezier(INDEX.ease);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

interface Glide {
  from: number; to: number; t0: number; ms: number; ease: (x: number) => number;
  offU: number;          // 起步那一刻滚动位置跟 P 换算出来的差（屏）：慢慢收掉，滚动条不跳
  kind: GlideKind;
  pass: boolean;         // 一口气走过好几幕（目录、跨幕的刻度）：路过的幕名不冒出来、门的闷响不一路响
  dir: number;
  held?: number;         // 截图用：停在半路的那一刻
  holdAt?: number;       // 截图用：走到这个进度自己停住
  hit: boolean;          // 第五幕顿帧走过了没有
  lastP: number;
}
interface Gesture { u0: number; rStart: number; dir0: number; t0: number }

export interface GlideOpts {
  stage: HTMLElement;                 // 撑满一屏的那层（100lvh）：屏高按它量
  reduced: boolean;
  driver: () => Driver | null;
  /** 画面进度（没有 3D 时按滚动位置算） */
  P: () => number;
  /** 有一段走起来 / 停下来 / 落定（落定时给展示位置的 P） */
  onChange?: (g: { kind: GlideKind; pass: boolean; to: number } | null, landed: number | null) => void;
  /** 这时候不接管（正在往里扎、开场没走完时不算停手……） */
  blocked?: () => boolean;
}

export function createGlide(o: GlideOpts) {
  const vh = () => Math.max(1, o.stage.clientHeight);
  const curU = () => window.scrollY / vh();
  const restU = (i: number) => pToScroll(REST_PS[i], SCROLL.hold, SCROLL.acts);
  const uOf = (p: number) => pToScroll(p, SCROLL.hold, SCROLL.acts);
  const pOf = (u: number) => scrollToP(u, SCROLL.hold, SCROLL.acts);
  const tolU = () => 2 / vh();
  /** 停在第几个展示位置（-1 = 不在）。「开天」往下那段页尾都算到位 */
  function restAt(u: number) {
    const t = tolU();
    if (u >= restU(6) - t) return 6;
    for (let i = 0; i < 6; i++) if (Math.abs(u - restU(i)) <= t) return i;
    return -1;
  }

  let glide: Glide | null = null;
  let lastGlide: { kind: GlideKind; from: number; to: number; t0: number; ms: number; end: number; landedAt: number } | null = null;
  let gesture: Gesture | null = null;
  let rested: number | null = restAt(curU()) >= 0 ? REST_PS[restAt(curU())] : null;   // 停在哪个展示位置（P）：屏高变了按它摆回去
  let ownY = -1, ownT = -1e9;            // 自己滚到的位置：这一下 scroll 不算用户
  let lastY = window.scrollY;
  let lastDir = 0;
  let lastWheelT = -1e9, lastScrollT = -1e9, endT = -1e9, lastTouchEndT = -1e9, resizeT = -1e9;
  let touches = 0;
  let wheelPrev = { d: 0, t: -1e9 };
  let lastVh = vh();
  let raf = 0;
  let holdNext: number | null = null;

  function setScroll(y: number) {
    ownY = Math.max(0, y);
    ownT = performance.now();
    window.scrollTo(0, ownY);
  }
  const yFor = (u: number, p: number) => (p >= 6.999 ? Math.ceil(u * vh()) : Math.round(u * vh()));

  function msFor(from: number, to: number, kind: GlideKind) {
    const dist = Math.abs(to - from);
    if (kind === 'index') return Math.min(INDEX.maxMs + 200, Math.max(INDEX.minMs, INDEX.maxMs * Math.sqrt(dist / 6)));
    // 按距离：一整幕约 1.2 秒；走进「开天」那一段按 skyW 倍算（约 2 秒，收尾那场戏别一闪而过）
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const in7 = Math.max(0, hi - Math.max(lo, 6));
    const d = hi - lo - in7 + in7 * SETTLE.skyW;
    return clamp(SETTLE.actMs * Math.sqrt(d), SETTLE.minMs, SETTLE.maxMs);
  }

  function notify(landed: number | null) {
    o.onChange?.(glide ? { kind: glide.kind, pass: glide.pass, to: glide.to } : null, landed);
  }

  /** 一路走到进度 to（展示位置）。减少动效：直接落过去 */
  function to(target: number, kind: GlideKind) {
    const d = o.driver();
    const from = d ? d.P : o.P();
    target = clamp(target, 1, 7);
    gesture = null;
    if (o.reduced) {
      stop();
      setScroll(yFor(uOf(target), target));
      d?.jump(target);
      land(target);
      return;
    }
    const fromIdx = nearestIdx(from), toIdx = nearestIdx(target);
    const g: Glide = {
      from, to: target, t0: performance.now(), ms: msFor(from, target, kind), ease: kind === 'index' ? easeIndex : easeSettle,
      offU: curU() - uOf(Math.max(1, from)), kind,
      pass: kind === 'index' || Math.abs(toIdx - fromIdx) > 1, dir: Math.sign(target - from) || 1,
      hit: !(from < 4.45 && target > 4.45), lastP: from,
    };
    if (holdNext != null) { g.holdAt = holdNext; holdNext = null; }
    if (Math.abs(target - from) < 1e-4 && Math.abs(g.offU) * vh() < 1.5) { stop(); d?.jump(target); land(target); return; }
    glide = g;
    lastGlide = { kind, from, to: target, t0: g.t0, ms: g.ms, end: g.t0 + g.ms, landedAt: -1 };
    rested = null;
    addGuard();
    notify(null);
    kick();
  }
  function nearestIdx(p: number) {
    let b = 0;
    REST_PS.forEach((r, i) => { if (Math.abs(r - p) < Math.abs(REST_PS[b] - p)) b = i; });
    return b;
  }

  function step(now: number) {
    const g = glide!;
    let k = clamp(((g.held ?? now) - g.t0) / g.ms);
    let e = g.ease(k);
    let p = mix(g.from, g.to, e);
    // 截图用：走到这个进度就停住（找到正好落在这个进度的那一刻）
    if (g.holdAt != null && g.held == null && (g.to - g.holdAt) * (g.holdAt - p) <= 0) {
      let lo = 0, hi = k;
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; const pm = mix(g.from, g.to, g.ease(m)); if ((pm - g.holdAt) * g.dir < 0) lo = m; else hi = m; }
      k = hi; e = g.ease(k); p = mix(g.from, g.to, e);
      g.held = g.t0 + k * g.ms;
      g.holdAt = undefined;
    }
    // 第五幕顿帧：滑过那一拍时停一下（照常演；一口气快进的不停）
    if (!g.hit && !g.pass && g.lastP < 4.45 && p >= 4.45) {
      g.hit = true;
      p = 4.4501;
      g.t0 += HITSTOP_MS;
      o.driver()?.hitstop();
    }
    g.lastP = p;
    const u = uOf(Math.max(1, p)) + (1 - e) * g.offU;
    setScroll(yFor(u, p));
    if (k >= 1 && g.held == null) {
      if (lastGlide) { lastGlide.end = g.t0 + g.ms; lastGlide.landedAt = now; }   // 验收看：按时间该到的那一刻、真正落定的那一帧
      glide = null;
      removeGuard();
      setScroll(yFor(uOf(g.to), g.to));
      o.driver()?.jump(g.to);    // 落定：进度正好是展示位置（不再平滑地追）
      land(g.to);
      return;
    }
    o.driver()?.drive(p);
  }
  function land(p: number) {
    rested = p;
    gesture = null;
    notify(p);
  }
  /** 停下来，把手还给用户（画面从现在这里接着跟滚动） */
  function stop() {
    if (!glide) return;
    const g = glide;
    glide = null;
    removeGuard();
    o.driver()?.drive(null);
    notify(null);
    // 打断以后，这一下手势从半路开始；手指不动就松开 → 接着往刚才那个方向走
    gesture = { u0: curU(), rStart: -1, dir0: g.dir, t0: performance.now() };
  }

  function beginGesture() {
    if (gesture) return;
    const u = curU();
    gesture = { u0: u, rStart: restAt(u), dir0: lastDir || 1, t0: performance.now() };
  }

  /** 停手以后：挑一个展示位置走过去 */
  function settle() {
    const gs = gesture!;
    const u = curU();
    const at = restAt(u);
    if (at >= 0) { gesture = null; if (rested == null || Math.abs(rested - REST_PS[at]) > 1e-3) land(REST_PS[at]); return; }
    const moved = u - gs.u0;
    const R = REST_PS.map((_, i) => restU(i));
    let target: number;
    if (Math.abs(moved) < SETTLE.jitter) {
      // 小抖动：回原位（原来停在展示位置上）；原来在半路（刚才打断了自己走）→ 接着往刚才那个方向走
      if (gs.rStart >= 0) target = gs.rStart;
      else target = gs.dir0 > 0 ? R.findIndex((r) => r > u) : findLast(R, (r) => r < u);
    } else {
      const dir = lastDir || Math.sign(moved);
      // 这一下滑过了几个展示位置：只冲过一个、冲过头不到 0.25 屏 → 退回那个（本来就是想去那一幕）；
      // 一口气滑过好几个（猛滑）→ 照方向去前面最近的那个，不往回拽
      const lo = Math.min(gs.u0, u), hi = Math.max(gs.u0, u);
      const passed = R.filter((r) => r > lo + 1e-6 && r < hi - 1e-6).length;
      if (dir > 0) {
        const behind = findLast(R, (r) => r <= u);
        if (passed <= 1 && behind >= 0 && R[behind] > gs.u0 + 1e-6 && u - R[behind] < SETTLE.overshoot) target = behind;
        else target = R.findIndex((r) => r > u);
      } else {
        const ahead = R.findIndex((r) => r >= u);
        if (passed <= 1 && ahead >= 0 && R[ahead] < gs.u0 - 1e-6 && R[ahead] - u < SETTLE.overshoot) target = ahead;
        else target = findLast(R, (r) => r < u);
      }
    }
    if (target < 0) target = u > R[6] ? 6 : 0;
    to(REST_PS[target], 'settle');
  }
  function findLast<T>(a: T[], f: (x: T) => boolean) { for (let i = a.length - 1; i >= 0; i--) if (f(a[i])) return i; return -1; }

  /** 每帧：在走就走一步；没在走、手势没完、该停手了就挑一个展示位置走过去 */
  function tick(now: number) {
    if (glide) { step(now); return; }
    if (!gesture || o.blocked?.()) return;
    if (touches > 0) return;
    if (now - lastWheelT < SETTLE.wheelQuietMs) return;
    // 惯性停了：最后一下滚动以后 scrollQuietMs 没再滚；浏览器报了 scrollend 的，等一小会儿（还在滚的话 scroll 事件每帧都有）就行
    const quiet = now - lastScrollT;
    if (quiet < SETTLE.scrollQuietMs && !(endT >= lastScrollT && quiet >= SETTLE.endQuietMs)) return;
    if (now - lastTouchEndT < 40) return;
    settle();
  }
  // 没有 3D 的时候自己跑一个 rAF（有 3D 时画面每帧开头调 tick）
  let external = false;
  function kick() {
    if (external || raf) return;
    const loop = (t: number) => {
      raf = 0;
      tick(t);
      if (glide || gesture) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  // —— 滚轮：触控板惯性是一串又小又递减的事件，不当新输入；新的一下（变大、隔得久、换了方向）才算 ——
  function isMomentum(e: WheelEvent, now: number) {
    const d = e.deltaY;
    const p = wheelPrev;
    if (!p.d || Math.sign(d) !== Math.sign(p.d) || now - p.t > 400) return false;
    const a = Math.abs(d), b = Math.abs(p.d);
    return a < b - 0.01 || (a <= 2.5 && b <= 3);
  }
  const onWheelGuard = (e: WheelEvent) => {
    // 只在自己走的时候挂着（非被动）：惯性的尾巴拦下来，别跟自己走的这一步打架
    if (!glide) return;
    if (isMomentum(e, performance.now())) e.preventDefault();
  };
  let guarded = false;
  function addGuard() { if (!guarded) { window.addEventListener('wheel', onWheelGuard, { passive: false }); guarded = true; } }
  function removeGuard() { if (guarded) { window.removeEventListener('wheel', onWheelGuard); guarded = false; } }

  window.addEventListener('wheel', (e) => {
    const now = performance.now();
    if (o.blocked?.()) return;
    const mom = isMomentum(e, now);
    wheelPrev = { d: e.deltaY || wheelPrev.d, t: now };
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;       // 横着推的不管
    if (glide) { if (mom) return; stop(); }
    lastWheelT = now;
    beginGesture();
    kick();
  }, { passive: true });

  // —— 手指：按下就停，接着跟手；离开以后等惯性停了再接管（触摸事件一直有；指针事件一开始滚就 cancel 了，不能用来数手指）——
  window.addEventListener('touchstart', (e) => {
    touches = e.touches.length;
    if (o.blocked?.()) return;
    if (glide) stop();
    beginGesture();
    kick();
  }, { passive: true, capture: true });
  const touchUp = (e: TouchEvent) => {
    touches = e.touches.length;
    if (!touches) lastTouchEndT = performance.now();
    kick();
  };
  window.addEventListener('touchend', touchUp, { passive: true, capture: true });
  window.addEventListener('touchcancel', touchUp, { passive: true, capture: true });

  // —— 滚动：自己滚的不算；用户滚的记下方向（惯性也算用户的）——
  window.addEventListener('scroll', () => {
    const y = window.scrollY, now = performance.now();
    const mine = ownT > 0 && Math.abs(y - ownY) <= 1.5;
    const dy = y - lastY;
    lastY = y;
    if (mine) return;
    if (o.blocked?.()) return;
    if (Math.abs(dy) >= 0.5) lastDir = Math.sign(dy);
    if (glide) {
      // 走到一半被别的东西滚了（拖滚动条、页内搜索……）：让位。屏高刚变过的那一下是浏览器在挪，不算
      if (now - resizeT < 400 || vh() !== lastVh) return;
      stop();
    }
    lastScrollT = now;
    beginGesture();
    kick();
  }, { passive: true });
  if ('onscrollend' in window) window.addEventListener('scrollend', () => {
    const y = window.scrollY;
    if (ownT > 0 && Math.abs(y - ownY) <= 1.5) return;
    endT = performance.now();
    kick();
  });

  // —— 屏高变了（转屏、改窗口；iPhone 地址栏伸缩只动小视口，首页按大视口排，滚动位置本来就不变）：停好的按记住的 P 摆回去 ——
  function onResize() {
    resizeT = performance.now();
    const h = vh();
    if (h === lastVh) return;
    lastVh = h;
    if (!glide && !gesture && rested != null) setScroll(yFor(uOf(rested), rested));
  }
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);

  return {
    to,
    stop,
    tick,
    /** 有 3D：画面每帧开头调 tick，不再自己跑 rAF */
    attach() { external = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    detach() { external = false; if (glide || gesture) kick(); },
    setScroll,
    get gliding() { return glide != null; },
    get kind() { return glide?.kind ?? null; },
    get pass() { return !!glide?.pass; },
    get target() { return glide?.to ?? null; },
    get rested() { return rested; },
    get gestureOn() { return gesture != null; },
    /** 一路走过好几个展示位置时，现在在哪一段（给「下一个」用） */
    nextFrom(dir: number) {
      const base = glide && Math.sign(glide.to - glide.from) === dir ? uOf(glide.to) : curU();
      const t = tolU();
      const R = REST_PS.map((_, i) => restU(i));
      if (dir > 0) { const i = R.findIndex((r) => r > base + t); return i < 0 ? null : REST_PS[i]; }
      const i = findLast(R, (r) => r < base - t);
      return i < 0 ? null : REST_PS[i];
    },
    /** 截图用：停在半路 / 放开；at = 下一段走到这个进度自己停住 */
    hold(on: boolean, at?: number) {
      if (on && at != null) { holdNext = at; return; }
      if (!glide) return;
      const now = performance.now();
      if (on && glide.held == null) glide.held = now;
      else if (!on && glide.held != null) { glide.t0 += now - glide.held; glide.held = undefined; kick(); }
    },
    get held() { return glide?.held != null; },
    /** 调试、验收：现在的滚动位置（屏）、停在哪、P 换算 */
    debug: () => ({ u: curU(), at: restAt(curU()), rested, gesture: gesture ? { ...gesture } : null, glide: glide ? { kind: glide.kind, from: glide.from, to: glide.to, ms: glide.ms } : null, touches, lastDir, last: lastGlide ? { ...lastGlide } : null, restU: REST_PS.map((_, i) => restU(i)) }),
    pOf, uOf, restAt,
  };
}
export type GlideCtl = ReturnType<typeof createGlide>;
