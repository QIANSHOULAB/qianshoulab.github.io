// 门的石头：两扇，各 6 × 27 块（合起来 12 × 27，还是 v2 碑那 324 块）。
// 门上五撮（两边四撮 3 × 3、正中一撮 4 × 3）位置跟 v2 线上一样：一道对称的拱，01、05 最低在两边，03 最高在正中。
import { GATE } from './config';

export const CELL = GATE.W / GATE.COLS;   // = H / ROWS，方砖

/** 五撮：列（含）、行（含，从下往上数） */
export const SPOTS: [number, number, number, number][] = [
  [0, 2, 1, 3],    // 01 千手院
  [1, 3, 5, 7],    // 02 赛博杂货铺
  [4, 7, 9, 11],   // 03 标本（正中、最高，跨两扇门）
  [8, 10, 5, 7],   // 04 文物
  [9, 11, 1, 3],   // 05 法典
];

/** 五撮在门正面（门关着时）的矩形：minX minY maxX maxY */
export const SPOT_RECTS = SPOTS.map(([c0, c1, r0, r1]) => [
  -GATE.W / 2 + c0 * CELL, r0 * CELL, -GATE.W / 2 + (c1 + 1) * CELL, (r1 + 1) * CELL,
] as [number, number, number, number]);

// 固定种子的随机数：每次构建、每台机器上都长一个样
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 打乱顺序（按档位砍后一半时，形状还在，只是稀一些） */
export function shuffle<T>(a: T[], seed: number): T[] {
  const r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 门上每块石头：列、行、哪扇（-1 左 1 右）、属于哪撮（-1 不属于），四个随机数（左右镜像，连细微差别也对称） */
export function gateBlocks() {
  const r = rng(19121130);
  const half: Record<string, number[]> = {};
  const cell: number[] = [], rand: number[] = [];
  for (let row = 0; row < GATE.ROWS; row++) {
    for (let col = 0; col < GATE.COLS; col++) {
      const mc = col < GATE.COLS / 2 ? col : GATE.COLS - 1 - col;
      const key = `${mc},${row}`;
      if (!half[key]) half[key] = [r(), r(), r(), r()];
      const rr = half[key].slice();
      if (col >= GATE.COLS / 2) rr[3] = 1 - rr[3];
      const cl = SPOTS.findIndex(([c0, c1, r0, r1]) => col >= c0 && col <= c1 && row >= r0 && row <= r1);
      cell.push(col, row, col < GATE.COLS / 2 ? -1 : 1, cl);
      rand.push(...rr);
    }
  }
  return { cell: new Float32Array(cell), rand: new Float32Array(rand), count: GATE.ROWS * GATE.COLS };
}
