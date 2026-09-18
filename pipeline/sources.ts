import type { CategoryId, Tier } from './types.ts';

/**
 * A Source is data, not code. Adding one must not require touching the pipeline (ADR-0011) —
 * the only thing a new Source needs is a row here and an adapter that already knows how to
 * read its shape.
 *
 * Tier 1 is deliberately small: its failure fails the Run. Tier 2 is everything whose failure
 * is recorded and ignored.
 *
 * `tags` are how cross-cutting topics reach the reader. The six Categories are the Issue's
 * fixed sections (ADR-0008) and must stay fixed, but a reader also wants to follow a thread —
 * CNCF, DevSecOps, AI technique — that runs across several of them. Tags carry that thread and
 * get their own pages, without adding a seventh section that would be empty on a quiet day.
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
  /** Cross-cutting topics this Source carries, for tag pages and for the Technique rule. */
  tags?: string[];
  /**
   * Whether this Source can supply Technique of the Day. False for release feeds and advisory
   * databases: "wrangler 4.135.0 was published" is news, not something a reader can do.
   */
  technique?: boolean;
  /**
   * Whether this Source publishes claims about specific vulnerabilities, as opposed to
   * guidance on doing security work. An advisory Source's every Item must carry a Primary
   * Record; a practice Source's Items need not, and could not — a blog post about threat
   * modelling has no CVE to cite. Without this distinction the rule dropped twenty DevSecOps
   * practice articles in a single Run, which is why the Category had nothing but advisories.
   */
  advisory?: boolean;
  /**
   * Whether this Source publishes guidance rather than claims, and is therefore exempt from the
   * Primary Record requirement unless it names a CVE.
   *
   * The exemption is an allowlist, and it is written as one deliberately. Under the first
   * version of the rule a Source was exempt unless it was marked advisory, so a new security
   * Source would have been trusted by default — and its failure mode would have been a
   * vulnerability claim reaching a reader unbacked, which is the one thing ADR-0008 exists to
   * prevent. Now the default is the strict one, and only a Source that has been read and marked
   * is exempt: a new Source fails visibly in the Run log instead of silently in front of a reader.
   */
  practice?: boolean;
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

/** Sources that assert facts about specific vulnerabilities, rather than how to do security work. */
export function advisorySources(): Set<string> {
  return new Set(SOURCES.filter((s) => s.advisory).map((s) => s.id));
}

/**
 * Sources whose Security Items are guidance rather than claims, and so are exempt from the
 * Primary Record requirement unless the Item names a CVE.
 *
 * Everything not in this set needs a Primary Record. The strict default is the point: an
 * unread Source must fail in the Run log, not in front of a reader.
 */
export function practiceSources(): Set<string> {
  return new Set(SOURCES.filter((s) => s.practice).map((s) => s.id));
}

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
  'golang/go',
  'rust-lang/rust',
  'python/cpython',
  'moby/moby',
];

/** Cloud-native projects. Kept as its own Source because a Source carries one Category. */
const WATCHED_CNCF_REPOS = [
  'kubernetes/kubernetes',
  'containerd/containerd',
  'argoproj/argo-cd',
  'envoyproxy/envoy',
  'cilium/cilium',
  'open-telemetry/opentelemetry-collector',
  'prometheus/prometheus',
  'grafana/grafana',
  'helm/helm',
  'cert-manager/cert-manager',
];

/** Supply-chain and pipeline-security tooling. */
const WATCHED_DEVSECOPS_REPOS = [
  'sigstore/sigstore',
  'sigstore/cosign',
  'slsa-framework/slsa',
  'aquasecurity/trivy',
  'ossf/scorecard',
  'hashicorp/vault',
];

