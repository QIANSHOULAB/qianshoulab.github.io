// 石块：门和所有造物都是同一种黑石，一块一块实例化画。每样东西的块在哪、多大、怎么转、亮不亮，由它自己的 place() 按
// （实例种子、幕内进度、时钟）现算；片元着色器大家共用：倒角、石缝透光、发热、背光勾边、这一幕的那盏灯。

/** 顶点着色器开头：每样造物在这后面写自己的 attribute、uniform 和 place() */
export const STONE_VERT_HEAD = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNL;
varying vec3 vScale;
varying vec3 vWorld;
varying vec3 vR0;
varying vec3 vR1;
varying vec3 vR2;
varying vec4 vMat;      // x 石缝透光，y 发热（整块发光），z 背光勾边，w 这样东西现在多亮（退到半暗）
varying vec3 vTint;     // 这块石头里透出来的是什么颜色的光
varying vec2 vExtra;    // x 门的石头：外沿标记（0..7：1 左 2 右 4 顶），8 = 离开了的那撮；造物 = -1。y 随机数
varying float vBev;     // 发热的块，倒角那圈暗多少（显出一块一块）

`;

export const STONE_VERT_MAIN = /* glsl */ `
void main() {
  vec3 c = vec3(0.), s = vec3(0.);
  mat3 R = mat3(1.);
  vec4 m = vec4(0., 0., 0., 1.);
  vec3 tint = vec3(1.);
  vec2 ex = vec2(-1., .5);
  vBev = .65;
  bool vis = place(c, s, R, m, tint, ex);
  vec3 wp = c + R * (position * s);
  vLocal = position;
  vNL = normal;
  vScale = s;
  vWorld = wp;
  vR0 = R[0]; vR1 = R[1]; vR2 = R[2];
  vMat = m;
  vTint = tint;
  vExtra = ex;
  vec3 pp = wp;
  pp.y *= uMirror;
  gl_Position = (vis && s.x > 1e-3) ? projectionMatrix * viewMatrix * vec4(pp, 1.) : vec4(2., 2., 2., 1.);
}
`;

export const STONE_FRAG = /* glsl */ `
uniform vec4 uKey;        // 这一幕那样造物自带的那盏灯：xyz 位置，w 强度（照亮门、照亮旁边的石头）
uniform vec3 uKeyCol;
uniform vec3 uBack;       // 门后主光的位置（造物在门前时，它从背后勾出一圈亮边）
uniform vec4 uWinRect[5];
uniform vec3 uWinCol[5];
uniform float uWinOn[5];
uniform float uHalo;
varying vec3 vLocal;
varying vec3 vNL;
varying vec3 vScale;
varying vec3 vWorld;
varying vec3 vR0;
varying vec3 vR1;
varying vec3 vR2;
varying vec4 vMat;
varying vec3 vTint;
varying vec2 vExtra;
varying float vBev;

float gateOrSil() { return (vExtra.x > -.5 && vExtra.x < 7.5) ? 0. : uSil; }
// 门缝透出来的光有多亮（门那一面上，离竖缝越近越亮）
float slitLight(vec2 q) {
  float ds = length(vec2(q.x * .8, q.y - clamp(q.y, 0., uGate.y)));
  return (.55 * exp(-ds / 14.) + .5 * exp(-ds / 55.) + .16 * exp(-ds / 170.)) * uHalo;
}

