import { z } from "zod";
import { completeSetup, AuthenticationFailure } from "@/server/auth/service";
import { getRequestMetadata, assertSameOrigin } from "@/server/auth/request";
import { parseRequestBody, authFailureResponse } from "@/server/auth/http";

const setupSchema = z.object({
  token: z.string().min(32).max(128),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const parsed = await parseRequestBody(request, setupSchema);
  if (parsed.response) return parsed.response;
  try {
    const recoveryCodes = await completeSetup(parsed.data.token, parsed.data.code, getRequestMetadata(request));
    return Response.json({ recoveryCodes });
  } catch (error) {
    if (error instanceof AuthenticationFailure) return authFailureResponse(error);
    throw error;
  }
}
