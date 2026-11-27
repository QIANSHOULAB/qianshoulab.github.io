// 三套档案的元数据规矩（策划书 §4.2 / §5）。每篇一份英文、一份中文：<slug>.en.mdx、<slug>.zh.mdx。
// 写完 .mdx 推上去就上线；字段缺了、日期写错了、两种语言的共用字段对不上，构建直接报错，不会带病上线。
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const lang = z.enum(['en', 'zh']);
const idFromFile = ({ entry }: { entry: string }) => entry.replace(/\.mdx?$/, '');

const specimens = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/specimens', generateId: idFromFile }),
  schema: z.object({
    id: z.string().regex(/^\d{3}$/, '样本编号写三位数字，比如 "001"'),
    lang,
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string(),
    date: z.coerce.date(),
    species: z.string(),
    scale: z.string(),
    liveUrl: z.url(),
    sourceUrl: z.url(),
    sourceLabel: z.string(),
    modelStack: z.array(z.string()).min(1),
    summary: z.string(),
  }),
});

const artifacts = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/artifacts', generateId: idFromFile }),
  schema: z.object({
    id: z.string().regex(/^EXP-\d{2}$/, '自研编号写成 "EXP-01"'),
    lang,
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string(),
    date: z.coerce.date().optional(),
    status: z.enum(['live', 'wip']),
    summary: z.string(),
  }),
});

const codex = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/codex', generateId: idFromFile }),
  schema: z.object({
    id: z.string().regex(/^Codex-\d{2}$/, '法则编号写成 "Codex-01"'),
    lang,
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string(),
    date: z.coerce.date().optional(),
    status: z.enum(['live', 'wip']),
    category: z.enum(['geometry', 'sound', 'headless']),
    summary: z.string(),
  }),
});

export const collections = { specimens, artifacts, codex };
