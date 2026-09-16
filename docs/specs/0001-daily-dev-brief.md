# Spec: Daily Dev Brief

Status: ready-for-agent

Vocabulary in this spec comes from `CONTEXT.md`; decisions referenced as ADR-NNNN live in `docs/adr/`.

## Problem Statement

A developer who wants to stay current has to read a dozen places every day — release feeds,
advisory databases, vendor engineering blogs, community aggregators — and the work is not reading,
it is deciding what is worth reading. Feeds are ordered by time, not by importance, so the reader
either spends an hour a day triaging or gives up and drifts out of touch. Security news is the
worst of it: a vulnerability that matters is buried among hundreds that do not, and a summary that
gets a detail wrong is worse than no summary at all.

## Solution

A public, automated daily publication in Thai — one **Issue** per day, readable in ten minutes,
served from `https://daily.mlizking.dev`. A scheduled **Run** polls a registry of **Sources**,
normalises what it finds into **Items**, decides through a deterministic **Editorial Gate** which
**Candidates** earn a place, and asks a model to write the prose for them. Every published claim
carries the origin's own wording as a **Fact** and a link to it. Each Issue is divided into six
fixed **Categories**, and a Category with nothing worth reporting says so rather than padding.
Published Issues never change; being wrong is handled by a **Correction** in the next Issue.

## User Stories

### The reader

1. As a Thai developer, I want one Issue per day that I can finish in ten minutes, so that I stay current without acquiring a feed-reading habit.
2. As a Thai developer, I want every claim to carry a link to its origin, so that I can verify it before repeating it to anyone.
3. As a Thai developer, I want to be told the exact time window an Issue covers, so that I know whether I am reading news or yesterday's news.
4. As a Thai developer, I want the Security Category to contain only vulnerabilities backed by an authoritative record, so that I can safely act on what it says.
5. As a Thai developer, I want a Category with nothing worth reporting to say so explicitly, so that an empty section reads as reassurance rather than as a broken page.
6. As a Thai developer, I want one Technique per Issue with a short code example, so that each Issue leaves me better at my job and not merely informed.
7. As a Thai developer, I want to browse past Issues by date, so that I can catch up after a week away.
8. As a Thai developer, I want to browse by Category, so that I can follow only the Security thread and ignore the rest.
9. As a Thai developer, I want to search the archive, so that I can find when a tool, a CVE, or a technique was first mentioned.
10. As a Thai developer, I want to subscribe over RSS, so that an Issue arrives without my remembering to visit.
11. As a Thai developer, I want the site to load quickly on a phone, so that I can read it on a commute.
12. As a Thai developer, I want a Correction to appear in the following Issue rather than silently altering the Issue I already cited, so that the archive stays quotable.
13. As a Thai developer, I want the site to tell me when the latest Issue is late, so that I do not mistake a broken pipeline for a quiet day.
14. As a Thai developer, I want to know who makes this and how, so that I can judge how much of it to trust.
15. As a Thai developer, I want to see the origin's original English wording beside the Thai prose, so that I can check nuance the translation may have flattened.

### The operator

