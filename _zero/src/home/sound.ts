// 首页的声音：默认关。开了以后只有四样——一个随幕变化的低长音（每造一样加一个音，第六幕五个音凑成一个和弦，
// 第七幕收成一个音、慢慢没了）、石门动的时候一声闷响、第五幕炸开那一下、点「进去」时一口气涌上来。
// 全是 Web Audio 当场合成的，没有音频文件。开没开记在 localStorage「zero.sound」。浏览器不让没点过页面就出声。

const KEY = 'zero.sound';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let droneGain: GainNode | null = null;
let droneFilter: BiquadFilterNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const notes: GainNode[] = [];
let wanted = false;
let P = 0;

try { wanted = localStorage.getItem(KEY) === 'on'; } catch { /* 无痕模式：照默认，关 */ }

export const isOn = () => wanted;

// 底下 A1；第二到第六幕各加一个音：E2、A2、升 C3、E3、B3（A 大三和弦加九度）
const CHORD = [82.41, 110, 138.59, 164.81, 246.94];

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return ctx; }
  const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx = new C();
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3.5;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  buildDrone();
  return ctx;
}

function buildDrone() {
  if (!ctx || !master) return;
  droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 160;
  droneFilter.Q.value = 0.4;
  droneFilter.connect(droneGain).connect(master);
  for (const [f, type, g] of [[55, 'sine', 0.5], [55.18, 'sine', 0.32], [27.5, 'sine', 0.22]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const gg = ctx.createGain();
    gg.gain.value = g;
    o.connect(gg).connect(droneFilter);
    o.start();
  }
  // 五个音：每个两根略微错开的正弦，慢慢拍
  for (const f of CHORD) {
    const ng = ctx.createGain();
    ng.gain.value = 0;
    for (const det of [0, 0.23]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f + det;
      const gg = ctx.createGain();
      gg.gain.value = 0.11;
      o.connect(gg).connect(ng);
      o.start();
    }
    ng.connect(droneFilter);
    notes.push(ng);
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1 / 7;
  const lg = ctx.createGain();
  lg.gain.value = 0.14;
  lfo.connect(lg).connect(droneGain.gain);
  lfo.start();
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf; n.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 380;
  const ng = ctx.createGain(); ng.gain.value = 0.05;
  n.connect(nf).connect(ng).connect(droneFilter);
  n.start();
}

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function apply(ramp = 0.8) {
  if (!ctx || !droneGain || !droneFilter || !master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(wanted ? 0.9 : 0, t, wanted ? 0.4 : 0.15);
  const light = ss(0.38, 0.75, P);
  const fade = 1 - ss(6.82, 7, P) * 0.85;
  droneGain.gain.setTargetAtTime((0.05 + 0.3 * light) * fade, t, ramp);
  droneFilter.frequency.setTargetAtTime(150 + 420 * light + 90 * ss(1, 6, P), t, ramp);
  notes.forEach((g, i) => {
    const k = i + 2;
    let v = ss(k - 1 + 0.04, k - 1 + 0.45, P);
    // 第七幕：和弦收成一个音（A2 留到最后）
    if (i !== 1) v *= 1 - ss(6.15, 6.7, P);
    g.gain.setTargetAtTime(v * 0.8 * fade, t, ramp);
  });
}

/** 进度（0..7）：每帧都会调，内部节流 */
let lastSet = 0;
export function setLevel(p: number) {
  P = p;
  const now = performance.now();
  if (now - lastSet < 200) return;
  lastSet = now;
  apply(1);
}

export function setOn(on: boolean) {
  wanted = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 存不了就只管这一页 */ }
  if (on) ensure();
  apply(0.5);
}

export function armOnGesture() {
  if (!wanted) return;
  const go = () => { ensure(); apply(1.5); off(); };
  const off = () => { window.removeEventListener('pointerdown', go, true); window.removeEventListener('keydown', go, true); };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
}

/** 石门动：很低的一声闷响，带一点摩擦的沙沙 */
export function thud() {
  if (!wanted || !ensure() || !ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + 0.01;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(92, t);
  o.frequency.exponentialRampToValueAtTime(34, t + 0.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 1.6);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(90, t + 1.1);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
  n.connect(f).connect(ng).connect(master);
  n.start(t); n.stop(t + 1.4);
}

/** 第五幕炸开：一声闷雷似的低响，全站最响的一下 */
export function blast() {
  if (!wanted || !ensure() || !ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + 0.005;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(70, t);
  o.frequency.exponentialRampToValueAtTime(22, t + 1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1.0, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 3.3);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf; n.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
  f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(60, t + 2.6);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.7, t + 0.008);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
  n.connect(f).connect(ng).connect(master);
  n.start(t); n.stop(t + 3);
}

/** 进去：一口气涌上来，越来越亮 */
export function swell() {
  if (!wanted || !ensure() || !ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + 0.01, d = 1.7;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf; n.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
  f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(5200, t + d);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.35, t + d);
  n.connect(f).connect(ng).connect(master);
  n.start(t); n.stop(t + d + 0.4);
  for (const [hz, v] of [[220, 0.12], [329.6, 0.08], [440, 0.06], [659.3, 0.03]] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + d);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + d + 0.4);
  }
}
