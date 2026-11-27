// Ⅴ 铸器 · 04 文物（暗红）：一点红光从门缝里出来，悬在门前。四周的碎石全部朝它坍缩，越缩越亮，白到发烫。
// 然后一切停住——水纹、火舌、环、鲸身上的星光，全停一拍（顿帧：文物栏里第一件原型做的就是它）。接着炸开：
// 一圈冲击波贴着水面朝你扫过来，从脚下穿过去，火星像雨一样落进水里。尘埃散尽，原地悬着一架浑天仪：三道套在一起的环，
// 通体烧红，慢慢转，从白热冷到暗红，缝里还留着火。滑到一半正好是那一拍；往回滑，冲击波收回去，浑天仪散成碎石。

export const FORGE_FN = /* glsl */ `
uniform vec3 uFc;         // 那一点红光悬在哪（炸开的地方）
uniform vec3 uArm;        // 浑天仪现在的中心（第六幕上轨道、第七幕站进全家福）
uniform float uArmS;      // 浑天仪缩放
uniform float uArmSpin;   // 整架慢慢转
uniform vec3 uRingSpin;   // 三道环各自转到哪
// 黑体那一路颜色：白热 → 黄 → 橙 → 红 → 暗红
vec3 heatCol(float T) {
  vec3 c = mix(vec3(.45, .015, .0), vec3(1., .16, .02), sstep(0., .35, T));
  c = mix(c, vec3(1., .5, .12), sstep(.35, .7, T));
  return mix(c, vec3(1., .86, .7), sstep(.7, 1., T));
}
// 第 k 道环：环面怎么摆。三道都斜着对人（任何时候都不会侧成一条线横穿另一道环——那样看着像个「禁止」牌），
// 各自在自己的面里慢慢转（块在环上滑）；整架只左右轻轻晃，不整圈转
mat3 ringFrame(float k) {
  vec3 n = k < .5 ? normalize(vec3(0., .93, .37)) : (k < 1.5 ? normalize(vec3(.6, .26, .76)) : normalize(vec3(-.6, .26, .76)));
  float sp = k < .5 ? uRingSpin.x : (k < 1.5 ? uRingSpin.y : uRingSpin.z);
  mat3 B = lookDir(n);                  // B 的第三列 = 法线
  return mat3(B[0], B[2], -B[1]) * rotY(sp);
}
float ringRad(float k) { return k < .5 ? 46. : (k < 1.5 ? 41. : 36.); }
`;

/** 浑天仪：三道环 + 一根极轴 */
export const FORGE_PLACE = /* glsl */ `
attribute vec4 aR;        // x 第几道环（3 = 极轴），y 沿环的角度，z 横跨（-1..1），w 厚度方向（-1..1）
attribute vec4 aSeed;
uniform float uU;         // 第五幕幕内进度
uniform float uBright;
uniform float uTemp;      // 现在多烫（1 白热 … 0.2 暗红）

bool place(inout vec3 c, inout vec3 s, inout mat3 R, inout vec4 m, inout vec3 tint, inout vec2 ex) {
  float u = uU;
  // 炸开那一下从中心飞出来，飞到自己的位置（冲过一点再回来）
  float k = sat((u - .52) / .1);
  if (k <= 0.) return false;
  float e = 1. - pow(1. - k, 3.);
  float over = 1. + .12 * sin(k * PI) * (1. - k);
  float ring = aR.x;
  vec3 lp, tg, nrm;
  if (ring < 2.5) {
    mat3 F = ringFrame(ring);
    float rad = ringRad(ring) + aR.w * 1.6;
    float ph = aR.y;
    vec3 rp = vec3(cos(ph), 0., sin(ph));
    lp = F * (rp * rad + vec3(0., aR.z * 3.2, 0.));
    tg = F * vec3(-sin(ph), 0., cos(ph));
    nrm = F * rp;
  } else {
    // 正中一颗烧得最透的芯
    vec3 d = normalize(vec3(aR.z, aR.y, aR.w) + .001);
    lp = d * 7.5;
    tg = normalize(cross(d, vec3(0., 1., .01)));
    nrm = d;
  }
  lp = rotY(sin(uArmSpin) * .32) * lp;
  tg = rotY(sin(uArmSpin) * .32) * tg;
  c = uArm + lp * uArmS * e * over;
  R = lookDir(normalize(tg)) * rotZ(aSeed.w * 6.28 * .1);
  float sz = 2.7 * mix(.8, 1.2, aSeed.x) * uArmS;
  s = vec3(sz * (ring < 2.5 ? 1.25 : 1.1), sz, sz * (ring < 2.5 ? 1.6 : 1.1));
  ex = vec2(-1., aSeed.z);
  float T = uTemp * mix(.9, 1.08, aSeed.y) * (ring > 2.5 ? 1.25 : 1.);
  tint = heatCol(T);
  // 通体烧红：整块发光（越烫越亮）；缝里的火冷得慢
  float glow = (.25 + 5.5 * T * T) * (.75 + .25 * vnoise(uTime * 1.7 + aSeed.x * 30.));
  m = vec4(1.6 + 2.4 * T, glow, .5, uBright);
  vBev = .55;
  return true;
}
`;

