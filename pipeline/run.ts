import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSource, type AdapterContext } from './adapters.ts';
import { measureIssue, type IssueLength } from './budget.ts';
import { composeIssue } from './compose.ts';
import { applyGate, selectedCount, type DroppedItem } from './gate.ts';
import type { HttpClient } from './http.ts';
import type { ModelClient } from './model.ts';
import { normalize } from './normalize.ts';
import { renderIssue, issuePath } from './render.ts';
import { clusterKeyOf, markSeen } from './seen.ts';
import { loadSeen, loadState, pruneSeen, reportToState, writeState } from './state.ts';
import { advisorySources, practiceSources } from './sources.ts';
import type { SourceDef } from './sources.ts';
import type { Item, Issue, RunResult, SourceReport, Tier } from './types.ts';
import { writeIssue } from './write.ts';

/**
 * The Run. This is the single seam the whole pipeline is tested at: it takes a clock,
 * a Source registry, an HTTP client and a model client, and every scenario is expressed
 * by substituting those four. No bespoke test hooks, no partially-constructed pipeline.
 */
export type RunOptions = {
  now: Date;
  sources: SourceDef[];
  http: HttpClient;
  model: ModelClient;
  writerModel: string;
  stateDir: string;
  /** Read state and decide the outcome, but write nothing. */
  dryRun?: boolean;
  /** Build the Issue skeleton and stop, so several writers can be compared on it. */
  skipWriter?: boolean;
  /** Write rendered Issues here instead of into content/issues. Used by the bake-off. */
  outputDir?: string;
  /** Labels the rendered file, so a bake-off produces one file per writer. */
  outputSuffix?: string;
  log?: (message: string) => void;
};

export type RunStats = {
  fetched: number;
  afterSeen: number;
  skippedAsSeen: number;
  reentered: number;
  merged: number;
  selected: number;
  dropped: DroppedItem[];
  degraded: number;
  spendUsd: number;
  calls: number;
  /** Measured against the budget, so drift in length is visible instead of assumed. */
  length: IssueLength;
};

export type RunOutcome = {
  result: RunResult;
  reports: SourceReport[];
  stats: RunStats;
  files: string[];
};

