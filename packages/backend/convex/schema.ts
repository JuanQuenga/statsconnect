import { defineSchema } from "convex/server";
import { brawlTables } from "./brawl/schema";
import { clashTables } from "./clash/schema";
import { hubTables } from "./hub/schema";

export default defineSchema({
  ...hubTables,
  ...brawlTables,
  ...clashTables,
});
