/**
 * One injectable client for every model call, so neither role is hard-coded into a
 * stage and either can be swapped without touching the archive.
 */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ModelUsage = {
  promptTokens: number;
  completionTokens: number;
  /** USD, as reported by the provider when it reports one. */
  costUsd?: number;
};

export type ModelReply = {
  text: string;
  /** Reasoning models spend tokens thinking; empty content with reasoning is a real failure mode. */
  reasoning?: string;
  /** 'length' means the answer was cut off, which is why a parse failure must report it. */
  finishReason?: string;
  usage: ModelUsage;
  model: string;
};

export type ModelClient = {
  complete(opts: {
    model: string;
    messages: ChatMessage[];
    /** Ask for a JSON object conforming to this schema. */
    jsonSchema?: Record<string, unknown>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<ModelReply>;
  /** Running totals for the Run, so cost is measured rather than estimated. */
  spend(): { usd: number; promptTokens: number; completionTokens: number; calls: number };
};

/** Fallback prices per million tokens, used only when the provider reports no cost. */
const PRICE_PER_MILLION: Record<string, { in: number; out: number }> = {
  'qwen/qwen3.8-flash': { in: 0.15, out: 0.47 },
  'deepseek/deepseek-v4.1-flash': { in: 0.15, out: 0.6 },
  'google/gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'deepseek/deepseek-v4-flash': { in: 0.087, out: 0.174 },
};

export function createModelClient(opts: {
  apiKey: string;
  baseUrl?: string;
  referer?: string;
  title?: string;
  /** Wall-clock ceiling for one call. A hung call must not hang the Run. */
  timeoutMs?: number;
  onEvent?: (e: { type: 'call' | 'reply' | 'error'; model: string; ms?: number; note?: string }) => void;
}): ModelClient {
  const baseUrl = opts.baseUrl ?? 'https://openrouter.ai/api/v1';
  let usd = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let calls = 0;

  return {
    spend: () => ({ usd, promptTokens, completionTokens, calls }),

    async complete({ model, messages, jsonSchema, maxTokens = 4096, temperature = 0.3 }) {
      const started = Date.now();
      opts.onEvent?.({ type: 'call', model });

      const body: Record<string, unknown> = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        usage: { include: true },
      };
      if (jsonSchema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: { name: 'result', strict: true, schema: jsonSchema },
        };
      }

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          'content-type': 'application/json',
          ...(opts.referer ? { 'http-referer': opts.referer } : {}),
          ...(opts.title ? { 'x-title': opts.title } : {}),
        },
        body: JSON.stringify(body),
        // A hung model call must not hang the Run. The Run has a publish time.
        signal: AbortSignal.timeout(opts.timeoutMs ?? 240_000),
      });

      const raw = await res.text();
      if (!res.ok) {
        opts.onEvent?.({ type: 'error', model, note: `HTTP ${res.status}` });
        throw new Error(`Model call failed (${res.status}): ${raw.slice(0, 400)}`);
      }

      const doc = JSON.parse(raw) as {
        model?: string;
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string; reasoning?: string };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          cost?: number;
          completion_tokens_details?: { reasoning_tokens?: number };
        };
      };

      const choice = doc.choices?.[0];
      const text = choice?.message?.content ?? '';
      const usage: ModelUsage = {
        promptTokens: doc.usage?.prompt_tokens ?? 0,
        completionTokens: doc.usage?.completion_tokens ?? 0,
        costUsd: doc.usage?.cost,
      };

      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;
      calls += 1;

      if (typeof usage.costUsd === 'number') {
        usd += usage.costUsd;
      } else {
        const price = PRICE_PER_MILLION[model];
        if (price) {
          usd += (usage.promptTokens / 1e6) * price.in + (usage.completionTokens / 1e6) * price.out;
        }
      }

      opts.onEvent?.({ type: 'reply', model, ms: Date.now() - started });
      return {
        text,
        reasoning: choice?.message?.reasoning,
        finishReason: choice?.finish_reason,
        usage,
        model: doc.model ?? model,
      };
    },
  };
}
