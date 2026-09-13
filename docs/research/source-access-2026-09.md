# Source access research — verified 2026-09-13

Every endpoint below was exercised with a real HTTP request from a datacenter egress IP
(matching the GitHub Actions execution environment). Status codes are as observed.

## Verdict on Reddit

Reddit is **not** a dependable unattended source.

| Path | Result |
| --- | --- |
| `www.reddit.com/r/<sub>/new.json` | **BLOCKED** — 403 bot-wall HTML, regardless of User-Agent |
| OAuth app registration (`/prefs/apps`) | **CLOSED** — self-service ended ~Nov 2025; redirects to the Responsible Builder Policy page. Manual approval via Developer Support; hobby scripts are rarely approved. Approved free tier would be 100 QPM per client id |
| `www.reddit.com/r/<sub>/.rss` | **WORKS FREE** — 200 Atom, real-time, but throttled to ~1 request per 44–60 s per IP. 429 carries `x-ratelimit-remaining: 0.0` and `x-ratelimit-reset: ~44`, and **no `Retry-After`**. Sustained bursts escalate to a temporary 403 that clears after ~60 s |
| `www.reddit.com/r/<sub>/search.rss?q=&restrict_sr=1&sort=new` | **WORKS FREE** — same throttle |
| `www.reddit.com/r/all/.rss` | **WORKS FREE** — same throttle |
| **Arctic Shift** `arctic-shift.photon-reddit.com/api/posts/search?subreddit=<sub>&sort=desc&limit=100` | **WORKS FREE** — no auth, ~5 min freshness, no rate limit observed over a 5-request burst, `format=rss` supported. Docs explicitly disclaim uptime and performance guarantees |
| Arctic Shift comments | **WORKS FREE** — `…/api/comments/search`, ~4 min freshness |
| PullPush `api.pullpush.io` | **BLOCKED** — 429, body: *"This website does not provide free scraping resources for agents."* |
| Redlib / Libreddit public instances | **DEAD / bot-walled** — TLS errors, 403, 410, timeouts; safereddit.com serves an Anubis proof-of-work wall |
| Teddit | **DEAD** — TLS internal error |

Google News RSS is **not** a Reddit proxy: `site:reddit.com/r/<sub>` returns 0 items.

## Social sources, now that X has no free read tier

| Source | Endpoint | Verdict |
| --- | --- | --- |
| Bluesky `searchPosts` | `public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=` | **NEEDS AUTH** — 403 via BunnyCDN on `public.api.bsky.app`, 401 `AuthMissing` on `bsky.social`. A free account + app password works from datacenter IPs (3000 req/5 min per IP) |
| Bluesky `getAuthorFeed` | `public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=&limit=50` | **WORKS FREE** — 200 |
| Bluesky `searchActors` / `getProfile` / `getPosts` / `getListFeed` / `getPopularFeedGenerators` | `public.api.bsky.app/xrpc/…` | **WORKS FREE** — all 200 |
| Bluesky `getTimeline` | same host | **NEEDS AUTH** — 401 |
| Bluesky native RSS bridge | `bsky.app/profile/<handle>/rss` | **WORKS FREE** — 200 XML |
| Mastodon anonymous timeline | `hachyderm.io/api/v1/timelines/public`, `fosstodon.org/api/v1/timelines/tag/<tag>` | **WORKS FREE** — 300 req/5 min per IP |
| Mastodon, `mastodon.social` | same paths | **NEEDS AUTH** — 422, instance disabled anonymous timelines |
| Mastodon native RSS | `<instance>/@<user>.rss`, `<instance>/tags/<tag>.rss` | **WORKS FREE** |
| Lemmy | `lemmy.ml/api/v3/post/list?sort=New`, `/feeds/c/<community>.xml?sort=New` | **WORKS FREE** |
| Stack Exchange | `api.stackexchange.com/2.3/questions?...&site=stackoverflow` | **WORKS FREE** — 300 req/day without a key, 10 000 with a free key |
| YouTube channel | `youtube.com/feeds/videos.xml?channel_id=` | **WORKS FREE** |
| X / Twitter | `api.x.com/2/tweets/search/recent` | **PAID** — no usable free read tier |

## Fast "something shipped" signals — all free, all unauthenticated

