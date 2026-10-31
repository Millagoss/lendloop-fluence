import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
export async function viewer(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to continue.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
    .unique();
  if (!user)
    throw new ConvexError("Your profile is getting ready. Please try again.");
  return user;
}
export async function admin(ctx: QueryCtx | MutationCtx) {
  const user = await viewer(ctx);
  if (user.role !== "admin") throw new ConvexError("Admin access required.");
  return user;
}
