import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";

const kindValidator = v.union(v.literal("players"), v.literal("clans"));
const profileInputValidator = v.object({
  kind: kindValidator,
  tag: v.string(),
  name: v.string(),
  clan: v.optional(v.string()),
});
const recentInputValidator = v.object({
  kind: kindValidator,
  tag: v.string(),
  name: v.string(),
  clan: v.optional(v.string()),
  visitedAt: v.number(),
});
const preferencesValidator = v.object({
  chestAlerts: v.boolean(),
  progressionAlerts: v.boolean(),
  warAlerts: v.boolean(),
});
const profileValidator = v.object({
  kind: kindValidator,
  tag: v.string(),
  name: v.string(),
  clan: v.optional(v.string()),
  isDefault: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const recentValidator = v.object({
  kind: kindValidator,
  tag: v.string(),
  name: v.string(),
  clan: v.optional(v.string()),
  visitedAt: v.number(),
});
const stateValidator = v.object({
  accountId: v.id("personalAccounts"),
  preferences: preferencesValidator,
  profiles: v.array(profileValidator),
  recents: v.array(recentValidator),
  devices: v.array(v.object({ label: v.string(), createdAt: v.number(), lastSeenAt: v.number() })),
  updatedAt: v.number(),
});

const MAX_PROFILES = 50;
const MAX_RECENTS = 12;
const MAX_DEVICES = 20;
const PAIRING_LIFETIME_MS = 10 * 60 * 1000;

type ProfileInput = {
  kind: "players" | "clans";
  tag: string;
  name: string;
  clan?: string;
};

type RecentInput = ProfileInput & { visitedAt: number };

function normalizeTag(tag: string) {
  const normalized = tag.replace(/^#/, "").trim().toUpperCase();
  if (!/^[0289PYLQGRJCUV]{3,15}$/.test(normalized)) throw new Error("Enter a valid Clash Royale tag.");
  return normalized;
}

function cleanLabel(label: string) {
  const clean = label.trim().replace(/\s+/g, " ").slice(0, 60);
  return clean || "Browser";
}

function cleanName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 80) || "Unknown profile";
}

async function hashCapability(secret: string) {
  if (secret.length < 40 || secret.length > 256) throw new Error("Invalid sync capability.");
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deviceForSecret(ctx: QueryCtx | MutationCtx, deviceSecret: string) {
  const secretHash = await hashCapability(deviceSecret);
  return await ctx.db
    .query("personalDevices")
    .withIndex("by_secret_hash", (q) => q.eq("secretHash", secretHash))
    .unique();
}

async function requireDevice(ctx: QueryCtx | MutationCtx, deviceSecret: string) {
  const device = await deviceForSecret(ctx, deviceSecret);
  if (!device) throw new Error("This browser is no longer connected. Start a new local profile or pair it again.");
  return device;
}

async function touchAccount(ctx: MutationCtx, accountId: Id<"personalAccounts">, now: number) {
  await ctx.db.patch(accountId, { updatedAt: now });
}

async function upsertProfile(ctx: MutationCtx, accountId: Id<"personalAccounts">, profile: ProfileInput, now: number) {
  const tag = normalizeTag(profile.tag);
  const existing = await ctx.db
    .query("personalProfiles")
    .withIndex("by_account_id_and_kind_and_tag", (q) => q.eq("accountId", accountId).eq("kind", profile.kind).eq("tag", tag))
    .unique();
  const values = { name: cleanName(profile.name), clan: profile.clan?.trim().slice(0, 80), updatedAt: now };
  if (existing) {
    await ctx.db.patch(existing._id, values);
    return;
  }
  const rows = await ctx.db.query("personalProfiles").withIndex("by_account_id", (q) => q.eq("accountId", accountId)).take(MAX_PROFILES);
  if (rows.length >= MAX_PROFILES) throw new Error(`You can track up to ${MAX_PROFILES} profiles.`);
  await ctx.db.insert("personalProfiles", { accountId, kind: profile.kind, tag, ...values, isDefault: false, createdAt: now });
}

async function upsertRecent(ctx: MutationCtx, accountId: Id<"personalAccounts">, recent: RecentInput) {
  const tag = normalizeTag(recent.tag);
  const existing = await ctx.db
    .query("personalRecents")
    .withIndex("by_account_id_and_kind_and_tag", (q) => q.eq("accountId", accountId).eq("kind", recent.kind).eq("tag", tag))
    .unique();
  const values = {
    name: cleanName(recent.name),
    clan: recent.clan?.trim().slice(0, 80),
    visitedAt: Math.min(recent.visitedAt, Date.now() + 60_000),
  };
  if (existing) await ctx.db.patch(existing._id, values);
  else await ctx.db.insert("personalRecents", { accountId, kind: recent.kind, tag, ...values });

  const rows = await ctx.db
    .query("personalRecents")
    .withIndex("by_account_id", (q) => q.eq("accountId", accountId))
    .order("desc")
    .take(MAX_RECENTS + 1);
  if (rows.length > MAX_RECENTS) {
    const oldest = rows.reduce((candidate, row) => row.visitedAt < candidate.visitedAt ? row : candidate);
    await ctx.db.delete(oldest._id);
  }
}

async function readState(ctx: QueryCtx | MutationCtx, accountId: Id<"personalAccounts">) {
  const account = await ctx.db.get(accountId);
  if (!account) throw new Error("Personalization account not found.");
  const [profiles, recents, devices] = await Promise.all([
    ctx.db.query("personalProfiles").withIndex("by_account_id", (q) => q.eq("accountId", accountId)).take(MAX_PROFILES),
    ctx.db.query("personalRecents").withIndex("by_account_id", (q) => q.eq("accountId", accountId)).take(MAX_RECENTS),
    ctx.db.query("personalDevices").withIndex("by_account_id", (q) => q.eq("accountId", accountId)).take(MAX_DEVICES),
  ]);
  return {
    accountId,
    preferences: {
      chestAlerts: account.chestAlerts,
      progressionAlerts: account.progressionAlerts,
      warAlerts: account.warAlerts,
    },
    profiles: profiles
      .map(({ kind, tag, name, clan, isDefault, createdAt, updatedAt }) => ({ kind, tag, name, clan, isDefault, createdAt, updatedAt }))
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || right.updatedAt - left.updatedAt),
    recents: recents
      .map(({ kind, tag, name, clan, visitedAt }) => ({ kind, tag, name, clan, visitedAt }))
      .sort((left, right) => right.visitedAt - left.visitedAt),
    devices: devices.map(({ label, createdAt, lastSeenAt }) => ({ label, createdAt, lastSeenAt })),
    updatedAt: account.updatedAt,
  };
}

export const ensureAccount = mutation({
  args: {
    deviceSecret: v.string(),
    deviceLabel: v.string(),
    importedProfiles: v.array(profileInputValidator),
    importedRecents: v.array(recentInputValidator),
    importedPreferences: preferencesValidator,
  },
  returns: v.id("personalAccounts"),
  handler: async (ctx, args) => {
    const now = Date.now();
    let device = await deviceForSecret(ctx, args.deviceSecret);
    if (!device) {
      const accountId = await ctx.db.insert("personalAccounts", {
        createdAt: now,
        updatedAt: now,
        ...args.importedPreferences,
      });
      const secretHash = await hashCapability(args.deviceSecret);
      const deviceId = await ctx.db.insert("personalDevices", {
        accountId,
        secretHash,
        label: cleanLabel(args.deviceLabel),
        createdAt: now,
        lastSeenAt: now,
      });
      device = await ctx.db.get(deviceId);
    }
    if (!device) throw new Error("Could not create this browser connection.");
    await ctx.db.patch(device._id, { lastSeenAt: now, label: cleanLabel(args.deviceLabel) });
    for (const profile of args.importedProfiles.slice(0, MAX_PROFILES)) await upsertProfile(ctx, device.accountId, profile, now);
    for (const recent of args.importedRecents.slice(0, MAX_RECENTS)) await upsertRecent(ctx, device.accountId, recent);
    await touchAccount(ctx, device.accountId, now);
    return device.accountId;
  },
});

export const getState = query({
  args: { deviceSecret: v.string() },
  returns: v.union(stateValidator, v.null()),
  handler: async (ctx, args) => {
    const device = await deviceForSecret(ctx, args.deviceSecret);
    return device ? await readState(ctx, device.accountId) : null;
  },
});

export const saveProfile = mutation({
  args: { deviceSecret: v.string(), profile: profileInputValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args.deviceSecret);
    const now = Date.now();
    await upsertProfile(ctx, device.accountId, args.profile, now);
    await touchAccount(ctx, device.accountId, now);
    return null;
  },
});

