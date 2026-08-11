import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "discover ranked players and club members",
  { hours: 6 },
  internal.crawler.discover,
);

crons.interval(
  "crawl due player battle logs",
  { minutes: 2 },
  internal.crawler.crawl,
);

crons.interval(
  "prune expired crawler telemetry",
  { hours: 6 },
  internal.crawler.prune,
);

export default crons;
