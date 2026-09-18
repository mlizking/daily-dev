import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type HttpResponse = {
  url: string;
  status: number;
  contentType: string;
  body: string;
};

export type HttpClient = {
  get(url: string, opts?: { headers?: Record<string, string> }): Promise<HttpResponse>;
};

/**
 * `record` hits the network and writes what came back.
 * `replay` reads only from fixtures and throws if one is missing.
 * `live` hits the network and writes nothing.
 *
 * Fixtures are always captured from real responses. Hand-written payloads would
 * drift from reality, and the drift would be invisible exactly where it matters —
 * in the shapes we parse.
 */
export type HttpMode = 'record' | 'replay' | 'live';

export type HttpEvent = {
  type: 'get' | 'replay' | 'throttle' | 'error';
  url: string;
  status?: number;
  ms?: number;
  note?: string;
};

export function fixtureNameFor(url: string): string {
  return (
    url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+$/, '')
      .slice(0, 180) + '.json'
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createHttpClient(opts: {
  fixturesDir: string;
  mode: HttpMode;
  userAgent: string;
  /** Minimum gap between requests to the same host. Be a polite guest. */
  minGapMs?: number;
  /** Per-host overrides, for hosts that throttle harder than the rest. */
  hostGapMs?: Record<string, number>;
  onEvent?: (e: HttpEvent) => void;
}): HttpClient {
  const { fixturesDir, mode, userAgent, minGapMs = 1200, hostGapMs = {}, onEvent } = opts;
  const lastHit = new Map<string, number>();
  mkdirSync(fixturesDir, { recursive: true });

  async function politeWait(host: string) {
    const gap = hostGapMs[host] ?? minGapMs;
    const since = Date.now() - (lastHit.get(host) ?? 0);
    if (since < gap) {
      const wait = gap - since;
      onEvent?.({ type: 'throttle', url: host, note: `${wait}ms` });
      await sleep(wait);
    }
    lastHit.set(host, Date.now());
  }

  return {
    async get(url, reqOpts = {}) {
      const host = new URL(url).host;

      if (mode === 'replay') {
        const file = join(fixturesDir, fixtureNameFor(url));
        if (!existsSync(file)) {
          throw new Error(`No fixture for ${url} (expected ${file}). Run with --record first.`);
        }
        const saved = JSON.parse(readFileSync(file, 'utf8')) as HttpResponse;
        onEvent?.({ type: 'replay', url, status: saved.status });
        return saved;
      }

      // One retry on 429: a shared-host throttle is a normal answer, not a failure.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await politeWait(host);

        const started = Date.now();
        const res = await fetch(url, {
          headers: {
            'user-agent': userAgent,
            accept: '*/*',
            ...reqOpts.headers,
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(60_000),
        });
        const body = await res.text();
        const out: HttpResponse = {
          url: res.url || url,
          status: res.status,
          contentType: res.headers.get('content-type') ?? '',
          body,
        };
        onEvent?.({ type: 'get', url, status: out.status, ms: Date.now() - started });

        if (out.status === 429 && attempt === 1) {
          const retryAfter = Number(res.headers.get('retry-after') ?? 0);
          const wait = retryAfter > 0 ? retryAfter * 1000 : 5000;
          onEvent?.({ type: 'throttle', url, note: `429, retrying in ${wait}ms` });
          await sleep(wait);
          continue;
        }

        if (mode === 'record') {
          const file = join(fixturesDir, fixtureNameFor(url));
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, JSON.stringify(out, null, 2));
        }

        return out;
      }

      throw new Error(`Rate limited twice in a row: ${url}`);
    },
  };
}
