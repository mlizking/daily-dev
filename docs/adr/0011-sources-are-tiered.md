# Sources are tiered, and only Tier 1 can fail a Run

Every Source is assigned Tier 1 (its failure fails the Run) or Tier 2 (its failure is recorded and ignored). Tier 1 stays deliberately small — roughly a dozen feeds whose absence would invalidate the Issue: CISA KEV, GitHub Security Advisories, OSV, NVD, Hacker News, GitHub release feeds, npm and PyPI publish times, AWS What's New, Google Cloud release notes, the Cloudflare blog, the GitHub changelog.

Reddit access goes through Arctic Shift at Tier 2 rather than the official API: self-service OAuth registration closed in late 2025, and the remaining `.rss` endpoints are throttled to roughly one request per minute per IP. Bluesky is consumed through unauthenticated `getAuthorFeed` over a curated handle list rather than authenticated full-text search, so no additional credential sits in CI. Google News RSS is the universal fallback for vendors without a feed, including Anthropic.

## Consequences

Adding a Source is cheap and carries no risk, so the registry can grow without the Run's reliability decaying. A Source that dies silently degrades one corner of the Issue instead of stopping publication.

**Amendment.** Tier 1 grew from a dozen Sources to thirty as the Issue's topics widened — cloud-native, DevSecOps, and using AI well each needed several feeds before they could appear on an ordinary day. The original small-list intent was about failure blast radius, and it is preserved by what "failure" means in the code: a Run goes blind only when *no* Tier 1 Source could be retrieved, not when one could not. Thirty reliable feeds are therefore not thirty ways to fail — they are thirty ways to keep publishing. What the growth does cost is time: a Run now spends a couple of minutes fetching, and every added multi-target Source adds another request per target.