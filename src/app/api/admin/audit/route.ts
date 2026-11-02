import { authorize } from "@/server/auth/authorization";
import { getDatabase } from "@/server/db/client";

export async function GET() {
  const authorization = await authorize("audit:read");
  if (!authorization.context) {
    return Response.json({ error: "Authentication or permission required." }, { status: authorization.status });
  }
  const events = await getDatabase().auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      success: true,
      createdAt: true,
      actor: { select: { id: true, email: true, role: true } },
    },
  });
  return Response.json({ events });
}
