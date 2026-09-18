import type { ChatMessage, ModelClient } from './model.ts';
import { ISSUE_CHARS, measureIssue, type IssueLength } from './budget.ts';
import type { Issue } from './types.ts';
import { writeIssue, nominateTechniqueByRule, type WriterOutcome } from './write.ts';

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

/**
 * The opposite of deepening, and just as necessary.
 *
 * Measured, the writer sometimes produces an Issue of 19,050 Thai characters — twenty-eight
 * minutes, against a promise of ten to twenty. A budget with no ceiling is not a budget, and
 * announcing a reading time the Issue does not have is the one kind of dishonesty this project
 * cannot afford. Trimming is asked for in the same terms as deepening: cut what fills space,
 * keep every claim.
 */
const TIGHTEN_SYSTEM = `You are shortening Items in an already-written Thai developer briefing that has run long.

Rules:
1. Keep every claim the existing Analysis makes, and keep every detail a reader needs in order to know whether they are affected and what to do. You are cutting, not rewriting.
2. Cut hedging, restatement of the Facts, restatement of the title, and any sentence whose only job is to fill space.
3. Hit the character target you are given. Going under it is a failure too — a reader who loses the detail that mattered has been failed just as surely as one who got bored.
4. Do not introduce anything that is not already in the Analysis or the Facts.
5. Plain Markdown. No HTML. Thai for analysisTh, English for analysisEn.`;

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
function pickTargets(
  issue: Issue,
  perItem: { chars: number; title: string }[],
  count: number,
  direction: 'shortest' | 'longest' = 'shortest',
): DeepenTarget[] {
  const flat = issue.categories.flatMap((s) => s.items);
  const scored = flat
    .map((item) => ({
      item,
      chars: measureIssue({ intro: '', categories: [{ empty: true, items: [item] }] }).chars,
    }))
    .filter((x) => (direction === 'shortest' ? x.chars < 700 : true))
    // An Item a reader must act on earns the extra words first — and keeps them last.
    .sort((a, b) => {
      const pa = a.item.sourceId === 'cisa-kev' || a.item.severity === 'critical' ? 0 : 1;
      const pb = b.item.sourceId === 'cisa-kev' || b.item.severity === 'critical' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return direction === 'shortest' ? a.chars - b.chars : b.chars - a.chars;
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
  tightenPasses: number;
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
  const { client, model, issue, batchSize = 6, maxPasses = 3, maxTightenPasses = 5 } = opts;
  const log = opts.log ?? (() => {});

  const writer = await writeIssue({ client, model, issue });
  let length = measureIssue(issue);
  log(`length after first write: ${length.chars} Thai chars (${length.verdict})`);

  // Technique must exist every day. The writer is asked first; the Rule is the floor.
  if (writer.techniqueItemId) {
    log(`technique: writer nominated ${writer.techniqueItemId}`);
  } else {
    const byRule = nominateTechniqueByRule(issue);
    log(
      byRule
        ? `technique: writer nominated nothing; Rule chose ${byRule.sourceId} (tags: ${byRule.tags.join(', ') || 'none'})`
        : 'technique: no eligible Item today, Category left empty',
    );
  }

  /**
   * One bounded revision pass. Deepening and tightening are the same operation pointed in
   * opposite directions, so they share everything but the instruction and which Items to pick.
   */
  async function runPass(options: {
    label: string;
    system: string;
    instruction: string;
    direction: 'shortest' | 'longest';
    number: number;
    count: number;
  }): Promise<{ applied: number; next: IssueLength } | null> {
    const targets = pickTargets(issue, length.perItem, options.count, options.direction);
    if (targets.length === 0) return null;
    log(`${options.label} pass ${options.number}: ${targets.length} Item(s)`);

    let parsed: unknown;
    try {
      const reply = await client.complete({
        model,
        messages: [
          { role: 'system', content: options.system },
          {
            role: 'user',
            content:
              `${options.instruction}\n\n` +
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
        ],
        jsonSchema: DEEPEN_JSON_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 16000,
        temperature: 0.4,
      });
      parsed = JSON.parse(reply.text);
    } catch (error) {
      log(
        `${options.label} pass ${options.number} failed: ` +
          `${error instanceof Error ? error.message : error}`,
      );
      return null;
    }

    const out = parsed as { items?: { id: string; analysisTh?: string; analysisEn?: string }[] };
    const byId = new Map((out.items ?? []).map((i) => [i.id, i]));

    let applied = 0;
    for (const section of issue.categories) {
      for (const item of section.items) {
        const patch = byId.get(item.id);
        if (!patch) continue;
        // A revision pass may only ever replace prose with prose. Anything that fails to
        // parse is ignored and the Item keeps the Analysis it already had.
        if (patch.analysisTh?.trim()) {
          item.analysisTh = patch.analysisTh.trim();
          applied += 1;
        }
        if (patch.analysisEn?.trim()) item.analysisEn = patch.analysisEn.trim();
      }
    }

    return { applied, next: measureIssue(issue) };
  }

  // Deepen only while the Issue is *below* the band, and in small batches. Aiming at the
  // middle of the band overshot it: an Issue already at 9,214 characters was pushed to 13,774
  // — past the ceiling and past a twenty-minute read — because the loop kept going towards a
  // target it had already passed. The band's floor is the condition; its ceiling is the
  // reason the batches are small.
  let deepenPasses = 0;
  while (length.chars < ISSUE_CHARS.min && deepenPasses < maxPasses) {
    const pass = await runPass({
      label: 'deepen',
      system: DEEPEN_SYSTEM,
      instruction: 'Deepen these Items. The Facts are everything you are allowed to know about each.',
      direction: 'shortest',
      number: deepenPasses + 1,
      count: batchSize,
    });
    if (!pass) break;
    deepenPasses += 1;
    log(`deepen pass ${deepenPasses}: ${pass.applied} updated, now ${pass.next.chars} Thai chars`);
    if (pass.next.chars <= length.chars) {
      log('deepen pass changed nothing measurable; stopping');
      length = pass.next;
      break;
    }
    length = pass.next;
  }

  // And tighten while it is above the band. A budget with no ceiling is not a budget: the
  // writer once produced 19,050 characters — twenty-eight minutes — against a promise of ten
  // to twenty, and announcing a reading time the Issue does not have is the one kind of
  // dishonesty this project cannot afford.
  let tightenPasses = 0;
  while (length.chars > ISSUE_CHARS.max && tightenPasses < maxTightenPasses) {
    // The instruction carries the measurement. A per-Item range does not move a model that
    // can see its Items are already inside that range: told "300 to 450 characters" about
    // Items that were already ~440, it cut 389 characters out of 8,827 across three passes.
    // What it cannot see is the total, which is the thing that is actually over.
    const itemCount = length.perItem.length || 1;
    const perItemTarget = Math.floor((ISSUE_CHARS.max * 0.85) / itemCount);
    const cut = Math.max(10, Math.round((1 - ISSUE_CHARS.max / length.chars) * 100));

    const pass = await runPass({
      label: 'tighten',
      system: TIGHTEN_SYSTEM,
      instruction:
        `This Issue is ${length.chars} Thai characters and must come in under ` +
        `${ISSUE_CHARS.max}. Cut roughly ${cut}% of the length across these Items — about ` +
        `${perItemTarget} Thai characters each, down from what they are now. Keep every claim; ` +
        `cut what fills space.`,
      direction: 'longest',
      number: tightenPasses + 1,
      // Every Item is a candidate when shortening, and the batch is large enough to reach
      // most of them: the Item count, not the prose, is what makes an Issue long.
      count: Math.max(batchSize, 12),
    });
    if (!pass) break;
    tightenPasses += 1;
    log(`tighten pass ${tightenPasses}: ${pass.applied} updated, now ${pass.next.chars} Thai chars`);
    if (pass.next.chars >= length.chars) {
      log('tighten pass changed nothing measurable; stopping');
      length = pass.next;
      break;
    }
    length = pass.next;
  }

  return { writer, deepenPasses, tightenPasses, length };
}