export const removeProfile = mutation({
  args: { deviceSecret: v.string(), kind: kindValidator, tag: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args.deviceSecret);
    const tag = normalizeTag(args.tag);
    const profile = await ctx.db
      .query("personalProfiles")
      .withIndex("by_account_id_and_kind_and_tag", (q) => q.eq("accountId", device.accountId).eq("kind", args.kind).eq("tag", tag))
      .unique();
    if (profile) await ctx.db.delete(profile._id);
    const observation = await ctx.db
      .query("personalObservations")
      .withIndex("by_account_id_and_kind_and_tag", (q) => q.eq("accountId", device.accountId).eq("kind", args.kind).eq("tag", tag))
      .unique();
    if (observation) await ctx.db.delete(observation._id);
    await touchAccount(ctx, device.accountId, Date.now());
    return null;
  },
});

export const setDefaultProfile = mutation({
  args: { deviceSecret: v.string(), tag: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args.deviceSecret);
    const tag = args.tag === null ? null : normalizeTag(args.tag);
    const profiles = await ctx.db.query("personalProfiles").withIndex("by_account_id", (q) => q.eq("accountId", device.accountId)).take(MAX_PROFILES);
    if (tag !== null && !profiles.some((profile) => profile.kind === "players" && profile.tag === tag)) {
      throw new Error("Save that player before making it your default.");
    }
    for (const profile of profiles) {
      const next = profile.kind === "players" && profile.tag === tag;
      if (profile.isDefault !== next) await ctx.db.patch(profile._id, { isDefault: next, updatedAt: Date.now() });
    }
    await touchAccount(ctx, device.accountId, Date.now());
    return null;
  },
});

