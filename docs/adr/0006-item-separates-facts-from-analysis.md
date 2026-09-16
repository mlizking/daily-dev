# An Item separates Facts from Analysis

An Item holds two distinct bodies of text: `facts` — text copied verbatim from the origin, never rewritten — and `analysis` — our own words, stored in English as the canonical form. The Issue renderer must be able to produce a complete Issue from `facts` alone, with `analysis` as an optional layer that can fail without breaking the Issue.

## Consequences

Every claim on a published page is accompanied by the origin's own wording and a link. Changing the writing model, or adding a second language, becomes a re-render from immutable input rather than a reprocessing of the archive.