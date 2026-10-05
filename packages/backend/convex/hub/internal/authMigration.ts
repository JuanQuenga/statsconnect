import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { internalMutation, internalQuery } from "../../_generated/server";

/**
 * One-time Better Auth → Clerk identity rekey, driven through `convex run`
 * during the cutover (scripts/migrate-auth-to-clerk.ts exports the mapping).
 * Every mutation is idempotent and paginated so it is safe to re-run; rows
 * without a mapping are counted as orphans and left untouched — never
 * deleted. The authMigration ledger is the rollback source of truth.
 */

const CLERK_SUBJECT_PREFIX = "user_";
const PAGE_SIZE = 100;
const MAX_ORPHAN_HEADS = 5;

const rekeyTableValidator = v.union(
  v.literal("savedProfiles"),
  v.literal("accountEntitlements"),
  v.literal("watchDemands"),
  v.literal("billingEventReceipts"),
);

const rekeyResultValidator = v.object({
  cursor: v.union(v.string(), v.null()),
  scanned: v.number(),
  rekeyed: v.number(),
  orphans: v.number(),
  orphanHeads: v.array(v.string()),
});

type RekeyRow = { _id: unknown; ownerId?: string; subject?: string };

type RekeyableId =
  | Id<"savedProfiles">
  | Id<"accountEntitlements">
  | Id<"watchDemands">
  | Id<"billingEventReceipts">;

type RekeyableRow = {
  _id: RekeyableId;
  ownerId?: string;
  subject?: string;
};

function isClerkSubject(value: string): boolean {
  return value.startsWith(CLERK_SUBJECT_PREFIX);
}

function rowIdentity(row: RekeyRow): string | undefined {
  return row.ownerId ?? row.subject;
}

async function applyIdentity(
  ctx: MutationCtx,
  row: RekeyableRow,
  identity: string,
): Promise<void> {
  // Only savedProfiles rows carry ownerId; the subject tables are guarded by
  // the field check, matching how the row was read in rowIdentity.
  if (row.ownerId !== undefined) await ctx.db.patch(row._id, { ownerId: identity });
  else await ctx.db.patch(row._id, { subject: identity });
}

async function mappedSubject(
  ctx: Pick<MutationCtx | QueryCtx, "db">,
  oldId: string,
): Promise<string | null> {
  const entry = await ctx.db
    .query("authMigration")
    .withIndex("by_old_id", (index) => index.eq("oldId", oldId))
    .unique();
  return entry?.newSubject ?? null;
}

async function rekeyPage(
  ctx: MutationCtx,
  table: "savedProfiles" | "accountEntitlements" | "watchDemands" | "billingEventReceipts",
  cursor: string | null,
) {
  const { page, isDone, continueCursor } = await ctx.db
    .query(table)
    .paginate({ numItems: PAGE_SIZE, cursor });
  let rekeyed = 0;
  let orphans = 0;
  const orphanHeads: string[] = [];
  for (const row of page) {
    const current = rowIdentity(row);
    if (current === undefined || isClerkSubject(current)) continue;
    const next = await mappedSubject(ctx, current);
    if (!next) {
      orphans++;
      if (orphanHeads.length < MAX_ORPHAN_HEADS) orphanHeads.push(current);
      continue;
    }
    await applyIdentity(ctx, row, next);
    rekeyed++;
  }
  return {
    cursor: isDone ? null : continueCursor,
    scanned: page.length,
    rekeyed,
    orphans,
    orphanHeads,
  };
}