export const recordRecent = mutation({
  args: { deviceSecret: v.string(), recent: recentInputValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args.deviceSecret);
    await upsertRecent(ctx, device.accountId, args.recent);
    await touchAccount(ctx, device.accountId, Date.now());
    return null;
  },
});

export const clearRecents = mutation({
  args: { deviceSecret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args.deviceSecret);
    const recents = await ctx.db.query("personalRecents").withIndex("by_account_id", (q) => q.eq("accountId", device.accountId)).take(MAX_RECENTS);
    for (const recent of recents) await ctx.db.delete(recent._id);
    await touchAccount(ctx, device.accountId, Date.now());
    return null;
  },
});

export const updatePreferences = mutation({
  args: { deviceSecret: v.string(), preferences: preferencesValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args.deviceSecret);
    await ctx.db.patch(device.accountId, { ...args.preferences, updatedAt: Date.now() });
    return null;
  },
});

const alertValidator = v.object({
  type: v.union(v.literal("chest"), v.literal("progression"), v.literal("war")),
  title: v.string(),
  body: v.string(),
});

export const observeProfile = mutation({
  args: {
    deviceSecret: v.string(),
    kind: kindValidator,
    tag: v.string(),
    name: v.string(),
    trophies: v.optional(v.number()),
    chestName: v.optional(v.string()),
    chestIndex: v.optional(v.number()),
    warTrophies: v.optional(v.number()),
  },
  returns: v.array(alertValidator),
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args.deviceSecret);
    const tag = normalizeTag(args.tag);
    const tracked = await ctx.db
      .query("personalProfiles")
      .withIndex("by_account_id_and_kind_and_tag", (q) => q.eq("accountId", device.accountId).eq("kind", args.kind).eq("tag", tag))
      .unique();
    if (!tracked) return [];
    const account = await ctx.db.get(device.accountId);
    if (!account) return [];
    const previous = await ctx.db
      .query("personalObservations")
      .withIndex("by_account_id_and_kind_and_tag", (q) => q.eq("accountId", device.accountId).eq("kind", args.kind).eq("tag", tag))
      .unique();
    const alerts: Array<{ type: "chest" | "progression" | "war"; title: string; body: string }> = [];
    if (previous && account.progressionAlerts && args.trophies !== undefined && previous.trophies !== undefined && args.trophies > previous.trophies) {
      alerts.push({ type: "progression", title: `${cleanName(args.name)} gained trophies`, body: `${previous.trophies.toLocaleString()} → ${args.trophies.toLocaleString()} trophies.` });
    }
    if (previous && account.chestAlerts && args.chestName && previous.chestName && (args.chestName !== previous.chestName || args.chestIndex !== previous.chestIndex)) {
      alerts.push({ type: "chest", title: `${cleanName(args.name)} has a new next chest`, body: `${args.chestName}${args.chestIndex ? ` at +${args.chestIndex}` : " is next"}.` });
    }
    if (previous && account.warAlerts && args.warTrophies !== undefined && previous.warTrophies !== undefined && args.warTrophies > previous.warTrophies) {
      alerts.push({ type: "war", title: `${cleanName(args.name)} advanced in war`, body: `${previous.warTrophies.toLocaleString()} → ${args.warTrophies.toLocaleString()} war trophies.` });
    }
    const values = {
      trophies: args.trophies,
      chestName: args.chestName,
      chestIndex: args.chestIndex,
      warTrophies: args.warTrophies,
      observedAt: Date.now(),
    };
    if (previous) await ctx.db.patch(previous._id, values);
    else await ctx.db.insert("personalObservations", { accountId: device.accountId, kind: args.kind, tag, ...values });
    return alerts;
  },
});

