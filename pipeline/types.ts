import type { CategoryId } from '../src/lib/taxonomy.ts';

export type { CategoryId };

export type Tier = 1 | 2;

/**
 * Text copied verbatim from an origin, or assembled from its structured fields.
 *
 * `verbatim` is prose the origin wrote — the renderer may quote it.
 * `derived` is a faithful rendering of structured fields (a version, a date) where the
 * origin has no prose. It must never be shown in quotation marks, because it is not a
 * quotation. The distinction exists so the page cannot lie about what was said (ADR-0006).
 */
export type Fact = {
  text: string;
  lang: 'en' | 'th';
  url: string;
  kind: 'verbatim' | 'derived';
};

/**
 * The authoritative origin of a security claim, and the only kind of origin
 * allowed to justify one (ADR-0008). A security Item without one is dropped.
 */
export type PrimaryRecord = {
  id: string;
  url: string;
};

export type Item = {
  /** Stable: derived from the Source id and the origin's own identifier. */
  id: string;
  sourceId: string;
  url: string;
  /** Verbatim, as the origin wrote it. */
  title: string;
  facts: Fact[];
  /** ISO 8601, from the origin. */
  publishedAt: string;
  fetchedAt: string;
  category: CategoryId;
  /** Cross-cutting topics this Item carries, inherited from its Source. */
  tags: string[];
  /** Deterministic, from the fixed factor order. */
  score?: number;
  primaryRecord?: PrimaryRecord;
  clusterId?: string;
  seenAt?: string;
  /** The origin's own severity, where it states one. */
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  /** Community velocity, where the origin exposes it. */
  points?: number;
  /** Changed since we last saw it — an advisory gaining a patch re-enters (ADR-0007). */
  contentHash?: string;
  /** Other Sources that reported the same event, so the Issue says it once (user story 40). */
  alsoReportedBy?: { sourceId: string; url: string }[];
  /** True when no previous Run had considered this Item. */
  isNew?: boolean;
  /**
   * Our own words about this Item — never the origin's. The English form is canonical
   * and stored from the first Issue so an English edition is later a rendering change
   * rather than a reprocessing of the archive (ADR-0005).
   */
  analysisEn?: string;
  analysisTh?: string;
};

/** One Category's contribution to an Issue. An empty Category is recorded, not omitted. */
export type CategorySection = {
  category: CategoryId;
  items: Item[];
  empty: boolean;
  /** The writer's Thai narrative for this section. */
  commentary?: string;
};

export type Issue = {
  /** The Issue's date, Asia/Bangkok. */
  date: string;
  /** The previous Run's recorded start — never assumed. */
  windowStart: string;
  /** This Run's recorded start. */
  windowEnd: string;
  generatedAt: string;
  /** Which writer model produced this Issue, so a quality change is attributable. */
  writerModel: string;
  categories: CategorySection[];
  intro?: string;
  corrections: string[];
  technique?: { title: string; body: string; code?: string };
};

/**
 * The Run's outcome. The two cases are the opposite of each other from the
 * reader's point of view, so they are the opposite of each other in the type (ADR-0009).
 */
export type RunResult =
  | { outcome: 'published'; issue: Issue }
  | { outcome: 'blind'; reason: string; failedSources: string[] };

export type SourceReport = {
  sourceId: string;
  tier: Tier;
  status: 'ok' | 'failed' | 'empty';
  items: number;
  newItems: number;
  error?: string;
  ms: number;
  /** What the adapter discarded, so filtering is visible rather than silent. */
  notes?: string[];
};
