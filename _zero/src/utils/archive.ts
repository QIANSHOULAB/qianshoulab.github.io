// 把每篇的英文、中文两份配成一对；共用字段（日期、链接、编号……）两边写得不一样就直接报错。
import { getCollection, type CollectionEntry } from 'astro:content';
import { shop } from '../data/tools';
import { QIANSHOU } from '../data/sites';

type Name = 'specimens' | 'artifacts' | 'codex';
export type Pair<N extends Name> = { slug: string; en: CollectionEntry<N>; zh: CollectionEntry<N> };

const SHARED: Record<Name, string[]> = {
  specimens: ['id', 'date', 'liveUrl', 'sourceUrl', 'modelStack'],
  artifacts: ['id', 'date', 'status'],
  codex: ['id', 'date', 'status', 'category'],
};

function same(a: unknown, b: unknown) {
  return JSON.stringify(a instanceof Date ? a.toISOString() : a) === JSON.stringify(b instanceof Date ? b.toISOString() : b);
}

export async function pairs<N extends Name>(name: N): Promise<Pair<N>[]> {
  const all = (await getCollection(name)) as CollectionEntry<N>[];
  const by = new Map<string, Partial<Record<'en' | 'zh', CollectionEntry<N>>>>();
  for (const e of all) {
    const d = e.data as { slug: string; lang: 'en' | 'zh' };
    const p = by.get(d.slug) ?? {};
    if (p[d.lang]) throw new Error(`${name}/${d.slug}: ${d.lang} 写了两份`);
    p[d.lang] = e;
    by.set(d.slug, p);
  }
  const out: Pair<N>[] = [];
  for (const [slug, p] of by) {
    if (!p.en || !p.zh) throw new Error(`${name}/${slug}: 缺 ${p.en ? '中文' : '英文'}那份`);
    for (const k of SHARED[name]) {
      const a = (p.en.data as Record<string, unknown>)[k], b = (p.zh.data as Record<string, unknown>)[k];
      if (!same(a, b)) throw new Error(`${name}/${slug}: 「${k}」中英两份不一样（${JSON.stringify(a)} / ${JSON.stringify(b)}）`);
    }
    out.push({ slug, en: p.en, zh: p.zh });
  }
  // 新的在前；没日期的（还在炉子里）排最后
  out.sort((a, b) => {
    const da = (a.en.data as { date?: Date }).date, db = (b.en.data as { date?: Date }).date;
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0) || a.slug.localeCompare(b.slug);
  });
  return out;
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** 正文字数（无头模式里要显示）：去掉 MDX 的 import、标签和标点符号外的记号，数字符。 */
export function plainLength(body = '') {
  const text = body
    .replace(/^import .*$/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[#>*_`|\-]/g, '')
    .replace(/\s+/g, '');
  return Array.from(text).length;
}

export type Update = {
  date: string; kind: 'specimen' | 'artifact' | 'codex' | 'log';
  href?: string; title: { en: string; zh: string }; summary: { en: string; zh: string }; tag?: string;
};

// 站内大事记：不属于三套档案、但值得记一笔的
export const siteLog: Update[] = [
  {
    date: '2026-11-27', kind: 'log', href: QIANSHOU,
    title: { en: 'The observatory opens', zh: '观测台开张' },
    summary: {
      en: `QIANSHOU LAB moved up the hill to /qianshou/. The Cyber Bodega opened next door with ${shop.length} small tools on the shelf.`,
      zh: `千手院搬上山，新家在 /qianshou/；隔壁赛博杂货铺开张，货架上先摆 ${shop.length} 样小工具。`,
    },
  },
];

export async function updates(): Promise<Update[]> {
  const [s, a, c] = await Promise.all([pairs('specimens'), pairs('artifacts'), pairs('codex')]);
  const list: Update[] = [...siteLog];
  for (const p of s) list.push({
    date: ymd(p.en.data.date), kind: 'specimen', href: `/specimens/${p.slug}/`, tag: p.en.data.id,
    title: { en: p.en.data.title, zh: p.zh.data.title }, summary: { en: p.en.data.summary, zh: p.zh.data.summary },
  });
  for (const p of a) if (p.en.data.date && p.en.data.status === 'live') list.push({
    date: ymd(p.en.data.date), kind: 'artifact', href: `/artifacts/${p.slug}/`, tag: p.en.data.id,
    title: { en: p.en.data.title, zh: p.zh.data.title }, summary: { en: p.en.data.summary, zh: p.zh.data.summary },
  });
  for (const p of c) if (p.en.data.date && p.en.data.status === 'live') list.push({
    date: ymd(p.en.data.date), kind: 'codex', href: `/codex/${p.slug}/`, tag: p.en.data.id,
    title: { en: p.en.data.title, zh: p.zh.data.title }, summary: { en: p.en.data.summary, zh: p.zh.data.summary },
  });
  return list.sort((x, y) => y.date.localeCompare(x.date) || (x.kind === 'log' ? 1 : -1));
}
