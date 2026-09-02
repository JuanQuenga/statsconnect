import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { boundedInteger, envEnabled } from "./controls";
import { backgroundCronEnabled } from "../cronPolicy";
import {
  brawlTagKey,
  createBrawlUpstreamIntake,
  type BrawlPlayerSighting,
  type BrawlUpstreamTelemetryEvent,
} from "./upstreamIntake";

declare const process: { env: Record<string, string | undefined> };

type CrawlTargetInput = {
  tag: string;
  source: "ranking" | "club" | "lookup" | "manual";
  priority: number;
};

function integerEnv(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 1), maximum) : fallback;
}

function telemetryOutcome(
  event: BrawlUpstreamTelemetryEvent,
): "success" | "upstream_rejected" | "transport_failure" | "configuration_error" {
  if (event.ok) return "success";
  if (event.errorCode === "not_configured") return "configuration_error";
  if (event.errorCode === "unavailable") return "transport_failure";
  return "upstream_rejected";
}

function crawlerIntake(ctx: ActionCtx, runId: Id<"brawlPipelineRuns">) {
  return createBrawlUpstreamIntake({
    telemetry: async (event) => {
      await ctx.runMutation(internal.brawl.pipeline.recordUpstreamFetch, {
        operation: event.endpoint,
        consumer: "crawler",
        outcome: telemetryOutcome(event),
        source: event.source,
        durationMs: event.durationMs,
        runId,
        ...(event.status > 0 ? { status: event.status } : {}),
        ...(event.errorCode ? { errorCode: event.errorCode } : {}),
      });
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function itemsAfter(items: unknown[], lastBattleTime?: string): unknown[] {
  if (!lastBattleTime) return items;
  return items.filter((item) => {
    const battleTime = asRecord(item)?.battleTime;
    return typeof battleTime === "string" && battleTime > lastBattleTime;
  });
}

function resultMessage(
  results: Array<{ ok: true } | { ok: false; error: { message: string } }>,
): string {
  return results.flatMap((result) => result.ok ? [] : [result.error.message]).join(" ");
}

async function recordDiscovery(
  ctx: ActionCtx,
  runId: Id<"brawlPipelineRuns">,
  summary: {
    targets: CrawlTargetInput[];
    directorySightings: number;
    failures: number;
  },
) {
  return await ctx.runMutation(internal.brawl.pipeline.recordDiscoveryResult, {
    runId,
    ...summary,
  });
}

export const discover = internalAction({
  args: {},
  returns: v.object({ discovered: v.number(), added: v.number(), failures: v.number() }),
  handler: async (ctx) => {
    const runId = await ctx.runMutation(internal.brawl.pipeline.beginPipelineRun, {
      job: "discover",
    });
    const intake = crawlerIntake(ctx, runId);
    const targets: CrawlTargetInput[] = [];
    let discovered = 0;
    let added = 0;
    let directorySightings = 0;
    let failures = 0;

    try {
      const rankingLimit = integerEnv("BRAWL_DISCOVER_LIMIT", 200, 200);
      const clubLimit = integerEnv("BRAWL_CLUB_SEED", 10, 50);
      const [playerRankings, clubRankings] = await Promise.all([
        intake.official.rankings({ country: "global", kind: "players", limit: rankingLimit }),
        intake.official.rankings({ country: "global", kind: "clubs", limit: clubLimit }),
      ]);
      if (!playerRankings.ok) throw new Error(playerRankings.error.message);
      if (!clubRankings.ok) {
        failures += 1;
        console.error("Failed to discover club rankings", clubRankings.error.message);
      }

      playerRankings.value.tags.forEach((tag, index) => {
        const key = brawlTagKey(tag);
        if (key) targets.push({ tag: key, source: "ranking", priority: index });
      });
      const sightings: BrawlPlayerSighting[] = [...playerRankings.value.sightings];
      const clubTags = clubRankings.ok ? clubRankings.value.tags : [];

      for (const clubTag of clubTags) {
        const club = await intake.official.club(clubTag);
        if (!club.ok) {
          failures += 1;
          console.error("Failed to discover club members", clubTag, club.error.message);
          continue;
        }

        await ctx.runMutation(internal.brawl.clubs.recordClub, { club: club.value });
        for (const member of club.value.members) {
          const key = brawlTagKey(member.tag);
          if (key) {
            targets.push({ tag: key, source: "club", priority: 1_000 + targets.length });
          }
          sightings.push({
            tag: member.tag,
            name: member.name,
            clubTag: club.value.tag,
            clubName: club.value.name,
            trophies: member.trophies,
            iconId: member.iconId,
          });
        }
      }

      for (let index = 0; index < sightings.length; index += 100) {
        const directory = await ctx.runMutation(internal.brawl.players.recordSightings, {
          players: sightings.slice(index, index + 100),
        });
        directorySightings += directory.recorded;
      }

      const result = await recordDiscovery(ctx, runId, {
        targets,
        directorySightings,
        failures,
      });
      if (result.status === "run_inactive") throw new Error("Discovery run is no longer active");
      discovered = result.discovered;
      added = result.added;
      await ctx.runMutation(internal.brawl.pipeline.completePipelineRun, {
        runId,
        outcome: "succeeded",
      });
      return { discovered, added, failures };
    } catch (error: unknown) {
      const note = error instanceof Error ? error.message : "Discovery failed";
      const result = await recordDiscovery(ctx, runId, {
        targets,
        directorySightings,
        failures,
      });
      discovered = result.discovered;
      added = result.added;
      await ctx.runMutation(internal.brawl.pipeline.completePipelineRun, {
        runId,
        outcome: "failed",
        note,
      });
      throw error;
    }
  },
});

export const crawl = internalAction({
  args: {},
  returns: v.object({ fetched: v.number(), battles: v.number(), failures: v.number() }),
  handler: async (ctx) => {
    // Dev deployments opt out entirely so they stop paying for pipeline
    // work production already does; a disabled tick writes nothing at all.
    if (!backgroundCronEnabled(process.env)) {
      return { fetched: 0, battles: 0, failures: 0 };
    }
    const runId = await ctx.runMutation(internal.brawl.pipeline.beginPipelineRun, {
      job: "crawl",
    });
    const intake = crawlerIntake(ctx, runId);
    const batchSize = integerEnv("BRAWL_CRAWL_BATCH", 8, 25);
    const hourlyLimit = boundedInteger(
      process.env.BRAWL_CRAWL_MAX_CALLS_PER_HOUR,
      500,
      0,
      10_000,
    );
    const revisitMinutes = integerEnv("BRAWL_CRAWL_REVISIT_MINUTES", 30, 24 * 60);
    const revisitMs = revisitMinutes * 60 * 1_000;
    let fetched = 0;
    let battles = 0;
    let failures = 0;

    try {
      if (!envEnabled(process.env.BRAWL_CRAWLER_ENABLED)) {
        await ctx.runMutation(internal.brawl.pipeline.completePipelineRun, {
          runId,
          outcome: "succeeded",
          note: "Crawler disabled by BRAWL_CRAWLER_ENABLED.",
        });
        return { fetched, battles, failures };
      }

      const budgetNow = Date.now();
      const budget = await ctx.runMutation(internal.brawl.pipeline.reserveApiBudget, {
        scope: "crawl",
        requested: batchSize * 2,
        limit: hourlyLimit,
        now: budgetNow,
      });
      const allowedTargets = Math.floor(budget.granted / 2);
      if (allowedTargets === 0) {
        await ctx.runMutation(internal.brawl.pipeline.completePipelineRun, {
          runId,
          outcome: "succeeded",
          note: `Hourly crawl budget exhausted (${budget.used}/${budget.limit}).`,
        });
        return { fetched, battles, failures };
      }

      let claim;
      try {
        claim = await ctx.runMutation(internal.brawl.pipeline.claimCrawlBatch, {
          runId,
          limit: allowedTargets,
          leaseMs: 5 * 60 * 1_000,
        });
      } catch (error) {
        await ctx.runMutation(internal.brawl.pipeline.releaseApiBudget, {
          scope: "crawl",
          unused: budget.granted,
          now: budgetNow,
        });
        throw error;
      }
      await ctx.runMutation(internal.brawl.pipeline.releaseApiBudget, {
        scope: "crawl",
        unused: Math.max(0, budget.granted - claim.targets.length * 2),
        now: budgetNow,
      });
      if (claim.status !== "claimed") throw new Error("Crawl run is no longer active");

      for (const target of claim.targets) {
        try {
          const [profile, battleLog] = await Promise.all([
            intake.official.player(target.tag),
            intake.official.battleLog(target.tag),
          ]);
          if (!profile.ok || !battleLog.ok) {
            failures += 1;
            const note = resultMessage([profile, battleLog]);
            await ctx.runMutation(internal.brawl.pipeline.recordCrawlOutcome, {
              runId,
              targetId: target.id,
              leaseToken: target.leaseToken,
              revisitMs,
              outcome: { type: "failure", note },
            });
            console.error("Failed to crawl player", target.tag, note);
            continue;
          }

          const snapshot = await ctx.runMutation(
            internal.brawl.players.recordProfile,
            profile.value,
          );
          const newItems = itemsAfter(battleLog.value.items, target.lastBattleTime);
          const ingestion = await ctx.runMutation(internal.brawl.ingest.ingestBattleLogItems, {
            items: newItems,
            focusTag: target.tag,
          });
          const outcome = await ctx.runMutation(internal.brawl.pipeline.recordCrawlOutcome, {
            runId,
            targetId: target.id,
            leaseToken: target.leaseToken,
            revisitMs,
            outcome: {
              type: "success",
              lastBattleTime: battleLog.value.latestBattleTime,
              battles: ingestion.inserted,
              profileSnapshotCreated: snapshot.createdSnapshot,
            },
          });
          if (outcome.status === "accepted") {
            fetched += 1;
            battles += ingestion.inserted;
          }
        } catch (error: unknown) {
          failures += 1;
          const note = error instanceof Error ? error.message : "Player crawl failed";
          await ctx.runMutation(internal.brawl.pipeline.recordCrawlOutcome, {
            runId,
            targetId: target.id,
            leaseToken: target.leaseToken,
            revisitMs,
            outcome: { type: "failure", note },
          });
          console.error("Failed to crawl player", target.tag, error);
        }
      }

      await ctx.runMutation(internal.brawl.pipeline.completePipelineRun, {
        runId,
        outcome: "succeeded",
      });
      return { fetched, battles, failures };
    } catch (error: unknown) {
      const note = error instanceof Error ? error.message : "Crawl failed";
      await ctx.runMutation(internal.brawl.pipeline.completePipelineRun, {
        runId,
        outcome: "failed",
        note,
      });
      throw error;
    }
  },
});

export const prune = internalAction({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const runId = await ctx.runMutation(internal.brawl.pipeline.beginPipelineRun, {
      job: "prune",
    });
    let deleted = 0;

    try {
      for (let batch = 0; batch < 20; batch += 1) {
        const result = await ctx.runMutation(internal.brawl.pipeline.retainPipelineData, {
          runId,
          limit: 256,
        });
        if (result.status !== "deleted") throw new Error("Prune run is no longer active");
        deleted += result.deleted;
        if (!result.more) break;
      }
      await ctx.runMutation(internal.brawl.pipeline.completePipelineRun, {
        runId,
        outcome: "succeeded",
        note: `Deleted ${deleted} expired rows`,
      });
      return { deleted };
    } catch (error: unknown) {
      const note = error instanceof Error ? error.message : "Prune failed";
      await ctx.runMutation(internal.brawl.pipeline.completePipelineRun, {
        runId,
        outcome: "failed",
        note,
      });
      throw error;
    }
  },
});

export const probeEgressIp = internalAction({
  args: { dualStack: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (_ctx, args) => {
    const host = args.dualStack ? "api6.ipify.org" : "api.ipify.org";
    const response = await fetch(`https://${host}?format=json`);
    if (!response.ok) throw new Error(`Egress probe returned ${response.status}`);
    const payload = asRecord(await response.json());
    if (typeof payload?.ip !== "string") throw new Error("Egress probe returned no IP address");
    return payload.ip;
  },
});

export const probeEgressIps = internalAction({
  args: {},
  returns: v.array(v.string()),
  handler: async () => {
    const urls = [
      "https://api.ipify.org",
      "https://checkip.amazonaws.com",
      "https://icanhazip.com",
      "https://ifconfig.me/ip",
      "https://ipinfo.io/ip",
    ];
    const responses = await Promise.all(urls.map((url) => fetch(url)));
    const addresses = await Promise.all(
      responses.map(async (response) => {
        if (!response.ok) throw new Error(`Egress probe returned ${response.status}`);
        return (await response.text()).trim();
      }),
    );
    return [...new Set(addresses)];
  },
});
