# Ads and creator codes

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
