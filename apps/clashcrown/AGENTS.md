# ClashCrown agent guidance

`apps/clashcrown` owns the ClashCrown frontend and its routing Adapter. It does not own an executable Convex backend.

Make Clash Royale backend changes in `../../packages/backend/convex/clash`. Put shared schema, HTTP router, cron, authentication, and generated Interface changes under `../../packages/backend/convex`. Read `../../packages/backend/AGENTS.md` and the root `CONTRIBUTING.md` before changing backend behavior or deployment configuration.

Do not add an app-local `convex` directory, `convex.json`, backend development script, or backend deploy script. Do not hand-edit files under `../../packages/backend/convex/_generated`.
