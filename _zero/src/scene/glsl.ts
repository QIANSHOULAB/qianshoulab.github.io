// 黑碑场景的着色器。整个画面只有灰度：每个着色器最后都把亮度过一遍胶片曲线、转 sRGB、加一点抖动（防天空渐变出色带）。
// 天空、水面、碑在水里的倒影、地平线那条线、碑后升起的光、碑缝漏光、光芒、水上光路都是现算的，没有贴图。

export const COMMON = /* glsl */ `
precision highp float;
#define PI 3.14159265

uniform float uTime;
uniform float uLight;     // 光的强度：黎明曲线 × 呼吸（0 = 全黑，1 = 天亮）
uniform float uDawn;      // 黎明走到哪了（0..1，管光的形状：光心升高、光晕放大）
uniform float uCenterY;   // 光心在碑面那个平面上的高度（世界单位）
uniform vec4 uMono;       // 半宽、高、正面 z、厚
uniform float uExposure;
uniform vec4 uHole;       // 正在出碑的那撮原来的位置（正面上的矩形 minX minY maxX maxY）
uniform float uHoleOpen;  // 那撮出来了多少（0..1）
uniform vec3 uClMin;      // 那撮现在的包围盒
uniform vec3 uClMax;
uniform float uPixAng;    // 一个像素对应多少弧度
uniform float uGlowScale; // 窄屏（手机竖着）光晕收紧一点，不让光淹满整个屏

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  float u = f * f * (3. - 2. * f);
  return mix(hash11(i), hash11(i + 1.), u);
}

float tonemap(float x) {
  x = max(x, 0.) * uExposure;
  return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.);
}
float toSRGB(float x) { return x <= .0031308 ? x * 12.92 : 1.055 * pow(x, 1. / 2.4) - .055; }

float rectSD(vec2 p, vec2 bmin, vec2 bmax) {
  vec2 c = (bmin + bmax) * .5, h = (bmax - bmin) * .5;
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}

// 藏在碑后面的那团光（在碑面那个平面上量距离）
float sunGlow(vec2 q) {
  float r = length((q - vec2(0., uCenterY)) * vec2(1., 1.18));
  float R2 = mix(34., 98., uDawn) * uGlowScale, R3 = mix(70., 210., uDawn) * uGlowScale;
  return 2.2 * exp(-r / 22.) + 2.1 * exp(-r / R2) + .16 * exp(-r / R3);
}

// 方向决定的天：头顶暗，地平线亮，正前方（碑后）最亮；背后那半边天也有一点点黎明
float skyBase(vec3 rd) {
  float el = rd.y;
  float az = atan(rd.x, -rd.z);
  float zen = .0006 + .016 * uLight;
  float front = exp(-az * az * 1.6);
  float back = exp(-(abs(az) - PI) * (abs(az) - PI) * 1.2);
  float hor = .0012 + uLight * (.012 + .07 * front + .02 * back);
  float band = exp(-max(el, 0.) * 7.5);
  float low = exp(-max(el, 0.) * 45.);
  return mix(zen, hor, band) + hor * .6 * low;
}

// 碑面那个平面上的光：光团 + 贴着轮廓的一圈亮边（日冕）+ 从边上散出去的光芒；碑后面（矩形里）是光源本身，只有碑上开了口才看得见
float planeLight(vec3 ro, vec3 rd, out float inside) {
  inside = 0.;
  if (rd.z > -1e-4) return 0.;
  float t = (uMono.z - ro.z) / rd.z;
  if (t < 0.) return 0.;
  vec2 q = ro.xy + rd.xy * t;
  float d0 = rectSD(q, vec2(-uMono.x, 0.), vec2(uMono.x, uMono.y));
  float d = max(d0, 0.);
  float g = sunGlow(q);
  float near = exp(-abs(q.y - uCenterY) / 150.);
  float cor = (2.6 * exp(-d / 1.2) + .9 * exp(-d / 5.5) + .32 * exp(-d / 22.)) * (.22 + .78 * near) * (.25 + g * .6);
  if (d0 < 0.) {
    // 碑后面就是光源本身：只有碑上开了口才看得见。贴着轮廓那一两个像素别给它（多重采样时会从边上漏出一条亮线）
    inside = 1.;
    float core = (46. * exp(-length(q - vec2(0., uCenterY)) / 200.) + 9.);
    return mix(g + cor, core, smoothstep(.6, 5., -d0)) * uLight;
  }
  vec2 rp = vec2(abs(q.x), q.y - uCenterY);
  float ang = atan(rp.y, rp.x);
  float n = vnoise(ang * 11. + 3.1) * .55 + vnoise(ang * 37. + 11.7 + uTime * .01) * .45;
  float rays = pow(n, 5.) * exp(-length(rp) / (170. * uGlowScale)) * exp(-d / (150. * uGlowScale)) * smoothstep(0., 20., d) * smoothstep(.45, 1., uDawn) * .22 * (1. - .6 * exp(-rp.x * rp.x / 900.));
  return (g + cor + rays) * uLight;
}

float sky(vec3 ro, vec3 rd, out float inside) { return skyBase(rd) + planeLight(ro, rd, inside); }

// 空气被背光照亮的那点亮（雾）：碑脚有一层薄雾，越往下越浓
float airLight(vec3 p, vec3 rd) { return (sunGlow(p.xy) * .2) * uLight + skyBase(rd); }

// 碑缝透光的强度：离光心越近越亮
float seamLight(vec2 q) { return sunGlow(q) * .075 * uLight; }
`;

