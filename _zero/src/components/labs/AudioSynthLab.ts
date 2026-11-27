// 振荡器声波合成器 + 实时示波器（策划书 §4.2 AudioSynthLab.ts，Codex-01 声学公式测试板）。
// 三条公式：挥砍 = 高通白噪音 + 指数衰减；重击 = 正弦 150→30 Hz；吟唱 = 双振荡器 FM + 代码现算的混响。
// 「复制代码」拿到的函数，跟这里发声用的是同一套参数、同一个写法。
import { audio } from '../../utils/microSfx';
import { fit, headless, frameBook } from './wire';

type Knob = { key: string; min: number; max: number; step: number; unit: string };
type Preset = { id: 'slash' | 'thud' | 'chant'; knobs: Knob[]; defaults: Record<string, number> };

export const PRESETS: Preset[] = [
  { id: 'slash', defaults: { from: 900, to: 6500, decay: 150, q: 1.2 }, knobs: [
    { key: 'from', min: 200, max: 3000, step: 10, unit: 'Hz' },
    { key: 'to', min: 2000, max: 14000, step: 50, unit: 'Hz' },
    { key: 'decay', min: 40, max: 500, step: 5, unit: 'ms' },
    { key: 'q', min: 0.3, max: 8, step: 0.1, unit: 'Q' },
  ] },
  { id: 'thud', defaults: { from: 150, to: 30, drop: 90, decay: 320 }, knobs: [
    { key: 'from', min: 60, max: 400, step: 1, unit: 'Hz' },
    { key: 'to', min: 18, max: 90, step: 1, unit: 'Hz' },
    { key: 'drop', min: 15, max: 300, step: 1, unit: 'ms' },
    { key: 'decay', min: 80, max: 1200, step: 10, unit: 'ms' },
  ] },
  { id: 'chant', defaults: { carrier: 220, ratio: 1.5, index: 3, mix: 0.45 }, knobs: [
    { key: 'carrier', min: 80, max: 660, step: 1, unit: 'Hz' },
    { key: 'ratio', min: 0.5, max: 4, step: 0.01, unit: '×' },
    { key: 'index', min: 0, max: 10, step: 0.1, unit: 'I' },
    { key: 'mix', min: 0, max: 1, step: 0.01, unit: 'wet' },
  ] },
];

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(3)));

// —— 发声。每个函数都只用 Web Audio 自带的节点，不读任何文件 ——
function noise(ctx: BaseAudioContext, sec: number, channels = 1) {
  const buf = ctx.createBuffer(channels, Math.ceil(ctx.sampleRate * sec), ctx.sampleRate);
  for (let c = 0; c < channels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return buf;
}
function reverbIR(ctx: BaseAudioContext, sec = 2.2, decay = 3) {
  const buf = noise(ctx, sec, 2);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= Math.pow(1 - i / d.length, decay); }
  return buf;
}

