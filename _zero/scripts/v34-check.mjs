// 零肉身造物 v3.4 验收（施工单 _ops/零肉身造物/v3.4施工单.md 的「测」，加上 CEO 11-28 加的黑屏回归）。四部分：
//  scan   重叠检查：四个手机竖屏（390×844、360×780、430×932、390×664），进度 P 从 1 到 7 每 0.05 一格，每格再按 35 个时钟量
//         （第七幕鲸在天上兜圈子、转着头游，兜到哪都要量）。造好了的东西两两外圈（src/scene/marks.ts）之间至少 8 像素，一格都不许叠。
//         手机横着 844×390、电脑 1440×900 也照样量一遍，只记数（电脑上第五、六幕本来就叠着，那套不动）。
//  names  第二到第六幕的展示位置上：那一幕的名字、「进去」不被造好的东西压着；造好的东西不出屏；量名字离它那样东西多远。
//  same   手机横着、电脑、横着的平板（宽高比 ≥ 0.8）：跟改前（BEFORE，默认线上）在 14 个进度上比整个画面状态（每样造物的位置、大小、
//         转角、镜头），再比第二到第六幕名字摆在哪，一个数都不许差——宽高比 ≥ 0.8 一个像素不动。只在 Chromium 跑（只是算数，跟内核无关）。
//  black  黑屏回归（v3.3.1 修的那个：核显上自动降分辨率、拉窗口以后整张画面变黑只剩字）：手机竖屏、两倍屏，画面画出来以后
//         把画布拉窄再拉回、手机横过来再竖回去、等它自己降一次档（navigator.webdriver 改成 false，降档那段才跑；没显卡的机器本来就慢，会降），
//         每一步之后截门那一块量亮度，不许变黑。
// 跑法：node scripts/v34-check.mjs <输出目录>
//   BASE    网站根（默认线上 https://qianshoulab.github.io）；ENGINE chromium | webkit | firefox（默认 chromium）
//   BEFORE  改前的网站根，same 跟它比（默认线上；设成 none 不比——并进 main 以后线上就是这一版，没得比）
//   ONLY    只跑这几部分（如 scan,names）；PW_MODULE 本地调试指到别的 playwright
// 结果写进 <输出目录>/v34-<内核>.json；有一条不过，退出码就是 1。
const { chromium, webkit, firefox } = await import(process.env.PW_MODULE || 'playwright');
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'v34-check';
const BASE = (process.env.BASE || 'https://qianshoulab.github.io').replace(/\/$/, '');
const BEFORE = (process.env.BEFORE || 'https://qianshoulab.github.io').replace(/\/$/, '');
const ENGINE = process.env.ENGINE || 'chromium';
const ONLY = (process.env.ONLY || 'scan,names,same,black').split(',');
const PHONES = [[390, 844], [360, 780], [430, 932], [390, 664]];
const OTHERS = [[844, 390], [1440, 900]];
const SAME = [[844, 390], [1440, 900], [1180, 820]];
const SAME_PS = [1, 1.5, 1.88, 2.5, 2.88, 3.5, 3.88, 4.5, 4.88, 5.15, 5.5, 5.88, 6.5, 7];
const REST = [1, 1.88, 2.88, 3.88, 4.88, 5.88, 7];
const CLOCKS = Array.from({ length: 35 }, (_, i) => i * 4);   // 0..136 秒：鲸在天上一圈 110 秒，第六幕轨道一圈 28–66 秒
const MIN_GAP = 8;     // 两样造物外圈之间至少留这么多像素
const NAME_GAP = 2;    // 名字、「进去」跟造物外圈之间至少这么多（不压上就行）
const LAUNCH = {
  chromium: () => chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }),
  webkit: () => webkit.launch(),
  firefox: () => firefox.launch({ firefoxUserPrefs: { 'webgl.force-enabled': true } }),
};
mkdirSync(out, { recursive: true });
const res = { engine: ENGINE, base: BASE, before: BEFORE, at: new Date().toISOString(), scan: [], names: [], same: [], black: [], fails: [] };
const fail = (part, msg) => { res.fails.push(`${part}：${msg}`); console.log(`  ✗ ${part}：${msg}`); };
const save = () => writeFileSync(`${out}/v34-${ENGINE}.json`, JSON.stringify(res, null, 1));

