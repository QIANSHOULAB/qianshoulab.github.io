// 造物之门的着色器。底子是墨蓝（v3.2：这个世界的暗只有这一种颜色，tune.ts 的 INK；没有一块纯黑）；颜色只在光里（芯子发白，外圈带这一幕的颜色）。
// 每个着色器最后都过一遍胶片曲线、转 sRGB、垫上那层墨蓝（光叠在它上面：1 - (1 - 墨)(1 - 光)）、加一点抖动（防色带）。倒影那一遍（uMirror = 1）不做这些，
// 把线性亮度压进 0..1 存起来，水面再解开来用。天、水、门后的光、门缝、水上的光路、格网、冲击波都是现算的，没有贴图。
import { H, W, T, Z_FRONT, CELL } from './layout';

const f = (x: number) => x.toFixed(4);

export const COMMON = /* glsl */ `
precision highp float;
#define PI 3.14159265
#define TAU 6.28318531
#define DH ${f(H)}
#define DW ${f(W)}
#define DT ${f(T)}
#define Z0 ${f(Z_FRONT)}
#define CELL ${f(CELL)}

uniform float uTime;       // 场景时钟（秒）：顿帧时停
uniform float uLight;      // 门后那盏光有多亮
uniform vec3 uLightCol;    // 它这一幕的颜色（亮的地方会自己发白）
uniform float uExposure;
uniform float uPixAng;     // 一个像素多少弧度
uniform vec3 uCamPos;
uniform float uMirror;     // 1 = 正在画水里的倒影
uniform float uOpen;       // 门开的角度（弧度）
uniform float uDawn;       // 开场：世界有了多少（地平线、雾）
uniform float uFlood;      // 第七幕：白光盖满
uniform float uDark;       // 第七幕：造物成剪影
uniform vec4 uHole[5];     // 门上五个窗（投到门面那个平面上的矩形）
uniform vec4 uHoleCol[5];  // 窗里的颜色，a = 开了多少
uniform vec4 uLights[6];   // 六盏灯：xyz 位置，w 光晕半径
uniform vec4 uLightC[6];   // rgb 亮度，a = 水上光路的强度
// —— 第七幕「开天」——
uniform float uRise;       // 门上的石头升天走到哪了（0..1）
uniform float uCrack;      // 门裂开：缝里透光、轻轻抖
uniform float uGone;       // 门洞里那片光走了多少
uniform float uSky;        // 进了第七幕多少：星挂到无穷远那个球上
uniform float uRiseW;      // 石头往两边散多开（竖着的手机屏窄，收一点，别都飞出屏）
uniform vec3 uFive[5];     // 五样造物的颜色（线性）：琥珀金、品红、冷青、暗红、靛紫

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float vnoise(float x) {
  float i = floor(x), fr = fract(x);
  float u = fr * fr * (3. - 2. * fr);
  return mix(hash11(i), hash11(i + 1.), u);
}
vec3 tonemap(vec3 x) {
  x = max(x, 0.) * uExposure;
  return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-6)), vec3(1. / 2.4)) - .055, step(vec3(.0031308), c));
}
float rectSD(vec2 p, vec2 bmin, vec2 bmax) {
  vec2 c = (bmin + bmax) * .5, h = (bmax - bmin) * .5;
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}
mat3 rotAxis(vec3 ax, float a) {
  float s = sin(a), c = cos(a), oc = 1. - c;
  return mat3(oc * ax.x * ax.x + c, oc * ax.x * ax.y + ax.z * s, oc * ax.z * ax.x - ax.y * s,
              oc * ax.x * ax.y - ax.z * s, oc * ax.y * ax.y + c, oc * ax.y * ax.z + ax.x * s,
              oc * ax.z * ax.x + ax.y * s, oc * ax.y * ax.z - ax.x * s, oc * ax.z * ax.z + c);
}
vec3 eyePos() { return uMirror > .5 ? vec3(uCamPos.x, -uCamPos.y, uCamPos.z) : uCamPos; }

// 门后面那盏光（藏在门正后方，看得见光，看不见光源），在门面那个平面上量
float coreGlow(vec2 q) {
  float r = length((q - vec2(0., DH * .46)) * vec2(1., 1.15));
  return 2. * exp(-r / 22.) + .8 * exp(-r / 88.) + .05 * exp(-r / 215.);
}
// 方向决定的天：头顶暗，地平线亮，正前方（门后）最亮
vec3 skyBase(vec3 rd) {
  float el = rd.y;
  float az = atan(rd.x, -rd.z);
  float front = exp(-az * az * 1.6);
  vec3 tint = mix(uLightCol, vec3(1.), .55);
  vec3 zen = vec3(.0005, .00058, .0008) + vec3(.006, .0065, .008) * uLight;
  vec3 hor = vec3(.0009, .001, .0013) + uLight * (vec3(.006, .0065, .0078) + .028 * front * tint);
  float band = exp(-max(el, 0.) * 7.5);
  float low = exp(-max(el, 0.) * 45.);
  return mix(zen, hor, band) + hor * .6 * low;
}
// 门洞：门里面就是光本身，只有门开了缝、或者门上开了窗才看得见；门外一圈是光晕和贴着门轮廓的亮边
vec3 portal(vec3 ro, vec3 rd, out float inside) {
  inside = 0.;
  if (rd.z > -1e-4 || ro.z < Z0) return vec3(0.);
  float t = (Z0 - ro.z) / rd.z;
  vec2 q = ro.xy + rd.xy * t;
  float d0 = rectSD(q, vec2(-DW * .5, 0.), vec2(DW * .5, DH));
  float d = max(d0, 0.);
  float g = coreGlow(q);
  float near = exp(-abs(q.y - DH * .46) / 150.);
  float cor = (2.4 * exp(-d / 1.2) + .8 * exp(-d / 5.5) + .3 * exp(-d / 22.)) * (.22 + .78 * near) * (.25 + g * .6);
  vec3 halo = uLightCol * (g + cor) + vec3(.4) * cor * exp(-d / 3.);
  if (d0 < 0.) {
    inside = 1.;
    float core = mix(40. * exp(-length(q - vec2(0., DH * .46)) / 190.) + 8., 6. * exp(-abs(q.x) / 13.) * (.5 + .5 * exp(-abs(q.y - DH * .45) / 80.)) + .12 + 1.1 * exp(-length(q - vec2(0., DH * .46)) / 34.), uCrack);
    vec3 c = mix(uLightCol, vec3(1.), .78) * core;
    for (int k = 0; k < 5; k++) {
      float a = uHoleCol[k].a;
      if (a > .001) {
        float dh = rectSD(q, uHole[k].xy, uHole[k].zw);
        vec2 hc = (uHole[k].xy + uHole[k].zw) * .5;
        float cen = exp(-length(q - hc) / 9.);
        c = mix(c, mix(uHoleCol[k].rgb * 1.7, vec3(1., .97, .92) * 3.2, cen * .7) * (1. + 2.2 * cen), (1. - smoothstep(-1.5, 3., dh)) * a);
      }
    }
    // 第七幕：石头把光带上天，门洞里只剩空的（门原来的位置什么都不剩）
    return mix(halo, c, smoothstep(.5, mix(1.8, 14., uCrack), -d0)) * uLight * (1. - uGone);
  }
  return halo * uLight * (1. - uGone * .85) * mix(1., .28, max(uSky, uCrack));
}
// 门后的光照亮的空气（雾），门脚最浓
vec3 airLight(vec3 p, vec3 rd) { return mix(uLightCol, vec3(1.), .4) * coreGlow(p.xy) * .2 * uLight + skyBase(rd); }

// 从眼睛看过去，这个点（在门面后面）是不是落在门洞里：门洞里只有光，什么都看不见
bool inAperture(vec3 P) {
  vec3 e = eyePos();
  if (P.z > Z0 - .3 || e.z < Z0) return false;
  float t = (Z0 - e.z) / (P.z - e.z);
  vec2 q = e.xy + (P.xy - e.xy) * t;
  return abs(q.x) < DW * .5 && q.y > 0. && q.y < DH;
}

// —— 第七幕：门上的石头一块块松开、往上飞，到了天上炸成星 ——
// 门上 (col, row) 那块石头的中心（门扇转了 uOpen 以后）
vec3 doorCell(float col, float row) {
  float side = col < 5.5 ? -1. : 1.;
  vec3 c0 = vec3(-DW * .5 + (col + .5) * CELL, (row + .5) * CELL, Z0 - DT * .5);
  float a = -side * uOpen;
  float ca = cos(a), sa = sin(a);
  vec3 hinge = vec3(side * DW * .5, 0., Z0);
  vec3 r = c0 - hinge;
  return hinge + vec3(ca * r.x + sa * r.z, r.y, -sa * r.x + ca * r.z);
}
// 什么时候松开（uRise 的单位）：从顶上一行一行往下，带一点乱；松开以后飞 0.42
float riseT(float row, float r) { return .58 * clamp(.74 * (1. - row / 26.) + .26 * r, 0., 1.); }
float riseS(float row, float r) { return clamp((uRise - riseT(row, r)) / .42, 0., 1.); }
// 飞的路：先松开、往上浮，再越飞越快、往两边散；s = 0.55 那一下在天上炸成星
vec3 risePath(vec3 pc, vec4 rnd, float s) {
  float e = s * s * (3. - 2. * s);
  float side = pc.x < 0. ? -1. : 1.;
  vec3 P1 = pc + vec3(side * 4. * rnd.z, 40. + 70. * rnd.y, 8. * (rnd.w - .5));
  vec3 P2 = vec3(pc.x * mix(1., 1.8, uRiseW) + side * (20. + 60. * rnd.z) * uRiseW, pc.y + 150. + 140. * rnd.x, pc.z + 50. * (rnd.y - .5));
  vec3 P3 = vec3(pc.x * mix(1., 3., uRiseW) + side * (90. + 260. * rnd.w) * uRiseW, 520. + 380. * rnd.z + pc.y * .4, pc.z + 60. - 120. * rnd.y);
  float u = 1. - e;
  return u * u * u * pc + 3. * u * u * e * P1 + 3. * u * e * e * P2 + e * e * e * P3;
}
// 五种颜色里挑一种（石头被光点亮时带一点它的颜色）
vec3 five(float r) { return r < .2 ? uFive[0] : r < .4 ? uFive[1] : r < .6 ? uFive[2] : r < .8 ? uFive[3] : uFive[4]; }

// 五样造物各自那盏灯照到一个面上
vec3 creationLight(vec3 P, vec3 N, vec3 V) {
  vec3 c = vec3(0.);
  for (int i = 1; i < 6; i++) {
    vec3 L = uLights[i].xyz - P;
    float d2 = dot(L, L);
    vec3 l = L * inversesqrt(d2 + 1e-4);
    float r = uLights[i].w;
    float diff = max(dot(N, l), 0.);
    vec3 h = normalize(l + V);
    float spec = pow(max(dot(N, h), 0.), 40.) * .6;
    c += uLightC[i].rgb * (diff + spec) / (1. + d2 / (r * r));
  }
  return c * .32;
}
`;

