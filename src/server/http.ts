import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/server/logging/logger";
import { DealError } from "@/server/deals/service";
import { RequestBodyError } from "@/server/auth/request";

export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
export async function api(run: () => Promise<Response>): Promise<Response> {
  try { return await run(); } catch (error) {
    if (error instanceof RequestBodyError) return json({ error: { code: "VALIDATION", message: error.message } }, 400);
    if (error instanceof DealError) return json({ error: { code: "REQUEST_REJECTED", message: error.message } }, error.status);
    if (error instanceof z.ZodError) return json({ error: { code: "VALIDATION", message: "Check the submitted fields.", fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, 400);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2025", "P2034"].includes(error.code)) return json({ error: { code: "CONFLICT", message: "A duplicate, missing reference or concurrent update prevented this operation." } }, 409);
    const requestId = randomUUID();
    logger.error({ requestId, errorType: error instanceof Error ? error.name : "Unknown" }, "API operation failed");
    return json({ error: { code: "UNAVAILABLE", message: "Service temporarily unavailable.", requestId } }, 503);
  }
}
