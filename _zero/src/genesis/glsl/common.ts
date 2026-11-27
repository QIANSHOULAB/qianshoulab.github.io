// 所有着色器共用的一段：随机数、胶片曲线、出色的算法（越亮越白、芯子发白、外圈带色）、抖动、倒影那一遍怎么出数。
// 底子是黑；颜色只在光里，一幕一种当家。每个着色器最后都过同一条胶片曲线、转 sRGB、加一点抖动（防色带）。

export const COMMON = /* glsl */ `
precision highp float;
#define PI 3.14159265
#define TAU 6.28318531

uniform float uTime;      // 世界的钟（秒）：第五幕顿帧那一拍它停
uniform float uP;         // 进度 0..7
uniform float uExposure;
uniform vec3 uCamPos;
uniform float uMirror;    // 1 = 正常画；-1 = 倒影那一遍（沿水面翻过来再画）
uniform float uLight;     // 门后那盏光的总强度（0 全黑 → 1）
uniform vec3 uActCol;     // 这一幕当家的颜色（线性，最大的通道 = 1）
uniform vec4 uGate;       // 半宽、高、正面 z、厚
uniform float uPixAng;    // 一个像素对应多少弧度
uniform float uPortrait;  // 竖屏 1，横屏 0（竖屏单独排一套）
uniform float uWhite;     // 第七幕：门全开，白光漫天
uniform float uSil;       // 第七幕：日、环、鲸、器、轨道全成了白光里的黑剪影（白光收暗以后也不再亮回来）

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 hash31(float p) { vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float vnoise(float x) { float i = floor(x), f = fract(x); float u = f * f * (3. - 2. * f); return mix(hash11(i), hash11(i + 1.), u); }
float sat(float x) { return clamp(x, 0., 1.); }
float sstep(float a, float b, float x) { float t = sat((x - a) / (b - a)); return t * t * (3. - 2. * t); }
float seg(float x, float a, float b) { return sat((x - a) / (b - a)); }

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
mat3 rotAxis(vec3 ax, float a) {
  float c = cos(a), s = sin(a), t = 1. - c;
  return mat3(t * ax.x * ax.x + c, t * ax.x * ax.y + s * ax.z, t * ax.x * ax.z - s * ax.y,
              t * ax.x * ax.y - s * ax.z, t * ax.y * ax.y + c, t * ax.y * ax.z + s * ax.x,
              t * ax.x * ax.z + s * ax.y, t * ax.y * ax.z - s * ax.x, t * ax.z * ax.z + c);
}
// 让一块石头的 z 轴对准某个方向（用来让块顺着运动方向、顺着球面摆）
mat3 lookDir(vec3 f) {
  vec3 up = abs(f.y) > .95 ? vec3(1., 0., 0.) : vec3(0., 1., 0.);
  vec3 r = normalize(cross(up, f));
  vec3 u = cross(f, r);
  return mat3(r, u, f);
}

float rectSD(vec2 p, vec2 bmin, vec2 bmax) {
  vec2 c = (bmin + bmax) * .5, h = (bmax - bmin) * .5;
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}

// 出色：亮度 L 乘以「这一幕的颜色和白的混合」，越亮越白——芯子发白，只有外圈带色（不像霓虹灯牌）
vec3 glowCol(float L, vec3 c) {
  float w = L / (L + 2.6);
  return L * mix(c, vec3(1.), w * w * .92);
}

vec3 tonemap3(vec3 x) {
  x = max(x, 0.) * uExposure;
  return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.);
}
vec3 toSRGB3(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
`;

// 只有片元着色器用得着：按像素抖动；倒影那一遍不过胶片曲线，开方存进 8 位贴图（暗部还留得住层次），水面再平方解回来
export const FRAG = /* glsl */ `
vec3 dither3() {
  vec2 p = gl_FragCoord.xy;
  return (vec3(hash12(p), hash12(p + 17.17), hash12(p + 41.3)) + vec3(hash12(p + 5.9), hash12(p + 29.1), hash12(p + 63.7)) - 1.) / 255.;
}
vec4 outColor(vec3 lin) {
  if (uMirror < 0.) return vec4(sqrt(clamp(lin / 16., 0., 1.)), 1.);
  return vec4(toSRGB3(tonemap3(lin)) + dither3(), 1.);
}
// 加法混合的光（光晕、火舌、星、轨道线）：混合方式只加颜色、不动 alpha（alpha 在倒影贴图里记「这里有实心的东西」）
vec4 outAdd(vec3 lin) {
  if (uMirror < 0.) return vec4(sqrt(clamp(lin / 16., 0., 1.)), 1.);
  return vec4(toSRGB3(tonemap3(lin)), 1.);
}
`;