// 只有片元着色器用：按像素抖动；倒影那一遍把线性亮度压进 0..1
export const FRAG = /* glsl */ `
uniform vec3 uInk;         // 这个世界的暗（墨蓝，显示空间 0..1）：没有光的地方就是它；门用更暗的一档
float dither() { return (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 17.17) - 1.) / 255.; }
// 光叠在墨蓝上（滤色）：一点光都没有的地方正好是墨蓝，亮的地方照旧亮
vec3 inked(vec3 srgb, vec3 ink) { return 1. - (1. - ink) * (1. - srgb); }
vec4 outColor(vec3 lin) {
  if (uMirror > .5) { vec3 e = lin / (1. + lin); return vec4(min(e, vec3(.996)), 1.); }
  return vec4(inked(toSRGB(tonemap(lin)), uInk) + dither(), 1.);
}
vec4 outGlow(vec3 lin) { return vec4(toSRGB(tonemap(lin)), 1.); }
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
uniform vec2 uRes;
uniform sampler2D uRefl;
uniform float uReflOn;
uniform float uHorizon;    // 开场：地平线从门脚往两边划开了多少
uniform float uReach;      // 开场：光路铺到离门多远（0..1，1 = 脚下）
uniform vec4 uShock;       // 冲击波：xyz 水面上的圆心，w 半径
uniform float uShockI;
uniform float uGrid;       // 第六幕：水上的格网
uniform float uGridR;
uniform vec3 uGridCol;
uniform float uGap;        // 门缝的半宽（世界单位），管水上那道扇形的光
uniform float uFloodB;     // 整屏的白（v3 第七幕用的，v3.1 起一直是 0）
uniform float uCalm;       // 第七幕：水面平成一面镜子
uniform float uNeb;        // 第七幕：星云铺开了多少（0..1）
uniform float uNebI;       // 星云多亮
uniform float uNebQ;       // 档位：2 = 云 + 丝 + 尘；1 = 少一层丝
uniform vec4 uFin;         // 最后那个镜头：x 抬头（弧度）、y 竖直半视角正切、z 宽高比、w 移轴
uniform vec4 uNebSrc[5];   // 五样造物在最后那个镜头里的位置（x 乘过宽高比）：xy；z 它从什么时候开始散；w 亮度
uniform vec4 uTextWin;     // 那句话那块天（同样的坐标）：中心 xy、半宽半高 zw；留暗
uniform vec3 uInkW;        // 水的暗：比天（uInk）再暗一点
varying vec2 vNdc;

// —— 第七幕的星云：五种颜色从五样造物身上散开，铺满整片天 ——
// 坐标用最后那个镜头的屏幕坐标（x 乘宽高比）：星云挂在无穷远，镜头怎么升、怎么抬头，它都钉在天上；倒影用反射的方向查同一片
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), f.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p, float oct) {
  float s = 0., a = .5, w = 0.;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= oct) break;
    s += a * n2(p);
    w += a;
    p = mat2(1.62, 1.18, -1.18, 1.62) * p + 7.31;
    a *= .5;
  }
  return s / w;
}
vec2 finScreen(vec3 d, out float front) {
  float cp = cos(uFin.x), sp = sin(uFin.x);
  vec3 v = vec3(d.x, cp * d.y + sp * d.z, -sp * d.y + cp * d.z);
  front = -v.z;
  float iz = 1. / max(-v.z, .05);
  return vec2(v.x * iz / uFin.y, v.y * iz / uFin.y + uFin.w);
}
vec3 nebula(vec3 d) {
  if (uNeb <= 0.) return vec3(0.);
  float fr;
  vec2 S = finScreen(d, fr);
  if (fr < .08) return vec3(0.);
  float t = uTime * .003;
  vec2 p = S * .95 + vec2(3.1, 1.7);
  // 轻轻搅一下（搅狠了像大理石、像烟）
  vec2 q = vec2(fbm(p * 1.1 + t, 3.), fbm(p * 1.1 + vec2(5.2, 1.3) - t, 3.));
  vec2 w = p * 1.7 + (q - .5) * 1.25;
  float big = fbm(p * .62 + q * .35, 3.);                       // 大块：哪几片天被照亮
  float cloud = fbm(w, uNebQ > 1.5 ? 5. : 4.);                  // 一团一团的云
  float fil = 0.;                                               // 丝（低档少这一层）
  if (uNebQ > 1.5) { fil = 1. - abs(2. * fbm(w * 2.6 + q * 1.7, 4.) - 1.); fil = fil * fil * fil; }
  float dn = fbm(w * 1.55 + vec2(7.7, 2.2), 4.);               // 尘：暗的沟，沟沿被照亮
  // 五种颜色：每样造物把它的颜色往外散。颜色各占一片，交界被湍流搅在一起（不是一条彩虹）；离谁都远的地方是靛紫（律管着一切）
  vec3 hue = uFive[4] * .05;
  float wsum = .05, reach = 0.;
  for (int k = 0; k < 5; k++) {
    vec4 sr = uNebSrc[k];
    float sp = clamp((uNeb - sr.z) / max(1. - sr.z, .01), 0., 1.);
    sp = sp * sp * (3. - 2. * sp);
    float jit = ((cloud - .5) * 1.1 + (q.y - .5) * .7);
    float dd = length((S - sr.xy) * vec2(1., 1.15));
    // 颜色各占多大一片按屏宽算：竖着的手机屏窄，每种颜色占的那片也跟着窄，不然五种颜色在手机上全搅成一种
    float hr = mix(.06, (k == 4 ? 1.5 : .62) * clamp((uFin.z + .45) / 2.05, .38, 1.), sp);
    float wk = exp(-pow(max(dd + jit * hr, 0.) / hr, 2.)) * sr.w;
    hue += uFive[k] * wk * wk;
    wsum += wk * wk;
    float rad = mix(.05, 3.4, sp);   // 铺到最后比画面大一圈：点「进去」镜头扭过去也还是星云
    reach = max(reach, smoothstep(rad, rad * .35, dd + jit * rad * .45) * smoothstep(0., .05, sp));
  }
  hue /= wsum;
  float lit = smoothstep(.32, .74, big);
  float dens = smoothstep(.28, .86, cloud);
  dens *= dens;
  float e = .05 + lit * (.18 + 1.75 * dens) + .9 * fil * lit * (.4 + dens);
  float lane = smoothstep(.5, .6, dn);
  float rim = smoothstep(.43, .5, dn) * (1. - smoothstep(.5, .57, dn));
  e = e * (1. - .86 * lane) + rim * lit * .55;
  // 那句话那块天留暗（还是星空，只是没那么亮、没那么花）；靠地平线的地方云薄一些
  vec2 tw = (S - uTextWin.xy) / max(uTextWin.zw, vec2(.05));
  float win = exp(-dot(tw, tw) * .7);
  e *= 1. - .8 * win;
  e *= .45 + .55 * smoothstep(-.02, .14, d.y);
  e *= 1. - .45 * smoothstep(.8, 1.05, S.y);
  e *= reach;
  vec3 c = hue * e;
  // 最亮的芯子发白，颜色只在外圈
  c += vec3(1., .95, .88) * max(e - 1.2, 0.) * .45;
  return c * uNebI;
}

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
  // 冲击波扫过去以后，水面起一圈一圈的涟漪
  if (uShockI > .001) {
    vec2 dv = p - uShock.xz;
    float dd = length(dv) + 1e-3;
    float behind = uShock.w - dd;
    float rip = exp(-abs(behind) / 60.) * step(-30., behind);
    float fade = 1. - smoothstep(4., 16., fpz);
    g += (dv / dd) * .05 * uShockI * rip * sin(behind * .22) * fade;
  }
  g *= 1. - .88 * uCalm;   // 第七幕：浪平下去，水成一面镜子
  return normalize(vec3(-g.x, 1., -g.y));
}

// 天上那几盏造物灯在空气里的光晕（在物体后面）
vec3 halos(vec3 ro, vec3 rd) {
  vec3 c = vec3(0.);
  for (int i = 1; i < 6; i++) {
    vec3 L = uLights[i].xyz - ro;
    float dist = length(L);
    float cs = dot(rd, L / dist);
    if (cs > 0.) {
      float ang = sqrt(max(2. * (1. - cs), 0.));
      float s = uLights[i].w * .2 / dist;
      c += uLightC[i].rgb * (.45 * exp(-ang / (s * .3)) + .06 * exp(-ang / (s * 1.6))) * .3;
    }
  }
  return c;
}

void main() {
  vec4 v = uInvProj * vec4(vNdc, 1., 1.);
  vec3 rd = normalize(mat3(uCamWorld) * normalize(v.xyz / v.w));
  vec3 ro = uCamPos;
  float az = atan(rd.x, -rd.z);
  float elPx = rd.y / uPixAng;

  vec3 skyC = vec3(0.);
  if (elPx > -1.5) {
    float ins;
    skyC = skyBase(rd) + portal(ro, rd, ins) + halos(ro, rd) + nebula(rd);
  }
  vec3 waterC = vec3(0.);
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
    float ins;
    vec3 refl = skyBase(R) + portal(P, R, ins) + halos(P, R);
    if (ins > .5) refl = min(refl, vec3(2.4 * uLight));
    refl += nebula(R);
    // 门、造物的倒影：前面那一遍画好的（翻过来、压暗、被细浪推得一行一行错开）
    if (uReflOn > .5) {
      vec2 uv = gl_FragCoord.xy / uRes + vec2(N.x * .55, N.z * .2);
      vec4 m = texture2D(uRefl, uv);
      vec3 L = m.rgb / max(vec3(1.) - m.rgb, vec3(.004));
      refl = refl * (1. - m.a) + L;
    }
    waterC = refl * mix(F * .36, .08 + .6 * F, uCalm);

    float far = 1. - smoothstep(.0009, .004, down);
    float shin = mix(1900., 260., far);
    float toDoor = P.z - Z0;
    float distDoor = max(ro.z - Z0, 1.);
    float reachM = 1. - smoothstep(uReach * distDoor - 60., uReach * distDoor + 1., toDoor);
    // 光路：每盏灯在水上铺一条，细浪一闪一闪
    for (int i = 0; i < 6; i++) {
      float ps = uLightC[i].a;
      if (ps > .001) {
        vec3 Ld = normalize(uLights[i].xyz - P);
        vec3 Hh = normalize(Ld + V);
        float spec = pow(max(dot(N, Hh), 0.), shin) * (shin + 8.) / 25.;
        float m = i == 0 ? reachM : 1.;
        waterC += uLightC[i].rgb * spec * F * ps * .5 * m * smoothstep(.0006, .004, down);
      }
    }
    // 远处细浪抹平以后，门的光路变成一条柔和的亮带
    float soft = exp(-abs(az) / (.005 + .3 * down)) * smoothstep(.0002, .006, down) * (1. - smoothstep(.01, .085, down)) * .26 * uLight;
    waterC += mix(uLightCol, vec3(1.), .4) * soft * F * smoothstep(.12, .6, uDawn) * reachM * (1. - uGone);
    // 门缝里的光落到水上：一道扇形，门开得越大越宽
    if (toDoor > 0.) {
      float hw = uGap + toDoor * (.04 + uGap * .012);
      float fan = exp(-abs(P.x) / max(hw, .5)) * exp(-toDoor / 700.) * smoothstep(0., 20., toDoor);
      waterC += mix(uLightCol, vec3(1.), .3) * fan * uLight * .02 * (.3 + .7 * smoothstep(.0, .2, uOpen)) * reachM * (1. - uGone);
    }
    // 冲击波：一圈贴着水面的光，朝你扫过来
    if (uShockI > .001) {
      float dd = length(P.xz - uShock.xz);
      float wv = max(8., fpz * 1.5);
      float ring = exp(-abs(dd - uShock.w) / wv) * min(1., 30. / wv);
      waterC += vec3(1., .35, .18) * ring * uShockI * 2.4;
      waterC += vec3(1., .3, .15) * exp(-max(uShock.w - dd, 0.) / 160.) * step(dd, uShock.w) * uShockI * .03;
    }
    // 第六幕：水上浮出一张光的格网，格线全部收向门脚
    if (uGrid > .001) {
      vec2 dv = P.xz - vec2(0., Z0 - DT * .5);
      float rho = length(dv);
      float ang = atan(dv.x, dv.y);
      float step0 = 60.;
      float cr = abs(fract(rho / step0 + .5) - .5) * step0;
      float wC = max(fpz * .9, .35);
      float lc = (1. - smoothstep(0., wC, cr)) * min(1., 1.6 / (fpz / step0 * 6. + 1.)) * min(1., .6 / wC + .2);
      float da = PI / 30.;
      float ar = abs(fract(ang / da + .5) - .5) * da * rho;
      float wR = max(fpx * .9, .35);
      float lr = (1. - smoothstep(0., wR, ar)) * min(1., .6 / wR + .2) * smoothstep(0., 40., rho);
      float reveal = 1. - smoothstep(uGridR - 120., uGridR, rho);
      float g = max(lc, lr) * reveal * exp(-rho / 2200.);
      waterC += uGridCol * g * uGrid * 1.1;
    }
  }
  float wv = smoothstep(-.9, .9, elPx);
  vec3 col = mix(waterC, skyC, wv);

  // 地平线：一条笔直的细线（开场从门脚往两边划开）
  float span = uHorizon * 1.7;
  float hmask = 1. - smoothstep(span - .05, span, abs(az));
  float line = exp(-abs(elPx + .35) / .7) * (.16 + .5 * exp(-az * az * 40.) + .3 * exp(-az * az * 2.)) * uLight * hmask;
  float mist = exp(-abs(rd.y) * 70.) * (.03 + .3 * exp(-az * az * 9.)) * uLight * hmask;
  col += mix(uLightCol, vec3(1.), .5) * (line + mist);
  // 第七幕：门全开，白光盖满
  vec3 dcen = normalize(vec3(0., DH * .5, Z0) - ro);
  float dang = sqrt(max(2. * (1. - dot(rd, dcen)), 0.));
  col += vec3(1., .985, .96) * (uFlood * (2.2 * exp(-dang / .2) + .22 * exp(-dang / .75)) + uFloodB * (6. + 1.5 * exp(-dang / .7)));
  float vg = 1. - .42 * pow(length(vNdc * vec2(.8, 1.)) * .72, 2.2);
  col *= max(vg, 0.);
  // 暗角、没有光的天和水，最暗也只到墨蓝（水比天再暗一点）
  gl_FragColor = vec4(inked(toSRGB(tonemap(col)), mix(uInkW, uInk, wv)) + dither(), 1.);
}
`;

