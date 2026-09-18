# Daily Dev Brief

[ภาษาไทย](#ภาษาไทย) · [English](#english)

---

# ภาษาไทย

**สรุปรายวันสำหรับสาย dev — ไทยล้น อ่านจบใน 10–20 นาที** · [daily.mlizking.dev](https://daily.mlizking.dev)

ฉบับสรุปภาษาไทยรายวันว่าวงการ dev ขยับอะไรไปบ้าง: ช่องโหว่และคำเตือนความปลอดภัย, เครื่องมือ AI,
web platform, cloud และ infrastructure, ความเปลี่ยนแปลงของวงการ และเทคนิคหนึ่งอย่างที่เอาไปใช้ได้จริง
วันละหนึ่งฉบับ เผยแพร่ 07:00 น. ตามเวลาไทย

repo นี้คือระบบทั้งหมด — ไม่มี database ไม่มี queue ไม่มี server ที่ต้องดูแล
pipeline รันบน GitHub Actions เนื้อหาเป็น Markdown ที่ commit เข้า git
และเว็บเป็น static build ของ Astro ที่เสิร์ฟจาก Cloudflare Workers Static Assets

## การทำงานของ Run หนึ่งครั้ง

Run หนึ่งครั้งได้หนึ่งฉบับ เป็นเส้นตรง และทุกขั้นตอนเป็น deterministic จนกว่าจะถึง writer

| # | ขั้น | ตัดสินอะไร |
|---|---|---|
| 1 | **Fetch** | 30 sources ขนานกันต่อ host พร้อม throttle ต่อ host และ conditional GET |
| 2 | **Normalise** | payload ดิบ → `Item` โดย Facts ถูกคัดมาตรงคำจากต้นทาง ไม่มีการเรียบเรียงใหม่ตรงนี้ |
| 3 | **Seen** | watermark ต่อ source → Seen set → cluster key การตัดของซ้ำเป็น deterministic ก่อนจะแตะ model |
| 4 | **Gate** | ให้คะแนน แล้วตัดด้วยโควตาต่อหมวด ข้อกล่าวอ้างความปลอดภัยที่ไม่มี Primary Record ถูก**ตัดทิ้ง** ไม่ใช่ลดระดับ |
| 5 | **Write** | model เขียน Analysis ภาษาอังกฤษเป็น canonical ต่อ item แล้วจึงเขียนภาษาไทย |
| 6 | **Compose** | วัดความยาวฉบับแล้วปิดช่องว่าง: **deepen** เมื่อสั้นเกิน **tighten** เมื่อยาวเกิน |
| 7 | **Render** | `content/issues/<วันที่>.md` แล้ว commit, build, deploy |

Run เป็น **idempotent และ atomic**: สร้างลงไฟล์ชั่วคราวและ commit ครั้งเดียวตอนจบ
Run ที่ตายกลางทางจะไม่ทิ้งร่องรอยไว้ใน repository

## จังหวะรายวัน

```
23:45 UTC (06:45 น. ไทย)   cron ของ GitHub Actions ตื่น
                            fetch → gate → write → commit → build → deploy
07:00 น. ไทย                ฉบับใหม่อยู่บนเว็บ
```

ช่วงเวลาที่ครอบคลุมคือ **timestamp จริงของ Run สองครั้ง** (Run เมื่อวาน → Run วันนี้) ไม่ใช่วันตามปฏิทิน
ใน Run ครั้งแรกที่ยังไม่มี watermark มันจะถอยไป 24 ชั่วโมงก่อนหน้า จึงไม่มีช่วงว่างในวันแรก

`schedule` และ `workflow_dispatch` จะทำงาน Run ส่วน `push` **ไม่** — เพราะ push คือการแก้ของคน
หรือคือ commit เนื้อหาของ Run เอง และการรัน pipeline ซ้ำบนสองอย่างนั้นจะกลายเป็นวงวน

## โมเดลเนื้อหา

ทุก item แยก **Facts** ออกจาก **Analysis** และการแยกนี้ถูกบังคับ ไม่ใช่แค่แนะนำ

- **Facts** คัดจากต้นทางคำต่อคำ model แก้ไม่ได้
- **Analysis** เป็นคำของเรา: เกิดอะไรขึ้น กระทบใคร ควรทำอะไร เขียนภาษาอังกฤษก่อนเป็น canonical แล้วจึงเป็นไทย — ไทยไม่เคยแปลมาจากไทย

renderer ต้องสร้างฉบับจาก Facts เพียงอย่างเดียวได้ และ item ความปลอดภัยที่ไม่มี Primary Record
จะไม่มีทางถึงมือผู้อ่าน กฎเหล่านี้อยู่ในโค้ดไม่ใช่ใน prompt เพราะ prompt ถูกทำให้อ่อนลงได้ด้วยการเขียนใหม่
แต่ `throw` ทำไม่ได้

## ทำไมไม่มี database

state คือสองไฟล์ใน git: `state/sources.json` เก็บ watermark ต่อ source และ `state/seen.jsonl` เก็บ Seen set
(ตัดที่ 90 วัน) ทั้งคู่ถูก commit กลับตอนจบ Run

ทางเลือกนี้ซื้อ **replay** ให้เรา `fixtures/` เก็บ payload จริงของทุก source
ฉบับหนึ่งจึง replay แบบออฟไลน์ได้ในราว 130 มิลลิวินาที แทนที่จะเป็น HTTP สด 90 วินาที
ซึ่งเป็นสิ่งที่ทำให้ pipeline ทดสอบได้เลย และมันจับความพังแบบเงียบได้แล้วสองครั้งที่การรันสดจะกลบไว้

## โครงสร้าง repository

```
pipeline/          ตัว Run — หนึ่งโมดูลต่อหนึ่งขั้น ไม่มี framework
  sources.ts       registry ของ source: 30 แหล่ง, tags, tiers, advisory/practice
  adapters.ts      ตัวอ่าน payload หนึ่งตัวต่อหนึ่งรูปแบบ
  gate.ts          Editorial Gate: คะแนน, โควตา, ความหลากหลาย, กฎ Primary Record
  write.ts         prompt ของ writer และกฎของ Technique
  compose.ts       pass ของ deepen และ tighten
  budget.ts        งบความยาวในการอ่าน หน่วยเป็นอักษรไทย
  relevance.ts     allowlist ที่กันเสียงรบกวนจาก community ออก
content/issues/    ฉบับทั้งหมด เป็น Markdown ที่ commit แล้ว
state/             watermark และ Seen set — ต้องรอดจาก runner
fixtures/          payload จริงที่บันทึกไว้ สำหรับ replay
src/               เว็บ Astro
docs/adr/          บันทึกการตัดสินใจ 14 ฉบับ
docs/specs/        spec พร้อม user story และ scenario
CONTEXT.md         glossary — อ่านก่อนแก้อะไร
```

## รันในเครื่อง

Node 24 รัน pipeline ที่เป็น `.ts` ได้ตรงๆ — ไม่ต้องมีขั้นตอน build ไม่ต้องมี `tsx`

```bash
npm install

npm run dev        # dev server ของ Astro
npm run build      # astro build && pagefind --site dist
npm run check      # astro check

npm run run        # Run จริง (ต้องมี OPENROUTER_API_KEY ใน .env)
npm run run -- --replay                    # ออฟไลน์ จาก fixtures
npm run run -- --record                    # จริง แล้วบันทึก fixtures ใหม่
npm run run -- --bakeoff=<model>,<model>   # เทียบ writer model
```

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `OPENROUTER_API_KEY` | ทุก Run ที่เรียก writer |
| `GITHUB_TOKEN` | ไม่บังคับ — advisory API ของ GitHub จำกัดอัตราหนักถ้าไม่มี |
| `NVD_API_KEY` | ไม่บังคับ — NVD เป็น source ที่ช้าที่สุดและจำกัดอัตราหนักถ้าไม่มี |

ใส่ใน `.env` ซึ่งถูก gitignore ไว้ ใน CI ค่าเหล่านี้มาจาก repository secrets

## การเพิ่ม source

เพิ่มหนึ่งแถวใน `SOURCES` ที่ `pipeline/sources.ts` เท่านั้น — source คือข้อมูล ไม่ใช่โค้ด
ให้มันมี `tier`, `category`, `adapter`, `endpoint` และ `tags` ที่มันพาไป

มีสาม flag ที่ควรเข้าใจก่อนตั้ง:

- `advisory: true` — source นี้เผยแพร่ข้อกล่าวอ้างเรื่องช่องโหว่เฉพาะเจาะจง ทุก item ของมันต้องอ้าง Primary Record และอย่างมากสองชิ้นจะขึ้นในหมวดได้
- `practice: true` — source นี้เผยแพร่แนวปฏิบัติ ไม่ใช่ข้อกล่าวอ้าง item จึงได้รับการยกเว้นจากกฎ Primary Record การยกเว้นเป็น **allowlist**: source ที่ยังไม่มีใคร mark ต้องอ้าง Primary Record ดังนั้น source ที่ยังไม่มีใครอ่านจะล้มใน log ของ Run ไม่ใช่ล้มต่อหน้าผู้อ่าน
- `technique: true` — source นี้ให้ Technique of the Day ได้ ปิดไว้สำหรับ release feed และฐานข้อมูล advisory เพราะ "wrangler 4.135.0 ถูกปล่อยแล้ว" เป็นข่าว ไม่ใช่สิ่งที่ผู้อ่านเอาไปทำได้

**ทดสอบ endpoint จริงก่อนเขียนลงไฟล์** — feed ที่เราคิดว่าจะใช้ตายไปสี่อัน และอีกอันอยู่คนละ path จากที่ดูเหมือนจะเป็น source ที่ 404 คือ source ที่เงียบและไม่ได้อะไรเลย

## ค่าใช้จ่าย

วัดได้ราว **$0.019 ต่อฉบับ** — ประมาณ **$0.57 ต่อเดือน** บน `google/gemini-2.5-flash`
ซึ่ง bake-off เลือกไว้เหนือ `qwen3.8-flash` และ `deepseek-v4.1-flash` เพราะเขียนครบทุก item
ภาษาไทยลื่นกว่า และเร็วกว่า 11 เท่า (19.8 วินาที เทียบ 219.4 วินาที) ซึ่งมีนัยกับเพดาน 20 นาทีของ Run

hosting ฟรี: static asset บน Cloudflare Workers ไม่กินโควตา 100,000 request/วัน และ repo เป็น public จึงไม่จำกัดนาทีของ Actions

## ตัวเลือกบนหน้าเว็บ

- **โหมดสว่าง/มืด** — ตามระบบปฏิบัติการก่อน แล้วจำที่ผู้อ่านเลือก ค่าเริ่มต้นถูกใส่ก่อนวาดหน้าจอครั้งแรก จึงไม่มีการกระพริบ
- **ความกว้างเนื้อหา** — 44rem สำหรับอ่านยาว หรือเต็มจอสำหรับตารางและโค้ด
- **หน้าแรกคือฉบับล่าสุด** — permalink ของแต่ละวันยังอยู่ที่ `/<วันที่>/` และรายการทั้งหมดอยู่ที่ `/archive/`

## ที่เก็บการตัดสินใจ

อ่าน `CONTEXT.md` ก่อน — มันคือ glossary และมันนิยามคำที่เอกสารอื่นใช้ จากนั้น:

- `docs/specs/0001-daily-dev-brief.md` — spec: user story, scenario, Out of Scope
- `docs/adr/` — บันทึกการตัดสินใจ 14 ฉบับ แต่ละฉบับมีทางเลือกที่ถูกปฏิเสธและเหตุผล
- `docs/plan.md` — อะไรสร้างแล้ว เรียงตาม dependency

ADR คือส่วนที่น่าสนใจที่สุด มันบันทึกว่าทำไม Netlify ถูกตัดออกด้วยตัวเลข ทำไมความเร็วในการอ่านคือ 678 อักษรไทยต่อนาที และทำไมหมวดที่ว่างจึงถูกเผยแพร่ แต่ Run ที่มืดบอดไม่ถูก

## สถานะ

ทำงานได้ครบวงจรแล้ว: fetch, gate, write, render, commit, build, deploy

ยังไม่ได้ทำ เรียงตามความสำคัญ:

1. **test harness** — pipeline มี seam เดียว (`runOnce`) และมี 9 scenario จาก spec ที่รอกลายเป็น golden-file test pipeline ถูกแก้บ่อยและจะพังเงียบถ้าไม่มี นี่คือสิ่งถัดไป
2. **flow ของคำแก้ไข** — ADR-0010 บอกว่าข้อผิดพลาดอันตรายถูกแก้ในที่พร้อมบันทึกวันที่ ตัวโมเดลข้อมูลมี `corrections` และยังไม่มีอะไรเขียนลงไป
3. **`workers_dev: false`** — URL `*.workers.dev` ยังเปิดไว้เป็น sanity check ตอนนี้จึงมีสอง URL ที่เสิร์ฟเว็บเดียวกัน

---

# English

**A daily digest for developers — Thai-first, readable in 10–20 minutes** · [daily.mlizking.dev](https://daily.mlizking.dev)

A daily Thai-language digest of what moved in the developer world: security advisories,
AI tooling, the web platform, cloud and infrastructure, industry shifts, and one technique
worth adopting. One Issue a day, published at 07:00 Asia/Bangkok.

The repo is the whole system. There is no database, no queue, and no server to operate:
the pipeline runs on GitHub Actions, the content is Markdown committed to git, and the
site is a static Astro build served from Cloudflare Workers Static Assets.

## How a Run works

One Run produces one Issue. It is a straight line, and every stage is deterministic
until the writer is called.

| # | Stage | What it decides |
|---|---|---|
| 1 | **Fetch** | 30 Sources, in parallel per host, with a per-host throttle and conditional GET |
| 2 | **Normalise** | Raw payload → `Item`. Facts are quoted verbatim from the Source; nothing is paraphrased here |
| 3 | **Seen** | Per-Source watermark → Seen set → cluster key. Deduplication is deterministic, before any model is involved |
| 4 | **Gate** | Score, then a per-Category quota. A security claim without a Primary Record is dropped, not downgraded |
| 5 | **Write** | The model writes one canonical English Analysis per Item, then the Thai prose |
| 6 | **Compose** | Measures the Issue and closes the gap: deepen while it is short, tighten while it is long |
| 7 | **Render** | `content/issues/<date>.md`, then commit, build, deploy |

A Run is **idempotent and atomic**: it generates into a temp file and commits once, at the
end. A Run that dies mid-flight leaves the repository untouched.

## The daily rhythm

```
23:45 UTC  (06:45 Asia/Bangkok)   GitHub Actions cron fires
                                  fetch → gate → write → commit → build → deploy
07:00 Asia/Bangkok                the new Issue is live
```

The window is **the real timestamp of two Runs** (yesterday's run → today's run), not a
calendar day. On the very first Run, with no stored watermark, it falls back to the
preceding 24 hours, so there is no gap on day one.

`schedule` and `workflow_dispatch` perform the Run. A `push` does **not** — a push is
either a human change or the Run's own content commit, and re-running the pipeline on
either would loop.

## The content model

Every Item separates **Facts** from **Analysis**, and the distinction is enforced, not
suggested:

- **Facts** are quoted from the Source word for word. They cannot be edited by the model.
- **Analysis** is ours: what happened, who is affected, what to do. Written in English
  first as the canonical form, then in Thai. Thai is never translated from Thai.

The renderer must be able to produce an Issue from Facts alone, and a security Item with
no Primary Record never reaches a reader. The rules live in code rather than in a prompt,
because a prompt can be softened by rewording and a `throw` cannot.

## Why there is no database

State is two files in git: `state/sources.json` holds the per-Source watermark, and
`state/seen.jsonl` the Seen set (pruned at 90 days). Both are committed back at the end
of each Run.

That choice buys replay. `fixtures/` holds the real payload of every Source, so a Run can
be replayed offline in about 130 ms instead of 90 seconds of live HTTP — which is what
makes the pipeline testable at all. It has already caught two silent failures that a live
Run would have hidden.

## Repository layout

```
pipeline/          the Run — one module per stage, no framework
  sources.ts       the Source registry: 30 Sources, tags, tiers, advisory/practice
  adapters.ts      one reader per payload shape
  gate.ts          the Editorial Gate: score, quota, diversity, Primary Record rule
  write.ts         the writer prompts and the Technique rule
  compose.ts       the deepen and tighten passes
  budget.ts        the read-length budget, in Thai characters
  relevance.ts     the allowlist that keeps community noise out
content/issues/    the Issues, as committed Markdown
state/             watermark and Seen set — survives the runner
fixtures/          real recorded payloads, for replay
src/               the Astro site
docs/adr/          14 decision records
docs/specs/        the spec, with its user stories and scenarios
CONTEXT.md         the glossary. Read this before changing anything
```

## Local development

Node 24 runs the `.ts` pipeline directly — no build step, no `tsx`.

```bash
npm install

npm run dev        # Astro dev server
npm run build      # astro build && pagefind --site dist
npm run check      # astro check

npm run run        # a live Run (needs OPENROUTER_API_KEY in .env)
npm run run -- --replay                    # offline, from fixtures
npm run run -- --record                    # live, and record new fixtures
npm run run -- --bakeoff=<model>,<model>   # compare writer models
```

| Variable | Needed for |
|---|---|
| `OPENROUTER_API_KEY` | any Run that calls the writer |
| `GITHUB_TOKEN` | optional — GitHub's advisory API rate-limits hard without it |
| `NVD_API_KEY` | optional — NVD is the slowest Source and rate-limits hard without it |

Put them in `.env`, which is gitignored. In CI they come from repository secrets.

## Adding a Source

Add a row to `SOURCES` in `pipeline/sources.ts`. That is the whole change — a Source is
data, not code. Give it a `tier`, a `category`, an `adapter`, an `endpoint`, and any
`tags` it carries.

Three flags are worth understanding before you set them:

- `advisory: true` — this Source publishes claims about specific vulnerabilities. Its
  Items must all cite a Primary Record, and at most two of them can appear in a Category.
- `practice: true` — this Source publishes guidance, not claims, so its Items are exempt
  from the Primary Record rule. The exemption is an allowlist: a Source nobody has marked
  must cite a Primary Record, so an unread Source fails in the Run log rather than in
  front of a reader.
- `technique: true` — this Source can supply Technique of the Day. Leave it off for
  release feeds and advisory databases: "wrangler 4.135.0 was published" is news, not
  something a reader can do.

**Verify the endpoint before you write it down.** Four candidate feeds turned out to be
dead, and one was at a different path than it appeared to be. A Source that 404s is a
Source that silently contributes nothing.

## Cost

Measured at about **$0.019 per Issue** — roughly **$0.57 a month** — on
`google/gemini-2.5-flash`, which the bake-off pinned over `qwen3.8-flash` and
`deepseek-v4.1-flash` for completing every Item, writing smoother Thai, and being 11×
faster (19.8 s against 219.4 s), which matters against the Run's twenty-minute ceiling.

Hosting is free: static asset requests on Cloudflare Workers do not consume the
100,000-requests-a-day Worker quota, and the repository is public, so Actions minutes are
unmetered.

## Site controls

- **Light/dark mode** — follows the operating system first, then remembers what the reader
  chose. The preference is applied before the first paint, so there is no flash.
- **Content width** — 44rem for long reading, or full width for tables and code.
- **The home page is the latest Issue** — each day keeps its permalink at `/<date>/`, and
  the full list lives at `/archive/`.

## Where the decisions live

Read `CONTEXT.md` first — it is the glossary, and it defines the words the rest of these
documents use. Then:

- `docs/specs/0001-daily-dev-brief.md` — the spec: user stories, scenarios, Out of Scope
- `docs/adr/` — 14 decision records, each with the alternative it rejected and why
- `docs/plan.md` — what is built, in dependency order

The ADRs are the interesting part. They record why Netlify was rejected with numbers, why
the reading speed is 678 Thai characters a minute, and why an empty Category is published
but a blind Run is not.

## Status

Working end to end: fetch, gate, write, render, commit, build, deploy.

Not built yet, in the order it matters:

1. **The test harness.** The pipeline has a single seam (`runOnce`) and 9 spec scenarios
   waiting to become golden-file tests. The pipeline is edited often and will break
   silently without them. This is the next thing.
2. **The corrections flow.** ADR-0010 says a dangerous error is corrected in place with a
   dated note; the data model carries `corrections`, and nothing writes to it yet.
3. **`workers_dev: false`.** The `*.workers.dev` URL is still on as a sanity check, so
   two URLs currently serve the same site.
