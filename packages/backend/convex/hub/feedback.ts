import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { verifiedSubjectOrNull } from "./auth";
import { feedbackSiteValidator } from "./schema";

const MAX_MESSAGE = 2000;
const MAX_PER_HOUR = 5;
const HOUR = 60 * 60 * 1000;

/** Store one "Send feedback" message. Open to guests; rate limited per browser. */
export const submit = mutation({
  args: {
    site: feedbackSiteValidator,
    message: v.string(),
    email: v.optional(v.string()),
    page: v.optional(v.string()),
    clientId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = args.message.trim();
    if (message.length < 3) throw new ConvexError({ code: "INVALID", message: "Write a little more before sending." });
    if (message.length > MAX_MESSAGE) throw new ConvexError({ code: "INVALID", message: `Keep feedback under ${MAX_MESSAGE} characters.` });
    const email = args.email?.trim() || undefined;
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new ConvexError({ code: "INVALID", message: "That email address doesn't look right." });
    }
    const clientId = args.clientId.slice(0, 64);
    const recent = await ctx.db
      .query("feedback")
      .withIndex("by_client_id", (index) => index.eq("clientId", clientId))
      .order("desc")
      .take(MAX_PER_HOUR);
    if (recent.length >= MAX_PER_HOUR && recent[MAX_PER_HOUR - 1]._creationTime > Date.now() - HOUR) {
      throw new ConvexError({ code: "RATE_LIMITED", message: "Thanks! You've sent a lot of feedback recently. Try again in a little while." });
    }
    await ctx.db.insert("feedback", {
      site: args.site,
      message,
      email,
      page: args.page?.slice(0, 300),
      subject: (await verifiedSubjectOrNull(ctx)) ?? undefined,
      clientId,
      status: "new",
    });
    return null;
  },
});
