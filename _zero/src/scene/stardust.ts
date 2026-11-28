// 星尘字（v3.3，Song 11-28 10:31 选的 A）：「字也是造出来的。」
// 这个文件管「画字」：字形图集（sdf.ts）、每个名字在中英两套字里的排法、那份清楚的细发光字（原生分辨率、按画面深度被造物挡住、
// 水里另画一遍倒影）、从造物身上掉下来聚成字的碎块（颜色、材质跟那样东西一样）。字放在哪、聚到哪了，由 ./words.ts 每帧定好写进来。
import {
  BoxGeometry, CustomBlending, DataTexture, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, LinearFilter,
  LinearMipmapLinearFilter, Matrix3, Mesh, OneFactor, OneMinusSrcAlphaFactor, RedFormat, Scene, ShaderMaterial, UnsignedByteType,
  Vector2, Vector3, Vector4, Float32BufferAttribute, ZeroFactor, type Texture, type Object3D,
} from 'three';
import * as G from './glsl';
import { Atlas, SDF, famOf } from './sdf';

export type Lang = 'en' | 'zh';
export const FAM = { latin: 'Zero Display', cjk: 'Zero Hei SC' };

/** 一个名字（或那句话、wordmark）：中英两套字、字距（em）、行距（em）、碎块从哪来、多少块 */
export interface ItemDef {
  id: string;
  lines: Record<Lang, string[]>;
  ls: Record<Lang, number>;
  lh: number;
  scale?: Record<Lang, number>;   // 这一种语言的字比字号大多少（中英两套字号不一样时：wordmark、那句话……）
  src: number;           // -1 不聚（wordmark）；0 日 1 环 2 鲸 3 器 4 轨道；5 星（那句话，碎块就是天上那些星，另画）
  count: number;         // 碎块（高档）多少块
  glow: [number, number, number];      // 碎块的光（线性）：那样东西自己的颜色
  hot: boolean;          // 烧红的石块（日、器）
  emit: number;          // 每块石头自己发多少光（环、轨道）
}
export interface Layout {
  n: number;             // 几个字（不含垫的那一块暗）
  box: Float32Array;     // 每格（含第 0 格：垫的暗）左、下、宽、高（em，字块正中是原点）
  uv: Float32Array;
  g: Float32Array;       // 什么时候亮、哪种
  w: number; h: number;  // 字块多宽多高（em）
  pts: Float32Array;     // 碎块的落点：x、y（em）、那个字什么时候亮（三个一组）
}

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const hashStr = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0)!, 16777619); return h >>> 0; };

export interface ItemRt {
  def: ItemDef;
  lay: Record<Lang, Layout | null>;
  crisp: Record<Lang, Mesh | null>;
  refl: Record<Lang, Mesh | null>;
  swarm: Mesh | null;
  u: Record<string, { value: any }>;           // 几样共用的 uniform（位置、聚到哪、颜色……）
  alpha: Record<Lang, { value: number }>;
  swarmU: Record<string, { value: any }> | null;
  // —— 每帧由 words.ts 定 ——
  vis: boolean;
}