// 只有片元着色器能用的：按像素位置抖动
export const FRAG = /* glsl */ `
float dither() { return (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 17.17) - 1.) / 255.; }
vec4 finalColor(float lin) { return vec4(vec3(toSRGB(tonemap(lin)) + dither()), 1.); }
`;

// ———— 天 + 水（一个盖满屏的三角形）————
export const WORLD_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 1., 1.);
}
`;

export const WORLD_FRAG = /* glsl */ `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uSunEl;
uniform float uRipple;
varying vec2 vNdc;

// 水波：几道很慢的细浪，越远越平（像素盖不住的浪直接抹掉，不闪）
vec3 waterNormal(vec2 p, float fpx, float fpz) {
  vec2 g = vec2(0.);
  float t = uTime;
  #define WAVE(dx, dy, lam, slope, w, ph) { vec2 d = normalize(vec2(dx, dy)); float k = 6.2831853 / lam; float fp = length(vec2(fpx * d.x, fpz * d.y)); float fade = 1. - smoothstep(.12 * lam, .5 * lam, fp); g += slope * fade * cos(dot(d, p) * k + t * w + ph) * d; }
  WAVE( 0.00, 1.00, 47.0, .0013, .16, 0.0)
  WAVE( 0.33, 0.94, 23.0, .0019, .23, 1.7)
  WAVE(-0.29, 0.96, 12.5, .0028, .31, 4.2)
  WAVE( 0.14, 0.99,  6.9, .0042, .43, 2.9)
  WAVE(-0.47, 0.88,  3.9, .0058, .58, 5.5)
  WAVE( 0.61, 0.79,  2.2, .0066, .79, 0.8)
  WAVE(-0.06, 1.00,  1.25, .0066, 1.05, 3.3)
  WAVE( 0.83, 0.56,  .72, .0060, 1.40, 6.1)
  WAVE(-0.71, 0.70,  .42, .0055, 1.85, 2.2)
  WAVE( 0.21, 0.98,  .25, .0050, 2.40, 4.7)
  WAVE(-0.38, 0.92,  .15, .0042, 3.10, 1.1)
  g *= uRipple;
  return normalize(vec3(-g.x, 1., -g.y));
}

// 倒影里的碑：黑，碑缝透光，轮廓一圈亮边；开了口的地方光直接穿过来
float monoInWater(vec3 P, vec3 Q, float seen) {
  float cell = uMono.x * 2. / 12.;
  vec2 gq = vec2((Q.x + uMono.x) / cell, Q.y / cell);
  vec2 f = fract(gq);
  vec2 ds = min(f, 1. - f) * cell;
  float dseam = min(ds.x, ds.y);
  float sw = max(.25, seen * uPixAng * 1.4);
  float seam = (1. - smoothstep(0., sw, dseam)) * seamLight(Q.xy) * min(1., .22 / sw);
  float dO = min(uMono.x - abs(Q.x), uMono.y - Q.y);
  float rw = max(.6, seen * uPixAng * 1.2);
  float rim = (1. - smoothstep(0., rw, dO)) * 1.6 * uLight * min(1., .7 / rw);
  return .0016 * uLight + .0004 + seam + rim;
}