export const createPairingCode = mutation({
  args: { deviceSecret: v.string(), codeSecret: v.string() },
  returns: v.object({ expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args.deviceSecret);
    const now = Date.now();
    const existing = await ctx.db.query("personalPairingCodes").withIndex("by_account_id", (q) => q.eq("accountId", device.accountId)).take(6);
    for (const code of existing) await ctx.db.delete(code._id);
    const codeHash = await hashCapability(args.codeSecret);
    const expiresAt = now + PAIRING_LIFETIME_MS;
    await ctx.db.insert("personalPairingCodes", { accountId: device.accountId, codeHash, createdAt: now, expiresAt });
    return { expiresAt };
  },
});

async function mergeAccount(ctx: MutationCtx, sourceId: Id<"personalAccounts">, targetId: Id<"personalAccounts">, removeSource: boolean) {
  if (sourceId === targetId) return;
  const sourceProfiles = await ctx.db.query("personalProfiles").withIndex("by_account_id", (q) => q.eq("accountId", sourceId)).take(MAX_PROFILES);
  const sourceRecents = await ctx.db.query("personalRecents").withIndex("by_account_id", (q) => q.eq("accountId", sourceId)).take(MAX_RECENTS);
  const sourceObservations = await ctx.db.query("personalObservations").withIndex("by_account_id", (q) => q.eq("accountId", sourceId)).take(MAX_PROFILES);
  for (const profile of sourceProfiles) {
    await upsertProfile(ctx, targetId, profile, profile.updatedAt);
    if (removeSource) await ctx.db.delete(profile._id);
  }
  for (const recent of sourceRecents) {
    await upsertRecent(ctx, targetId, recent);
    if (removeSource) await ctx.db.delete(recent._id);
  }
  for (const observation of sourceObservations) {
    const existing = await ctx.db
      .query("personalObservations")
      .withIndex("by_account_id_and_kind_and_tag", (q) => q.eq("accountId", targetId).eq("kind", observation.kind).eq("tag", observation.tag))
      .unique();
    const values = {
      trophies: observation.trophies,
      chestName: observation.chestName,
      chestIndex: observation.chestIndex,
      warTrophies: observation.warTrophies,
      observedAt: observation.observedAt,
    };
    if (!existing) await ctx.db.insert("personalObservations", { accountId: targetId, kind: observation.kind, tag: observation.tag, ...values });
    else if (observation.observedAt > existing.observedAt) await ctx.db.patch(existing._id, values);
    if (removeSource) await ctx.db.delete(observation._id);
  }
}

