# The Run executes on GitHub Actions, not on Cloudflare Cron Triggers

The daily Run is a scheduled GitHub Actions workflow; the built site is deployed to Cloudflare Workers Static Assets. Cloudflare Workers Free allows 10 ms of CPU per invocation — network waits are excluded from that budget, but parsing is not — and 50 subrequests, which a Run fetching and parsing dozens of Sources will exceed. GitHub Actions has neither limit, and gives 2,000 free minutes per month even on a private repository. Cloudflare Pages was also ruled out: it has no Cron Triggers at all, caps builds at 500 per month, and Cloudflare now directs new projects to Workers.

## Consequences

Run start time is not guaranteed — the cron minute must be off-peak and the Run must be idempotent. In a public repository, scheduled workflows are disabled after 60 days without repository activity; the daily commit satisfies that on its own.