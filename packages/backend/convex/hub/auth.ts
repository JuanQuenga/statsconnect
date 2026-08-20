import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthenticatedCtx = Pick<QueryCtx | MutationCtx, "auth">;

export async function verifiedSubjectOrNull(
  ctx: AuthenticatedCtx,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier ?? null;
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
