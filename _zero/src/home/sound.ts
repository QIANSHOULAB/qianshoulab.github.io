// 首页的声音：默认关（右上角 SOUND: OFF，记住选择）。开了以后只有四样，全是当场合成的，没有音频文件：
//  1. 一个随幕变化的低长音。每造一样加一个音，第六幕五个音凑成一个和弦；第七幕和弦收成一个音，慢慢没了。
//  2. 石门动的时候一声闷响。
//  3. 第五幕炸开那一下（全站最响的一下）。
//  4. 点「进去」时一口气涌上来的声音。
// 浏览器不让没点过页面就出声：记着「开」的话，第一次点 / 按键时才真正响起来。
import { doorDeg, sstep, clamp } from '../genesis/timeline';

const KEY = 'zero.sound';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let droneGain: GainNode | null = null;
let droneFilter: BiquadFilterNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const notes: GainNode[] = [];
let wanted = false;
try { wanted = localStorage.getItem(KEY) === 'on'; } catch { /* 无痕：照默认，关 */ }

// 五个音：A2 上面的五度、八度、大三度……（开普勒拿行星轨道对音程；这里五样造物各领一个）
const CHORD = [110, 164.81, 220, 277.18, 329.63];

export const isOn = () => wanted;

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
  for (const [f, type, g] of [[55, 'sine', 0.55], [55.18, 'sine', 0.35], [82.41, 'sine', 0.2], [110, 'triangle', 0.07]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const gg = ctx.createGain();
    gg.gain.value = g;
    o.connect(gg).connect(droneFilter);
    o.start();
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1 / 7;
  const lg = ctx.createGain();
  lg.gain.value = 0.16;
  lfo.connect(lg).connect(droneGain.gain);
  lfo.start();
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf; n.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 360;
  const ng = ctx.createGain(); ng.gain.value = 0.045;
  n.connect(nf).connect(ng).connect(droneFilter);
  n.start();
  // 五个音：每个两根略微错开的正弦，慢慢起来
  CHORD.forEach((hz, i) => {
    const g = ctx!.createGain();
    g.gain.value = 0;
    const f = ctx!.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + i * 120;
    for (const det of [0, 0.7]) {
      const o = ctx!.createOscillator();
      o.type = det ? 'triangle' : 'sine';
      o.frequency.value = hz + det;
      const og = ctx!.createGain(); og.gain.value = det ? 0.18 : 0.5;
      o.connect(og).connect(f);
      o.start();
    }
    f.connect(g).connect(master!);
    notes.push(g);
  });
}

// —— 每帧：按进度定低长音、五个音多响；门动得快就闷响一声；第五幕滑过一半那一下炸 ——
let lastP = -1, lastSet = 0, lastDoor = 0, doorAcc = 0, lastThud = -1e9;
export function update(P: number, dt: number) {
  const door = doorDeg(P);
  if (lastP >= 0) {
    doorAcc = doorAcc * Math.exp(-dt * 3) + Math.abs(door - lastDoor);
    const now = performance.now();
    if (doorAcc > 3 && now - lastThud > 1400) { lastThud = now; doorAcc = 0; thud(1); }
    if (lastP < 4.5 && P >= 4.5 && P - lastP < 0.3) boom();
  }
  lastDoor = door;
  lastP = P;
  if (!ctx || !wanted) return;
  const now = performance.now();
  if (now - lastSet < 120) return;
  lastSet = now;
  apply(P);
}

function levels(P: number) {
  const light = P >= 1 ? 1 : sstep(0.25, 0.9, P);
  const fadeAll = 1 - sstep(6.85, 7, P) * 0.92;
  const drone = (0.05 + 0.3 * light) * fadeAll;
  // 第 k 个音（第 k+2 幕那样东西造出来那一下）起来；第七幕和弦收成第一个音，再慢慢没了
  const ns = CHORD.map((_, i) => {
    const u = P - (i + 1);
    let g = sstep(0.45, 0.65, u) * 0.07;
    if (i > 0) g *= 1 - sstep(6.4, 6.8, P);
    else g *= 1 - sstep(6.85, 7, P) * 0.85;
    return g;
  });
  return { light, drone, ns };
}

function apply(P: number, ramp = 0.5) {
  if (!ctx || !droneGain || !droneFilter || !master) return;
  const t = ctx.currentTime;
  const { light, drone, ns } = levels(P);
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(wanted ? 0.9 : 0, t, wanted ? 0.4 : 0.15);
  droneGain.gain.setTargetAtTime(drone, t, ramp);
  droneFilter.frequency.setTargetAtTime(150 + 480 * light, t, ramp);
  notes.forEach((g, i) => g.gain.setTargetAtTime(ns[i], t, ramp * 1.6));
}

export function setOn(on: boolean) {
  wanted = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 存不了就只管这一页 */ }
  if (on) ensure();
  apply(Math.max(lastP, 0), 0.5);
}

export function armOnGesture() {
  if (!wanted) return;
  const go = () => { ensure(); apply(Math.max(lastP, 0), 1.5); off(); };
  const off = () => { window.removeEventListener('pointerdown', go, true); window.removeEventListener('keydown', go, true); };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
}

/** 石门动：一声很低的闷响，带一点摩擦的沙沙 */
export function thud(level = 1) {
  if (!wanted || !ensure() || !ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + 0.01;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(92, t);
  o.frequency.exponentialRampToValueAtTime(34, t + 0.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * level, t + 0.014);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 1.6);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(90, t + 1);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.2 * level, t + 0.04);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  n.connect(f).connect(ng).connect(master);
  n.start(t); n.stop(t + 1.3);
}

/** 第五幕炸开：一声闷雷似的低响，全站最响的一下（先吸一口气，再炸，尾巴拖三秒） */
export function boom() {
  if (!wanted || !ensure() || !ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + 0.02;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(70, t);
  o.frequency.exponentialRampToValueAtTime(24, t + 1.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.95, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 3.3);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf; n.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
  f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(60, t + 2.8);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.7, t + 0.03);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 3);
  n.connect(f).connect(ng).connect(master);
  n.start(t); n.stop(t + 3.1);
}

/** 进去：一口气涌上来，越来越亮 */
export function swell() {
  if (!wanted || !ensure() || !ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + 0.01, d = 2;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf; n.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
  f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(5200, t + d);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.32, t + d);
  n.connect(f).connect(ng).connect(master);
  n.start(t); n.stop(t + d + 0.4);
  for (const [hz, v] of [[220, 0.1], [329.6, 0.07], [440, 0.05], [659.3, 0.03]] as const) {
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

export { clamp };
