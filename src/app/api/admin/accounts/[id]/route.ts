import { z } from "zod";
import { UserRole } from "@/generated/prisma/client";
import { authorize } from "@/server/auth/authorization";
import { AuthenticationFailure, updateAccount } from "@/server/auth/service";
import { assertSameOrigin, getRequestMetadata } from "@/server/auth/request";
import { authFailureResponse, parseRequestBody } from "@/server/auth/http";

// Status changes (suspend, disable, enable, delete) go through POST .../state, which asks for the authenticator code where needed.
const updateSchema = z.object({
  role: z.enum(UserRole),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const authorization = await authorize("account:read");
  if (!authorization.context) {
    return Response.json({ error: "Authentication or permission required." }, { status: authorization.status });
  }
  const parsed = await parseRequestBody(request, updateSchema);
  if (parsed.response) return parsed.response;
  const { id } = await params;
  try {
    await updateAccount({
      actorId: authorization.context.user.id,
      actorRole: authorization.context.user.role,
      targetId: id,
      ...parsed.data,
      metadata: getRequestMetadata(request),
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthenticationFailure) return authFailureResponse(error, 403);
    throw error;
  }
}