// ———— 门：两扇，各 6 × 27 块黑石，绕外侧竖边往里开 ————
export const DOOR_VERT = /* glsl */ `
attribute vec4 aRand;
attribute vec4 aInfo;      // x 属于哪撮（-1 不属于）、y 外沿标记（1 左 2 右 4 顶）、z 列、w 行
uniform float uOut[5];     // 每撮离门离了多少
uniform vec3 uOutTo[5];    // 离门以后飞去哪（那一幕的造物正在生出来的地方）
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vLN;
varying vec4 vRand;
varying vec4 vInfo;
varying vec2 vDoor;
varying float vFree;
varying float vLit;
void main() {
  float col = aInfo.z, row = aInfo.w;
  float side = col < 5.5 ? -1. : 1.;
  vec3 c0 = vec3(-DW * .5 + (col + .5) * CELL, (row + .5) * CELL, Z0 - DT * .5);
  vec3 lp = position * vec3(CELL * 1.004, CELL * 1.004, DT);
  float a = -side * uOpen;
  float ca = cos(a), sa = sin(a);
  mat3 R = mat3(ca, 0., -sa, 0., 1., 0., sa, 0., ca);
  vec3 hinge = vec3(side * DW * .5, 0., Z0);
  vec3 pc = hinge + R * (c0 - hinge);
  vec3 wp = pc + R * lp;
  vFree = 0.;
  if (aInfo.x > -.5) {
    int k = int(aInfo.x + .5);
    float o = uOut[k];
    if (o > 0.) {
      float s = clamp(o * 1.3 - aRand.y * .3, 0., 1.);
      float shake = sin(uTime * 38. + aRand.x * 30.) * .45 * smoothstep(0., .06, s) * (1. - smoothstep(.12, .22, s));
      float fl = smoothstep(.16, 1., s);
      vec3 to = uOutTo[k] + (aRand.xyz - .5) * 20.;
      vec3 mid = mix(pc, to, .5) + vec3(0., 25., 70.) * (aRand.w + .5);
      vec3 q = mix(mix(pc, mid, fl), mix(mid, to, fl), fl);
      float sh = 1. - smoothstep(.65, 1., fl);
      mat3 Rt = rotAxis(normalize(aRand.zxy - .5 + vec3(1e-3)), fl * (3. + aRand.z * 5.));
      wp = q + vec3(shake, 0., 0.) + Rt * (R * lp) * sh;
      vFree = fl;
    }
  }
  // 第七幕：门自己裂开——先轻轻抖、缝里透光，然后一块块松开往上飞，飞的时候被光点亮，飞到天上缩没（那一下炸成星）
  vLit = 0.;
  if (aInfo.x < -.5 && (uRise > 0. || uCrack > 0.)) {
    float s = riseS(row, aRand.x);
    float shake = uCrack * (1. - smoothstep(0., .1, s)) * (.16 + .3 * aRand.y);
    vec3 q = risePath(pc, aRand, s);
    mat3 Rt = rotAxis(normalize(aRand.zxy - .5 + vec3(1e-3)), s * s * (2.5 + aRand.w * 6.));
    float sc = 1. - .3 * smoothstep(.15, .5, s) - .7 * smoothstep(.5, .66, s);
    wp = q + vec3(sin(uTime * 41. + aRand.y * 50.), .5 * sin(uTime * 37. + aRand.z * 40.), 0.) * shake + Rt * (R * lp) * sc;
    vLit = smoothstep(.02, .42, s);
    vFree = max(vFree, smoothstep(0., .08, s));
  }
  vWorld = wp;
  vLocal = position;
  vLN = normal;
  vRand = aRand;
  vInfo = aInfo;
  vDoor = c0.xy + lp.xy;
  vec3 rp = wp;
  if (uMirror > .5) rp.y = -rp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(rp, 1.);
}
`;

