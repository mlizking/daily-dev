import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceReport, Tier } from './types.ts';

export type SourceState = {
  /** The newest Item timestamp already retrieved from this Source. */
  watermark?: string;
  lastRunAt?: string;
  lastStatus: 'ok' | 'failed' | 'empty';
  lastItems: number;
};

export type State = {
  sources: Record<string, SourceState>;
  /** The previous Run's recorded start. The Issue's window is never assumed (ADR-0009). */
  lastRunAt?: string;
};

export type SeenEntry = {
  id: string;
  seenAt: string;
  hash: string;
};

export const SEEN_RETENTION_DAYS = 90;

export function loadState(dir: string): State {
  const file = join(dir, 'sources.json');
  if (!existsSync(file)) return { sources: {} };
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as State;
  } catch {
    return { sources: {} };
  }
}

export function loadSeen(dir: string): SeenEntry[] {
  const file = join(dir, 'seen.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as SeenEntry];
      } catch {
        return [];
      }
    });
}

/**
 * Drop entries past the retention window so the repository does not grow without bound.
 * Ninety days is longer than any Source's lookback, so nothing is forgotten too early.
 */
export function pruneSeen(entries: SeenEntry[], now: Date, days = SEEN_RETENTION_DAYS): SeenEntry[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return entries.filter((e) => Date.parse(e.seenAt) >= cutoff);
}

/**
 * Written once, at the end of a Run. A Run that dies mid-flight must leave the
 * repository untouched, so nothing is written until the outcome is decided (ADR-0009).
 */
export function writeState(dir: string, state: State, seen: SeenEntry[]): void {
  mkdirSync(dir, { recursive: true });

  const sourcesFile = join(dir, 'sources.json');
  writeFileSync(`${sourcesFile}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${sourcesFile}.tmp`, sourcesFile);

  const seenFile = join(dir, 'seen.jsonl');
  const body = seen.map((e) => JSON.stringify(e)).join('\n');
  writeFileSync(`${seenFile}.tmp`, body ? `${body}\n` : '');
  renameSync(`${seenFile}.tmp`, seenFile);
}

export function reportToState(
  report: SourceReport,
  previous: SourceState | undefined,
  newestPublishedAt: string | undefined,
  now: Date,
): SourceState {
  const watermark =
    newestPublishedAt && previous?.watermark
      ? newestPublishedAt > previous.watermark
        ? newestPublishedAt
        : previous.watermark
      : (newestPublishedAt ?? previous?.watermark);

  return {
    watermark,
    lastRunAt: now.toISOString(),
    lastStatus: report.status,
    lastItems: report.items,
  };
}

export function tierOf(id: string, lookup: (id: string) => Tier | undefined): Tier {
  return lookup(id) ?? 2;
}
