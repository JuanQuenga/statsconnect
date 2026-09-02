import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { dayKeysBack } from "./lib/battles";
import type { MetaMode } from "./lib/battles";
import { metaMode } from "./schema";
import {
  CARD_DAY_LIMIT,
  CARD_SUMMARY_WRITE_LIMIT,
  DETAIL_DECK_DAY_LIMIT,
  DETAIL_MATCHUP_DAY_LIMIT,
  cardSummaryStale,
  refreshMsFromEnv,
  topPartners,
  type SummaryPartner,
} from "./summaryPolicy";

declare const process: { env: Record<string, string | undefined> };

/**
 * Writes and schedules the per-(mode, cardId, day) summaries `cardDetail`
 * serves. Reads mirror the live query's per-day caps exactly, so a summary
 * reproduces what the request would have computed for that day.
 */

/** Cheap freshness probe for every (mode, day) pair the cron could refresh. */
export const cardSummaryPairs = internalQuery({
  args: { days: v.number(), modes: v.array(metaMode), now: v.number() },
  returns: v.array(
    v.object({ mode: metaMode, day: v.number(), lastComputedAt: v.optional(v.number()) })
  ),
  handler: async (ctx, args) => {
    const pairs: Array<{ mode: MetaMode; day: number; lastComputedAt?: number }> = [];
    for (const day of dayKeysBack(Math.min(Math.max(args.days, 1), 30), args.now)) {
      for (const mode of args.modes) {
        const marker = await ctx.db
          .query("cardSummaryRuns")
          .withIndex("by_mode_and_day", (q) => q.eq("mode", mode).eq("day", day))
          .unique();
        pairs.push({ mode, day, lastComputedAt: marker?.computedAt });
      }
    }
    return pairs;
  },
});