16. As the operator, I want the Run to happen without me, so that the site stays current on the days I am busy.
17. As the operator, I want a failed Run to be visibly failed, so that I learn about it from a red job rather than from a reader.
18. As the operator, I want a Run that could not reach its Sources to publish nothing at all, so that a blind day never masquerades as a quiet one.
19. As the operator, I want a Run that reached its Sources but found nothing to still publish, so that the archive has no gaps I have to explain.
20. As the operator, I want to approve a Draft before it becomes public during the first weeks, so that the pipeline earns autonomy rather than being granted it.
21. As the operator, I want every Issue to be a commit, so that I can roll back a bad one and read the history of any claim.
22. As the operator, I want to answer "what did we report about X, and from where?" using the archive alone, so that the project never needs a database.
23. As the operator, I want adding a Source to be a data change rather than a code change, so that the registry can grow without the pipeline growing with it.
24. As the operator, I want a broken Tier 2 Source to be survivable, so that one dead feed cannot stop publication.
25. As the operator, I want the monthly model spend capped in the provider account, so that a bug cannot run up a bill.
26. As the operator, I want the whole pipeline to cost single-digit dollars per month, so that the project can run indefinitely without a decision to keep paying.
27. As the operator, I want to swap the writer model without reprocessing the archive, so that a cheaper or better model is a configuration change.
28. As the operator, I want re-running the same day to produce the same Issue, so that retrying after a failure is safe.
29. As the operator, I want a Run that dies mid-flight to leave no partial Issue behind, so that the site is never half-updated.
30. As the operator, I want the build and the deploy to happen in the same job that generated the Issue, so that a deployment failure has exactly one place to surface.
31. As the operator, I want the site served from the domain I already own, so that the URL is permanent and every citation keeps working.
32. As the operator, I want to know which model wrote a given Issue, so that a change in quality can be attributed to a change in version.
33. As the operator, I want the pipeline's state to be readable text, so that I debug by opening a file rather than by running queries.
34. As the operator, I want the Seen state pruned on a schedule, so that the repository does not grow without bound.
35. As the operator, I want to run the pipeline locally against recorded payloads, so that I can develop without hitting the network.
36. As the operator, I want the archive to keep building as it grows for years, so that the project has no hidden expiry date.

### Correctness

37. As the operator, I want an Issue to render completely from Facts alone, so that a failure in the Analysis stage degrades the prose rather than the truth.
38. As the operator, I want a security Candidate with no Primary Record dropped rather than downgraded, so that the rule is enforced by code and cannot be softened by rewording a prompt.
39. As the operator, I want a rumour to be visibly distinguishable from a confirmed advisory, so that a reader can calibrate how much to weigh it.
40. As the operator, I want one event reported by four Sources to appear once with all four links, so that the Issue is not four repetitions of a single story.
41. As the operator, I want an Item whose origin changed — an advisory that gained a patch, a CVE that gained an update — to be eligible again in a later Run, so that a correction upstream is not suppressed as already Seen.
42. As the operator, I want a model response that fails its schema to drop the Item, so that a malformed response is never published.
43. As the operator, I want the writer constrained to plain Markdown, so that generated HTML cannot break the site build.

## Implementation Decisions

### The law that shapes everything else

**An Issue must be renderable from Facts alone.** Facts are verbatim; Analysis is ours. The
renderer takes Facts as required input and Analysis as optional. This single rule is what makes
every published claim checkable, and it is why the writer model can be replaced at any time.

### Modules

A **Source registry** — declarative data: source id, Tier, which Categories it can feed, an adapter
kind, an endpoint, and how to read a timestamp out of the payload. Adding a Source must not require
touching pipeline code.

**Adapters** — a small set of generic fetchers (feed, JSON endpoint) plus bespoke ones for the
shapes that need them: the CISA KEV catalog, GitHub Security Advisories, OSV, NVD, the Hacker News
search API, npm and PyPI publish times, GitHub release feeds, and Google News RSS. Each returns
Items with provenance; none of them interprets.

**A normaliser** that turns a raw payload into an Item, populating Facts only. It never summarises.

**A Seen detector** — three deterministic steps in order: per-Source Watermark, seen-set membership,
then a Cluster key built from the normalised URL and title shingles. A model may arbitrate only when
the deterministic pass is ambiguous, and only among the highest-scoring Candidates (ADR-0007).

**A triage stage** — batched model calls that propose a Category, score components, and Cluster
merges. Its output is schema-validated; a failing response drops the Item rather than being repaired.

**An Editorial Gate** — a per-Category quota plus a deterministic score, with the ordering of
factors fixed: CISA KEV membership, advisory severity, Source Tier, community velocity, novelty
against what has been Seen. Security Candidates without a Primary Record are dropped. Categories
left empty are recorded as empty, not omitted (ADR-0008).

