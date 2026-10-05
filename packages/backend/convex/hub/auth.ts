import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthenticatedCtx = Pick<QueryCtx | MutationCtx, "auth">;

/**
 * The Clerk user ID (`user_...` from the JWT `sub` claim) is the canonical
 * account key across the hub: savedProfiles.ownerId, accountEntitlements
 * .subject, and watchDemands.subject all store it. tokenIdentifier embeds the
 * Clerk issuer domain and is never persisted.
 */
export async function verifiedSubjectOrNull(
  ctx: AuthenticatedCtx,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

export async function requireVerifiedSubject(
  ctx: AuthenticatedCtx,
): Promise<string> {
  const subject = await verifiedSubjectOrNull(ctx);
  if (!subject) {
    throw new ConvexError({
      code: "AUTH_REQUIRED",
      message:
        "StatsConnect+ changes require a verified account. Browser viewer IDs are not authentication.",
    });
  }
  return subject;
}
