import { ConvexError } from "convex/values";

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

/**
 * Force refreshes bypass the read-through cache and spend upstream budget.
 * Keep this check at every public action boundary that accepts `force`.
 */
export function requireForceAuthorization(args: { readonly force?: boolean; readonly adminKey?: string }): void {
  if (!args.force) return;

  const expected = process.env.BETA_ADMIN_KEY;
  const provided = args.adminKey ?? "";
  const matches = expected !== undefined && expected.length > 0 && provided.length === expected.length &&
    [...expected].every((character, index) => character === provided[index]);
  if (!matches) {
    throw new ConvexError({
      code: "FORCE_NOT_AUTHORIZED",
      message: "Force refresh requires the admin key."
    });
  }
}
