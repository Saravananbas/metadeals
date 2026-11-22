import { adminApi } from "@/server/community/admin-http";
import { json } from "@/server/http";
import { listMembers, parseUsersQuery } from "@/server/admin/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Staff only (Super Administrator and Administrator). Returns one page; no passwords or sensitive profile fields. */
export const GET = (request: Request) => adminApi(request, async (actor) => {
  const q = parseUsersQuery(request.url);
  return json(await listMembers(actor, { page: q.page, q: q.q }));
});
