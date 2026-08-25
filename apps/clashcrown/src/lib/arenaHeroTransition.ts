export const ARENA_HERO_TRANSITION_DURATION_MS = 520;
export const ARENA_HERO_HANDOFF_WINDOW_MS = 800;
const ARENA_HERO_TRANSITION_EASING = "cubic-bezier(.22, 1, .36, 1)";

export type ArenaHeroTransitionCandidate = {
  pathname: string;
  height: number;
  detachedAt: number | null;
};

export type ArenaHeroTransitionEnvironment = {
  pathname: string;
  height: number;
  now: number;
  reducedMotion: boolean;
};

export type ArenaHeroFrameState = ArenaHeroTransitionCandidate & {
  phase: "stable" | "pending" | "animating";
  targetHeight: number;
};

export type ArenaHeroHeightTransitionPlan =
  | { kind: "settled"; frame: ArenaHeroFrameState }
  | {
      kind: "animate";
      source: ArenaHeroTransitionCandidate;
      fromHeight: number;
      toHeight: number;
      frame: ArenaHeroFrameState;
    };

export function expireDetachedArenaHeroFrameIfCurrent<
  Frame extends ArenaHeroTransitionCandidate,
>(current: Frame | null, detachedFrame: Frame): Frame | null {
  return current === detachedFrame && detachedFrame.detachedAt !== null
    ? null
    : current;
}

/**
 * Starts the browser animation immediately. Keeping this scheduler-free is
 * important: a deferred callback can leave the incoming route visibly held at
 * the outgoing height when the browser delays animation frames.
 */
export function startArenaHeroHeightAnimation<Result>(
  animate: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => Result,
  fromHeight: number,
  toHeight: number,
): Result {
  return animate(
    [
      { height: `${fromHeight}px`, minHeight: `${fromHeight}px` },
      { height: `${toHeight}px`, minHeight: `${toHeight}px` },
    ],
    {
      duration: ARENA_HERO_TRANSITION_DURATION_MS,
      easing: ARENA_HERO_TRANSITION_EASING,
    },
  );
}

export function shouldAnimateArenaHeroHeight(
  previous: ArenaHeroTransitionCandidate | null,
  current: ArenaHeroTransitionEnvironment,
): previous is ArenaHeroTransitionCandidate {
  if (!previous || current.reducedMotion) return false;
  if (previous.pathname === current.pathname) return false;
  if (Math.abs(previous.height - current.height) < 1) return false;

  return previous.detachedAt === null ||
    current.now - previous.detachedAt <= ARENA_HERO_HANDOFF_WINDOW_MS;
}

export function planArenaHeroHeightTransition(
  previous: ArenaHeroTransitionCandidate | null,
  current: ArenaHeroTransitionEnvironment,
): ArenaHeroHeightTransitionPlan {
  if (!shouldAnimateArenaHeroHeight(previous, current)) {
    return {
      kind: "settled",
      frame: {
        pathname: current.pathname,
        height: current.height,
        targetHeight: current.height,
        detachedAt: null,
        phase: "stable",
      },
    };
  }

  return {
    kind: "animate",
    source: previous,
    fromHeight: previous.height,
    toHeight: current.height,
    frame: {
      pathname: current.pathname,
      // This becomes authoritative before animation setup. A navigation that
      // supersedes the handoff therefore starts at the box the user can
      // currently see, not at an older route's target height.
      height: previous.height,
      targetHeight: current.height,
      detachedAt: null,
      phase: "pending",
    },
  };
}
