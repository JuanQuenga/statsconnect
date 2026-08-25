import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { isProfileSummary } from "./adapters/guards";
import { getAdapter } from "./adapters/registry";
import { normalizeTag } from "./adapters/tags";
import { AdapterError } from "./adapters/types";
import { readThrough } from "./cacheAccess";
import { ownerKey } from "./model";
import { gameIdValidator, summaryResultValidator } from "./validators";

function publicTag(input: string): string {
  try {
    return normalizeTag(input);
  } catch (error) {
    if (error instanceof AdapterError) {
      throw new ConvexError({ code: error.code, message: error.message });
    }
    throw error;
  }
}

const ANONYMOUS_GLOBAL_WINDOW_MS = 60_000;
const ANONYMOUS_GLOBAL_MAX = 120;

export const preview = action({
  args: { viewerId: v.string(), game: gameIdValidator, playerTag: v.string() },
  returns: summaryResultValidator,
  handler: async (ctx, args) => {
    const tag = publicTag(args.playerTag);
    const identity = await ctx.auth.getUserIdentity();
    // Authenticated callers throttle on their tokenIdentifier so a rotating
    // viewerId cannot evade the per-viewer limit. Anonymous callers fall back
    // to the client key plus a shared global window that bounds total
    // upstream proxy traffic even when keys are spoofed.
    const throttleKey = identity ? ownerKey(identity.tokenIdentifier) : ownerKey(args.viewerId);
    await ctx.runMutation(internal.hub.internal.connectThrottle.checkAndRecord, {
      ownerKey: throttleKey,
    });
    if (!identity) {
      await ctx.runMutation(internal.hub.internal.connectThrottle.checkAndRecordGlobal, {});
    }
    const adapter = getAdapter(args.game);
    const { result } = await readThrough(ctx, {
      game: args.game,
      playerTag: tag,
      resource: "summary",
      guard: isProfileSummary,
      load: () => adapter.getProfileSummary(tag),
    });
    return result;
  },
});
