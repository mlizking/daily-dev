# The site is served from a custom domain, daily.mlizking.dev

The Worker is attached to `daily.mlizking.dev` as a Cloudflare Custom Domain rather than living at its `*.workers.dev` subdomain. Cloudflare creates the DNS record and issues the certificate itself, and the publication gets one canonical URL from its first Issue.

A publication's URLs are the one thing that cannot be revised later without breaking every citation anyone has made, so the domain is chosen before the first Issue rather than after. The domain is already owned and already in Cloudflare, so the cost of deciding now is zero.

## Consequences

The Cloudflare API token's **Zone resources must include `mlizking.dev`** — attaching a Custom Domain requires `Workers Routes Write` on the zone, which the `Edit Cloudflare Workers` template grants but only for zones explicitly listed in the token's scope. An account-scoped token alone is not enough.

Astro's `site` value is `https://daily.mlizking.dev`; RSS and sitemap generation depend on it.

A Custom Domain cannot be created on a hostname that already has a CNAME record — any existing `daily` record must be deleted first. The `*.workers.dev` URL stays enabled until the first successful deploy as a sanity check, then is switched off (`workers_dev: false`) so that exactly one canonical URL exists.

The Worker's `name` is `daily-dev`: Worker names accept alphanumeric characters and dashes only, so a dotted hostname like `daily.mlizking.dev` is not a valid Worker name — the hostname is a routing concern, entirely separate from the name.