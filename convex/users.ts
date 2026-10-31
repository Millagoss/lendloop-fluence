import { mutation, query, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { admin } from "./lib/auth";

export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in to continue.");
    const existing = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert("users", {
      subject: identity.subject,
      name: (identity.givenName || identity.name || "Neighbor").slice(0, 60),
      role: "user",
      trusted: false,
    });
  },
});
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
      .unique();
    return user
      ? {
          _id: user._id,
          name: user.name,
          role: user.role,
          trusted: user.trusted,
        }
      : null;
  },
});
export const list = query({
  args: {},
  handler: async (ctx) => {
    await admin(ctx);
    return (await ctx.db.query("users").collect()).map((u) => ({
      _id: u._id,
      name: u.name,
      role: u.role,
      trusted: u.trusted,
    }));
  },
});
export const trust = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    await admin(ctx);
    if (!(await ctx.db.get(args.userId)))
      throw new ConvexError("Neighbor not found.");
    await ctx.db.patch(args.userId, { trusted: args.trusted });
  },
});
// Operator-only bootstrap: internal functions cannot be called by browser clients.
export const setRole = internalMutation({
  args: {
    subject: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", args.subject))
      .unique();
    if (!user) throw new ConvexError("Sign in once before assigning a role.");
    await ctx.db.patch(user._id, { role: args.role });
  },
});
