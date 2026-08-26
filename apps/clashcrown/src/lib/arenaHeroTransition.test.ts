import assert from "node:assert/strict";
import test from "node:test";
import {
  ARENA_HERO_HANDOFF_WINDOW_MS,
  expireDetachedArenaHeroFrameIfCurrent,
  planArenaHeroHeightTransition,
  startArenaHeroHeightAnimation,
  shouldObserveArenaHeroResize,
  shouldAnimateArenaHeroHeight,
  type ArenaHeroTransitionCandidate,
  type ArenaHeroTransitionEnvironment,
} from "./arenaHeroTransition.ts";

const previous: ArenaHeroTransitionCandidate = {
  pathname: "/",
  height: 680,
  detachedAt: 1_000,
};
const previousDetachedAt = 1_000;

function current(
  overrides: Partial<ArenaHeroTransitionEnvironment> = {},
): ArenaHeroTransitionEnvironment {
  return {
    pathname: "/leaderboards",
    height: 390,
    now: 1_050,
    reducedMotion: false,
    ...overrides,
  };
}

test("animates a recent route handoff when the shared hero height changes", () => {
  assert.equal(shouldAnimateArenaHeroHeight(previous, current()), true);
});

test("does not animate initial mounts or same-route remounts", () => {
  assert.equal(shouldAnimateArenaHeroHeight(null, current()), false);
  assert.equal(
    shouldAnimateArenaHeroHeight(previous, current({ pathname: "/" })),
    false,
  );
});

test("leaves reduced motion in control", () => {
  assert.equal(
    shouldAnimateArenaHeroHeight(previous, current({ reducedMotion: true })),
    false,
  );
});

test("observes resize only after a frame settles", () => {
  assert.equal(shouldObserveArenaHeroResize("stable"), true);
  assert.equal(shouldObserveArenaHeroResize("pending"), false);
  assert.equal(shouldObserveArenaHeroResize("animating"), false);
});

test("does not animate equal heights or a stale detached frame", () => {
  assert.equal(
    shouldAnimateArenaHeroHeight(previous, current({ height: previous.height })),
    false,
  );
  assert.equal(
    shouldAnimateArenaHeroHeight(
      previous,
      current({ now: previousDetachedAt + ARENA_HERO_HANDOFF_WINDOW_MS + 1 }),
    ),
    false,
  );
});

test("a rapid handoff uses the pending route and currently held height", () => {
  const first = planArenaHeroHeightTransition(previous, current());
  assert.equal(first.kind, "animate");
  if (first.kind !== "animate") return;

  assert.deepEqual(first.frame, {
    pathname: "/leaderboards",
    height: 680,
    targetHeight: 390,
    detachedAt: null,
    phase: "pending",
  });

  const second = planArenaHeroHeightTransition(
    { ...first.frame, detachedAt: 1_051 },
    current({ pathname: "/news", height: 336, now: 1_052 }),
  );

  assert.equal(second.kind, "animate");
  if (second.kind !== "animate") return;
  assert.equal(second.fromHeight, 680);
  assert.equal(second.frame.pathname, "/news");
  assert.equal(second.frame.height, 680);
  assert.equal(second.frame.targetHeight, 336);
});

test("starts the height animation synchronously without a frame scheduler", () => {
  const callOrder: string[] = [];
  const result = startArenaHeroHeightAnimation(
    (keyframes, options) => {
      callOrder.push("animate");
      return { keyframes, options };
    },
    680,
    390,
  );
  callOrder.push("returned");

  assert.deepEqual(callOrder, ["animate", "returned"]);
  assert.deepEqual(result.keyframes, [
    { height: "680px", minHeight: "680px" },
    { height: "390px", minHeight: "390px" },
  ]);
  assert.deepEqual(result.options, {
    duration: 520,
    easing: "cubic-bezier(.22, 1, .36, 1)",
  });
});

test("a reused mounted frame animates when new route content changes its height", () => {
  const plan = planArenaHeroHeightTransition(
    {
      pathname: "/news",
      height: 398,
      detachedAt: null,
    },
    current({ pathname: "/cards", height: 336, now: 2_000 }),
  );

  assert.equal(plan.kind, "animate");
  if (plan.kind !== "animate") return;
  assert.equal(plan.fromHeight, 398);
  assert.equal(plan.toHeight, 336);
  assert.equal(plan.frame.pathname, "/cards");
});

test("expires only the detached frame reference that is still current", () => {
  const detached: ArenaHeroTransitionCandidate = {
    pathname: "/news",
    height: 398,
    detachedAt: 2_000,
  };
  const replacement: ArenaHeroTransitionCandidate = {
    pathname: "/cards",
    height: 336,
    detachedAt: null,
  };

  assert.equal(expireDetachedArenaHeroFrameIfCurrent(detached, detached), null);
  assert.equal(
    expireDetachedArenaHeroFrameIfCurrent(replacement, detached),
    replacement,
  );
  assert.equal(
    expireDetachedArenaHeroFrameIfCurrent(null, detached),
    null,
  );
});
