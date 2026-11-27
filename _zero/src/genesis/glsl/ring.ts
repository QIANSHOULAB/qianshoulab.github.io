// Ⅲ 布环 · 02 赛博杂货铺（品红）：上千块碎石从门缝里像瀑布一样涌出来，不往水里掉，贴着一个看不见的弧面流，
// 绕门走一整圈，首尾接上，成了一道环。门从环心穿过。环上六颗小月 = 货架上那几样小工具；滑的时候环在转，转到正面的那颗亮一下。

/** 环上一点：角度 ph（0 在右、π/2 在正前方、π 在左），半径 rho，离环面多高 h。环面前低后高地倾着 */
export const RING_FN = /* glsl */ `
uniform vec3 uRingC;      // 环心
uniform float uTilt;      // 环面倾角（前低后高）
uniform float uRingYaw;   // 第六幕：环被接住以后慢慢偏转
uniform vec2 uRingScale;  // 竖屏：环收窄一点（x 方向）
vec3 ringPoint(float ph, float rho, float h) {
  vec3 p = vec3(cos(ph) * rho, h, sin(ph) * rho);
  p = rotX(uTilt) * p;
  p = rotY(uRingYaw) * p;
  p.x *= uRingScale.x;
  p.z *= uRingScale.y;
  return uRingC + p;
}
vec3 ringTangent(float ph) {
  vec3 t = vec3(-sin(ph), 0., cos(ph));
  t = rotY(uRingYaw) * (rotX(uTilt) * t);
  return normalize(t * vec3(uRingScale.x, 1., uRingScale.y));
}
`;

export const RING_PLACE = /* glsl */ `
attribute vec4 aRing;     // x 最后落在环上的角度，y 半径，z 离环面多高，w 进环的先后（0..1）
attribute vec4 aSeed;
uniform float uU;         // 第三幕幕内进度（不截断）
uniform float uRot;       // 环转了多少（滑的时候转；第六幕起按钟转）
uniform float uBright;
uniform vec3 uRingCol;
uniform float uSize;
#define FRONT 1.5707963
#define V_FLOW 26.18      // 流的速度（每单位幕内进度走多少弧度）：0.24 走完一圈
#define T0 .19
#define FALL .055

bool place(inout vec3 c, inout vec3 s, inout mat3 R, inout vec4 m, inout vec3 tint, inout vec2 ex) {
  float u = uU;
  float target = aRing.x;
  float D = mod(target - FRONT, TAU);           // 从正前方（瀑布落下来的地方）沿着环要走多远
  float e = T0 + aRing.w * (TAU - D) / V_FLOW * .92;   // 什么时候进环（走得远的先进）
  if (u < e - FALL) return false;
  float rho = aRing.y, hh = aRing.z;
  vec3 tang;
  float sz = uSize * mix(.55, 1.25, aSeed.x * aSeed.x);
  s = vec3(sz * mix(.8, 1.6, aSeed.y), sz * mix(.5, .9, aSeed.z), sz);
  float moving = 0.;
  if (u < e) {
    // 瀑布：从门缝里涌出来，往前、往下落，落到环的最前面那一点
    float q = (u - (e - FALL)) / FALL;
    vec3 S = vec3((aSeed.w - .5) * 3., 104. + 30. * aSeed.y, uGate.z + 1.5);
    vec3 E = ringPoint(FRONT + uRot, rho, hh);
    vec3 C = vec3(S.x * 4., S.y + 8., mix(S.z, E.z, .6));
    float a = 1. - q;
    c = a * a * S + 2. * a * q * C + q * q * E;
    tang = normalize(2. * a * (C - S) + 2. * q * (E - C) + vec3(0., -.01, 0.));
    moving = 1.;
  } else {
    // 贴着看不见的弧面流，流到自己的位置停下（流得慢的被后面的挤着走）
    float ph = FRONT + min(V_FLOW * (u - e), D);
    moving = 1. - step(D, V_FLOW * (u - e));
    c = ringPoint(ph + uRot, rho, hh);
    tang = ringTangent(ph + uRot);
  }
  R = lookDir(tang) * rotZ(aSeed.w * 3.);
  s.z *= 1. + 1.4 * moving;                     // 流的时候拉长一点（看得出在动）
  ex = vec2(-1., aSeed.z);
  tint = uRingCol;
  float live = sstep(.42, .52, u);              // 首尾接上那一下，光从缝里透进去，它才开始自己转
  m = vec4(.5 + 1.2 * live, .05 * moving + .02 + .05 * live * aSeed.y, .9, uBright);
  vBev = .5;
  return true;
}
`;

/** 六颗小月：每颗几十块，转到正面那颗亮一下 */
export const MOON_PLACE = /* glsl */ `
attribute vec4 aMoon;     // x 第几颗，y z w 在小月球面上的方向
attribute vec4 aSeed;
uniform float uU;
uniform float uRot;
uniform float uBright;
uniform vec3 uRingCol;
uniform float uMoonR;
uniform float uFlash[6];
uniform float uMoonPh[6];  // 每颗小月在环上的角度（不算环转的）
#define FRONT 1.5707963
#define V_FLOW 26.18
#define T0 .19

bool place(inout vec3 c, inout vec3 s, inout mat3 R, inout vec4 m, inout vec3 tint, inout vec2 ex) {
  int j = int(aMoon.x + .5);
  float ph = uMoonPh[j];
  float D = mod(ph - FRONT, TAU);
  float arrive = T0 + D / V_FLOW;
  float u = uU;
  if (u < arrive - .05) return false;
  // 先跟着流一起到，再缩成一颗小球
  float k = sstep(arrive, arrive + .08, u);
  vec3 cen = ringPoint(FRONT + min(V_FLOW * max(u - (arrive - .05), 0.), D) + uRot, 193., 0.);
  vec3 dir = normalize(aMoon.yzw);
  float r = uMoonR * mix(2.2, 1., k);
  c = cen + dir * r * mix(.6 + .8 * aSeed.x, 1., k);
  R = lookDir(dir) * rotZ(aSeed.y * 6.);
  float sz = uMoonR * .42 * mix(.7, 1.1, aSeed.z);
  s = vec3(sz);
  ex = vec2(-1., aSeed.w);
  tint = mix(uRingCol, vec3(1.), .15);
  float f = uFlash[j];
  m = vec4(.8 + 2. * f, .06 + 2.6 * f * (.6 + .4 * aSeed.y), 1., uBright);
  vBev = .45;
  return true;
}
`;