**An extractor** that fetches full text for selected Candidates only — the reason the Run is
affordable at all.

**A writer** that produces each Item's canonical English Analysis and the Issue's Thai prose, both
constrained to the Facts, emitting plain Markdown and no raw HTML.

**A renderer** that turns an Issue into a committed Markdown entry with frontmatter, deterministic
given its input.

**A state store** holding per-Source Watermarks and the seen-set, pruned to ninety days, written
only at the end of a Run.

**A Run orchestrator** — the single seam described under Testing Decisions. It takes a clock, a
Source registry, an HTTP client and a model client, and returns exactly one of two outcomes, a
distinction that encodes ADR-0010 in the type system:

```ts
type RunResult =
  | { outcome: "published"; issue: Issue; }
  | { outcome: "blind"; reason: string; }
```

**A static site** built from the committed Issues: a home page showing the latest Issue, a dated
permalink per Issue, a page per Category, an about page, an RSS feed, a sitemap, and a
build-time search index.

### Shapes

```ts
type Item = {
  id: string;                    // stable, derived from Source id + the origin's own id
  sourceId: string;
  url: string;
  title: string;                 // verbatim
  facts: { text: string; lang: "en" | "th"; }[];   // verbatim excerpts
  publishedAt: string;           // ISO 8601, from the origin
  fetchedAt: string;
  category?: Category;           // proposed by triage, decided by the Gate
  score?: number;                // deterministic, from the fixed factor order
  primaryRecord?: { id: string; url: string };     // required for any security claim
  clusterId?: string;
  seenAt?: string;
};

type Issue = {
  date: string;                  // the Issue's date, Asia/Bangkok
  windowStart: string;           // the previous Run's recorded start
  windowEnd: string;             // this Run's recorded start
  generatedAt: string;
  writerModel: string;           // ADR: attributable quality changes
  categories: { category: Category; items: Item[]; empty: boolean }[];
  corrections: string[];
};
```

### Operational decisions

The Run executes as a scheduled GitHub Actions job; the site is built and deployed by the same job
to Cloudflare Workers Static Assets, attached to `daily.mlizking.dev` as a Custom Domain (ADR-0003,
ADR-0012). Cron is set to an off-peak minute roughly fifteen minutes before the intended publish
time, and the Issue's window is recorded from the Run's own start rather than assumed.

The Run is idempotent and writes nothing until it has decided its outcome, so a crash mid-flight
leaves the repository untouched. A Run that found Candidates but none that passed the Gate publishes
an Issue that says so; a Run that could not retrieve Tier 1 Sources returns `blind` and the site
continues to show the previous Issue with a notice of its date.

Only Tier 1 Source failures affect the Run's outcome. Tier 2 failures are recorded in the Run's
output and otherwise ignored (ADR-0011).

Two model tiers: a cheap model for triage, a stronger one for writing, both addressed through a
single injectable client so that neither is hard-coded into a stage and both can be swapped without
touching the archive.

Reddit is read through a third-party archival API at Tier 2 rather than through the official API,
whose self-service registration has closed; Bluesky is read through unauthenticated author feeds
over a curated handle list rather than authenticated full-text search; Google News RSS is the
fallback for vendors that publish no feed of their own.

The writer emits plain Markdown because the site's Markdown pipeline rejects malformed HTML outright
rather than repairing it.

The site's search index is generated after the site build, and Thai text is not stemmed by it — so
Categories, Tiers, dates and tags carry more of the discovery burden than full-text search does.

## Testing Decisions

**What makes a good test here.** Tests assert on the Issue a Run produces — which Items appear, under
which Categories, citing which Records — and never on internal call order, on prompt wording, or on
model prose. Model prose is stubbed, so asserting on it would test the stub. A test that would still
pass if the Editorial Gate were inverted is not a test.

