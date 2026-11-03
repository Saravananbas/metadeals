import { listingSchema } from "@/features/deals/validation";
import { getHomepageListing } from "@/features/deals/service";
import { api, json } from "@/server/http";
export async function GET(request: Request) {
  return api(async () => json(await getHomepageListing(listingSchema.parse(Object.fromEntries(new URL(request.url).searchParams)))));
}