export function play(id: Preset['id'], p: Record<string, number>, ctx: AudioContext, out: AudioNode) {
  const t = ctx.currentTime + 0.01;
  if (id === 'slash') {
    const d = p.decay / 1000;
    const src = ctx.createBufferSource(); src.buffer = noise(ctx, d + 0.1);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = p.q;
    hp.frequency.setValueAtTime(p.from, t); hp.frequency.exponentialRampToValueAtTime(p.to, t + d * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(hp).connect(g).connect(out); src.start(t); src.stop(t + d + 0.05);
    return d + 0.05;
  }
  if (id === 'thud') {
    const drop = p.drop / 1000, d = p.decay / 1000;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(p.from, t); o.frequency.exponentialRampToValueAtTime(p.to, t + drop);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.05);
    const n = ctx.createBufferSource(); n.buffer = noise(ctx, 0.06);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.5, t + 0.002); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(lp).connect(ng).connect(out); n.start(t); n.stop(t + 0.06);
    return d + 0.05;
  }
  // chant
  const len = 1.6;
  const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = p.carrier;
  const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = p.carrier * p.ratio;
  const depth = ctx.createGain(); depth.gain.value = p.index * p.carrier * p.ratio;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.8;
  const lfoAmt = ctx.createGain(); lfoAmt.gain.value = depth.gain.value * 0.5;
  lfo.connect(lfoAmt).connect(depth.gain);
  mod.connect(depth).connect(car.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
  g.gain.setValueAtTime(0.35, t + len - 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const dry = ctx.createGain(); dry.gain.value = 1 - p.mix;
  const wet = ctx.createGain(); wet.gain.value = p.mix;
  const verb = ctx.createConvolver(); verb.buffer = reverbIR(ctx);
  car.connect(g); g.connect(dry).connect(out); g.connect(verb).connect(wet).connect(out);
  [car, mod, lfo].forEach((x) => { x.start(t); x.stop(t + len); });
  return len + 2.2;
}

// —— 复制出去的代码：跟上面 play() 一行对一行 ——
export function code(id: Preset['id'], p: Record<string, number>) {
  const head = '// Assetless Genesis · Codex-01 · https://qianshoulab.github.io/codex/web-audio-formulas/\n';
  if (id === 'slash') return head + `function slash(ctx = new AudioContext()) {
  const t = ctx.currentTime + 0.01, d = ${fmt(p.decay / 1000)};
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (d + 0.1)), ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;   // white noise
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = ${fmt(p.q)};
  hp.frequency.setValueAtTime(${fmt(p.from)}, t);
  hp.frequency.exponentialRampToValueAtTime(${fmt(p.to)}, t + d * 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(hp).connect(g).connect(ctx.destination);
  src.start(t); src.stop(t + d + 0.05);
}`;
  if (id === 'thud') return head + `function thud(ctx = new AudioContext()) {
  const t = ctx.currentTime + 0.01, drop = ${fmt(p.drop / 1000)}, d = ${fmt(p.decay / 1000)};
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(${fmt(p.from)}, t);
  o.frequency.exponentialRampToValueAtTime(${fmt(p.to)}, t + drop);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d + 0.05);
  // a pinch of low-passed noise for the meat
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.06), ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const n = ctx.createBufferSource(); n.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  n.connect(lp).connect(ng).connect(ctx.destination); n.start(t); n.stop(t + 0.06);
}`;
  return head + `function chant(ctx = new AudioContext()) {
  const t = ctx.currentTime + 0.01, len = 1.6;
  const car = ctx.createOscillator(); car.frequency.value = ${fmt(p.carrier)};
  const mod = ctx.createOscillator(); mod.frequency.value = ${fmt(p.carrier)} * ${fmt(p.ratio)};
  const depth = ctx.createGain(); depth.gain.value = ${fmt(p.index)} * ${fmt(p.carrier)} * ${fmt(p.ratio)};
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.8;            // the breathing
  const lfoAmt = ctx.createGain(); lfoAmt.gain.value = depth.gain.value * 0.5;
  lfo.connect(lfoAmt).connect(depth.gain);
  mod.connect(depth).connect(car.frequency);                                 // FM
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
  g.gain.setValueAtTime(0.35, t + len - 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  // reverb: the impulse response is just stereo noise times a decay curve
  const ir = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 2.2), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3);
  }
  const verb = ctx.createConvolver(); verb.buffer = ir;
  const dry = ctx.createGain(); dry.gain.value = ${fmt(1 - p.mix)};
  const wet = ctx.createGain(); wet.gain.value = ${fmt(p.mix)};
  car.connect(g); g.connect(dry).connect(ctx.destination);
  g.connect(verb).connect(wet).connect(ctx.destination);
  [car, mod, lfo].forEach((x) => { x.start(t); x.stop(t + len); });
}`;
}

// —— 一张测试板 ——
export function mountBench(el: HTMLElement) {
  const compact = el.dataset.compact === 'true';
  let id: Preset['id'] = 'slash';
  const vals: Record<string, Record<string, number>> = Object.fromEntries(PRESETS.map((p) => [p.id, { ...p.defaults }]));
  const stage = el.querySelector<HTMLElement>('[data-scope]');
  const codeEl = el.querySelector<HTMLElement>('[data-code]');
  let canvas: HTMLCanvasElement | null = null, ctx2: CanvasRenderingContext2D | null = null;
  let analyser: AnalyserNode | null = null, bus: GainNode | null = null, raf = 0, until = 0;
  let wave: Uint8Array<ArrayBuffer> | null = null;

  function chain(ac: AudioContext) {
    if (!bus) {
      bus = ac.createGain(); bus.gain.value = 0.8;
      analyser = ac.createAnalyser(); analyser.fftSize = 2048;
      wave = new Uint8Array(analyser.fftSize);
      bus.connect(analyser); bus.connect(ac.destination);
    }
    return bus;
  }

  function drawScope(now: number) {
    raf = 0;
    if (!canvas || !ctx2) return;
    const t0 = performance.now();
    const { w, h } = fit(canvas, ctx2);
    ctx2.clearRect(0, 0, w, h);
    ctx2.strokeStyle = 'rgba(230,237,243,0.07)'; ctx2.lineWidth = 1;
    ctx2.beginPath();
    for (let i = 1; i < 8; i++) { const x = Math.round((w * i) / 8) + 0.5; ctx2.moveTo(x, 0); ctx2.lineTo(x, h); }
    for (let i = 1; i < 4; i++) { const y = Math.round((h * i) / 4) + 0.5; ctx2.moveTo(0, y); ctx2.lineTo(w, y); }
    ctx2.stroke();
    ctx2.strokeStyle = '#00FF9D'; ctx2.lineWidth = 1.5; ctx2.shadowColor = 'rgba(0,255,157,.6)'; ctx2.shadowBlur = 6;
    ctx2.beginPath();
    if (analyser && wave) {
      analyser.getByteTimeDomainData(wave);
      for (let i = 0; i < wave.length; i++) {
        const x = (i / (wave.length - 1)) * w, y = h / 2 + ((wave[i] - 128) / 128) * (h * 0.45);
        i ? ctx2.lineTo(x, y) : ctx2.moveTo(x, y);
      }
    } else { ctx2.moveTo(0, h / 2); ctx2.lineTo(w, h / 2); }
    ctx2.stroke(); ctx2.shadowBlur = 0;
    frameBook().add(performance.now() - t0);
    if (now < until) raf = requestAnimationFrame(drawScope);
  }
  function kick(sec = 0) {
    until = Math.max(until, performance.now() + sec * 1000);
    if (!raf && canvas) raf = requestAnimationFrame(drawScope);
  }
  function build() {
    if (canvas || headless() || !stage) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    stage.prepend(canvas);
    ctx2 = canvas.getContext('2d');
    frameBook().canvases++;
    kick();
  }
  function destroy() {
    if (!canvas) return;
    cancelAnimationFrame(raf); raf = 0;
    canvas.width = canvas.height = 0; canvas.remove(); canvas = null; ctx2 = null;
  }

  function fire(which: Preset['id']) {
    const ac = audio();
    if (!ac) return;
    const sec = play(which, vals[which], ac, chain(ac));
    kick(sec + 0.2);
    el.querySelectorAll<HTMLElement>(`[data-play="${which}"]`).forEach((b) => { b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); });
  }

  function select(next: Preset['id']) {
    id = next;
    el.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pick === id)));
    el.querySelectorAll<HTMLElement>('[data-knobs]').forEach((k) => { k.hidden = k.dataset.knobs !== id; });
    renderCode();
  }
  function renderCode() { if (codeEl) codeEl.textContent = code(id, vals[id]); }

  el.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) =>
    b.addEventListener('click', () => { const w = b.dataset.play as Preset['id']; if (!compact && w !== id) select(w); fire(w); }));
  el.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => b.addEventListener('click', () => select(b.dataset.pick as Preset['id'])));
  el.querySelectorAll<HTMLInputElement>('input[type="range"][data-k]').forEach((inp) => {
    const [pid, key] = (inp.dataset.k || '').split('.');
    const out = el.querySelector<HTMLElement>(`[data-v="${pid}.${key}"]`);
    const sync = () => {
      vals[pid][key] = +inp.value;
      if (out) out.textContent = fmt(+inp.value);
      inp.style.setProperty('--p', String((+inp.value - +inp.min) / (+inp.max - +inp.min)));
    };
    sync();
    inp.addEventListener('input', () => { sync(); renderCode(); });
    inp.addEventListener('change', () => fire(pid as Preset['id']));   // 松手就响一下，听得到改了啥
  });
  el.querySelector<HTMLButtonElement>('[data-copy]')?.addEventListener('click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    try { await navigator.clipboard.writeText(code(id, vals[id])); b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 1600); }
    catch { if (codeEl) { const r = document.createRange(); r.selectNodeContents(codeEl); getSelection()?.removeAllRanges(); getSelection()?.addRange(r); } }
  });

  document.addEventListener('zero:mode', () => { headless() ? destroy() : build(); });
  window.addEventListener('resize', () => kick());
  build();
  renderCode();
}
