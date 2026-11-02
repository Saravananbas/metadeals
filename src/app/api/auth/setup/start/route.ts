import { z } from "zod";
import { beginSetup, AuthenticationFailure } from "@/server/auth/service";
import { assertSameOrigin } from "@/server/auth/request";
import { parseRequestBody, authFailureResponse } from "@/server/auth/http";

const setupSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const parsed = await parseRequestBody(request, setupSchema);
  if (parsed.response) return parsed.response;
  try {
    const enrollment = await beginSetup(parsed.data.token, parsed.data.password);
    return Response.json(enrollment);
  } catch (error) {
    if (error instanceof AuthenticationFailure) return authFailureResponse(error);
    throw error;
  }
}
