# Content is committed Markdown; the repository is the database

Issue text is written as Markdown files into the repository and built statically, with pipeline state (Seen Items, per-Source watermarks) committed as JSON alongside it. We chose this over a database-backed read model because the read path is entirely static, git already provides history, rollback and an audit of every Issue for free, and Astro 7 removed its first-party database integration (`@astrojs/db`).

## Consequences

Cross-Item queries over the archive are answered by a script over the files rather than by SQL. If querying ever genuinely demands a database, adding D1 means adding a read model — not migrating a write model.