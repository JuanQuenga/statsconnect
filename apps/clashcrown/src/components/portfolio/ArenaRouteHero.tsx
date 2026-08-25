import {
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  ARENA_HERO_HANDOFF_WINDOW_MS,
  expireDetachedArenaHeroFrameIfCurrent,
  planArenaHeroHeightTransition,
  startArenaHeroHeightAnimation,
  type ArenaHeroFrameState,
  type ArenaHeroTransitionCandidate,
} from "@/lib/arenaHeroTransition";

export type ArenaHeroFrameProps = {
  children: ReactNode;
  className?: string;
  ariaLabelledBy?: string;
};

type MountedArenaFrame = ArenaHeroFrameState & {
  element: HTMLElement;
  animation: Animation | null;
};

let mountedArenaFrame: MountedArenaFrame | null = null;
const strictModeReplaySources = new WeakMap<HTMLElement, ArenaHeroTransitionCandidate>();

function arenaPathname(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function frameHeight(element: HTMLElement): number {
  return element.getBoundingClientRect().height;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Owns the shared Clash Royale seasonal scene used by every hero surface.
 * Route-specific heroes stay responsible for their content and interactions;
 * this frame only supplies the full-bleed artwork, stacking, and battlement.
 */
export function ArenaHeroFrame({ children, className, ariaLabelledBy }: ArenaHeroFrameProps) {
  const classes = ["arena-hero-frame", className].filter(Boolean).join(" ");
  const frameRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const pathname = arenaPathname();
    const targetHeight = frameHeight(element);
    const previous = strictModeReplaySources.get(element) ?? mountedArenaFrame;
    const now = performance.now();
    const reducedMotion = prefersReducedMotion();
    const plan = planArenaHeroHeightTransition(previous, {
      pathname,
      height: targetHeight,
      now,
      reducedMotion,
    });
    let heightAnimation: Animation | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const rememberFrame = (frame: ArenaHeroFrameState, animation: Animation | null) => {
      mountedArenaFrame = {
        ...frame,
        element,
        animation,
      };
    };

    const animateHeight = (
      fromHeight: number,
      toHeight: number,
      frame: ArenaHeroFrameState,
      transitionPathname: string,
      replaySource?: ArenaHeroTransitionCandidate,
    ) => {
      if (replaySource) strictModeReplaySources.set(element, replaySource);

      // Hold the outgoing box and start WAAPI in the same layout commit. Waiting
      // for requestAnimationFrame can strand the new route at the old height in
      // a throttled/background frame and creates a visible pause even when the
      // tab is active.
      element.style.height = `${fromHeight}px`;
      element.style.minHeight = `${fromHeight}px`;
      element.dataset.arenaHeightTransition = "active";
      const animation = startArenaHeroHeightAnimation(
        (keyframes, options) => element.animate(keyframes, options),
        fromHeight,
        toHeight,
      );
      heightAnimation = animation;
      element.style.removeProperty("height");
      element.style.removeProperty("min-height");
      rememberFrame({ ...frame, phase: "animating" }, animation);

      animation.addEventListener("finish", () => {
        if (mountedArenaFrame?.element === element) {
          const settledHeight = frameHeight(element);
          rememberFrame({
            pathname: transitionPathname,
            height: settledHeight,
            targetHeight: settledHeight,
            detachedAt: null,
            phase: "stable",
          }, null);
        }
        delete element.dataset.arenaHeightTransition;
        animation.cancel();
        if (heightAnimation === animation) heightAnimation = null;
      }, { once: true });

      if (replaySource) {
        // React StrictMode immediately cleans up and replays layout effects in
        // development. Keep the outgoing source through that synchronous
        // replay, then discard it before a later same-route remount can use it.
        queueMicrotask(() => {
          if (strictModeReplaySources.get(element) === replaySource) {
            strictModeReplaySources.delete(element);
          }
        });
      }
    };

    // The incoming frame becomes authoritative synchronously. If another route
    // wins during this handoff, it starts from the box the user can see.
    rememberFrame(plan.frame, null);

    if (plan.kind === "animate") {
      animateHeight(
        plan.fromHeight,
        plan.toHeight,
        plan.frame,
        pathname,
        plan.source,
      );
    }

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        if (
          mountedArenaFrame?.element === element &&
          mountedArenaFrame.phase === "stable"
        ) {
          const resizedHeight = frameHeight(element);
          const resizedPathname = arenaPathname();
          const resizePlan = planArenaHeroHeightTransition(mountedArenaFrame, {
            pathname: resizedPathname,
            height: resizedHeight,
            now: performance.now(),
            reducedMotion: prefersReducedMotion(),
          });

          if (resizePlan.kind === "animate") {
            animateHeight(
              resizePlan.fromHeight,
              resizePlan.toHeight,
              resizePlan.frame,
              resizedPathname,
            );
          } else {
            rememberFrame(resizePlan.frame, null);
          }
        }
      });
      resizeObserver.observe(element);
    }

    return () => {
      const currentFrame = mountedArenaFrame?.element === element
        ? mountedArenaFrame
        : null;
      const outgoingHeight = currentFrame?.phase === "animating"
        ? frameHeight(element)
        : currentFrame?.height ?? frameHeight(element);
      resizeObserver?.disconnect();
      heightAnimation?.cancel();
      element.style.removeProperty("height");
      element.style.removeProperty("min-height");
      delete element.dataset.arenaHeightTransition;

      if (mountedArenaFrame?.element === element) {
        const detachedFrame: MountedArenaFrame = {
          ...mountedArenaFrame,
          height: outgoingHeight,
          targetHeight: outgoingHeight,
          detachedAt: performance.now(),
          phase: "stable",
          animation: null,
        };
        mountedArenaFrame = detachedFrame;
        window.setTimeout(() => {
          mountedArenaFrame = expireDetachedArenaHeroFrameIfCurrent(
            mountedArenaFrame,
            detachedFrame,
          );
        }, ARENA_HERO_HANDOFF_WINDOW_MS + 1);
      }
    };
  }, []);

  return (
    <section ref={frameRef} className={classes} data-arena-frame aria-labelledby={ariaLabelledBy}>
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
