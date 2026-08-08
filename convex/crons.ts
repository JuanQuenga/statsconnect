import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "refresh stale connected profile caches",
  { minutes: 10 },
  internal.cacheAccess.refreshExpiredConnected,
);

crons.interval(
  "prune expired background data",
  { hours: 1 },
  internal.cacheAccess.pruneExpired,
);

export default crons;
