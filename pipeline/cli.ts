import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeIssue } from './compose.ts';
import { createHttpClient, latestFixtureTime, type HttpMode } from './http.ts';
import { createModelClient } from './model.ts';
import { renderIssue } from './render.ts';
import { bangkokDate, runOnce } from './run.ts';
import { tierOne } from './sources.ts';
import type { Issue } from './types.ts';

const argv = process.argv.slice(2);
const has = (name: string) => argv.includes(`--${name}`);
// Overloaded so a caller that passes a fallback gets a `string` back rather than having to
// pretend the flag might have been absent.
function val(name: string, fallback: string): string;
function val(name: string): string | undefined;
function val(name: string, fallback?: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const dryRun = has('dry-run');
const record = has('record');
const replay = has('replay');
const bakeoff = val('bakeoff');
const outDir = val('out');

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('OPENROUTER_API_KEY is not set. Put it in .env or export it.');
  process.exit(2);
}

const mode: HttpMode = replay ? 'replay' : record ? 'record' : 'live';

// A replay runs at the clock its fixtures were captured at. Otherwise a Source whose URL
// embeds a time window would be filtered against today's window and silently yield nothing,
// which is exactly how NVD and Hacker News disappeared from the first replay.
const frozenClock = replay ? latestFixtureTime('fixtures') : undefined;
const now = frozenClock ?? new Date();

const http = createHttpClient({
  fixturesDir: 'fixtures',
  mode,
  userAgent: 'daily-dev-brief/0.1 (+https://daily.mlizking.dev/about/)',
  minGapMs: 1200,
  // npm's search endpoint answers 429 quickly when hammered, so it gets a wider gap.
  hostGapMs: { 'registry.npmjs.org': 3000 },
  onEvent: (e) => {
    if (e.type === 'get' && e.status && e.status >= 400) {
      console.error(`  ! HTTP ${e.status} ${e.url}`);
    }
    if (e.type === 'error') console.error(`  ! ${e.url} ${e.note ?? ''}`);
  },
});

const model = createModelClient({
  apiKey,
  referer: 'https://daily.mlizking.dev',
  title: 'Daily Dev Brief',
});

// Pinned by the bake-off of 2026-09-18: complete output, no fabricated tokens, and 11×
// faster than the alternative, which matters against the Run's twenty-minute ceiling.
const writerModel = val('model', process.env.WRITER_MODEL ?? 'google/gemini-2.5-flash');

console.log(`Daily Dev Brief — Run for ${bangkokDate(now)} (http=${mode}${dryRun ? ', dry-run' : ''})`);
console.log(`clock: ${now.toISOString()}${frozenClock ? ' (frozen from fixtures)' : ''}`);
console.log(`writer: ${bakeoff ?? writerModel}\n`);

const outcome = await runOnce({
  now,
  sources: tierOne(),
  http,
  model,
  writerModel,
  stateDir: 'state',
  dryRun: dryRun || Boolean(bakeoff),
  skipWriter: Boolean(bakeoff),
  log: (m) => console.log(m),
});

console.log(`\nresult: ${outcome.result.outcome}`);
for (const report of outcome.reports) {
  console.log(
    `  ${report.tier === 1 ? 'T1' : 'T2'} ${report.sourceId.padEnd(18)} ` +
      `${report.status.padEnd(7)} ${String(report.items).padStart(4)} items  ${report.ms}ms` +
      (report.error ? `  ${report.error}` : ''),
  );
}

const s = outcome.stats;
console.log(
  `\nfetched ${s.fetched} · seen-skipped ${s.skippedAsSeen} · re-entered ${s.reentered} · ` +
    `clustered-away ${s.merged} · candidates ${s.afterSeen} · selected ${s.selected}`,
);
if (s.dropped.length) {
  const byReason = new Map<string, number>();
  for (const d of s.dropped) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
  console.log('dropped:');
  for (const [reason, n] of byReason) console.log(`  ${n} × ${reason}`);
}

if (outcome.result.outcome === 'blind') {
  console.error(`\nBLIND: ${outcome.result.reason}`);
  console.error('Nothing written. The site keeps showing the previous Issue.');
  process.exit(1);
}

const issue: Issue = outcome.result.issue;
for (const section of issue.categories) {
  console.log(
    `  ${section.category.padEnd(18)} ${section.empty ? '(empty)' : `${section.items.length} item(s)`}` +
      (section.commentary ? '  +commentary' : ''),
  );
}

if (bakeoff) {
  const models = bakeoff.split(',').map((m) => m.trim()).filter(Boolean);
  mkdirSync('bakeoff', { recursive: true });
  console.log(`\nbake-off across ${models.length} writers, identical facts:\n`);
  for (const candidate of models) {
    const draft = structuredClone(issue) as Issue;
    draft.writerModel = candidate;
    const started = Date.now();
    try {
      const res = await composeIssue({
        client: model,
        model: candidate,
        issue: draft,
        log: (m) => console.log(`    ${m}`),
      });
      const { content } = renderIssue(draft);
      const slug = candidate.replace(/[^a-z0-9]+/gi, '-');
      const file = join('bakeoff', `${draft.date}.${slug}.md`);
      writeFileSync(file, content);
      const cost = model.spend().usd;
      // Measured here, not inside the Run: a bake-off deliberately skips the Run's writer,
      // so the Run's own measurement would read an Issue with no prose in it.
      const len = res.length;
      console.log(
        `  ✓ ${candidate.padEnd(32)} ${((Date.now() - started) / 1000).toFixed(1)}s  ` +
          `degraded=${res.writer.degraded} recovered=${res.writer.recovered} ` +
          `dropped=${res.writer.droppedForNoAnalysis.length} ` +
          `deepen=${res.deepenPasses} tighten=${res.tightenPasses}  ` +
          `${len.chars} Thai chars ≈ ${len.minutes} min (${len.verdict})  ` +
          `cumulative $${cost.toFixed(4)}  → ${file}`,
      );
    } catch (error) {
      console.log(`  ✗ ${candidate.padEnd(32)} ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`\nfiles in bakeoff/ — read them side by side and pick a writer.`);
} else {
  console.log(`\nwrote: ${outcome.files.join(', ') || '(nothing — dry run)'}`);
}

const spend = model.spend();
console.log(
  `\nmodel calls ${spend.calls} · prompt ${spend.promptTokens} · completion ${spend.completionTokens} · ` +
    `spend $${spend.usd.toFixed(4)}`,
);
