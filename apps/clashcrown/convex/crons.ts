import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Background schedule for the battle-log pipeline. Every interval is sized
 * around the shared Clash Royale API token: the crawler makes one request per
 * target, so batch size times crawl frequency is the request rate.
 *
 * Tune without redeploying via the Convex environment:
 *   CLASH_CRAWL_BATCH      targets per crawl tick (default 8)
 *   CLASH_DISCOVER_LIMIT   leaderboard entries seeded per discovery (default 200)
 *   CLASH_RANKING_SIZE     decks kept per mode per window (default 100)
 *   CLASH_MIN_DECK_USES    minimum observations before a deck is ranked (default 5)
 */
const crons = cronJobs();

crons.interval("refill the crawl queue", { hours: 6 }, internal.crawler.discover, {});
crons.interval("crawl battle logs", { minutes: 2 }, internal.crawler.crawl, {});
crons.interval("roll up deck rankings", { minutes: 30 }, internal.crawler.rollup, {});
crons.interval("prune expired rows", { hours: 6 }, internal.crawler.prune, {});

export default crons;
