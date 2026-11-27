// 光：加法混合的那几样。门缝和窗里漏出来的光（贴在门前的一块片子上）、火舌和星星和火星（点）、轨道和星座的线（细带子）。
// 倒影那一遍也画（沿水面翻过来），水面上就有它们的倒影。

/** 门缝、窗、指到那撮的光：贴在门正面前一点点的一块片子，四边淡到零 */
export const GLOW_VERT = /* glsl */ `
varying vec3 vW;
varying vec2 vQ;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.);
  vW = w.xyz;
  vQ = position.xy;
  vec3 p = w.xyz;
  p.y *= uMirror;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}
`;

export const GLOW_FRAG = /* glsl */ `
uniform float uSlit;       // 门缝那条竖光有多亮
uniform float uSlitGrow;   // 第一幕：竖光从下往上亮到哪（0..1）
uniform float uGap;        // 门缝现在多宽（世界单位）
uniform vec4 uWinRect[5];
uniform vec3 uWinCol[5];
uniform float uWinOn[5];
uniform float uHovGlow[5];
uniform vec3 uSecCol[5];
uniform float uWhite;
varying vec3 vW;
varying vec2 vQ;
void main() {
  vec2 q = vW.xy;
  float H = uGate.y;
  vec3 col = vec3(0.);
  // 门缝：一条竖光，发丝细，芯子白；门开得越大越宽。只到门顶为止，上下两头收得很干净（不在门顶冒一颗星）
  float top = H * uSlitGrow;
  float dy = max(max(q.y - top, -q.y), 0.);
  float tipFade = exp(-dy / .9);
  float hx = abs(q.x);
  float core = uGap * .5 + .18;
  float narrow = (1. - smoothstep(core * .5, core + .35, hx)) * 3.2 + exp(-hx / (1.1 + uGap * .4)) * 1.1;
  float wide = exp(-hx / 6.) * .26 + exp(-hx / 22.) * .05;
  // 竖光最亮的是中段，两头稍暗；第一幕往上长的时候，尖上那一截最亮（只亮芯子，不往两边铺）
  float along = .7 + .3 * exp(-abs(q.y - .45 * H) / 140.);
  float grow = uSlitGrow < .999 ? (1. + 2.2 * exp(-abs(q.y - top) / 5.)) : 1.;
  float wideFade = exp(-dy / 6.) * (1. - .7 * sstep(H * .8, H * 1.02, q.y));
  col += glowCol((narrow * grow * tipFade + wide * wideFade) * along * uSlit, uActCol);
  // 门上的窗：光从缺口里往外涌，窗口一圈软光
  for (int k = 0; k < 5; k++) {
    if (uWinOn[k] > 0.) {
      float d = max(rectSD(q, uWinRect[k].xy, uWinRect[k].zw), 0.);
      // 窗洞里面交给天那一层（光源本身），这里只画从窗口漫到门面上的那圈光
      float g = (.16 * exp(-d / 1.6) + .07 * exp(-d / 6.) + .025 * exp(-d / 20.)) * uWinOn[k] * mix(.25, 1., step(.01, d));
      col += glowCol(g, uWinCol[k]);
    }
    if (uHovGlow[k] > 0.) {
      float d = max(rectSD(q, uWinRect[k].xy, uWinRect[k].zw), 0.);
      col += glowCol((.25 * exp(-d / 2.) + .12 * exp(-d / 10.)) * uHovGlow[k], uSecCol[k]);
    }
  }
  // 四边淡到零：看不出这是一块片子
  vec2 e = abs(vQ) * 2.;
  float win = (1. - smoothstep(.6, 1., e.x)) * (1. - smoothstep(.75, 1., e.y));
  col *= win * (1. - .9 * uWhite);
  if (uMirror < 0.) col *= .8;
  gl_FragColor = outAdd(col);
}
`;

/** 点：火舌、火星、星星、浮尘。每样东西写自己的 placePt()，算出位置、大小（世界单位）、颜色亮度 */
export const POINT_HEAD = /* glsl */ `
uniform float uPxScale;   // 1 个世界单位在 1 远处是多少像素
varying vec3 vC;
varying float vSoft;
`;

