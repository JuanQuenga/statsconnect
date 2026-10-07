import { v } from "convex/values";
import { action } from "../_generated/server";
import { loadOfficialNews, payloadValidator } from "../clash/news";

/** Latest posts from Supercell's Brawl Stars blog (English archive), cached for six hours. */
export const getOfficialNews = action({
  args: {},
  returns: payloadValidator,
  handler: async (ctx) => loadOfficialNews(ctx, "brawlstars", "en", false),
});