/** AI tooling, which belongs to ai-for-dev rather than to web-frontend. */
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
  // ---------------------------------------------------------------- security
  {
    id: 'cisa-kev',
    name: 'CISA Known Exploited Vulnerabilities',
    tier: 1,
    category: 'security',
    adapter: 'kev',
    endpoint: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    advisory: true,
  },
  {
    id: 'ghsa',
    name: 'GitHub Security Advisories',
    tier: 1,
    category: 'security',
    adapter: 'ghsa',
    endpoint: 'https://api.github.com/advisories?per_page=100&sort=published&direction=desc',
    advisory: true,
  },
  {
    id: 'nvd',
    name: 'NVD CVE API 2.0',
    tier: 1,
    category: 'security',
    adapter: 'nvd',
    endpoint: 'https://services.nvd.nist.gov/rest/json/cves/2.0',
    lookbackHours: 24,
    advisory: true,
  },

  // --------------------------------------------------- security: DevSecOps
  {
    id: 'openssf-blog',
    name: 'OpenSSF blog',
    tier: 1,
    category: 'security',
    adapter: 'feed',
    endpoint: 'https://openssf.org/feed/',
    tags: ['devsecops', 'supply-chain'],
    technique: true,
    practice: true,
  },
  {
    id: 'github-security-blog',
    name: 'GitHub Security blog',
    tier: 1,
    category: 'security',
    adapter: 'feed',
    endpoint: 'https://github.blog/security/feed/',
    tags: ['devsecops'],
    technique: true,
    practice: true,
  },
  {
    id: 'devto-devsecops',
    name: 'dev.to #devsecops',
    tier: 1,
    category: 'security',
    adapter: 'feed',
    endpoint: 'https://dev.to/feed/tag/devsecops',
    tags: ['devsecops'],
    practice: true,
  },
  {
    id: 'devto-security',
    name: 'dev.to #security',
    tier: 1,
    category: 'security',
    adapter: 'feed',
    endpoint: 'https://dev.to/feed/tag/security',
    tags: ['devsecops'],
    practice: true,
  },
  {
    id: 'github-releases-devsecops',
    name: 'GitHub releases (supply-chain tooling)',
    tier: 1,
    category: 'security',
    adapter: 'feed',
    endpoint: 'https://github.com/{target}/releases.atom',
    targets: WATCHED_DEVSECOPS_REPOS,
    tags: ['devsecops', 'supply-chain'],
  },

  // ------------------------------------------------------------- ai-for-dev
  {
    id: 'github-releases-ai',
    name: 'GitHub releases (watched AI repos)',
    tier: 1,
    category: 'ai-for-dev',
    adapter: 'feed',
    endpoint: 'https://github.com/{target}/releases.atom',
    targets: WATCHED_AI_REPOS,
    tags: ['ai'],
  },
  {
    id: 'arxiv-cs-ai',
    name: 'arXiv cs.AI daily announcements',
    tier: 1,
    category: 'ai-for-dev',
    adapter: 'feed',
    endpoint: 'https://export.arxiv.org/rss/cs.AI',
    tags: ['ai'],
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
    tags: ['ai'],
    technique: true,
  },
  {
    id: 'simon-willison',
    name: "Simon Willison's Weblog",
    tier: 1,
    category: 'ai-for-dev',
    adapter: 'feed',
    endpoint: 'https://simonwillison.net/atom/everything/',
    tags: ['ai', 'ai-technique'],
    technique: true,
  },
  {
    id: 'tldr-ai',
    name: 'TLDR AI',
    tier: 1,
    category: 'ai-for-dev',
    adapter: 'feed',
    endpoint: 'https://tldr.tech/api/rss/ai',
    tags: ['ai', 'ai-technique'],
    technique: true,
  },
  {
    id: 'devto-ai',
    name: 'dev.to #ai',
    tier: 1,
    category: 'ai-for-dev',
    adapter: 'feed',
    endpoint: 'https://dev.to/feed/tag/ai',
    tags: ['ai', 'ai-technique'],
  },
  {
    id: 'devto-promptengineering',
    name: 'dev.to #promptengineering',
    tier: 1,
    category: 'ai-for-dev',
    adapter: 'feed',
    endpoint: 'https://dev.to/feed/tag/promptengineering',
    tags: ['ai', 'ai-technique'],
  },

  // ---------------------------------------------------------- backend-infra
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

  // ---------------------------------------------- backend-infra: cloud-native
  {
    id: 'cncf-blog',
    name: 'CNCF blog',
    tier: 1,
    category: 'backend-infra',
    adapter: 'feed',
    endpoint: 'https://www.cncf.io/feed/',
    tags: ['cncf', 'cloudnative'],
    technique: true,
  },
  {
    id: 'kubernetes-blog',
    name: 'Kubernetes blog',
    tier: 1,
    category: 'backend-infra',
    adapter: 'feed',
    endpoint: 'https://kubernetes.io/feed.xml',
    tags: ['cncf', 'kubernetes'],
    technique: true,
  },
  {
    id: 'devto-cloudnative',
    name: 'dev.to #cloudnative',
    tier: 1,
    category: 'backend-infra',
    adapter: 'feed',
    endpoint: 'https://dev.to/feed/tag/cloudnative',
    tags: ['cncf', 'cloudnative'],
  },
  {
    id: 'devto-kubernetes',
    name: 'dev.to #kubernetes',
    tier: 1,
    category: 'backend-infra',
    adapter: 'feed',
    endpoint: 'https://dev.to/feed/tag/kubernetes',
    tags: ['cncf', 'kubernetes'],
  },
  {
    id: 'devto-observability',
    name: 'dev.to #observability',
    tier: 1,
    category: 'backend-infra',
    adapter: 'feed',
    endpoint: 'https://dev.to/feed/tag/observability',
    tags: ['cncf', 'observability'],
  },
  {
    id: 'github-releases-cncf',
    name: 'GitHub releases (cloud-native projects)',
    tier: 1,
    category: 'backend-infra',
    adapter: 'feed',
    endpoint: 'https://github.com/{target}/releases.atom',
    targets: WATCHED_CNCF_REPOS,
    tags: ['cncf', 'cloudnative'],
  },

  // --------------------------------------------------------- web-frontend
  {
    id: 'cloudflare-blog',
    name: 'Cloudflare blog',
    tier: 1,
    category: 'web-frontend',
    adapter: 'feed',
    endpoint: 'https://blog.cloudflare.com/rss/',
    technique: true,
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

  // ------------------------------------------------------- industry-trends
  {
    id: 'hn',
    name: 'Hacker News (Algolia, by date)',
    tier: 1,
    category: 'industry-trends',
    adapter: 'hn',
    endpoint: 'https://hn.algolia.com/api/v1/search_by_date',
    lookbackHours: 24,
    technique: true,
  },
  {
    id: 'github-changelog',
    name: 'GitHub Changelog',
    tier: 1,
    category: 'industry-trends',
    adapter: 'feed',
    endpoint: 'https://github.blog/changelog/feed/',
  },
];

export function tierOne(): SourceDef[] {
  return SOURCES.filter((s) => s.tier === 1);
}

export function isPrimaryRecordSource(sourceId: string): boolean {
  return PRIMARY_RECORD_SOURCES.has(sourceId);
}

/** Sources that can supply Technique of the Day, by id. */
export function techniqueSources(): Set<string> {
  return new Set(SOURCES.filter((s) => s.technique).map((s) => s.id));
}

/** Every tag any Source declares, for the site's tag pages. */
export function allTags(): string[] {
  const tags = new Set<string>();
  for (const source of SOURCES) for (const tag of source.tags ?? []) tags.add(tag);
  return [...tags].sort();
}