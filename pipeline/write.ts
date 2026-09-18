import { z } from 'zod';
import type { ChatMessage, ModelClient } from './model.ts';
import type { CategorySection, Issue } from './types.ts';
import { CATEGORIES } from '../src/lib/taxonomy.ts';

/**
 * The writer produces our words about the day, never the world's. Everything it is
 * allowed to know is in the Facts handed to it; everything it is asked for is either
 * our commentary (Thai) or the canonical Analysis (English).
 *
 * The instruction that matters most is the first one. A model asked to be interesting
 * will invent a version number, and a reader who repeats an invented version number
 * has been harmed by us.
 */

const ResponseSchema = z.object({
  intro: z.string(),
  categories: z.array(
    z.object({
      category: z.string(),
      commentary: z.string(),
    }),
  ),
  items: z.array(
    z.object({
      id: z.string(),
      analysisEn: z.string(),
      analysisTh: z.string(),
    }),
  ),
  /** The single most actionable Item, promoted to Technique of the Day, or null. */
  techniqueItemId: z.string().nullable().optional(),
});

export const WRITER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intro', 'categories', 'items'],
  properties: {
    intro: {
      type: 'string',
      description: 'Thai. Two to four sentences framing what actually changed today.',
    },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'commentary'],
        properties: {
          category: { type: 'string' },
          commentary: {
            type: 'string',
            description: 'Thai. One or two sentences for this section. Empty string if the section is empty.',
          },
        },
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'analysisEn', 'analysisTh'],
        properties: {
          id: { type: 'string' },
          analysisEn: { type: 'string', description: 'English. Two to three sentences. Why this matters.' },
          analysisTh: { type: 'string', description: 'Thai. Two to three sentences. Why this matters.' },
        },
      },
    },
    techniqueItemId: {
      type: ['string', 'null'],
      description: 'The id of the single most actionable item, or null.',
    },
  },
} as const;

const SYSTEM = `You write Daily Dev Brief, a Thai-language daily briefing for software developers.

Hard rules, in order of importance:

1. Use ONLY the facts given to you. Never state a version number, date, count, CVE id, vendor name, or capability that is not present in the facts you were given. If a detail is missing, write less. Do not fill gaps in.
2. Never contradict a fact. If a fact says a vulnerability is not patched, do not imply it is.
3. The reader must be able to act on what you write. Prefer the specifics that appear in the facts over generalities.
4. Reader-facing prose is Thai. The canonical analysis is English.
5. Plain Markdown only. No HTML tags. No code fences unless the facts themselves contain code.
6. No preamble. No "in this issue". No mention of being an AI, a model, or a pipeline.
7. Thai prose should read like a knowledgeable colleague explaining something, not like a translation. Keep the English technical terms Thai developers actually use — deploy, patch, release, breaking change, runtime.
8. Do not repeat the title back as the analysis. Say what it means and why it matters.`;

/** Models wrap JSON in prose or fences often enough that this is not an edge case. */
export function extractJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  const candidates = [trimmed];

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) candidates.push(fence[1].trim());

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  return undefined;
}

type WriterInput = {
  client: ModelClient;
  model: string;
  issue: Issue;
  /** Caps prompt size when a Category is unusually busy. */
  maxFactsPerItem?: number;
};

export type WriterOutcome = {
  degraded: number;
  techniqueItemId: string | null;
  attempts: number;
};

export async function writeIssue(input: WriterInput): Promise<WriterOutcome> {
  const { client, model, issue, maxFactsPerItem = 2 } = input;

  const payload = {
    date: issue.date,
    window: { from: issue.windowStart, to: issue.windowEnd },
    categories: issue.categories.map((s: CategorySection) => ({
      category: s.category,
      labelTh: CATEGORIES.find((c) => c.id === s.category)?.labelTh ?? s.category,
      empty: s.empty,
    })),
    items: issue.categories.flatMap((s) =>
      s.items.map((i) => ({
        id: i.id,
        category: i.category,
        title: i.title,
        url: i.url,
        severity: i.severity,
        primaryRecord: i.primaryRecord ?? null,
        facts: i.facts.slice(0, maxFactsPerItem).map((f) => f.text),
      })),
    ),
  };

  const baseMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        'Here is everything that passed the gate today, as JSON. Write the Issue.\n\n' +
        JSON.stringify(payload, null, 2),
    },
  ];

  // Reasoning models can spend most of their completion budget thinking, so a truncated
  // answer is a real possibility rather than an exotic one. One retry with a nudge, and
  // the failure that surfaces carries the reason it failed.
  let parsed: unknown;
  let attempts = 0;
  let lastFinish: string | undefined;
  let lastSnippet = '';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    const messages: ChatMessage[] =
      attempt === 1
        ? baseMessages
        : [
            ...baseMessages,
            {
              role: 'user',
              content:
                'Your previous answer was not valid JSON. Reply with a single JSON object only — ' +
                'no prose, no markdown fences, no trailing text.',
            },
          ];

    const reply = await client.complete({
      model,
      messages,
      jsonSchema: WRITER_JSON_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 16000,
      temperature: attempt === 1 ? 0.35 : 0.1,
    });

    lastFinish = reply.finishReason;
    lastSnippet = (reply.text || reply.reasoning || '').slice(0, 300);
    parsed = extractJson(reply.text);
    if (parsed !== undefined) break;
  }

  if (parsed === undefined) {
    throw new Error(
      `Writer returned text that is not JSON after ${attempts} attempts ` +
        `(finish_reason=${lastFinish ?? 'unknown'}). First 300 chars: ${JSON.stringify(lastSnippet)}`,
    );
  }

  const result = ResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Writer response failed its schema: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .join('; ')}`,
    );
  }

  const data = result.data;

  issue.intro = data.intro.trim();

  // Commentary is attached only to Categories the Issue actually has.
  const commentary = new Map(data.categories.map((c) => [c.category, c.commentary.trim()]));
  for (const section of issue.categories) {
    const text = commentary.get(section.category);
    if (text) section.commentary = text;
  }

  // An Item whose Analysis did not come back keeps its Facts and loses only its prose —
  // the Issue is still renderable and still true (ADR-0006).
  const analyses = new Map(data.items.map((i) => [i.id, i]));
  let degraded = 0;
  for (const section of issue.categories) {
    for (const item of section.items) {
      const a = analyses.get(item.id);
      if (!a || (!a.analysisEn.trim() && !a.analysisTh.trim())) {
        degraded += 1;
        continue;
      }
      item.analysisEn = a.analysisEn.trim();
      item.analysisTh = a.analysisTh.trim();
    }
  }

  const techniqueItemId = data.techniqueItemId ?? null;
  if (techniqueItemId) promoteToTechnique(issue, techniqueItemId);

  return { degraded, techniqueItemId, attempts };
}

/**
 * The one Category whose Analysis is prescriptive rather than descriptive. The writer
 * nominates a single Item and it *moves* here rather than being repeated, so the Issue
 * never says the same thing twice.
 */
export function promoteToTechnique(issue: Issue, itemId: string): boolean {
  let found: CategorySection['items'][number] | undefined;
  for (const section of issue.categories) {
    const idx = section.items.findIndex((i) => i.id === itemId);
    if (idx >= 0) {
      found = section.items[idx];
      section.items.splice(idx, 1);
      section.empty = section.items.length === 0;
      break;
    }
  }
  if (!found) return false;

  found.category = 'technique';
  const technique = issue.categories.find((s) => s.category === 'technique');
  if (!technique) return false;
  technique.items = [found];
  technique.empty = false;
  return true;
}