export const DOOR_FRAG = /* glsl */ `
uniform vec4 uHoleD[5];    // 五撮在门面上原来的矩形（不随门转）
uniform float uSeam;       // 开场：正中那道缝从下往上亮到哪（0..1）
uniform float uSlitI;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vLN;
varying vec4 vRand;
varying vec4 vInfo;
varying vec2 vDoor;
varying float vFree;
varying float vLit;

void main() {
  if (vWorld.y < -.05) discard;
  vec3 sc = vec3(CELL * 1.004, CELL * 1.004, DT);
  vec3 an = abs(vLN);
  vec2 uv, hs;
  vec3 a1, a2;
  if (an.z > .5) { uv = vLocal.xy * sc.xy; hs = sc.xy * .5; a1 = vec3(1., 0., 0.); a2 = vec3(0., 1., 0.); }
  else if (an.x > .5) { uv = vLocal.zy * sc.zy; hs = sc.zy * .5; a1 = vec3(0., 0., 1.); a2 = vec3(0., 1., 0.); }
  else { uv = vLocal.xz * sc.xz; hs = sc.xz * .5; a1 = vec3(1., 0., 0.); a2 = vec3(0., 0., 1.); }
  vec2 de = hs - abs(uv);
  float dEdge = min(de.x, de.y);
  float pw = max(length(fwidth(vWorld)) * .7, 1e-4);
  bool front = vLN.z > .5;
  float bev = mix(.16, .44, vRand.x);
  float bw = max(bev, pw * 1.15);
  float tb = 1. - smoothstep(0., bw, dEdge);
  vec3 outward = de.x < de.y ? a1 * sign(uv.x) : a2 * sign(uv.y);
  vec3 tilt = vec3((vRand.w - .5) * .035, (vRand.z - .5) * .035, 0.);
  vec3 Nl = normalize(vLN + outward * tb * .9 + tilt);
  float side = vInfo.z < 5.5 ? -1. : 1.;
  float ang = -side * uOpen;
  float ca = cos(ang), sa = sin(ang);
  vec3 N = vec3(ca * Nl.x + sa * Nl.z, Nl.y, -sa * Nl.x + ca * Nl.z);

  vec3 E = eyePos();
  vec3 V = normalize(E - vWorld);
  vec3 Rf = reflect(-V, N);
  vec3 env = Rf.y >= 0. ? skyBase(Rf) : skyBase(vec3(Rf.x, -Rf.y, Rf.z)) * .18 + .0008 * uLight;
  float rough = mix(.12, .5, vRand.y);
  float F = .04 + .96 * pow(1. - max(dot(N, V), 0.), 5.);
  float comp = mix(1., bev / bw, tb);
  vec3 col = vec3(.0005 + .012 * mix(.75, 1.25, vRand.z) * (.0016 + .01 * uLight));
  col += env * F * (1. - rough * .65) * comp;

  float sw = max(.2, pw * 1.05);
  float seamM = (1. - smoothstep(0., sw, dEdge)) * min(1., .2 / sw) * mix(.12, 1.5, vRand.z * vRand.z);
  if (front) {
    // 门缝漏光
    float nearSlit = exp(-abs(vDoor.x) / 14.);
    vec3 seamC = mix(uLightCol, vec3(1.), .35) * coreGlow(vDoor) * (.035 + .09 * nearSlit) * uLight;
    col += seamM * seamC;
    // 门的外沿：一圈细亮边，跟天上那圈光接上
    float e = floor(vInfo.y + .5);
    float dO = 1e3;
    if (e > .5 && e != 4.) dO = min(dO, DW * .5 - abs(vDoor.x));
    if (e > 3.5) dO = min(dO, DH - vDoor.y);
    float rw = max(.45, pw * 1.1);
    float nearC = exp(-abs(vDoor.y - DH * .46) / 170.);
    col += (1. - smoothstep(0., rw, dO)) * 2.1 * (.32 + .68 * nearC) * uLight * min(1., .55 / rw) * mix(uLightCol, vec3(1.), .4) * (1. - vFree);
    // 开场：两扇门中间那道缝，从下往上亮起来
    float hy = 1. - smoothstep(uSeam * DH - 6., uSeam * DH + 2., vDoor.y);
    float hx = abs(vDoor.x);
    col += (3. * exp(-hx / .35) + .22 * exp(-hx / 4.5)) * hy * uSlitI * mix(uLightCol, vec3(1.), .7);
  }
  // 窗：离开的那撮留下的口子，颜色从里面漫出来，照亮周围的石头
  for (int k = 0; k < 5; k++) {
    float ha = uHoleCol[k].a;
    if (ha > .001) {
      float dh = max(rectSD(vDoor, uHoleD[k].xy, uHoleD[k].zw), 0.);
      col += uHoleCol[k].rgb * ha * (1.4 * exp(-dh / 1.2) + .3 * exp(-dh / 6.) + .05 * exp(-dh / 30.)) * (.35 + .9 * seamM) * (front ? 1. : .8);
    }
  }
  // 门洞里的光照亮转向它的面（门缝两边的侧面；门开大了，正面也被照到）
  vec3 Lp = vec3(0., DH * .46, Z0 - 60.);
  vec3 Ld = Lp - vWorld;
  float dl = length(Ld);
  Ld /= dl;
  col += max(dot(N, Ld), 0.) * mix(uLightCol, vec3(1.), .45) * uLight * 2.4 * exp(-dl / 150.) * smoothstep(.01, .08, uOpen) * (1. - .7 * smoothstep(.5, 1.2, uOpen));
  col += creationLight(vWorld, N, V) * .3;
  col *= 1. - uDark * .93;
  // 第七幕：门裂开，每条缝都透出光（越靠正中那道缝越亮）；松开飞起来的石头被光点亮，边上最烫，带一点五种颜色里的一种
  if (uCrack > 0.) {
    float cw = max(.32, pw * 1.3);
    float crackM = (1. - smoothstep(0., cw, dEdge)) * min(1., .5 / cw);
    float nearC = .7 + 1.3 * exp(-abs(vDoor.x) / 20.);
    col += crackM * uCrack * (1. - vLit) * nearC * mix(uLightCol, vec3(1.), .4) * 4.5;
  }
  if (vLit > 0.) {
    // 被光点亮：先是边上一圈亮起来（光从缝里漫上来），越往上飞，整块越亮、越透，最后像一颗烧着的星；带一点五种颜色里的一种
    vec3 tint = mix(vec3(1., .84, .62), five(vRand.w), .42);
    float edge = 1. - smoothstep(0., max(.4, pw * 1.7), dEdge);
    float ndv = max(dot(N, V), 0.);
    float body = vLit * vLit;
    col = col * (1. - .8 * body) + tint * body * (.9 + 1.6 * ndv * ndv) + mix(tint, vec3(1., .95, .88), .6) * edge * (2. + 5. * body) * smoothstep(0., .25, vLit);
  }

  float dist = length(vWorld - E);
  float haze = 1. - exp(-dist * .000035);
  float mist = exp(-max(vWorld.y, 0.) / (.05 * DH)) * .28 * uDawn;
  col = mix(col, airLight(vWorld, -V), clamp(haze + mist, 0., .85) * (1. - uDark));
  gl_FragColor = outColor(col);
}
`;

// ———— 造物的碎石：一个通用的身子，每样造物自己写 chip() 算这一块在哪、怎么转、多大 ————
export const CHIP_HEAD = /* glsl */ `
attribute vec4 aSeed;
attribute float aIdx;      // 打乱过的序号 / 总数：砍掉一部分，剩下的还是均匀的
uniform float uN;          // 这样造物满打满算多少块
uniform float uForm;
uniform vec3 uC;
uniform float uScale;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vLN;
varying vec3 vScale;
varying vec4 vSeed;
varying float vHeat;
varying vec3 vR0;
varying vec3 vR1;
varying vec3 vR2;
mat3 basisZ(vec3 z) {
  vec3 up = abs(z.y) < .99 ? vec3(0., 1., 0.) : vec3(1., 0., 0.);
  vec3 x = normalize(cross(up, z));
  return mat3(x, cross(z, x), z);
}
vec3 bez(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
  float u = 1. - t;
  return u * u * u * a + 3. * u * u * t * b + 3. * u * t * t * c + t * t * t * d;
}
vec3 fibDir(float i, float n) {
  float y = 1. - 2. * (i + .5) / n;
  float r = sqrt(max(1. - y * y, 0.));
  float ph = i * 2.39996323;
  return vec3(cos(ph) * r, y, sin(ph) * r);
}
vec3 hdir(vec3 r) {
  float z = r.x * 2. - 1.;
  float a = r.y * TAU;
  float s = sqrt(max(1. - z * z, 0.));
  return vec3(s * cos(a), z, s * sin(a));
}
`;

export const CHIP_MAIN = /* glsl */ `
void main() {
  vec3 P; mat3 R; vec3 S; float heat;
  chip(P, R, S, heat);
  vec3 wp = P + R * (position * S);
  vWorld = wp;
  vLocal = position;
  vLN = normal;
  vScale = max(S, vec3(1e-3));
  vSeed = aSeed;
  vHeat = heat;
  vR0 = R[0]; vR1 = R[1]; vR2 = R[2];
  vec3 rp = wp;
  if (uMirror > .5) rp.y = -rp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(rp, 1.);
}
`;

// Ⅱ 燃日：几千块碎石聚成的太阳，芯子白热（芯子是另一个球，见 CORE）
export const SUN_CHIP = /* glsl */ `
uniform vec3 uShape;
uniform float uSpin;
void chip(out vec3 P, out mat3 R, out vec3 S, out float heat) {
  float i = floor(aIdx * uN);
  vec3 d = fibDir(i, uN);
  float cs = cos(uSpin), sn = sin(uSpin);
  d = vec3(cs * d.x + sn * d.z, d.y, -sn * d.x + cs * d.z);
  float rad = 46. * uScale;
  vec3 tgt = uC + d * rad * (1. + (aSeed.x - .5) * .08) * uShape;
  float b = aSeed.y * .62;
  float s = clamp((uForm - b) / .38, 0., 1.);
  s = s * s * (3. - 2. * s);
  vec3 A = vec3((aSeed.z - .5) * 1.5, 30. + aSeed.z * 180., Z0 - 4.);
  vec3 B = A + vec3(0., 10., 80.);
  vec3 C = tgt + d * rad * .7;
  P = bez(A, B, C, tgt, s);
  R = basisZ(normalize(d * uShape + 1e-4)) * rotAxis(vec3(0., 0., 1.), aSeed.w * TAU);
  float sz = mix(2.9, 4.3, aSeed.x) * uScale;
  S = vec3(sz, sz * mix(.75, 1.15, aSeed.z), mix(1.6, 2.8, aSeed.y) * uScale) * smoothstep(0., .1, s);
  heat = mix(.55, 1.35, aSeed.x);
}
`;

// Ⅲ 布环：尘从门缝里涌出来，贴着一个看不见的弧面绕门流一整圈，首尾接上
export const RING_CHIP = /* glsl */ `
uniform mat3 uRot;
uniform float uSpin;
void chip(out vec3 P, out mat3 R, out vec3 S, out float heat) {
  heat = 0.;
  float age = uForm - aIdx * .8;
  if (age <= 0.) { P = uC; R = mat3(1.); S = vec3(0.); return; }
  float rad = 175. * uScale;
  float band = (aSeed.x - .5) * 2.;
  band = band * mix(1., abs(band), .55);
  float rr = rad + band * 26. * uScale;
  float yy = (aSeed.y - .5) * 4. * uScale;
  float entry = PI * .5;
  float trav = .18;
  float tw = uTime * (.4 + aSeed.y);
  if (age < trav) {
    float s = age / trav;
    vec3 Pe = uC + uRot * vec3(rr * cos(entry), yy, rr * sin(entry));
    vec3 tanE = uRot * vec3(-sin(entry), 0., cos(entry));
    vec3 A = vec3((aSeed.z - .5) * 2., 40. + aSeed.z * 160., Z0 - 3.);
    vec3 B = A + vec3(0., -25., 80.);
    vec3 C = Pe - tanE * 70.;
    P = bez(A, B, C, Pe, s);
    vec3 dir = normalize(bez(A, B, C, Pe, min(s + .03, 1.)) - bez(A, B, C, Pe, max(s - .03, 0.)) + 1e-4);
    R = basisZ(dir) * rotAxis(vec3(0., 0., 1.), aSeed.w * TAU + tw);
  } else {
    float ang = entry + (age - trav) / (1. - trav) * TAU * .999 + uSpin;
    P = uC + uRot * vec3(rr * cos(ang), yy, rr * sin(ang));
    vec3 tng = uRot * vec3(-sin(ang), 0., cos(ang));
    R = basisZ(tng) * rotAxis(vec3(0., 0., 1.), aSeed.w * TAU + tw);
  }
  float sz = mix(1.3, 3.6, aSeed.z * aSeed.z) * uScale;
  S = vec3(sz, sz * mix(.6, 1.1, aSeed.x), sz * mix(.6, 1.3, aSeed.y)) * smoothstep(0., .03, age);
}
`;

