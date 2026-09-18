/**
 * How long an Issue should be, expressed in Thai characters.
 *
 * Characters, not words: Thai has no spaces between words, so "90 Thai words" is not a
 * number anyone — human or model — can check. The first version of the writer prompt used
 * words, the model interpreted the cap loosely, and the resulting Issue came out at about
 * a quarter of its intended reading time. A budget has to be measurable to be real.
 *
 * A prompt asks; code measures. The prompt states the target, and the Run reports the actual
 * length against it on every Run, so drift is visible instead of assumed.
 *
 * Measured behaviour worth knowing before trusting any of these numbers: the writer holds an
 * implicit total length of its own. Raising the per-Item ceiling from 700 to 800 moved the
 * average Item from 407 to 517 characters; raising the quota from four to five moved it back
 * to 371. Neither lever reliably reaches the ceiling, so the prompt alone cannot hold a band.
 *
 * What holds it is measurement. The Run measures the Issue in Thai characters after the first
 * write, and a bounded pass in code closes the gap: a deepening pass while it is under `min`,
 * a tightening pass while it is over `max`. The tightening pass was measured cutting an
 * 8,816-character Issue to 6,415 — 27% — across three passes, so a Run that overshoots badly
 * still lands inside the band rather than shipping a reading time it does not have.
 */

export type Band = { min: number; target: number; max: number };

/** The whole Issue: intro, every Category's commentary, and every Analysis. */
export const ISSUE_CHARS: Band = { min: 7_500, target: 9_800, max: 13_000 };

/** One Item's Analysis. */
export const ANALYSIS_CHARS: Band = { min: 400, target: 550, max: 800 };

/**
 * An Item that a reader must act on — actively exploited, critical, or a breaking change —
 * earns the upper end. Length must be spent where it changes what the reader does, not
 * spread evenly across a routine version bump.
 */
export const ANALYSIS_CHARS_PRIORITY_MAX = 1_000;

/** One Category's commentary. */
export const COMMENTARY_CHARS: Band = { min: 150, target: 250, max: 350 };

/**
 * Reading speed for Thai technical prose, characters per minute.
 *
 * Measured, not assumed. The operator read an Issue of 11,754 Thai characters, Thai only,
 * in 17.33 minutes — 678 characters per minute. The first version of this constant guessed
 * 900, which made every duration the system reported about a third too short, and made the
 * Issue look like it was missing its target when it was already past it.
 *
 * This is the denominator behind every number in this file. If it is ever re-measured,
 * the bands below should be recomputed from it rather than adjusted by feel.
 */
export const THAI_CHARS_PER_MINUTE = 678;

export function targetReadMinutes(chars: number): number {
  return Math.round((chars / THAI_CHARS_PER_MINUTE) * 10) / 10;
}

/** Thai characters only — Latin technical terms are read faster and would skew the count. */
export function thaiCharCount(text: string | undefined): number {
  if (!text) return 0;
  return (text.match(/[\u0E00-\u0E7F]/g) ?? []).length;
}

type MeasurableSection = {
  empty: boolean;
  commentary?: string;
  items: { facts: unknown[]; analysisTh?: string }[];
};

export type IssueLength = {
  chars: number;
  minutes: number;
  band: Band;
  verdict: 'short' | 'in-band' | 'long';
  perItem: { chars: number; title: string }[];
};

export function measureIssue(issue: {
  intro?: string;
  categories: MeasurableSection[];
}): IssueLength {
  let chars = thaiCharCount(issue.intro);
  const perItem: { chars: number; title: string }[] = [];

  for (const section of issue.categories) {
    if (!section.empty) chars += thaiCharCount(section.commentary);
    for (const item of section.items) {
      const n = thaiCharCount(item.analysisTh);
      chars += n;
      perItem.push({ chars: n, title: String((item as { title?: string }).title ?? '') });
    }
  }

  const verdict: IssueLength['verdict'] =
    chars < ISSUE_CHARS.min ? 'short' : chars > ISSUE_CHARS.max ? 'long' : 'in-band';

  return { chars, minutes: targetReadMinutes(chars), band: ISSUE_CHARS, verdict, perItem };
}