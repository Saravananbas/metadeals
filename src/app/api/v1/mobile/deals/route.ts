import { NextRequest } from "next/server";
import { getDatabase } from "@/server/db/client";
import { listPublicDeals, publicWhere } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { listSampleDeals } from "@/features/deals/sample-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const store = searchParams.get("store") || searchParams.get("merchant") || "";
  const view = (searchParams.get("view") || "top") as "top" | "latest" | "trending";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 20), 1), 50);
  const cursor = searchParams.get("cursor") || undefined;

  const parsedInput = listingSchema.parse({ q, category, store, view, limit, cursor });
  const db = getDatabase();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://metadeals4u.in";
  const hasPublished = await db.deal.findFirst({
    where: publicWhere(listingSchema.parse({})),
    select: { id: true },
  });

  const samplesEnabled =
    process.env.DEMO_DEALS_ENABLED === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.DEMO_DEALS_ENABLED !== "false");

  if (!hasPublished && samplesEnabled) {
    const samplePage = listSampleDeals(parsedInput);
    return Response.json({
      source: "demo",
      data: samplePage.data.map((d) => ({
        id: d.id,
        slug: d.id,
        title: d.name,
        brand: d.brand,
        category: d.category,
        merchant: {
          slug: d.store,
          name: d.store.toUpperCase(),
        },
        price: d.price,
        mrp: d.originalPrice,
        discountPercent: d.originalPrice > d.price ? Math.round(((d.originalPrice - d.price) / d.originalPrice) * 100) : 0,
        imageUrl: d.image.startsWith("http") ? d.image : `${baseUrl}${d.image}`,
        rating: d.rating,
        reviewCount: d.reviewCount,
        ratingSource: d.ratingSource,
        outboundUrl: `${baseUrl}/go/${d.id}?c=mobile`,
        expiresAt: null,
      })),
      nextCursor: samplePage.nextCursor,
    });
  }

  const result = await listPublicDeals(db, parsedInput);
  return Response.json({
    source: "database",
    data: result.data.map((d) => ({
      id: d.id,
      slug: d.slug,
      title: d.title,
      brand: d.brand,
      category: d.category.name,
      merchant: {
        slug: d.merchant.slug,
        name: d.merchant.name,
      },
      price: Math.round(d.priceMinor / 100),
      mrp: Math.round(d.mrpMinor / 100),
      discountPercent: d.discountPercent,
      savings: Math.round(d.savingsMinor / 100),
      imageUrl: d.image.url.startsWith("http") ? d.image.url : `${baseUrl}${d.image.url}`,
      rating: d.rating,
      reviewCount: d.reviewCount,
      ratingSource: d.ratingSource,
      outboundUrl: `${baseUrl}/go/${d.slug}?c=mobile`,
      expiresAt: d.expiresAt,
    })),
    nextCursor: result.nextCursor,
  });
}