export const POINT_MAIN = /* glsl */ `
void main() {
  vec3 p = vec3(0.);
  float size = 0.;
  vec3 col = vec3(0.);
  float soft = 1.;
  bool vis = placePt(p, size, col, soft);
  vec3 cam = uMirror < 0. ? vec3(uCamPos.x, -uCamPos.y, uCamPos.z) : uCamPos;
  float dist = length(p - cam);
  if (uMirror < 0.) col *= exp(-max(p.y, 0.) / 230.) * .85;
  vec3 pp = p;
  pp.y *= uMirror;
  vec4 mv = viewMatrix * vec4(pp, 1.);
  gl_Position = (vis && size > 0.) ? projectionMatrix * mv : vec4(2., 2., 2., 1.);
  float px = size * uPxScale / max(-mv.z, 1.);
  // 小于一个像素的点：画一个像素，亮度按面积减（远处的星不闪）
  float big = max(px, 1.25);
  gl_PointSize = min(big, 64.);
  vC = col * (px * px) / (big * big);
  vSoft = soft;
}
`;

export const POINT_FRAG = /* glsl */ `
varying vec3 vC;
varying float vSoft;
void main() {
  vec2 c = gl_PointCoord - .5;
  float r2 = dot(c, c) * 4.;
  float a = mix(1. - smoothstep(.55, 1., r2), exp(-r2 * 3.2), vSoft);
  if (a < .003) discard;
  gl_FragColor = outAdd(vC * a);
}
`;

/** 细线：轨道、星座。每段是一条在屏幕上撑开的细带子（1.3 个像素宽，边上抗锯齿），系统缩放 125–175% 也不断 */
export const LINE_VERT = /* glsl */ `
attribute vec4 aA;        // 这一段的起点（xyz）+ 沿线的位置（w，0..1）
attribute vec4 aB;        // 终点 + 沿线的位置
attribute float aSide;    // -1 / 1：带子的哪一边
attribute float aEnd;     // 0 起点 1 终点
uniform vec2 uView;       // 画布像素大小
uniform float uWidth;     // 线宽（像素）
varying float vEdge;
varying float vAlong;
varying vec3 vWp;
// 每样东西写自己的 placeLine()：把一段的两头摆到世界里（可以随进度、时钟动）
`;

export const LINE_MAIN = /* glsl */ `
void main() {
  vec3 a = aA.xyz, b = aB.xyz;
  float sa = aA.w, sb = aB.w;
  placeLine(a, b, sa, sb);
  vec3 pa = a, pb = b;
  pa.y *= uMirror; pb.y *= uMirror;
  vec4 ca = projectionMatrix * viewMatrix * vec4(pa, 1.);
  vec4 cb = projectionMatrix * viewMatrix * vec4(pb, 1.);
  vec4 cp = aEnd < .5 ? ca : cb;
  vec2 na = ca.xy / max(ca.w, 1e-3), nb = cb.xy / max(cb.w, 1e-3);
  vec2 dir = (nb - na) * uView;
  float l = length(dir);
  dir = l > 1e-5 ? dir / l : vec2(1., 0.);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 off = nrm * aSide * (uWidth * .5 + 1.) / uView * 2.;
  gl_Position = (ca.w > 0. && cb.w > 0.) ? vec4(cp.xy + off * cp.w, cp.zw) : vec4(2., 2., 2., 1.);
  vEdge = aSide * (uWidth * .5 + 1.);
  vAlong = aEnd < .5 ? sa : sb;
  vWp = aEnd < .5 ? a : b;
}
`;

export const LINE_FRAG = /* glsl */ `
uniform float uWidth;
varying float vEdge;
varying float vAlong;
varying vec3 vWp;
// 每样东西写自己的 lineColor(沿线位置, 世界坐标) → 颜色
void main() {
  float a = 1. - smoothstep(uWidth * .5 - .5, uWidth * .5 + .7, abs(vEdge));
  vec3 c = lineColor(vAlong, vWp) * a;
  if (uMirror < 0.) c *= exp(-max(vWp.y, 0.) / 230.) * .8;
  if (dot(c, c) < 1e-9) discard;
  gl_FragColor = outAdd(c);
}
`;
