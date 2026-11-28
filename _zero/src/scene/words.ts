// 星尘字的「场记」（v3.3）：每帧定好每一份字放在 3D 里哪、聚到哪了、什么颜色，写进 ./stardust.ts。
//   - 第二到第六幕的栏目名：摆在那一幕造出来的东西旁边（不压住它、不压门、不压别的造物、不出屏、不进水里），
//     位置在那一幕的展示位置（restP）上量一次、按那样东西的远近放进 3D（之后镜头怎么动，字跟着有透视、有视差）。
//     从这一段约 50% 开始聚，到展示位置时聚好；倒着滑就散回它来的地方。
//   - 那句话：门上飞上天的石头变成的星，其中一部分聚成它，停在地平线上空（位置照页面排版那块天，放到星的那个远处）。
//   - 天上五个名字：摆法、避让照 v3.2（home.ts 每帧在屏幕上挑好位置），这里按那样造物的远近放进 3D，从各自那样造物身上聚出来。
//     退路 B（矮的手机竖屏、手机横着）：点「目录」画面压暗，五个名字竖着一列，也用星尘聚，排在天上同一个深度上。
//   - 首屏 wordmark：不飞、不聚；跟门一样早就在暗里（比墨蓝再暗一点的一块），门后的光升起来才把它照出来。
import { Matrix3, PerspectiveCamera, Vector3 } from 'three';
import type { Stardust, Lang, ItemRt } from './stardust';
import { REST_PS, ACT_HEX, DUST, hexToUnit } from './tune';
import { qMat, ss, mix, cl, WHALE_L, RING_R, ORBITS, type State, type V3 } from './timeline';
import { H as DH, W as DW, Z_FRONT } from './layout';

export interface Box { x: number; y: number; w: number; h: number }
interface Circle { x: number; y: number; r: number }
interface Placed { anchor: Vector3; right: Vector3; up: Vector3; norm: Vector3; px: number; depth: number }

const ACT_IDS = ['a2', 'a3', 'a4', 'a5', 'a6'];
const SKY_IDS = ['s0', 's1', 's2', 's3', 's4'];
const HEX = [ACT_HEX.sun, ACT_HEX.ring, ACT_HEX.life, ACT_HEX.fire, ACT_HEX.law];

