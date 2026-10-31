import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verify } from "../lib/protocol";
import { today } from "../lib/domain";

const http = httpRouter();
// Authenticated integration endpoints only. Browser session cookies cannot authorize them.
for (const path of [
  "/automation/overdue",
  "/automation/event",
  "/automation/reminder",
] as const) {
  http.route({
    path,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const secret = process.env.N8N_TO_CONVEX_SECRET;
      if (!secret || secret.length < 32)
        return new Response("Integration unavailable", { status: 503 });
      let payload: Record<string, unknown>;
      try {
        if (Number(request.headers.get("content-length") ?? "0") > 250_000)
          return new Response("Too large", { status: 413 });
        const body = await request.text();
        if (body.length > 250_000)
          return new Response("Too large", { status: 413 });
        payload = await verify<Record<string, unknown>>(
          secret,
          "POST",
          path,
          JSON.parse(body),
        );
        if (!payload || typeof payload !== "object" || Array.isArray(payload))
          throw new Error("Invalid payload");
      } catch {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        let result: unknown;
        if (path === "/automation/overdue") {
          if (Object.keys(payload).length)
            return new Response("Invalid payload", { status: 400 });
          result = await ctx.runQuery(internal.automation.overdue, {
            day: today(),
          });
        } else if (path === "/automation/event") {
          const eventId = await ctx.runQuery(internal.integrationIds.event, {
            value: typeof payload.eventId === "string" ? payload.eventId : "",
          });
          if (!eventId) return new Response("Invalid event", { status: 400 });
          result = await ctx.runMutation(internal.automation.recordEvent, {
            eventId,
          });
        } else {
          const loanId = await ctx.runQuery(internal.integrationIds.loan, {
            value: typeof payload.loanId === "string" ? payload.loanId : "",
          });
          if (!loanId || typeof payload.day !== "string")
            return new Response("Invalid reminder", { status: 400 });
          result = await ctx.runMutation(internal.automation.recordReminder, {
            loanId,
            day: payload.day,
          });
        }
        return Response.json(result, {
          headers: { "Cache-Control": "no-store" },
        });
      } catch {
        // Execution errors remain visible in Convex without logging signed bodies or personal data.
        console.error("Automation endpoint failed", { path });
        return new Response("Request failed", { status: 400 });
      }
    }),
  });
}
export default http;
