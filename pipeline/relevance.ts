/**
 * Topical relevance, for community Sources only.
 *
 * Hacker News is a general aggregator: its front page on any given day contains wars,
 * elections and earthquakes. The Editorial Gate scores importance, not relevance, so a
 * popular off-topic story outscores a quiet on-topic one and lands in a developer's briefing.
 *
 * Judged on the title alone, never the URL. An earlier version passed the URL in as evidence
 * and every story with a link matched the term "http" inside its own scheme, so the filter
 * approved everything. A URL says where something is hosted, not what it is about.
 *
 * An allowlist rather than a blocklist: a blocklist has to anticipate every irrelevant topic
 * and fails silently when it meets a new one, while an allowlist fails visibly — a good story
 * gets dropped, which someone will notice and fix. Three rounds of exactly that happened
 * while writing this: "nuclear test" passed on the word *test*, then "GPUs: Rent vs. Buy" was
 * dropped because `\bgpu\b` cannot match a plural, then "Quokka — a self-hosting, deterministic
 * programming language" was dropped because the vocabulary had no word for *programming*.
 *
 * Applied only where a Source mixes topics. A vendor's release feed or an advisory database
 * needs no filter, and filtering them would risk discarding what they exist to carry.
 */

/** Unambiguous: these words do not appear in general news. One is enough. */
const SPECIFIC = [
  // languages and runtimes
  'javascript', 'typescript', 'python', 'rust', 'golang', 'go', 'kotlin', 'swift', 'ruby',
  'php', 'c++', 'c#', 'elixir', 'scala', 'haskell', 'zig', 'lua', 'nodejs', 'node.js',
  'deno', 'bun', 'wasm', 'webassembly', 'jvm', 'llvm', 'v8', 'spidermonkey',
  'compiler', 'transpiler', 'interpreter', 'parser', 'linter', 'typechecker', 'type checker',
  'type system', 'typesafe', 'type-safe', 'statically typed', 'garbage collect', 'tokenizer',
  'regex', 'monad', 'orm', 'graphql', 'grpc', 'websocket', 'json', 'yaml', 'xml', 'sql',
  'posix', 'unix', 'unicode', 'utf-8', 'api', 'sdk', 'cli', 'ide', 'vscode', 'neovim', 'vim',
  'emacs', 'npm', 'pnpm', 'yarn', 'cargo', 'pip', 'homebrew', 'git', 'github', 'gitlab',
  'k8s', 'kubernetes', 'docker', 'container', 'podman', 'postgres', 'mysql', 'sqlite',
  'redis', 'mongo', 'nginx', 'terraform', 'ansible', 'systemd', 'ebpf', 'qemu', 'kvm',
  'programming', 'coding', 'code review', 'refactor', 'monorepo', 'self-hosting',
  'leetcode', 'devops', 'sre', 'postmortem', 'changelog', 'semver', 'lockfile',
  // ai for developers
  'llm', 'pytorch', 'tensorflow', 'huggingface', 'openai', 'anthropic', 'claude', 'gemini',
  'ollama', 'vllm', 'quantiz', 'fine-tun', 'fine tun', 'pretrain', 'transformer',
  'embedding', 'vector database', 'gpu', 'cuda', 'tpu', 'llama.cpp', 'mcp',
  'model context protocol', 'copilot', 'cursor', 'flashattention', 'flash attention',
  'attention mechanism', 'rag pipeline', 'tokenizer', 'inference', 'checkpoint',
  'diffusion model', 'neural net', 'machine learning', 'reinforcement learning',
  // security
  'vulnerab', 'exploit', 'cve', 'encryption', 'oauth', 'jwt', 'malware', 'ransomware',
  'phishing', 'backdoor', 'xss', 'sqli', 'csrf', 'rce', 'supply chain', 'advisory',
  'zero-day', 'zero day', 'sandbox', 'privilege escalation', 'cybersecurity',
  'penetration test', 'threat model', 'cryptograph',
  // platforms and infrastructure
  'cloudflare', 'vercel', 'netlify', 'fly.io', 'aws', 'azure', 'gcp', 'linux', 'kernel',
  'http/2', 'http/3', 'httpd', 'tcp', 'udp', 'dns', 'tls', 'ssl', 'ssh', 'cdn',
  'distributed system', 'microservice', 'monolith', 'observability', 'prometheus', 'grafana',
  'kafka', 'rabbitmq', 'open source', 'data structure', 'ffi', 'serverless', 'edge comput',
  'load balanc', 'sharding', 'replication', 'failover', 'idempotent', 'webhook', 'cron job',
  'throughput', 'bandwidth', 'scaling', 'consensus algorithm', 'raft', 'paxos',
  'bytecode', 'virtual machine', 'hyperlink', 'css', 'html', 'dom', 'frontend', 'backend',
  'full-stack', 'fullstack', 'web framework', 'static site', 'accessib', 'oss',
  'data type', 'algebraic', 'open-source', 'open source', 'workflow engine',
];

/** Ambiguous: ordinary words that appear in dev writing and in general news. Two are needed. */
const GENERIC = [
  'test', 'model', 'release', 'server', 'client', 'version', 'security', 'agent', 'repo',
  'repository', 'commit', 'bug', 'patch', 'deploy', 'cache', 'queue', 'thread', 'memory',
  'latency', 'performance', 'benchmark', 'index', 'query', 'schema', 'migration', 'config',
  'build', 'pipeline', 'runtime', 'framework', 'library', 'package', 'debug', 'log',
  'tracing', 'proxy', 'router', 'storage', 'network', 'protocol', 'encoding', 'parsing',
  'algorithm', 'automation', 'script', 'terminal', 'shell', 'language', 'code', 'data',
  'system', 'design', 'engineer', 'tool', 'platform', 'architecture', 'database',
  'transaction', 'scaling', 'hosting', 'cloud', 'file', 'format', 'structure',
  'development', 'harness', 'workflow', 'similarity', 'geometry', 'project',
];

/**
 * Short terms need a trailing boundary or they match inside unrelated words — `\bgo` would
 * find *google* and *government*. Long terms take a plural instead, because `\bgpu\b` cannot
 * match "GPUs" and dropping a real story is the failure that hurts.
 */
function patternFor(term: string): string {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '[- ]?');
  return escaped.length <= 4 ? `\\b${escaped}s?\\b` : `\\b${escaped}s?`;
}

const SPECIFIC_RE = new RegExp(SPECIFIC.map(patternFor).join('|'), 'i');
const GENERIC_RES = GENERIC.map((term) => new RegExp(patternFor(term), 'i'));

export type Relevance = {
  relevant: boolean;
  why: string;
};

/** True when the title looks like something a developer would be reading it for. */
export function judgeRelevance(...parts: (string | undefined)[]): Relevance {
  const haystack = parts.filter(Boolean).join(' ').trim();
  if (!haystack) return { relevant: false, why: 'empty' };

  const specific = haystack.match(SPECIFIC_RE);
  if (specific) return { relevant: true, why: `specific:${specific[0].toLowerCase()}` };

  const hits = GENERIC_RES.filter((re) => re.test(haystack)).length;
  if (hits >= 2) return { relevant: true, why: `generic×${hits}` };

  return { relevant: false, why: hits === 1 ? 'only one generic term' : 'no dev term' };
}

export function isDevRelevant(...parts: (string | undefined)[]): boolean {
  return judgeRelevance(...parts).relevant;
}

export function vocabularySize(): { specific: number; generic: number } {
  return { specific: SPECIFIC.length, generic: GENERIC.length };
}
