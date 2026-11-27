// Ⅳ 赋生 · 03 标本（冷青）：一头比门还高的巨鲸（座头鲸那种长胸鳍），黑石砌成，和门是同一种石头。
// 从门缝里游出来：先是头，然后是背、鳍、尾（门背后那一截还在光里，看不见）。绕门一周：经过门前挡住门缝的光，只剩一个巨大的剪影；
// 绕到门后被门挡住，再从另一边出来。游完一周升到天上停住，关节一处处亮成星点，星点之间拉出细线：它成了一个星座。
// 身子的姿态（沿着游的路线摆、上下慢慢摆尾）只在这一段里算，石块、星点、星座的线都用它。

export const WHALE_FN = /* glsl */ `
uniform float uHead;      // 鲸头沿着路线走到哪了（世界单位）
uniform float uWL;        // 体长
uniform float uWH;        // 游的高度
uniform float uSwimT;     // 摆尾的钟
uniform float uSwimA;     // 摆尾幅度（钉成星座以后是 0）
uniform float uNarrow;    // 竖屏：绕门那一圈收窄
uniform vec3 uB1;         // 升天那段（三次贝塞尔）的两个控制点和终点
uniform vec3 uB2;
uniform vec3 uK;
uniform float uLb;
uniform vec3 uPivot;      // 第六幕被轨道接住、第七幕站进全家福：整个星座绕这一点平移、转、缩
uniform vec3 uMoveT;
uniform float uMoveYaw;
uniform float uMoveS;
#define WL1 133.
#define WL2 439.823
#define WL3 13.
#define WL4 1319.469
uniform float uRoll;      // 钉成星座时身子往人这边侧一点（看得见背和尾鳍）

vec3 bez(vec3 a, vec3 b, vec3 c, vec3 d, float t) { float s = 1. - t; return s * s * s * a + 3. * s * s * t * b + 3. * s * t * t * c + t * t * t * d; }
vec3 bezD(vec3 a, vec3 b, vec3 c, vec3 d, float t) { float s = 1. - t; return 3. * s * s * (b - a) + 6. * s * t * (c - b) + 3. * t * t * (d - c); }

// 路线：从门缝里往外游（一出门缝就往左拐）→ 掉头 → 绕门一整圈（左 → 门后 → 右 → 门前）→ 升到天上
vec3 pathRaw(float a, out vec3 T) {
  float zg = uGate.z - uGate.w * .5;
  float h = uWH;
  if (a < WL1) { T = vec3(0., 0., 1.); return vec3(0., h, zg - 120. + a); }
  a -= WL1;
  if (a < WL2) { float ps = a / 140.; T = vec3(-sin(ps), 0., cos(ps)); return vec3(-140. + 140. * cos(ps), h, zg + 13. + 140. * sin(ps)); }
  a -= WL2;
  if (a < WL3) { T = vec3(0., 0., -1.); return vec3(-280., h, zg + 13. - a); }
  a -= WL3;
  if (a < WL4) { float ph = PI + a / 280.; T = vec3(-sin(ph), 0., cos(ph)); return vec3(280. * cos(ph), h, zg + 280. * sin(ph)); }
  a -= WL4;
  vec3 F = vec3(0., h, zg + 280.);
  float t = clamp(a / uLb, 0., 1.);
  T = normalize(bezD(F, uB1, uB2, uK, t));
  vec3 p = bez(F, uB1, uB2, uK, t);
  if (a > uLb) p += T * (a - uLb);
  return p;
}

vec3 moved(vec3 p) {
  vec3 q = p - uPivot;
  q = rotY(uMoveYaw) * q * uMoveS;
  return uPivot + uMoveT + q;
}

// 身子上第 s 截（0 头 … 1 尾）的位置和朝向
void bodyFrame(float s, out vec3 pos, out vec3 F, out vec3 U, out vec3 Sd) {
  vec3 T;
  pos = pathRaw(uHead - s * uWL, T);
  pos.x *= uNarrow;
  T = normalize(T * vec3(uNarrow, 1., 1.));
  F = T;
  U = normalize(vec3(0., 1., 0.) - F * F.y);
  Sd = normalize(cross(F, U));
  U = normalize(cos(uRoll) * U + sin(uRoll) * Sd);
  Sd = normalize(cross(F, U));
  // 上下慢慢摆尾：一道波从头传到尾，越往后摆得越大
  pos += U * uSwimA * s * s * sin(TAU * (s * .85 - uSwimT * .2));
}

float bodyF(float s) {
  if (s < .03) return .45 * sqrt(max(s, 0.) / .03);
  if (s < .28) return mix(.45, 1., smoothstep(.03, .28, s));
  if (s < .6) return mix(1., .74, smoothstep(.28, .6, s));
  if (s < .9) return mix(.74, .12, smoothstep(.6, .9, s));
  return mix(.12, .07, smoothstep(.9, 1., s));
}

// 鲸身上一点。part：0 身子（a = s，b = 绕一圈的角度，c = 往里缩）、1/2 左右胸鳍（a 沿鳍，b 横跨）、3/4 左右尾鳍、5 背鳍
// 出来：位置、这块该朝哪（法线）
vec3 whalePoint(float part, float a, float b, float c, float t, out vec3 nrm) {
  float Rm = .105 * uWL;
  vec3 pos, F, U, Sd;
  if (part < .5) {
    bodyFrame(a, pos, F, U, Sd);
    float r = Rm * bodyF(a) * (1. - .35 * c);
    float cb = cos(b), sb = sin(b);
    float belly = cb < 0. ? .86 : .97;             // 肚子平一点
    nrm = normalize(U * cb + Sd * sb);
    return pos + U * cb * r * belly + Sd * sb * r;
  }
  if (part < 2.5) {
    float side = part < 1.5 ? -1. : 1.;
    bodyFrame(.26, pos, F, U, Sd);
    float r = Rm * bodyF(.26);
    float th = side * 2.15;
    vec3 root = pos + U * cos(th) * r * .9 + Sd * sin(th) * r;
    float flap = sin(t * .9 + side) * .12;
    vec3 D = normalize(-F * .62 + Sd * side * .72 - U * (.36 + flap));
    vec3 A = normalize(F - D * dot(F, D));
    float Lf = .31 * uWL;
    float chord = 13. * pow(max(1. - a, 0.), .55) * smoothstep(0., .08, a + .02);
    nrm = normalize(cross(D, A)) * side;
    return root + D * a * Lf + A * b * chord * .5 - U * a * a * 9.;
  }
  if (part < 4.5) {
    float side = part < 3.5 ? -1. : 1.;
    bodyFrame(1., pos, F, U, Sd);
    float chord = 18. * sqrt(max(1. - a, 0.)) + 2.;
    nrm = U;
    return pos + Sd * side * a * 52. - F * (a * a * 20. + 3.) + F * b * chord * .5;
  }
  bodyFrame(a, pos, F, U, Sd);
  float r = Rm * bodyF(a);
  nrm = Sd;
  return pos + U * (r + b * 8. * (1. - abs(a - .64) / .05));
}
`;

