import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.modules";
import { dayKey, type DeckObservation } from "./lib/battles";
import { cardSummaryFreezeAt } from "./summaryPolicy";

const DAY_MS = 86_400_000;
const CARDS = [26000000, 26000001, 26000002, 26000003, 26000004, 26000005, 26000006, 26000007];
const OPPONENT = [26000010, 26000011, 26000012, 26000013, 26000014, 26000015, 26000016, 26000017];

function side(fingerprint: string, battleTime: number, cardIds: number[], won: boolean): DeckObservation {
  return {
    fingerprint,
    battleTime,
    mode: "ladder",
    gameMode: "Ladder",
    deckHash: cardIds.join("-"),
    cardIds,
    evolutionIds: [],
    won,
    crowns: won ? 1 : 0,
    opponentCrowns: won ? 0 : 1,
  };
}

function battle(fingerprint: string, battleTime: number, left = CARDS, right = OPPONENT) {
  return [side(fingerprint, battleTime, left, true), side(fingerprint, battleTime, right, false)];
}

/** The ranking the old full by_day scan produced: stable sort of creation order by uses. */
function oldRanking(rows: Doc<"deckStats">[], minUses: number, topN: number) {
  return rows
    .filter((row) => row.uses >= minUses)
    .sort((left, right) => right.uses - left.uses)
    .slice(0, topN)
    .map((row) => row.deckHash);
}

describe("rankableDecksForDay", () => {
  test("matches the full-scan ranking when ties straddle the cap", async () => {
    const t = convexTest(schema, modules);
    const day = 20260901;
    await t.run(async (ctx) => {
      const insert = (deckHash: string, uses: number) =>
        ctx.db.insert("deckStats", {
          day,
          mode: "ladder",
          deckHash,
          cardIds: CARDS,
          evolutionIds: [],
          uses,
          wins: 0,
          crowns: 0,
        });
      for (let index = 0; index < 1_001; index += 1) await insert(`tie-${index}`, 5);
      for (let index = 0; index < 10; index += 1) await insert(`top-${index}`, 9);
      for (let index = 0; index < 20; index += 1) await insert(`low-${index}`, 3);
    });
    const all = await t.run((ctx) =>
      ctx.db.query("deckStats").withIndex("by_day", (q) => q.eq("day", day)).collect()
    );

    const result = await t.query(internal.clash.meta.rankableDecksForDay, {
      day,
      mode: "ladder",
      minUses: 5,
      limit: 100,
    });
    const ranked = oldRanking(result.rows, 5, 100);
    expect(ranked).toEqual(oldRanking(all, 5, 100));
    expect(ranked.slice(10, 12)).toEqual(["tie-0", "tie-1"]);
    expect(ranked.at(-1)).toBe("tie-89");
  });

  test("returns every qualifying deck when fewer than the cap exist", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const [deckHash, uses] of [["a", 7], ["b", 5], ["c", 7], ["d", 4]] as const) {
        await ctx.db.insert("deckStats", {
          day: 20260901,
          mode: "ladder",
          deckHash,
          cardIds: CARDS,
          evolutionIds: [],
          uses,
          wins: 0,
          crowns: 0,
        });
      }
    });
    const result = await t.query(internal.clash.meta.rankableDecksForDay, {
      day: 20260901,
      mode: "ladder",
      minUses: 5,
      limit: 100,
    });
    expect(oldRanking(result.rows, 5, 100)).toEqual(["a", "c", "b"]);
  });
});

