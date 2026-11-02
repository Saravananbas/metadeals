import { z } from "zod";
import { completePasswordReset, AuthenticationFailure } from "@/server/auth/service";
import { getRequestMetadata, assertSameOrigin } from "@/server/auth/request";
import { parseRequestBody, authFailureResponse } from "@/server/auth/http";

const confirmSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const parsed = await parseRequestBody(request, confirmSchema);
  if (parsed.response) return parsed.response;
  try {
    await completePasswordReset(parsed.data.token, parsed.data.password, getRequestMetadata(request));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthenticationFailure) return authFailureResponse(error);
    throw error;
  }
}
