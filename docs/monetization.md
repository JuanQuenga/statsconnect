# Ads and creator codes

The game sites each have one manually placed AdSense unit on the home page,
between content sections. There are no overlays or anchors. Auto ads are off
in the AdSense account. Unfilled units collapse after Google marks them as
unfilled. With no configured client and slot IDs, no ad container appears.

## AdSense setup

1. The AdSense account has client `ca-pub-4485799997262487` and two responsive
   display units: Brawl Stars home `1866622105` and Clash Royale home
   `7993046756`. The site `statsconnect.app` still requires ownership
   verification and review. Google must approve it before ads can serve.
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
4. The European consent message is saved as a draft with a visible decline
   choice. It needs a site logo and a live privacy page before publication.
   Review regional consent settings when the site is live.
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
