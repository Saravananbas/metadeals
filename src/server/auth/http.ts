import { z } from "zod";
import { AuthenticationFailure } from "./service";
import { assertSameOrigin, readJson, RequestBodyError } from "./request";

export function requireSameOrigin(request: Request): Response | null {
  if (assertSameOrigin(request)) return null;
  return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
}

export async function parseRequestBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.output<T>; response: null } | { data: null; response: Response }> {
  let body: unknown;
  try {
    body = await readJson(request);
  } catch (error) {
    if (!(error instanceof RequestBodyError)) throw error;
    return { data: null, response: Response.json({ error: error.message }, { status: 400 }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { data: null, response: Response.json({ error: "Request data is invalid." }, { status: 400 }) };
  }
  return { data: parsed.data, response: null };
}

export function authFailureResponse(error: unknown, status = 400): Response {
  if (error instanceof AuthenticationFailure) {
    return Response.json({ error: error.message }, { status });
  }
  throw error;
}
