# Deduplication is deterministic before it is semantic

Seen detection runs in three deterministic steps — a per-Source Watermark, a seen-set of Item ids, and a Cluster key derived from the normalised URL and title shingles — and only the surviving candidates in the top of the score order may be resolved by a model when the deterministic pass is ambiguous.

We chose this over asking a model to decide duplicates because a model-driven pass costs money to solve a problem string matching already solves, and because its output is not reproducible: the same input would yield different Issues on different Runs, which makes the pipeline untestable.

## Consequences

A Cluster's Items must be re-checked when their content hash changes, so that an advisory gaining a patch or a CVE gaining an update re-enters the Run instead of being suppressed as already Seen.