**The seam: the Run, and only the Run.** One seam covers fetch, normalise, Seen detection, triage,
Gate, extraction, writing and rendering. The orchestrator already takes its clock, its Source
registry, its HTTP client and its model client as inputs, so every scenario is expressible by
substituting those four — no bespoke test hooks and no partially-constructed pipeline. Fewer seams is
better; one is the target, and this is it.

Consequences of choosing the highest seam:

- The deterministic helpers — Cluster keys, score ordering, the ninety-day prune boundary — are
  covered indirectly. They earn their own tests only if a scenario genuinely cannot be constructed
  through the Run, and any such test must be justified in the commit that adds it.
- Scenarios are built as fixture sets: recorded Source payloads, a frozen clock, a stub model client
  that returns canned triage and writer responses, and a state store seeded to represent "yesterday".
- The HTTP client has a recording mode, so fixtures are captured from real Sources rather than
  hand-written. Hand-written payloads would let the fixtures drift from reality, and the drift would
  be invisible precisely where it matters — in the shapes we parse.

**Golden-file coverage.** The primary assertion is a byte-stable rendered Issue for a given fixture
set. This catches accidental changes to Category ordering, link formatting, Fact quoting and
frontmatter in one comparison, and makes review of a behaviour change a matter of reading a diff.

**Scenarios that must exist**, expressed through the seam:

1. A quiet day — Sources reachable, nothing passes the Gate — produces a published Issue whose
   Categories are all recorded empty.
2. A blind day — a Tier 1 Source unreachable — produces `blind` and writes nothing.
3. A broken Tier 2 Source produces a published Issue with no trace of the failure in the Issue
   itself.
4. A security Candidate with no Primary Record is dropped, and the Category is recorded empty if
   nothing else qualifies.
5. One event reported by four Sources becomes one Item citing four links.
6. An Item already Seen whose origin changed re-enters as a Candidate; one whose origin did not
   change does not.
7. Re-running with identical inputs produces an identical Issue.
8. A model response that fails schema validation drops its Item and leaves the rest of the Issue
   intact.
9. Behind the ninety-day boundary, seen-set entries past the prune window no longer suppress an Item.

**Site coverage.** One build-level smoke test: the archive builds, a dated permalink exists for the
latest Issue, and the RSS feed contains it. This exists because a broken build is the one failure the
pipeline cannot detect about itself.

## Out of Scope

- DNS, TLS and certificate setup for the custom domain — handled once in the Cloudflare dashboard.
- Publishing an English edition. The canonical English Analysis is stored from the first Issue so
  that an English edition becomes a rendering change later.
- Automatic publication without review. The first weeks produce Drafts for approval, and autonomy is
  granted by changing a setting once the Drafts have been trusted.
- Backfilling Issues for days before the first Run.
- Semantic or embedding-based search, and any search the build-time index cannot answer.
- Reddit's official API and X/Twitter as Sources.
- Analytics, newsletter delivery, comments, and any reader account.
- Automated Corrections. Detection is manual in this version; the mechanism for publishing one is in
  the Issue's shape.
- Notifications beyond a failed Actions run.
- A database, a cache, or any runtime the static site depends on.

## Further Notes

The writer model is not yet pinned. Price says nothing about whether a model writes good Thai, which
is the only quality the reader can perceive, so the first task is a bake-off: the same Facts, two or
three candidate writers, read side by side. Everything downstream is independent of the answer, which
is why the pipeline can be built before the choice is made.

Two measurements worth taking during the first fortnight, because both are guesses today: how many
Items the triage stage actually sees per day (it bounds the cost), and how often the Gate leaves a
Category empty (it bounds whether six Categories is the right number).

The archive has a long-term ceiling worth remembering: the host allows twenty thousand files per
deployment, which at one Issue per day is measured in years rather than months, but it is a ceiling
and not a promise. When build times become noticeable, the platform's incremental build support is
the lever, and it depends on restoring a build cache in CI.