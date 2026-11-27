// Ⅵ 立法 · 05 法典（靛紫）：浑天仪的三道环各放出一圈细细的光线，越放越大，大到绕住整道门——这是轨道。
// 轨道一条一条画出来；日、环、鲸座、浑天仪被轨道一样一样接住，绕门运行。最后天上的星星才亮：
// 先整整齐齐排在水面格网的交点上，然后各自松开，散成一片真的星空，水里也有一片。

/** 轨道上一点（跟 creations/law.ts 里 orbitPoint 一样算），和浑天仪第 k 道环上一点 */
export const ORBIT_FN = /* glsl */ `
uniform vec4 uOrb[4];       // 四条轨道：圆心高 h、半径 R、倾角 incl、偏转 yaw
uniform float uOrbDraw[4];  // 每条画到哪了（0..1）
uniform float uOrbGrow[4];  // 每条从浑天仪的环放大到绕住门，走到哪了（0..1）
uniform float uNarrowO;     // 竖屏收窄
uniform vec3 uArmC;         // 浑天仪中心、缩放、三道环转到哪（放轨道的那一刻从它身上放出来）
uniform float uArmSc;
uniform float uArmSp;
uniform vec3 uRingSp;
vec3 orbitPt(int i, float th) {
  vec4 o = uOrb[i];
  float R = o.y * uNarrowO;
  float x = sin(th) * R, z = cos(th) * R;
  float y = -z * sin(o.z);
  float z2 = z * cos(o.z);
  float c = cos(o.w), s = sin(o.w);
  return vec3(x * c + z2 * s, o.x + y, -x * s + z2 * c + (uGate.z - uGate.w * .5));
}
mat3 armFrame(float k) {
  vec3 n = k < .5 ? normalize(vec3(0., .93, .37)) : (k < 1.5 ? normalize(vec3(.6, .26, .76)) : normalize(vec3(-.6, .26, .76)));
  float sp = k < .5 ? uRingSp.x : (k < 1.5 ? uRingSp.y : uRingSp.z);
  mat3 B = lookDir(n);
  return mat3(B[0], B[2], -B[1]) * rotY(sp);
}
vec3 armPt(int i, float th) {
  float k = mod(float(i), 3.);
  float rad = k < .5 ? 46. : (k < 1.5 ? 41. : 36.);
  return uArmC + rotY(sin(uArmSp) * .32) * (armFrame(k) * vec3(cos(th), 0., sin(th))) * rad * uArmSc;
}
vec3 lawPt(int i, float th) {
  float g = uOrbGrow[i];
  float e = g * g * (3. - 2. * g);
  return mix(armPt(i, th), orbitPt(i, th), e);
}
`;

export const ORBIT_LINE = /* glsl */ `
void placeLine(inout vec3 a, inout vec3 b, inout float sa, inout float sb) {
  int i = int(a.x + .5);
  float t0 = a.y, t1 = b.y;
  a = lawPt(i, t0 * TAU);
  b = lawPt(i, t1 * TAU);
  sa = t0 + float(i) * 10.;
  sb = t1 + float(i) * 10.;
}
`;

export const ORBIT_COL = /* glsl */ `
uniform float uOrbDraw[4];
uniform float uOrbLum;
uniform vec3 uLawCol;
vec3 lineColor(float along, vec3 wp) {
  int i = int(floor(along / 10.));
  float t = along - float(i) * 10.;
  float d = uOrbDraw[i];
  if (t > d) return vec3(0.);
  // 画线的那个笔尖最亮
  float tip = exp(-(d - t) * 30.) * step(d, .999);
  return glowCol((.55 + 2.2 * tip) * uOrbLum, mix(uLawCol, vec3(1.), .25 + .5 * tip));
}
`;

/** 星：先排在水面格网的交点上，再各自松开，升上去散成一片真的星空 */
export const STAR_PLACE = /* glsl */ `
attribute vec4 aG;        // xz 格网交点，y 亮的先后（0..1），w 随机
attribute vec4 aS;        // xyz 天上的方向，w 亮度
uniform float uU;         // 第六幕幕内进度
uniform float uStarsOn;   // 第七幕白光里收掉
uniform vec3 uCamP;
bool placePt(inout vec3 p, inout float size, inout vec3 col, inout float soft) {
  float on = sat((uU - (.64 + .1 * aG.y)) * 30.);
  if (on <= 0. || uStarsOn <= 0.) return false;
  vec3 grid = vec3(aG.x, .4, aG.z);
  vec3 skyP = vec3(uCamP.x, 0., uCamP.z) + normalize(aS.xyz) * 5200.;
  float e = sat((uU - (.76 + .08 * aG.w)) / .16);
  float ee = e * e * (3. - 2. * e);
  // 先往上升，再散开
  vec3 mid = vec3(grid.x, 260. + 400. * aG.w, grid.z);
  p = mix(mix(grid, mid, ee), mix(mid, skyP, ee), ee);
  float tw = .75 + .25 * sin(uTime * (1.3 + aG.w * 3.) + aS.w * 40.);
  size = mix(3.2, 22. + 30. * aS.w, ee);
  col = glowCol((1.6 - .6 * ee) * on * tw * (.35 + .65 * aS.w) * uStarsOn, mix(vec3(.72, .66, 1.), vec3(1.), .4 + .4 * aS.w));
  soft = 1.;
  return true;
}
`;
