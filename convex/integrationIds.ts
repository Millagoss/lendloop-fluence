import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
export const event = internalQuery({
  args: { value: v.string() },
  handler: (ctx, args) => ctx.db.normalizeId("events", args.value),
});
export const loan = internalQuery({
  args: { value: v.string() },
  handler: (ctx, args) => ctx.db.normalizeId("loans", args.value),
});
