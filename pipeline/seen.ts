import { createHash } from 'node:crypto';
import type { Item } from './types.ts';
import type { SeenEntry } from './state.ts';

/**
 * Seen detection runs in three deterministic steps, in this order, before any model
 * is involved (ADR-0007):
 *
 *   1. the per-Source Watermark decided what to fetch at all
 *   2. the seen-set decides what we have already considered
 *   3. the Cluster key decides what is the same event reported twice
 *
 * A model may arbitrate only where the deterministic pass is ambiguous, and only among
 * the highest-scoring Candidates. Asking a model to dedupe everything would cost money
 * to solve a problem string matching solves, and would make a Run unreproducible.
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'source',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
]);

/** Strip what never identifies a page: scheme, www, tracking parameters, trailing slash. */
export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw.trim().toLowerCase();
  }
  url.hash = '';
  url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();
  url.protocol = 'https:';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const query = url.searchParams.toString();
  return `${url.hostname}${path}${query ? `?${query}` : ''}`;
}

/** Words that carry no identity, in titles that are mostly English. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'as', 'at', 'by', 'from',
  'new', 'now', 'you', 'your', 'how', 'what', 'why', 'when', 'we', 'our',
]);

export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s.+#-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * A Cluster key: the normalised URL when it identifies a page, otherwise the set of
 * distinctive title tokens. Deterministic and stable across Runs.
 */
export function clusterKeyOf(item: Item): string {
  const normalized = normalizeUrl(item.url);
  const tokens = titleTokens(item.title).sort();

  // The same URL from two Sources is the same event.
  const urlHash = createHash('sha1').update(normalized).digest('hex').slice(0, 12);

  // Otherwise fall back to the title's distinctive vocabulary, which catches a release
  // announced by the vendor and then discussed on Hacker News.
  const tokenHash = tokens.length >= 3
    ? createHash('sha1').update(tokens.slice(0, 8).join(' ')).digest('hex').slice(0, 12)
    : '';

  return tokenHash ? `${urlHash}:${tokenHash}` : urlHash;
}

export type SeenResult = {
  candidates: Item[];
  skipped: number;
  reentered: number;
  merged: number;
};

/**
 * Apply the seen-set and then cluster. An Item whose origin changed re-enters, because
 * an advisory gaining a patch is news and suppressing it as "already seen" would hide
 * exactly the update a reader needs (ADR-0007).
 */
export function markSeen(items: Item[], seen: SeenEntry[], now: Date): SeenResult {
  const index = new Map(seen.map((e) => [e.id, e]));
  const candidates: Item[] = [];
  let skipped = 0;
  let reentered = 0;

  for (const item of items) {
    const prior = index.get(item.id);
    if (!prior) {
      item.isNew = true;
      candidates.push(item);
      continue;
    }
    if (prior.hash !== item.contentHash) {
      item.isNew = true;
      item.seenAt = prior.seenAt;
      reentered += 1;
      candidates.push(item);
      continue;
    }
    skipped += 1;
  }

  const { items: clustered, merged } = cluster(candidates, index);
  void now;
  return { candidates: clustered, skipped, reentered, merged };
}

/**
 * Collapse Items describing one event into a single representative that cites the
 * others, so the Issue does not report the same story four times (user story 40).
 */
export function cluster(items: Item[], index: Map<string, SeenEntry>): { items: Item[]; merged: number } {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = clusterKeyOf(item);
    item.clusterId = key;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const out: Item[] = [];
  let merged = 0;

  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      out.push(bucket[0]);
      continue;
    }

    // Prefer the representative that is already a Primary Record, then the one we have
    // seen least, then the earliest — a stable choice, not a judgement call.
    const sorted = [...bucket].sort((a, b) => {
      const pa = a.primaryRecord ? 0 : 1;
      const pb = b.primaryRecord ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });

    const [representative, ...rest] = sorted;
    representative.alsoReportedBy = rest.map((r) => ({ sourceId: r.sourceId, url: r.url }));
    // The representative inherits the strongest evidence any Source offered.
    if (!representative.primaryRecord) {
      const withRecord = rest.find((r) => r.primaryRecord);
      if (withRecord?.primaryRecord) representative.primaryRecord = withRecord.primaryRecord;
    }
    if (!representative.points) {
      representative.points = Math.max(...rest.map((r) => r.points ?? 0), 0) || undefined;
    }
    merged += rest.length;
    out.push(representative);
  }

  void index;
  return { items: out, merged };
}
