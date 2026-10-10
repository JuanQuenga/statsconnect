# AdSense remediation — engineering changes

Branch: `feat/adsense-site-remediation` · Date: October 6, 2026

Google rejected the AdSense site review on October 6, 2026 with "Low value content".
The diagnosis (highest confidence first) was that every URL served a near-empty raw
HTML shell — crawlers saw no headings, no copy, no links — plus thin per-tag profile
pages in the index and missing trust pages (About / Contact / Terms). This branch
fixes everything that is fixable in code. Deployment and the re-review request are
deliberately **not** part of it.

## What changed

### Crawler-visible documents (the core fix)

- `server/site-pages.ts` — builds complete head metadata (title, description,
  canonical, Open Graph, Twitter) for every route in the shared inventory and, for
  guide pages, injects the full editorial guide text as static HTML inside
  `<div id="root">`. The app replaces this on hydration with the same content — no
  cloaking. Served with `siteCacheControl`
  (`public, max-age=300, s-maxage=86400, stale-while-revalidate=604800`).
- `api/site-shell.ts` — cached Vercel function that serves those documents for
  `GET`/`HEAD`; unknown routes are a `no-store` 404, shell failures a `no-store` 503.
- `vercel.json` — host-conditioned rewrites route 15 Clash Royale and 9 Brawl Stars
  content URLs (`/`, `/leaderboards`, `/meta`, `/players`, guides, …) to the site
  shell. The tagged `/players?tag=` profile rewrite still wins by order.
- `shared/site-routes.ts` — single source of truth for every public URL, its title
  and description. Import-free so scripts and server code can both use it.

### Per-host robots.txt and sitemap.xml

- `scripts/seo-files.ts` — generates `dist/seo/{robots,sitemap}-{hub,cr,bs}.{txt,xml}`
  during `build:unified`. One dist serves all three hosts, so variants live under
  `dist/seo/` and `vercel.json` maps `/robots.txt` and `/sitemap.xml` per host. No
  static file exists at the root paths, which would shadow the rewrites.
- Sitemaps list every inventory route exactly once, including the four guide slugs.

### Static editorial/legal pages on the hub

- `apps/statsconnect/public/{about,faq,data-methodology,terms,contact}.html` +
  `docs.css` — real content pages (About, FAQ, data & methodology, Terms of Service,
  Contact) served at clean URLs via `cleanUrls: true`, linked from all three site
  footers. Head copy is asserted to match the hub inventory by test.

### Profile pages: noindex, follow (reversible policy)

- `server/profile-metadata.ts` emits `<meta name="robots" content="noindex, follow" />`
  and `api/profile-preview.ts` sends `X-Robots-Tag: noindex, follow`. Per-player
  pages are programmatic data views; once they render unique value this can be
  lifted page-by-page. Link discovery stays intact.

### Copy and interlinking

- Hub `<head>` copy rewritten around what the product actually does; landing page
  gained a "What you can explore" section; hub + both game footers link the new
  doc pages and each other.

### Tests

- `scripts/seo-files.test.ts` — robots/sitemap content, generated files, the
  vercel.json rewrite audit (every inventory route has its host-conditioned
  site-shell rewrite, robots/sitemap variants, `cleanUrls`), and head-copy drift
  checks for the doc pages.
- `server/site-pages.test.ts` — route resolution, crawler metadata, guide body
  injection, `guideInventoryDrift() === []`, profile noindex, and site-shell
  handler behavior (200 + cache, HEAD, 404s, route-param fallback).
- `scripts/production-delivery.test.ts` — rewrite order pinned including the new
  blocks.

## Deliberately out of scope (not code)

- **Recurring original content** — more guides, weekly meta commentary. This is the
  part of "low value content" only ongoing work fixes; the guides + shell now give
  crawlers the existing content, but Google also wants to see a living site.
- **Google Search Console** — needs Juan's Google login: verify
  `statsconnect.app` (+ both subdomains), submit the three sitemaps
  (`/sitemap.xml` on each host once deployed), and watch Indexing → Pages.
- **Deploy** — nothing here is live until this branch merges and deploys.
- **Re-review request** — wait until the above are live and have some history
  (a few weeks of indexed pages + ongoing content), then request review in AdSense.

## Suggested re-review gates (all must be true)

1. Deployed: `cr.statsconnect.app/meta` serves a full document via
   `curl -s https://cr.statsconnect.app/meta | grep -c "<title>"` (title, meta
   description, and editorial copy present on `/decks` and Brawl `/maps`, `/meta`).
2. `https://statsconnect.app/about`, `/faq`, `/terms`, `/contact`,
   `/data-methodology` all return 200 with content.
3. Each host's `/robots.txt` and `/sitemap.xml` return the correct variant.
4. GSC shows the sitemaps discovered with "Discovered URLs" > 0 and no explosion
   of excluded-by-noindex surprises beyond the intended profile pages.
5. At least one new piece of editorial content published since the rejection.

## Update — October 9, 2026: Clash guides retired

The Clash app had redirected `/guides` and `/guides/*` to `/news` since August 25,
while the shell still served the old guide text to crawlers. That mismatch is
removed: the guides left the route inventory, sitemap, and site-shell renderer,
and `vercel.json` now 301s `cr.statsconnect.app/guides` and `/guides/:slug` to
`/news`. Editorial copy now lives on working tool pages instead: Clash `/decks`
and Brawl `/maps` and `/meta` (`shared/clash-deck-content.ts`,
`shared/brawl-page-content.ts`). In GSC, expect the five guide URLs to move to
"Page with redirect".
