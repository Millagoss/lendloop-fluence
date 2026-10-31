import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

export async function emit(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  recipientId: Id<"users">,
) {
  const tool = await ctx.db.get(loan.toolId);
  const eventId = await ctx.db.insert("events", {
    loanId: loan._id,
    recipientId,
    kind: "request_status",
    status: loan.status,
    toolName: tool?.name ?? "Removed tool",
    end: loan.end,
    state: "pending",
    attempts: 0,
  });
  await ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId });
}
