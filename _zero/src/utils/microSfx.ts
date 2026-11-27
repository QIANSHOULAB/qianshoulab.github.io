// 零采样微交互声带（策划书 §3.2-3）：点按钮、换标签、展开代码时，当场合成 15–40 毫秒的正弦 / 三角波。
// 没有一个音频文件。右上角那三根小柱子管静音，选过就记住（localStorage「zero.sfx」）。

type Kind = 'tick' | 'toggle' | 'on' | 'off' | 'open' | 'mutate' | 'lang';
const KEY = 'zero.sfx';
let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === 'off'; } catch { /* 无痕模式：照默认 */ }

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(KEY, m ? 'off' : 'on'); } catch { /* 存不了就只管这一页 */ }
}

/** 全站共用一个 AudioContext（浏览器对个数有上限）：微音效和 Codex-01 测试板都从这里拿。 */
export function audio(): AudioContext | null {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// 每种声音：波形、起止频率（Hz）、时长（毫秒）、音量
const PRESET: Record<Kind, [OscillatorType, number, number, number, number]> = {
  tick:   ['triangle', 1900, 1700, 16, 0.05],
  lang:   ['sine', 1240, 1240, 22, 0.06],
  toggle: ['sine', 880, 1320, 30, 0.06],
  on:     ['sine', 660, 1180, 38, 0.07],
  off:    ['sine', 1100, 420, 40, 0.07],
  open:   ['triangle', 520, 780, 26, 0.06],
  mutate: ['triangle', 300, 1500, 40, 0.05],
};

export function blip(kind: Kind = 'tick', force = false) {
  if (muted && !force) return;
  // 微音效是「肉身」的一部分：无头态一声不响
  if (!force && document.documentElement.getAttribute('data-mode') === 'headless') return;
  const a = audio();
  if (!a) return;
  const [type, f0, f1, ms, vol] = PRESET[kind];
  const t = a.currentTime + 0.002, d = ms / 1000;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.003);       // 3 毫秒起音，不炸耳朵
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + d + 0.02);
}
