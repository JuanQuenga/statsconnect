import { useCallback, useEffect, useRef, useState, type AnchorHTMLAttributes, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { handleApplicationNavigation } from "./application-navigation";
import { gameAssetHref, gameSwitcherHref } from "./navigation-targets";
import "./site-navigation.css";

export type SiteId = "statsconnect" | "brawl-stars" | "clash-royale";

export type SiteNavigationLink = {
  href: string;
  icon?: ReactNode;
  label: string;
  mobileLabel?: string;
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

export type SiteNavigationAccount = {
  avatarUrl?: string;
  displayName: string;
  email?: string;
  href?: string;
  onSignOut?: () => void;
};

export type SiteNavigationAuthAction = {
  label: string;
  onClick: () => void;
};

export type SiteNavigationProfile = {
  game: Exclude<SiteId, "statsconnect">;
  tag: string;
  name: string;
};

type NavigationStyle = CSSProperties & {
  "--sc-nav-accent"?: string;
};

export type SiteNavigationProps = {
  accentColor?: string;
  brand?: ReactNode;
  currentSite: SiteId;
  endContent?: ReactNode;
  links: readonly SiteNavigationLink[];
  mobileLinks?: readonly SiteNavigationLink[];
  linkAdapter: SiteNavigationLinkAdapter;
  language?: SiteNavigationLanguage;
  account?: SiteNavigationAccount;
  authAction?: SiteNavigationAuthAction;
  hubOrigin?: string;
  profiles?: readonly SiteNavigationProfile[];
  renderSearch?: (onNavigate: () => void) => ReactNode;
};

const sites = [
  { id: "statsconnect", label: "StatsConnect", detail: "Game hub", icon: "⌂" },
  { id: "brawl-stars", label: "Brawl Stars", detail: "Open Brawl Stars statistics" },
  { id: "clash-royale", label: "Clash Royale", detail: "Open Clash Royale statistics" },
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

/**
 * Shared behavior for the `<details>` disclosure menus (Game Switcher menu and
 * account popover): close on Escape (returning focus to the summary), close on
 * any pointer press outside, and close when a link inside is activated.
 */
function useDisclosureMenu() {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const details = detailsRef.current;
    if (!open || !details) return;

    const close = () => {
      details.open = false;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const summary = details.querySelector("summary");
      close();
      if (summary instanceof HTMLElement) summary.focus();
    };

    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!details.contains(target)) close();
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("a")) close();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  const syncOpen = useCallback((next: boolean) => setOpen(next), []);

  return { detailsRef, open, syncOpen };
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

function ApplicationLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        handleApplicationNavigation(event, href);
      }}
    />
  );
}

function NetworkBrand({ currentSite, hubOrigin }: { currentSite: SiteId; hubOrigin?: string }) {
  return (
    <ApplicationLink
      className="sc-nav__network-brand"
      href={gameSwitcherHref("statsconnect", hubOrigin)}
      aria-label="StatsConnect hub"
      aria-current={currentSite === "statsconnect" ? "page" : undefined}
    >
      <span className="sc-nav__network-mark" aria-hidden>SC</span>
      <strong>StatsConnect</strong>
    </ApplicationLink>
  );
}

function SiteIcon({
  applicationOrigin,
  applicationShell,
  className,
  currentPathname,
  currentSite,
  hubOrigin,
  site,
}: {
  applicationOrigin?: string;
  applicationShell: boolean;
  className: string;
  currentPathname?: string;
  currentSite: SiteId;
  hubOrigin?: string;
  site: (typeof sites)[number];
}) {
  const iconFile = site.id === "clash-royale" ? "apple-touch-icon-blue.png" : "apple-touch-icon.png";
  const iconBase = site.id === "statsconnect"
    ? ""
    : gameAssetHref(site.id, {
        applicationOrigin,
        applicationShell,
        currentPathname,
        currentSite,
        hubOrigin,
      });
  return (
    <span className={className} data-site={site.id} aria-hidden>
      {site.id === "statsconnect"
        ? site.icon
        : <img src={`${iconBase}${iconFile}`} alt="" />}
    </span>
  );
}