/** 往红点里坍缩的碎石：从文物那撮的缺口里涌出来，绕着它转，越缩越亮；炸开以后变成火往外飞、落进水里 */
export const DEBRIS_PLACE = /* glsl */ `
attribute vec4 aD;        // xyz 云里的方向，w 离红点多远（0..1）
attribute vec4 aSeed;
uniform float uU;
uniform vec3 uWin;        // 04 那撮的缺口在哪

bool place(inout vec3 c, inout vec3 s, inout mat3 R, inout vec4 m, inout vec3 tint, inout vec2 ex) {
  float u = uU;
  float born = .12 + .14 * aSeed.x;
  if (u < born) return false;
  vec3 dir = normalize(aD.xyz);
  float R0 = 60. + 150. * aD.w;
  // 由远到近：先从缺口飞出去，散成一团云（绕着红点慢慢转）
  float fly = 1. - pow(1. - sat((u - born) / .1), 3.);
  float sw = (u - born) * (1.5 + 2. * (1. - aD.w));
  vec3 cloud = uFc + rotY(sw) * dir * R0;
  c = mix(uWin, cloud, fly);
  // 坍缩：越往里越快，越亮
  float st = .3 + .1 * aSeed.y;
  float e = sat((u - st) / (.48 - st));
  float ee = e * e * e;
  c = mix(c, uFc, ee);
  float sz = 3.4 * mix(.6, 1.3, aSeed.z) * (1. - .85 * ee);
  // 炸开：往外飞，往下掉，烧着烧着没了
  float x = u - .52;
  if (x > 0.) {
    vec3 v = normalize(dir + vec3(0., .55, 0.)) * (360. + 420. * aSeed.w);
    float t = x * 3.2;
    c = uFc + v * t + vec3(0., -260., 0.) * t * t;
    sz *= max(0., 1. - x / (.08 + .08 * aSeed.x));
    if (c.y < 0.) return false;
  }
  s = vec3(sz);
  R = rotAxis(normalize(aSeed.yzw - .5 + .001), u * 30. * aSeed.x);
  ex = vec2(-1., aSeed.z);
  float heat = ee * ee * 7. + (x > 0. ? 3. * max(0., 1. - x * 9.) : 0.);
  tint = heatCol(sat(ee * 1.1 + (x > 0. ? .8 : 0.)));
  m = vec4(.4 + 2. * ee, heat, .6, 1.);
  vBev = .5;
  return true;
}
`;

/** 火星：炸开那一下甩出去，像雨一样落进水里 */
export const SPARK_PLACE = /* glsl */ `
attribute vec4 aV;        // xyz 甩出去的方向，w 速度
attribute vec4 aSeed;
uniform float uU;
bool placePt(inout vec3 p, inout float size, inout vec3 col, inout float soft) {
  float x = uU - .52;
  if (x <= 0.) return false;
  float t = x * (2.2 + 1.2 * aSeed.x);
  vec3 v = normalize(aV.xyz) * aV.w;
  p = uFc + v * t + vec3(0., -300., 0.) * t * t;
  if (p.y < 0.) return false;
  float life = 1. - sat(t / (.6 + .7 * aSeed.y));
  if (life <= 0.) return false;
  size = (1.6 + 1.6 * aSeed.z) * (.4 + .6 * life);
  col = glowCol(2.2 * life * life, heatCol(.35 + .6 * life));
  soft = .7;
  return true;
}
`;
