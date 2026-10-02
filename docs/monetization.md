# Support, feedback, ads, and creator codes

## Voluntary support and feedback

All three site footers offer **Send feedback**, using the existing public contact
`harmiox@gmail.com`. Connections settings in the Hub and companion settings in
Brawl Stars also offer feedback. The link opens an email draft for the visitor
to review and send. It does not attach player tags, account data, browsing
history, screenshots, or logs, and it does not send anything automatically.

Optional support uses a hosted checkout, separate from StatsConnect+ and its
entitlements. The unified build includes the verified public support URL.
Standalone app builds use `VITE_STATSCONNECT_SUPPORT_URL`, included in their
environment examples. This is a public URL, never an API key. Missing or invalid
configuration hides support links and support requests. Accepted destinations
are HTTPS Stripe Payment Links on `buy.stripe.com` or Ko-fi profile links on
`ko-fi.com`, without credentials, query parameters, or fragments. Stripe test
links are rejected. The app cannot verify the receiving account just from a URL;
the operator must check the actual checkout before configuring it.

The initial setup is one-time support with a suggested USD $5 and a custom
amount. Recurring support requires a separate explicit decision. Contributions
support the developer’s work on StatsConnect and other software projects,
including hosting costs, and confer no features, badges, ad removal, priority access,
exclusive content, or other benefits. Do not describe them as charitable or
tax-deductible.

Stripe distinguishes tips for an already-provided service or content from
donations for a specific charitable purpose. Support is an optional
tip for software or content already provided, including the free StatsConnect
statistics service, not charitable fundraising or personal
money transmission. Describe that activity truthfully during onboarding and
checkout setup; do not select a nonprofit category or imply nonprofit status.

For Stripe, after the account owner completes activation and confirms that live
payments and payouts are available:

1. Create a Payment Link with **Customers choose what to pay**.
2. Use **Support Juan’s work** and the description: "Optional tips support my work
   on StatsConnect and other software projects, including hosting and development.
   Contributions do not unlock features or benefits."
3. Set a USD $5 suggested amount. Keep it one-time, with no recurring price,
   trial, extra product, or account entitlement integration.
4. Inspect the hosted page, amount selection, receiving identity, confirmation
   message, and available payment methods. Check that the account is approved
   for the actual activity under Stripe's requirements for tips and donations.
5. Put the verified live public URL into the three build environments, then
   review and release the frontend change through the normal release process.

### Created checkout and release

The one-time **Support Juan’s work** Payment Link has been created in Juan's
receiving account: <https://buy.stripe.com/bJedRaffk3lr7igdOG4AU00>.
It uses customer-selected USD amounts with a $5 suggestion, no configured
minimum or maximum, the benefit-free description above, and a custom thank-you
confirmation. No subscription, promotion code, cross-sell, Managed Payments,
post-payment invoice, or extra customer-data requirement was added.

The owner completed account activation. The latest review confirmed the link
is **Active**, with account Payments and Payouts active and no active tasks.
The public checkout rendered successfully; no payment was submitted. Reuse this
existing checkout rather than create another link. The
verified URL is included in `unifiedPublicEnvironment` and all three app
environment examples. An explicit `VITE_STATSCONNECT_SUPPORT_URL` overrides
the unified default; set it to an empty string to hide support if the link ever
needs to be withdrawn. No production environment, merge, or deployment has
been changed; the default takes effect when this frontend change is released.

Clerk Billing is designed for recurring application subscriptions. StatsConnect
currently uses Better Auth and does not need a Clerk migration to link to hosted
Stripe checkout. Existing subscriptions, customers, prices, and entitlements
are unaffected by this support UI.

Separate project links may use the same receiving account when the operator,
legal entity, activity, and Stripe's account requirements permit it. A personal
Stripe login can contain several payment accounts; the login itself is not a
receiving account. Do not create another account or change legal identity just
to label a different project. Volt would use its own clearly named link and
requires separate application work.

### When requests appear

