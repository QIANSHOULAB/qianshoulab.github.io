// 天 + 水：一个盖满屏的三角形，每个像素自己算。沿用 v2 的天水着色器和移轴镜头，改成带色。
// 天：底子几乎是黑；门后那盏光只从门缝、门上的窗、门的轮廓漏出来（看得见光，看不见光源）。
// 水：黑镜子。倒影（门和造物翻过来画的那张贴图，按行错位）、天的反光、六盏灯的光路、第五幕的冲击波、第六幕的格网。

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
uniform sampler2D uRefl;
uniform float uReflOn;
uniform vec2 uRes;
uniform vec2 uLens;          // tan 半角、宽高比（倒影按行错位时，把角度换成屏幕上的距离）
uniform float uRipple;
uniform float uHalo;         // 门周围那团光
uniform float uCorona;       // 贴着门轮廓的一圈亮边
uniform float uReach;        // 地平线从门脚往两边划开了多少（0..1）
uniform float uPath;         // 水上那条光路
uniform float uWhite;        // 第七幕：白光漫天
uniform vec4 uLightPos[6];   // 水面高光最多六盏灯：xyz 位置，w 强度
uniform vec3 uLightCol[6];
uniform vec4 uWinRect[5];    // 门上五个窗（门正面上的矩形）
uniform vec3 uWinCol[5];
uniform float uWinOn[5];
uniform float uGrid;         // 第六幕：水上浮出的光格网
uniform vec3 uGridCol;
uniform vec4 uShock;         // 第五幕冲击波：中心 x、中心 z、半径、强度
uniform float uSrcBack;
uniform vec4 uOrb[4];        // 造物自带的那团光（太阳、小月、浑天仪……）：xyz 位置，w 半径
uniform vec3 uOrbCol[4];
uniform float uOrbI[4];
varying vec2 vNdc;

// 造物身边那团光（天上和水里都看得见）
vec3 orbs(vec3 ro, vec3 rd) {
  vec3 c = vec3(0.);
  for (int i = 0; i < 4; i++) {
    if (uOrbI[i] <= 0.) continue;
    vec3 v = uOrb[i].xyz - ro;
    float t = dot(v, rd);
    if (t < 0.) continue;
    float d = length(v - rd * t);
    float r = uOrb[i].w;
    float g = .5 * exp(-d / (r * .55)) + .26 * exp(-d / (r * 1.5)) + .035 * exp(-d / (r * 4.));
    c += glowCol(g * uOrbI[i], uOrbCol[i]);
  }
  return c;
}

// 方向决定的天：头顶几乎全黑，地平线那一圈略亮，正前方（门那边）再亮一点
vec3 skyBase(vec3 rd) {
  float el = rd.y;
  float az = atan(rd.x, -rd.z);
  float front = exp(-az * az * 2.4);
  float zen = .00012 + .0004 * uLight;
  float hor = .0004 + uLight * (.0014 + .006 * front);
  float band = exp(-max(el, 0.) * 9.);
  float low = exp(-max(el, 0.) * 55.);
  float v = mix(zen, hor, band) + hor * .55 * low;
  vec3 c = glowCol(v * 1.0, mix(vec3(1.), uActCol, .55 * front));
  // 第七幕：门全开，白光漫上来
  c += uWhite * (vec3(.9, .9, .92) * (.35 + 1.6 * exp(-max(el, 0.) * 3.) * (.4 + .6 * front)));
  return c;
}

