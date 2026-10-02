import { Link } from "@tanstack/react-router";
import { Mark, Wordmark } from "@/components/brand/Mark";
import { CommunityLinks } from "@statsconnect/monetization";

export function FooterNotice() {
  return (
    <footer className="hub-footer">
      <div className="content-column hub-footer__inner">
        <div className="hub-footer__brand">
          <Mark className="size-8" />
          <Wordmark />
        </div>
        <div>
          <nav aria-label="Footer navigation">
            <Link to="/connect">Connect</Link>
            <Link to="/settings/connections">Connections</Link>
            <Link to="/privacy">Privacy</Link>
            <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer noopener">Fan content policy</a>
          </nav>
          <CommunityLinks supportUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_URL} />
        </div>
        <p>
          Fan-made statistics platform. Not affiliated with or endorsed by Supercell.
        </p>
      </div>
    </footer>
  );
}
