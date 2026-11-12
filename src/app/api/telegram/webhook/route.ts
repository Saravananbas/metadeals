import crypto from "node:crypto";
import { Agent1DealHunter } from "@/server/scraper/agent1-deal-hunter";
import { logger } from "@/server/logging/logger";
import { writeAudit } from "@/server/auth/audit";
import { z } from "zod";

const telegramUpdateSchema = z.object({
  callback_query: z.object({
    from: z.object({ id: z.union([z.string(), z.number()]) }),
    data: z.string().min(1).max(4096),
  }).passthrough().optional(),
}).passthrough();

const callbackActionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "HOLD", "REVERIFY"]),
  candidateId: z.string().min(1).max(128),
  timestamp: z.number().finite(),
  signature: z.string().min(1).max(128),
  rejectionReason: z.enum(["FAKE_DISCOUNT", "WRONG_VARIANT", "POOR_SELLER", "DUPLICATE", "EXPIRED", "UNVERIFIABLE"]).optional(),
  assessment: z.object({
    authenticityScore: z.number().min(0).max(100),
    attractivenessScore: z.number().min(0).max(100),
    isPriceErrorSuspected: z.boolean(),
  }).passthrough().optional(),
});

function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token") || "";
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";

  // 1. Fail closed if webhook secret is not configured or does not match
  if (!configuredSecret || !secretHeader || !constantTimeCompare(secretHeader, configuredSecret)) {
    logger.warn({ hasConfiguredSecret: Boolean(configuredSecret) }, "Unauthorized telegram webhook request rejected");
    return new Response(JSON.stringify({ error: "UNAUTHORIZED_WEBHOOK_SECRET" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const update = telegramUpdateSchema.safeParse(await request.json());
    if (!update.success) {
      return Response.json({ error: "MALFORMED_CALLBACK_QUERY" }, { status: 400 });
    }

    // Only process callback_query updates
    if (!update.data.callback_query) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const callback = update.data.callback_query;
    const fromUser = callback.from;
    const dataString = callback.data;

    if (!fromUser || !dataString) {
      return new Response(JSON.stringify({ error: "MALFORMED_CALLBACK_QUERY" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse callback data payload (expected format: action:candidateId:timestamp:signature or JSON)
    let rawActionPayload: unknown;
    try {
      rawActionPayload = JSON.parse(dataString);
    } catch {
      // String format: action:candidateId:timestamp:signature
      const parts = dataString.split(":");
      if (parts.length >= 3) {
        rawActionPayload = {
          action: parts[0],
          candidateId: parts[1],
          timestamp: Number(parts[2]),
          signature: parts[3] || "",
        };
      }
    }

    const parsedAction = callbackActionSchema.safeParse(rawActionPayload);
    if (!parsedAction.success) {
      return new Response(JSON.stringify({ error: "INVALID_CALLBACK_DATA" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const actionPayload = parsedAction.data;

    const allowedAdmins = (process.env.TELEGRAM_ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

    // Forward to Agent1 handler
    const result = await Agent1DealHunter.handleTelegramApproval(
      actionPayload.candidateId,
      {
        action: actionPayload.action,
        telegramUserId: String(fromUser.id),
        timestamp: actionPayload.timestamp || Date.now(),
        signature: actionPayload.signature || "",
        rejectionReason: actionPayload.rejectionReason,
      },
      actionPayload.assessment ?? {
        authenticityScore: 0,
        attractivenessScore: 0,
        isPriceErrorSuspected: true,
      },
      allowedAdmins,
      configuredSecret
    );

    await writeAudit({
      action: `TELEGRAM_WEBHOOK_${actionPayload.action}`,
      targetId: actionPayload.candidateId,
      success: result.success,
      metadata: {
        telegramUserId: String(fromUser.id),
        error: result.error,
        authorizationId: result.authorizationId,
      },
    });

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, data: result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Unhandled error in telegram webhook route");
    return new Response(JSON.stringify({ error: "INTERNAL_WEBHOOK_ERROR" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