// Ⅲ 环上的小月：每颗是 3 × 3 × 3 块石头，慢慢翻滚
export const MOON_CHIP = /* glsl */ `
uniform vec4 uMoon[8];     // xyz 位置，w 大小（0 = 还没出来）
uniform float uMoonHi[8];
void chip(out vec3 P, out mat3 R, out vec3 S, out float heat) {
  int m = int(aSeed.x + .5);
  vec4 mo = uMoon[m];
  float t = uTime * .22 + float(m) * 1.7;
  R = rotAxis(normalize(vec3(.3 + .1 * float(m), 1., .2)), t);
  P = mo.xyz + R * (aSeed.yzw * 4.5 * mo.w);
  S = vec3(4.35 * mo.w);
  heat = uMoonHi[m];
}
`;

// Ⅳ 赋生：一头黑石砌成的巨鲸。身子顺着一条路游（头在前，身子跟着同一条路），游完一圈慢慢摆成最后那个姿势
export const WHALE_CHIP = /* glsl */ `
uniform float uSwim;       // 头走到路上哪了（弧度）
uniform float uSettle;     // 0 = 跟着路游，1 = 停在天上
uniform mat3 uWRot;        // 停下来以后的朝向
uniform vec3 uDC;          // 门的正中（绕行的圆心）
uniform float uWR;         // 绕门那一圈的半径
uniform float uWave;       // 停下来以后身子还摆多大（第四到第六幕 0.25；第七幕在星云里游，摆得大一些）
float wRad(float u) {
  float head = sqrt(smoothstep(0., .16, u));
  float tail = mix(1., .1, smoothstep(.36, .9, u));
  return .088 * head * tail;
}
vec3 wPath(float ph) {
  float k = 1.5;
  float y = 118. + 22. * sin(ph * .8) * smoothstep(0., 1., ph) + max(ph - 6.2, 0.) * 60.;
  if (ph < 0.) return vec3(0., y, uDC.z + ph * uWR * k);
  float r = uWR * (1. - exp(-ph * k));
  return vec3(-r * sin(ph), y, uDC.z + r * cos(ph));
}
float wSpeed(float ph) {
  float k = 1.5;
  if (ph < 0.) return uWR * k;
  float r = uWR * (1. - exp(-ph * k)), dr = uWR * k * exp(-ph * k);
  return sqrt(r * r + dr * dr) + 1.;
}
void spine(float u, float L, out vec3 p, out vec3 T, out vec3 Up, out vec3 Nl) {
  float sp = wSpeed(uSwim);
  float sm = wSpeed(uSwim - .5 * u * L / sp);
  float ph = uSwim - u * L / sm;
  vec3 p1 = wPath(ph);
  vec3 t1 = normalize(wPath(ph + .01) - wPath(ph - .01));
  vec3 p2 = uC + uWRot * vec3(L * (.5 - u), L * (.035 * sin(PI * u) - .02 * u * u), 0.);
  vec3 t2 = uWRot * normalize(vec3(1., -.035 * PI * cos(PI * u) + .04 * u, 0.));
  p = mix(p1, p2, uSettle);
  T = normalize(mix(t1, t2, uSettle));
  Nl = normalize(cross(T, vec3(0., 1., 0.)));
  Up = cross(Nl, T);
  // 游：上下摆，越往尾巴摆得越大；停下以后只剩很慢的呼吸
  float sw = mix(1., uWave, uSettle);
  p += Up * L * .035 * u * u * sin(TAU * u * .9 - uTime * 1.5) * sw;
}
void chip(out vec3 P, out mat3 R, out vec3 S, out float heat) {
  heat = 0.;
  float L = 300. * uScale;
  float j = floor(aIdx * uN);
  float lat = fract(j * .618034);
  vec3 p, T, Up, Nl;
  vec3 nrm;
  float sz;
  if (aIdx < .78) {
    // 身子
    float u = aIdx / .78;
    spine(u, L, p, T, Up, Nl);
    float a = lat * TAU;
    float r = wRad(u) * L;
    vec3 o = cos(a) * Nl + sin(a) * Up * (sin(a) < 0. ? .78 : .9);
    P = p + o * r;
    nrm = normalize(cos(a) * Nl + sin(a) * Up);
    sz = mix(4.6, 6.6, aSeed.x) * sqrt(max(wRad(u) / .088, .14)) * uScale;
  } else if (aIdx < .9) {
    // 尾鳍：横着的两片，往后掠
    float v = (aIdx - .78) / .12;
    float u = .86 + .15 * v;
    spine(u, L, p, T, Up, Nl);
    float x = lat * 2. - 1.;
    float spanW = L * .16 * pow(max(sin(PI * (u - .86) / .155), 0.), .7);
    P = p + Nl * x * spanW - T * x * x * L * .05 + Up * (aSeed.y - .5) * 1.2 * uScale;
    nrm = Up;
    sz = mix(3.6, 4.8, aSeed.x) * uScale;
  } else if (aIdx < .98) {
    // 胸鳍：两片长鳍，往外、往下、往后伸
    float v = (aIdx - .9) / .08;
    float sd = lat < .5 ? -1. : 1.;
    float t = fract(lat * 2.);
    float u0 = .27 + .1 * t;
    spine(u0, L, p, T, Up, Nl);
    float chord = (1. - t * .85) * L * .055;
    float flap = sin(uTime * .9 + sd) * .12 * t;
    P = p + Nl * sd * (wRad(.27) * L + t * L * .26) + Up * (-t * L * .1 + flap * L * .1) - T * (t * L * .06 + (v - .5) * chord);
    nrm = normalize(Up - Nl * sd * .3);
    sz = mix(3.4, 4.6, aSeed.x) * uScale;
  } else {
    // 背鳍
    float v = (aIdx - .98) / .02;
    float u = .66 + .08 * lat;
    spine(u, L, p, T, Up, Nl);
    P = p + Up * (wRad(u) * L + v * L * .03);
    nrm = Up;
    sz = 2.6 * uScale;
  }
  R = basisZ(nrm) * rotAxis(vec3(0., 0., 1.), aSeed.w * TAU);
  S = vec3(sz, sz * mix(.7, 1.1, aSeed.z), mix(1.4, 2.4, aSeed.y) * uScale);
}
`;

// Ⅴ 铸器：四周的碎石朝一点坍缩 → 顿一拍 → 炸开（一部分变成落进水里的火星，其余的回来套成三道环）
export const ARM_CHIP = /* glsl */ `
uniform float uBlast;      // 炸开以后过了多少（幕内进度单位，0 = 还没炸）
uniform mat3 uRA;
uniform mat3 uRB;
uniform mat3 uRC;
uniform float uHeatA;      // 环冷到哪了
void chip(out vec3 P, out mat3 R, out vec3 S, out float heat) {
  vec3 dir = hdir(aSeed.xyz);
  vec3 sd = normalize(vec3(dir.x, dir.y * .8, min(dir.z, .15) - .25));
  float r0 = 190. + aSeed.x * 260.;
  float c = clamp((uForm - aSeed.y * .35) / .65, 0., 1.);
  c = c * c;
  P = uC + sd * r0 * (1. - c) * uScale;
  float vis = smoothstep(0., .1, uForm - aSeed.y * .35 + .02) * mix(.45, 1., c);
  heat = 2. * c * c;
  R = rotAxis(hdir(aSeed.wzy), uTime * (1. + aSeed.z) + aSeed.x * 10.);
  if (uBlast > 0.) {
    float bt = uBlast;
    if (aIdx >= .62) {
      // 火星：往外甩，落进水里
      float tau = bt * 7.;
      vec3 v0 = vec3(dir.x, abs(dir.y) * .7 + .2, min(dir.z, .2)) * (150. + 240. * aSeed.z) * uScale + vec3(0., 40., 0.);
      P = uC + v0 * tau + vec3(0., -170. * tau * tau, 0.);
      heat = 1.8 * exp(-tau * 1.1);
      vis = step(0., P.y) * (1. - smoothstep(2.4, 3., tau));
    } else {
      // 回来套成浑天仪的三道环
      float q = aIdx / .62 * 3.;
      float jr = floor(q);
      float th = fract(q) * TAU;
      float rr = (66. - jr * 7.) * uScale + (aSeed.x - .5) * 3.4 * uScale;
      vec3 lp = vec3(rr * cos(th), (aSeed.y - .5) * 2.6 * uScale, rr * sin(th));
      mat3 RR = jr < .5 ? uRA : (jr < 1.5 ? uRB : uRC);
      vec3 tgt = uC + RR * lp;
      vec3 Pb = uC + dir * (60. + 170. * aSeed.z) * (1. - exp(-bt * 16.)) * uScale;
      float back = smoothstep(.05, .4, bt);
      P = mix(Pb, tgt, back);
      vec3 tng = RR * vec3(-sin(th), 0., cos(th));
      mat3 Bz = basisZ(tng);
      R = mat3(mix(R[0], Bz[0], back), mix(R[1], Bz[1], back), mix(R[2], Bz[2], back));
      heat = mix(2.1 * exp(-bt * 9.) + .6, uHeatA, smoothstep(.1, .45, bt));
      vis = 1.;
    }
  }
  float sz = mix(2.6, 4.2, aSeed.z) * uScale * (uBlast > 0. && aIdx >= .62 ? .55 : 1.);
  S = vec3(sz, sz * .7, sz * .55) * vis;
}
`;

