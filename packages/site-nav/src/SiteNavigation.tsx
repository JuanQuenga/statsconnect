import { useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import "./site-navigation.css";

export type SiteId = "statsconnect" | "brawl-stars" | "clash-royale";

export type SiteNavigationLink = {
  href: string;
  label: string;
};

export type SiteNavigationLinkAdapterProps = {
  children: ReactNode;
  className: string;
  href: string;
  onNavigate: () => void;
};

export type SiteNavigationLinkAdapter = ComponentType<SiteNavigationLinkAdapterProps>;

type NavigationStyle = CSSProperties & {
  "--sc-nav-accent"?: string;
};

export type SiteNavigationProps = {
  accentColor?: string;
  brand: ReactNode;
  currentSite: SiteId;
  endContent?: ReactNode;
  links: readonly SiteNavigationLink[];
  linkAdapter: SiteNavigationLinkAdapter;
  renderSearch?: (onNavigate: () => void) => ReactNode;
  statsConnectOrigin?: string;
};

const sites = [
  { id: "statsconnect", label: "StatsConnect", detail: "Game hub", path: "/", icon: "⌂" },
  { id: "brawl-stars", label: "Brawl Stars", detail: "Open BrawlStats", path: "/launch/brawl-stars", icon: "★" },
  { id: "clash-royale", label: "Clash Royale", detail: "Open ClashCrown", path: "/launch/clash-royale", icon: "♛" },
] as const;

function normalizeOrigin(origin: string | undefined): string {
  return (origin?.trim() || "https://statsconnect.com").replace(/\/$/, "");
}

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" aria-hidden><path d="m6 6 12 12M18 6 6 18" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
  );
}

function GamepadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 8h10a4 4 0 0 1 3.8 5.2l-1.1 3.4a2 2 0 0 1-3.3.8L14.8 16H9.2l-1.6 1.4a2 2 0 0 1-3.3-.8l-1.1-3.4A4 4 0 0 1 7 8Z" />
      <path d="M7 12h4M9 10v4M16.5 11.5h.01M18.5 13.5h.01" />
    </svg>
  );
}

function GamesMenu({ currentSite, origin }: { currentSite: SiteId; origin: string }) {
  return (
    <details className="sc-nav__games">
      <summary>
        <GamepadIcon />
        <span>Games</span>
        <svg className="sc-nav__chevron" viewBox="0 0 24 24" aria-hidden><path d="m7 10 5 5 5-5" /></svg>
      </summary>
      <nav className="sc-nav__game-menu" aria-label="StatsConnect games">
        {sites.map((site) => {
          const current = site.id === currentSite;
          const detail = current ? "Current site" : site.detail;
          return (
            <a key={site.id} href={`${origin}${site.path}`} aria-current={current ? "page" : undefined}>
              <span className="sc-nav__game-icon" aria-hidden>{site.icon}</span>
              <span>
                <strong>{site.label}</strong>
                <small>{detail}</small>
              </span>
            </a>
          );
        })}
      </nav>
    </details>
  );
}

export function SiteNavigation({
  accentColor,
  brand,
  currentSite,
  endContent,
  links,
  linkAdapter: LinkAdapter,
  renderSearch,
  statsConnectOrigin,
}: SiteNavigationProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const origin = normalizeOrigin(statsConnectOrigin);
  const style: NavigationStyle = { "--sc-nav-accent": accentColor };

  return (
    <header className="sc-nav" style={style}>
      <div className="sc-nav__inner">
        <div className="sc-nav__brand">{brand}</div>
        <div className="sc-nav__desktop-games"><GamesMenu currentSite={currentSite} origin={origin} /></div>
        <nav className="sc-nav__links" aria-label="Primary navigation">
          {links.map((link) => (
            <LinkAdapter key={link.href} href={link.href} className="sc-nav__link" onNavigate={close}>
              {link.label}
            </LinkAdapter>
          ))}
        </nav>
        {renderSearch ? <div className="sc-nav__search">{renderSearch(close)}</div> : null}
        {endContent ? <div className="sc-nav__end">{endContent}</div> : null}
        <button
          type="button"
          className="sc-nav__menu-button"
          aria-label="Toggle primary navigation"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <MenuIcon open={open} />
        </button>
      </div>

      <div className={`sc-nav__mobile${open ? " is-open" : ""}`}>
        {open ? (
          <>
            <div className="sc-nav__mobile-games"><GamesMenu currentSite={currentSite} origin={origin} /></div>
            {renderSearch ? <div className="sc-nav__mobile-search">{renderSearch(close)}</div> : null}
            <nav className="sc-nav__mobile-links" aria-label="Mobile primary navigation">
              {links.map((link) => (
                <LinkAdapter key={link.href} href={link.href} className="sc-nav__mobile-link" onNavigate={close}>
                  {link.label}
                </LinkAdapter>
              ))}
            </nav>
          </>
        ) : null}
      </div>
    </header>
  );
}
