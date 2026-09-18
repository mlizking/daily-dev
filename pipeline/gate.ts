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

/** At most this many Items per Category, so the Issue stays a ten-minute read. */
export const QUOTA_MAX = 3;

/** Below this, an Item is not worth a reader's attention. */
export const MIN_SCORE = 55;

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

export function applyGate(
  items: Item[],
  tierOfSource: (sourceId: string) => Tier,
  windowEnd: Date,
): GateResult {
  const dropped: DroppedItem[] = [];
  const scored: Item[] = [];

  for (const item of items) {
    // Enforced in code, not in a prompt, so it cannot be softened by rewording (ADR-0008).
    if (item.category === 'security' && !item.primaryRecord) {
      dropped.push({ item, reason: 'security Item with no Primary Record' });
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
    const selected = scored
      .filter((i) => i.category === category)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.id < b.id ? -1 : 1))
      .slice(0, QUOTA_MAX);

    for (const item of scored.filter((i) => i.category === category).slice(QUOTA_MAX)) {
      dropped.push({ item, reason: 'outside the Category quota' });
    }

    return { category, items: selected, empty: selected.length === 0 };
  });

  return { sections, dropped };
}

export function selectedCount(sections: CategorySection[]): number {
  return sections.reduce((n, s) => n + s.items.length, 0);
}
