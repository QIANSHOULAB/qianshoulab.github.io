// 首页取景框里的五个物种：一条超级公式，换几组参数。拉丁学名是编的，参数是真的。
import type { Super } from '../components/labs/wire';

export type Species = { latin: string; en: string; zh: string; r1: Super; r2: Super };

export const SPECIES: Species[] = [
  { latin: 'Glomus nullum', en: 'null sphere', zh: '零号球',
    r1: { m: 0, n1: 1, n2: 1, n3: 1 }, r2: { m: 0, n1: 1, n2: 1, n3: 1 } },
  { latin: 'Testudo quadratica', en: 'square tortoise', zh: '四次方程龟',
    r1: { m: 4, n1: 12, n2: 15, n3: 15 }, r2: { m: 4, n1: 12, n2: 15, n3: 15 } },
  { latin: 'Asteria heptagona', en: 'seven-arm starfish', zh: '七角海星',
    r1: { m: 7, n1: 0.2, n2: 1.7, n3: 1.7 }, r2: { m: 7, n1: 0.2, n2: 1.7, n3: 1.7 } },
  { latin: 'Diamantum lineare', en: 'linear diamond', zh: '线性钻石',
    r1: { m: 4, n1: 1, n2: 1, n3: 1 }, r2: { m: 4, n1: 1, n2: 1, n3: 1 } },
  { latin: 'Echinus fourieri', en: 'Fourier urchin', zh: '傅里叶海胆',
    r1: { m: 12, n1: 0.6, n2: 1.2, n3: 1.2 }, r2: { m: 12, n1: 0.6, n2: 1.2, n3: 1.2 } },
];