void main() {
  vec3 an = abs(vNL);
  vec2 uv, hs;
  vec3 a1, a2;
  if (an.z > .5) { uv = vLocal.xy * vScale.xy; hs = vScale.xy * .5; a1 = vec3(1., 0., 0.); a2 = vec3(0., 1., 0.); }
  else if (an.x > .5) { uv = vLocal.zy * vScale.zy; hs = vScale.zy * .5; a1 = vec3(0., 0., 1.); a2 = vec3(0., 1., 0.); }
  else { uv = vLocal.xz * vScale.xz; hs = vScale.xz * .5; a1 = vec3(1., 0., 0.); a2 = vec3(0., 0., 1.); }
  vec2 de = hs - abs(uv);
  float dEdge = min(de.x, de.y);
  float pw = max(length(fwidth(vWorld)) * .7, 1e-4);
  float rnd = vExtra.y;

  // 倒角：块和块宽窄不一；远了盖不住一个像素就摊到一个像素宽、按比例减亮，不闪
  float bev = mix(.08, .2, rnd) * min(hs.x, hs.y);
  float bw = max(bev, pw * 1.15);
  float tb = 1. - smoothstep(0., bw, dEdge);
  vec3 outward = de.x < de.y ? a1 * sign(uv.x) : a2 * sign(uv.y);
  mat3 Rm = mat3(vR0, vR1, vR2);
  vec3 N = normalize(Rm * (vNL + outward * tb * .9 + vec3((rnd - .5) * .03, (fract(rnd * 7.13) - .5) * .03, 0.)));

  vec3 cam = uMirror < 0. ? vec3(uCamPos.x, -uCamPos.y, uCamPos.z) : uCamPos;
  vec3 V = normalize(cam - vWorld);
  float NV = max(dot(N, V), 0.);
  float F = .04 + .96 * pow(1. - NV, 5.);
  float comp = mix(1., bev / bw, tb);

  // 石头本身：几乎全黑，只反一点天光
  vec3 col = vec3(.0006 + .004 * uLight * mix(.7, 1.3, rnd));
  vec3 Rv = reflect(-V, N);
  float env = (.0008 + .012 * uLight * exp(-abs(Rv.y) * 3.)) * F * comp;
  col += glowCol(env * 4., uActCol);

  float bright = vMat.w * (1. - .97 * (gateOrSil()));
  bool gate = vExtra.x > -.5 && vExtra.x < 7.5;
  // 石缝透光（门上的缝：离门缝越近越亮）
  float sw = max(.14, pw * 1.05);
  float seamAmt = vMat.x;
  // 门上的石头：z 存的是「指到 / 松动」时额外的缝光（不随离门缝远近变）
  if (gate) seamAmt = vMat.x * slitLight(vWorld.xy) * .11 * uLight * mix(.08, 1.7, rnd * rnd) + vMat.z;
  float seam = (1. - smoothstep(0., sw, dEdge)) * seamAmt * min(1., .2 / sw);
  col += glowCol(seam * bright, vTint);
  // 发热：整块发光（太阳、烧红的浑天仪），倒角那圈暗一点，显出一块一块
  col += glowCol(vMat.y * bright * mix(1., 1. - vBev, tb) * comp, vTint);
  // 这一幕那盏灯照在石头上
  if (uKey.w > 0.) {
    vec3 Lv = uKey.xyz - vWorld;
    float ld = length(Lv);
    Lv /= ld;
    float lam = max(dot(N, Lv), 0.) * uKey.w / (1. + ld * ld / 52000.);
    // 门是黑石：这盏灯只在它边上擦一点光，不把整面门照亮
    if (gate) lam *= .12 * (1. - .7 * max(dot(N, normalize(cam - vWorld)), 0.));
    col += glowCol(lam * .5 * comp, uKeyCol);
  }
  // 背光勾边：门后那盏光在它背后，轮廓亮一圈
  if (!gate && vMat.z > 0.) {
    vec3 Lb = normalize(uBack - vWorld);
    float behind = max(dot(-V, Lb), 0.);
    float rim = pow(1. - NV, 3.) * behind * behind * vMat.z * uLight;
    col += glowCol(rim * bright, uActCol);
  }
  // 门的外沿：一圈细亮边，跟门四周那圈光接上；窗洞四壁被窗里的光照亮
  float e = floor(vExtra.x + .5);
  if (e > .5) {
    float dO = 1e3;
    if (e < 3.5 && e > .5) dO = min(dO, uGate.x - abs(vWorld.x));
    if (e > 3.5) dO = min(dO, uGate.y - vWorld.y);
    if (e > 4.5) dO = min(dO, uGate.x - abs(vWorld.x));
    float rw = max(.4, pw * 1.1);
    float near = exp(-abs(vWorld.y - .5 * uGate.y) / 160.);
    float rim = (1. - smoothstep(0., rw, dO)) * 2. * (.3 + .7 * near) * uLight * min(1., .55 / rw) * uHalo;
    col += glowCol(rim, uActCol);
  }
  if (gate) {
    for (int k = 0; k < 5; k++) {
      if (uWinOn[k] <= 0.) continue;
      float d = rectSD(vWorld.xy, uWinRect[k].xy, uWinRect[k].zw);
      float wl = uWinOn[k] * exp(-max(d, 0.) / 2.2) * step(-1.5, d) * .9;
      col += glowCol(wl * (.4 + .6 * (1. - NV)), uWinCol[k]);
    }
  }
  // 第七幕白光：所有东西都成了白光里的剪影
  col *= 1. - .85 * uWhite;
  if (!gate) col *= 1. - .9 * uSil;
  // 倒影那一遍：越深越暗
  if (uMirror < 0.) col *= exp(-max(vWorld.y, 0.) / 230.) * .9;
  // 远处薄薄一层空气
  float dist = length(vWorld - cam);
  float haze = 1. - exp(-dist * .00003);
  col = mix(col, glowCol(.002 * uLight, uActCol), clamp(haze, 0., .6));
  gl_FragColor = outColor(col);
}
`;

/** 门：两扇，各 6 × 27 块，绕外侧竖边（正面那条）向里转。门上五撮石头：哪一幕开始，哪一撮松动、离开 */
export const GATE_PLACE = /* glsl */ `
attribute vec4 aCell;    // 列、行、哪扇（-1 左 1 右）、属于哪撮（-1 不属于）
attribute vec4 aRand;
uniform float uDoor;     // 门开的角度（弧度）
uniform float uOut[5];   // 五撮各离开了多少（0 在门上 … 1 走了）
uniform float uHov[5];   // 首屏指到哪条铭文，门上那撮亮成它的颜色
uniform vec3 uSecCol[5];
uniform float uSeamBase;

