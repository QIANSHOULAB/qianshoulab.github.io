// 首页的声音：默认关。开了以后只有三样——随天亮升起来的一声低长音、一撮碑块出来时的一声石头闷响、进门时一口气涌上来的光声。
// 全是 Web Audio 当场合成的，没有音频文件。开没开记在 localStorage「zero.sound」，下次来还是那样。
// 浏览器不让没点过页面就出声：记着「开」的话，第一次点 / 按键时才真正响起来。

const KEY = 'zero.sound';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let droneGain: GainNode | null = null;
let droneFilter: BiquadFilterNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let level = 0;          // 天亮了多少（0..1），低音跟着升
let wanted = false;

try { wanted = localStorage.getItem(KEY) === 'on'; } catch { /* 无痕模式：照默认，关 */ }

export const isOn = () => wanted;

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return ctx; }
  const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx = new C();
  master = ctx.createGain();
  master.gain.value = 0;
  // 一点点压缩，几样声音叠在一起也不炸
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  buildDrone();
  return ctx;
}

// 低长音：A1 和它上面的五度、八度，几根正弦慢慢错开相位；过一道低通，天越亮滤波开得越大
function buildDrone() {
  if (!ctx || !master) return;
  droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 160;
  droneFilter.Q.value = 0.4;
  droneFilter.connect(droneGain).connect(master);
  const parts: [number, string, number][] = [[55, 'sine', 0.55], [55.18, 'sine', 0.35], [82.41, 'sine', 0.22], [110, 'triangle', 0.08], [164.8, 'sine', 0.035]];
  for (const [f, type, g] of parts) {
    const o = ctx.createOscillator();
    o.type = type as OscillatorType;
    o.frequency.value = f;
    const gg = ctx.createGain();
    gg.gain.value = g;
    o.connect(gg).connect(droneFilter);
    o.start();
  }
  // 极慢的起伏，跟画面的呼吸差不多快
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1 / 7;
  const lg = ctx.createGain();
  lg.gain.value = 0.18;
  lfo.connect(lg).connect(droneGain.gain);
  lfo.start();
  // 空气声：一点点低通过的噪音
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf; n.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 380;
  const ng = ctx.createGain(); ng.gain.value = 0.05;
  n.connect(nf).connect(ng).connect(droneFilter);
  n.start();
}

function applyLevel(ramp = 0.6) {
  if (!ctx || !droneGain || !droneFilter || !master) return;
  const t = ctx.currentTime;
  const on = wanted ? 1 : 0;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(on * 0.9, t, wanted ? 0.4 : 0.15);
  droneGain.gain.setTargetAtTime(0.05 + 0.3 * level, t, ramp);
  droneFilter.frequency.setTargetAtTime(150 + 520 * level, t, ramp);
}

/** 天亮了多少（每帧都会调，内部节流） */
let lastSet = 0;
export function setLevel(l: number) {
  level = l;
  const now = performance.now();
  if (now - lastSet < 250) return;
  lastSet = now;
  applyLevel(1.2);
}

export function setOn(on: boolean) {
  wanted = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 存不了就只管这一页 */ }
  if (on) ensure();
  applyLevel(0.5);
}

/** 记着「开」：等用户第一次点页面 / 按键再出声（浏览器规矩） */
export function armOnGesture() {
  if (!wanted) return;
  const go = () => { ensure(); applyLevel(1.5); off(); };
  const off = () => { window.removeEventListener('pointerdown', go, true); window.removeEventListener('keydown', go, true); };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
}

/** 一撮碑块出碑：一声很低的石头闷响，带一点摩擦的沙沙 */
export function thud() {
  if (!wanted || !ensure() || !ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + 0.01;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(96, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 0.35);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.55, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 1.5);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(90, t + 0.9);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  n.connect(f).connect(ng).connect(master);
  n.start(t); n.stop(t + 1.2);
}

/** 进门：一口气涌上来，越来越亮 */
export function swell() {
  if (!wanted || !ensure() || !ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + 0.01, d = 2.1;
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
