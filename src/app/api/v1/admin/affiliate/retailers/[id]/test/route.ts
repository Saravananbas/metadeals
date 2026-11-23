import { adminApi } from "@/server/community/admin-http";
import { json } from "@/server/http";
import { testRetailer } from "@/server/admin/affiliate-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request, ctx: { params: Promise<{ id: string }> }) => adminApi(request, async (actor) => {
  const { id } = await ctx.params;
  return json(await testRetailer(actor, id));
});
