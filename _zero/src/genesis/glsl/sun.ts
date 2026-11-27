// Ⅱ 燃日 · 01 千手院（琥珀金）：一道金色的光刃从门缝里挤出来，一离开门就鼓成一个球——几千块碎石聚成的太阳，芯子白热。
// 升到门顶正上方，表面一圈一圈甩出火舌，甩出去又落回来，一共一千道（一千道火舌就是一千只手）。

export const SUN_PLACE = /* glsl */ `
attribute vec4 aSeed;     // 随机数
attribute vec4 aDir;      // xyz 在球面上的方向，w 往里缩多少（0 表面 … 1 内层）
uniform float uU;         // 第二幕幕内进度（不截断）
uniform vec3 uSunPos;     // 太阳现在的球心（CPU 按进度算：鼓起来、升上去、第六幕上轨道、第七幕站进全家福）
uniform float uSunRad;
uniform float uSpin;      // 自转角
uniform float uHeat;      // 0 死的 … 1 白热（光从缝里透进去那一下）
uniform float uBright;    // 造好以后退到半暗；第六幕一起亮
uniform vec3 uSunCol;
uniform float uSize;

bool place(inout vec3 c, inout vec3 s, inout mat3 R, inout vec4 m, inout vec3 tint, inout vec2 ex) {
  float u = uU;
  float born = .08 + .2 * aSeed.x;
  if (u < born) return false;
  // 光刃：门缝前面一片竖着的薄光，往外挤
  float out1 = seg(u, born, born + .07);
  vec3 blade = vec3((aSeed.y - .5) * 2.2 * (1. + out1), 36. + 176. * aSeed.z, uGate.z + 1. + 30. * out1 * out1);
  // 鼓成一个球（球在转）
  vec3 d = rotY(uSpin) * aDir.xyz;
  float rr = uSunRad * (1. - .32 * aDir.w);
  vec3 sph = uSunPos + d * rr;
  float k = sstep(0., 1., seg(u, born + .05, born + .24));
  // 碎石：不是贴得整整齐齐的瓷砖，大小不一、歪着、有的鼓出来一点
  c = mix(blade, sph, k) + d * (aSeed.w - .5) * 2.2 * k;
  R = k < .5 ? rotZ(aSeed.w * 6.28) : lookDir(d) * rotAxis(normalize(aSeed.xyz - .5 + .001), (aSeed.y - .5) * 1.1);
  float sz = uSize * mix(.62, 1.15, aSeed.w * aSeed.w) * (1. + .25 * aDir.w);
  s = vec3(sz, sz * mix(.8, 1.2, aSeed.x), sz * mix(.7, 1.3, aSeed.y));
  ex = vec2(-1., aSeed.z);
  vBev = .38;
  // 发热：光刃是亮的金色；聚成球的那一刻暗下去（死的），光从缝里透进去那一下才白热——芯子白，边上偏红
  vec3 toCam = normalize(uCamPos - uSunPos);
  float limb = max(dot(d, toCam), 0.);
  float face = pow(limb, .7);
  float flick = .78 + .44 * vnoise(uTime * (1.3 + aSeed.x * 2.) + aSeed.y * 40.);
  float hot = uHeat * (.35 + 7.5 * face * face) * (1. - .5 * aDir.w) * flick;
  float flying = (1. - k) * 1.5 * sat((u - born) * 30.);
  float ember = k * (1. - uHeat) * .1;
  tint = mix(vec3(1., .18, .03), uSunCol, sat(face * 1.6));
  m = vec4(.25 + .5 * uHeat, (hot + flying + ember), .3, uBright);
  return true;
}
`;

export const FLAME_PLACE = /* glsl */ `
attribute vec4 aT;        // xyz 火舌从哪儿甩出去（球面方向），w 甩多高（半径的倍数）
attribute vec4 aS;        // x 拖尾第几个点（0..1），y 周期，z 相位，w 什么时候点着（第二幕幕内进度）
attribute vec3 aTan;      // 往哪边甩
uniform float uU;
uniform vec3 uSunPos;
uniform float uSunRad;
uniform float uSpin;
uniform float uFlame;     // 火舌总开关（退到半暗时也跟着暗）
uniform float uBright;
uniform vec3 uSunCol;

bool placePt(inout vec3 p, inout float size, inout vec3 col, inout float soft) {
  float on = sstep(aS.w, aS.w + .05, uU) * uFlame;
  if (on <= .001) return false;
  // 每道火舌甩出去、落回来，然后歇一会儿（一千道不是同时都在外面）
  float cyc = fract(uTime / aS.y + aS.z);
  float duty = .42 + .3 * step(.5, aT.w);
  float s = cyc / duty - aS.x * .14;
  if (s < 0. || s > 1.) return false;
  vec3 d = rotY(uSpin) * aT.xyz;
  vec3 tg = rotY(uSpin) * aTan;
  float arc = .18 + .5 * fract(aS.z * 7.31);
  float a = s * arc;
  float r = uSunRad * (1. + aT.w * sin(PI * s));
  p = uSunPos + r * (cos(a) * d + sin(a) * tg);
  // 刚点着那一下：从表面猛地蹿出来
  float burst = 1. + 1.5 * (1. - sat((uU - aS.w) * 12.)) * on;
  size = (2. - aS.x * 1.3) * uSunRad / 42.;
  float heat = (1. - aS.x) * (.6 + .4 * sin(PI * s)) * burst;
  col = glowCol(heat * 1.25 * on * uBright, mix(uSunCol, vec3(1., .22, .04), sat(aS.x * 1.1 + s * .6)));
  soft = .8;
  return true;
}
`;
