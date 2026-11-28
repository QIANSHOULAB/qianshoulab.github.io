// 全站共用一个 AudioContext（浏览器对个数有上限）：法典里那张声学公式测试板从这里拿。
// 测试板是你自己按了「发声」才响，跟首页右上角的声音开关无关。
let ctx: AudioContext | null = null;
export function audio(): AudioContext | null {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
/** 画布按设备像素比铺满它的盒子 */
export function fit(canvas: HTMLCanvasElement, c: CanvasRenderingContext2D) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height };
}
