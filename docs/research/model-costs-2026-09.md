# Model cost analysis — 2026-09-13

Prices read live from `https://openrouter.ai/api/v1/models` on 2026-09-13. OpenRouter
pay-as-you-go adds a **5.5% platform fee on credit purchases** and imposes **no request rate
limits on paid models** (the 50 requests/day cap applies to the free tier only).

## Volume assumptions

Per day: triage reads ~400 Items at roughly 120 tokens each (title, URL, short excerpt) and
emits compact structured output; the writer reads ~40 selected Items in full at roughly
1,200 tokens each and emits the Issue's prose plus the canonical English Analyses.

| Stage | Input/day | Output/day | Input/month | Output/month |
| --- | --- | --- | --- | --- |
| Triage (classify, score, cluster) | 48 000 | 6 000 | 1.44 M | 0.18 M |
| Writer (Issue prose + canonical Analyses) | 48 000 | 11 000 | 1.44 M | 0.33 M |
| **Total** | **96 000** | **17 000** | **2.88 M** | **0.51 M** |

Triage runs on batched calls (~50 Items per request), so a day needs on the order of 8–10
requests — comfortably inside even a free-model cap.

## Writer-role cost, if that model wrote every Issue

| $/month | in $/M | out $/M | Model |
| --- | --- | --- | --- |
| 0.13 | 0.060 | 0.120 | `deepseek/deepseek-v4-flash-0731` |
| 0.28 | 0.100 | 0.400 | `google/gemini-2.5-flash-lite` |
| 1.02 | 0.250 | 2.000 | `openai/gpt-5-mini` |
| 1.26 | 0.300 | 2.500 | `google/gemini-2.5-flash` |
| 1.69 | 0.600 | 2.500 | `moonshotai/kimi-k2-thinking` |
| 3.09 | 1.000 | 5.000 | `anthropic/claude-haiku-4.5` |
| 5.10 | 1.250 | 10.000 | `google/gemini-2.5-pro` |
| 5.13 | 1.500 | 9.000 | `google/gemini-3.5-flash` |
| 6.18 | 2.000 | 10.000 | `anthropic/claude-sonnet-5` |
| 7.14 | 1.750 | 14.000 | `openai/gpt-5.2` |

Triage-role cost is negligible at every price point: `deepseek/deepseek-v4-flash` costs
**$0.16/month** and `google/gemini-2.5-flash-lite` costs **$0.22/month**.

## Measured bake-off, 2026-09-18

Same Facts, same prompt, one Issue each, 12 Items across four Categories. The three
candidates were chosen by the user: `qwen/qwen3.8-flash`, `deepseek/deepseek-v4.1-flash`,
`google/gemini-2.5-flash`.

| Model | Wall clock | Items with prose | Cost for the Issue | Projected per month |
| --- | --- | --- | --- | --- |
| `qwen/qwen3.8-flash` | 219.4 s | 12 / 12 | $0.0078 | ~$0.23 |
| `deepseek/deepseek-v4.1-flash` | 118.9 s | **0 / 12** | $0.0028 | ~$0.08 |
| `google/gemini-2.5-flash` | **19.8 s** | 12 / 12 | $0.0086 | ~$0.26 |

`deepseek/deepseek-v4.1-flash` returned a schema-valid response containing no prose at all —
empty Analyses and empty Commentary — and the Run correctly reported 12 degraded Items rather
than publishing a plausible-looking empty Issue. It is eliminated.

A mechanical check for unsupported claims — every CVE identifier and version-like token in an
Analysis must appear verbatim in that Item's Facts — found **zero** unsupported tokens across
the 24 Analyses that were produced. The facts-only constraint held where it can be checked.

Two observations worth carrying forward:

- The spread in wall clock is 11×. The Run has a twenty-minute ceiling, so the slowest
  candidate leaves far less room for the retry the writer already needs.
- `qwen/qwen3.8-flash` wrote the empty-Category message itself ("ไม่มีข้อมูลใหม่ในหมวดนี้วันนี้").
  That phrasing must be deterministic — it is a statement about our Gate, not about the world —
  so the renderer should own it and the prompt should stop inviting the model to write it.

## Verdict

A two-tier Run costs **$0.40–7.20 per month** depending on the writer, so the stated $5–10
budget is not a constraint — it is roughly 3× to 20× the realistic need. The budget should be
spent on the writer, since that is the only stage whose quality a reader can perceive.

**Not verified:** which of these models writes good Thai. Price says nothing about that, and it
is the one input the budget cannot buy. A bake-off — generating the same Issue from the same
Facts with two or three candidate writers and reading them side by side — is the only way to
settle it, and it should happen before the writer model is pinned.

OpenRouter supports per-key credit limits (`limit`, `limit_reset`, `limit_remaining`), so the
monthly ceiling can be enforced in the account rather than in our code.