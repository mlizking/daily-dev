import { createHash } from 'node:crypto';
import type { CategoryId, Fact, Item, PrimaryRecord } from './types.ts';
import type { SourceDef } from './sources.ts';
import { isPrimaryRecordSource } from './sources.ts';

/**
 * What an adapter hands back: facts about one thing the origin said, before we know
 * anything about how it ranks or where it belongs.
 *
 * `description` must already be plain text with markup removed. The normaliser is
 * structurally incapable of summarising — it excerpts and truncates, and that is all.
 */
export type RawRecord = {
  /** The origin's own identifier. Combined with the Source id to form a stable Item id. */
  nativeId: string;
  url: string;
  title: string;
  description: string;
  publishedAt: string;
  /** `derived` when the origin has no prose and the text is assembled from its fields. */
  kind?: 'verbatim' | 'derived';
  primaryRecord?: PrimaryRecord;
  severity?: Item['severity'];
  points?: number;
  /** Set when an adapter knows better than the Source's default Category. */
  category?: CategoryId;
};

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&#x27;': "'",
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
};

export function stripTags(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Collapse whitespace and cut at a word boundary. Never rewrites a word. */
export function excerpt(text: string, max = 700): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '') + '…';
}

export function toIso(value: string | number | Date | undefined | null): string {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  // A bare calendar date, which many feeds and release indexes publish.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00.000Z`;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

export function contentHashOf(...parts: (string | undefined)[]): string {
  return createHash('sha1').update(parts.filter(Boolean).join('\u0000')).digest('hex').slice(0, 16);
}

export function normalize(source: SourceDef, raw: RawRecord, fetchedAt: string): Item {
  const facts: Fact[] = [];

  const title = stripTags(raw.title);
  if (title) {
    facts.push({ text: title, lang: 'en', url: raw.url, kind: 'verbatim' });
  }

  const description = excerpt(stripTags(raw.description));
  if (description && description !== title) {
    facts.push({
      text: description,
      lang: 'en',
      url: raw.url,
      kind: raw.kind ?? 'verbatim',
    });
  }

  // A security claim is only justifiable by a Primary Record, and only a Source on the
  // closed allowlist may supply one. Anything else is dropped by the Gate (ADR-0008).
  const primaryRecord = isPrimaryRecordSource(source.id) ? raw.primaryRecord : undefined;

  return {
    id: `${source.id}:${raw.nativeId}`,
    sourceId: source.id,
    url: raw.url,
    title,
    facts,
    publishedAt: toIso(raw.publishedAt) || fetchedAt,
    fetchedAt,
    category: raw.category ?? source.category,
    // Copied, not shared. Every Item from one Source would otherwise hold the same array,
    // and editing one Item's tags would silently edit its siblings'. The YAML writer also
    // notices the shared reference and emits an anchor and an alias, which turns committed
    // content into something that cannot be edited by hand without breaking it.
    tags: [...(source.tags ?? [])],
    primaryRecord,
    severity: raw.severity ?? 'unknown',
    points: raw.points,
    contentHash: contentHashOf(title, description, raw.publishedAt),
  };
}