bool place(inout vec3 c, inout vec3 s, inout mat3 R, inout vec4 m, inout vec3 tint, inout vec2 ex) {
  float col = aCell.x, row = aCell.y, leaf = aCell.z, cl = aCell.w;
  float CELL = uGate.y / 27.;
  float hw = uGate.x;
  float lx = leaf < 0. ? (col + .5) * CELL : -((11. - col) + .5) * CELL;
  vec3 lc = vec3(lx, (row + .5) * CELL, -uGate.w * .5);
  float ph = leaf < 0. ? uDoor : -uDoor;
  R = rotY(ph);
  vec3 hinge = vec3(leaf < 0. ? -hw : hw, 0., uGate.z);
  c = hinge + R * lc;
  // 砖与砖之间不留真缝（远看会漏光、一闪一闪），略微叠一点；缝里的光由片元着色器画
  s = vec3(CELL * 1.004, CELL * 1.004, uGate.w);
  tint = uActCol;
  float seam = uSeamBase;
  ex = vec2(0., aRand.x);
  // 外沿标记：1 左 2 右 4 顶（门缝那两条内沿不算，门缝的光由光晕那一层画）
  float e = 0.;
  if (col < .5) e += 1.;
  if (col > 10.5) e += 2.;
  if (row > 25.5) e += 4.;
  ex.x = e;
  if (cl > -.5) {
    int k = int(cl + .5);
    float o = uOut[k];
    float hv = uHov[k];
    vec3 sc = uSecCol[k];
    // 指到：那撮往外推一点，缝里亮成它的颜色
    c.z += hv * CELL * .9;
    m.z = hv * .9 + sat(o * 5.) * 1.4;
    m.y = hv * .05;
    tint = mix(tint, sc, max(hv, sat(o * 4.)));
    if (o > 0.) {
      // 先松动（抖一抖、缝亮起来），再一块一块离开：往前、往外散开，翻着跟头，越飞越小（一生万：它们变成了后面那几千块）
      float st = aRand.y * .35;
      float f = seg(o, st, st + .65);
      float shake = sin(uTime * 23. + aRand.z * 40.) * .25 * seg(o, 0., .2) * (1. - f);
      vec3 cen = vec3(0., (row + .5) * CELL, uGate.z);
      vec3 away = normalize(vec3((aRand.z - .5) * 1.4 + sign(lx) * .2, (aRand.w - .5) * 1.2 + .25, 2.4));
      float fly = f * f * (90. + 160. * aRand.x);
      c += away * fly + vec3(shake, 0., seg(o, 0., .2) * 3.);
      R = rotAxis(normalize(aRand.wzy - .5 + .001), f * (3. + 6. * aRand.y)) * R;
      s *= 1. - sstep(.25, 1., f);
      seam = 1.4 * sat(o * 4.);
      m.y = .4 * sat(o * 5.) * (1. - f);
      m.z = .6;
      ex.x = 8.;   // 离开了的石头不再算门的外沿，也不吃窗光
    }
  }
  m.x = seam;
  m.w = 1.;
  return true;
}
`;