float reflScene(vec3 P, vec3 R) {
  vec3 Rs = R;
  Rs.x = abs(Rs.x) < 1e-6 ? 1e-6 : Rs.x;
  Rs.z = abs(Rs.z) < 1e-6 ? -1e-6 : Rs.z;
  vec3 inv = 1. / Rs;
  float best = 1e9, shade = -1.;
  vec3 bmin = vec3(-uMono.x, 0., uMono.z - uMono.w), bmax = vec3(uMono.x, uMono.y, uMono.z);
  vec3 t0 = (bmin - P) * inv, t1 = (bmax - P) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float tN = max(max(tn.x, tn.y), tn.z), tF = min(min(tf.x, tf.y), tf.z);
  if (tF > max(tN, 0.)) {
    vec3 Q = P + R * tN;
    best = tN;
    shade = monoInWater(P, Q, length(uCamPos - P) + tN);
    // 出碑那撮留下的口子：倒影里只给一团软光，不硬切（细浪会把硬边撕成一条条）
    if (uHoleOpen > .02) {
      float dh = max(rectSD(Q.xy, uHole.xy, uHole.zw), 0.);
      shade += uHoleOpen * uLight * (.55 * exp(-dh / 3.5) + .12 * exp(-dh / 14.));
    }
  }
  if (shade >= 0.) return shade;
  float ins;
  float c = sky(P, R, ins);
  return ins > .5 ? min(c, 2.4 * uLight) : c;
}

