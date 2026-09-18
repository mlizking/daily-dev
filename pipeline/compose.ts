import type { ChatMessage, ModelClient } from './model.ts';
import { ISSUE_CHARS, measureIssue, type IssueLength } from './budget.ts';
import type { Issue } from './types.ts';
import { writeIssue, type WriterOutcome } from './write.ts';

/**
 * Writing an Issue is not one call. The writer holds an implicit total length of its own,
 * and neither the per-Item ceiling nor the Category quota reliably moves it: measured across
 * three runs with identical input, the same prompt produced 6,300, 7,100 and 8,000 Thai
 * characters — a swing of twenty-six percent. Prompt wording cannot hold a budget against
 * that much noise, so the budget is held here, in code, by measuring and asking again.
 */

const DEEPEN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'analysisTh', 'analysisEn'],
        properties: {
          id: { type: 'string' },
          analysisTh: { type: 'string' },
          analysisEn: { type: 'string' },
        },
      },
    },
  },
} as const;

const DEEPEN_SYSTEM = `You are deepening Items in an already-written Thai developer briefing. Each Analysis below is too short for the reader to act on.

Rules:
1. Use ONLY the Facts given for that Item. Add nothing that is not in them. If a Fact is silent about something, say less about it — never guess.
2. Keep every claim the existing Analysis already makes. You are adding, not rewriting.
3. Add what the reader needs and does not yet have: who has to be running what to be affected, what actually happens to them, whether a fix, workaround or upgrade exists, and what they would notice.
4. Reach 500 to 800 Thai characters per Item. Under 400 is still too short.
5. Do not restate the title. Do not repeat the Facts verbatim. Never write a sentence whose only job is to fill space.
6. Plain Markdown. No HTML. Thai for analysisTh, English for analysisEn.`;

type DeepenTarget = {
  id: string;
  title: string;
  url: string;
  severity?: string;
  primaryRecord?: { id: string; url: string };
  facts: string[];
  analysisTh?: string;
};

/** The Items that most need depth: shortest first, and never one already at the ceiling. */
function pickTargets(issue: Issue, perItem: { chars: number; title: string }[], count: number): DeepenTarget[] {
  const flat = issue.categories.flatMap((s) => s.items);
  const scored = flat
    .map((item) => ({
      item,
      chars: measureIssue({ intro: '', categories: [{ empty: true, items: [item] }] }).chars,
    }))
    .filter((x) => x.chars < 700)
    // An Item a reader must act on earns the extra words first.
    .sort((a, b) => {
      const pa = a.item.sourceId === 'cisa-kev' || a.item.severity === 'critical' ? 0 : 1;
      const pb = b.item.sourceId === 'cisa-kev' || b.item.severity === 'critical' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.chars - b.chars;
    });

  void perItem;
  return scored.slice(0, count).map(({ item }) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    severity: item.severity,
    primaryRecord: item.primaryRecord,
    facts: item.facts.map((f) => f.text),
    analysisTh: item.analysisTh,
  }));
}

export type ComposeOutcome = {
  writer: WriterOutcome;
  deepenPasses: number;
  length: IssueLength;
};

export async function composeIssue(opts: {
  client: ModelClient;
  model: string;
  issue: Issue;
  /** How many Items to deepen per pass. */
  batchSize?: number;
  /** Bounded, so a stubborn model cannot spin the Run. */
  maxPasses?: number;
  log?: (message: string) => void;
}): Promise<ComposeOutcome> {
  const { client, model, issue, batchSize = 6, maxPasses = 2 } = opts;
  const log = opts.log ?? (() => {});

  const writer = await writeIssue({ client, model, issue });
  let length = measureIssue(issue);
  log(`length after first write: ${length.chars} Thai chars (${length.verdict})`);

  let deepenPasses = 0;
  while (length.chars < ISSUE_CHARS.min && deepenPasses < maxPasses) {
    const targets = pickTargets(issue, length.perItem, batchSize);
    if (targets.length === 0) break;

    deepenPasses += 1;
    log(`deepen pass ${deepenPasses}: ${targets.length} Item(s)`);

    const messages: ChatMessage[] = [
      { role: 'system', content: DEEPEN_SYSTEM },
      {
        role: 'user',
        content:
          'Deepen these Items. The Facts are everything you are allowed to know about each.\n\n' +
          JSON.stringify(
            targets.map((t) => ({
              id: t.id,
              title: t.title,
              url: t.url,
              severity: t.severity,
              primaryRecord: t.primaryRecord ?? null,
              facts: t.facts,
              currentAnalysisTh: t.analysisTh ?? '',
            })),
            null,
            2,
          ),
      },
    ];

    let parsed: unknown;
    try {
      const reply = await client.complete({
        model,
        messages,
        jsonSchema: DEEPEN_JSON_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 16000,
        temperature: 0.4,
      });
      parsed = JSON.parse(reply.text);
    } catch (error) {
      log(`deepen pass ${deepenPasses} failed: ${error instanceof Error ? error.message : error}`);
      break;
    }

    const out = parsed as { items?: { id: string; analysisTh?: string; analysisEn?: string }[] };
    const byId = new Map((out.items ?? []).map((i) => [i.id, i]));

    let applied = 0;
    for (const section of issue.categories) {
      for (const item of section.items) {
        const patch = byId.get(item.id);
        if (!patch) continue;
        // A deepening pass may only ever add prose. Anything that fails to parse is ignored
        // and the Item keeps the Analysis it already had.
        if (patch.analysisTh?.trim()) {
          item.analysisTh = patch.analysisTh.trim();
          applied += 1;
        }
        if (patch.analysisEn?.trim()) item.analysisEn = patch.analysisEn.trim();
      }
    }

    const next = measureIssue(issue);
    log(`deepen pass ${deepenPasses}: ${applied} Item(s) updated, now ${next.chars} Thai chars`);
    if (next.chars <= length.chars) {
      log('deepen pass added nothing measurable; stopping');
      length = next;
      break;
    }
    length = next;
  }

  return { writer, deepenPasses, length };
}
