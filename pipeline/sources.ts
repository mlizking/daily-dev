import type { CategoryId, Tier } from './types.ts';

/**
 * A Source is data, not code. Adding one must not require touching the pipeline
 * (ADR-0011) — the only thing a new Source needs is a row here and an adapter
 * that already knows how to read its shape.
 *
 * Tier 1 is deliberately small: its failure fails the Run. Tier 2 is everything
 * whose failure is recorded and ignored.
 */
export type SourceDef = {
  id: string;
  name: string;
  tier: Tier;
  /** Which Category this Source normally feeds. Classification is a lookup, not an inference. */
  category: CategoryId;
  /** Key into the adapter table. */
  adapter: AdapterId;
  /** May contain `{target}` for multi-target Sources. */
  endpoint: string;
  /** For multi-target Sources: the repos, packages or channels to poll. */
  targets?: string[];
  /** How far back to look, for adapters that need a time filter. */
  lookbackHours?: number;
  config?: Record<string, unknown>;
};

export type AdapterId =
  | 'kev'
  | 'ghsa'
  | 'nvd'
  | 'hn'
  | 'feed'
  | 'node-index'
  | 'endoflife'
  | 'npm';

/** The closed set of origins allowed to justify a security claim (ADR-0008). */
export const PRIMARY_RECORD_SOURCES = new Set(['cisa-kev', 'ghsa', 'nvd', 'osv']);

/** Repos whose releases are worth knowing about the day they ship. */
const WATCHED_REPOS = [
  'nodejs/node',
  'microsoft/TypeScript',
  'vitejs/vite',
  'withastro/astro',
  'oven-sh/bun',
  'denoland/deno',
  'facebook/react',
  'vercel/next.js',
  'sveltejs/svelte',
  'tailwindlabs/tailwindcss',
  'kubernetes/kubernetes',
  'moby/moby',
  'golang/go',
  'rust-lang/rust',
  'python/cpython',
];

/**
 * AI tooling keeps its own Source rather than joining the list above, because a Source
 * carries one Category and these belong to ai-for-dev. Two Sources sharing an adapter is
 * cheaper than teaching the registry to vary a Category per target.
 */
const WATCHED_AI_REPOS = [
  'modelcontextprotocol/servers',
  'langchain-ai/langchain',
  'huggingface/transformers',
  'ollama/ollama',
  'vllm-project/vllm',
  'anthropics/anthropic-sdk-python',
  'openai/openai-node',
  'ggml-org/llama.cpp',
];

/** Packages whose publish is a signal worth catching the day it happens. */
const WATCHED_PACKAGES = [
  'astro',
  'vite',
  'typescript',
  'next',
  'react',
  'svelte',
  'wrangler',
  '@anthropic-ai/sdk',
  'openai',
  'tailwindcss',
];

export const SOURCES: SourceDef[] = [
  {
    id: 'cisa-kev',
    name: 'CISA Known Exploited Vulnerabilities',
    tier: 1,
    category: 'security',
    adapter: 'kev',
    endpoint: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
  },
  {
    id: 'ghsa',
    name: 'GitHub Security Advisories',
    tier: 1,
    category: 'security',
    adapter: 'ghsa',
    endpoint: 'https://api.github.com/advisories?per_page=100&sort=published&direction=desc',
  },
  {
    id: 'nvd',
    name: 'NVD CVE API 2.0',
    tier: 1,
    category: 'security',
    adapter: 'nvd',
    endpoint: 'https://services.nvd.nist.gov/rest/json/cves/2.0',
    lookbackHours: 24,
  },
  {
    id: 'hn',
    name: 'Hacker News (Algolia, by date)',
    tier: 1,
    category: 'industry-trends',
    adapter: 'hn',
    endpoint: 'https://hn.algolia.com/api/v1/search_by_date',
    lookbackHours: 24,
  },
  {
    id: 'aws-whats-new',
    name: "AWS What's New",
    tier: 1,
    category: 'backend-infra',
    adapter: 'feed',
    endpoint: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/',
  },
  {
    id: 'gcp-release-notes',
    name: 'Google Cloud release notes',
    tier: 1,
    category: 'backend-infra',
    adapter: 'feed',
    endpoint: 'https://cloud.google.com/feeds/gcp-release-notes.xml',
  },
  {
    id: 'cloudflare-blog',
    name: 'Cloudflare blog',
    tier: 1,
    category: 'web-frontend',
    adapter: 'feed',
    endpoint: 'https://blog.cloudflare.com/rss/',
  },
  {
    id: 'github-changelog',
    name: 'GitHub Changelog',
    tier: 1,
    category: 'industry-trends',
    adapter: 'feed',
    endpoint: 'https://github.blog/changelog/feed/',
  },
  {
    id: 'node-releases',
    name: 'Node.js releases',
    tier: 1,
    category: 'backend-infra',
    adapter: 'node-index',
    endpoint: 'https://nodejs.org/dist/index.json',
  },
  {
    id: 'python-releases',
    name: 'Python releases',
    tier: 1,
    category: 'backend-infra',
    adapter: 'endoflife',
    endpoint: 'https://endoflife.date/api/python.json',
  },
  {
    id: 'github-releases',
    name: 'GitHub releases (watched repos)',
    tier: 1,
    category: 'web-frontend',
    adapter: 'feed',
    endpoint: 'https://github.com/{target}/releases.atom',
    targets: WATCHED_REPOS,
  },
  {
    id: 'github-releases-ai',
    name: 'GitHub releases (watched AI repos)',
    tier: 1,
    category: 'ai-for-dev',
    adapter: 'feed',
    endpoint: 'https://github.com/{target}/releases.atom',
    targets: WATCHED_AI_REPOS,
  },
  {
    id: 'arxiv-cs-ai',
    name: 'arXiv cs.AI daily announcements',
    tier: 1,
    category: 'ai-for-dev',
    adapter: 'feed',
    endpoint: 'https://export.arxiv.org/rss/cs.AI',
  },
  {
    id: 'google-news-anthropic',
    name: 'Google News — anthropic.com',
    tier: 1,
    category: 'ai-for-dev',
    adapter: 'feed',
    // Google News has no feed for a vendor that publishes none, but it indexes the vendor.
    // Caveat: its links are news.google.com redirects, so an Item from here reaches the
    // article through Google rather than pointing at it directly.
    endpoint: 'https://news.google.com/rss/search?q=site:anthropic.com&hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'npm-packages',
    name: 'npm package publishes (watched packages)',
    tier: 1,
    category: 'web-frontend',
    adapter: 'npm',
    // The search endpoint returns the latest version and its publish date in about a
    // kilobyte. The full registry document for a package like vite is 39 MB, and we
    // would read two fields out of it.
    endpoint: 'https://registry.npmjs.org/-/v1/search?size=5&text={target}',
    targets: WATCHED_PACKAGES,
  },
];

export function tierOne(): SourceDef[] {
  return SOURCES.filter((s) => s.tier === 1);
}

export function isPrimaryRecordSource(sourceId: string): boolean {
  return PRIMARY_RECORD_SOURCES.has(sourceId);
}
