import { ConvexError } from "convex/values";
import type { ProfileDisplay } from "./adapters/types";

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

export function toStoredDisplay(display: ProfileDisplay) {
  return {
    name: display.name,
    ...(display.avatarUrl === null ? {} : { avatarUrl: display.avatarUrl }),
    ...(display.headline === null ? {} : { headline: display.headline }),
    ...(display.affiliation === null
      ? {}
      : {
          affiliation: {
            name: display.affiliation.name,
            ...(display.affiliation.tag === null ? {} : { tag: display.affiliation.tag }),
          },
        }),
  };
}

export function toPublicDisplay(display: {
  name: string;
  avatarUrl?: string;
  headline?: { label: string; value: number };
  affiliation?: { name: string; tag?: string };
}): ProfileDisplay {
  return {
    name: display.name,
    avatarUrl: display.avatarUrl ?? null,
    headline: display.headline ?? null,
    affiliation: display.affiliation
      ? { name: display.affiliation.name, tag: display.affiliation.tag ?? null }
      : null,
  };
}
