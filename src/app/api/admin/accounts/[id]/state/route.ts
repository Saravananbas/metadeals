import { z } from "zod";
import { authorize } from "@/server/auth/authorization";
import { assertSameOrigin, getRequestMetadata } from "@/server/auth/request";
import { authFailureResponse, parseRequestBody } from "@/server/auth/http";
import { changeAccountState } from "@/server/auth/account-state";

const bodySchema = z.object({
  action: z.enum(["suspend", "disable", "enable", "delete"]),
  totp: z.string().trim().max(12).optional(),
  suspendedFrom: z.iso.datetime({ offset: true }).optional(),
  suspendedUntil: z.iso.datetime({ offset: true }).optional(),
  reason: z.string().max(400).optional(),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  const authorization = await authorize("account:read");
  if (!authorization.context) return Response.json({ error: "Authentication or permission required." }, { status: authorization.status });
  const parsed = await parseRequestBody(request, bodySchema);
  if (parsed.response) return parsed.response;
  const { id } = await params;
  try {
    const result = await changeAccountState({
      actorId: authorization.context.user.id,
      actorRole: authorization.context.user.role,
      targetId: id,
      action: parsed.data.action,
      totp: parsed.data.totp,
      suspendedFrom: parsed.data.suspendedFrom ? new Date(parsed.data.suspendedFrom) : undefined,
      suspendedUntil: parsed.data.suspendedUntil ? new Date(parsed.data.suspendedUntil) : undefined,
      reason: parsed.data.reason,
      metadata: getRequestMetadata(request),
    });
    return Response.json({ ok: true, status: result.status });
  } catch (error) {
    return authFailureResponse(error, 400);
  }
}
