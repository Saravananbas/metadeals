import { listingSchema } from "@/features/deals/validation";
import { getDatabase } from "@/server/db/client";
import { dealInclude, publicDeal, publicWhere } from "@/server/deals/repository";
import { api, json } from "@/server/http";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return api(async () => { const { slug } = await params; const record = await getDatabase().deal.findFirst({ where: { ...publicWhere(listingSchema.parse({})), slug }, include: dealInclude }); return record ? json({ data: publicDeal(record) }) : json({ error: { code: "NOT_FOUND", message: "Deal unavailable." } }, 404); });
}
