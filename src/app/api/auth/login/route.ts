import { z } from "zod";
import { authenticate } from "@/server/auth/service";
import { getRequestMetadata } from "@/server/auth/request";
import { requireSameOrigin, parseRequestBody, authFailureResponse } from "@/server/auth/http";
import { revokeCurrentSession, setSessionCookie } from "@/server/auth/session";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  mfaCode: z.string().min(6).max(32),
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const parsed = await parseRequestBody(request, loginSchema);
  if (parsed.response) return parsed.response;

  try {
    const result = await authenticate({ ...parsed.data, metadata: getRequestMetadata(request) });
    await revokeCurrentSession();
    await setSessionCookie(result.token);
    return Response.json({ userId: result.userId });
  } catch (error) {
    return authFailureResponse(error, 401);
  }
}
