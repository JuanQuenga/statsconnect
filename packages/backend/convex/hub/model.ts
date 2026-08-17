import { ConvexError } from "convex/values";

const VIEWER_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ownerKey(viewerId: string): string {
  if (!VIEWER_RE.test(viewerId)) {
    throw new ConvexError({
      code: "INVALID_VIEWER",
      message: "StatsConnect could not identify this browser session.",
    });
  }
  return `session:${viewerId.toLowerCase()}`;
}