| Ecosystem | Endpoint | Timestamp field |
| --- | --- | --- |
| GitHub release | `github.com/<owner>/<repo>/releases.atom` | entry `<updated>`, `<title>` = tag. Fresh in seconds |
| GitHub tag | `github.com/<owner>/<repo>/tags.atom` | entry `<updated>` |
| npm | `registry.npmjs.org/<pkg>` | `dist-tags.latest` → `time[<version>]` |
| npm popularity | `api.npmjs.org/downloads/point/last-week/<pkg>` | `downloads` |
| PyPI | `pypi.org/pypi/<pkg>/json` | `info.version` → `urls[0].upload_time_iso_8601` |
| Node.js | `nodejs.org/dist/index.json` | `[0].version`, `[0].date` |
| Go | `go.dev/dl/?mode=json` (no date) + `endoflife.date/api/go.json` | `latestReleaseDate` |
| Rust | `static.rust-lang.org/dist/channel-rust-stable.toml` | top-level `date` |
| Python | `endoflife.date/api/python.json` | `latestReleaseDate` |
| Terraform / HashiCorp | `api.releases.hashicorp.com/v1/releases/<product>?limit=N` | JSON with builds |

## Changelog and platform feeds — all free

`aws.amazon.com/about-aws/whats-new/recent/feed/` (minutes-fresh) ·
`microsoft.com/releasecommunications/api/v2/azure/rss` (**send no User-Agent** — it 403s with a browser UA;
the old `azurecomcdn.azureedge.net` feed is dead) ·
`cloud.google.com/feeds/gcp-release-notes.xml` · `kubernetes.io/feed.xml` ·
`github.blog/changelog/feed/` · `blog.cloudflare.com/rss/` ·
`vercel.com/changelog/rss` (3.5 MB, cache it).

`developers.cloudflare.com/changelog/rss/` is **404 — dead**; use the Cloudflare blog feed.

## Security feeds

| Source | Endpoint | Note |
| --- | --- | --- |
| CISA KEV | `cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` | ~1709 entries, `dateAdded` per CVE. Highest signal |
| GitHub Security Advisories | `api.github.com/advisories?sort=published&direction=desc` | 60 req/h unauth, 5000 with token |
| GHSA publish feed | `github.com/github/advisory-database/commits/main.atom` | Minutes after publish. `github.com/advisories.atom` is 406 — dead |
| OSV.dev | `api.osv.dev/v1/vulns/<ID>`, POST `/v1/query` | No auth |
| RustSec | `github.com/RustSec/advisory-db/commits/main.atom` | Minutes after merge |
| NVD 2.0 | `services.nvd.nist.gov/rest/json/cves/2.0` | 5 req/30 s unauth, 50/30 s with a free key |
| Microsoft MSRC | `api.msrc.microsoft.com/update-guide/rss` | Free |
| AWS Security Bulletins | `aws.amazon.com/security/security-bulletins/rss/feed/` | Free |
| Ubuntu Security Notices | `ubuntu.com/security/notices/rss.xml` | Free |
| Cisco PSIRT | `apix.cisco.com/security/advisories/v2/all` | **NEEDS AUTH** — OAuth. Legacy RSS feeds are 404 |
| Atlassian advisories | — | **DEAD** — no public feed found; use OSV/NVD for their CVEs |
| Debian tracker | `security-tracker.debian.org/tracker/data/json` | 74 MB — too heavy to poll daily; use DSA announce instead |

## Universal fallback for vendors with no feed

`news.google.com/rss/search?q=<query>` — **WORKS FREE**, no key, follow the 302.

- Items carry `title`, `pubDate` (RFC 822 GMT), `source` (publisher name), `link` (a
  `news.google.com/rss/articles/…` redirect), `guid`.
- Freshness measured at **0–2 hours**; one query returns ~100 items spanning 2–3 days
  (`when:1d` narrowed it to 100 items over ~17 hours).
- Supports `site:anthropic.com`, quoted phrases, and locale via `hl=th&gl=TH&ceid=TH:th`.
- Caveat: it is Google News' index, so a vendor-only post appears once Google has indexed it —
  near-instant for anything newsworthy, hours for low-profile posts.

RSSHub **has** Anthropic routes (`/anthropic/news`, `/engineering`, `/research`, `/red`), but the
public instance `rsshub.app` is Cloudflare-challenged (403, "testing only") — using them requires
self-hosting via Docker or Cloudflare Workers.

Other "no feed" cases confirmed unverifiable: `ai.meta.com/blog/rss/` → 400 (geofenced) ·
`uber.com/blog/engineering/feed/` → 406/404 · `venturebeat.com/category/ai/feed/` → 429.

## Real-time catch for vendor URLs

HN Algolia, domain-filtered — catches a vendor URL minutes after it is posted:

```
https://hn.algolia.com/api/v1/search_by_date?tags=story
  &query=anthropic.com&restrictSearchableAttributes=url
  &numericFilters=created_at_i%3E<epoch>&hitsPerPage=N
```

`numericFilters` **must** be URL-encoded — a raw `>` returns 400.