const browser = await LAUNCH[ENGINE]();
const mobileOk = ENGINE !== 'firefox';   // Firefox 不认 isMobile
async function open(w, h, url, extra = {}) {
  const mobile = w < 600 && mobileOk;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(mobile ? { isMobile: true, hasTouch: true } : {}), ...extra });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 240)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 240)));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.gl, null, { timeout: 120000 });
  const gl = await page.evaluate(() => document.documentElement.dataset.gl);
  if (gl === 'yes') await page.waitForFunction(() => window.__zero && window.__zero.frames() >= 3, null, { timeout: 300000 });
  return { ctx, page, errs, gl };
}

// ———— 1. 重叠检查 + 2. 名字 ————
if (ONLY.includes('scan') || ONLY.includes('names')) {
  // 中文量一遍（重叠检查 + 名字），英文再量一遍名字（英文名字宽：CYBER BODEGA、SPECIMENS、ARTIFACTS）
  for (const [w, h, lang] of [...PHONES.map(([a, b]) => [a, b, 'zh']), ...OTHERS.map(([a, b]) => [a, b, 'zh']), ...PHONES.map(([a, b]) => [a, b, 'en'])]) {
    const phone = w < h && w / h < 0.8;
    const scanThis = lang === 'zh';
    if (!scanThis && !ONLY.includes('names')) continue;
    const t0 = Date.now();
    const { ctx, page, errs, gl } = await open(w, h, `${BASE}/zero/?act=1&t=5&tier=low&dpr=0.3&lang=${lang}`);
    if (gl !== 'yes') { res.scan.push({ size: `${w}x${h}`, gl, note: '没有 WebGL（走静态图），量不了' }); await ctx.close(); continue; }
    // 名字摆在哪要等字体载好、星尘字搭好（最多等 20 秒；搭不起来名字那部分就记「量不到」）
    await page.waitForFunction(() => document.documentElement.dataset.dust, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => ({ phone: window.__zero.phone(), mode: window.__zero.names().mode, dust: document.documentElement.dataset.dust || '', built: window.__zero.built() }));
    if (ONLY.includes('scan') && scanThis) {
      const r = await page.evaluate(({ clocks, minGap }) => window.__zero.overlapScan({ from: 1, to: 7, step: 0.05, clocks, minGap }), { clocks: CLOCKS, minGap: MIN_GAP });
      const row = { size: `${w}x${h}`, phone, ...info, cells: r.cells, grid: r.grid, clocks: r.clocks, worst: r.worst, worstAt: r.worstAt, fails: r.fails.length, failList: r.fails.slice(0, 60), ms: Date.now() - t0, errors: errs.slice(0, 5) };
      // 一格里叠了几对都算：数「叠了几处」按 (P, 谁跟谁) 合并（不同时钟算一处）
      const spots = new Map();
      for (const f of r.fails) { const k = `${f.P} ${f.a}–${f.b}`; const e = spots.get(k); if (!e || f.gap < e.gap) spots.set(k, f); }
      row.spots = spots.size;
      res.scan.push(row);
      console.log(`scan ${w}x${h}${phone ? '（手机竖屏）' : ''}：${r.grid} 格 × ${r.clocks} 个时钟，最窄 ${r.worst} 像素（${r.worstAt}），叠/挤 ${r.fails.length} 格、${spots.size} 处`);
      if (phone && r.fails.length) fail('重叠检查', `${w}x${h} 有 ${spots.size} 处缝不到 ${MIN_GAP} 像素：` + [...spots.values()].slice(0, 6).map((f) => `P ${f.P} ${f.a}–${f.b} ${f.gap}`).join('；'));
      if (errs.length) fail('控制台', `${w}x${h} ${errs[0]}`);
    }
    if (ONLY.includes('names') && phone) {
      if (info.dust !== 'yes') { res.names.push({ size: `${w}x${h}`, lang, note: '星尘字没搭起来，名字的位置量不到' }); fail('名字', `${w}x${h} ${lang} 星尘字没搭起来`); }
      else {
        const r = await page.evaluate(({ rest, clocks, nameGap }) => {
          const z = window.__zero, built = z.built();
          const segBox = (c, b) => {
            const n = Math.max(1, Math.ceil(Math.hypot(c.bx - c.ax, c.by - c.ay) / 4));
            let g = 1e9;
            for (let i = 0; i <= n; i++) {
              const x = c.ax + ((c.bx - c.ax) * i) / n, y = c.ay + ((c.by - c.ay) * i) / n;
              const dx = Math.max(b.x - x, 0, x - (b.x + b.w)), dy = Math.max(b.y - y, 0, y - (b.y + b.h));
              const inside = dx === 0 && dy === 0 ? -Math.min(x - b.x, b.x + b.w - x, y - b.y, b.y + b.h - y) : Math.hypot(dx, dy);
              g = Math.min(g, inside - c.r);
            }
            return g;
          };
          const footBox = (f, b) => Math.min(...f.caps.map((c) => segBox(c, b)));
          const ptsBox = (pts, b) => { let g = 1e9; for (let i = 0; i < pts.length; i += 2) { const dx = Math.max(b.x - pts[i], 0, pts[i] - (b.x + b.w)), dy = Math.max(b.y - pts[i + 1], 0, pts[i + 1] - (b.y + b.h)); g = Math.min(g, Math.hypot(dx, dy)); } return g; };
          const boxBox = (a, b) => Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h));
          const acts = [], screen = [];
          const ids = ['sun', 'ring', 'whale', 'arm'];
          for (let k = 2; k <= 6; k++) {
            const P = rest[k - 1];
            let worst = 1e9, worstWho = '', own = 1e9, door = 1e9, box = null;
            for (const t of clocks) {
              const m = z.marksAt(P, t);
              const nb = m.names[k];
              if (!nb) continue;
              box = nb;
              for (const f of m.feet) {
                if (f.vis <= 0.5 || P < built[f.id]) continue;
                const g = Math.min(footBox(f, nb.name), footBox(f, nb.go));
                if (g < worst) { worst = g; worstWho = f.id; }
              }
              // 离它自己那样东西多远：第二到第五幕是日、环、鲸、器的外圈；第六幕是三道轨道画出来的那一截
              const o = k <= 5 ? footBox(m.feet.find((f) => f.id === ids[k - 2]), nb.name) : Math.min(...m.arcs.filter((a) => a.length).map((a) => ptsBox(a, nb.name)));
              own = Math.min(own, o);
              door = Math.min(door, boxBox(nb.name, m.door));
            }
            acts.push({ k, P, name: box && box.name, go: box && box.go, worst: +worst.toFixed(1), worstWho, own: +own.toFixed(1), door: +door.toFixed(1), ok: worst >= nameGap });
          }
          // 不出屏：每个展示位置（含首屏、开天），造好的东西整个在屏里
          const W = innerWidth, H = innerHeight;
          for (const P of rest) {
            let worst = 1e9, who = '';
            for (const t of clocks) {
              const m = z.marksAt(P, t);
              for (const f of m.feet) {
                if (f.vis <= 0.5 || P < built[f.id]) continue;
                const o = Math.min(f.box.x0, f.box.y0, W - f.box.x1, H - f.box.y1);
                if (o < worst) { worst = o; who = f.id; }
              }
            }
            screen.push({ P, worst: worst > 1e8 ? null : +worst.toFixed(1), who });
          }
          return { acts, screen };
        }, { rest: REST, clocks: CLOCKS.filter((_, i) => i % 3 === 0), nameGap: NAME_GAP });
        res.names.push({ size: `${w}x${h}`, lang, ...r });
        for (const a of r.acts) {
          console.log(`names ${w}x${h} ${lang} 第${a.k}幕：名字 / 「进去」离造好的东西最近 ${a.worst} 像素（${a.worstWho}），离它自己那样东西 ${a.own}，离门 ${a.door}`);
          if (!a.ok) fail('名字', `${w}x${h} ${lang} 第${a.k}幕名字或「进去」被 ${a.worstWho} 压着（${a.worst} 像素）`);
        }
        for (const s of r.screen) if (s.worst != null && s.worst < 0) fail('出屏', `${w}x${h} P ${s.P} ${s.who} 出屏 ${-s.worst} 像素`);
      }
    }
    await ctx.close();
    save();
  }
}

