import { Link } from "@tanstack/react-router";
import { Mark, Wordmark } from "@/components/brand/Mark";
import { CommunityLinks } from "@statsconnect/monetization";

export function FooterNotice() {
  return (
    <footer className="hub-footer">
      <div className="content-column">
        <div className="hub-footer__top">
          <div className="hub-footer__brand">
            <Link to="/" className="hub-footer__logo" aria-label="StatsConnect home">
              <Mark className="size-8" />
              <Wordmark />
            </Link>
            <p>Your Clash Royale and Brawl Stars stats, one tap apart.</p>
          </div>
          <nav aria-label="Footer navigation" className="hub-footer__links">
            <div>
              <h2>Play</h2>
              <Link to="/connect">Connect a game</Link>
              <Link to="/settings/connections">Connections</Link>
            </div>
            <div>
              <h2>Learn</h2>
              <a href="/about">About</a>
              <a href="/faq">FAQ</a>
              <a href="/data-methodology">Data &amp; methodology</a>
              <a href="/contact">Contact</a>
            </div>
            <div>
              <h2>Legal</h2>
              <Link to="/privacy">Privacy</Link>
              <a href="/terms">Terms</a>
              <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer noopener">Fan content policy</a>
            </div>
          </nav>
        </div>
        <div className="hub-footer__community">
          <CommunityLinks
            supportUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_URL}
            monthlySupportUrl={import.meta.env.VITE_STATSCONNECT_MONTHLY_SUPPORT_URL}
            supportPortalUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_PORTAL_URL}
          />
        </div>
        <p className="hub-footer__legal">
          © {new Date().getFullYear()} StatsConnect · Fan-made statistics platform. Not affiliated with or endorsed by Supercell.
        </p>
      </div>
    </footer>
  );
}
