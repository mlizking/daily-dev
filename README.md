# Daily Dev Brief

**สรุปรายวันสำหรับสาย dev — ไทยล้น อ่านจบใน 10–20 นาที** · [daily.mlizking.dev](https://daily.mlizking.dev)

A daily Thai-language digest of what moved in the developer world: security advisories,
AI tooling, the web platform, cloud and infrastructure, industry shifts, and one technique
worth adopting. One Issue a day, published at 07:00 Asia/Bangkok.

The repo is the whole system. There is no database, no queue, and no server to operate:
the pipeline runs on GitHub Actions, the content is Markdown committed to git, and the
site is a static Astro build served from Cloudflare Workers Static Assets.

---

## How a Run works

One Run produces one Issue. It is a straight line, and every stage is deterministic
until the writer is called.

| # | Stage | What it decides |
|---|---|---|
| 1 | **Fetch** | 30 Sources, in parallel per host, with a per-host throttle and conditional GET |
| 2 | **Normalise** | Raw payload → `Item`. Facts are quoted verbatim from the Source; nothing is paraphrased here |
| 3 | **Seen** | Per-Source watermark → Seen set → cluster key. Deduplication is deterministic, before any model is involved |
| 4 | **Gate** | Score, then a per-Category quota. A security claim without a Primary Record is dropped, not downgraded |
| 5 | **Write** | The model writes one canonical English Analysis per Item, then the Thai prose |
| 6 | **Compose** | Measures the Issue and closes the gap: deepen while it is short, tighten while it is long |
| 7 | **Render** | `content/issues/<date>.md`, then commit, build, deploy |

A Run is **idempotent and atomic**: it generates into a temp file and commits once, at the
end. A Run that dies mid-flight leaves the repository untouched.

## The daily rhythm

```
23:45 UTC  (06:45 Asia/Bangkok)   GitHub Actions cron fires
                                  fetch → gate → write → commit → build → deploy
07:00 Asia/Bangkok                the new Issue is live
```

The window is **the real timestamp of two Runs** (yesterday's run → today's run), not a
calendar day. On the very first Run, with no stored watermark, it falls back to the
preceding 24 hours, so there is no gap on day one.

`schedule` and `workflow_dispatch` perform the Run. A `push` does **not** — a push is
either a human change or the Run's own content commit, and re-running the pipeline on
either would loop.

## The content model

Every Item separates **Facts** from **Analysis**, and the distinction is enforced, not
suggested:

- **Facts** are quoted from the Source word for word. They cannot be edited by the model.
- **Analysis** is ours: what happened, who is affected, what to do. Written in English
  first as the canonical form, then in Thai. Thai is never translated from Thai.

The renderer must be able to produce an Issue from Facts alone, and a security Item with
no Primary Record never reaches a reader. The rules live in code rather than in a prompt,
because a prompt can be softened by rewording and a `throw` cannot.

## Why there is no database

State is two files in git: `state/sources.json` holds the per-Source watermark, and
`state/seen.jsonl` the Seen set (pruned at 90 days). Both are committed back at the end
of each Run.

That choice buys replay. `fixtures/` holds the real payload of every Source, so a Run can
be replayed offline in about 130 ms instead of 90 seconds of live HTTP — which is what
makes the pipeline testable at all. It has already caught two silent failures that a live
Run would have hidden.

## Repository layout

```
pipeline/          the Run — one module per stage, no framework
  sources.ts       the Source registry: 30 Sources, tags, tiers, advisory/practice
  adapters.ts      one reader per payload shape
  gate.ts          the Editorial Gate: score, quota, diversity, Primary Record rule
  write.ts         the writer prompts and the Technique rule
  compose.ts       the deepen and tighten passes
  budget.ts        the read-length budget, in Thai characters
  relevance.ts     the allowlist that keeps community noise out
content/issues/    the Issues, as committed Markdown
state/             watermark and Seen set — survives the runner
fixtures/          real recorded payloads, for replay
src/               the Astro site
docs/adr/          14 decision records
docs/specs/        the spec, with its user stories and scenarios
CONTEXT.md         the glossary. Read this before changing anything
```

## Local development

Node 24 runs the `.ts` pipeline directly — no build step, no `tsx`.

```bash
npm install

npm run dev        # Astro dev server
npm run build      # astro build && pagefind --site dist
npm run check      # astro check

npm run run        # a live Run (needs OPENROUTER_API_KEY in .env)
npm run run -- --replay                    # offline, from fixtures
npm run run -- --record                    # live, and record new fixtures
npm run run -- --bakeoff=<model>,<model>   # compare writer models
```

| Variable | Needed for |
|---|---|
| `OPENROUTER_API_KEY` | any Run that calls the writer |
| `GITHUB_TOKEN` | optional — GitHub's advisory API rate-limits hard without it |
| `NVD_API_KEY` | optional — NVD is the slowest Source and rate-limits hard without it |

Put them in `.env`, which is gitignored. In CI they come from repository secrets.

## Adding a Source

Add a row to `SOURCES` in `pipeline/sources.ts`. That is the whole change — a Source is
data, not code. Give it a `tier`, a `category`, an `adapter`, an `endpoint`, and any
`tags` it carries.

Three flags are worth understanding before you set them:

- `advisory: true` — this Source publishes claims about specific vulnerabilities. Its
  Items must all cite a Primary Record, and at most two of them can appear in a Category.
- `practice: true` — this Source publishes guidance, not claims, so its Items are exempt
  from the Primary Record rule. The exemption is an allowlist: a Source nobody has marked
  must cite a Primary Record, so an unread Source fails in the Run log rather than in
  front of a reader.
- `technique: true` — this Source can supply Technique of the Day. Leave it off for
  release feeds and advisory databases: "wrangler 4.135.0 was published" is news, not
  something a reader can do.

**Verify the endpoint before you write it down.** Four candidate feeds turned out to be
dead, and one was at a different path than it appeared to be. A Source that 404s is a
Source that silently contributes nothing.

## Cost

Measured at about **$0.019 per Issue** — roughly **$0.57 a month** — on
`google/gemini-2.5-flash`, which the bake-off pinned over `qwen3.8-flash` and
`deepseek-v4.1-flash` for completing every Item, writing smoother Thai, and being 11×
faster (19.8 s against 219.4 s), which matters against the Run's twenty-minute ceiling.

Hosting is free: static asset requests on Cloudflare Workers do not consume the
100,000-requests-a-day Worker quota, and the repository is public, so Actions minutes are
unmetered.

## Where the decisions live

Read `CONTEXT.md` first — it is the glossary, and it defines the words the rest of these
documents use. Then:

- `docs/specs/0001-daily-dev-brief.md` — the spec: user stories, scenarios, Out of Scope
- `docs/adr/` — 14 decision records, each with the alternative it rejected and why
- `docs/plan.md` — what is built, in dependency order

The ADRs are the interesting part. They record why Netlify was rejected with numbers, why
the reading speed is 678 Thai characters a minute, and why an empty Category is published
but a blind Run is not.

## Status

Working end to end: fetch, gate, write, render, commit, build, deploy.

Not built yet, in the order it matters:

1. **The test harness.** The pipeline has a single seam (`runOnce`) and 9 spec scenarios
   waiting to become golden-file tests. The pipeline is edited often and will break
   silently without them. This is the next thing.
2. **The corrections flow.** ADR-0010 says a dangerous error is corrected in place with a
   dated note; the data model carries `corrections`, and nothing writes to it yet.
3. **`workers_dev: false`.** The `*.workers.dev` URL is still on as a sanity check, so
   two URLs currently serve the same site.