export function createStardust(o: {
  scene: Scene;                  // 主场景：碎块、水里那遍字（只在倒影那遍画）
  textScene: Scene;              // 原生分辨率那一遍：清楚的字
  U: Record<string, { value: any }>;   // genesis 的共用 uniform（时钟、灯、倒影开关……）
  depth: () => Texture | null;   // 画面的深度
  mirrorOnly: Object3D[];        // genesis 在画倒影那遍时打开这些
}) {
  const atlas = new Atlas(200);
  const tex = new DataTexture(atlas.data, atlas.W, atlas.H, RedFormat, UnsignedByteType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.needsUpdate = true;
  let texVer = -1;
  const atlasSize = new Vector2(atlas.W, atlas.H);
  const canvasSize = new Vector2(1, 1);
  const nf = new Vector2(1, 6000);
  const useDepth = { value: 0 };
  const depthU = { value: null as Texture | null };

  // 退路 B 的列表：画面压暗（墨蓝 80%）。画在清楚的字那一遍、字的前面（字不被压暗）
  const veilA = { value: 0 };
  const veil = (() => {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.instanceCount = 1;
    const m = new ShaderMaterial({
      uniforms: { uA: veilA, uInk: o.U.uInk },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: 'precision highp float; uniform float uA; uniform vec3 uInk; void main() { gl_FragColor = vec4(uInk * uA, uA); }',
      transparent: true, depthTest: false, depthWrite: false,
    });
    m.blending = CustomBlending;
    m.blendSrc = OneFactor; m.blendDst = OneMinusSrcAlphaFactor; m.blendSrcAlpha = OneFactor; m.blendDstAlpha = OneMinusSrcAlphaFactor;
    const mesh = new Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    mesh.visible = false;
    o.textScene.add(mesh);
    return mesh;
  })();
  const items = new Map<string, ItemRt>();
  const defs: ItemDef[] = [];
  let built = false;

  function define(d: ItemDef) { defs.push(d); }

  // —— 排字：一行一行，字距、拉丁字母的字偶距；字块正中是原点（y 朝上）——
  function layout(d: ItemDef, lang: Lang, nPts: number): Layout {
    const lines = d.lines[lang];
    const ls = d.ls[lang];
    const E = SDF.em;
    type Q = { x: number; y: number; w: number; h: number; u0: number; v0: number; u1: number; v1: number; line: number; xc: number; ink: Uint16Array; gw: number; gh: number; ox: number; oy: number };
    const quads: Q[] = [];
    const widths: number[] = [];
    lines.forEach((line, li) => {
      let pen = 0;
      const chars = [...line];
      const lq: Q[] = [];
      chars.forEach((ch, i) => {
        const fam = famOf(ch, FAM.latin, FAM.cjk);
        if (!atlas.has(fam, ch)) atlas.add(fam, ch);
        const g = atlas.glyphs.get(atlas.key(fam, ch))!;
        if (g.w > 0) {
          lq.push({
            x: pen + g.l, y: g.b, w: g.w / E, h: g.h / E,
            u0: g.x / atlas.W, u1: (g.x + g.w) / atlas.W, v0: (g.y + g.h) / atlas.H, v1: g.y / atlas.H,
            line: li, xc: pen + g.adv / 2, ink: g.ink, gw: g.w, gh: g.h, ox: pen + g.l, oy: g.b,
          });
        }
        pen += g.adv;
        if (i < chars.length - 1) {
          const nx = chars[i + 1];
          pen += ls;
          if (fam === FAM.latin && famOf(nx, FAM.latin, FAM.cjk) === FAM.latin) pen += atlas.kern(fam, ch, nx);
        }
      });
      widths.push(pen);
      quads.push(...lq);
    });
    const w0 = Math.max(...widths, 0.01);
    const nL = lines.length;
    // 竖着：每行的视觉正中（拉丁大写、汉字都约在基线上 0.36 em）排在 (nL − 1) / 2 行距上下
    const vis = 0.36;
    for (const q of quads) {
      const dx = -widths[q.line] / 2;
      const by = ((nL - 1) / 2 - q.line) * d.lh - vis;
      q.x += dx; q.y += by; q.xc += dx; q.ox += dx; q.oy += by;
    }
    const sc = d.scale?.[lang] ?? 1;
    if (sc !== 1) for (const q of quads) { q.x *= sc; q.y *= sc; q.w *= sc; q.h *= sc; q.xc *= sc; q.ox *= sc; q.oy *= sc; }
    const w = w0 * sc;
    const h = ((nL - 1) * d.lh + 0.92) * sc;
    const r = rng(hashStr(d.id + lang));
    // 每个字什么时候亮：从左往右带一点乱（多行的往下一行稍晚一点）
    const g0s = quads.map((q) => 0.42 + 0.26 * (0.72 * ((q.xc + w / 2) / w) + 0.12 * (q.line / Math.max(1, nL - 1)) + 0.16 * r()));
    const n = quads.length;
    const box = new Float32Array((n + 1) * 4), uv = new Float32Array((n + 1) * 4), g = new Float32Array((n + 1) * 2);
    // 第 0 格：字底下垫的一小团暗（比字块大一圈）
    const px0 = 1.3, py0 = 1.05;
    box.set([-w / 2 - px0, -h / 2 - py0, w + px0 * 2, h + py0 * 2], 0);
    g.set([0.5, 1], 0);   // 垫的暗跟着字一起出来（字开始亮的时候才有）
    quads.forEach((q, i) => {
      box.set([q.x, q.y, q.w, q.h], (i + 1) * 4);
      uv.set([q.u0, q.v0, q.u1, q.v1], (i + 1) * 4);
      g.set([g0s[i], 0], (i + 1) * 2);
    });
    // 碎块的落点：在所有笔画像素里均匀地挑
    const total = quads.reduce((s, q) => s + q.ink.length / 2, 0);
    const pts = new Float32Array(nPts * 3);
    if (total > 0) {
      const cum: number[] = [];
      let acc = 0;
      for (const q of quads) { acc += q.ink.length / 2; cum.push(acc); }
      for (let i = 0; i < nPts; i++) {
        const t = r() * total;
        let qi = 0;
        while (cum[qi] <= t) qi++;
        const q = quads[qi];
        const k = Math.min(q.ink.length / 2 - 1, Math.floor(t - (qi ? cum[qi - 1] : 0)));
        const px = q.ink[k * 2], py = q.ink[k * 2 + 1];
        pts[i * 3] = q.ox + ((px + 0.5 + (r() - 0.5) * 0.6) / E) * sc;
        pts[i * 3 + 1] = q.oy + ((q.gh - py - 0.5 + (r() - 0.5) * 0.6) / E) * sc;
        pts[i * 3 + 2] = g0s[qi];
      }
    }
    return { n, box, uv, g, w, h, pts };
  }

  const quadGeo = () => {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    return g;
  };
  const box = new BoxGeometry(1, 1, 1);

  function textMesh(lay: Layout, u: Record<string, { value: any }>, alpha: { value: number }, mirror: boolean) {
    const geo = quadGeo();
    geo.setAttribute('aBox', new InstancedBufferAttribute(lay.box, 4));
    geo.setAttribute('aUV', new InstancedBufferAttribute(lay.uv, 4));
    geo.setAttribute('aG', new InstancedBufferAttribute(lay.g, 2));
    geo.instanceCount = lay.n + 1;
    const mat = new ShaderMaterial({
      uniforms: {
        ...o.U, ...u, uAlpha: alpha,
        uAtlas: { value: tex }, uAtlasSize: { value: atlasSize }, uSpread: { value: SDF.spread }, uInMax: { value: SDF.inMax },
        uDepth: depthU, uCanvas: { value: canvasSize }, uNF: { value: nf }, uUseDepth: useDepth,
      },
      vertexShader: G.COMMON + G.TEXT_VERT,
      fragmentShader: G.COMMON + G.FRAG + G.TEXT_FRAG,
      transparent: true, depthWrite: false, depthTest: mirror, side: DoubleSide,
    });
    mat.blending = CustomBlending;
    if (mirror) { mat.blendSrc = OneFactor; mat.blendDst = OneFactor; mat.blendSrcAlpha = ZeroFactor; mat.blendDstAlpha = OneFactor; }
    else { mat.blendSrc = OneFactor; mat.blendDst = OneMinusSrcAlphaFactor; mat.blendSrcAlpha = OneFactor; mat.blendDstAlpha = OneMinusSrcAlphaFactor; }
    const m = new Mesh(geo, mat);
    m.frustumCulled = false;
    m.visible = false;
    m.renderOrder = mirror ? 9 : 1;
    return m;
  }

  function swarmMesh(d: ItemDef, en: Layout, zh: Layout, u: Record<string, { value: any }>) {
    const N = d.count;
    const geo = new InstancedBufferGeometry();
    geo.setIndex(box.getIndex());
    geo.setAttribute('position', box.getAttribute('position'));
    geo.setAttribute('normal', box.getAttribute('normal'));
    const r = rng(hashStr(d.id + 'swarm'));
    const seed = new Float32Array(N * 4), idx = new Float32Array(N), te = new Float32Array(N * 3), tz = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      seed.set([r(), r(), r(), r()], i * 4);
      idx[i] = i / N;
      te.set(en.pts.subarray(i * 3, i * 3 + 3), i * 3);
      tz.set(zh.pts.subarray(i * 3, i * 3 + 3), i * 3);
    }
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4));
    geo.setAttribute('aIdx', new InstancedBufferAttribute(idx, 1));
    geo.setAttribute('aTE', new InstancedBufferAttribute(te, 3));
    geo.setAttribute('aTZ', new InstancedBufferAttribute(tz, 3));
    geo.instanceCount = N;
    const su: Record<string, { value: any }> = {
      uN: { value: N }, uForm: { value: 1 }, uC: { value: new Vector3() }, uScale: { value: 1 },
      uGlowCol: { value: new Vector3(...d.glow) }, uGlow: { value: 0.6 }, uHot: { value: d.hot ? 1 : 0 }, uCDark: { value: 0 },
      uEmit: { value: d.emit }, uBright: { value: 1 },
      uMote: { value: 0.035 }, uChip: { value: 3 }, uSrc: { value: d.src },
      uSC: { value: new Vector3() }, uSRot: { value: new Matrix3() }, uSP: { value: new Vector4(46, 0, 0, 0) },
      uRA: { value: new Matrix3() }, uRB: { value: new Matrix3() }, uRC: { value: new Matrix3() },
    };
    const mat = new ShaderMaterial({
      uniforms: { ...o.U, ...u, ...su },
      vertexShader: G.COMMON + G.CHIP_HEAD + G.DUST_CHIP + G.CHIP_MAIN,
      fragmentShader: G.COMMON + G.FRAG + G.CHIP_FRAG,
    });
    const m = new Mesh(geo, mat);
    m.frustumCulled = false;
    m.visible = false;
    return { m, su };
  }

  /** 字体载好以后：排字、算字形、搭网格（分几小段做，不卡开场）。wordmark 先做 */
  async function build(order: string[]) {
    if (built) return;
    const sorted = [...defs].sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
    // 先把要用到的字一个个画进图集（每段 ~6 毫秒）
    const want: [string, string][] = [];
    for (const d of sorted) for (const l of ['en', 'zh'] as Lang[]) for (const line of d.lines[l]) for (const ch of line) {
      const fam = famOf(ch, FAM.latin, FAM.cjk);
      if (!want.some(([f, c]) => f === fam && c === ch)) want.push([fam, ch]);
    }
    let i = 0;
    while (i < want.length) {
      const t0 = performance.now();
      while (i < want.length && performance.now() - t0 < 6) { atlas.add(want[i][0], want[i][1]); i++; }
      if (i < want.length) await new Promise((r) => setTimeout(r, 0));
    }
    for (const d of sorted) {
      const u: Record<string, { value: any }> = {
        uAnchor: { value: new Vector3() }, uRight: { value: new Vector3(1, 0, 0) }, uUp: { value: new Vector3(0, 1, 0) }, uNorm: { value: new Vector3(0, 0, 1) },
        uF: { value: 0 }, uLang: { value: 0 }, uReveal: { value: 0 },
        uCore: { value: new Vector3(1, 1, 1) }, uCoreA: { value: 0.92 }, uGlow: { value: new Vector3(0.5, 0.5, 0.5) }, uShadow: { value: 0.5 }, uBold: { value: 0 },
      };
      const n = Math.max(1, d.count);
      const en = layout(d, 'en', n), zh = layout(d, 'zh', n);
      const alpha = { en: { value: 0 }, zh: { value: 0 } };
      const it: ItemRt = { def: d, lay: { en, zh }, crisp: { en: null, zh: null }, refl: { en: null, zh: null }, swarm: null, u, alpha, swarmU: null, vis: false };
      for (const l of ['en', 'zh'] as Lang[]) {
        const c = textMesh(it.lay[l]!, u, alpha[l], false);
        o.textScene.add(c);
        it.crisp[l] = c;
        const rf = textMesh(it.lay[l]!, u, alpha[l], true);
        o.scene.add(rf);
        o.mirrorOnly.push(rf);
        it.refl[l] = rf;
      }
      if (d.src >= 0 && d.src <= 4 && d.count > 0) {
        const { m, su } = swarmMesh(d, en, zh, u);
        o.scene.add(m);
        it.swarm = m;
        it.swarmU = su;
      }
      items.set(d.id, it);
      await new Promise((r) => setTimeout(r, 0));
    }
    built = true;
  }

  /** 每帧：图集有新字就重传；画布、深度、远近平面 */
  function frame(canvasW: number, canvasH: number, depth: Texture | null, near: number, far: number) {
    if (atlas.version !== texVer) {
      texVer = atlas.version;
      (tex.image as { data: Uint8Array; width: number; height: number }) = { data: atlas.data, width: atlas.W, height: atlas.H };
      atlasSize.set(atlas.W, atlas.H);
      tex.needsUpdate = true;
    }
    canvasSize.set(canvasW, canvasH);
    depthU.value = depth;
    useDepth.value = depth ? 1 : 0;
    nf.set(near, far);
  }

  return {
    atlas, define, build, frame, items,
    get built() { return built; },
    setVeil(a: number) { veilA.value = a; veil.visible = a > 0.002; },
    /** 档位：每个名字多少块碎块 */
    setBudget(k: number) {
      for (const it of items.values()) if (it.swarm) (it.swarm.geometry as InstancedBufferGeometry).instanceCount = Math.max(16, Math.round(it.def.count * k));
    },
  };
}
export type Stardust = ReturnType<typeof createStardust>;
