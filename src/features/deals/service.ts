import "server-only";
import { getDatabase } from "@/server/db/client";
import { listPublicDeals } from "@/server/deals/repository";
import { listingSchema, type ListingInput } from "./validation";
import { toCard } from "./presentation";
import { listSampleDeals } from "./sample-catalog";

export async function getHomepageListing(input: ListingInput) {
  const db = getDatabase();
  const result = await listPublicDeals(db, input);

  // If no published deals exist in database and samples are allowed, fallback to demo deals
  if (result.data.length === 0 && !input.q && !input.category && !input.store) {
    const samplesEnabled =
      process.env.DEMO_DEALS_ENABLED === "true" ||
      (process.env.NODE_ENV !== "production" && process.env.DEMO_DEALS_ENABLED !== "false");

    if (samplesEnabled) {
      const hasAnyPublished = await db.deal.findFirst({
        where: { status: "PUBLISHED" },
        select: { id: true },
      });
      if (!hasAnyPublished) {
        return { ...listSampleDeals(input), source: "demo" as const };
      }
    }
  }

  return { ...result, data: result.data.map(toCard), source: "database" as const };
}
export async function getHomepageDeals() {
  const result = await getHomepageListing(listingSchema.parse({ limit: 15 }));
  return { ...result, deals: result.data };
}
