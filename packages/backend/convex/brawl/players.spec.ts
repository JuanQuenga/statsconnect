import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.modules";
import { rosterFingerprint } from "./rosterPolicy";

const MINUTE = 60_000;
const START = Date.UTC(2026, 8, 1, 1, 0, 0);

function brawler(id: number, trophies: number) {
  return {
    id,
    name: `Brawler ${id}`,
    power: 11,
    rank: 30,
    trophies,
    highestTrophies: trophies,
    gadgets: [{ id: 1, name: "Gadget" }],
    starPowers: [],
    gears: [],
    hypercharges: [],
  };
}

function profile(trophies: number, brawlers?: ReturnType<typeof brawler>[]) {
  return {
    tag: "#2PP",
    name: "Player",
    trophies,
    highestTrophies: trophies,
    expLevel: 100,
    victory3v3: 10,
    soloVictories: 1,
    duoVictories: 1,
    brawlerCount: brawlers?.length ?? 0,
    power11Count: brawlers?.length ?? 0,
    ...(brawlers ? { brawlers } : {}),
  };
}

async function stored(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => ({
    snapshot: await ctx.db.query("playerSnapshots").first(),
    roster: await ctx.db.query("playerSnapshotRosters").first(),
  }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("recordProfile roster refresh spacing", () => {
  test("defers a roster change inside the window and writes it once due", async () => {
    vi.stubEnv("BRAWL_ROSTER_REFRESH_MINUTES", "60");
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = convexTest(schema, modules);
    const first = [brawler(16_000_000, 500)];
    const second = [brawler(16_000_000, 510)];

    vi.setSystemTime(START);
    expect(await t.mutation(internal.brawl.players.recordProfile, profile(500, first))).toEqual({ createdSnapshot: true });

    vi.setSystemTime(START + 10 * MINUTE);
    await t.mutation(internal.brawl.players.recordProfile, profile(510, second));
    let state = await stored(t);
    expect(state.snapshot?.trophies).toBe(510);
    expect(state.snapshot?.rosterFingerprint).toBe(rosterFingerprint(first));
    expect(state.snapshot?.rosterRecordedAt).toBe(START);
    expect(state.roster?.brawlers[0].trophies).toBe(500);

    vi.setSystemTime(START + 61 * MINUTE);
    await t.mutation(internal.brawl.players.recordProfile, profile(510, second));
    state = await stored(t);
    expect(state.snapshot?.rosterFingerprint).toBe(rosterFingerprint(second));
    expect(state.snapshot?.rosterRecordedAt).toBe(START + 61 * MINUTE);
    expect(state.roster?.brawlers[0].trophies).toBe(510);

    const history = await t.query(api.brawl.players.history, { tag: "#2PP" });
    expect(history[0].rosterRecordedAt).toBe(START + 61 * MINUTE);
  });

  test("rewrites on every change when the spacing is unset", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = convexTest(schema, modules);
    vi.setSystemTime(START);
    await t.mutation(internal.brawl.players.recordProfile, profile(500, [brawler(16_000_000, 500)]));
    vi.setSystemTime(START + MINUTE);
    await t.mutation(internal.brawl.players.recordProfile, profile(510, [brawler(16_000_000, 510)]));
    const state = await stored(t);
    expect(state.roster?.brawlers[0].trophies).toBe(510);
    expect(state.snapshot?.rosterRecordedAt).toBe(START + MINUTE);
  });

  test("a snapshot without roster data neither stamps nor throttles the first roster", async () => {
    vi.stubEnv("BRAWL_ROSTER_REFRESH_MINUTES", "60");
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = convexTest(schema, modules);
    vi.setSystemTime(START);
    await t.mutation(internal.brawl.players.recordProfile, profile(500));
    let state = await stored(t);
    expect(state.snapshot?.rosterRecordedAt).toBeUndefined();
    expect(state.roster).toBeNull();

    vi.setSystemTime(START + MINUTE);
    await t.mutation(internal.brawl.players.recordProfile, profile(500, [brawler(16_000_000, 500)]));
    state = await stored(t);
    expect(state.roster?.brawlers).toHaveLength(1);
    expect(state.snapshot?.rosterRecordedAt).toBe(START + MINUTE);

    vi.setSystemTime(START + 2 * MINUTE);
    await t.mutation(internal.brawl.players.recordProfile, profile(501, []));
    state = await stored(t);
    expect(state.snapshot?.trophies).toBe(501);
    expect(state.roster?.brawlers).toHaveLength(1);
  });

  test("history leaves the capture time unset for legacy inline rosters", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.brawl.players.recordProfile, profile(500, [brawler(16_000_000, 500)]));
    await t.run(async (ctx) => {
      const snapshot = await ctx.db.query("playerSnapshots").first();
      const roster = await ctx.db.query("playerSnapshotRosters").first();
      if (!snapshot || !roster) throw new Error("expected a snapshot and roster");
      await ctx.db.patch(snapshot._id, { brawlers: roster.brawlers, rosterRecordedAt: undefined });
      await ctx.db.delete(roster._id);
    });
    const [day] = await t.query(api.brawl.players.history, { tag: "#2PP" });
    expect(day.brawlers).toHaveLength(1);
    expect(day.rosterRecordedAt).toBeUndefined();
  });
});