// ———— 3. 宽高比 ≥ 0.8 跟改前一模一样 ————
if (ONLY.includes('same') && ENGINE === 'chromium' && BEFORE !== 'none') {
  const pick = async (site, w, h, P, names = false) => {
    const { ctx, page, gl } = await open(w, h, `${site}/zero/?act=${P}&t=5&tier=low&dpr=0.3`);
    let s = gl === 'yes' ? await page.evaluate(() => JSON.parse(JSON.stringify(window.__zero.state()))) : null;
    // 第二到第六幕的名字摆在哪（星尘字搭好以后量的；电脑上也一个像素不许挪）
    if (s && names) {
      await page.waitForFunction(() => document.documentElement.dataset.dust, null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(400);
      s = { state: s, place: await page.evaluate(() => { const p = window.__zero.dust().place || {}; return Object.fromEntries(['a2', 'a3', 'a4', 'a5', 'a6'].map((k) => [k, p[k] ? { cx: p[k].cx, cy: p[k].cy, px: p[k].px } : null])); }) };
    }
    await ctx.close();
    return s;
  };
  const diff = (a, b, path = '') => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) ? [] : [`${path} ${a} ≠ ${b}`];
    if (Array.isArray(a) && Array.isArray(b)) return a.length !== b.length ? [`${path} 长度 ${a.length} ≠ ${b.length}`] : a.flatMap((x, i) => diff(x, b[i], `${path}[${i}]`));
    if (a && b && typeof a === 'object' && typeof b === 'object') return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => (k in a && k in b ? diff(a[k], b[k], `${path}.${k}`) : [`${path}.${k} 只有一边有`]));
    return a === b ? [] : [`${path} ${a} ≠ ${b}`];
  };
  for (const [w, h] of SAME) {
    let n = 0;
    const bad = [];
    for (const P of SAME_PS) {
      const names = P === SAME_PS[0];
      const [a, b] = [await pick(BASE, w, h, P, names), await pick(BEFORE, w, h, P, names)];
      if (!a || !b) { bad.push(`P ${P} 拿不到画面状态`); continue; }
      const d = diff(a, b);
      n++;
      if (d.length) bad.push(`P ${P}：${d.length} 个数不一样，如 ${d.slice(0, 3).join('；')}`);
    }
    res.same.push({ size: `${w}x${h}`, ps: n, same: bad.length === 0, bad });
    console.log(`same ${w}x${h}：${n} 个进度${bad.length ? '，有不一样的：' + bad[0] : '，跟改前一个数都不差'}`);
    if (bad.length) fail('电脑 / 横着不许动', `${w}x${h} ${bad[0]}`);
    save();
  }
}

