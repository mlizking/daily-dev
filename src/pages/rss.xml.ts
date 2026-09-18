import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { SITE } from '../lib/site';

export async function GET(context: APIContext) {
  const issues = (await getCollection('issues')).sort((a, b) =>
    a.data.date < b.data.date ? 1 : -1,
  );

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site!,
    items: issues.map((issue) => ({
      title: issue.data.date,
      link: `/${issue.data.date}/`,
      pubDate: issue.data.generatedAt,
    })),
  });
}