describe("ingestBattles", () => {
  test("drops malformed decks so card uses / 8 stays the exact deck total", async () => {
    const t = convexTest(schema, modules);
    const time = Date.now();
    const sevenCards = CARDS.slice(0, 7);
    const malformed = Array.from({ length: 5 }, (_, index) =>
      battle(`bad-${index}`, time, sevenCards, OPPONENT)
    ).flat();
    const valid = [...battle("good-0", time), ...battle("good-1", time)];

    const result = await t.mutation(internal.clash.meta.ingestBattles, {
      observations: [...malformed, ...valid],
      revisitSeconds: 60,
    });
    expect(result).toEqual({ battles: 2, observations: 4 });

    const ranking = await t.query(internal.clash.meta.rankableDecksForDay, {
      day: dayKey(time),
      mode: "ladder",
      minUses: 1,
      limit: 100,
    });
    const deckUses = ranking.rows.reduce((total, row) => total + row.uses, 0);
    expect(deckUses).toBe(4);
    expect(ranking.totalUses).toBe(deckUses);
  });

  test("late battles mark a frozen summary dirty and rebuild it once per refresh window", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const day = dayKey(now - 5 * DAY_MS);
    const battleTime = now - 5 * DAY_MS;
    expect(now).toBeGreaterThanOrEqual(cardSummaryFreezeAt(day));
    const marker = () =>
      t.run((ctx) =>
        ctx.db.query("cardSummaryRuns").withIndex("by_mode_and_day", (q) => q.eq("mode", "ladder").eq("day", day)).unique()
      );
    const summaryUses = async () =>
      (await t.run((ctx) =>
        ctx.db
          .query("cardDaySummaries")
          .withIndex("by_mode_card_and_day", (q) => q.eq("mode", "ladder").eq("cardId", CARDS[0]).eq("day", day))
          .unique()
      ))?.uses;
    const materialize = (at: number) =>
      t.mutation(internal.clash.summaries.materializeCardDay, { mode: "ladder", day, now: at });
    const ingest = (fingerprint: string, offset: number) =>
      t.mutation(internal.clash.meta.ingestBattles, {
        observations: battle(fingerprint, battleTime + offset),
        revisitSeconds: 60,
      });

    await ingest("early", 0);
    expect((await materialize(now)).skipped).toBe(false);
    expect((await materialize(now + 30 * DAY_MS)).skipped).toBe(true);

    // A late battle marks the frozen day dirty but keeps its computation time.
    await ingest("late-1", 1_000);
    const dirty = await marker();
    expect(dirty?.computedAt).toBe(now);
    expect(dirty?.dirtySince).toBeDefined();

    // A second late battle inside the window neither re-marks nor rebuilds.
    await ingest("late-2", 2_000);
    expect((await marker())?.dirtySince).toBe(dirty?.dirtySince);
    expect((await materialize(now + hour)).skipped).toBe(true);
    expect(await summaryUses()).toBe(1);

    // Once the refresh window passes, one rebuild absorbs both battles and
    // clears the flag, after which the clean frozen day stays put.
    expect((await materialize(now + 5 * hour)).skipped).toBe(false);
    expect(await summaryUses()).toBe(3);
    const rebuilt = await marker();
    expect(rebuilt?.computedAt).toBe(now + 5 * hour);
    expect(rebuilt?.dirtySince).toBeUndefined();
    expect((await materialize(now + 30 * DAY_MS)).skipped).toBe(true);
  });
});

describe("materializeCardDay", () => {
  test("skips rewriting summaries whose values did not change", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const day = dayKey(now);
    await t.mutation(internal.clash.meta.ingestBattles, {
      observations: battle("only", now),
      revisitSeconds: 60,
    });
    const first = await t.mutation(internal.clash.summaries.materializeCardDay, { mode: "ladder", day, now });
    expect(first.written).toBe(16);

    const refreshAt = now + 5 * 60 * 60 * 1000;
    const second = await t.mutation(internal.clash.summaries.materializeCardDay, {
      mode: "ladder",
      day,
      now: refreshAt,
    });
    expect(second).toEqual({ skipped: false, written: 0, complete: true });
    const summaries = await t.run((ctx) =>
      ctx.db.query("cardDaySummaries").withIndex("by_mode_and_day", (q) => q.eq("mode", "ladder").eq("day", day)).collect()
    );
    expect(summaries.every((row) => row.computedAt === now)).toBe(true);
    const marker = await t.run((ctx) =>
      ctx.db.query("cardSummaryRuns").withIndex("by_mode_and_day", (q) => q.eq("mode", "ladder").eq("day", day)).unique()
    );
    expect(marker?.computedAt).toBe(refreshAt);
  });
});