void main() {
  vec4 v = uInvProj * vec4(vNdc, 1., 1.);
  vec3 rd = normalize(mat3(uCamWorld) * normalize(v.xyz / v.w));
  vec3 ro = uCamPos;
  float az = atan(rd.x, -rd.z);
  float elPx = rd.y / uPixAng;
  float col;

  // 天
  float skyC = 0.;
  if (elPx > -1.5) {
    float ins;
    skyC = sky(ro, rd, ins);
  }
  // 水
  float waterC = 0.;
  if (elPx < 1.5) {
    float down = max(-rd.y, 1e-5);
    float t = ro.y / down;
    vec3 P = ro + rd * t;
    float fpx = t * uPixAng, fpz = t * uPixAng / down;
    vec3 N = waterNormal(P.xz, fpx, fpz);
    vec3 V = -rd;
    vec3 R = reflect(rd, N);
    R.y = max(R.y, .0015);
    R = normalize(R);
    float cosT = max(dot(N, V), 0.);
    float F = .02 + .98 * pow(1. - cosT, 5.);
    float refl = reflScene(P, R);
    // 黑水：镜子，但是暗
    waterC = refl * F * .36;
    // 光路：藏在碑后的光贴着水面过来，细浪一闪一闪，铺到脚下
    vec3 Ls = normalize(vec3(0., sin(uSunEl), -cos(uSunEl)));
    vec3 Hh = normalize(Ls + V);
    float far = 1. - smoothstep(.0009, .004, down);
    float shin = mix(1900., 260., far);
    float spec = pow(max(dot(N, Hh), 0.), shin) * (shin + 8.) / 25.;
    float lane = exp(-abs(P.x) / (6. + t * .07));
    float toward = exp(-down * 30.);
    float path = spec * F * (.35 + .65 * lane) * uLight * smoothstep(.0006, .004, down) * .5 * (.012 + .988 * toward);
    // 远处细浪抹平以后，光路变成一条柔和的亮带
    float soft = exp(-abs(az) / (.005 + .3 * down)) * smoothstep(.0002, .006, down) * (1. - smoothstep(.01, .085, down)) * .26 * uLight;
    waterC += (path + soft * F) * smoothstep(.12, .6, uDawn);
  }
  float w = smoothstep(-.9, .9, elPx);
  col = mix(waterC, skyC, w);

  // 地平线：一条笔直的细线，正中（碑后）最亮
  float line = exp(-abs(elPx + .35) / .7) * (.18 + 1.6 * exp(-az * az * 40.) + .35 * exp(-az * az * 2.)) * uLight;
  // 地平线上下一层薄薄的、被背光照亮的雾
  float mist = exp(-abs(rd.y) * 70.) * (.03 + .32 * exp(-az * az * 9.)) * uLight;
  col += line + mist;
  // 镜头暗角：四角压暗，光只在正中
  float vg = 1. - .42 * pow(length(vNdc * vec2(.8, 1.)) * .72, 2.2);
  col *= max(vg, 0.);
  gl_FragColor = finalColor(col);
}
`;

// ———— 碑：几百块方砖（InstancedMesh）————
export const MONO_VERT = /* glsl */ `
attribute vec4 aRand;
attribute vec4 aInfo;     // x 属于哪撮（-1 不属于）、y 外沿标记（1 左 2 右 4 顶）
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vNrm;
varying vec3 vScale;
varying vec4 vRand;
varying vec4 vInfo;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.);
  vWorld = world.xyz;
  vLocal = position;
  vNrm = normal;
  vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vRand = aRand;
  vInfo = aInfo;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const MONO_FRAG = /* glsl */ `
uniform vec3 uCamPos;
uniform float uActive;
uniform float uAct;
uniform float uPrev;
uniform float uPrevAct;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vNrm;
varying vec3 vScale;
varying vec4 vRand;
varying vec4 vInfo;

void main() {
  vec3 an = abs(vNrm);
  vec2 uv, hs;
  vec3 a1, a2;
  if (an.z > .5) { uv = vLocal.xy * vScale.xy; hs = vScale.xy * .5; a1 = vec3(1., 0., 0.); a2 = vec3(0., 1., 0.); }
  else if (an.x > .5) { uv = vLocal.zy * vScale.zy; hs = vScale.zy * .5; a1 = vec3(0., 0., 1.); a2 = vec3(0., 1., 0.); }
  else { uv = vLocal.xz * vScale.xz; hs = vScale.xz * .5; a1 = vec3(1., 0., 0.); a2 = vec3(0., 0., 1.); }
  vec2 de = hs - abs(uv);
  float dEdge = min(de.x, de.y);
  float pw = max(length(fwidth(vWorld)) * .7, 1e-4);
  bool front = vNrm.z > .5;

  // 倒角：每块砖宽窄不一；离得远盖不住一个像素时，把它摊到一个像素宽、亮度按比例减，不闪
  float bev = mix(.16, .44, vRand.x);
  float bw = max(bev, pw * 1.15);
  float tb = 1. - smoothstep(0., bw, dEdge);
  vec3 outward = de.x < de.y ? a1 * sign(uv.x) : a2 * sign(uv.y);
  vec3 tilt = vec3((vRand.w - .5) * .035, (vRand.z - .5) * .035, 0.);
  vec3 N = normalize(vNrm + outward * tb * .9 + tilt);

  vec3 V = normalize(uCamPos - vWorld);
  vec3 R = reflect(-V, N);
  float env = R.y >= 0. ? skyBase(R) : skyBase(vec3(R.x, -R.y, R.z)) * .18 + .0008 * uLight;
  float rough = mix(.12, .5, vRand.y);
  float F = .04 + .96 * pow(1. - max(dot(N, V), 0.), 5.);
  float comp = mix(1., bev / bw, tb);
  float col = .0005 + .012 * mix(.75, 1.25, vRand.z) * (.0016 + .01 * uLight);
  col += env * F * (1. - rough * .65) * comp;

  float me = abs(vInfo.x - uActive) < .5 ? uAct : (abs(vInfo.x - uPrev) < .5 ? uPrevAct : 0.);

  if (front) {
    // 碑缝漏光
    float sw = max(.2, pw * 1.05);
    float seam = (1. - smoothstep(0., sw, dEdge)) * seamLight(vWorld.xy) * min(1., .2 / sw) * mix(.12, 1.5, vRand.z * vRand.z);
    seam *= 1. + 3. * me;
    col += seam;
    // 碑的外沿：一圈细亮边，跟天上那圈日冕接上
    float e = vInfo.y;
    float dO = 1e3;
    if (mod(e, 2.) > .5) dO = min(dO, vWorld.x + uMono.x);
    if (mod(floor(e / 2.), 2.) > .5) dO = min(dO, uMono.x - vWorld.x);
    if (mod(floor(e / 4.), 2.) > .5) dO = min(dO, uMono.y - vWorld.y);
    float rw = max(.45, pw * 1.1);
    float near = exp(-abs(vWorld.y - uCenterY) / 170.);
    float rim = (1. - smoothstep(0., rw, dO)) * 2.2 * (.32 + .68 * near) * uLight * min(1., .55 / rw);
    col += rim;
  }
  // 出碑的那撮：背后的光从缝里涌出来，把它的轮廓勾亮
  if (me > .001) {
    float dC = rectSD(vWorld.xy, uClMin.xy, uClMax.xy);
    float cw = max(.5, pw * 1.2);
    col += exp(min(dC, 0.) / cw) * 1.8 * me * uLight * (front ? 1. : .4);
  }

  // 远：薄薄一层被背光照亮的空气；碑脚那截泡在雾里
  float dist = length(vWorld - uCamPos);
  float haze = 1. - exp(-dist * .000035);
  float mist = exp(-max(vWorld.y, 0.) / (.05 * uMono.y)) * .28 * smoothstep(0., .8, uDawn);
  col = mix(col, airLight(vWorld, -V), clamp(haze + mist, 0., .85));
  gl_FragColor = finalColor(col);
}
`;

