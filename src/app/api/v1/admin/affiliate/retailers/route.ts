import { adminApi } from "@/server/community/admin-http";
import { json } from "@/server/http";
import { addRetailerFromUrl, listRetailers } from "@/server/admin/affiliate-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => adminApi(request, async (actor) => json(await listRetailers(actor)));

/** Body: { url }. Finds the store by its website or creates it. */
export const POST = (request: Request) => adminApi(request, async (actor) => {
  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  return json(await addRetailerFromUrl(actor, body.url));
});
