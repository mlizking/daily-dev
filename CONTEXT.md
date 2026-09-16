# Daily Dev Brief

A daily, automated publication that tells Thai developers what changed in their industry in the last 24 hours. One Issue per day, readable in ten minutes, assembled by a pipeline from public sources rather than written by hand.

## Language

**Issue**:
One day's publication — the single unit a reader opens, identified by the date it covers.
_Avoid_: article, post, digest, newsletter, edition

**Item**:
A single thing observed from a Source: a post, an advisory, a release, a repository.
_Avoid_: entry, record, story, link

**Source**:
An origin the pipeline polls for Items.
_Avoid_: feed, provider, channel

**Category**:
One of the fixed sections an Issue is divided into.
_Avoid_: tag, topic, section, column

**Fact**:
A claim copied from an Item's origin, preserved verbatim and never rewritten by us.
_Avoid_: detail, data, content

**Analysis**:
Our own words about an Item — anything not already present in the origin.
_Avoid_: summary, commentary, take

**Primary Record**:
The authoritative origin of a security Fact, and the only kind of origin allowed to justify one.
_Avoid_: primary source, reference, citation

**Technique**:
An Analysis a reader can apply immediately, accompanied by a short code example.
_Avoid_: tip, trick, how-to, tutorial

**Seen**:
Describes an Item a previous Run already considered — whether or not it reached an Issue.
_Avoid_: duplicate, processed, old, consumed

**Run**:
One execution of the pipeline, which produces at most one Issue.
_Avoid_: job, build, batch, execution

**Draft**:
An Issue that has been assembled but not published.
_Avoid_: preview, pending, unpublished

**Published Issue**:
An Issue that has been made public. It never changes afterwards.
_Avoid_: live, released, final

**Tier**:
A Source's position in the Run's critical path: a Tier 1 Source's failure fails the Run, a Tier 2 Source's failure is recorded and ignored.
_Avoid_: priority, class, level, rank

**Watermark**:
The newest Item timestamp already retrieved from a Source, used to fetch only what is new.
_Avoid_: cursor, offset, checkpoint, last-seen

**Cluster**:
A group of Items reporting the same underlying event from different Sources.
_Avoid_: duplicate, group, merge, thread

**Candidate**:
An Item that has survived Seen detection and is being considered by the Editorial Gate.
_Avoid_: entry, applicant, shortlist

**Editorial Gate**:
The rule that decides which Candidates reach an Issue.
_Avoid_: filter, ranking, selection, curation

**Correction**:
A published statement that an earlier Issue was wrong.
_Avoid_: edit, fix, update, erratum