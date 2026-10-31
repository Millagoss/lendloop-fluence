import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { viewer } from "./lib/auth";
import { sign } from "../lib/protocol";
import { today } from "../lib/domain";
import type { Doc, Id } from "./_generated/dataModel";

export const getEvent = internalQuery({
  args: { eventId: v.id("events") },
  handler: (ctx, args) => ctx.db.get(args.eventId),
});
export const attempt = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event || event.state !== "pending" || event.attempts >= 5) return null;
    await ctx.db.patch(eventId, { attempts: event.attempts + 1 });
    return { ...event, attempts: event.attempts + 1 };
  },
});
export const finish = internalMutation({
  args: {
    eventId: v.id("events"),
    attempt: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.state !== "pending" || event.attempts !== args.attempt)
      return;
    if (!args.error) {
      await ctx.db.patch(event._id, {
        state: "delivered",
        deliveredAt: Date.now(),
        lastError: undefined,
      });
    } else if (event.attempts >= 5) {
      await ctx.db.patch(event._id, { state: "failed", lastError: args.error });
      console.error("Automation delivery exhausted retries", {
        eventId: event._id,
      });
    } else {
      await ctx.db.patch(event._id, { lastError: args.error });
      await ctx.scheduler.runAfter(
        2 ** event.attempts * 5000,
        internal.automation.deliver,
        { eventId: event._id },
      );
    }
  },
});
export const deliver = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<void> => {
    const event: Doc<"events"> | null = await ctx.runMutation(
      internal.automation.attempt,
      { eventId },
    );
    if (!event) return;
    try {
      const url = process.env.N8N_WEBHOOK_URL;
      const secret = process.env.CONVEX_TO_N8N_SECRET;
      if (!url || !secret) throw new Error("Integration not configured");
      const target = new URL(url);
      if (
        target.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "host.docker.internal"].includes(
          target.hostname,
        )
      )
        throw new Error("HTTPS required");
      const body = await sign(secret, "POST", target.pathname, {
        eventId,
      });
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
      });
      if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
      // A 2xx alone isn't delivery: the workflow must have durably recorded its mock notification.
      const recorded: boolean = await ctx.runQuery(
        internal.automation.hasNotification,
        { key: `event:${eventId}` },
      );
      if (!recorded) throw new Error("Workflow did not acknowledge delivery");
      await ctx.runMutation(internal.automation.finish, {
        eventId,
        attempt: event.attempts,
      });
    } catch {
      // Do not persist request bodies, recipient details, URLs or secrets in error messages.
      await ctx.runMutation(internal.automation.finish, {
        eventId,
        attempt: event.attempts,
        error:
          "Notification delivery failed. Check n8n execution history and integration configuration.",
      });
    }
  },
});
export const hasNotification = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) =>
    !!(await ctx.db
      .query("notifications")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique()),
});
export const retry = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new ConvexError("Activity not found.");
    const loan = await ctx.db.get(event.loanId);
    if (
      !loan ||
      (user.role !== "admin" &&
        user._id !== loan.lenderId &&
        user._id !== loan.borrowerId)
    )
      throw new ConvexError("This activity does not belong to you.");
    if (event.state !== "failed")
      throw new ConvexError("Only failed notifications can be retried.");
    await ctx.db.patch(event._id, {
      state: "pending",
      attempts: 0,
      lastError: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.automation.deliver, {
      eventId: event._id,
    });
  },
});
export const overdue = internalQuery({
  args: { day: v.string() },
  handler: async (ctx, { day }) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) =>
        q.eq("status", "approved").lt("end", day),
      )
      .collect();
    const result: { loanId: Id<"loans">; day: string }[] = [];
    for (const loan of loans) {
      const sent = await ctx.db
        .query("notifications")
        .withIndex("by_key", (q) => q.eq("key", `reminder:${loan._id}:${day}`))
        .unique();
      if (!sent)
        result.push({
          loanId: loan._id,
          day,
        });
    }
    return result;
  },
});
export const recordEvent = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) throw new ConvexError("Unknown event.");
    const key = `event:${eventId}`;
    if (
      await ctx.db
        .query("notifications")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
    )
      return { duplicate: true };
    await ctx.db.insert("notifications", {
      key,
      loanId: event.loanId,
      recipientId: event.recipientId,
      kind: event.kind,
      sentAt: Date.now(),
    });
    return { duplicate: false };
  },
});
export const recordReminder = internalMutation({
  args: { loanId: v.id("loans"), day: v.string() },
  handler: async (ctx, { loanId, day }) => {
    if (day !== today())
      throw new ConvexError("Reminder day must be today in UTC.");
    const key = `reminder:${loanId}:${day}`;
    if (
      await ctx.db
        .query("notifications")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
    )
      return { duplicate: true };
    const loan = await ctx.db.get(loanId);
    // A return may race with the workflow; never send a reminder after it has been returned.
    if (!loan || loan.status !== "approved" || loan.end >= day)
      return { skipped: true };
    await ctx.db.insert("notifications", {
      key,
      loanId,
      recipientId: loan.borrowerId,
      kind: "overdue_reminder",
      sentAt: Date.now(),
    });
    return { duplicate: false };
  },
});
