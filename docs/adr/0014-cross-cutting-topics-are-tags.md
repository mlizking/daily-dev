# Cross-cutting topics are tags, not Categories

The six Categories are the Issue's fixed sections, and each of them must be present every day — an empty one is printed as empty, which is a statement the reader can trust (ADR-0008). Readers also want to follow threads that run across those sections: CNCF, DevSecOps, and using AI well. Those threads are now tags on Items, each with a page listing every Item that carries them, rather than new Categories.

A seventh Category would have to justify itself daily. CNCF announcements arrive weekly at best and OpenSSF's blog every few days, so a "Cloud Native" section would be empty more often than not — and once one Category is usually empty, an empty Category stops meaning "nothing qualified today" and starts meaning "this section is broken". A tag can be absent for a week without anyone concluding anything is wrong.

## Consequences

An Item inherits its Source's tags, so a tag's reliability is exactly its Sources' reliability, and adding a Source to a thread is a data change.

A tag page exists for every declared tag, even before any Issue uses it; the home page links only the tags that have actually appeared, so it never offers a reader an empty page.

The Technique rule reads tags. Among Items eligible to become Technique of the Day, one tagged `ai-technique` wins, because using AI well is the technique this reader most wants and least often finds elsewhere.