export const WHALE_PLACE = /* glsl */ `
attribute vec4 aW;        // part、a、b、c
attribute vec4 aSeed;
uniform float uBright;
uniform vec3 uLifeCol;
uniform float uGhost;     // 钉成星座以后石头身子退成影子
uniform float uSize;
uniform float uFront;     // 门正面的世界 z：还在门背后（光里）的那一截看不见

bool place(inout vec3 c, inout vec3 s, inout mat3 R, inout vec4 m, inout vec3 tint, inout vec2 ex) {
  float part = aW.x;
  float sAlong = part < .5 ? aW.y : (part < 2.5 ? .26 : (part < 4.5 ? 1. : aW.y));
  // 还没游出门缝：这一截在门背后的光里
  float arc = uHead - sAlong * uWL;
  if (arc < 133.5) return false;
  vec3 nrm;
  c = whalePoint(part, aW.y, aW.z, aW.w, uSwimT, nrm);
  c = moved(c);
  nrm = rotY(uMoveYaw) * nrm;
  R = lookDir(nrm) * rotZ(aSeed.w * 6.28);
  float sz = uSize * mix(.62, 1.22, aSeed.x * aSeed.x) * (part > .5 ? .8 : 1.) * uMoveS;
  // 刚出门缝那一下：块从光里长出来
  float grow = sat((arc - 133.5) / 30.);
  s = vec3(sz * mix(.85, 1.25, aSeed.y), sz * mix(.8, 1.1, aSeed.z), sz) * grow;
  ex = vec2(-1., aSeed.z);
  tint = uLifeCol;
  float fresh = 1. - sat((arc - 133.5) / 90.);
  m = vec4((.2 + 1.2 * fresh) * (1. - .8 * uGhost), .002 + .25 * fresh, 1.5 * (1. - .6 * uGhost), uBright * (1. - .5 * uGhost));
  vBev = .5;
  return true;
}
`;

/** 星座的星：关节一处处亮成星点 */
export const WHALE_STARS = /* glsl */ `
attribute vec4 aJ;        // part、a、b、c
attribute float aIdx;     // 第几颗（0..1，按这个先后亮）
uniform float uStar;      // 星点亮到哪了（0..1）
uniform float uBright;
uniform vec3 uLifeCol;
bool placePt(inout vec3 p, inout float size, inout vec3 col, inout float soft) {
  float on = sat((uStar - aIdx) * 14.);
  if (on <= 0.) return false;
  vec3 nrm;
  p = moved(whalePoint(aJ.x, aJ.y, aJ.z, aJ.w, uSwimT, nrm));
  float pop = 1. + 1.6 * (1. - on) * on * 4.;
  size = 10. * pop * uMoveS;
  col = glowCol(3.2 * on * uBright, mix(uLifeCol, vec3(1.), .5));
  soft = 1.;
  return true;
}
`;

/** 星座的线：星点之间拉出细线（每段两头是第几颗星：uJ 里查它长在鲸身上哪儿） */
export const WHALE_LINE = /* glsl */ `
uniform vec4 uJ[16];
uniform float uLines;     // 线拉到哪了（0..1）
void placeLine(inout vec3 a, inout vec3 b, inout float sa, inout float sb) {
  int i = int(a.x + .5), j = int(b.x + .5);
  float order = sa;
  vec4 A = uJ[i], B = uJ[j];
  vec3 n1, n2;
  vec3 pa = moved(whalePoint(A.x, A.y, A.z, A.w, uSwimT, n1));
  vec3 pb = moved(whalePoint(B.x, B.y, B.z, B.w, uSwimT, n2));
  float k = sat((uLines - order * .6) / .4);
  a = pa;
  b = mix(pa, pb, max(k, 1e-3));
  sa = 0.; sb = k;
}
`;

export const WHALE_LINE_COL = /* glsl */ `
uniform float uLines;
uniform float uBright;
uniform vec3 uLifeCol;
vec3 lineColor(float along, vec3 wp) {
  return glowCol(.8 * uBright * sat(uLines * 3.), mix(uLifeCol, vec3(1.), .4));
}
`;
