import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { category, condition } from "./schema";
import { viewer } from "./lib/auth";
import { emit } from "./lib/events";
import { text } from "../lib/domain";

export const publicList = query({
  args: { day: v.string() },
  handler: async (ctx, { day }) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_deleted", (q) => q.eq("deleted", false))
      .collect();
    const result: { name: string; category: string }[] = [];
    for (const tool of tools) {
      const loans = await ctx.db
        .query("loans")
        .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
        .collect();
      if (!loans.some((l) => l.status === "approved" && l.start <= day))
        result.push({ name: tool.name, category: tool.category });
    }
    return result;
  },
});
export const list = query({
  args: { day: v.string() },
  handler: async (ctx, { day }) => {
    const user = await viewer(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_deleted", (q) => q.eq("deleted", false))
      .collect();
    return Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        const loans = await ctx.db
          .query("loans")
          .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
          .collect();
        const bookings = loans
          .filter((l) => l.status === "approved")
          .map((l) => ({ start: l.start, end: l.end }));
        // Overdue loans still reserve the tool until it is explicitly returned.
        const unavailable = bookings.some((l) => l.start <= day);
        return {
          ...tool,
          ownerName: owner?.name ?? "Neighbor",
          trusted: owner?.trusted ?? false,
          mine: user._id === tool.ownerId,
          unavailable,
          bookings,
        };
      }),
    );
  },
});
const fields = {
  name: v.string(),
  category,
  condition,
  description: v.string(),
};
function clean(args: { name: string; description: string }) {
  try {
    return {
      name: text(args.name, "Name", 80),
      description: text(args.description, "Description", 500),
    };
  } catch (e) {
    throw new ConvexError((e as Error).message);
  }
}
export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    const listings = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    if (listings.filter((t) => !t.deleted).length >= 50)
      throw new ConvexError("You can have at most 50 active listings.");
    return ctx.db.insert("tools", {
      ...args,
      ...clean(args),
      ownerId: user._id,
      deleted: false,
    });
  },
});
export const update = mutation({
  args: { toolId: v.id("tools"), ...fields },
  handler: async (ctx, { toolId, ...args }) => {
    const user = await viewer(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.deleted || tool.ownerId !== user._id)
      throw new ConvexError("Only the owner can edit this listing.");
    await ctx.db.patch(toolId, { ...args, ...clean(args) });
  },
});
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const user = await viewer(ctx);
    const tool = await ctx.db.get(toolId);
    if (
      !tool ||
      tool.deleted ||
      (tool.ownerId !== user._id && user.role !== "admin")
    )
      throw new ConvexError("You cannot remove this listing.");
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .collect();
    if (user.role !== "admin" && loans.some((l) => l.status === "approved"))
      throw new ConvexError(
        "Return all approved loans before removing this listing.",
      );
    await ctx.db.patch(toolId, { deleted: true });
    // Admin moderation hides a listing but keeps active loans returnable and auditable.
    for (const loan of loans.filter((l) => l.status === "pending")) {
      await ctx.db.patch(loan._id, {
        status: "cancelled",
        updatedAt: Date.now(),
      });
      await emit(ctx, { ...loan, status: "cancelled" }, loan.borrowerId);
    }
  },
});
