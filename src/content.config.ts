import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORY_IDS } from './lib/taxonomy';

/**
 * An Issue's structure lives in frontmatter. The Items are declared here rather than passed
 * through, because a Zod schema strips what it does not describe — an undeclared `items` array
 * would simply vanish, and the Issue pages would render an empty article with no error to
 * explain it.
 */
const fact = z.object({
  text: z.string(),
  lang: z.enum(['en', 'th']),
  /** `verbatim` prose may be quoted; `derived` text assembled from fields must not be. */
  kind: z.enum(['verbatim', 'derived']),
  url: z.string(),
});

const item = z.object({
  id: z.string(),
  category: z.enum(CATEGORY_IDS),
  title: z.string(),
  url: z.string(),
  sourceId: z.string(),
  publishedAt: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'unknown']).default('unknown'),
  score: z.number().default(0),
  tags: z.array(z.string()).default([]),
  primaryRecord: z.object({ id: z.string(), url: z.string() }).optional(),
  alsoReportedBy: z.array(z.object({ sourceId: z.string(), url: z.string() })).optional(),
  facts: z.array(fact).default([]),
  analysisEn: z.string().optional(),
  analysisTh: z.string().optional(),
});

const issues = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/issues' }),
  schema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** The previous Run's recorded start — the window is never assumed. */
    windowStart: z.coerce.date(),
    windowEnd: z.coerce.date(),
    generatedAt: z.coerce.date(),
    /** Which writer model produced this Issue, so a quality change is attributable. */
    writerModel: z.string(),

    corrections: z.array(z.string()).default([]),
    intro: z.string().optional(),

    categories: z.array(
      z.object({
        category: z.enum(CATEGORY_IDS),
        labelTh: z.string().optional(),
        empty: z.boolean(),
        commentary: z.string().optional(),
      }),
    ),

    items: z.array(item).default([]),
  }),
});

export const collections = { issues };