export const CHIP_FRAG = /* glsl */ `
uniform vec3 uGlowCol;     // 这样造物自己的颜色
uniform float uGlow;       // 石缝里透出来的光
uniform float uHot;        // 1 = 烧红的石块（日、器）
uniform float uCDark;      // 这样造物自己压暗（鲸变成星座以后）
uniform float uEmit;       // 每块石头自己发多少光（环上的尘）
uniform float uBright;     // 天上鼠标指着它、键盘停在它的名字上：整样造物亮一点（1 = 照常）
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vLN;
varying vec3 vScale;
varying vec4 vSeed;
varying float vHeat;
varying vec3 vR0;
varying vec3 vR1;
varying vec3 vR2;
void main() {
  if (vWorld.y < 0.) discard;
  if (inAperture(vWorld)) discard;
  vec3 an = abs(vLN);
  vec2 uv, hs;
  vec3 a1, a2;
  if (an.z > .5) { uv = vLocal.xy * vScale.xy; hs = vScale.xy * .5; a1 = vec3(1., 0., 0.); a2 = vec3(0., 1., 0.); }
  else if (an.x > .5) { uv = vLocal.zy * vScale.zy; hs = vScale.zy * .5; a1 = vec3(0., 0., 1.); a2 = vec3(0., 1., 0.); }
  else { uv = vLocal.xz * vScale.xz; hs = vScale.xz * .5; a1 = vec3(1., 0., 0.); a2 = vec3(0., 0., 1.); }
  vec2 de = hs - abs(uv);
  float dEdge = min(de.x, de.y);
  float pw = max(length(fwidth(vWorld)) * .7, 1e-4);
  float bw = max(.3, pw * 1.1);
  float tb = 1. - smoothstep(0., bw, dEdge);
  vec3 outward = de.x < de.y ? a1 * sign(uv.x) : a2 * sign(uv.y);
  vec3 N = normalize(mat3(vR0, vR1, vR2) * normalize(vLN + outward * tb * .8));
  vec3 E = eyePos();
  vec3 V = normalize(E - vWorld);
  float ndv = max(dot(N, V), 0.);
  vec3 Rf = reflect(-V, N);
  vec3 env = Rf.y >= 0. ? skyBase(Rf) : skyBase(vec3(Rf.x, -Rf.y, Rf.z)) * .18;
  float F = .04 + .96 * pow(1. - ndv, 5.);
  vec3 col = vec3(.0008) * mix(.7, 1.3, vSeed.z) + env * F * .6;
  col += creationLight(vWorld, N, V);
  // 逆光：门在它后面时，轮廓被勾一圈亮边
  vec3 toDoor = normalize(uLights[0].xyz - vWorld);
  float back = max(dot(-V, toDoor), 0.);
  col += pow(1. - ndv, 2.5) * back * back * uLightC[0].rgb * .7;
  // 石缝里透出来的光
  float sw = max(.14, pw);
  float seam = (1. - smoothstep(0., sw, dEdge)) * min(1., .25 / sw);
  col += uGlowCol * uGlow * (seam * mix(.4, 1.7, vSeed.y) * .9 + .01);
  col += uGlowCol * uEmit * mix(.15, 1.8, vSeed.y * vSeed.y) * (.6 + .4 * ndv);
  if (uHot > .5) {
    float h = vHeat;
    vec3 hc = mix(uGlowCol, vec3(1., .94, .84), smoothstep(.95, 2.2, h));
    float face = mix(.3, 1., pow(ndv, .6));
    col += hc * h * (1.9 * face + 2.6 * (1. - smoothstep(0., sw * 2.5, dEdge)));
  } else {
    col += uGlowCol * vHeat * 1.6 * (.4 + seam);
  }
  col *= 1. - uCDark;
  col *= 1. - uDark;
  float dist = length(vWorld - E);
  float haze = 1. - exp(-dist * .00003);
  col = mix(col, airLight(vWorld, -V), clamp(haze, 0., .8) * (1. - uDark));
  gl_FragColor = outColor(col * uBright);
}
`;

// 太阳的芯子：白热，外圈琥珀
export const CORE_VERT = /* glsl */ `
uniform vec3 uC;
uniform float uScale;
uniform vec3 uShape;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec3 wp = uC + position * 46. * .9 * uScale * uShape;
  vWorld = wp;
  vN = normalize(normal / uShape);
  vec3 rp = wp;
  if (uMirror > .5) rp.y = -rp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(rp, 1.);
}
`;
export const CORE_FRAG = /* glsl */ `
uniform float uHeat;
uniform vec3 uGlowCol;
uniform float uBright;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  if (vWorld.y < 0.) discard;
  if (inAperture(vWorld)) discard;
  vec3 V = normalize(eyePos() - vWorld);
  float ndv = max(dot(normalize(vN), V), 0.);
  vec3 c = mix(uGlowCol * 3., vec3(1., .96, .9) * 9., pow(ndv, 1.4)) * uHeat;
  gl_FragColor = outColor(c * (1. - uDark) * uBright);
}
`;

// 火舌：一千道，从日面甩出去，划一道弧，再落回日面
export const FLARE_VERT = /* glsl */ `
attribute vec4 aSeed;
attribute float aIdx;
uniform float uN;
uniform vec3 uC;
uniform float uScale;
uniform float uSpin;
uniform float uIgnite;
uniform float uFlare;
varying vec2 vQ;
varying float vI;
varying vec3 vWorld;
vec3 fibDir(float i, float n) {
  float y = 1. - 2. * (i + .5) / n;
  float r = sqrt(max(1. - y * y, 0.));
  float ph = i * 2.39996323;
  return vec3(cos(ph) * r, y, sin(ph) * r);
}
vec3 arcP(vec3 A, vec3 ax, float span, float rad, float hgt, float t) {
  vec3 d = rotAxis(ax, span * t) * A;
  return uC + d * (rad + hgt * sin(PI * t));
}
void main() {
  float i = floor(aIdx * uN);
  vec3 A = fibDir(i, uN);
  float cs = cos(uSpin), sn = sin(uSpin);
  A = vec3(cs * A.x + sn * A.z, A.y, -sn * A.x + cs * A.z);
  vec3 ax = normalize(cross(A, normalize(aSeed.xyz - .5 + vec3(0., 0., 1e-3))));
  float span = .22 + aSeed.x * .55;
  float rad = 46. * uScale;
  float hgt = (.15 + aSeed.y * aSeed.y * .85) * rad;
  float per = 3.2 + aSeed.z * 5.5;
  float cyc = fract(uTime / per + aSeed.w);
  float ph = clamp(cyc / .5, 0., 1.);
  float tt = mix(max(ph - .38, 0.), ph, position.x);
  vec3 p = arcP(A, ax, span, rad, hgt, tt);
  vec3 p2 = arcP(A, ax, span, rad, hgt, min(tt + .02, 1.));
  vec3 fwd = normalize(p2 - p + 1e-5);
  vec3 sd = normalize(cross(fwd, eyePos() - p));
  float w = (.45 + aSeed.x * 1.05) * uScale * (1.15 - .55 * position.x);
  vec3 wp = p + sd * position.y * w;
  float lit = smoothstep(0., .06, uIgnite - (A.y * .5 + .5) * .92);
  vI = lit * uFlare * sin(PI * ph) * step(cyc, .5);
  vQ = position.xy;
  vWorld = wp;
  vec3 rp = wp;
  if (uMirror > .5) rp.y = -rp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(rp, 1.);
}
`;
export const FLARE_FRAG = /* glsl */ `
uniform vec3 uGlowCol;
varying vec2 vQ;
varying float vI;
varying vec3 vWorld;
void main() {
  if (vI < .002 || inAperture(vWorld)) discard;
  float a = exp(-vQ.y * vQ.y * 3.5) * (.2 + .8 * vQ.x * vQ.x) * vI;
  vec3 c = mix(uGlowCol, vec3(1., .95, .85), a * .5) * a * 1.7 * (1. - uDark);
  gl_FragColor = outGlow(c);
}
`;

// 线（轨道、星座）：在屏幕上按像素加宽，远近一样细
export const LINE_VERT = /* glsl */ `
attribute vec3 aA;
attribute vec3 aB;
attribute float aT;
attribute float aSide;
attribute float aU;
uniform mat4 uM;
uniform vec2 uRes;
uniform float uWidth;
varying float vS;
varying float vU;
varying vec3 vWorld;
void main() {
  vec4 wa = uM * vec4(aA, 1.), wb = uM * vec4(aB, 1.);
  vWorld = (aT < .5 ? wa : wb).xyz;
  if (uMirror > .5) { wa.y = -wa.y; wb.y = -wb.y; }
  vec4 ca = projectionMatrix * viewMatrix * wa;
  vec4 cb = projectionMatrix * viewMatrix * wb;
  vU = aU;
  vS = aSide;
  if (ca.w < 1. || cb.w < 1.) { gl_Position = vec4(0., 0., 2., 1.); return; }
  vec2 sa = ca.xy / ca.w * uRes * .5, sb = cb.xy / cb.w * uRes * .5;
  vec2 dir = normalize(sb - sa + 1e-5);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 c = aT < .5 ? ca : cb;
  c.xy += nrm * aSide * uWidth * c.w / (uRes * .5);
  gl_Position = c;
}
`;
export const LINE_FRAG = /* glsl */ `
uniform vec3 uLineCol;
uniform float uLineI;
uniform float uDraw;
varying float vS;
varying float vU;
varying vec3 vWorld;
void main() {
  if (vU > uDraw || vWorld.y < 0. || inAperture(vWorld)) discard;
  float a = exp(-vS * vS * 2.5);
  float head = smoothstep(uDraw - .05, uDraw, vU) * (1. - step(.999, uDraw));
  vec3 c = mix(uLineCol, vec3(1.), .35 * a) * a * uLineI * (1. + 3. * head) * (1. - uDark);
  gl_FragColor = outGlow(c);
}
`;

