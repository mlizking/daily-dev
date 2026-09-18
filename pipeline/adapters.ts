import { XMLParser } from 'fast-xml-parser';
import type { HttpClient } from './http.ts';
import type { RawRecord } from './normalize.ts';
import { stripTags, toIso } from './normalize.ts';
import type { AdapterId, SourceDef } from './sources.ts';

export type AdapterContext = {
  http: HttpClient;
  windowStart: Date;
  windowEnd: Date;
  now: Date;
};

export type Adapter = (source: SourceDef, ctx: AdapterContext) => Promise<RawRecord[]>;

/** Cap per Source: a flood from one feed must not crowd out everything else. */
const MAX_PER_SOURCE = 120;

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if ('#text' in v) return text(v['#text']);
  }
  return '';
}

function linkOf(entry: Record<string, unknown>): string {
  const raw = entry.link ?? entry.id;
  for (const candidate of asArray(raw)) {
    if (typeof candidate === 'string') return candidate;
    const href = (candidate as Record<string, unknown>)['@_href'];
    if (typeof href === 'string') return href;
  }
  return '';
}

function isoDate(value: unknown): string {
  return toIso(text(value) || (value as string));
}

function withinWindow(iso: string, ctx: AdapterContext): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  // A small grace on the start so a Run at 06:45 does not lose a 06:44 item.
  return t >= ctx.windowStart.getTime() - 6 * 3600 * 1000 && t <= ctx.windowEnd.getTime() + 3600 * 1000;
}

/** CISA Known Exploited Vulnerabilities — the highest-signal security Source there is. */
const kev: Adapter = async (source, ctx) => {
  const res = await ctx.http.get(source.endpoint);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const doc = JSON.parse(res.body) as {
    vulnerabilities?: Array<Record<string, string>>;
  };
  const out: RawRecord[] = [];
  for (const v of asArray(doc.vulnerabilities)) {
    const publishedAt = isoDate(v.dateAdded);
    if (!withinWindow(publishedAt, ctx)) continue;
    const cve = v.cveID ?? '';
    out.push({
      nativeId: cve,
      // The catalog entry itself, which is where these words come from.
      url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
      title: `${v.vendorProject ?? ''} ${v.product ?? ''}: ${v.vulnerabilityName ?? ''}`.trim(),
      description: v.shortDescription ?? '',
      publishedAt,
      primaryRecord: {
        id: cve,
        url: `https://nvd.nist.gov/vuln/detail/${cve}`,
      },
      severity: 'critical',
      category: 'security',
    });
  }
  return out;
};

/** GitHub Security Advisories — phrased advisories with published timestamps. */
const ghsa: Adapter = async (source, ctx) => {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await ctx.http.get(source.endpoint, { headers });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const list = JSON.parse(res.body) as Array<Record<string, unknown>>;
  const out: RawRecord[] = [];
  for (const a of asArray(list)) {
    const publishedAt = isoDate(a.published_at);
    if (!withinWindow(publishedAt, ctx)) continue;
    const ghsaId = String(a.ghsa_id ?? '');
    const htmlUrl = String(a.html_url ?? `https://github.com/advisories/${ghsaId}`);
    const cve = a.cve_id ? String(a.cve_id) : '';
    out.push({
      nativeId: ghsaId,
      url: htmlUrl,
      title: String(a.summary ?? ghsaId),
      description: String(a.description ?? ''),
      publishedAt,
      primaryRecord: { id: cve || ghsaId, url: htmlUrl },
      severity: (String(a.severity ?? 'unknown').toLowerCase() as RawRecord['severity']) ?? 'unknown',
      category: 'security',
    });
  }
  return out;
};