Requests are inline below the main content, without an overlay or focus change.
They never appear just from opening a page. A successful Hub profile lookup,
Brawl profile-image download, or completed Clash image download/share records
a useful action. Failed operations and canceled shares do not qualify.

The visitor must complete useful actions in at least three browser-tab sessions,
with at least one day since the first one. The first eligible request asks for
feedback. Later eligible requests alternate with support when a valid support
URL exists. There is at most one request per tab session and a shared 30-day
cooldown for both request types on that site. **Not now** dismisses the current
request; **Don't ask again** disables contextual requests indefinitely. Permanent
footer/settings links stay available.

Only counters, timestamps, request kind, and an opt-out flag are kept in local
browser storage under `statsconnect.community.v1`; tab flags use session storage.
Nothing is sent to a server or tracker. Each game host has its own browser
storage. Blocked storage suppresses contextual requests. Clearing site storage
resets the visitor's preference.

Sources: [Supercell Fan Content Policy](https://supercell.com/en/fan-content-policy/),
[Stripe Payment Links](https://docs.stripe.com/payment-links/create),
[Stripe tips and donations requirements](https://support.stripe.com/questions/requirements-for-accepting-tips-or-donations),
[Clerk Billing](https://clerk.com/docs/guides/billing/overview).

The game sites use manually placed AdSense units at natural content breaks on
their home, catalog, leaderboard, and profile pages. Clash Royale also has units
on the decks, meta, and clan pages. There are no overlays or anchors. Auto ads
are off in the AdSense account. Unfilled units collapse after Google marks them
as unfilled. With no configured client and slot IDs, no ad container appears.

## AdSense setup

1. The AdSense account has client `ca-pub-4485799997262487` and two responsive
   display units: Brawl Stars `1866622105` and Clash Royale `7993046756`.
   The same responsive unit is used across each game's pages. Ownership was
   verified and `statsconnect.app` was submitted for review on September 27,
   2026. Google must approve it before ads can serve.
2. The unified production build uses those client and slot IDs for the Hub,
   Brawl Stars, and Clash Royale. For a standalone game build, set
   `VITE_ADSENSE_CLIENT_ID` and that game's `VITE_ADSENSE_*_HOME_SLOT`.
   The Hub HTML is also the document served for the game subdomains in the
   unified release. The build inserts Google's script in the document head
   and generates `ads.txt` from this ID.
3. Auto ads and Auto optimize are off in AdSense. AdSense's brand safety
   controls block alcohol and gambling by default. We also blocked tobacco,
   weapons, political, casino game, drugs and supplements, suggestive, dating,
   sensational, and get-rich-quick ad categories. Category controls do not
   catch every advertiser; review actual ads after approval for Supercell
   policy conflicts, including unauthorized merchandise and cryptocurrency.
4. The European consent message is published with Consent, Do not consent,
   and Manage options choices. It uses the public StatsConnect icon and the
   live privacy page. Google says publication can take up to an hour to appear
   through the AdSense tag. Review regional consent settings as traffic grows.
5. Check `https://statsconnect.app/ads.txt`, the game home pages, and the
   AdSense dashboard after deployment. The `ads.txt` seller line is emitted
   only when a valid client ID is configured.

The public [privacy page](https://statsconnect.app/privacy) describes data and
advertising use; its contact address must stay current. AdSense site review
and consent settings are external account steps, not provided by this code.

## Supercell creator code

The [Supercell Creators Program](https://creators.supercell.com/) currently
lists a minimum of 100 YouTube subscribers, 25 Twitch followers, or 1,000
TikTok followers to apply. Meeting that entry minimum does not grant a Creator
Boost code; Supercell awards that benefit at a later creator tier. Supercell's
community-site announcement points fan site developers to the same program.
Only Supercell can issue a creator code. After it does, set
`VITE_SUPERCELL_CREATOR_CODE` for both game builds. The footers will tell
visitors to enter the code in each game's Shop. The code is not displayed
until configured. A creator code is distinct from a promotional Store code.

Supercell says approved fan sites in its Creator Program may offer premium
services under that program's terms. A creator code or program application by
itself is not approval for paid StatsConnect features.
