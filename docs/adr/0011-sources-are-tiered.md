# Sources are tiered, and only Tier 1 can fail a Run

Every Source is assigned Tier 1 (its failure fails the Run) or Tier 2 (its failure is recorded and ignored). Tier 1 stays deliberately small — roughly a dozen feeds whose absence would invalidate the Issue: CISA KEV, GitHub Security Advisories, OSV, NVD, Hacker News, GitHub release feeds, npm and PyPI publish times, AWS What's New, Google Cloud release notes, the Cloudflare blog, the GitHub changelog.

Reddit access goes through Arctic Shift at Tier 2 rather than the official API: self-service OAuth registration closed in late 2025, and the remaining `.rss` endpoints are throttled to roughly one request per minute per IP. Bluesky is consumed through unauthenticated `getAuthorFeed` over a curated handle list rather than authenticated full-text search, so no additional credential sits in CI. Google News RSS is the universal fallback for vendors without a feed, including Anthropic.

## Consequences

Adding a Source is cheap and carries no risk, so the registry can grow without the Run's reliability decaying. A Source that dies silently degrades one corner of the Issue instead of stopping publication.