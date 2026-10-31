import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const category = v.union(
  v.literal("Power tools"),
  v.literal("Garden"),
  v.literal("Kitchen"),
  v.literal("Camping"),
  v.literal("Hand tools"),
  v.literal("Other"),
);
export const condition = v.union(
  v.literal("Like new"),
  v.literal("Good"),
  v.literal("Well loved"),
);
export const status = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);
export default defineSchema({
  users: defineTable({
    subject: v.string(),
    name: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
    trusted: v.boolean(),
  }).index("by_subject", ["subject"]),
  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
    deleted: v.boolean(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_deleted", ["deleted"]),
  loans: defineTable({
    toolId: v.id("tools"),
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    start: v.string(),
    end: v.string(),
    status,
    updatedAt: v.number(),
  })
    .index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_status_end", ["status", "end"]),
  events: defineTable({
    loanId: v.id("loans"),
    recipientId: v.id("users"),
    kind: v.string(),
    status: v.string(),
    toolName: v.string(),
    end: v.string(),
    state: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_loan", ["loanId"])
    .index("by_state", ["state"]),
  // Durable mock notification sink. One record per event or per overdue loan + UTC day.
  notifications: defineTable({
    key: v.string(),
    loanId: v.id("loans"),
    recipientId: v.id("users"),
    kind: v.string(),
    sentAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_loan", ["loanId"]),
});
