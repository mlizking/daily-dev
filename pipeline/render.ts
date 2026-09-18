import { stringify as toYaml, Scalar } from 'yaml';
import type { Issue, Item } from './types.ts';
import { CATEGORIES } from '../src/lib/taxonomy.ts';

/**
 * A string that must survive YAML as a string.
 *
 * An unquoted `2026-09-18` in frontmatter is a date, and the content loader hands it to the
 * schema as a Date object — so the Issue's own date, which is the key its URL is built from,
 * arrived as a timestamp and the build refused it. Quoting says what we mean.
 */
function literal(value: string): Scalar {
  const scalar = new Scalar(value);
  scalar.type = 'QUOTE_DOUBLE';
  return scalar;
}

/**
 * An Issue's structure lives in frontmatter; the page renders from it.
 *
 * Items are structured rather than prose so that Category pages, the RSS feed and any
 * future English edition can read an Item without parsing Markdown — and because a Fact
 * must stay verbatim, which prose formatting would not preserve (ADR-0006).
 *
 * The renderer is deterministic: the same Issue always produces the same bytes, which
 * is what makes a golden-file test meaningful.
 */

function itemForFrontmatter(item: Item) {
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    url: item.url,
    sourceId: item.sourceId,
    publishedAt: literal(item.publishedAt),
    severity: item.severity ?? 'unknown',
    score: item.score ?? 0,
    tags: item.tags ?? [],
    ...(item.primaryRecord ? { primaryRecord: item.primaryRecord } : {}),
    ...(item.alsoReportedBy?.length ? { alsoReportedBy: item.alsoReportedBy } : {}),
    facts: item.facts.map((f) => ({ text: f.text, lang: f.lang, kind: f.kind, url: f.url })),
    ...(item.analysisEn ? { analysisEn: item.analysisEn } : {}),
    ...(item.analysisTh ? { analysisTh: item.analysisTh } : {}),
  };
}

export function renderIssue(issue: Issue): { filename: string; content: string } {
  const frontmatter = {
    date: literal(issue.date),
    windowStart: issue.windowStart,
    windowEnd: issue.windowEnd,
    generatedAt: issue.generatedAt,
    writerModel: issue.writerModel,
    corrections: issue.corrections,
    categories: issue.categories.map((s) => ({
      category: s.category,
      labelTh: CATEGORIES.find((c) => c.id === s.category)?.labelTh ?? s.category,
      empty: s.empty,
      ...(s.commentary ? { commentary: s.commentary } : {}),
    })),
    ...(issue.intro ? { intro: issue.intro } : {}),
    items: issue.categories.flatMap((s) => s.items.map(itemForFrontmatter)),
  };

  const yaml = toYaml(frontmatter, { lineWidth: 0 });
  return {
    filename: `${issue.date}.md`,
    content: `---\n${yaml}---\n`,
  };
}

export function issuePath(issue: Issue): string {
  return `content/issues/${issue.date}.md`;
}
