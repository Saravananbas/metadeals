import { z } from "zod";
import { authorize } from "@/server/auth/authorization";
import { assertSameOrigin, getRequestMetadata } from "@/server/auth/request";
import { authFailureResponse, parseRequestBody } from "@/server/auth/http";
import { getAccountAccess, setAccountAccess } from "@/server/auth/account-access";

const bodySchema = z.object({
  useRoleDefaults: z.boolean(),
  choice: z.record(z.string().max(40), z.string().max(40)).optional(),
  until: z.iso.datetime({ offset: true }).nullable().optional(),
  totp: z.string().trim().max(12).optional(),
}).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorize("account:role:update");
  if (!authorization.context) return Response.json({ error: "Authentication or permission required." }, { status: authorization.status });
  try {
    return Response.json({ access: await getAccountAccess((await params).id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authFailureResponse(error, 404);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  const authorization = await authorize("account:role:update");
  if (!authorization.context) return Response.json({ error: "Authentication or permission required." }, { status: authorization.status });
  const parsed = await parseRequestBody(request, bodySchema);
  if (parsed.response) return parsed.response;
  try {
    await setAccountAccess({
      actorId: authorization.context.user.id,
      actorRole: authorization.context.user.role,
      targetId: (await params).id,
      useRoleDefaults: parsed.data.useRoleDefaults,
      choice: parsed.data.choice,
      until: parsed.data.until ? new Date(parsed.data.until) : null,
      totp: parsed.data.totp,
      metadata: getRequestMetadata(request),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return authFailureResponse(error, 400);
  }
}