export const redeemPairingCode = mutation({
  args: { deviceSecret: v.string(), codeSecret: v.string(), deviceLabel: v.string() },
  returns: v.id("personalAccounts"),
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args.deviceSecret);
    const codeHash = await hashCapability(args.codeSecret);
    const pairing = await ctx.db.query("personalPairingCodes").withIndex("by_code_hash", (q) => q.eq("codeHash", codeHash)).unique();
    if (!pairing || pairing.expiresAt < Date.now()) throw new Error("That pairing code is invalid or has expired.");
    const devices = await ctx.db.query("personalDevices").withIndex("by_account_id", (q) => q.eq("accountId", pairing.accountId)).take(MAX_DEVICES);
    if (devices.length >= MAX_DEVICES && device.accountId !== pairing.accountId) throw new Error(`This sync profile already has ${MAX_DEVICES} browsers.`);
    const previousAccountId = device.accountId;
    const sourceDevices = previousAccountId === pairing.accountId
      ? []
      : await ctx.db.query("personalDevices").withIndex("by_account_id", (q) => q.eq("accountId", previousAccountId)).take(2);
    const removeSource = sourceDevices.length <= 1;
    await mergeAccount(ctx, previousAccountId, pairing.accountId, removeSource);
    await ctx.db.patch(device._id, { accountId: pairing.accountId, label: cleanLabel(args.deviceLabel), lastSeenAt: Date.now() });
    await ctx.db.delete(pairing._id);
    await touchAccount(ctx, pairing.accountId, Date.now());
    if (previousAccountId !== pairing.accountId && removeSource) {
      const remaining = await ctx.db.query("personalDevices").withIndex("by_account_id", (q) => q.eq("accountId", previousAccountId)).take(1);
      if (!remaining.length) {
        const old = await ctx.db.get(previousAccountId);
        if (old) await ctx.db.delete(previousAccountId);
      }
    }
    return pairing.accountId;
  },
});

export const clearAccount = mutation({
  args: { deviceSecret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args.deviceSecret);
    const accountId = device.accountId;
    const [profiles, recents, observations, codes, devices] = await Promise.all([
      ctx.db.query("personalProfiles").withIndex("by_account_id", (q) => q.eq("accountId", accountId)).take(MAX_PROFILES),
      ctx.db.query("personalRecents").withIndex("by_account_id", (q) => q.eq("accountId", accountId)).take(MAX_RECENTS),
      ctx.db.query("personalObservations").withIndex("by_account_id", (q) => q.eq("accountId", accountId)).take(MAX_PROFILES),
      ctx.db.query("personalPairingCodes").withIndex("by_account_id", (q) => q.eq("accountId", accountId)).take(6),
      ctx.db.query("personalDevices").withIndex("by_account_id", (q) => q.eq("accountId", accountId)).take(MAX_DEVICES),
    ]);
    for (const row of [...profiles, ...recents, ...observations, ...codes, ...devices]) await ctx.db.delete(row._id);
    await ctx.db.delete(accountId);
    return null;
  },
});
