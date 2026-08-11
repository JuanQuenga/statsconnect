import Image from "@/components/Image";
import Link from "@/components/Link";
import { GameSwitcher } from "@/components/portfolio/GameSwitcher";
import { ProfileSearch } from "@/components/portfolio/ProfileSearch";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/meta", label: "Meta" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/cards", label: "Cards" },
  { href: "/decks", label: "Deck Builder" },
  { href: "/clans/search", label: "Clans" },
  { href: "/tournaments", label: "Tournaments" }
];

export function Layout({ children, variant = "profile" }: { children: React.ReactNode; variant?: "home" | "profile" }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={`site-frame ${variant === "home" ? "site-frame-home" : ""}`}>
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="logo-link" aria-label="Clash Crown home">
            <Image src="/images/logo/clash-crown-purple-wide.png" alt="Clash Crown" width={315} height={100} priority />
          </Link>
          <GameSwitcher />
          <nav className="top-nav" aria-label="Primary navigation">
            {navItems.map((item) => (
              <Link key={item.label} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="header-search">
            <ProfileSearch compact />
          </div>
          <button
            type="button"
            className="nav-menu-button"
            aria-label="Toggle primary navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </div>
        <div className={`mobile-nav-panel ${menuOpen ? "is-open" : ""}`}>
          <div className="mobile-header-search">
            <ProfileSearch compact />
          </div>
          <nav className="mobile-top-nav" aria-label="Mobile primary navigation">
            {navItems.map((item) => (
              <Link key={item.label} href={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="social-row">
          <span>Facebook</span>
          <span>Twitter</span>
          <span>Discord</span>
        </div>
        <div className="footer-links">
          <Link href="/leaderboards">Leaderboards</Link>
          <Link href="/cards">Card Library</Link>
          <Link href="/decks">Deck Builder</Link>
          <Link href="/clans/search">Clan Search</Link>
          <Link href="/tournaments">Tournaments</Link>
          <Link href="/meta">Meta Report</Link>
          <Link href="/players">Player Lookup</Link>
        </div>
        <p>
          This material is unofficial and is not endorsed by Supercell. For more information see Supercell&rsquo;s Fan
          Content Policy:{" "}
          <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer noopener">
            supercell.com/fan-content-policy
          </a>
          .
        </p>
        <p>© {new Date().getFullYear()} Clash Crown.</p>
      </div>
    </footer>
  );
}

export { ProfileSearch };
