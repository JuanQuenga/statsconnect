import { Link } from "@tanstack/react-router";
import { gameDestinationHref } from "@statsconnect/site-nav";
import { CommunityLinks } from "@statsconnect/monetization";
import { Mark, Wordmark } from "@/components/brand/Mark";
import { handleGameDestinationClick } from "@/lib/application-navigation";
import { games } from "@/lib/contracts";

const doorScene = {
  "brawl-stars": "/brand/nav/brawl-nav-scene.webp",
  "clash-royale": "/brand/nav/clash-nav-scene.webp",
} as const;

export function FooterNotice() {
  return (
    <footer className="hub-footer">
      <div className="content-column">
        <nav aria-label="Game sites" className="hub-footer__doors">
          {games.map((game) => {
            const href = gameDestinationHref(game.id, undefined, window.location.origin);
            return (
              <a
                key={game.id}
                href={href}
                onClick={(event) => handleGameDestinationClick(event, href)}
                data-game={game.id}
                className="footer-door"
              >
                <img src={doorScene[game.id]} alt="" aria-hidden loading="lazy" />
                <span className="footer-door__name">{game.name}</span>
                <span className="footer-door__detail">{game.description}</span>
              </a>
            );
          })}
        </nav>

        <div className="hub-footer__body">
          <div className="hub-footer__brand">
            <Link to="/" className="hub-footer__logo" aria-label="StatsConnect home">
              <Mark className="size-8" />
              <Wordmark />
            </Link>
            <p>Your Clash Royale and Brawl Stars players, saved in one place.</p>
          </div>
          <nav aria-label="Footer navigation" className="hub-footer__links">
            <div>
              <h2>Your players</h2>
              <Link to="/connect">Connect a game</Link>
              <Link to="/settings/connections">Connections</Link>
            </div>
            <div>
              <h2>About</h2>
              <a href="/about">About StatsConnect</a>
              <a href="/faq">FAQ</a>
              <a href="/data-methodology">Data &amp; methodology</a>
              <a href="/contact">Contact</a>
            </div>
            <div>
              <h2>Legal</h2>
              <Link to="/privacy">Privacy</Link>
              <a href="/terms">Terms</a>
              <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer noopener">Fan Content Policy</a>
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
          This material is unofficial and is not endorsed by Supercell. For more information see{" "}
          <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer noopener">Supercell’s Fan Content Policy</a>.
          <span>© {new Date().getFullYear()} StatsConnect</span>
        </p>
      </div>
    </footer>
  );
}
