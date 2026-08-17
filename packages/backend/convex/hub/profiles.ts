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

export const preview = action({
  args: { viewerId: v.string(), game: gameIdValidator, playerTag: v.string() },
  returns: summaryResultValidator,
  handler: async (ctx, args) => {
    const key = ownerKey(args.viewerId);
    const tag = publicTag(args.playerTag);
    await ctx.runMutation(internal.hub.internal.connectThrottle.checkAndRecord, { ownerKey: key });
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
