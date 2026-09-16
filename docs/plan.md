# Plan

Ordered by dependency. Each phase is verifiable on its own — nothing here ends in "and then it should work".

## Done

- [x] `CONTEXT.md` glossary — 18 terms, with `_Avoid_` lists
- [x] ADRs 0001–0012
- [x] Research: source access, Cloudflare/Astro deploy facts, model costs — all from live requests, not summaries
- [x] Spec 0001, published as issue #1 with the `ready-for-agent` label
- [x] Astro 7 site shell: 6 Category pages, RSS, sitemap, 404, Pagefind index
- [x] Deployment proven end to end — CI builds and deploys, site live at `https://daily.mlizking.dev` with a Cloudflare-issued certificate

## Phase 1 — The Run's deterministic spine

The half of the Run that needs no model. Buildable and testable before any bake-off.

- [ ] **1.1** Injectable HTTP client: conditional GET, polite per-host throttling, and a **recording mode** that writes real payloads into `fixtures/` so tests never use hand-written responses
- [ ] **1.2** Source registry as data: id, Tier, Category affinity, adapter kind, endpoint, timestamp field. Adding a Source must not touch pipeline code
- [ ] **1.3** Tier 1 adapters (~12): CISA KEV, GHSA API, OSV, NVD 2.0, HN Algolia, GitHub `releases.atom`, npm registry times, PyPI upload times, AWS What's New, GCP release notes, Cloudflare blog, GitHub Changelog
- [ ] **1.4** Normaliser: raw payload → `Item`, populating **Facts verbatim** and provenance only. It must be structurally incapable of summarising
- [ ] **1.5** Primary Record allowlist in code — the closed set of origins allowed to justify a security claim
- [ ] **1.6** Seen detection: per-Source Watermark → seen-set → Cluster key (normalised URL + title shingles), all deterministic, with the content-hash re-entry rule
- [ ] **1.7** State store: `state/sources.json` + `state/seen.jsonl`, 90-day prune, **written only at the end of a Run**
- [ ] **1.8** Editorial Gate: fixed score-factor order, per-Category quota, security Candidates without a Primary Record dropped, empty Categories recorded rather than omitted
- [ ] **1.9** Renderer: Issue → committed Markdown (structure in frontmatter, Thai narrative in body), deterministic given its input
- [ ] **1.10** Run orchestrator returning `published | blind` — the single test seam
- [ ] **1.11** Timezone handling: an Issue's date is its Asia/Bangkok date, and its window is the two real Run timestamps

## Phase 2 — Models, and the bake-off

- [ ] **2.1** Injectable model client: two roles (triage, writer), schema-validated responses, per-Run token and cost accounting, per-key spend ceiling respected
- [ ] **2.2** Triage stage: batched classify / score / cluster tie-break on the cheap model; a response failing its schema drops the Item
- [ ] **2.3** Extractor: full text for selected Candidates only
- [ ] **2.4** Writer stage: canonical English Analysis per Item plus the Issue's Thai prose, constrained to Facts, plain Markdown only (no raw HTML — the site's Markdown pipeline refuses malformed HTML)
- [ ] **2.5** Capture a real fixture set, then run the **bake-off**: same Facts, same prompt, three writers
  - `qwen/qwen3.8-flash` — $0.37/month
  - `deepseek/deepseek-v4.1-flash` — $0.41/month
  - `google/gemini-2.5-flash` — $1.26/month
- [ ] **2.6** **You read the three drafts and pin the writer.** Nothing downstream depends on the answer, which is why it is here rather than first
- [ ] **2.7** Pin the triage model on a day's real Item volume, and record the measured Item count

## Phase 3 — Tests at the one seam

- [ ] **3.1** Harness: fixture directory + frozen clock + stub model client + seeded state, so every scenario is expressed by substituting those four and nothing else
- [ ] **3.2** The nine spec scenarios, as golden-file comparisons of the rendered Issue
- [ ] **3.3** CI job running the suite on every push

## Phase 4 — Draft review, then autonomy

- [ ] **4.1** Draft mode: a Run writes a Draft and stops, with a preview path
- [ ] **4.2** The approval mechanism — **open decision, see below**
- [ ] **4.3** Flip to publication once the Drafts have been trusted for a couple of weeks

## Phase 5 — Site completeness

- [ ] **5.1** Render Items on the Issue page from frontmatter: per-Category sections, verbatim Facts, Primary Record badge, source links
- [ ] **5.2** Tune Pagefind (`data-pagefind-body`) now that there are real pages to index
- [ ] **5.3** `workers_dev: false` once the custom domain has proven itself (ADR-0012)
- [ ] **5.4** Category pages listing Items, not just Issue dates

## Phase 6 — Breadth (Tier 2)

- [ ] **6.1** Arctic Shift (Reddit) adapter
- [ ] **6.2** Bluesky `getAuthorFeed` over a curated handle list
- [ ] **6.3** Mastodon (`hachyderm.io`, `fosstodon.org`), Lemmy, arXiv RSS, TLDR, dev.to, vendor engineering feeds
- [ ] **6.4** Google News RSS as the universal fallback for vendors with no feed, as an enhancement job that cannot fail the Run
- [ ] **6.5** The bespoke rule for **Technique of the Day** — the one Category whose Analysis is prescriptive rather than descriptive, and the one a model does badly without specific constraints

## Phase 7 — Operations

- [ ] **7.1** Insert the Run step into the scheduled workflow, guarded to `schedule`/`workflow_dispatch` so a content commit cannot re-run it
- [ ] **7.2** The Run commits its own content and pushes; verify the loop guard holds
- [ ] **7.3** Set a monthly credit limit on the OpenRouter key — a ceiling enforced in the account, not in our code
- [ ] **7.4** First real Issue, end to end, published to the live site
- [ ] **7.5** Decide whether a red Actions run is sufficient alerting or an email is needed
- [ ] **7.6** Corrections: the site renders them; detection stays manual. Confirm that is acceptable in practice

## Open decisions

1. **The approval mechanism (4.2).** Options: a manual `workflow_dispatch` with a `publish` input; a frontmatter flag flipped by a commit; an issue comment the Run reads. The third is the most natural given the tracker is already in use, and the most work.
2. **Technique of the Day (6.5).** Its shape is decided but not its rule. This is the Category most likely to be embarrassing if left to a generic prompt.
3. **Exact Tier 1 membership.** ADR-0011 fixes the *principle*; the twelve above are my proposal and are cheap to change while the registry is still data.
4. **Whether to keep the `*.workers.dev` URL** as a permanent second surface or switch it off (5.3).

## Measurements worth taking early

The spec asks for two, and both are guesses today: how many Items triage actually sees per day (it bounds cost), and how often the Gate leaves a Category empty (it tests whether six Categories is right).
