import { z } from "zod";
import { requestTemporaryPassword } from "@/server/auth/service";
import { getRequestMetadata } from "@/server/auth/request";
import { requireSameOrigin, parseRequestBody } from "@/server/auth/http";
import { sendStaffTemporaryPassword } from "@/server/customer/email";
import { logger } from "@/server/logging/logger";

const requestSchema = z.object({
  email: z.string().trim().email().max(254),
  mfaCode: z.string().trim().regex(/^\d{6}$/),
}).strict();

/** The same answer whatever happened, so nobody can learn which emails are staff accounts or whether the code was right. */
const NEUTRAL = { ok: true, message: "If the details match, we have emailed a temporary password. It works once and expires in 25 minutes." };

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const parsed = await parseRequestBody(request, requestSchema);
  if (parsed.response) return parsed.response;
  const issued = await requestTemporaryPassword({ ...parsed.data, metadata: getRequestMetadata(request) });
  if (issued) {
    try {
      await sendStaffTemporaryPassword(issued.email, issued.tempPassword, issued.tokenId);
    } catch (error) {
      // The temporary password itself is never logged.
      logger.error({ errorType: error instanceof Error ? error.name : "Unknown", tokenId: issued.tokenId }, "Temporary password email could not be sent");
    }
  }
  return Response.json(NEUTRAL);
}
