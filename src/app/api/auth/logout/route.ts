import { getCurrentAuthContext, revokeCurrentSession } from "@/server/auth/session";
import { writeAudit } from "@/server/auth/audit";
import { getRequestMetadata, assertSameOrigin } from "@/server/auth/request";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const context = await getCurrentAuthContext();
  await revokeCurrentSession();
  if (context) {
    await writeAudit({
      actorId: context.user.id,
      targetId: context.user.id,
      action: "auth.logout",
      success: true,
      ...getRequestMetadata(request),
      metadata: {},
    });
  }
  return Response.json({ ok: true });
}
