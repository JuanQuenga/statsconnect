import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "hub: refresh due connected and watched targets",
  { minutes: 10 },
  internal.hub.cacheAccess.refreshExpiredConnected,
);
crons.interval(
  "hub: register legacy connected refresh targets",
  { hours: 1 },
  internal.hub.internal.watchTargets.backfillConnectedProfiles,
);
crons.interval(
  "hub: expire premium watch demand",
  { hours: 1 },
  internal.hub.internal.watchTargets.expireWatchDemands,
);
crons.interval(
  "hub: prune expired background data",
  { hours: 1 },
  internal.hub.cacheAccess.pruneExpired,
);

crons.interval(
  "brawl: discover ranked players and club members",
  { hours: 6 },
  internal.brawl.crawler.discover,
);
crons.interval(
  "brawl: crawl due player battle logs",
  { minutes: 2 },
  internal.brawl.crawler.crawl,
);
crons.interval(
  "brawl: prune expired crawler telemetry",
  { hours: 6 },
  internal.brawl.crawler.prune,
);

crons.interval(
  "clash: refill the crawl queue",
  { hours: 6 },
  internal.clash.crawler.discover,
  {},
);
crons.interval(
  "clash: crawl battle logs",
  { minutes: 2 },
  internal.clash.crawler.crawl,
  {},
);
crons.interval(
  "clash: roll up deck rankings",
  { minutes: 30 },
  internal.clash.crawler.rollup,
  {},
);
crons.interval(
  "clash: prune expired rows",
  { hours: 6 },
  internal.clash.crawler.prune,
  {},
);
crons.interval(
  "clash: observe tracked clans",
  { minutes: 30 },
  internal.clash.clanManagementActions.pollTrackedClans,
  {},
);
crons.interval(
  "clash: prune clan management history",
  { hours: 6 },
  internal.clash.clanManagementActions.pruneHistory,
  {},
);

export default crons;