function gameProfiles(
  profiles: readonly SiteNavigationProfile[],
  game: SiteNavigationProfile["game"],
): SiteNavigationProfile[] {
  return profiles.filter((profile) => profile.game === game);
}

function NetworkSites({
  applicationOrigin,
  applicationShell,
  currentPathname,
  currentSite,
  hubOrigin,
  profiles,
}: {
  applicationOrigin?: string;
  applicationShell: boolean;
  currentPathname?: string;
  currentSite: SiteId;
  hubOrigin?: string;
  profiles: readonly SiteNavigationProfile[];
}) {
  return (
    <nav className="sc-nav__network-sites" aria-label="StatsConnect game sites">
      {sites.slice(1).map((site) => {
        if (site.id === "statsconnect") return null;
        const current = site.id === currentSite;
        const saved = gameProfiles(profiles, site.id);
        return (
          <div className="sc-nav__network-group" key={site.id}>
            <ApplicationLink className="sc-nav__network-game" href={gameSwitcherHref(site.id, hubOrigin)} aria-current={current ? "page" : undefined}>
              <SiteIcon applicationOrigin={applicationOrigin} applicationShell={applicationShell} className="sc-nav__network-game-icon" currentPathname={currentPathname} currentSite={currentSite} hubOrigin={hubOrigin} site={site} />
              <span>{site.label}</span>
            </ApplicationLink>
            {saved.map((profile) => (
              <ApplicationLink
                className="sc-nav__network-profile"
                href={gameSwitcherHref(profile, hubOrigin)}
                key={`${profile.game}:${profile.tag}`}
                title={`${profile.name} · #${profile.tag}`}
              >
                {profile.name}
              </ApplicationLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function GamesMenu({
  applicationOrigin,
  applicationShell,
  currentPathname,
  currentSite,
  hubOrigin,
  profiles,
}: {
  applicationOrigin?: string;
  applicationShell: boolean;
  currentPathname?: string;
  currentSite: SiteId;
  hubOrigin?: string;
  profiles: readonly SiteNavigationProfile[];
}) {
  const { detailsRef, syncOpen } = useDisclosureMenu();

  return (
    <details ref={detailsRef} onToggle={(event) => syncOpen(event.currentTarget.open)} className="sc-nav__games">
      <summary>
        <GamepadIcon />
        <span>Games</span>
        <svg className="sc-nav__chevron" viewBox="0 0 24 24" aria-hidden><path d="m7 10 5 5 5-5" /></svg>
      </summary>
      <nav className="sc-nav__game-menu" aria-label="StatsConnect games">
        {sites.map((site) => {
          const current = site.id === currentSite;
          const detail = current ? "Current site" : site.detail;
          const saved = site.id === "statsconnect" ? [] : gameProfiles(profiles, site.id);
          return (
            <div className="sc-nav__game-menu-group" key={site.id}>
              <ApplicationLink href={gameSwitcherHref(site.id, hubOrigin)} aria-current={current ? "page" : undefined}>
                <SiteIcon applicationOrigin={applicationOrigin} applicationShell={applicationShell} className="sc-nav__game-icon" currentPathname={currentPathname} currentSite={currentSite} hubOrigin={hubOrigin} site={site} />
                <span>
                  <strong>{site.label}</strong>
                  <small>{detail}</small>
                </span>
              </ApplicationLink>
              {saved.map((profile) => (
                <ApplicationLink className="sc-nav__game-menu-profile" href={gameSwitcherHref(profile, hubOrigin)} key={`${profile.game}:${profile.tag}`}>
                  <span aria-hidden>#</span>
                  <span>
                    <strong>{profile.name}</strong>
                    <small>#{profile.tag}</small>
                  </span>
                </ApplicationLink>
              ))}
            </div>
          );
        })}
      </nav>
    </details>
  );
}

function AccountChip({ account }: { account: SiteNavigationAccount }) {
  const initials = account.displayName.trim().slice(0, 1).toUpperCase() || "G";
  const { detailsRef, syncOpen } = useDisclosureMenu();
  const content = (
    <>
      {account.avatarUrl ? <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden>{initials}</span>}
      <span className="sc-nav__account-copy">
        <strong>{account.displayName}</strong>
        {account.email ? <small>{account.email}</small> : null}
      </span>
    </>
  );
  if (!account.onSignOut) {
    return account.href
      ? <a className="sc-nav__account" href={account.href} aria-label={`Google account: ${account.displayName}`}>{content}</a>
      : <div className="sc-nav__account" aria-label={`Google account: ${account.displayName}`}>{content}</div>;
  }
  return (
    <details ref={detailsRef} onToggle={(event) => syncOpen(event.currentTarget.open)} className="sc-nav__account-menu">
      <summary className="sc-nav__account" aria-label={`Google account: ${account.displayName}`}>{content}</summary>
      <div className="sc-nav__account-popover">
        <strong>{account.displayName}</strong>
        {account.email ? <small>{account.email}</small> : null}
        <button type="button" onClick={account.onSignOut}>Sign out</button>
      </div>
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
  const onChange = language?.onChange;
  const previousControlledValue = useRef(controlledValue);
  const [value, setValue] = useState(() => {
    const shared = readSharedLanguage();
    if (shared && options.some((option) => option.value === shared)) return shared;
    if (controlledValue && options.some((option) => option.value === controlledValue)) return controlledValue;
    return options[0]?.value ?? "en";
  });

  const optionsKey = options.map((option) => option.value).join(",");

  useEffect(() => {
    const shared = readSharedLanguage();
    if (shared && options.some((option) => option.value === shared)) {
      setValue(shared);
      document.documentElement.lang = shared;
      if (controlledValue !== undefined && controlledValue !== shared) onChange?.(shared);
    } else if (shared) {
      // Preserve a network-wide preference that this site does not translate yet.
      if (controlledValue) setValue(controlledValue);
    } else if (controlledValue) {
      setValue(controlledValue);
      writeSharedLanguage(controlledValue);
    }
    // Runs once per mount; the option list and callbacks are stable in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (controlledValue !== undefined && controlledValue !== next) onChange?.(next);
    };
    window.addEventListener("storage", sync);
    window.addEventListener(LANGUAGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(LANGUAGE_EVENT, sync);
    };
    // Re-subscribe only when the supported locales change or the controlled
    // value/callback identity changes, not on every parent render.
  }, [optionsKey, controlledValue, onChange]);

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
          onChange?.(next);
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
  account,
  authAction,
  brand,
  currentSite,
  endContent,
  hubOrigin,
  language,
  links,
  linkAdapter: LinkAdapter,
  mobileLinks,
  profiles = [],
  renderSearch,
}: SiteNavigationProps) {
  const [open, setOpen] = useState(false);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  const style: NavigationStyle = { "--sc-nav-accent": accentColor };
  const applicationShell = typeof window !== "undefined" && Boolean(window.__statsConnectApplicationShell);
  const applicationOrigin = applicationShell && typeof window !== "undefined" ? window.location.origin : hubOrigin;
  const currentPathname = typeof window !== "undefined" ? window.location.pathname : undefined;
  const dockLinks = (mobileLinks ?? links).slice(0, 4);

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const focusables = () =>
      sheet
        ? Array.from(
            sheet.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary:not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
          )
        : [];
    mobileCloseRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sheet) return;

      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;
      if (event.shiftKey && (active === first || !(active instanceof Node) || !sheet.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  return (
    <header className="sc-nav" data-site={currentSite} style={style}>
      <div className="sc-nav__network">
        <div className="sc-nav__network-inner">
          <NetworkBrand currentSite={currentSite} hubOrigin={applicationOrigin} />
          <NetworkSites applicationOrigin={applicationOrigin} applicationShell={applicationShell} currentPathname={currentPathname} currentSite={currentSite} hubOrigin={applicationOrigin} profiles={profiles} />
          <div className="sc-nav__network-actions">
            <LanguageSelector language={language} />
            <div className="sc-nav__network-menu"><GamesMenu applicationOrigin={applicationOrigin} applicationShell={applicationShell} currentPathname={currentPathname} currentSite={currentSite} hubOrigin={applicationOrigin} profiles={profiles} /></div>
            {account ? <AccountChip account={account} /> : null}
            {!account && authAction ? <button className="sc-nav__sign-in" type="button" onClick={authAction.onClick}>{authAction.label}</button> : null}
          </div>
        </div>
      </div>

      <div className="sc-nav__site">
        <div className={`sc-nav__inner${currentSite === "statsconnect" ? " sc-nav__inner--hub" : ""}`}>
          {brand ? <div className="sc-nav__brand">{brand}</div> : null}
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

      {open ? <button type="button" className="sc-nav__mobile-backdrop" aria-label="Close navigation menu" onClick={close} /> : null}
      {/* The mobile sheet is a dialog: focus enters it on open, Tab cycles inside
          it while open, and focus returns to the hamburger button on close. */}
      <div
        ref={sheetRef}
        className={`sc-nav__mobile${open ? " is-open" : ""}`}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? "Site navigation" : undefined}
      >
        {open ? (
          <div className="sc-nav__mobile-panel">
            <header className="sc-nav__mobile-heading">
              <div><strong>Explore StatsConnect</strong><span>Search or choose a section.</span></div>
              <button ref={mobileCloseRef} type="button" aria-label="Close navigation menu" onClick={close}><MenuIcon open /></button>
            </header>
            {renderSearch ? <div className="sc-nav__mobile-search">{renderSearch(close)}</div> : null}
            {currentSite === "clash-royale" ? (
              <div className="sc-nav__mobile-tools" aria-label="Site preferences">
                {language ? <LanguageSelector language={language} /> : null}
                <GamesMenu applicationOrigin={applicationOrigin} applicationShell={applicationShell} currentPathname={currentPathname} currentSite={currentSite} hubOrigin={applicationOrigin} profiles={profiles} />
                {account ? <AccountChip account={account} /> : null}
                {!account && authAction ? <button className="sc-nav__sign-in" type="button" onClick={authAction.onClick}>{authAction.label}</button> : null}
              </div>
            ) : null}
            <nav className="sc-nav__mobile-links" aria-label="Mobile primary navigation">
              {links.map((link) => (
                <LinkAdapter key={link.href} href={link.href} className="sc-nav__mobile-link" onNavigate={close}>
                  {link.label}
                </LinkAdapter>
              ))}
            </nav>
          </div>
        ) : null}
      </div>

      {currentSite === "clash-royale" ? (
        <nav className="sc-nav__mobile-dock" aria-label="Primary mobile navigation">
          {dockLinks.map((link) => (
            <LinkAdapter key={link.href} href={link.href} className="sc-nav__mobile-dock-link" onNavigate={close}>
              <span className="sc-nav__mobile-dock-icon" aria-hidden>{link.icon}</span>
              <span>{link.mobileLabel ?? link.label}</span>
            </LinkAdapter>
          ))}
          <button
            type="button"
            className="sc-nav__mobile-dock-link sc-nav__mobile-dock-more"
            aria-label="More navigation options"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="sc-nav__mobile-dock-icon" aria-hidden><MenuIcon open={open} /></span>
            <span>More</span>
          </button>
        </nav>
      ) : null}
    </header>
  );
}
