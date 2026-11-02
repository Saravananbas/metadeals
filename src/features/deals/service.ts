import "server-only";
import { getDatabase } from "@/server/db/client";
import { listPublicDeals } from "@/server/deals/repository";
import { listingSchema } from "./validation";
import { toCard } from "./presentation";

export async function getHomepageDeals() {
  const result = await listPublicDeals(getDatabase(), listingSchema.parse({}));
  return { source: "database" as const, deals: result.data.map(toCard), nextCursor: result.nextCursor };
}
