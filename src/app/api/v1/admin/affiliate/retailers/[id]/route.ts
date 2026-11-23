import { adminApi } from "@/server/community/admin-http";
import { json } from "@/server/http";
import { saveRetailerConfig } from "@/server/admin/affiliate-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const PUT = (request: Request, ctx: { params: Promise<{ id: string }> }) => adminApi(request, async (actor) => {
  const { id } = await ctx.params;
  return json(await saveRetailerConfig(actor, id, await request.json().catch(() => ({}))));
});