/** The Issue's date is its Asia/Bangkok date, because that is where its readers are. */
export function bangkokDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export async function runOnce(opts: RunOptions): Promise<RunOutcome> {
  const log = opts.log ?? (() => {});
  const state = loadState(opts.stateDir);
  const priorSeen = loadSeen(opts.stateDir);

  const windowEnd = opts.now;
  const windowStart = state.lastRunAt
    ? new Date(state.lastRunAt)
    : new Date(opts.now.getTime() - 24 * 3600 * 1000);

  const ctx: AdapterContext = {
    http: opts.http,
    windowStart,
    windowEnd,
    now: opts.now,
  };

  const reports: SourceReport[] = [];
  const allItems: Item[] = [];

  for (const source of opts.sources) {
    const started = Date.now();
    const { records, error, notes } = await runSource(source, ctx);
    const fetchedAt = opts.now.toISOString();
    const items = records.map((r) => normalize(source, r, fetchedAt));
    allItems.push(...items);

    reports.push({
      sourceId: source.id,
      tier: source.tier,
      status: error ? 'failed' : items.length === 0 ? 'empty' : 'ok',
      items: items.length,
      newItems: 0,
      error,
      ms: Date.now() - started,
      notes: notes.length ? notes : undefined,
    });
    log(
      `${error ? '✗' : items.length ? '•' : '·'} ${source.id.padEnd(18)} ` +
        `${error ? `failed: ${error}` : `${items.length} items`}`,
    );
    for (const note of notes) log(`    ↳ ${note}`);
  }

  const tier1 = reports.filter((r) => r.tier === 1);
  const tier1Succeeded = tier1.filter((r) => r.status !== 'failed');

  // A Run that could not reach its Tier 1 Sources publishes nothing at all: a blind day
  // must never masquerade as a quiet one (ADR-0009).
  if (tier1Succeeded.length === 0) {
    return {
      result: {
        outcome: 'blind',
        reason: 'no Tier 1 Source could be retrieved',
        failedSources: tier1.map((r) => r.sourceId),
      },
      reports,
      stats: emptyStats(),
      files: [],
    };
  }

  const seen = markSeen(allItems, priorSeen, opts.now);
  const tierById = new Map(opts.sources.map((s) => [s.id, s.tier as Tier]));
  const gate = applyGate(
    seen.candidates,
    (id) => tierById.get(id) ?? 2,
    windowEnd,
    practiceSources(),
    advisorySources(),
  );

  const issue: Issue = {
    date: bangkokDate(opts.now),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    generatedAt: opts.now.toISOString(),
    writerModel: opts.writerModel,
    categories: gate.sections,
    corrections: [],
  };

  const selected = selectedCount(gate.sections);
  log(`\nselected ${selected} of ${seen.candidates.length} candidates`);

  // Nothing passed the gate. That is a fact worth publishing, so an Issue still goes out.
  let length = measureIssue(issue);
  let degraded = 0;
  if (selected > 0 && !opts.skipWriter) {
    const composed = await composeIssue({ client: opts.model, model: opts.writerModel, issue, log });
    length = composed.length;
    degraded = composed.writer.degraded;
    log(
      `writer: ${composed.writer.degraded} empty, ${composed.writer.recovered} recovered, ` +
        `${composed.writer.droppedForNoAnalysis.length} dropped for no Analysis, ` +
        `${composed.writer.attempts} attempt(s), ${composed.deepenPasses} deepen pass(es), ` +
        `${composed.tightenPasses} tighten pass(es)`,
    );
  }

  log(
    `length: ${length.chars} Thai chars ≈ ${length.minutes} min ` +
      `(${length.verdict}; band ${length.band.min}–${length.band.max})`,
  );

  const files: string[] = [];
  if (!opts.dryRun) {
    const { filename, content } = renderIssue(issue);
    const dir = opts.outputDir ?? 'content/issues';
    mkdirSync(dir, { recursive: true });
    const name = opts.outputSuffix
      ? filename.replace(/\.md$/, `.${opts.outputSuffix}.md`)
      : filename;
    writeFileSync(join(dir, name), content);
    files.push(join(dir, name));

    const nextState = { ...state, lastRunAt: windowEnd.toISOString(), sources: { ...state.sources } };
    for (const report of reports) {
      const newest = allItems
        .filter((i) => i.sourceId === report.sourceId)
        .map((i) => i.publishedAt)
        .sort()
        .pop();
      nextState.sources[report.sourceId] = reportToState(
        report,
        state.sources[report.sourceId],
        newest,
        opts.now,
      );
    }

    const seenEntries = [
      ...pruneSeen(priorSeen, opts.now),
      ...gate.sections
        .flatMap((s) => s.items)
        .map((i) => ({ id: i.id, seenAt: opts.now.toISOString(), hash: i.contentHash ?? '' })),
      ...seen.candidates
        .filter((c) => !c.isNew)
        .map((c) => ({ id: c.id, seenAt: opts.now.toISOString(), hash: c.contentHash ?? '' })),
    ];
    writeState(opts.stateDir, nextState, dedupeSeen(seenEntries));
  }

  const spend = opts.model.spend();

  return {
    result: { outcome: 'published', issue },
    reports,
    stats: {
      fetched: allItems.length,
      afterSeen: seen.candidates.length,
      skippedAsSeen: seen.skipped,
      reentered: seen.reentered,
      merged: seen.merged,
      selected,
      dropped: gate.dropped,
      degraded,
      spendUsd: spend.usd,
      calls: spend.calls,
      length,
    },
    files,
  };
}

function emptyStats(): RunStats {
  return {
    fetched: 0,
    afterSeen: 0,
    skippedAsSeen: 0,
    reentered: 0,
    merged: 0,
    selected: 0,
    dropped: [],
    degraded: 0,
    spendUsd: 0,
    calls: 0,
    length: { chars: 0, minutes: 0, band: { min: 0, target: 0, max: 0 }, verdict: 'short', perItem: [] },
  };
}

function dedupeSeen(entries: { id: string; seenAt: string; hash: string }[]) {
  const byId = new Map<string, { id: string; seenAt: string; hash: string }>();
  for (const entry of entries) byId.set(entry.id, entry);
  return [...byId.values()];
}

export { clusterKeyOf, issuePath };
