import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { viewer } from "./lib/auth";
import { emit } from "./lib/events";
import { overlaps, validRange, today } from "../lib/domain";

export const list = query({
  args: { day: v.string() },
  handler: async (ctx, { day }) => {
    const user = await viewer(ctx);
    const loans =
      user.role === "admin"
        ? await ctx.db.query("loans").collect()
        : [
            ...(await ctx.db
              .query("loans")
              .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
              .collect()),
            ...(await ctx.db
              .query("loans")
              .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
              .collect()),
          ];
    return Promise.all(
      loans
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(async (loan) => {
          const tool = await ctx.db.get(loan.toolId);
          const borrower = await ctx.db.get(loan.borrowerId);
          const lender = await ctx.db.get(loan.lenderId);
          const events = await ctx.db
            .query("events")
            .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
            .collect();
          const notifications = await ctx.db
            .query("notifications")
            .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
            .collect();
          return {
            ...loan,
            toolName: tool?.name ?? "Removed tool",
            borrowerName: borrower?.name ?? "Neighbor",
            lenderName: lender?.name ?? "Neighbor",
            isBorrower: user._id === loan.borrowerId,
            isLender: user._id === loan.lenderId,
            overdue: loan.status === "approved" && loan.end < day,
            activity: [
              ...events.map((e) => ({
                id: e._id as string,
                label:
                  e.state === "failed"
                    ? "Notification failed — retry available"
                    : e.state === "delivered"
                      ? `Notification delivered · ${e.status}`
                      : `Notification queued · ${e.status}`,
                at: e.deliveredAt ?? e._creationTime,
                failed: e.state === "failed",
              })),
              ...notifications
                .filter((n) => n.kind === "overdue_reminder")
                .map((n) => ({
                  id: n._id as string,
                  label: "Overdue reminder sent",
                  at: n.sentAt,
                  failed: false,
                })),
            ]
              .sort((a, b) => b.at - a.at)
              .slice(0, 5),
          };
        }),
    );
  },
});
export const request = mutation({
  args: { toolId: v.id("tools"), start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    try {
      validRange(args.start, args.end);
    } catch (e) {
      throw new ConvexError((e as Error).message);
    }
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.deleted)
      throw new ConvexError("This tool is no longer listed.");
    if (tool.ownerId === user._id)
      throw new ConvexError("You cannot borrow your own tool.");
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .collect();
    if (
      loans.some(
        (l) =>
          l.status === "approved" &&
          (l.end < today() || overlaps(l.start, l.end, args.start, args.end)),
      )
    )
      throw new ConvexError("This tool is unavailable for those dates.");
    if (
      loans.some(
        (l) =>
          l.borrowerId === user._id &&
          l.status === "pending" &&
          overlaps(l.start, l.end, args.start, args.end),
      )
    )
      throw new ConvexError(
        "You already have a pending request for these dates.",
      );
    if (loans.filter((l) => l.status === "pending").length >= 100)
      throw new ConvexError(
        "This tool has too many pending requests. Try again later.",
      );
    const loanId = await ctx.db.insert("loans", {
      ...args,
      lenderId: tool.ownerId,
      borrowerId: user._id,
      status: "pending",
      updatedAt: Date.now(),
    });
    await emit(ctx, (await ctx.db.get(loanId))!, tool.ownerId);
    return loanId;
  },
});
export const transition = mutation({
  args: {
    loanId: v.id("loans"),
    action: v.union(
      v.literal("approve"),
      v.literal("decline"),
      v.literal("cancel"),
      v.literal("return"),
    ),
  },
  handler: async (ctx, { loanId, action }) => {
    const user = await viewer(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan) throw new ConvexError("Request not found.");
    const isLender = user._id === loan.lenderId;
    const isBorrower = user._id === loan.borrowerId;
    if (!isLender && !isBorrower)
      throw new ConvexError("This request does not belong to you.");
    if (
      (action === "approve" || action === "decline") &&
      (!isLender || loan.status !== "pending")
    )
      throw new ConvexError("Only the lender can decide a pending request.");
    if (action === "cancel" && (!isBorrower || loan.status !== "pending"))
      throw new ConvexError("Only the borrower can cancel a pending request.");
    if (action === "return" && loan.status !== "approved")
      throw new ConvexError("Only approved loans can be returned.");
    if (action === "return" && loan.start > today())
      throw new ConvexError("A future loan cannot be returned yet.");
    if (action === "approve") {
      const tool = await ctx.db.get(loan.toolId);
      if (!tool || tool.deleted)
        throw new ConvexError("This listing has been removed.");
      if (loan.end < today())
        throw new ConvexError(
          "These dates have passed. Ask for a new request.",
        );
      const others = await ctx.db
        .query("loans")
        .withIndex("by_tool", (q) => q.eq("toolId", loan.toolId))
        .collect();
      if (
        others.some(
          (l) =>
            l.status === "approved" &&
            (l.end < today() || overlaps(l.start, l.end, loan.start, loan.end)),
        )
      )
        throw new ConvexError(
          "Another approved loan conflicts with these dates.",
        );
      for (const other of others.filter(
        (l) =>
          l._id !== loanId &&
          l.status === "pending" &&
          overlaps(l.start, l.end, loan.start, loan.end),
      )) {
        await ctx.db.patch(other._id, {
          status: "declined",
          updatedAt: Date.now(),
        });
        await emit(ctx, { ...other, status: "declined" }, other.borrowerId);
      }
    }
    const status = (
      {
        approve: "approved",
        decline: "declined",
        cancel: "cancelled",
        return: "returned",
      } as const
    )[action];
    await ctx.db.patch(loanId, { status, updatedAt: Date.now() });
    await emit(
      ctx,
      { ...loan, status },
      isLender ? loan.borrowerId : loan.lenderId,
    );
  },
});