async function rollbackPage(
  ctx: MutationCtx,
  table: "savedProfiles" | "accountEntitlements" | "watchDemands" | "billingEventReceipts",
  cursor: string | null,
) {
  const { page, isDone, continueCursor } = await ctx.db
    .query(table)
    .paginate({ numItems: PAGE_SIZE, cursor });
  let rekeyed = 0;
  let orphans = 0;
  const orphanHeads: string[] = [];
  for (const row of page) {
    const current = rowIdentity(row);
    if (current === undefined || !isClerkSubject(current)) continue;
    const entry = await ctx.db
      .query("authMigration")
      .withIndex("by_new_subject", (index) => index.eq("newSubject", current))
      .unique();
    if (!entry) {
      orphans++;
      if (orphanHeads.length < MAX_ORPHAN_HEADS) orphanHeads.push(current);
      continue;
    }
    await applyIdentity(ctx, row, entry.oldId);
    rekeyed++;
  }
  return {
    cursor: isDone ? null : continueCursor,
    scanned: page.length,
    rekeyed,
    orphans,
    orphanHeads,
  };
}

export const importMapping = internalMutation({
  args: {
    entries: v.array(v.object({
      oldId: v.string(),
      newSubject: v.string(),
      email: v.optional(v.string()),
    })),
  },
  returns: v.object({ imported: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    let imported = 0;
    let updated = 0;
    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("authMigration")
        .withIndex("by_old_id", (index) => index.eq("oldId", entry.oldId))
        .unique();
      if (!existing) {
        await ctx.db.insert("authMigration", {
          oldId: entry.oldId,
          newSubject: entry.newSubject,
          ...(entry.email === undefined ? {} : { email: entry.email }),
          migratedAt: now,
        });
        imported++;
      } else if (existing.newSubject !== entry.newSubject) {
        await ctx.db.patch(existing._id, { newSubject: entry.newSubject, migratedAt: now });
        updated++;
      }
    }
    return { imported, updated };
  },
});

export const rekeySavedProfiles = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: rekeyResultValidator,
  handler: async (ctx, args) => rekeyPage(ctx, "savedProfiles", args.cursor ?? null),
});

export const rekeyEntitlements = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: rekeyResultValidator,
  handler: async (ctx, args) => rekeyPage(ctx, "accountEntitlements", args.cursor ?? null),
});

export const rekeyWatchDemands = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: rekeyResultValidator,
  handler: async (ctx, args) => rekeyPage(ctx, "watchDemands", args.cursor ?? null),
});

export const rekeyBillingReceipts = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: rekeyResultValidator,
  handler: async (ctx, args) => rekeyPage(ctx, "billingEventReceipts", args.cursor ?? null),
});

export const migrationStatus = internalQuery({
  args: {},
  returns: v.object({
    mappingEntries: v.number(),
    savedProfilesRemaining: v.number(),
    accountEntitlementsRemaining: v.number(),
    watchDemandsRemaining: v.number(),
    billingEventReceiptsRemaining: v.number(),
    orphanHeads: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const collectUnrekeyed = async (
      table: "savedProfiles" | "accountEntitlements" | "watchDemands" | "billingEventReceipts",
    ): Promise<string[]> => {
      const rows: RekeyRow[] = await ctx.db.query(table).collect();
      return rows
        .map(rowIdentity)
        .filter((value): value is string => value !== undefined && !isClerkSubject(value));
    };
    const unmappedOwners = await collectUnrekeyed("savedProfiles");
    const unmappedEntitlements = await collectUnrekeyed("accountEntitlements");
    const unmappedDemands = await collectUnrekeyed("watchDemands");
    const unmappedReceipts = await collectUnrekeyed("billingEventReceipts");
    const orphans = [
      ...new Set([...unmappedOwners, ...unmappedEntitlements, ...unmappedDemands, ...unmappedReceipts]),
    ];
    return {
      mappingEntries: (await ctx.db.query("authMigration").collect()).length,
      savedProfilesRemaining: unmappedOwners.length,
      accountEntitlementsRemaining: unmappedEntitlements.length,
      watchDemandsRemaining: unmappedDemands.length,
      billingEventReceiptsRemaining: unmappedReceipts.length,
      orphanHeads: orphans.slice(0, MAX_ORPHAN_HEADS),
    };
  },
});

export const rollbackRekey = internalMutation({
  args: { table: rekeyTableValidator, cursor: v.optional(v.string()) },
  returns: rekeyResultValidator,
  handler: async (ctx, args) => rollbackPage(ctx, args.table, args.cursor ?? null),
});
