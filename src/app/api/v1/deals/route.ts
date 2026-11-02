import { listingSchema } from "@/features/deals/validation";
import { getDatabase } from "@/server/db/client";
import { listPublicDeals } from "@/server/deals/repository";
import { api, json } from "@/server/http";
export async function GET(request: Request) {
  return api(async () => json(await listPublicDeals(getDatabase(), listingSchema.parse(Object.fromEntries(new URL(request.url).searchParams)))));
}
