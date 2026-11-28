// 黑碑的尺寸和砖：1:4:9（厚:宽:高，2001 那块的比例），12 × 27 块方砖，一共 324 块。
// 下半截五撮（两边四撮 3 × 3 块、正中一撮 4 × 3 块）就是五道门，左右对称排成一道拱：中间 03 最高，两边 01 / 05 最低。
// 平时五撮跟别的砖一模一样，看不出来；指到哪撮，那撮才从碑里出来。

export const H = 240;                 // 碑高（世界单位）。站在 1.7 高的水边看它，它在 1000 外的地平线上
export const W = (H * 4) / 9;         // 宽
export const T = H / 9;               // 厚
export const DIST = 1000;             // 碑正面离观者多远
export const Z_FRONT = -DIST;         // 碑正面的 z
export const COLS = 12;
export const ROWS = 27;
export const CELL = W / COLS;         // = H / ROWS，方砖

export interface Cluster {
  id: number;           // 0..4 对应 01..05
  c0: number; c1: number;   // 列（含）
  r0: number; r1: number;   // 行（含，从下往上数）
  center: [number, number]; // 正面上的中心（世界 x、y）
  dir: [number, number];    // 出碑方向（xy，单位向量）
}

// 五撮的位置：一道对称的拱，中轴两侧镜像（列从左往右 0..11，行从下往上 0..26）
const SPOTS: [number, number, number, number][] = [
  [0, 2, 1, 3],    // 01 千手院    最左、最低，往左上出碑
  [1, 3, 5, 7],    // 02 赛博杂货铺
  [4, 7, 9, 11],   // 03 标本      正中、最高，笔直往上出
  [8, 10, 5, 7],   // 04 文物
  [9, 11, 1, 3],   // 05 法典
];

export const clusters: Cluster[] = SPOTS.map(([c0, c1, r0, r1], id) => {
  const cx = -W / 2 + ((c0 + c1 + 1) / 2) * CELL;
  const cy = ((r0 + r1 + 1) / 2) * CELL;
  // 出碑方向：从碑脚正中往外放射（全集里分出一个子集，往外走）
  const ox = 0, oy = -0.15 * H;
  let dx = cx - ox, dy = cy - oy;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  return { id, c0, c1, r0, r1, center: [cx, cy], dir: [dx, dy] };
});

export interface Block {
  x: number; y: number;        // 正面中心
  col: number; row: number;
  cluster: number;             // -1 = 不属于任何一撮
  edge: number;                // 是不是碑的外沿：1 左 2 右 4 顶
  rand: [number, number, number, number];
}

// 固定种子的随机数：每次构建、每台机器上的碑都长一个样
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function blocks(): Block[] {
  const r = rng(19121130);
  const out: Block[] = [];
  // 左半边随机，右半边照镜子抄过去：连砖的细微差别也左右对称
  const half: Record<string, [number, number, number, number]> = {};
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const mc = col < COLS / 2 ? col : COLS - 1 - col;
      const key = `${mc},${row}`;
      if (!half[key]) half[key] = [r(), r(), r(), r()];
      const rand = half[key].slice() as [number, number, number, number];
      if (col >= COLS / 2) rand[3] = 1 - rand[3];   // 第四个数管左右倾斜：镜像过去要反号
      const cl = clusters.find((c) => col >= c.c0 && col <= c.c1 && row >= c.r0 && row <= c.r1);
      out.push({
        x: -W / 2 + (col + 0.5) * CELL,
        y: (row + 0.5) * CELL,
        col, row,
        cluster: cl ? cl.id : -1,
        edge: (col === 0 ? 1 : 0) | (col === COLS - 1 ? 2 : 0) | (row === ROWS - 1 ? 4 : 0),
        rand,
      });
    }
  }
  return out;
}