// 门那一面上的光：门周围那团光、贴着轮廓一圈亮边；门后面（矩形里）是光源本身，只有门开了缝、开了窗才看得见
vec3 gateLight(vec3 ro, vec3 rd, out float inside) {
  inside = 0.;
  if (rd.z > -1e-4) return vec3(0.);
  float t = (uGate.z - ro.z) / rd.z;
  if (t < 0.) return vec3(0.);
  vec2 q = ro.xy + rd.xy * t;
  float hw = uGate.x, H = uGate.y;
  float d0 = rectSD(q, vec2(-hw, 0.), vec2(hw, H));
  float d = max(d0, 0.);
  // 光从门缝往外漏：围着那条竖缝的一团（越近越亮），外加一层很大很淡的
  float ds = length(vec2(q.x * .8, q.y - clamp(q.y, 0., H)));
  float halo = (.5 * exp(-ds / 10.) + .26 * exp(-ds / 36.) + .035 * exp(-ds / 120.) + .006 * exp(-ds / 360.)) * uHalo;
  // 贴着门轮廓的一圈亮边（光从门四周漏出来）
  float near = exp(-abs(q.y - .5 * H) / 160.);
  float cor = (1.9 * exp(-d / 1.) + .55 * exp(-d / 4.5) + .12 * exp(-d / 20.)) * (.25 + .75 * near) * uCorona;
  // 从轮廓散出去的极淡的光芒
  vec2 rp = vec2(abs(q.x), q.y - .5 * H);
  float ang = atan(rp.y, rp.x);
  float n = vnoise(ang * 11. + 3.1) * .55 + vnoise(ang * 37. + 11.7 + uTime * .01) * .45;
  float rays = pow(n, 6.) * exp(-length(rp) / 200.) * exp(-d / 90.) * smoothstep(0., 18., d) * .045 * uCorona;
  vec3 outside = glowCol((halo + cor + rays) * uLight, uActCol);
  if (d0 < 0.) {
    // 门后：光源本身。打到门背后那一面，正中最亮；窗那里是窗自己的颜色
    inside = 1.;
    float zS = uGate.z - uGate.w - uSrcBack;
    float t2 = (zS - ro.z) / rd.z;
    vec2 s = ro.xy + rd.xy * t2;
    float core = 34. * exp(-abs(s.x) / 46.) * (.55 + .45 * exp(-abs(s.y - .45 * H) / 130.)) + 5.;
    // 窗：窗洞那块是窗自己的颜色，亮度看窗开了多少（彩窗那种：颜色饱满、不刺眼）；门缝正中永远最亮
    float wmask = 0., wl = 0.;
    vec3 wc = uActCol;
    for (int k = 0; k < 5; k++) {
      if (uWinOn[k] <= 0.) continue;
      float mk = 1. - smoothstep(-2., 14., rectSD(s, uWinRect[k].xy, uWinRect[k].zw));
      if (mk > wmask) { wmask = mk; wc = uWinCol[k]; wl = 1.1 * uWinOn[k]; }
    }
    vec3 c = mix(uActCol, wc, wmask);
    float L = mix(core, wl, wmask);
    vec3 src = glowCol(L * uLight, c) + uWhite * vec3(6.);
    // 贴着轮廓那一两个像素别给它（多重采样时会从边上漏出一条亮线）
    return mix(outside, src, smoothstep(.5, 1.8, -d0));
  }
  return outside;
}

vec3 sky(vec3 ro, vec3 rd, out float inside) { return skyBase(rd) + gateLight(ro, rd, inside) + orbs(ro, rd); }

// 水波：几道很慢的细浪，越远越平（像素盖不住的浪直接抹掉，不闪）；第五幕的冲击波在水面推一圈浪
vec3 waterNormal(vec2 p, float fpx, float fpz, float dist) {
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
  // 冲击波：贴着水面往外推的一圈浪，后面拖着几圈涟漪
  if (uShock.w > 0.) {
    vec2 c = vec2(uShock.x, uShock.y);
    vec2 dv = p - c;
    float r = length(dv);
    vec2 dir = dv / max(r, 1e-3);
    float x = r - uShock.z;
    float w = 6. + uShock.z * .05;
    float ring = exp(-x * x / (w * w)) * .05 + (x < 0. ? exp(x / (w * 5.)) * .018 * sin(x * .22 - t * 2.) : 0.);
    float fp = max(fpx, fpz);
    g += dir * ring * uShock.w * (1. - smoothstep(4., 30., fp));
  }
  return normalize(vec3(-g.x, 1., -g.y));
}

float gridLine(float v, float period, float fw) {
  float x = abs(fract(v / period + .5) - .5) * period;
  return 1. - smoothstep(0., max(fw, 1e-4) * 1.3, x);
}

