import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
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

export type SiteNavigationLanguageOption = {
  label: string;
  shortLabel: string;
  value: string;
};

export type SiteNavigationLanguage = {
  label: string;
  onChange: (value: string) => void;
  options: readonly SiteNavigationLanguageOption[];
  value: string;
};

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
  language?: SiteNavigationLanguage;
  renderSearch?: (onNavigate: () => void) => ReactNode;
  statsConnectOrigin?: string;
};

const sites = [
  { id: "statsconnect", label: "StatsConnect", detail: "Game hub", path: "/", icon: "⌂" },
  { id: "brawl-stars", label: "Brawl Stars", detail: "Open BrawlStats", path: "/launch/brawl-stars", icon: "★" },
  { id: "clash-royale", label: "Clash Royale", detail: "Open ClashCrown", path: "/launch/clash-royale", icon: "♛" },
] as const;

export const siteNavigationLanguages = [
  { value: "en", shortLabel: "EN", label: "English" },
  { value: "es", shortLabel: "ES", label: "Español" },
  { value: "de", shortLabel: "DE", label: "Deutsch" },
  { value: "fr", shortLabel: "FR", label: "Français" },
  { value: "pt", shortLabel: "PT", label: "Português" },
  { value: "ja", shortLabel: "JA", label: "日本語" },
  { value: "ko", shortLabel: "KO", label: "한국어" },
] as const satisfies readonly SiteNavigationLanguageOption[];

const LANGUAGE_STORAGE_KEY = "statsconnect.locale.v1";
const LANGUAGE_COOKIE_KEY = "statsconnect_locale";
const LANGUAGE_EVENT = "statsconnect:locale-change";

function readSharedLanguage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const cookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${LANGUAGE_COOKIE_KEY}=`));
    if (cookie) return decodeURIComponent(cookie.slice(LANGUAGE_COOKIE_KEY.length + 1));
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSharedLanguage(value: string) {
  if (typeof window === "undefined") return;
  document.documentElement.lang = value;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
    const sharedDomain = window.location.hostname === "juanquenga.com" || window.location.hostname.endsWith(".juanquenga.com")
      ? "; Domain=.juanquenga.com"
      : "";
    document.cookie = `${LANGUAGE_COOKIE_KEY}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax${sharedDomain}`;
  } catch {
    // The current page can still update when browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: value }));
}

function normalizeOrigin(origin: string | undefined): string {
  return (origin?.trim() || "https://stats.juanquenga.com").replace(/\/$/, "");
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

function NetworkBrand({ currentSite, origin }: { currentSite: SiteId; origin: string }) {
  return (
    <a
      className="sc-nav__network-brand"
      href={`${origin}/`}
      aria-label="StatsConnect hub"
      aria-current={currentSite === "statsconnect" ? "page" : undefined}
    >
      <span className="sc-nav__network-mark" aria-hidden>SC</span>
      <strong>StatsConnect</strong>
    </a>
  );
}

function NetworkSites({ currentSite, origin }: { currentSite: SiteId; origin: string }) {
  return (
    <nav className="sc-nav__network-sites" aria-label="StatsConnect game sites">
      {sites.slice(1).map((site) => {
        const current = site.id === currentSite;
        return (
          <a key={site.id} href={`${origin}${site.path}`} aria-current={current ? "page" : undefined}>
            <span className="sc-nav__network-game-icon" aria-hidden>{site.icon}</span>
            <span>{site.label}</span>
          </a>
        );
      })}
    </nav>
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

function LanguageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function LanguageSelector({ language }: { language?: SiteNavigationLanguage }) {
  const options = language?.options ?? siteNavigationLanguages;
  const controlledValue = language?.value;
  const previousControlledValue = useRef(controlledValue);
  const [value, setValue] = useState(() => {
    const shared = readSharedLanguage();
    if (shared && options.some((option) => option.value === shared)) return shared;
    if (controlledValue && options.some((option) => option.value === controlledValue)) return controlledValue;
    return options[0]?.value ?? "en";
  });

  useEffect(() => {
    const shared = readSharedLanguage();
    if (shared && options.some((option) => option.value === shared)) {
      setValue(shared);
      document.documentElement.lang = shared;
      if (controlledValue !== undefined && controlledValue !== shared) language?.onChange(shared);
    } else if (shared) {
      // Preserve a network-wide preference that this site does not translate yet.
      if (controlledValue) setValue(controlledValue);
    } else if (controlledValue) {
      setValue(controlledValue);
      writeSharedLanguage(controlledValue);
    }
  }, []);

  useEffect(() => {
    if (controlledValue === undefined || controlledValue === previousControlledValue.current) return;
    previousControlledValue.current = controlledValue;
    setValue(controlledValue);
    writeSharedLanguage(controlledValue);
  }, [controlledValue]);

  useEffect(() => {
    const sync = (event: Event) => {
      const next = event instanceof CustomEvent && typeof event.detail === "string"
        ? event.detail
        : readSharedLanguage();
      if (!next || !options.some((option) => option.value === next)) return;
      setValue(next);
      if (controlledValue !== undefined && controlledValue !== next) language?.onChange(next);
    };
    window.addEventListener("storage", sync);
    window.addEventListener(LANGUAGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(LANGUAGE_EVENT, sync);
    };
  }, [controlledValue, language, options]);

  const selectedValue = controlledValue ?? value;
  const selected = options.find((option) => option.value === selectedValue) ?? options[0];

  return (
    <label className="sc-nav__language">
      <span className="sc-nav__sr-only">{language?.label ?? "Language"}</span>
      <LanguageIcon />
      <span aria-hidden>{selected?.shortLabel}</span>
      <select
        aria-label={language?.label ?? "Language"}
        value={selected?.value}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          writeSharedLanguage(next);
          language?.onChange(next);
        }}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <svg className="sc-nav__language-chevron" viewBox="0 0 24 24" aria-hidden><path d="m7 10 5 5 5-5" /></svg>
    </label>
  );
}

export function SiteNavigation({
  accentColor,
  brand,
  currentSite,
  endContent,
  language,
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
      <div className="sc-nav__network">
        <div className="sc-nav__network-inner">
          <NetworkBrand currentSite={currentSite} origin={origin} />
          <NetworkSites currentSite={currentSite} origin={origin} />
          <div className="sc-nav__network-actions">
            <LanguageSelector language={language} />
            <div className="sc-nav__network-menu"><GamesMenu currentSite={currentSite} origin={origin} /></div>
          </div>
        </div>
      </div>

      <div className="sc-nav__site">
        <div className={`sc-nav__inner${currentSite === "statsconnect" ? " sc-nav__inner--hub" : ""}`}>
          <div className="sc-nav__brand">{brand}</div>
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
      </div>

      <div className={`sc-nav__mobile${open ? " is-open" : ""}`}>
        {open ? (
          <>
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