// ———— 出碑那撮背后涌出来的光（加法混合，贴在碑面前一点点）————
export const GLOW_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vQuad;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.);
  vWorld = w.xyz;
  vQuad = position.xy;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const GLOW_FRAG = /* glsl */ `
uniform vec2 uGlowHalf;
varying vec3 vWorld;
varying vec2 vQuad;
void main() {
  vec2 q = vWorld.xy;
  float d = max(rectSD(q, uHole.xy, uHole.zw), 0.);
  float g = .6 * exp(-d / 1.2) + .26 * exp(-d / 6.) + .07 * exp(-d / 18.);
  vec2 c = (uHole.xy + uHole.zw) * .5;
  vec2 rp = q - c;
  float a = atan(rp.y, abs(rp.x));
  float s = pow(vnoise(a * 9. + 1.3) * .65 + vnoise(a * 29. + 5.1) * .35, 6.) * exp(-d / 14.) * .12;
  // 四边淡到零：看不出这是一块贴片
  vec2 e = abs(vQuad) * 2.;
  float win = (1. - smoothstep(.55, 1., e.x)) * (1. - smoothstep(.55, 1., e.y));
  float v = (g + s) * uHoleOpen * uLight * win;
  gl_FragColor = vec4(vec3(toSRGB(tonemap(v))), 1.);
}
`;

// ———— 浮尘：空气里的细灰，被背光一照就亮 ————
export const DUST_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uCamPos;
uniform vec3 uBox;        // 半宽、高、深
uniform float uPxScale;   // 1 个世界单位在 1 远处是多少像素
varying float vA;
void main() {
  float t = uTime;
  vec3 p;
  p.x = (aSeed.x - .5) * 2. * uBox.x + sin(t * (.05 + aSeed.w * .07) + aSeed.y * 40.) * 1.6;
  p.y = .3 + aSeed.y * uBox.y + sin(t * (.04 + aSeed.x * .05) + aSeed.z * 30.) * .9;
  float dz = mod(aSeed.z * uBox.z - t * (.25 + aSeed.w * .5) + (uCamPos.z - 0.), uBox.z);
  p.z = uCamPos.z - 3. - dz;
  vec4 mv = viewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  float r = mix(.010, .04, aSeed.w);
  gl_PointSize = clamp(r * uPxScale / dist, 1., 28.);
  vec3 dir = normalize(p - uCamPos);
  vec3 L = normalize(vec3(0., .08, -1.));
  float c = dot(dir, L);
  float g = .86;
  float phase = (1. - g * g) / pow(1. + g * g - 2. * g * c, 1.5) * .22;
  float fadeNear = smoothstep(3., 9., dist), fadeFar = 1. - smoothstep(uBox.z * .6, uBox.z, dist);
  float big = clamp(gl_PointSize / 6., 1., 4.);
  vA = phase * .018 * uLight * fadeNear * fadeFar * mix(.5, 1., aSeed.y) / (big * big) * smoothstep(.15, .7, uDawn);
}
`;

export const DUST_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - .5;
  float a = exp(-dot(c, c) * 14.);
  gl_FragColor = vec4(vec3(toSRGB(tonemap(vA * a * 3.))), 1.);
}
`;
