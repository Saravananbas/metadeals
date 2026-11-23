import { z } from "zod";
import { changePasswordWithTemporary } from "@/server/auth/service";
import { getRequestMetadata } from "@/server/auth/request";
import { requireSameOrigin, parseRequestBody, authFailureResponse } from "@/server/auth/http";

const changeSchema = z.object({
  email: z.string().trim().email().max(254),
  tempPassword: z.string().min(1).max(64),
  newPassword: z.string().min(1).max(128),
  confirmPassword: z.string().min(1).max(128),
  mfaCode: z.string().trim().regex(/^\d{6}$/),
}).strict();

/** Sets a new password with the emailed temporary one and a fresh authenticator code. Opens no session: the person signs in afterwards. */
export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const parsed = await parseRequestBody(request, changeSchema);
  if (parsed.response) return parsed.response;
  try {
    await changePasswordWithTemporary({ ...parsed.data, metadata: getRequestMetadata(request) });
    return Response.json({ ok: true });
  } catch (error) {
    return authFailureResponse(error, 400);
  }
}