// 点（星星、星座的关节）
export const STAR_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uStarOn;
uniform float uStarFree;
uniform vec3 uGridC;
uniform float uPxScale;
uniform float uNarrowR;
varying float vA;
varying vec3 vWorld;
void main() {
  float k = floor(aSeed.x * 31.);
  float j = 1. + floor(aSeed.y * 9.);
  float ang = (k - 15.) * (PI / 30.);
  vec3 g = uGridC + vec3(sin(ang), 0., cos(ang)) * j * 60. + vec3(0., .8, 0.);
  float az = (aSeed.z - .5) * mix(2.8, 1.6, uNarrowR);
  float el = asin(mix(.025, .96, pow(aSeed.w, 1.5)));
  vec3 sd = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  // 第七幕镜头升到天上：星挂在以眼睛为心的球上，倒影那遍用翻过来的眼睛，水里的星才对得上（前六幕照旧）
  vec3 sky = mix(uCamPos, eyePos(), uSky) + sd * 2600.;
  float rel = smoothstep(aSeed.x * .4, aSeed.x * .4 + .6, uStarFree);
  vec3 p = mix(g, sky, rel * rel * (3. - 2. * rel));
  vWorld = p;
  float on = smoothstep(j / 10. - .12, j / 10., uStarOn);
  float tw = .75 + .25 * sin(uTime * (1.3 + aSeed.z * 2.) + aSeed.w * 40.);
  float b = mix(.5, 2.2, pow(aSeed.z, 3.)) * tw;
  vec3 rp = p;
  if (uMirror > .5) rp.y = -rp.y;
  vec4 mv = viewMatrix * vec4(rp, 1.);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  float sz = mix(1.6, 2.6, aSeed.z) * mix(1., 1.6, 1. - rel) * clamp(uPxScale / 900., .7, 2.2) * mix(1., .8, uSky);
  gl_PointSize = sz;
  vA = on * b * (1. - uDark) * mix(1., .25 + 1.4 * aSeed.z * aSeed.z, uSky);
}
`;

// 第七幕：门上的石头炸成的星。每颗星跟着它那块石头飞，石头飞到 s = 0.55 那一下炸开，星各自飞去天上自己的位置（多少颗跟着档位走）
export const SKYSTAR_VERT = /* glsl */ `
attribute vec4 aBlk;       // 它是哪块石头炸出来的：列、行、那块石头的两个随机数
attribute vec4 aBlk2;      // 那块石头另外两个随机数、星自己的两个随机数
attribute vec4 aSeed;      // 星在最后那个镜头里的位置（-1..1）、亮度、闪的快慢
uniform vec4 uFin;         // 最后那个镜头：抬头、竖直半视角正切、宽高比、移轴
uniform float uPxScale;
// v3.3：那句话由其中一部分星聚成（「飞上天的那些石头变成星，其中一部分聚成这句话」）
attribute vec4 aMot;       // 英文落点 xy、中文落点 xy（em）
attribute vec3 aMotG;      // x：1 = 这颗星去聚那句话；y、z：英文、中文里那个字什么时候亮
uniform vec3 uMotA;
uniform vec3 uMotR;
uniform vec3 uMotU;
uniform vec3 uMotN;
uniform float uMotF;
uniform float uMotLang;
uniform float uMote;
varying float vA;
varying vec3 vTint;
vec3 sdir(vec3 r) {
  float z = r.x * 2. - 1., a = r.y * TAU, q = sqrt(max(1. - z * z, 0.));
  return vec3(q * cos(a), z, q * sin(a));
}
void main() {
  vec4 rnd = vec4(aBlk.z, aBlk.w, aBlk2.x, aBlk2.y);
  float s = riseS(aBlk.y, rnd.x);
  // 每颗星什么时候从它那块石头上迸出来：石头一边飞一边往外迸火星，飞到 0.6 缩没的时候正好迸完
  float te = .28 + .36 * fract(aBlk2.z * 13.7 + aSeed.w * 7.1);
  vA = 0.;
  gl_PointSize = 0.;
  gl_Position = vec4(0., 0., 2., 1.);
  if (s < te) return;
  vec3 pc = doorCell(aBlk.x, aBlk.y);
  vec3 B = risePath(pc, rnd, te);
  // 最后那个镜头里这颗星在哪（地平线以上铺满，两边、上面多留一点边）
  float hz = uFin.w - tan(uFin.x) / uFin.y;
  vec2 ndc = vec2(mix(-1.12, 1.12, aSeed.x), mix(hz + .015, 1.12, pow(aSeed.y, .85)));
  vec3 v = normalize(vec3(ndc.x * uFin.y * uFin.z, (ndc.y - uFin.w) * uFin.y, -1.));
  float cp = cos(uFin.x), sp = sin(uFin.x);
  vec3 dir = vec3(v.x, cp * v.y - sp * v.z, sp * v.y + cp * v.z);
  vec3 S = eyePos() + dir * 2600.;
  float u = (s - te) / (1. - te);
  float k = u * u * u * (u * (u * 6. - 15.) + 10.);
  vec3 p = mix(B, S, k);
  // 去聚那句话的星：到了天上以后再往那句话的笔画上聚；聚好以后并进那份清楚的字，只留几颗光点慢慢飘
  float gat = 0., merge = 0., mote = 0.;
  if (aMotG.x > .5 && uMotF > 0.) {
    float lsc = sin(PI * uMotLang);
    vec2 tl = mix(aMot.xy, aMot.zw, uMotLang);
    float em = length(uMotR);
    vec3 T = uMotA + uMotR * tl.x + uMotU * tl.y + (sdir(vec3(aSeed.w, aBlk2.z, aSeed.y)) * vec3(1., .6, .3) + uMotN * .3) * em * 2.2 * lsc;
    float g0 = mix(aMotG.y, aMotG.z, uMotLang);
    gat = clamp((uMotF - (g0 - .52) - aBlk2.z * .06) / .5, 0., 1.);
    gat = gat * gat * (3. - 2. * gat);
    vec3 mid = mix(p, T, .5) + uMotN * em * (2. + 3. * aSeed.y) * (1. - gat);
    p = mix(mix(p, mid, gat), mix(mid, T, gat), gat);
    mote = step(fract(aSeed.w * 13.1), uMote);
    merge = smoothstep(g0 + .03, g0 + .17, uMotF) * (1. - lsc);
    p += (uMotR * sin(uTime * (.2 + aSeed.y * .2) + aSeed.z * 9.) + uMotU * cos(uTime * (.16 + aSeed.x * .2) + aSeed.y * 7.)) * em * .1 * mote * merge;
  }
  vec3 rp = p;
  if (uMirror > .5) rp.y = -rp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(rp, 1.);
  float flash = 1. - smoothstep(0., .35, u);
  float tw = .7 + .3 * sin(uTime * (1.1 + aSeed.w * 2.6) + aBlk2.w * 40.);
  // 亮的少、暗的多：大多数是一粒细细的暗星，少数几颗大而亮
  float m = pow(aBlk2.w, 5.);
  float b = mix(.22, 3.2, m) * tw;
  gl_PointSize = mix(1.25, 4.2, m) * clamp(uPxScale / 900., .7, 2.2) * (1. + 1.2 * flash);
  vA = b * (1. + 3. * flash) * smoothstep(0., .03, u);
  vTint = mix(vec3(1., .97, .93), five(fract(aBlk2.z * 7.13 + aBlk2.w * 3.7)), .28 + .4 * flash);
  if (gat > 0.) {
    // 聚的时候亮一点、小一点（像在笔画上排队的光点）
    gl_PointSize = mix(gl_PointSize, clamp(uPxScale / 900., .7, 2.2) * 1.7, gat);
    vA = mix(vA, 1.25, gat) * mix(1. - merge, .55, mote * merge);
    vTint = mix(vTint, vec3(1., .96, .9), gat * .6);
  }
}
`;
export const SKYSTAR_FRAG = /* glsl */ `
varying float vA;
varying vec3 vTint;
void main() {
  if (vA < .002) discard;
  vec2 c = gl_PointCoord - .5;
  float a = exp(-dot(c, c) * 16.) + exp(-length(c) * 9.) * .12;
  vec3 col = vTint * a * vA * .85;
  if (uMirror > .5) { gl_FragColor = vec4(col / (1. + col), 0.); return; }
  gl_FragColor = outGlow(col);
}
`;
export const STAR_FRAG = /* glsl */ `
uniform vec3 uStarCol;
varying float vA;
varying vec3 vWorld;
void main() {
  if (vA < .002 || inAperture(vWorld)) discard;
  vec2 c = gl_PointCoord - .5;
  float a = exp(-dot(c, c) * 16.);
  vec3 col = mix(uStarCol, vec3(1.), .55) * a * vA * .8;
  if (uMirror > .5) { gl_FragColor = vec4(col / (1. + col), 0.); return; }
  gl_FragColor = outGlow(col);
}
`;
export const JOINT_VERT = /* glsl */ `
attribute float aOrd;
uniform mat4 uM;
uniform float uReveal;
uniform float uPx;
varying float vA;
varying vec3 vWorld;
void main() {
  vec4 w = uM * vec4(position, 1.);
  vWorld = w.xyz;
  vec3 rp = w.xyz;
  if (uMirror > .5) rp.y = -rp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(rp, 1.);
  float on = smoothstep(aOrd * .8, aOrd * .8 + .2, uReveal);
  gl_PointSize = uPx * (1. + .25 * sin(uTime * 2.1 + aOrd * 30.));
  vA = on;
}
`;
export const JOINT_FRAG = /* glsl */ `
uniform vec3 uJointCol;
varying float vA;
varying vec3 vWorld;
void main() {
  if (vA < .002 || vWorld.y < 0.) discard;
  vec2 c = gl_PointCoord - .5;
  float r = length(c) * 2.;
  float a = exp(-r * r * 9.) * 2.4 + exp(-r * 3.5) * .5;
  vec3 col = mix(uJointCol, vec3(1.), exp(-r * r * 20.)) * a * vA * (1. - uDark * .7);
  if (uMirror > .5) { gl_FragColor = vec4(col / (1. + col), 0.); return; }
  gl_FragColor = outGlow(col);
}
`;

// 光晕贴片（门缝的光、日冕、炸开的那一下……）：一直对着镜头，四边淡到零
export const GLOW_VERT = /* glsl */ `
attribute float aId;
uniform vec4 uGP[8];       // xyz 位置，w 大小
uniform vec4 uGC[8];       // rgb 颜色 × 亮度，a = 形状（0 圆，1 竖线，2 外圈）
uniform vec2 uGS[8];       // 横竖拉伸
varying vec2 vQ;
varying vec3 vC;
varying float vMode;
varying vec3 vWorld;
void main() {
  int i = int(aId + .5);
  vec4 gp = uGP[i];
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 q = position.xy * 2.;
  vec3 p = gp.xyz;
  if (uMirror > .5) p.y = -p.y;
  vec3 wp = p + (right * q.x * uGS[i].x + up * q.y * uGS[i].y) * gp.w;
  vQ = q;
  vC = uGC[i].rgb;
  vMode = uGC[i].a;
  vWorld = gp.xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
  if (gp.w <= 0.) gl_Position = vec4(0., 0., 2., 1.);
}
`;
export const GLOW_FRAG = /* glsl */ `
varying vec2 vQ;
varying vec3 vC;
varying float vMode;
varying vec3 vWorld;
void main() {
  float win = (1. - smoothstep(.6, 1., abs(vQ.x))) * (1. - smoothstep(.6, 1., abs(vQ.y)));
  float v;
  if (vMode < .5) {
    float r = length(vQ);
    v = exp(-r * r * 9.) * 1.6 + exp(-r * 4.) * .35;
  } else if (vMode < 1.5) {
    float x = abs(vQ.x);
    v = (exp(-x * 60.) * 2.4 + exp(-x * 9.) * .5 + exp(-x * 3.) * .12) * (1. - smoothstep(.75, 1., abs(vQ.y)));
  } else {
    float r = length(vQ);
    v = smoothstep(.36, .5, r) * (exp(-(r - .45) * 5.) * .6);
  }
  vec3 c = vC * v * win * (1. - uDark);
  if (uMirror > .5) { gl_FragColor = vec4(c / (1. + c), 0.); return; }
  gl_FragColor = outGlow(c);
}
`;

// 浮尘：空气里的细灰，被门里的光一照就亮
export const DUST_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uBox;
uniform float uPxScale;
varying float vA;
void main() {
  float t = uTime;
  vec3 p;
  p.x = uCamPos.x + (aSeed.x - .5) * 2. * uBox.x + sin(t * (.05 + aSeed.w * .07) + aSeed.y * 40.) * 1.6;
  p.y = .3 + aSeed.y * uBox.y + sin(t * (.04 + aSeed.x * .05) + aSeed.z * 30.) * .9;
  float dz = mod(aSeed.z * uBox.z - t * (.25 + aSeed.w * .5), uBox.z);
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
  vA = phase * .018 * uLight * fadeNear * fadeFar * mix(.5, 1., aSeed.y) / (big * big) * smoothstep(.15, .7, uDawn) * (1. - uFlood);
}
`;
export const DUST_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - .5;
  float a = exp(-dot(c, c) * 14.);
  gl_FragColor = outGlow(mix(uLightCol, vec3(1.), .5) * vA * a * 3.);
}
`;

// ———— v3.3 星尘字 ————
// 名字（第二到第六幕、天上五个名字）：那一幕造出来的东西身上掉下碎块，聚成它的名字。碎块的颜色、材质跟那样东西一样（片元照用 CHIP_FRAG）。
// 每块碎块记着它在英文、中文两套字形里各落在哪（笔画上的点，em），什么时候那个字亮（g0）。
// uF：聚到哪了（0..1，跟着进度走）；uLang：0 英文 1 中文（换语言时中间往外散一下再聚）。
export const DUST_CHIP = /* glsl */ `
attribute vec3 aTE;        // 英文：落点 xy（em）、那个字什么时候亮
attribute vec3 aTZ;        // 中文
uniform vec3 uAnchor;      // 字的正中（世界）
uniform vec3 uRight;       // 一个 em 往右是多少（世界）
uniform vec3 uUp;
uniform vec3 uNorm;        // 字面朝镜头那一面
uniform float uF;
uniform float uLang;
uniform float uMote;       // 聚好以后留下来慢慢飘的光点占几成
uniform float uChip;       // 出发时一块多大（跟那样东西身上的石头一样大）
uniform float uSrc;        // 从哪来：0 日 1 环 2 鲸 3 器 4 轨道 6 散在字四周的星尘（退路列表）
uniform vec3 uSC;
uniform mat3 uSRot;
uniform vec4 uSP;
uniform mat3 uRA;
uniform mat3 uRB;
uniform mat3 uRC;
vec3 srcPoint(vec4 r) {
  if (uSrc < .5) return uSC + hdir(r.xyz) * uSP.x;
  if (uSrc < 1.5) {
    float th = r.x * TAU;
    float rr = uSP.x + (r.y - .5) * uSP.y;
    return uSC + uSRot * vec3(rr * cos(th), (r.z - .5) * uSP.z, rr * sin(th));
  }
  if (uSrc < 2.5) {
    float u = r.x, a = r.y * TAU;
    float rad = uSP.y * sqrt(smoothstep(0., .16, u)) * mix(1., .1, smoothstep(.36, .9, u));
    return uSC + uSRot * vec3(uSP.x * (.5 - u), rad * sin(a), rad * cos(a));
  }
  if (uSrc < 3.5) {
    float q = r.x * 3., j = floor(q), th = fract(q) * TAU;
    float rr = (66. - j * 7.) * uSP.x;
    mat3 RR = j < .5 ? uRA : (j < 1.5 ? uRB : uRC);
    return uSC + RR * vec3(rr * cos(th), 0., rr * sin(th));
  }
  if (uSrc < 4.5) {
    float th = r.x * uSP.y * TAU;
    return uSC + uSRot * vec3(uSP.x * cos(th), 0., uSP.x * sin(th));
  }
  return uAnchor + (hdir(r.xyz) * vec3(1., .55, .35) + uNorm * (r.w - .3)) * length(uRight) * 7.;
}
void chip(out vec3 P, out mat3 R, out vec3 S, out float heat) {
  vec2 tl = mix(aTE.xy, aTZ.xy, uLang);
  float g0 = mix(aTE.z, aTZ.z, uLang);
  float em = length(uRight);
  float sc = sin(PI * uLang);
  vec3 T = uAnchor + uRight * tl.x + uUp * tl.y;
  // 换语言：散开再聚
  T += (hdir(aSeed.wzy) * vec3(1., .7, .4) + uNorm * .4) * em * 1.8 * sc;
  // 飞：从那样东西身上掉下来（先往外、往下掉一点），再从字的正前方落进笔画里
  float dep = g0 - .44 + aSeed.x * .08;
  float s = clamp((uF - dep) / .46, 0., 1.);
  float e = s * s * (3. - 2. * s);
  vec3 S0 = srcPoint(aSeed);
  vec3 out1 = normalize(S0 - uSC + vec3(1e-3));
  if (uSrc > 5.5) out1 = normalize(S0 - uAnchor + vec3(1e-3));
  vec3 B = S0 + (out1 * .7 + vec3(0., -.35, 0.)) * uChip * (6. + 8. * aSeed.y);
  vec3 C = T + uNorm * em * (1.2 + 2.2 * aSeed.y) + (S0 - T) * .12;
  P = bez(S0, B, C, T, e);
  // 落定以后：并进那份清楚的字（缩没）；少数几颗留下来当光点，绕着落点慢慢飘
  float mote = step(aSeed.w, uMote);
  float merge = smoothstep(g0 + .03, g0 + .17, uF) * (1. - sc);
  float drift = smoothstep(g0, g0 + .25, uF) * mote;
  P += (uRight * sin(uTime * (.21 + aSeed.y * .2) + aSeed.z * 9.) + uUp * cos(uTime * (.17 + aSeed.x * .2) + aSeed.y * 7.)) * em * .09 * drift;
  float sz0 = uChip * mix(.75, 1.25, aSeed.z);
  float szT = em * .05;
  float sz = mix(sz0, szT, smoothstep(.4, 1., s));
  sz *= mix(1. - merge, .42, mote * merge);
  sz *= smoothstep(0., .05, s);
  R = rotAxis(hdir(aSeed.zxy), (1. - e) * (uTime * (.5 + aSeed.x) + aSeed.y * 12.) + aSeed.w * 3.);
  S = vec3(sz, sz * mix(.7, 1.1, aSeed.y), sz * .7);
  heat = mix(.7, 1.9, smoothstep(.5, 1., s)) * mix(1., 1.6, mote * merge);
}
`;

// 那份清楚的细发光字：一个字一块四边形（图集里那一格），从距离场里取笔画和光晕。
// 主画面那遍画在原生分辨率上（画面本身按档位降分辨率画好再放大），所以字是锐的；造物从字前面经过，按画面的深度挡住字。
// 水里的倒影那遍（uMirror = 1）只出光，不出暗。
export const TEXT_VERT = /* glsl */ `
attribute vec4 aBox;       // 这一格在字里的位置（em）：左、下、宽、高
attribute vec4 aUV;        // 图集里的位置：左、下、右、上
attribute vec2 aG;         // 这个字什么时候亮；1 = 底下垫的那一小团暗
uniform vec3 uAnchor;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uF;
uniform float uReveal;     // 1 = 不聚，直接整个亮（wordmark、减少动效）
varying vec2 vUV;
varying float vRev;
varying float vKind;
varying vec2 vQ;
varying float vViewZ;
void main() {
  vec2 q = aBox.xy + position.xy * aBox.zw;
  vec3 wp = uAnchor + uRight * q.x + uUp * q.y;
  vUV = vec2(mix(aUV.x, aUV.z, position.x), mix(aUV.y, aUV.w, position.y));
  vRev = max(uReveal, smoothstep(aG.x, aG.x + .16, uF));
  vKind = aG.y;
  vQ = position.xy * 2. - 1.;
  vec3 rp = wp;
  if (uMirror > .5) rp.y = -rp.y;
  vec4 mv = viewMatrix * vec4(rp, 1.);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
export const TEXT_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uAtlasSize;
uniform float uSpread;
uniform float uInMax;
uniform vec3 uCore;        // 笔画的颜色（显示空间）
uniform float uCoreA;      // 笔画盖住底下多少（wordmark 没被照亮的时候是暗的那一块）
uniform vec3 uGlow;        // 光晕的颜色
uniform float uAlpha;
uniform float uShadow;     // 字底下垫多少暗（星云很亮的地方也读得清）
uniform float uBold;       // 小字加一点粗（像素）：笔画别细过一个像素
uniform sampler2D uDepth;  // 画面的深度：造物在字前面就挡住字
uniform vec2 uCanvas;
uniform vec2 uNF;
uniform float uUseDepth;
varying vec2 vUV;
varying float vRev;
varying float vKind;
varying vec2 vQ;
varying float vViewZ;
void main() {
  float occ = 1.;
  if (uUseDepth > .5 && uMirror < .5) {
    float d = texture2D(uDepth, gl_FragCoord.xy / uCanvas).x;
    float z = d * 2. - 1.;
    float sz = 2. * uNF.x * uNF.y / (uNF.y + uNF.x - z * (uNF.y - uNF.x));
    occ = smoothstep(-4., 3., sz - vViewZ);
  }
  if (vKind > .5) {
    if (uMirror > .5) discard;
    // 圆角的一小团暗：中间最浓，往外慢慢没（不是一块方的）
    vec2 e = max(abs(vQ) - vec2(.35, 0.), 0.) / vec2(.65, 1.);
    float r = length(e);
    float a = pow(1. - smoothstep(0., 1., r), 1.6) * uShadow * uAlpha * occ * vRev;
    gl_FragColor = vec4(0., 0., 0., a);
    return;
  }
  float v = texture2D(uAtlas, vUV).r;
  float dTex = uSpread - v * (uSpread + uInMax);
  vec2 tpp = fwidth(vUV * uAtlasSize);
  float tp = max(.5 * (tpp.x + tpp.y), 1e-4);
  float dPx = dTex / tp;
  float core = clamp(.5 - dPx + uBold, 0., 1.);
  float halo = exp(-max(dTex, 0.) / (uSpread * .3)) * (1. - smoothstep(uSpread * .62, uSpread * .98, dTex));
  float sh = exp(-max(dTex, 0.) / (uSpread * .45)) * (1. - smoothstep(uSpread * .7, uSpread * .98, dTex));
  float a = uAlpha * vRev * occ;
  if (uMirror > .5) {
    vec3 c = (uCore * core * .7 + uGlow * halo * .5) * a * 1.4;
    gl_FragColor = vec4(c / (1. + c), 0.);
    return;
  }
  vec3 rgb = (uCore * core + uGlow * halo * .5) * a;
  float alpha = (core * uCoreA + sh * uShadow * .45) * a;
  gl_FragColor = vec4(rgb, clamp(alpha, 0., 1.));
}
`;

// 画面（按档位的分辨率画在一张图上）放大铺满画布
export const BLIT_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }
`;
export const BLIT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tColor, vUv); }
`;
