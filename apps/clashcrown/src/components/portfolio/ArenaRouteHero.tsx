import { useId, type ReactNode } from "react";

export type ArenaHeroFrameProps = {
  children: ReactNode;
  className?: string;
  ariaLabelledBy?: string;
};

/**
 * Owns the shared Clash Royale seasonal scene used by every hero surface.
 * Route-specific heroes stay responsible for their content and interactions;
 * this frame only supplies the full-bleed artwork, stacking, and battlement.
 */
export function ArenaHeroFrame({ children, className, ariaLabelledBy }: ArenaHeroFrameProps) {
  const classes = ["arena-hero-frame", className].filter(Boolean).join(" ");

  return (
    <section className={classes} data-arena-frame aria-labelledby={ariaLabelledBy}>
      <span className="arena-hero-frame-art" aria-hidden="true" />
      {children}
    </section>
  );
}

export type ArenaRouteHeroProps = {
  title: ReactNode;
  eyebrow?: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  align?: "start" | "center";
  className?: string;
};

export function ArenaRouteHero({
  title,
  eyebrow,
  summary,
  actions,
  aside,
  align = "start",
  className,
}: ArenaRouteHeroProps) {
  const headingId = useId();
  const classes = ["arena-route-hero", `arena-route-hero--${align}`, className].filter(Boolean).join(" ");

  return (
    <ArenaHeroFrame className={classes} ariaLabelledBy={headingId}>
      <div className="arena-route-hero-inner">
        <div className="arena-route-hero-content">
          {eyebrow ? <p className="arena-route-hero-eyebrow">{eyebrow}</p> : null}
          <h1 id={headingId}>{title}</h1>
          {summary ? <p className="arena-route-hero-description">{summary}</p> : null}
          {actions ? <div className="arena-route-hero-actions">{actions}</div> : null}
        </div>
        {aside ? <div className="arena-route-hero-aside">{aside}</div> : null}
      </div>
    </ArenaHeroFrame>
  );
}