/** NVD CVE API 2.0 — rate-limited to 5 requests per 30s unauthenticated, so exactly one call. */
const nvd: Adapter = async (source, ctx) => {
  const fmt = (d: Date) => d.toISOString().replace('Z', '');
  const url =
    `${source.endpoint}?pubStartDate=${fmt(ctx.windowStart)}` +
    `&pubEndDate=${fmt(ctx.windowEnd)}&resultsPerPage=100`;

  const headers: Record<string, string> = {};
  if (process.env.NVD_API_KEY) headers.apiKey = process.env.NVD_API_KEY;

  const res = await ctx.http.get(url, { headers });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const doc = JSON.parse(res.body) as {
    vulnerabilities?: Array<{ cve?: Record<string, unknown> }>;
  };

  const out: RawRecord[] = [];
  for (const entry of asArray(doc.vulnerabilities)) {
    const cve = entry.cve ?? {};
    const id = String(cve.id ?? '');
    if (!id) continue;
    const descriptions = asArray(cve.descriptions as Array<Record<string, string>>);
    const en = descriptions.find((d) => d.lang === 'en')?.value ?? '';

    let severity: RawRecord['severity'] = 'unknown';
    const metrics = (cve.metrics ?? {}) as Record<string, unknown>;
    for (const key of ['cvssMetricV31', 'cvssMetricV30', 'cvssMetricV2']) {
      const first = asArray(metrics[key] as Array<Record<string, unknown>>)[0];
      const data = (first?.cvssData ?? {}) as Record<string, string>;
      const value = first?.baseSeverity ?? data.baseSeverity;
      if (value) {
        severity = String(value).toLowerCase() as RawRecord['severity'];
        break;
      }
    }

    const detailUrl = `https://nvd.nist.gov/vuln/detail/${id}`;
    out.push({
      nativeId: id,
      url: detailUrl,
      title: id,
      description: en,
      publishedAt: isoDate(cve.published),
      primaryRecord: { id, url: detailUrl },
      severity,
      category: 'security',
    });
  }
  return out;
};

