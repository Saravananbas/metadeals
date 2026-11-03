import "server-only";
import { getDatabase } from "@/server/db/client";
import { listPublicDeals, publicWhere } from "@/server/deals/repository";
import { listingSchema, type ListingInput } from "./validation";
import { toCard } from "./presentation";
import { listSampleDeals } from "./sample-catalog";

export async function getHomepageListing(input: ListingInput) {
  const db = getDatabase();
  // Empty search results must not introduce sample offers into a live catalog.
  const hasPublished = await db.deal.findFirst({ where: publicWhere(listingSchema.parse({})), select: { id: true } });
  const samplesEnabled = process.env.DEMO_DEALS_ENABLED === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.DEMO_DEALS_ENABLED !== "false");
  if (!hasPublished && samplesEnabled) return { ...listSampleDeals(input), source: "demo" as const };
  const result = await listPublicDeals(db, input);
  return { ...result, data: result.data.map(toCard), source: "database" as const };
}
export async function getHomepageDeals() {
  const result = await getHomepageListing(listingSchema.parse({ limit: 12 }));
  return { ...result, deals: result.data };
}
