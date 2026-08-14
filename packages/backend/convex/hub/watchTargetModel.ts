import type { MutationCtx } from "../_generated/server";
import type { GameId } from "./adapters/types";
import {
  refreshCadenceFor,
  scheduledAt,
  type RefreshCadence,
} from "./scheduling";

export type WatchEntity = "player" | "club";

export function watchTargetKey(
  game: GameId,
  entity: WatchEntity,
  tag: string,
): string {
  return `${game}:${entity}:${tag.replace(/^#/, "").toUpperCase()}`;
}

type TargetIdentity = {
  game: GameId;
  entity: WatchEntity;
  tag: string;
};

async function getTarget(ctx: MutationCtx, targetKey: string) {
  return ctx.db
    .query("watchTargets")
    .withIndex("by_target_key", (query) => query.eq("targetKey", targetKey))
    .unique();
}

export async function registerConnectedProfile(
  ctx: MutationCtx,
  target: TargetIdentity,
  options: { now: number; nextDueAt: number },
): Promise<string> {
  const targetKey = watchTargetKey(target.game, target.entity, target.tag);
  const nextDueAt = Math.max(
    options.nextDueAt,
    scheduledAt("active", targetKey, options.now),
  );
  const existing = await getTarget(ctx, targetKey);
  if (existing) {
    await ctx.db.patch(existing._id, {
      connectedProfileCount: existing.connectedProfileCount + 1,
      status: "active",
      cadence: "active",
      nextDueAt: Math.min(existing.nextDueAt, nextDueAt),
      lastActivityAt: options.now,
      idleAt: undefined,
      updatedAt: options.now,
    });
    return targetKey;
  }

  await ctx.db.insert("watchTargets", {
    targetKey,
    ...target,
    connectedProfileCount: 1,
    watcherCount: 0,
    tier: "free",
    status: "active",
    cadence: "active",
    nextDueAt,
    lastActivityAt: options.now,
    consecutiveFailures: 0,
    createdAt: options.now,
    updatedAt: options.now,
  });
  return targetKey;
}

export async function unregisterConnectedProfile(
  ctx: MutationCtx,
  targetKey: string,
  now: number,
): Promise<void> {
  const existing = await getTarget(ctx, targetKey);
  if (!existing) return;
  const connectedProfileCount = Math.max(0, existing.connectedProfileCount - 1);
  const idle = connectedProfileCount === 0 && existing.watcherCount === 0;
  await ctx.db.patch(existing._id, {
    connectedProfileCount,
    status: idle ? "idle" : "active",
    cadence: existing.watcherCount > 0 ? "active" : existing.cadence,
    ...(idle ? { idleAt: now } : {}),
    updatedAt: now,
  });
}

export async function registerWatcher(
  ctx: MutationCtx,
  target: TargetIdentity,
  now: number,
): Promise<string> {
  const targetKey = watchTargetKey(target.game, target.entity, target.tag);
  const existing = await getTarget(ctx, targetKey);
  if (existing) {
    await ctx.db.patch(existing._id, {
      watcherCount: existing.watcherCount + 1,
      tier: "premium",
      status: "active",
      cadence: "active",
      nextDueAt: Math.min(existing.nextDueAt, now),
      idleAt: undefined,
      updatedAt: now,
    });
    return targetKey;
  }

  await ctx.db.insert("watchTargets", {
    targetKey,
    ...target,
    connectedProfileCount: 0,
    watcherCount: 1,
    tier: "premium",
    status: "active",
    cadence: "active",
    nextDueAt: now,
    lastActivityAt: now,
    consecutiveFailures: 0,
    createdAt: now,
    updatedAt: now,
  });
  return targetKey;
}

export async function unregisterWatcher(
  ctx: MutationCtx,
  targetKey: string,
  now: number,
): Promise<void> {
  const existing = await getTarget(ctx, targetKey);
  if (!existing) return;
  const watcherCount = Math.max(0, existing.watcherCount - 1);
  const idle = watcherCount === 0 && existing.connectedProfileCount === 0;
  const cadence = refreshCadenceFor({
    watcherCount,
    lastActivityAt: existing.lastActivityAt,
    now,
  });
  await ctx.db.patch(existing._id, {
    watcherCount,
    tier: watcherCount > 0 ? "premium" : "free",
    status: idle ? "idle" : "active",
    cadence,
    nextDueAt: idle
      ? existing.nextDueAt
      : Math.min(existing.nextDueAt, scheduledAt(cadence, targetKey, now)),
    ...(idle ? { idleAt: now } : {}),
    updatedAt: now,
  });
}

export async function touchTarget(
  ctx: MutationCtx,
  targetKey: string,
  options: { now: number; notBefore: number; preserveEarlier?: boolean },
): Promise<void> {
  const existing = await getTarget(ctx, targetKey);
  if (!existing || existing.status === "idle") return;
  const nextDueAt = Math.max(
    options.notBefore,
    scheduledAt("active", targetKey, options.now),
  );
  await ctx.db.patch(existing._id, {
    cadence: "active",
    lastActivityAt: options.now,
    nextDueAt: options.preserveEarlier
      ? Math.min(existing.nextDueAt, nextDueAt)
      : nextDueAt,
    updatedAt: options.now,
  });
}

export async function completeTargetPoll(
  ctx: MutationCtx,
  targetKey: string,
  options: { now: number; succeeded: boolean },
): Promise<void> {
  const existing = await getTarget(ctx, targetKey);
  if (!existing) return;
  const idle = existing.connectedProfileCount === 0 && existing.watcherCount === 0;
  const cadence: RefreshCadence = refreshCadenceFor({
    watcherCount: existing.watcherCount,
    lastActivityAt: existing.lastActivityAt,
    now: options.now,
  });
  await ctx.db.patch(existing._id, {
    status: idle ? "idle" : "active",
    cadence,
    nextDueAt: scheduledAt(cadence, targetKey, options.now),
    lastPolledAt: options.now,
    consecutiveFailures: options.succeeded
      ? 0
      : existing.consecutiveFailures + 1,
    ...(idle ? { idleAt: options.now } : {}),
    updatedAt: options.now,
  });
}