export function createWords(o: {
  dust: Stardust;
  /** 镜头摆到进度 P 的展示样子（不带漂移、视差），返回那一刻的状态（dClock：往后多少秒的样子，看转着的东西会走到哪） */
  poseCam: (P: number, cam: PerspectiveCamera, dClock?: number) => State;
  size: () => { w: number; h: number };
  reduced: boolean;
  textDpr: () => number;
  /** 第七幕：天上这一点被星云照成什么颜色（显示空间） */
  nebTint: (p: V3) => [number, number, number];
}) {
  const D = o.dust;
  const pcam = new PerspectiveCamera(33, 1, 1, 6000);
  const v = new Vector3(), v2 = new Vector3(), v3 = new Vector3();
  const m3 = new Matrix3();
  let lang = 0, langGoal = 0;            // 0 英文 → 1 中文
  let langT0 = -1, langFrom = 0;
  const placed = new Map<string, Placed>();
  const pdebug = new Map<string, unknown>();   // 验收看：每个栏目名在它那一幕的展示位置上挑在了哪、扣了多少分
  const f = new Map<string, number>();    // 显示出来的「聚到哪了」（按真实时间稍微追一下，倒着滑就倒放）
  let obst = { top: 60, ticks: null as Box | null, bottom: 40 };
  let wmRects: { a: Box; b: Box } | null = null;
  let mottoRect: { box: Box; lines: number } | null = null;
  let mottoPx = 24, wmPx = { a: 26, b: 12 }, skyPx = 18, listPx = 19;
  let pass = false, passK = -1;
  let diving = 0, divingOn = false;
  let skyBoxes: (Box | null)[] = [null, null, null, null, null];
  let skyOn = false;
  let listRows: (Box | null)[] = [null, null, null, null, null];
  let listOpen = false, listK = 0;
  let snapNext = false;
  let dirty = true;

  // —— 小工具：投影、按远近放回 3D ——
  function proj(cam: PerspectiveCamera, p: V3 | Vector3) {
    const { w, h } = o.size();
    if (Array.isArray(p)) v.set(p[0], p[1], p[2]); else v.copy(p);
    v.project(cam);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, front: v.z < 1 && v.z > -1 };
  }
  function depthOf(cam: PerspectiveCamera, p: V3) {
    v2.setFromMatrixColumn(cam.matrixWorld, 2);   // 朝后
    return -((p[0] - cam.position.x) * v2.x + (p[1] - cam.position.y) * v2.y + (p[2] - cam.position.z) * v2.z);
  }
  /** 屏幕上 (sx, sy) 那一点、离镜头 d 远（沿镜头朝向量）的世界坐标 */
  function unproject(cam: PerspectiveCamera, sx: number, sy: number, d: number, out: Vector3) {
    const { w, h } = o.size();
    const nx = (sx / w) * 2 - 1, ny = 1 - (sy / h) * 2;
    const a = v.set(nx, ny, -1).unproject(cam).clone();
    const b = v.set(nx, ny, 1).unproject(cam);
    const dir = b.sub(a).normalize();
    v3.setFromMatrixColumn(cam.matrixWorld, 2).multiplyScalar(-1);   // 朝前
    const a0 = a.clone().sub(cam.position).dot(v3);
    const t = (d - a0) / Math.max(1e-6, dir.dot(v3));
    return out.copy(a).addScaledVector(dir, t);
  }
  /** 镜头在 d 远处，一个 CSS 像素是多少世界单位 */
  const wpp = (cam: PerspectiveCamera, d: number) => (2 * d * Math.tan((cam.fov * Math.PI) / 360)) / o.size().h;
  function basis(cam: PerspectiveCamera, d: number, px: number, p: Placed) {
    const s = wpp(cam, d) * px;
    p.right.setFromMatrixColumn(cam.matrixWorld, 0).normalize().multiplyScalar(s);
    p.up.setFromMatrixColumn(cam.matrixWorld, 1).normalize().multiplyScalar(s);
    p.norm.setFromMatrixColumn(cam.matrixWorld, 2).normalize();
    p.px = px; p.depth = d;
  }
  const newPlaced = (): Placed => ({ anchor: new Vector3(), right: new Vector3(), up: new Vector3(), norm: new Vector3(), px: 1, depth: 1 });

  // —— 字号（CSS 像素）——
  function actPx() {
    const { w, h } = o.size();
    const phone = w < 600 && w < h;
    if (phone) return DUST.actPxPhone;
    return Math.max(DUST.actPx[0], Math.min(DUST.actPx[1], w * DUST.actPx[2]));
  }

  // —— 造物在屏幕上的样子（第 k 样：0 日 1 环 2 鲸 3 器 4 轨道），用一串小圆表示（量「压没压」）——
  function bodyCircles(cam: PerspectiveCamera, s: State, k: number): Circle[] {
    const out: Circle[] = [];
    const rOf = (c: V3, rw: number) => {
      const a = proj(cam, c);
      v2.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(rw);
      const b = proj(cam, [c[0] + v2.x, c[1] + v2.y, c[2] + v2.z]);
      return { a, r: Math.hypot(b.x - a.x, b.y - a.y) };
    };
    if (k === 0 && s.sun.vis > 0.05) { const { a, r } = rOf(s.sun.c, 46 * s.sun.scale * 1.4); out.push({ x: a.x, y: a.y, r }); }
    if (k === 3 && s.arm.vis > 0.05) { const { a, r } = rOf(s.arm.c, 66 * s.arm.scale * 1.12); out.push({ x: a.x, y: a.y, r }); }
    if (k === 1 && s.ring.vis > 0.05) {
      const band = rOf(s.ring.c, 30 * s.ring.scale).r;
      const R = qMat(s.ring.rot);
      for (let i = 0; i < 28; i++) {
        const t = (i / 28) * Math.PI * 2, rr = RING_R * s.ring.scale;
        const lx = rr * Math.cos(t), lz = rr * Math.sin(t);
        const p = proj(cam, [s.ring.c[0] + R[0] * lx + R[6] * lz, s.ring.c[1] + R[1] * lx + R[7] * lz, s.ring.c[2] + R[2] * lx + R[8] * lz]);
        out.push({ x: p.x, y: p.y, r: Math.max(6, band) });
      }
    }
    if (k === 2 && s.whale.vis > 0.05) {
      const R = qMat(s.whale.rot), L = WHALE_L * s.whale.scale;
      const c = s.whale.settle > 0.5 ? s.whale.c : s.whale.mid;
      const rr = rOf(c, L * 0.1).r;
      for (let i = 0; i <= 8; i++) {
        const u = i / 8, lx = L * (0.5 - u);
        const p = proj(cam, [c[0] + R[0] * lx, c[1] + R[1] * lx, c[2] + R[2] * lx]);
        out.push({ x: p.x, y: p.y, r: rr * (i < 2 ? 1 : i > 6 ? 0.6 : 1.1) });
      }
    }
    if (k === 4) {
      s.orbits.forEach((ob, j) => {
        if (j !== 2 || ob.draw < 0.05 || ob.I < 0.05) return;
        const R = qMat(ob.q);
        for (let i = 0; i < 36; i++) {
          const t = (i / 36) * ob.draw * Math.PI * 2;
          const lx = ob.R * Math.cos(t), lz = ob.R * Math.sin(t);
          const p = proj(cam, [ob.c[0] + R[0] * lx + R[6] * lz, ob.c[1] + R[1] * lx + R[7] * lz, ob.c[2] + R[2] * lx + R[8] * lz]);
          if (p.front) out.push({ x: p.x, y: p.y, r: 8 });
        }
      });
    }
    return out;
  }
  const rectCircle = (b: Box, c: Circle) => {
    const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.w)), dy = Math.max(b.y - c.y, 0, c.y - (b.y + b.h));
    return Math.max(0, c.r - Math.hypot(dx, dy)) / Math.max(c.r, 1);
  };
  const overlap = (a: Box, b: Box) => {
    const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return (x * y) / Math.max(1, a.w * a.h);
  };

  /** 第 k 幕（2..6）的名字摆在哪：在这一幕的展示位置上量那样东西、门、别的造物，挑一个贴着它、什么都不压的地方 */
  function placeAct(k: number) {
    const it = D.items.get(ACT_IDS[k - 2]);
    if (!it || !it.lay.en || !it.lay.zh) return;
    const s = o.poseCam(REST_PS[k - 1], pcam);
    const { w: W, h: H } = o.size();
    const phone = W < 600 && W < H;
    const px = actPx();
    const tw = Math.max(it.lay.en.w, it.lay.zh.w) * px, th = Math.max(it.lay.en.h, it.lay.zh.h) * px;
    const goW = 120, goH = 44, gap2 = 6;
    const bw = Math.max(tw, goW), bh = th + gap2 + goH;
    const own = bodyCircles(pcam, s, k - 2);
    const others: Circle[] = [];
    for (let j = 0; j < 4; j++) if (j !== k - 2) others.push(...bodyCircles(pcam, s, j));
    // 第六幕：日、鲸、器挂在轨道上一直转（一圈 66、46、28 秒），停在这一幕的时候它们迟早会转到字跟前。
    // 把它们整圈走过的地方都当成不能压的：字摆在轨道外头，转过来的东西挡不着它、也不会像是在给它们起名字
    const swept: Circle[] = [];
    if (k === 6) {
      const RIDE: [number, number][] = [[0, ORBITS[2].period], [2, ORBITS[1].period], [3, ORBITS[0].period]];   // [造物, 一圈几秒]
      for (const [j, per] of RIDE) for (let i = 1; i < 24; i++) swept.push(...bodyCircles(pcam, o.poseCam(REST_PS[5], pcam, (i / 24) * per), j));
      o.poseCam(REST_PS[k - 1], pcam);   // 镜头摆回现在这一刻
    }
    // 门（含门缝那道光）
    const d0 = proj(pcam, [-DW * 0.62, -2, Z_FRONT]), d1 = proj(pcam, [DW * 0.62, DH * 1.06, Z_FRONT]);
    const door: Box = { x: Math.min(d0.x, d1.x), y: Math.min(d0.y, d1.y), w: Math.abs(d1.x - d0.x), h: Math.abs(d1.y - d0.y) };
    const horizon = proj(pcam, [0, 0, Z_FRONT - 60000]).y;
    const bottom = H - obst.bottom;
    const cx0 = own.reduce((a, c) => a + c.x, 0) / Math.max(1, own.length), cy0 = own.reduce((a, c) => a + c.y, 0) / Math.max(1, own.length);
    let best: { cx: number; cy: number; c: number } | null = null;
    const gapTo = (b: Box) => {
      // 字离它自己那样东西最近的地方有多远（像素）
      let d = 1e9;
      for (const c of own) {
        const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.w)), dy = Math.max(b.y - c.y, 0, c.y - (b.y + b.h));
        d = Math.min(d, Math.hypot(dx, dy) - c.r);
      }
      return Math.max(0, d);
    };
    const score = (tx: number, ty: number, pref: number) => {
      // 字块：名字（tx, ty 是名字的左上角）+ 下面正中的「进去」
      const txt: Box = { x: tx, y: ty, w: tw, h: th };
      const blk: Box = { x: tx + tw / 2 - bw / 2, y: ty, w: bw, h: bh };
      let c = pref;
      if (blk.x < 14 || blk.x + blk.w > W - 14) c += 1000;
      if (blk.y < obst.top + 8 || blk.y + blk.h > bottom) c += 1000;
      if (txt.y + txt.h > horizon - 6) c += 1000;                     // 名字不进水里
      if (obst.ticks && overlap(blk, { x: obst.ticks.x - 8, y: obst.ticks.y - 8, w: obst.ticks.w + 16, h: obst.ticks.h + 16 }) > 0) c += 1000;
      const od = overlap(txt, { x: door.x - 6, y: door.y - 6, w: door.w + 12, h: door.h + 12 });
      if (od > 0.01) c += 1000 + 400 * od;                             // 门（门缝那道光）上不压字
      c += overlap(blk, door) > 0 ? 120 : 0;
      for (const b of own) { const r = rectCircle(txt, b); if (r > 0.08) c += 1000; c += 400 * r + 80 * rectCircle(blk, b); }
      for (const b of others) c += 300 * rectCircle(txt, b) + 60 * rectCircle(blk, b);
      for (const b of swept) { const r = rectCircle(txt, b); if (r > 0.02) c += 1000; c += 300 * r + 60 * rectCircle(blk, b); }
      // 贴着它：离它越远越扣分（一眼看得出是谁的）
      c += 0.55 * gapTo(txt);
      if (!best || c < best.c) best = { cx: tx + tw / 2, cy: ty + th / 2, c };
    };
    const tryAt = (ax: number, ay: number, nx: number, ny: number, pref: number) => {
      const x = nx > 0.35 ? ax : nx < -0.35 ? ax - tw : ax - tw / 2;
      const y = ny > 0.35 ? ay : ny < -0.35 ? ay - th : ay - th / 2;
      score(x, ny > 0.35 ? y : ny < -0.35 ? y - gap2 - goH : y, pref);
    };
    const gap = phone ? 12 : 16;
    if (own.length === 1) {
      const b = own[0];
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2, nx = Math.cos(t), ny = Math.sin(t);
        // 宽屏往两边放先试；往下放稍微扣一点（字压在东西下面像标签）
        const pref = (phone ? 0 : 6 * Math.abs(ny)) + 10 * Math.max(0, ny);
        tryAt(b.x + nx * (b.r + gap), b.y + ny * (b.r + gap), nx, ny, pref);
      }
    } else {
      for (const b of own) {
        let nx = b.x - cx0, ny = b.y - cy0;
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        const pref = (phone ? 0 : 6 * Math.abs(ny)) + 10 * Math.max(0, ny);
        tryAt(b.x + nx * (b.r + gap), b.y + ny * (b.r + gap), nx, ny, pref);
      }
    }
    // 外沿上挑不出来（手机竖屏窄、门正好在中间）：整屏按格子扫一遍，挑离它最近、什么都不压的地方
    if (!best || (best as { c: number }).c >= 1000) {
      for (let y = obst.top + 10; y < horizon; y += 8) {
        for (let i = 0; i <= 14; i++) {
          const x = 14 + ((W - 28 - bw) * i) / 14 + (bw - tw) / 2;
          score(x, y, 12);
        }
      }
    }
    if (!best) return;
    const bb = best as { cx: number; cy: number; c: number };
    pdebug.set(it.def.id, { cx: Math.round(bb.cx), cy: Math.round(bb.cy), cost: Math.round(bb.c), px, door: { ...door }, horizon: Math.round(horizon) });
    const center: V3 = k === 2 ? s.sun.c : k === 3 ? s.ring.c : k === 4 ? (s.whale.settle > 0.5 ? s.whale.c : s.whale.mid) : k === 5 ? s.arm.c : s.orbits[2].c;
    // 远近：跟那样东西一样远（稍微往前一点，别让它自己挡住字）
    const d = Math.max(120, depthOf(pcam, center) * 0.96);
    const p = placed.get(it.def.id) ?? newPlaced();
    unproject(pcam, bb.cx, bb.cy, d, p.anchor);
    basis(pcam, d, px, p);
    placed.set(it.def.id, p);
  }

  /** 首屏 wordmark、那句话：照页面排版的那块位置，放进 3D（wordmark 跟门一样远，那句话放到星那么远） */
  function placeFixed() {
    const { h: H } = o.size();
    if (wmRects) {
      o.poseCam(1, pcam);
      for (const [id, r, px] of [['wmA', wmRects.a, wmPx.a], ['wmB', wmRects.b, wmPx.b]] as const) {
        if (!D.items.get(id)) continue;
        const d = depthOf(pcam, [0, DH, Z_FRONT]);
        const p = placed.get(id) ?? newPlaced();
        unproject(pcam, r.x + r.w / 2, r.y + r.h / 2, d, p.anchor);
        basis(pcam, d, px, p);
        placed.set(id, p);
      }
    }
    if (mottoRect && D.items.get('motto')) {
      o.poseCam(7, pcam);
      const d = DUST.mottoDepth;
      const p = placed.get('motto') ?? newPlaced();
      const r = mottoRect.box;
      unproject(pcam, r.x + r.w / 2, r.y + r.h / 2, d, p.anchor);
      basis(pcam, d, mottoPx, p);
      placed.set('motto', p);
    }
    void H;
  }

  function relayout() {
    if (!D.built) return;
    for (let k = 2; k <= 6; k++) placeAct(k);
    placeFixed();
    dirty = false;
  }

  // —— 每帧 ——
  const smoothTo = (id: string, goal: number, dt: number, tau = DUST.smooth) => {
    const cur = f.get(id) ?? 0;
    const nx = o.reduced || snapNext ? goal : cur + (goal - cur) * (1 - Math.exp(-dt / tau));
    const val = Math.abs(nx - goal) < 1e-4 ? goal : nx;
    f.set(id, val);
    return val;
  };
  const setV = (u: { value: Vector3 }, a: [number, number, number] | Vector3) => (Array.isArray(a) ? u.value.set(a[0], a[1], a[2]) : u.value.copy(a));
  function apply(it: ItemRt, p: Placed | null, F: number, alpha: number, core: [number, number, number], coreA: number, glow: [number, number, number], shadow: number, reveal = 0) {
    const u = it.u;
    const on = !!p && alpha > 0.002 && F > 0.002;
    it.vis = on;
    const la = 1 - ss(0, 0.5, lang), lz = ss(0.5, 1, lang);
    it.alpha.en.value = on ? alpha * la : 0;
    it.alpha.zh.value = on ? alpha * lz : 0;
    for (const l of ['en', 'zh'] as Lang[]) {
      const a = it.alpha[l].value > 0.002;
      if (it.crisp[l]) it.crisp[l]!.visible = a;
      if (it.refl[l]) it.refl[l]!.visible = false;   // 倒影那遍由 genesis 打开
      if (it.refl[l]) it.refl[l]!.userData.want = a;
    }
    if (!on || !p) { if (it.swarm) it.swarm.visible = false; return; }
    u.uAnchor.value.copy(p.anchor);
    u.uRight.value.copy(p.right);
    u.uUp.value.copy(p.up);
    u.uNorm.value.copy(p.norm);
    u.uF.value = F;
    u.uLang.value = lang;
    u.uReveal.value = reveal;
    setV(u.uCore, core);
    u.uCoreA.value = coreA;
    setV(u.uGlow, glow);
    u.uShadow.value = shadow;
    // 小字加一点粗：思源黑体 ExtraLight 的笔画约 0.035 em，细过 1.2 个设备像素就往外描一点
    const dev = 0.035 * p.px * o.textDpr();
    u.uBold.value = Math.max(0, Math.min(0.7, (1.25 - dev) * 0.5));
    if (it.swarm) it.swarm.visible = F > 0.002;
  }
  function srcFor(it: ItemRt, s: State, k: number) {
    const su = it.swarmU;
    if (!su) return;
    if (k === 0) { su.uSC.value.set(...s.sun.c); su.uSP.value.set(46 * s.sun.scale, 0, 0, 0); su.uChip.value = 3.6 * s.sun.scale; su.uSrc.value = 0; }
    else if (k === 1) {
      su.uSC.value.set(...s.ring.c); su.uSRot.value.fromArray(qMat(s.ring.rot)); su.uSP.value.set(RING_R * s.ring.scale, 52 * s.ring.scale, 4 * s.ring.scale, 0);
      su.uChip.value = 2.6 * s.ring.scale; su.uSrc.value = 1;
      su.uGlow.value = 0.55; su.uEmit.value = 0.55;
    } else if (k === 2) {
      const c = s.whale.settle > 0.5 ? s.whale.c : s.whale.mid;
      su.uSC.value.set(...c); su.uSRot.value.fromArray(qMat(s.whale.rot)); su.uSP.value.set(WHALE_L * s.whale.scale, 0.088 * WHALE_L * s.whale.scale, 0, 0);
      su.uChip.value = 5.2 * s.whale.scale; su.uSrc.value = 2; su.uGlow.value = 0.75; su.uEmit.value = 0.45;
    } else if (k === 3) {
      su.uSC.value.set(...s.arm.c); su.uSP.value.set(s.arm.scale, 0, 0, 0);
      su.uRA.value.fromArray(qMat(s.arm.rots[0])); su.uRB.value.fromArray(qMat(s.arm.rots[1])); su.uRC.value.fromArray(qMat(s.arm.rots[2]));
      su.uChip.value = 3.4 * s.arm.scale; su.uSrc.value = 3;
    } else {
      const ob = s.orbits[2];
      su.uSC.value.set(...ob.c); su.uSRot.value.fromArray(qMat(ob.q)); su.uSP.value.set(ob.R, Math.max(0.05, ob.draw), 0, 0);
      su.uChip.value = 2.4 * Math.max(1, ob.R / 240); su.uSrc.value = 4; su.uEmit.value = 1.1; su.uGlow.value = 0.3;
    }
  }

  function frame(s: State, P: number, cam: PerspectiveCamera, now: number, dt: number) {
    if (!D.built) return;
    if (dirty) relayout();
    // 换语言：散开、按新语言重新聚（约 0.6 秒）
    if (langT0 >= 0) {
      const k = o.reduced ? 1 : cl((now - langT0) / DUST.langMs);
      lang = mix(langFrom, langGoal, k * k * (3 - 2 * k));
      if (k >= 1) { lang = langGoal; langT0 = -1; }
    }
    const goalDive = divingOn ? 1 : 0;
    diving += (goalDive - diving) * (o.reduced ? 1 : 1 - Math.exp(-dt / 0.12));
    const dv = 1 - diving;
    const white: [number, number, number] = [0.97, 0.975, 0.985];
    // —— 第二到第六幕 ——
    for (let k = 2; k <= 6; k++) {
      const id = ACT_IDS[k - 2];
      const it = D.items.get(id);
      if (!it) continue;
      const a = P - (k - 1);
      let goal = ss(DUST.actF[0], DUST.actF[1], a) * (1 - ss(DUST.actOut[0], DUST.actOut[1], a));
      if (pass && passK !== k) goal = 0;
      if (o.reduced) goal = goal > 0.5 ? 1 : 0;
      const F = smoothTo(id, goal, dt);
      const hx = hexToUnit(HEX[k - 2]);
      const core: [number, number, number] = [mix(white[0], hx[0], 0.14), mix(white[1], hx[1], 0.14), mix(white[2], hx[2], 0.14)];
      srcFor(it, s, k - 2);
      apply(it, placed.get(id) ?? null, F, dv, core, 0.92, [hx[0] * 0.95, hx[1] * 0.95, hx[2] * 0.95], 0.42, o.reduced ? 1 : 0);
    }
    // —— 那句话 ——
    const mt = D.items.get('motto');
    if (mt) {
      let goal = ss(DUST.motto[0], DUST.motto[1], P);
      if (o.reduced) goal = goal > 0.5 ? 1 : 0;
      const F = smoothTo('motto', goal, dt, DUST.smooth * 1.3);
      const p = placed.get('motto') ?? null;
      const tint = p ? o.nebTint([p.anchor.x, p.anchor.y, p.anchor.z]) : white;
      apply(mt, p, F, dv, [1, 0.985, 0.96], 0.92, [mix(0.75, tint[0], 0.6), mix(0.75, tint[1], 0.6), mix(0.78, tint[2], 0.6)], 0.38, o.reduced ? 1 : 0);
    }
    // —— 天上五个名字 / 退路 B 的列表 ——
    const listMode = listRows.some((r) => r != null);
    if (listMode) listK += ((listOpen ? 1 : 0) - listK) * (o.reduced ? 1 : 1 - Math.exp(-dt / 0.16));
    for (let j = 0; j < 5; j++) {
      const id = SKY_IDS[j];
      const it = D.items.get(id);
      if (!it) continue;
      let goal: number, p: Placed | null = null;
      const hx = hexToUnit(HEX[j]);
      if (listMode) {
        goal = listOpen ? 1 : 0;
        const r = listRows[j];
        if (r) {
          p = placed.get(id) ?? newPlaced();
          unproject(cam, r.x + r.w / 2, r.y + r.h / 2, DUST.listDepth, p.anchor);
          basis(cam, DUST.listDepth, listPx, p);
          placed.set(id, p);
        }
        if (it.swarmU) { it.swarmU.uSrc.value = 6; it.swarmU.uChip.value = (p ? p.right.length() : 10) * 0.12; it.swarmU.uSC.value.copy(p ? p.anchor : v.set(0, 0, 0)); }
      } else {
        goal = skyOn ? ss(DUST.sky[0] + DUST.skyStagger * j, DUST.sky[1] + DUST.skyStagger * 0.6 * j, P) : 0;
        const b = skyBoxes[j];
        if (b && s.fam > 0.5) {
          const c: V3 = j === 0 ? s.sun.c : j === 1 ? s.ring.c : j === 2 ? s.whale.c : j === 3 ? s.arm.c : s.orbits[2].c;
          const d = Math.max(150, depthOf(cam, c) * 0.97);
          p = placed.get(id) ?? newPlaced();
          unproject(cam, b.x + b.w / 2, b.y + b.h / 2, d, p.anchor);
          basis(cam, d, skyPx, p);
          placed.set(id, p);
        }
        srcFor(it, s, j);
      }
      if (o.reduced) goal = goal > 0.5 ? 1 : 0;
      const F = smoothTo(id, goal, dt, listMode ? 0.16 : DUST.smooth);
      const tint = p && !listMode ? o.nebTint([p.anchor.x, p.anchor.y, p.anchor.z]) : hx;
      apply(it, p, F, dv, white, 0.92, [mix(hx[0], tint[0], 0.5), mix(hx[1], tint[1], 0.5), mix(hx[2], tint[2], 0.5)], listMode ? 0.3 : 0.55, o.reduced ? 1 : 0);
    }
    // —— 首屏 wordmark：门后的光升起来才把它照出来；往下滑就淡掉 ——
    const lit = ss(0.04, 0.82, s.light);
    const fade = 1 - ss(1.0, 1.12, P);
    for (const id of ['wmA', 'wmB']) {
      const it = D.items.get(id);
      if (!it) continue;
      const sec = id === 'wmB' ? 0.8 : 1;
      apply(it, placed.get(id) ?? null, 1, fade * dv, [white[0] * lit * sec, white[1] * lit * sec, white[2] * lit * sec], mix(0.42, 0.92, lit), [0.62 * lit, 0.66 * lit, 0.74 * lit], 0.22 * lit, 1);
    }
    snapNext = false;
  }

  /** 字块在屏幕上的框（CSS 像素）：页面里那份真字跟着它摆（读屏、搜索、点的位置都对得上） */
  function screenBox(id: string, cam: PerspectiveCamera, l: Lang): Box | null {
    const it = D.items.get(id), p = placed.get(id);
    if (!it || !p || !it.lay[l]) return null;
    const lay = it.lay[l]!;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      v3.copy(p.anchor).addScaledVector(p.right, (sx * lay.w) / 2).addScaledVector(p.up, (sy * lay.h) / 2);
      const q = proj(cam, v3);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  return {
    frame, relayout, screenBox,
    f: (id: string) => f.get(id) ?? 0,
    get lang() { return lang; },
    setLang(l: Lang, animate: boolean) {
      const g = l === 'zh' ? 1 : 0;
      if (g === langGoal && langT0 < 0) return;
      langGoal = g;
      if (!animate || o.reduced) { lang = g; langT0 = -1; return; }
      langFrom = lang; langT0 = performance.now();
    },
    setObstacles(x: { top: number; ticks: Box | null; bottom: number }) { obst = x; dirty = true; },
    setFixed(x: { wm: { a: Box; b: Box } | null; wmPx: { a: number; b: number }; motto: { box: Box; lines: number } | null; mottoPx: number; skyPx: number; listPx: number }) {
      wmRects = x.wm; wmPx = x.wmPx; mottoRect = x.motto; mottoPx = x.mottoPx; skyPx = x.skyPx; listPx = x.listPx; dirty = true;
    },
    setPass(on: boolean, k: number) { pass = on; passK = k; },
    setDiving(on: boolean) { divingOn = on; if (!on) diving = 0; },
    setSky(boxes: (Box | null)[], on: boolean) { skyBoxes = boxes; skyOn = on; },
    setList(rows: (Box | null)[] | null, open: boolean) { listRows = rows ?? [null, null, null, null, null]; listOpen = open; },
    /** 下一帧不追：直接摆到该在的样子（从栏目页后退回来、减少动效） */
    snap() { snapNext = true; },
    markDirty() { dirty = true; },
    placed,
    debug: () => Object.fromEntries(pdebug),
  };
}
export type Words = ReturnType<typeof createWords>;
