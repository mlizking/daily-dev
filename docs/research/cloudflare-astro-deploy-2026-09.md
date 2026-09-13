# Cloudflare Workers Static Assets + Astro 7 — verified 2026-09-13

## Scaffold

```
npm create cloudflare@latest <dir> -- --framework=astro
```

C3 (`create-cloudflare`) is still the supported scaffolder. It exposes more than one Astro
variant; the **pure-static** one must be chosen, because that is the only variant that does
**not** install `@astrojs/cloudflare` and does **not** set a `main` entrypoint.

Verification rule after scaffolding: inspect `wrangler.jsonc`. If it has a `main` field or
`@astrojs/cloudflare` appears in `package.json`, the SSR variant was selected — wrong one.

`npm create astro@latest` plus a hand-written `wrangler.jsonc` is the lower-opinion alternative
and is what we will use, since the exact target config is already known (below).

## wrangler.jsonc

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "daily-dev",
  "compatibility_date": "2025-09-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",
    "binding": "ASSETS"
  },
  "observability": { "enabled": true }
}
```

No `main`. Wrangler uploads `dist/` as static assets only.

## Commands

| Purpose | Command | Needs account/token? |
| --- | --- | --- |
| Build | `astro build` | no |
| Local preview | `npx wrangler dev` | **no** — serves `assets.directory` locally |
| Deploy | `npx wrangler deploy` | **yes** |

`wrangler` v4 is a devDependency in the C3 layout.

## CI

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: '22.x' }   # Astro 7 requires Node >= 22.12
- run: npm ci
- run: npm run build
- uses: cloudflare/wrangler-action@v4
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: deploy
```

Required repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
API token permission scope: **Workers Scripts: Edit** (account-scoped).

`cloudflare/pages-action` is deprecated — do not use it.

## Free-tier limits that matter

- 20 000 files per Worker version (100 000 paid); 25 MiB per individual file.
- **Static asset requests are free and unlimited — they do not consume the 100 000 requests/day
  Worker quota.** This is why a mostly-static article site costs nothing here.
- Workers CPU on Free is 10 ms per invocation (network waits excluded, parsing is not) and
  subrequests are capped at 50 per invocation — the reason the Run lives on GitHub Actions.

## Workers Builds cannot schedule

Cloudflare's own Workers Builds Git integration builds and deploys on push/branch events and has
**no cron trigger**. It can perform the deploy step but can never be the timer. Scheduling stays
with GitHub Actions — which confirms ADR-0003.