# StatsConnect agent guidance

Read `CONTRIBUTING.md` and `CONTEXT.md` first. App- and package-level `AGENTS.md` files add rules for their own directories.

## Service access: CLI first, computer use last

When the session runs on the repo owner's machine (Vercel user `juanquenga`), you have authenticated access to the services below. Use their CLI or API before you try computer use or ask the owner to click through a dashboard. Only switch to computer use for something the CLI or API can't do, and say why when you do.

| Service | How to reach it | Notes |
| --- | --- | --- |
| Vercel | `vercel` CLI | Linked to team project `statsconnect` (`.vercel/project.json`). Use it for env vars, deployments, logs, and domains. |
| Google Cloud | `gcloud` CLI | Signed in as the owner. The default project is unrelated to this repo, so always pass `--project` and confirm which project before you change anything. |
| Clerk | Clerk Backend API, called with `curl` and a secret key from `vercel env pull` | There's no Clerk CLI installed. |
| Sentry | `pnpm dlx @sentry/cli` | Needs a `SENTRY_AUTH_TOKEN`. |
| PostHog | PostHog REST API, or `pnpm dlx @posthog/cli` | Needs a personal API key. |

If a CLI isn't authenticated or a token is missing, tell the owner which login command or key you need. Don't fall back to the browser on your own.

Reading data (logs, issues, events, env var names) is always fine. Ask before you make changes that are hard to undo or that other people can see, such as production deploys, env var changes, deleting users, or changing IAM or OAuth settings.
