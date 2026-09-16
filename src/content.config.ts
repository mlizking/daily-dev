import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORY_IDS } from './lib/taxonomy';

/**
 * An Issue's structure lives in frontmatter; its Thai narrative lives in the body.
 *
 * Items are structured data rather than prose because Category pages, the RSS feed
 * and any future English edition all need to read an Item without parsing Markdown —
 * and because a Fact must stay verbatim, which prose formatting would not preserve (ADR-0006).
 */
const issues = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/issues' }),
  schema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** The Run's own start of the previous day — the window is never assumed. */
    windowStart: z.coerce.date(),
    windowEnd: z.coerce.date(),
    generatedAt: z.coerce.date(),
    /** Which writer model produced this Issue, so a quality change is attributable. */
    writerModel: z.string(),

    corrections: z.array(z.string()).default([]),

    categories: z.array(
      z.object({
        category: z.enum(CATEGORY_IDS),
        empty: z.boolean(),
      }),
    ),
  }),
});

export const collections = { issues };
