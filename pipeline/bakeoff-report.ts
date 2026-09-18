import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

/**
 * Renders every Issue produced by a bake-off into one page, so a human can read the
 * same Facts rendered by each writer and decide. Generated, never hand-written —
 * a comparison page that drifts from the artifacts is worse than no page.
 */

const dir = process.argv[2] ?? 'bakeoff';
const out = process.argv[3] ?? join(dir, 'compare.html');

type Analysis = { analysisTh?: string; analysisEn?: string };
type FrontmatterItem = {
  id: string;
  category: string;
  title: string;
  url: string;
  sourceId: string;
  severity?: string;
  score?: number;
  primaryRecord?: { id: string; url: string };
  facts?: { text: string; kind?: string; url?: string }[];
} & Analysis;

type Frontmatter = {
  date: string;
  writerModel: string;
  intro?: string;
  categories: { category: string; labelTh?: string; empty: boolean; commentary?: string }[];
  items: FrontmatterItem[];
};

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.md'))
  .sort();

const issues = files.map((f) => ({
  file: f,
  data: parse(readFileSync(join(dir, f), 'utf8').split('---')[1]) as Frontmatter,
}));

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const byId = new Map<string, Map<string, Analysis>>();
const order: FrontmatterItem[] = [];
for (const { data } of issues) {
  for (const item of data.items) {
    if (!byId.has(item.id)) {
      byId.set(item.id, new Map());
      order.push(item);
    }
    byId.get(item.id)!.set(data.writerModel, item);
  }
}

const writers = issues.map((i) => i.data.writerModel);
const missing = (model: string) => writers.filter((w) => w !== model);

const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>Bake-off — ${esc(issues[0]?.data.date ?? '')}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Noto Sans Thai', sans-serif; line-height: 1.65; color: var(--foreground, #16181d); }
  h1 { font-size: 1.3rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.05rem; margin: 2rem 0 .5rem; padding-bottom: .3rem; border-bottom: 1px solid var(--border, #e5e7eb); }
  .sub { color: var(--muted-foreground, #6b7280); font-size: .85rem; margin: 0 0 1.5rem; }
  .card { border: 1px solid var(--border, #e5e7eb); border-radius: 8px; padding: .9rem 1rem; margin: 0 0 1rem; }
  .badge { display: inline-block; font-size: .7rem; text-transform: uppercase; letter-spacing: .04em;
           background: var(--accent, #1f6feb); color: #fff; border-radius: 4px; padding: .1rem .4rem; margin-right: .4rem; }
  .badge.sev { background: #b42318; }
  .badge.derived { background: #6b7280; }
  .title { font-weight: 600; }
  .meta { font-size: .78rem; color: var(--muted-foreground, #6b7280); margin: .25rem 0 .6rem; }
  .facts { background: rgba(127,127,127,.07); border-radius: 6px; padding: .6rem .7rem; margin: .5rem 0; font-size: .88rem; }
  .facts p { margin: .2rem 0; }
  .writer { margin: .7rem 0 0; padding-left: .7rem; border-left: 3px solid var(--border, #e5e7eb); }
  .writer .name { font-size: .75rem; font-family: ui-monospace, monospace; color: var(--muted-foreground, #6b7280); }
  .writer .th { margin: .15rem 0; }
  .writer .en { font-size: .82rem; color: var(--muted-foreground, #6b7280); font-style: italic; }
  .failed { color: #b42318; font-style: italic; font-size: .85rem; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: .6rem; margin-bottom: 1.5rem; }
  .summary div { border: 1px solid var(--border, #e5e7eb); border-radius: 8px; padding: .6rem .8rem; font-size: .85rem; }
</style></head><body>
<h1>Bake-off — ${esc(issues[0]?.data.date ?? '')}</h1>
<p class="sub">${writers.length} writers, identical Facts, same prompt. ${order.length} items.</p>

<div class="summary">
${issues
  .map(({ data }) => {
    const withTh = data.items.filter((i) => i.analysisTh).length;
    return `<div><strong>${esc(data.writerModel)}</strong><br>analysis on ${withTh}/${data.items.length} items${
      withTh === 0 ? '<br><span class="failed">returned no prose at all</span>' : ''
    }</div>`;
  })
  .join('\n')}
</div>

<h2>ฉบับโดยรวม (intro)</h2>
${issues
  .map(
    ({ data }) =>
      `<div class="card"><div class="meta">${esc(data.writerModel)}</div>${
        data.intro ? `<p>${esc(data.intro)}</p>` : '<p class="failed">ไม่มี</p>'
      }</div>`,
  )
  .join('\n')}

<h2>คำเกริ่นแต่ละหมวด</h2>
${(issues[0]?.data.categories ?? [])
  .map(
    (cat) => `<div class="card"><div class="title">${esc(cat.labelTh ?? cat.category)}${
      cat.empty ? ' <span class="badge derived">ว่าง</span>' : ''
    }</div>
${issues
  .map(({ data }) => {
    const c = data.categories.find((x) => x.category === cat.category);
    return `<div class="writer"><div class="name">${esc(data.writerModel)}</div>${
      c?.commentary ? `<div class="th">${esc(c.commentary)}</div>` : '<div class="failed">ไม่มี</div>'
    }</div>`;
  })
  .join('\n')}</div>`,
  )
  .join('\n')}

<h2>รายชิ้น (เรียงตามหมวด)</h2>
${(issues[0]?.data.categories ?? [])
  .flatMap((cat) => order.filter((i) => i.category === cat.category))
  .map((item) => {
    const facts = item.facts ?? [];
    return `<div class="card">
  <div><span class="badge">${esc(item.category)}</span>${
    item.severity && item.severity !== 'unknown' ? `<span class="badge sev">${esc(item.severity)}</span>` : ''
  }<span class="title">${esc(item.title)}</span></div>
  <div class="meta">${esc(item.sourceId)} · score ${item.score ?? 0}${
    item.primaryRecord ? ` · primary record <a href="${esc(item.primaryRecord.url)}">${esc(item.primaryRecord.id)}</a>` : ''
  } · <a href="${esc(item.url)}">source</a></div>
  <div class="facts">
    ${facts
      .map(
        (f) =>
          `<p>${f.kind === 'derived' ? '<span class="badge derived">derived</span> ' : ''}${esc(f.text)}</p>`,
      )
      .join('\n')}
  </div>
  ${writers
    .map((w) => {
      const a = byId.get(item.id)?.get(w);
      const has = a?.analysisTh || a?.analysisEn;
      return `<div class="writer"><div class="name">${esc(w)}</div>${
        has
          ? `<div class="th">${esc(a?.analysisTh ?? '')}</div>${
              a?.analysisEn ? `<div class="en">${esc(a.analysisEn)}</div>` : ''
            }`
          : '<div class="failed">ไม่มีคำวิเคราะห์</div>'
      }</div>`;
    })
    .join('\n')}
</div>`;
  })
  .join('\n')}

<p class="sub">writers without prose: ${missing(writers[0]).length ? esc(missing(writers[0]).join(', ')) : '—'}</p>
</body></html>`;

writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes, ${issues.length} writers, ${order.length} items)`);