/** Hacker News by date — the fastest community signal, and dedupe-ready by timestamp. */
const hn: Adapter = async (source, ctx) => {
  const since = Math.floor((ctx.windowStart.getTime() - 6 * 3600 * 1000) / 1000);
  const url =
    `${source.endpoint}?tags=story&hitsPerPage=100` +
    `&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}`;

  const res = await ctx.http.get(url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const doc = JSON.parse(res.body) as { hits?: Array<Record<string, unknown>> };
  const out: RawRecord[] = [];
  for (const hit of asArray(doc.hits)) {
    const objectId = String(hit.objectID ?? '');
    const title = String(hit.title ?? '');
    if (!objectId || !title) continue;
    const external = typeof hit.url === 'string' && hit.url ? hit.url : '';
    const points = Number(hit.points ?? 0);
    out.push({
      nativeId: objectId,
      url: external || `https://news.ycombinator.com/item?id=${objectId}`,
      title,
      // HN often has no body text. The title is the fact, and the title is verbatim.
      description: String(hit.story_text ?? ''),
      publishedAt: toIso(Number(hit.created_at_i ?? 0)),
      kind: 'verbatim',
      points,
      category: 'industry-trends',
    });
  }
  return out;
};

/** Generic RSS 2.0 / Atom reader. Handles both shapes because real feeds do not agree. */
const feed: Adapter = async (source, ctx) => {
  const urls = source.targets?.length
    ? source.targets.map((t) => source.endpoint.replace('{target}', t))
    : [source.endpoint];

  const out: RawRecord[] = [];
  for (const url of urls) {
    let body: string;
    try {
      const res = await ctx.http.get(url);
      if (res.status !== 200) continue;
      body = res.body;
    } catch {
      continue;
    }

    let doc: Record<string, unknown>;
    try {
      doc = xml.parse(body) as Record<string, unknown>;
    } catch {
      continue;
    }

    const channel = (doc.rss as Record<string, unknown> | undefined)?.channel as
      | Record<string, unknown>
      | undefined;
    const feedNode = doc.feed as Record<string, unknown> | undefined;

    const entries = channel
      ? asArray(channel.item as Array<Record<string, unknown>>)
      : asArray(feedNode?.entry as Array<Record<string, unknown>>);

    for (const entry of entries) {
      const title = stripTags(text(entry.title));
      const link = linkOf(entry);
      if (!title || !link) continue;

      const publishedAt = channel
        ? isoDate(entry.pubDate)
        : isoDate(entry.published ?? entry.updated);

      if (!withinWindow(publishedAt, ctx)) continue;

      const body =
        entry.description ?? entry.summary ?? entry.content ?? entry['content:encoded'] ?? '';
      out.push({
        nativeId: link,
        url: link,
        title,
        description: text(body),
        publishedAt,
        kind: 'verbatim',
      });
      if (out.length >= MAX_PER_SOURCE) return out;
    }
  }
  return out;
};

/** Node.js release index — structured, so the fact is derived from fields, not quoted. */
const nodeIndex: Adapter = async (source, ctx) => {
  const res = await ctx.http.get(source.endpoint);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const list = JSON.parse(res.body) as Array<Record<string, unknown>>;
  return asArray(list)
    .slice(0, 3)
    .map((entry) => {
      const version = String(entry.version ?? '');
      const date = String(entry.date ?? '');
      const lts = entry.lts ? ` (LTS ${entry.lts})` : '';
      return {
        nativeId: version,
        url: `https://github.com/nodejs/node/releases/tag/${version}`,
        title: `Node.js ${version}${lts}`,
        description: `Node.js ${version} released ${date}.`,
        publishedAt: isoDate(date),
        kind: 'derived' as const,
        category: 'backend-infra' as const,
      };
    })
    .filter((r) => withinWindow(r.publishedAt, ctx));
};

/** endoflife.date — release dates for runtimes, which publish no prose at all. */
const endoflife: Adapter = async (source, ctx) => {
  const res = await ctx.http.get(source.endpoint);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const cycles = JSON.parse(res.body) as Array<Record<string, unknown>>;

  const newest = asArray(cycles)
    .filter((c) => c.latestReleaseDate)
    .sort((a, b) => Date.parse(String(b.latestReleaseDate)) - Date.parse(String(a.latestReleaseDate)))
    .slice(0, 2);

  return newest
    .map((c) => {
      const cycle = String(c.cycle ?? '');
      const latest = String(c.latest ?? '');
      const date = String(c.latestReleaseDate ?? '');
      const eol = c.eol ? ` End of life: ${String(c.eol)}.` : '';
      return {
        nativeId: latest,
        url: `https://endoflife.date/${String(source.id).replace('-releases', '')}`,
        title: `${cycle} → ${latest}`,
        description: `Release ${latest} published ${date}.${eol}`,
        publishedAt: isoDate(date),
        kind: 'derived' as const,
        category: 'backend-infra' as const,
      };
    })
    .filter((r) => withinWindow(r.publishedAt, ctx));
};

/** npm registry metadata — a publish is the fastest "something shipped" signal there is. */
const npm: Adapter = async (source, ctx) => {
  const targets = source.targets ?? [];
  const out: RawRecord[] = [];
  for (const name of targets) {
    const url = source.endpoint.replace('{target}', encodeURIComponent(name));
    let body: string;
    try {
      const res = await ctx.http.get(url);
      if (res.status !== 200) continue;
      body = res.body;
    } catch {
      continue;
    }

    let doc: {
      objects?: Array<{ package?: { name?: string; version?: string; date?: string } }>;
    };
    try {
      doc = JSON.parse(body) as typeof doc;
    } catch {
      continue;
    }

    // The search endpoint is fuzzy, so the package must be confirmed by exact name.
    const hit = (doc.objects ?? [])
      .map((o) => o.package)
      .find((p) => p?.name === name && p.version && p.date);
    if (!hit?.version || !hit.date) continue;

    const publishedAt = isoDate(hit.date);
    if (!withinWindow(publishedAt, ctx)) continue;

    out.push({
      nativeId: `${name}@${hit.version}`,
      url: `https://www.npmjs.com/package/${name}/v/${hit.version}`,
      title: `${name} ${hit.version}`,
      description: `${name} version ${hit.version} was published to npm on ${publishedAt.slice(0, 10)}.`,
      publishedAt,
      kind: 'derived',
      category: 'web-frontend',
    });
  }
  return out;
};

const ADAPTERS: Record<AdapterId, Adapter> = {
  kev,
  ghsa,
  nvd,
  hn,
  feed,
  'node-index': nodeIndex,
  endoflife,
  npm,
};

export async function runSource(
  source: SourceDef,
  ctx: AdapterContext,
): Promise<{ records: RawRecord[]; error?: string }> {
  const adapter = ADAPTERS[source.adapter];
  if (!adapter) return { records: [], error: `no adapter named ${source.adapter}` };
  try {
    const records = await adapter(source, ctx);
    return { records: records.slice(0, MAX_PER_SOURCE) };
  } catch (error) {
    return { records: [], error: error instanceof Error ? error.message : String(error) };
  }
}
