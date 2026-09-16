# An empty day publishes; a blind day does not

A Run that retrieved its Sources successfully but found nothing passing the Editorial Gate still publishes an Issue saying so. A Run that could not retrieve its Sources publishes nothing and leaves the site untouched, showing a "latest Issue: <date>" notice.

These look alike from inside the pipeline and are opposite from the reader's point of view: a gap in the archive reads as a broken system, while an Issue that admits a quiet day reads as a trustworthy one. Broadcasting an Issue we cannot stand behind is the one failure that costs us the reader.

## Consequences

Runs are idempotent and write only once, at the end, so a Run that dies mid-flight never leaves a partial Issue behind. A red GitHub Actions run is the alerting mechanism; the reader-facing notice is the fallback.