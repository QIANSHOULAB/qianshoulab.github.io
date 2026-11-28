// 天上五个名字守久了还贴不贴着自己那样造物（v3.2 上线后补的；截图脚本都用 ?t=5 把时间停住，鲸不游，量不出这个）。
// 停在「开天」那片天上、时间照常走，每 0.4 秒量一次：
//   - 千手院 / 赛博杂货铺 / 标本 / 文物 的字框（去掉内边距）到它那样造物外沿的距离（太阳、浑天仪按圆，星环按屏幕上那圈点，巨鲸按身子那根胶囊）
//   - 「标本」的字框在屏幕上走多快、有没有一下跳几十像素（换方向）——手指瞄准的时候它挪开了就点空
// 离得超过 60 像素的那几下各截一张（最多 3 张）。结果写到 <输出目录>/sky-drift.json。
// 跑法：node scripts/sky-drift.mjs <输出目录>
//   BASE 网站根（默认线上）；SIZES 默认 1280x720,1440x900,1920x969,390x844；SECS 每个尺寸守几秒（默认 90；鲸游一圈要好几分钟，守得越久越准）；PW_MODULE 可以指到别的 playwright
const pw = await import(process.env.PW_MODULE || 'playwright');
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'sky-drift';
const BASE = (process.env.BASE || 'https://qianshoulab.github.io').replace(/\/$/, '');
const SIZES = (process.env.SIZES || '1280x720,1440x900,1920x969,390x844').split(',').map((s) => s.split('x').map(Number));
const SECS = Number(process.env.SECS || 90);
const NAMES = ['千手院', '赛博杂货铺', '标本', '文物'];
mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const rows = [];
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(w < 600 ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/zero/?act=7&tier=high`, { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => window.__zero && window.__zero.frames() >= 3 && document.querySelectorAll('.nm.ok').length === 5, null, { timeout: 120000 });
  await p.waitForTimeout(1500);
  const st = NAMES.map((name) => ({ name, max: 0, over40: 0, n: 0, worstAt: null, worstDir: null }));
  const whale = [];
  let shots = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < SECS * 1000) {
    const r = await p.evaluate(() => {
      const m = window.__zero.marks();
      if (!m || !m.ok) return null;
      const box = (k) => { const e = document.querySelector(`[data-sky-go="${k}"]`); const q = e.getBoundingClientRect(); return { x: q.left + 12, y: q.top + 14, w: q.width - 24, h: q.height - 28, o: parseFloat(getComputedStyle(e).opacity) }; };
      const dPt = (R, x, y) => Math.hypot(Math.max(R.x - x, 0, x - (R.x + R.w)), Math.max(R.y - y, 0, y - (R.y + R.h)));
      const d = [];
      for (let k = 0; k < 4; k++) {
        const R = box(k);
        let v;
        if (k === 0) v = dPt(R, m.sun.x, m.sun.y) - m.sun.r;
        else if (k === 3) v = dPt(R, m.arm.x, m.arm.y) - m.arm.r;
        else if (k === 1) { v = 1e9; const s = m.ring.pts || []; for (let i = 0; i < s.length; i += 2) v = Math.min(v, dPt(R, s[i], s[i + 1])); }
        else { const W = m.whale; let b = 1e9; for (let t = 0; t <= 1.0001; t += 0.05) b = Math.min(b, dPt(R, W.ax + (W.bx - W.ax) * t, W.ay + (W.by - W.ay) * t)); v = b - W.r; }
        d.push({ d: Math.max(0, Math.round(v)), o: R.o });
      }
      const wb = box(2);
      return { d, dirs: window.__zero.names().dirs, whale: [performance.now(), wb.x + wb.w / 2, wb.y + wb.h / 2] };
    });
    if (r) {
      const t = (Date.now() - t0) / 1000;
      r.d.forEach((v, k) => {
        if (v.o < 0.5) return;
        const s = st[k];
        s.n++;
        if (v.d > 40) s.over40++;
        if (v.d > s.max) { s.max = v.d; s.worstAt = +t.toFixed(1); s.worstDir = r.dirs[k]; }
      });
      whale.push(r.whale);
      if (shots < 3 && r.d.some((v) => v.o >= 0.5 && v.d > 60)) await p.screenshot({ path: `${out}/${w}x${h}-离得远-${shots++}.jpg`, type: 'jpeg', quality: 78 });
    }
    await p.waitForTimeout(400);
  }
  let vmax = 0, vsum = 0, jumps = 0;
  for (let i = 1; i < whale.length; i++) {
    const [t1, x1, y1] = whale[i - 1], [t2, x2, y2] = whale[i];
    const dd = Math.hypot(x2 - x1, y2 - y1), v = dd / ((t2 - t1) / 1000);
    if (dd > 40) jumps++;
    vmax = Math.max(vmax, v); vsum += v;
  }
  const row = { size: `${w}x${h}`, secs: SECS, names: st, whale: { avgPxPerSec: Math.round(vsum / Math.max(1, whale.length - 1)), maxPxPerSec: Math.round(vmax), jumpsOver40px: jumps } };
  rows.push(row);
  console.log(`${w}x${h} ` + st.map((s) => `${s.name} 最远 ${s.max}px（超 40px ${s.over40}/${s.n}${s.worstDir ? `，${s.worstAt}s 往 ${s.worstDir}` : ''}）`).join(' | ') + ` ｜ 标本平均 ${row.whale.avgPxPerSec}px/s、一下跳 40px 以上 ${jumps} 次`);
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/sky-drift.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), rows }, null, 1));