// ———— 4. 黑屏回归 ————
if (ONLY.includes('black')) {
  const P = 1.88;   // 第二幕展示位置：门、门缝的光、日都在
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ...(mobileOk ? { isMobile: true, hasTouch: true } : {}) });
  // 自动降档只在 navigator.webdriver 不是 true 的时候跑（genesis.ts 的 adaptive）
  await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true }); } catch { /* 改不了就算了 */ } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 240)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 240)));
  await page.goto(`${BASE}/zero/?act=${P}&t=5`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.gl, null, { timeout: 120000 });
  const gl = await page.evaluate(() => document.documentElement.dataset.gl);
  if (gl !== 'yes') { res.black.push({ note: '没有 WebGL（走静态图），不用量' }); console.log('black：没有 WebGL，跳过'); }
  else {
    await page.waitForFunction(() => window.__zero.frames() >= 5, null, { timeout: 300000 });
    const webdriver = await page.evaluate(() => navigator.webdriver);
    const lum = async (label) => {
      // 等这一步以后再画 3 帧，再截门那一块（按这一刻的画布大小量门在哪）
      const f0 = await page.evaluate(() => window.__zero.frames());
      await page.waitForFunction((f) => window.__zero.frames() >= f + 3, f0, { timeout: 300000 });
      const st = await page.evaluate((p) => { const m = window.__zero.marksAt(p, 5); return { door: m.door, dpr: window.__zero.dpr(), tier: window.__zero.tier(), w: innerWidth, h: innerHeight, rt: window.__zero.rt() }; }, P);
      const d = st.door;
      const clip = { x: Math.max(0, d.x), y: Math.max(0, d.y), width: Math.max(4, Math.min(st.w, d.x + d.w) - Math.max(0, d.x)), height: Math.max(4, Math.min(st.h, d.y + d.h) - Math.max(0, d.y)) };
      const buf = await page.screenshot({ clip });
      const v = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const px = x.getImageData(0, 0, c.width, c.height).data;
        let s = 0, hi = 0;
        for (let i = 0; i < px.length; i += 4) { const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; s += l; if (l > 60) hi++; }
        return { mean: s / (px.length / 4), bright: hi / (px.length / 4) };
      }, buf.toString('base64'));
      writeFileSync(`${out}/黑屏回归-${res.black.length + 1}-${label.replace(/[\/\\:*?"<>| ]+/g, '_')}.png`, buf);
      const row = { step: label, mean: +v.mean.toFixed(1), bright: +v.bright.toFixed(3), dpr: st.dpr, tier: st.tier, size: `${st.w}x${st.h}`, door: clip, rt: st.rt };
      // 画面那张图：尺寸一变就得是新建的一张（v3.3.1 的修法；改回 setSize 在核显上就黑），大小跟画布 × 画面分辨率对得上
      const prev = res.black.filter((x) => x.rt).at(-1);
      if (st.rt) {
        const want = [Math.round(st.rt.cw * st.rt.dpr), Math.round(st.rt.ch * st.rt.dpr)];
        row.rtOk = st.rt.w === want[0] && st.rt.h === want[1];
        if (!row.rtOk) fail('黑屏回归', `${label}以后画面那张图 ${st.rt.w}×${st.rt.h}，跟画布 × 分辨率 ${want[0]}×${want[1]} 对不上`);
        if (prev && (prev.rt.w !== st.rt.w || prev.rt.h !== st.rt.h)) {
          row.rtNew = prev.rt.id !== st.rt.id;
          if (!row.rtNew) fail('黑屏回归', `${label}：画面那张图尺寸变了（${prev.rt.w}×${prev.rt.h} → ${st.rt.w}×${st.rt.h}）却还是原来那张——改回 setSize 了？核显上会黑`);
        }
      }
      res.black.push(row);
      console.log(`black ${label}：门那一块平均亮度 ${row.mean}（满 255），亮点占 ${(row.bright * 100).toFixed(1)}%，画面分辨率 ${st.dpr}、档位 ${st.tier}、${row.size}，画面那张图 ${st.rt ? `${st.rt.w}×${st.rt.h} 第 ${st.rt.id} 张${row.rtNew === true ? '（新建的）' : ''}` : '没有（直接画在画布上）'}`);
      return row;
    };
    const first = await lum('刚画出来');
    const floor = Math.max(10, first.mean * 0.4);
    const check = (r) => { if (r.mean < floor) fail('黑屏回归', `${r.step}以后门那一块平均亮度 ${r.mean}，低于 ${floor.toFixed(1)}（刚画出来是 ${first.mean}）`); };
    // 把画布（宿主元素）拉窄、拉回
    await page.evaluate(() => { document.querySelector('[data-gl-host]').style.width = '58%'; });
    check(await lum('画布拉窄'));
    await page.evaluate(() => { document.querySelector('[data-gl-host]').style.width = ''; });
    check(await lum('画布拉回'));
    // 手机横过来、再竖回去
    await page.setViewportSize({ width: 844, height: 390 });
    const land = await lum('横过来');
    if (land.mean < 10) fail('黑屏回归', `横过来以后门那一块平均亮度 ${land.mean}`);
    await page.setViewportSize({ width: 390, height: 844 });
    check(await lum('竖回去'));
    // 等它自己降档（没显卡的机器一帧几百毫秒，90 帧平均一帧超过 20 毫秒就降：先降画面分辨率，再降档）
    const before = await page.evaluate(() => ({ dpr: window.__zero.dpr(), tier: window.__zero.tier() }));
    const dropped = await page.waitForFunction((b) => window.__zero.dpr() !== b.dpr || window.__zero.tier() !== b.tier, before, { timeout: 240000 }).then(() => true).catch(() => false);
    if (!dropped) {
      res.black.push({ step: '自动降档', note: `等了 240 秒没降（画面分辨率 ${before.dpr}、档位 ${before.tier}；webdriver=${webdriver}）` });
      if (first.dpr > 1.05 || first.tier !== 'low') fail('黑屏回归', `等了 240 秒没自动降档（webdriver=${webdriver}），降档以后那一步没量到`);
      else console.log('black：已经是最低档、分辨率 1，没得降');
    } else {
      const r = await lum(`自动降档（${before.dpr}、${before.tier} 降了一步）`);
      check(r);
      // 再等一次（降到底为止），每降一次量一次，最多再等两次
      for (let i = 0; i < 2; i++) {
        const b2 = await page.evaluate(() => ({ dpr: window.__zero.dpr(), tier: window.__zero.tier() }));
        const again = await page.waitForFunction((b) => window.__zero.dpr() !== b.dpr || window.__zero.tier() !== b.tier, b2, { timeout: 90000 }).then(() => true).catch(() => false);
        if (!again) break;
        check(await lum(`又降一次（${b2.dpr}、${b2.tier} 再降一步）`));
      }
    }
    if (errs.length) fail('黑屏回归', `控制台报错：${errs[0]}`);
    res.blackWebdriver = webdriver;
  }
  await ctx.close();
  save();
}

await browser.close();
res.ok = res.fails.length === 0;
save();
console.log(res.ok ? `v3.4 验收（${ENGINE}）全过` : `v3.4 验收（${ENGINE}）没过 ${res.fails.length} 条`);
process.exit(res.ok ? 0 : 1);