void main() {
  vec4 v = uInvProj * vec4(vNdc, 1., 1.);
  vec3 rd = normalize(mat3(uCamWorld) * normalize(v.xyz / v.w));
  vec3 ro = uCamPos;
  float az = atan(rd.x, -rd.z);
  float elPx = rd.y / uPixAng;

  vec3 skyC = vec3(0.);
  if (elPx > -1.5) { float ins; skyC = sky(ro, rd, ins); }

  vec3 waterC = vec3(0.);
  if (elPx < 1.5) {
    float down = max(-rd.y, 1e-5);
    float t = ro.y / down;
    vec3 P = ro + rd * t;
    float fpx = t * uPixAng, fpz = t * uPixAng / down;
    vec3 N = waterNormal(P.xz, fpx, fpz, t);
    vec3 V = -rd;
    vec3 R = reflect(rd, N);
    R.y = max(R.y, .0015);
    R = normalize(R);
    float cosT = max(dot(N, V), 0.);
    float F = .02 + .98 * pow(1. - cosT, 5.);
    float ins;
    vec3 refl = sky(P, R, ins);
    if (ins > .5) refl = min(refl, vec3(2.4 * uLight + 6. * uWhite));
    // 倒影：门和造物翻过来画在一张贴图上；浪让每一行左右错开一点
    if (uReflOn > .5) {
      vec3 R0 = vec3(rd.x, -rd.y, rd.z);
      vec3 dR = R - R0;
      float zf = max(-R0.z, .2);
      vec2 off = vec2(dR.x / zf / (2. * uLens.x * uLens.y), -dR.y / zf / (2. * uLens.x)) * 1.15;
      off = clamp(off * .55, vec2(-.03), vec2(.03));
      vec4 o = texture2D(uRefl, gl_FragCoord.xy / uRes + off);
      vec3 objLin = o.rgb * o.rgb * 16.;
      refl = refl * (1. - o.a) + objLin;
    }
    // 黑水：镜子，但是暗
    waterC = refl * F * .5;
    // 光路：每盏灯在水上铺一条，细浪一闪一闪
    float far = 1. - smoothstep(.0009, .004, down);
    float shin = mix(1500., 240., far);
    for (int i = 0; i < 6; i++) {
      vec4 Lp = uLightPos[i];
      if (Lp.w <= 0.) continue;
      vec3 L = normalize(Lp.xyz - P);
      vec3 Hh = normalize(L + V);
      float spec = pow(max(dot(N, Hh), 0.), shin) * (shin + 8.) / 25.;
      float s = spec * F * Lp.w * smoothstep(.0005, .004, down);
      waterC += glowCol(s * .5, uLightCol[i]);
    }
    // 远处细浪抹平以后，门那条光路变成一条柔和的亮带
    float soft = exp(-abs(az) / (.005 + .3 * down)) * smoothstep(.0002, .006, down) * (1. - smoothstep(.01, .085, down)) * .3 * uLight * uPath;
    waterC += glowCol(soft * F, uActCol);
    // 第六幕：水面浮出一张光的格网，格线全部收向门脚
    if (uGrid > 0.) {
      vec2 c = P.xz - vec2(0., uGate.z);
      float r = length(c);
      float th = atan(c.x, -c.y);
      float fr = fwidth(r), fth = fwidth(th);
      float rad = gridLine(th, PI / 36., fth) * (1. - smoothstep(.02, .06, fth));
      float cir = gridLine(r, 60., fr) * (1. - smoothstep(15., 40., fr));
      float fadeR = exp(-r / 2600.);
      float gl = max(rad * .85, cir) * fadeR;
      // 从门脚往外一圈一圈铺出去
      float spread = smoothstep(uGrid * 1400. + 40., uGrid * 1400. - 160., r);
      waterC += glowCol(gl * spread * .9 * sat(uGrid * 3.), uGridCol);
    }
    // 第五幕：冲击波贴着水面扫过来，浪尖上一道亮边
    if (uShock.w > 0.) {
      float r = length(P.xz - uShock.xy);
      float x = r - uShock.z;
      float w = 2.5 + uShock.z * .03;
      float ring = exp(-x * x / (w * w));
      waterC += glowCol(ring * uShock.w * 2.2 * (1. - smoothstep(0., 1., -x / 400.)), vec3(1., .3, .12));
    }
  }
  float w = smoothstep(-.9, .9, elPx);
  vec3 col = mix(waterC, skyC, w);

  // 地平线：门脚那里最亮，从门脚往左右两边划开（第一幕天和水是这时候才分开的）
  float reach = uReach * 1.7;
  float mask = 1. - smoothstep(reach * .72, reach + 1e-3, abs(az));
  float line = exp(-abs(elPx + .35) / .7) * (.14 + 1.5 * exp(-az * az * 40.) + .3 * exp(-az * az * 2.)) * uLight * mask;
  float mist = exp(-abs(rd.y) * 70.) * (.025 + .28 * exp(-az * az * 9.)) * uLight * mask;
  col += glowCol(line + mist, uActCol);
  // 镜头暗角：四角压暗，光只在正中
  float vg = 1. - .45 * pow(length(vNdc * vec2(.8, 1.)) * .72, 2.2);
  col *= max(vg, 0.);
  gl_FragColor = outColor(col);
}
`;
