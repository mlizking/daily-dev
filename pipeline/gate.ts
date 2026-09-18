import type { CategoryId, CategorySection, Item, Tier } from './types.ts';
import { CATEGORY_IDS } from '../src/lib/taxonomy.ts';

/**
 * The Editorial Gate decides which Candidates reach an Issue. It is a per-Category
 * quota plus a deterministic score, in a fixed factor order (ADR-0008).
 *
 * A global ranking would let a busy news day crowd out security entirely, and no
 * Category would be reliably present — which is the whole promise of a fixed-section
 * Issue. A Category with nothing qualifying is recorded as empty rather than filled.
 */

/**
 * At most this many Items per Category.
 *
 * Four, not three: the length budget and the quota have to agree. With three, even hitting
 * the per-Item ceiling everywhere tops out around 10,400 Thai characters, which is short of
 * the twelve minutes the Issue aims for — the ceiling was unreachable in aggregate, so the
 * quota was the real limit. Candidates are not scarce: the last Run dropped 292 of 304 for
 * being outside the quota.
 *
 * Not five, although five seems better on paper. Measured: three Items per Category produced
 * 3,800 characters, four produced 8,300, and five produced 7,400 — the writer holds an
 * implicit total length of its own, so adding Items makes each one shorter rather than making
 * the Issue longer. Breadth is a weak lever and so is depth; see `budget.ts` for what that
 * implies.
 */
export const QUOTA_MAX = 4;

/** Below this, an Item is not worth a reader's attention. */
export const MIN_SCORE = 55;

/**
 * At most this many Items from any one Source within a Category.
 *
 * Without it a single prolific feed owns a section: the first Issue with dev.to in the
 * registry filled AI for Developers with four Items from dev.to #ai, and every section read
 * like one blog. A Category should show a reader what several places agree is worth knowing.
 */
export const MAX_PER_SOURCE_PER_CATEGORY = 2;

/**
 * At most this many advisory Items within a Category.
 *
 * Security would otherwise be entirely advisories, because an actively-exploited CVE outscores
 * everything and there are always more than four of them. A security section that only says
 * what is broken, and never what to do about it, is half a section — and it left the DevSecOps
 * Sources, whose whole purpose is guidance, permanently locked out.
 */
export const MAX_ADVISORY_PER_CATEGORY = 2;

const SEVERITY_SCORE: Record<string, number> = {
  critical: 300,
  high: 200,
  medium: 100,
  low: 40,
  unknown: 10,
};

export type ScoreInputs = {
  tier: Tier;
  /** Which Source this came from, so membership of the KEV catalog can be recognised. */
  sourceId: string;
  /** The Run's recorded start, used for recency. */
  windowEnd: Date;
};

/** Fixed factor order. Changing the order changes the product, so it lives in one place. */
export function scoreOf(item: Item, inputs: ScoreInputs): number {
  let score = 0;

  // 1. Actively exploited. Nothing else comes close, and nothing should outrank it.
  if (item.sourceId === 'cisa-kev') score += 1000;

  // 2. Stated severity.
  score += SEVERITY_SCORE[item.severity ?? 'unknown'] ?? 10;

  // 3. The Source's Tier — a primary Record outranks a rumour.
  if (inputs.tier === 1) score += 60;

  // 4. Community velocity, capped so one viral thread cannot dominate.
  if (item.points) score += Math.min(item.points, 500) / 10;

  // 5. Recency.
  const ageHours = (inputs.windowEnd.getTime() - Date.parse(item.publishedAt)) / 3_600_000;
  if (ageHours <= 6) score += 40;
  else if (ageHours <= 12) score += 25;
  else if (ageHours <= 24) score += 10;

  // 6. Novelty against what has already been Seen.
  if (item.isNew) score += 30;

  return Math.round(score * 100) / 100;
}

export type DroppedItem = { item: Item; reason: string };

export type GateResult = {
  sections: CategorySection[];
  dropped: DroppedItem[];
};

/** A CVE identifier in an Item's own words, which is what makes a claim a vulnerability claim. */
const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/i;

/**
 * Whether this Item must cite a Primary Record.
 *
 * The rule protects a reader from being told a vulnerability is patched when it is not, so it
 * binds Items that make a claim about a specific vulnerability: anything from an advisory
 * Source, and anything — from anywhere — that names a CVE. It deliberately does not bind a
 * DevSecOps practice article, which has no CVE to cite and asserts nothing about one. Applied
 * to the whole Category, as it first was, the rule dropped twenty practice articles in a single
 * Run and left Security with nothing but advisories.
 */
export function needsPrimaryRecord(item: Item, advisorySourceIds: Set<string>): boolean {
  if (item.category !== 'security') return false;
  if (advisorySourceIds.has(item.sourceId)) return true;
  if (CVE_RE.test(item.title)) return true;
  return item.facts.some((f) => CVE_RE.test(f.text));
}

export function applyGate(
  items: Item[],
  tierOfSource: (sourceId: string) => Tier,
  windowEnd: Date,
  advisorySourceIds: Set<string>,
): GateResult {
  const dropped: DroppedItem[] = [];
  const scored: Item[] = [];

  for (const item of items) {
    // Enforced in code, not in a prompt, so it cannot be softened by rewording (ADR-0008).
    if (needsPrimaryRecord(item, advisorySourceIds) && !item.primaryRecord) {
      dropped.push({ item, reason: 'security claim with no Primary Record' });
      continue;
    }
    item.score = scoreOf(item, {
      tier: tierOfSource(item.sourceId),
      sourceId: item.sourceId,
      windowEnd,
    });
    if (item.score < MIN_SCORE) {
      dropped.push({ item, reason: `score ${item.score} below ${MIN_SCORE}` });
      continue;
    }
    scored.push(item);
  }

  const sections: CategorySection[] = CATEGORY_IDS.map((category: CategoryId) => {
    const ranked = scored
      .filter((i) => i.category === category)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.id < b.id ? -1 : 1));

    // Greedy by score, respecting the diversity caps, so a section is never one Source's
    // output and never entirely advisories.
    const selected: Item[] = [];
    const perSource = new Map<string, number>();
    let advisories = 0;

    for (const item of ranked) {
      if (selected.length >= QUOTA_MAX) break;
      const used = perSource.get(item.sourceId) ?? 0;
      if (used >= MAX_PER_SOURCE_PER_CATEGORY) continue;
      const isAdvisory = advisorySourceIds.has(item.sourceId);
      if (isAdvisory && advisories >= MAX_ADVISORY_PER_CATEGORY) continue;
      selected.push(item);
      perSource.set(item.sourceId, used + 1);
      if (isAdvisory) advisories += 1;
    }

    for (const item of ranked) {
      if (selected.includes(item)) continue;
      dropped.push({
        item,
        reason:
          selected.length >= QUOTA_MAX
            ? 'outside the Category quota'
            : 'crowded out by the per-Source or advisory cap',
      });
    }

    return { category, items: selected, empty: selected.length === 0 };
  });

  return { sections, dropped };
}

export function selectedCount(sections: CategorySection[]): number {
  return sections.reduce((n, s) => n + s.items.length, 0);
}
