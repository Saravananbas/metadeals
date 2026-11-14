import { communityWrite, json } from "@/server/community/http";
import { listNotifications } from "@/server/community/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Only ever the signed-in member's own notices (the member comes from the session, never from the request).
export const GET = (request: Request) => communityWrite(request, async (customerId) => {
  const limit = Number(new URL(request.url).searchParams.get("limit")) || 20;
  return json({ data: await listNotifications(customerId, limit) });
});