export const materializeCardDay = internalMutation({
  args: { mode: metaMode, day: v.number(), now: v.number() },
  returns: v.object({ skipped: v.boolean(), written: v.number(), complete: v.boolean() }),
  handler: async (ctx, args) => {
    const now = args.now;
    const refreshMs = refreshMsFromEnv(process.env);
    const marker = await ctx.db
      .query("cardSummaryRuns")
      .withIndex("by_mode_and_day", (q) => q.eq("mode", args.mode).eq("day", args.day))
      .unique();
    if (!cardSummaryStale(marker?.computedAt, now, refreshMs)) {
      return { skipped: true, written: 0, complete: true };
    }

    // Existing summaries first so superseded docs can be patched or removed.
    const existingRows = await ctx.db
      .query("cardDaySummaries")
      .withIndex("by_mode_and_day", (q) => q.eq("mode", args.mode).eq("day", args.day))
      .take(1_000);
    const existing = new Map(existingRows.map((row) => [row.cardId, row]));

    const cardRows = await ctx.db
      .query("cardStats")
      .withIndex("by_day_and_mode_and_card", (q) => q.eq("day", args.day).eq("mode", args.mode))
      .take(CARD_DAY_LIMIT + 1);
    const truncatedCards = cardRows.length > CARD_DAY_LIMIT;
    const cards = cardRows.slice(0, CARD_DAY_LIMIT);
    // Eight cards per deck, so summed card uses over eight is the deck count.
    const decksObserved = cards.reduce((sum, row) => sum + row.uses, 0) / 8;
    const cardAgg = new Map(cards.map((row) => [row.cardId, { uses: row.uses, wins: row.wins }]));

    const deckRows = await ctx.db
      .query("deckStats")
      .withIndex("by_day_and_mode", (q) => q.eq("day", args.day).eq("mode", args.mode))
      .take(DETAIL_DECK_DAY_LIMIT + 1);
    const truncatedDecks = deckRows.length > DETAIL_DECK_DAY_LIMIT;
    const pairings = new Map<number, Map<number, SummaryPartner>>();
    const evolution = new Map<
      number,
      { evolvedUses: number; evolvedWins: number; baseUses: number; baseWins: number }
    >();
    const ensureEvolution = (cardId: number) => {
      let entry = evolution.get(cardId);
      if (!entry) {
        entry = { evolvedUses: 0, evolvedWins: 0, baseUses: 0, baseWins: 0 };
        evolution.set(cardId, entry);
      }
      return entry;
    };
    const ensurePartners = (cardId: number) => {
      let entry = pairings.get(cardId);
      if (!entry) {
        entry = new Map();
        pairings.set(cardId, entry);
      }
      return entry;
    };
    for (const row of deckRows.slice(0, DETAIL_DECK_DAY_LIMIT)) {
      for (const cardId of row.cardIds) {
        for (const otherId of row.cardIds) {
          if (otherId === cardId) continue;
          const partners = ensurePartners(cardId);
          const partner = partners.get(otherId) ?? { cardId: otherId, uses: 0, wins: 0 };
          partner.uses += row.uses;
          partner.wins += row.wins;
          partners.set(otherId, partner);
        }
        const totals = ensureEvolution(cardId);
        if (row.evolutionIds.includes(cardId)) {
          totals.evolvedUses += row.uses;
          totals.evolvedWins += row.wins;
        } else {
          totals.baseUses += row.uses;
          totals.baseWins += row.wins;
        }
      }
    }

    const matchupRows = await ctx.db
      .query("matchupStats")
      .withIndex("by_day_and_mode", (q) => q.eq("day", args.day).eq("mode", args.mode))
      .take(DETAIL_MATCHUP_DAY_LIMIT + 1);
    const truncatedMatchups = matchupRows.length > DETAIL_MATCHUP_DAY_LIMIT;
    const counters = new Map<number, Map<number, SummaryPartner>>();
    for (const row of matchupRows.slice(0, DETAIL_MATCHUP_DAY_LIMIT)) {
      if (row.mode !== args.mode) continue;
      for (const cardId of row.cardIds) {
        let partners = counters.get(cardId);
        if (!partners) {
          partners = new Map();
          counters.set(cardId, partners);
        }
        for (const opponentId of new Set(row.oppCardIds)) {
          // Wins from the opponent-card perspective, as the live query stores them.
          const partner = partners.get(opponentId) ?? { cardId: opponentId, uses: 0, wins: 0 };
          partner.uses += row.uses;
          partner.wins += row.uses - row.wins;
          partners.set(opponentId, partner);
        }
      }
    }

    const cardIds = [...new Set([...cardAgg.keys(), ...pairings.keys()])]
      .sort((left, right) =>
        (cardAgg.get(right)?.uses ?? 0) - (cardAgg.get(left)?.uses ?? 0) || left - right,
      );
    const writable = cardIds.slice(0, CARD_SUMMARY_WRITE_LIMIT);
    const writableSet = new Set(writable);
    const truncated = truncatedCards || truncatedDecks || truncatedMatchups;
    let written = 0;

    for (const cardId of writable) {
      const card = cardAgg.get(cardId);
      const doc = {
        day: args.day,
        mode: args.mode,
        cardId,
        uses: card?.uses ?? 0,
        wins: card?.wins ?? 0,
        decksObserved,
        pairings: topPartners(pairings.get(cardId)?.values() ?? []),
        counters: topPartners(counters.get(cardId)?.values() ?? []),
        evolvedUses: evolution.get(cardId)?.evolvedUses ?? 0,
        evolvedWins: evolution.get(cardId)?.evolvedWins ?? 0,
        baseUses: evolution.get(cardId)?.baseUses ?? 0,
        baseWins: evolution.get(cardId)?.baseWins ?? 0,
        truncated,
        computedAt: now,
      };
      const existingDoc = existing.get(cardId);
      if (existingDoc) {
        await ctx.db.patch(existingDoc._id, doc);
      } else {
        await ctx.db.insert("cardDaySummaries", doc);
      }
      written += 1;
    }
    for (const row of existingRows) {
      if (!writableSet.has(row.cardId)) await ctx.db.delete(row._id);
    }

    // The marker only advances once the pair fully fit in one transaction,
    // so an overflowing pair stays stale and is retried on the next tick.
    if (cardIds.length <= CARD_SUMMARY_WRITE_LIMIT) {
      if (marker) {
        await ctx.db.patch(marker._id, { computedAt: now });
      } else {
        await ctx.db.insert("cardSummaryRuns", {
          mode: args.mode,
          day: args.day,
          computedAt: now,
        });
      }
      return { skipped: false, written, complete: true };
    }
    return { skipped: false, written, complete: false };
  },
});
